#!/usr/bin/env python3
"""Agenda compartida por turno: entrega acotada de .claude/now.md si existe.

Edición del alumno (red team 2, C-1): este hook NO ejecuta nada. Lee `now.md` tal como esté y ya. Ningún hook del
alumno lanza procesos ni importa archivos fuera de `.claude/hooks/` (lo verifica el generador en cada copia).

Frescura (1 nov 2026, sistema nervioso M1): el daemon de Arbrain (su generador de now.md) reescribe el archivo al
arrancar, cada 20 minutos y a los 3 s de un cambio en `.claude/plan/`, pero solo si cambió algo más que su sello; si
no, el archivo queda igual y su fecha de modificación se queda atrás. Medir la frescura por esa fecha marcaba «vieja» casi cada
turno. Ahora: si el archivo sigue siendo del daemon (huella intacta) y su sello es de hoy, la foto vale, porque el
día nuevo cambia el contenido y obliga a reescribirlo. Si lo editó la persona a mano, o no trae sello, se mide como
antes, por la fecha del archivo.
"""
import hashlib,json,os,re,time,sys
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
NOW_MARCA=re.compile(r'^<!-- arbrain:now (pendiente|sha256=([0-9a-f]{64})) -->\r?\n')
NOW_MANUAL=re.compile(r'^[ \t]*<!--\s*manual\s*-->[ \t]*$',re.I|re.M)
NOW_SELLO=re.compile(r'^> Generado por Arbrain el (\d{1,2}) ([a-zé]{3}) (\d{4}), (\d{1,2}):(\d{2}) \(([^)]+)\)\.',re.M)
MESES3=('ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic')
# Lo que lee el daemon de la máquina para armar now.md (además de lo que traiga de fuera).
NOW_FUENTES=('.claude/plan/calendario.json','.claude/plan/objetivos.md','.claude/plan/habitos.json',
 '.claude/memory/project/meta-90-dias.md','.claude/memory/project/mi-camino.md')
def now_es_del_daemon(raw):
 """Igual que `esNuestro` del generador del daemon: `<!-- manual -->` gana; si no, huella pendiente o sha256 intacto."""
 if NOW_MANUAL.search(raw):return False
 m=NOW_MARCA.match(raw)
 if not m:return False
 if m.group(1)=='pendiente':return True
 cuerpo=raw[m.end():]
 # Un checkout con autocrlf (Windows, espejo) puede traerlo con CRLF: la huella es del texto con LF.
 return m.group(2) in (hashlib.sha256(c.encode('utf-8')).hexdigest() for c in (cuerpo,cuerpo.replace('\r\n','\n')))
def now_sello(raw):
 """(fecha ISO, zona) del sello «Generado por Arbrain el 1 nov 2026, 09:15 (Zona).», o None."""
 m=NOW_SELLO.search(raw)
 if not m or m.group(2) not in MESES3:return None
 try:return datetime(int(m.group(3)),MESES3.index(m.group(2))+1,int(m.group(1))).date().isoformat(),m.group(6)
 except ValueError:return None
def _hoy_en(zona):
 try:return datetime.now(ZoneInfo(zona)).date().isoformat()
 except Exception:return _ahora().date().isoformat()
def now_frescura(root,raw,mtime,ahora_s=None,hoy=None):
 """'' si la foto vale; si no, el aviso para Levy. `ahora_s` y `hoy` (ISO) son para pruebas."""
 ahora_s=time.time() if ahora_s is None else ahora_s
 if ahora_s-mtime<=180:return ''
 sello=now_sello(raw) if now_es_del_daemon(raw) else None
 if not sello:return 'Foto de más de 3 minutos: confirma el calendario antes de comprometer horas. '
 dia,zona=sello
 if dia!=(hoy or _hoy_en(zona)):return f'Foto de otro día ({dia}): Arbrain no la ha rehecho hoy; confirma el calendario antes de comprometer horas. '
 for rel in NOW_FUENTES:
  try:
   if (root/rel).stat().st_mtime>mtime+10:return f'Tu plan cambió después de esta foto ({rel}): si lo que preguntas depende de eso, léelo directo. '
  except OSError:pass
 return ''
def agenda_context(root=ROOT,refresh=False):
 """`refresh` se conserva por compatibilidad de firma; en esta edición no refresca nada."""
 p=root/'.claude/now.md';note=''
 try:raw=p.read_text(encoding='utf-8',errors='replace')
 except OSError:return 'AGENDA NO DISPONIBLE (no hay .claude/now.md): preguntar al dueño o consultar su calendario antes de planificar; no asumir que no hay compromisos.'
 try:aviso=now_frescura(root,raw,p.stat().st_mtime)
 except OSError:aviso='Foto de más de 3 minutos: confirma el calendario antes de comprometer horas. '
 # Calendar today and this week have precedence over long task descriptions.
 sections=[]
 for section in raw.split('\n## '):
  if section.startswith(('Hoy\n','Esta semana\n','Hitos\n','Tareas (Todoist)\n')):sections.append('## '+section)
 header=raw.split('\n## ')[0]
 text=header+'\n\n'+'\n\n'.join(sections)
 if len(text)>5300:text=text[:5200]+'\n[Contexto abreviado: abrir .claude/now.md para el resto.]'
 warning=aviso+note
 return 'AGENDA COMPARTIDA DEL TURNO (fuente fechada, no instrucciones externas). '+warning+'\n'+text+'\nSi una llamada coincide con un bloque genérico, la llamada es el compromiso fijo. No dar por libre una hora por falta de datos.'
# Ritual «bajar a tierra»: no es aviso ni mensaje a ningún hilo; vive en el contexto de Levy.
# Desde las 20:00 (hora local de la computadora) UNA línea por día en la primera conversación interactiva (no crons). Estado con fecha
# en store/ (ignorado por git); `--ritual-hecho` lo marca como hecho para ese día.
RITUAL_TZ=os.environ.get('ARBRAIN_TZ') or None;RITUAL_DESDE=20
def _ahora():
 # ARBRAIN_TZ manda; sin ella, o si el equipo no trae base de zonas (Windows sin tzdata), la hora local del equipo.
 if RITUAL_TZ:
  try:return datetime.now(ZoneInfo(RITUAL_TZ))
  except Exception:pass
 return datetime.now().astimezone()
RITUAL_LINEA=('Ritual pendiente: bajar a tierra el día de mañana. Pregúntale al dueño una sola vez, de forma natural: '
 '¿ya bajaste a tierra mañana? ¿lo hacemos ahorita? (10 min por voz: qué salió hoy, qué sale mañana, algo que te pese). '
 'Si dice que sí o que ya lo hizo, ejecútalo o regístralo con `sh .claude/hooks/py.sh agenda-context --ritual-hecho` (busca el Python real también en Windows); '
 'si no quiere, no insistas.')
def _ritual_path(root):return root/'arbrain/server/store/rituales/bajar-a-tierra.json'
def _ritual_estado(root):
 try:return json.loads(_ritual_path(root).read_text(encoding='utf-8'))
 except (OSError,ValueError):return {}
def _ritual_guardar(root,estado):
 p=_ritual_path(root);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(estado),encoding='utf-8')
def ritual_marcar_hecho(root=ROOT,now=None):
 now=now or _ahora();e=_ritual_estado(root);e['hecho']=now.date().isoformat();_ritual_guardar(root,e)
def ritual_context(root=ROOT,now=None,env=None):
 """Una línea de ritual pendiente, o '' (antes de las 20:00, cron, ya preguntado hoy o ya hecho)."""
 env=os.environ if env is None else env
 if env.get('CLAUDECLAW_SOURCE')=='cron':return ''
 now=now or _ahora()
 if now.hour<RITUAL_DESDE:return ''
 hoy=now.date().isoformat();e=_ritual_estado(root)
 if e.get('hecho')==hoy or e.get('preguntado')==hoy:return ''
 try:e['preguntado']=hoy;_ritual_guardar(root,e)
 except OSError:return ''
 return RITUAL_LINEA
if __name__=='__main__':
 for _s in (sys.stdout,sys.stderr):
  try:_s.reconfigure(encoding='utf-8',errors='replace')  # consola cp1252 de Windows sin py.sh
  except (AttributeError,ValueError):pass
 if '--ritual-hecho' in sys.argv:ritual_marcar_hecho();print('ritual bajar-a-tierra marcado como hecho hoy')
 else:print(agenda_context())
