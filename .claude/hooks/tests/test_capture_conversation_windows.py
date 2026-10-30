"""capture-conversation.py en Windows (reporte de un fundador, 26 oct 2026): sin fcntl y sin base de zonas no debe tronar."""
import builtins,importlib.util,json,os,sys,tempfile,types,unittest
from pathlib import Path
from unittest import mock
HOOK=Path(__file__).resolve().parents[1]/'capture-conversation.py'
def cargar(sin_fcntl=False):
 real=builtins.__import__
 def falso(name,*a,**k):
  if sin_fcntl and name=='fcntl':raise ImportError('No module named fcntl')
  return real(name,*a,**k)
 spec=importlib.util.spec_from_file_location('capture_win',HOOK);m=importlib.util.module_from_spec(spec)
 with mock.patch('builtins.__import__',falso):spec.loader.exec_module(m)
 return m
def claude(text,stamp='2026-10-26T23:30:00Z'):
 return {'timestamp':stamp,'type':'user','uuid':'u'+text,'message':{'role':'user','content':[{'type':'text','text':text}]}}
class Windows(unittest.TestCase):
 def setUp(self):
  self.llamadas=[]
  msvcrt=types.ModuleType('msvcrt');msvcrt.LK_NBLCK,msvcrt.LK_UNLCK=2,0
  msvcrt.locking=lambda fd,modo,n:self.llamadas.append(modo)
  self.parche=mock.patch.dict(sys.modules,{'msvcrt':msvcrt});self.parche.start()
 def tearDown(self):self.parche.stop()
 def test_sin_fcntl_captura_con_msvcrt_y_suelta_el_candado(self):
  m=cargar(sin_fcntl=True);self.assertIsNone(m.fcntl)
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);(r/'.claude/hooks').mkdir(parents=True);(r/'.claude/hooks/.host-slug').write_text('pc-alumno')
   p=r/'s.jsonl';p.write_text(json.dumps(claude('¿qué hago hoy? ñandú'),ensure_ascii=False)+'\n',encoding='utf-8')
   self.assertEqual(m.capture(p,'s','claude',r)['messages'],1)
   self.assertEqual(self.llamadas,[2,0])
   out=list((r/'.claude/daily').glob('*.md'));self.assertEqual(len(out),1);self.assertIn('ñandú',out[0].read_text(encoding='utf-8'))
 def test_edicion_cliente_usa_la_zona_del_equipo(self):
  m=cargar()
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);(r/'arbrain').mkdir();(r/'arbrain/EDICION').write_text('# comentario\ncliente\n')
   with mock.patch.dict(os.environ,{},clear=False):
    os.environ.pop('ARBRAIN_EDICION',None);os.environ.pop('ARBRAIN_TZ',None)
    self.assertEqual(m.edicion(r),'cliente');self.assertIsNone(m.zona(r))
    self.assertEqual(str(m.zona(Path(tmp)/'otra')),'America/Mexico_City')
    os.environ['ARBRAIN_TZ']='Europe/Madrid';self.assertEqual(str(m.zona(r)),'Europe/Madrid')
 def test_sin_base_de_zonas_no_truena(self):
  m=cargar()
  with mock.patch.object(m,'ZoneInfo',side_effect=Exception('No time zone found')):
   os.environ.pop('ARBRAIN_TZ',None)
   self.assertIsNone(m.zona(Path('/no/existe')))
   self.assertIsNotNone(m.record(claude('hola'),'claude'))
class ChatDeLaApp(unittest.TestCase):
 def test_daemon_solo_captura_el_chat_de_la_edicion_cliente(self):
  m=cargar()
  casos=[({'ARBRAIN_EDICION':'cliente'},True),({'ARBRAIN_EDICION':'cliente','CLAUDECLAW_SOURCE':'cron'},False),({'ARBRAIN_EDICION':'original'},False)]
  for env,esperado in casos:
   with mock.patch.dict(os.environ,env,clear=False):
    if 'CLAUDECLAW_SOURCE' not in env:os.environ.pop('CLAUDECLAW_SOURCE',None)
    self.assertEqual(m.chat_de_la_app_cliente(),esperado,env)
if __name__=='__main__':unittest.main()
