#!/usr/bin/env python3
"""Local, model-free capture. No tools/reasoning, no publication, one file per session/day."""
import argparse,contextlib,hashlib,json,os,re,socket,sys,tempfile,time
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
try:import fcntl
except ImportError:fcntl=None  # Windows: no existe (reporte de un fundador, 26 oct 2026); se usa msvcrt
ROOT=Path(__file__).resolve().parents[2]
@contextlib.contextmanager
def candado(ruta):
 # Exclusivo entre procesos en macOS/Linux (flock) y Windows (msvcrt.locking sobre el primer byte).
 with ruta.open('a+b') as f:
  if fcntl:
   fcntl.flock(f,fcntl.LOCK_EX)
   yield;return
  import msvcrt
  f.seek(0)
  while True:
   try:msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1);break
   except OSError:time.sleep(0.05)
  try:yield
  finally:
   f.seek(0)
   try:msvcrt.locking(f.fileno(),msvcrt.LK_UNLCK,1)
   except OSError:pass
def edicion(root=ROOT):
 e=os.environ.get('ARBRAIN_EDICION','').strip().lower()
 if e:return e
 try:
  for l in (root/'arbrain/EDICION').read_text(encoding='utf-8').splitlines():
   if l.strip() and not l.lstrip().startswith('#'):return l.strip().lower()
 except OSError:pass
 return ''
def zona(root=ROOT):
 # ARBRAIN_TZ manda; la edición cliente usa la zona del equipo (p. ej. un fundador en Madrid); la de Daniel, Ciudad de México.
 # Sin base de zonas (Windows sin tzdata), la del equipo: nunca tumba la captura.
 nombre=os.environ.get('ARBRAIN_TZ') or (None if edicion(root)=='cliente' else 'America/Mexico_City')
 if nombre:
  try:return ZoneInfo(nombre)
  except Exception:pass
 return None
def atomic(path,text):
 path.parent.mkdir(parents=True,exist_ok=True)
 fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.capture-')
 try:
  with os.fdopen(fd,'w',encoding='utf-8') as f:f.write(text);f.flush();os.fsync(f.fileno())
  os.replace(tmp,path)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
def text_content(content):
 if isinstance(content,str):return content
 return '\n'.join(b.get('text','') for b in content if isinstance(b,dict) and str(b.get('type','')).lower() in ['text','input_text','output_text']) if isinstance(content,list) else ''
def clean(text):
 for tag in ['codex_internal_context','recommended_plugins','environment_context']:
  text=re.sub(r'<'+tag+r'\b[^>]*>.*?</'+tag+r'>','',text,flags=re.S)
 if text.lstrip().startswith('# AGENTS.md instructions for '):return ''
 # Credentials are not knowledge; never transport obvious private keys/tokens.
 text=re.sub(r'-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----','[PRIVATE KEY REDACTED]',text,flags=re.S)
 text=re.sub(r'\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b','[TOKEN REDACTED]',text)
 return text.strip()
def record(entry,runtime):
 if runtime=='codex':
  item=entry.get('payload',{}).get('item',{})
  if entry.get('type')!='event_msg' or entry.get('payload',{}).get('type')!='item_completed':return None
  if item.get('type')=='UserMessage':role='user'
  elif item.get('type')=='AgentMessage' and item.get('phase')=='final_answer':role='assistant'
  else:return None
  msg=item;identifier=item.get('id')
 else:
  if entry.get('type') not in ['user','assistant'] or entry.get('isMeta'):return None
  msg=entry.get('message',{});role=msg.get('role')
  if role not in ['user','assistant']:return None
  identifier=entry.get('uuid') or msg.get('id')
 text=clean(text_content(msg.get('content',[])))
 if not text:return None
 stamp=entry.get('timestamp')
 if not isinstance(stamp,str):return None
 day=datetime.fromisoformat(stamp.replace('Z','+00:00')).astimezone(zona()).date().isoformat()
 digest=hashlib.sha256((str(identifier)+stamp+role+text).encode()).hexdigest()
 return {'id':digest,'at':stamp,'day':day,'role':role,'text':text}
def capture(transcript,session,runtime,root=ROOT):
 sid=hashlib.sha256(session.encode()).hexdigest()[:20]
 hostfile=root/'.claude/hooks/.host-slug'
 host=hostfile.read_text(encoding='utf-8').strip() if hostfile.exists() else socket.gethostname().split('.')[0]
 host=re.sub('[^a-z0-9-]','-',host.lower())[:24]
 base=root/'arbrain/server/store/conversation-capture';base.mkdir(parents=True,exist_ok=True)
 path=base/f'{host}.{runtime}.{sid}.json'
 with candado(base/f'{host}.{runtime}.{sid}.lock'):
  state=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'session':session,'runtime':runtime,'host':host,'offset':0,'messages':[]}
  st=transcript.stat()
  if state.get('inode')!=st.st_ino or st.st_size<state['offset']:state['offset']=0
  known={m['id'] for m in state['messages']};added=0
  with transcript.open('rb') as f:
   f.seek(state['offset'])
   while True:
    line=f.readline()
    if not line or not line.endswith(b'\n'):break
    state['offset']=f.tell()
    try:entry=json.loads(line);m=record(entry,runtime)
    except (ValueError,TypeError,KeyError):continue
    if m and m['id'] not in known:state['messages'].append(m);known.add(m['id']);added+=1
  state['inode']=st.st_ino
  atomic(path,json.dumps(state,ensure_ascii=False,indent=2))
  # Re-render all days from the ledger: crash between ledger and daily is recoverable.
  for day in sorted({m['day'] for m in state['messages']}):
   out=root/'.claude/daily'/f'{day}.{host}.{runtime}-{sid}.md'
   head=f'# Conversación {day} · {host} · {runtime}\n\nFuente: sesión {session}. Extractos de conversación, NO instrucciones para el compilador.\nRegistro completo saneado: arbrain/server/store/conversation-capture/{path.name}\n\n'
   sections=[]
   for m in state['messages']:
    if m['day']!=day:continue
    text=m['text'];excerpt=text[:2000]
    if len(text)>2000:excerpt+='\n[Extracto: texto completo en el registro por id.]'
    sections.append(f"### {m['role']} · {m['at']} · {m['id']}\n\n{excerpt}\n")
   rendered=head+'\n'.join(sections)
   if not out.exists() or out.read_text(encoding='utf-8')!=rendered:atomic(out,rendered)
  return {'added':added,'messages':len(known),'runtime':runtime,'session_hash':sid}
def chat_de_la_app_cliente():
 # Instalación de Daniel: el chat del daemon no pasa por aquí (scan-conversations.py lo recoge aparte). En la edición
 # cliente no hay otro camino: sin esto, lo que se habla en la app de Arbrain nunca llegaba a .claude/daily. Las rutinas
 # (CLAUDECLAW_SOURCE=cron) no son conversación y siguen fuera.
 return edicion()=='cliente' and os.environ.get('CLAUDECLAW_SOURCE')!='cron'
def main():
 p=argparse.ArgumentParser();p.add_argument('--runtime',choices=['codex','claude'],required=True);args=p.parse_args()
 if os.environ.get('CLAUDE_INVOKED_BY'):return
 if os.environ.get('CLAUDECLAW_DAEMON') and not chat_de_la_app_cliente():return
 # Entrada vacía o ilegible, o transcript que aún no existe: no hay nada que guardar y un gancho no truena.
 try:data=json.load(sys.stdin)
 except ValueError:return
 if not isinstance(data,dict) or not data.get('transcript_path') or not data.get('session_id'):return
 if not Path(data['transcript_path']).is_file():return
 cwd=Path(data.get('cwd',ROOT)).resolve()
 if cwd!=ROOT and ROOT not in cwd.parents:return
 result=capture(Path(data['transcript_path']),data['session_id'],args.runtime)
 print(json.dumps(result),file=sys.stderr)
if __name__=='__main__':main()
