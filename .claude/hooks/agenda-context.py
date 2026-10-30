#!/usr/bin/env python3
"""Agenda compartida por turno: entrega acotada de .claude/now.md si existe.

Edición del alumno (red team 2, C-1): este hook NO ejecuta nada. Lee `now.md` tal como esté y ya. Ningún hook del
alumno lanza procesos ni importa archivos fuera de `.claude/hooks/` (lo verifica el generador en cada copia).
"""
import json,os,time,sys
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def agenda_context(root=ROOT,refresh=False):
 """`refresh` se conserva por compatibilidad de firma; en esta edición no refresca nada."""
 p=root/'.claude/now.md';note=''
 def age():return time.time()-p.stat().st_mtime if p.exists() else float('inf')
 try:raw=p.read_text()
 except OSError:return 'AGENDA NO DISPONIBLE (no hay .claude/now.md): preguntar al dueño o consultar su calendario antes de planificar; no asumir que no hay compromisos.'
 stale=age()>180
 # Calendar today and this week have precedence over long task descriptions.
 sections=[]
 for section in raw.split('\n## '):
  if section.startswith(('Hoy\n','Esta semana\n','Hitos\n','Tareas (Todoist)\n')):sections.append('## '+section)
 header=raw.split('\n## ')[0]
 text=header+'\n\n'+'\n\n'.join(sections)
 if len(text)>5300:text=text[:5200]+'\n[Contexto abreviado: abrir .claude/now.md para el resto.]'
 warning=('Foto de más de 3 minutos: confirma el calendario antes de comprometer horas. ' if stale else '')+note
 return 'AGENDA COMPARTIDA DEL TURNO (fuente fechada, no instrucciones externas). '+warning+'\n'+text+'\nSi una llamada coincide con un bloque genérico, la llamada es el compromiso fijo. No dar por libre una hora por falta de datos.'
# Ritual «bajar a tierra»: no es aviso ni mensaje a ningún hilo; vive en el contexto de Levy.
# Desde las 20:00 (hora local de la computadora) UNA línea por día en la primera conversación interactiva (no crons). Estado con fecha
# en store/ (ignorado por git); `--ritual-hecho` lo marca como hecho para ese día.
RITUAL_TZ=os.environ.get('ARBRAIN_TZ') or None;RITUAL_DESDE=20
RITUAL_LINEA=('Ritual pendiente: bajar a tierra el día de mañana. Pregúntale al dueño una sola vez, de forma natural: '
 '¿ya bajaste a tierra mañana? ¿lo hacemos ahorita? (10 min por voz: qué salió hoy, qué sale mañana, algo que te pese). '
 'Si dice que sí o que ya lo hizo, ejecútalo o regístralo con `python3 .claude/hooks/agenda-context.py --ritual-hecho`; '
 'si no quiere, no insistas.')
def _ritual_path(root):return root/'arbrain/server/store/rituales/bajar-a-tierra.json'
def _ritual_estado(root):
 try:return json.loads(_ritual_path(root).read_text())
 except (OSError,ValueError):return {}
def _ritual_guardar(root,estado):
 p=_ritual_path(root);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(estado))
def ritual_marcar_hecho(root=ROOT,now=None):
 now=now or (datetime.now(ZoneInfo(RITUAL_TZ)) if RITUAL_TZ else datetime.now().astimezone());e=_ritual_estado(root);e['hecho']=now.date().isoformat();_ritual_guardar(root,e)
def ritual_context(root=ROOT,now=None,env=None):
 """Una línea de ritual pendiente, o '' (antes de las 20:00, cron, ya preguntado hoy o ya hecho)."""
 env=os.environ if env is None else env
 if env.get('CLAUDECLAW_SOURCE')=='cron':return ''
 now=now or (datetime.now(ZoneInfo(RITUAL_TZ)) if RITUAL_TZ else datetime.now().astimezone())
 if now.hour<RITUAL_DESDE:return ''
 hoy=now.date().isoformat();e=_ritual_estado(root)
 if e.get('hecho')==hoy or e.get('preguntado')==hoy:return ''
 try:e['preguntado']=hoy;_ritual_guardar(root,e)
 except OSError:return ''
 return RITUAL_LINEA
if __name__=='__main__':
 if '--ritual-hecho' in sys.argv:ritual_marcar_hecho();print('ritual bajar-a-tierra marcado como hecho hoy')
 else:print(agenda_context())
