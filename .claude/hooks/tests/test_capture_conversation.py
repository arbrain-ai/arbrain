import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('capture',Path(__file__).resolve().parents[1]/'capture-conversation.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def codex(kind,text,phase=None):
 return {'timestamp':'2026-09-17T12:00:00Z','type':'event_msg','payload':{'type':'item_completed','item':{'type':kind,'id':kind+text,'phase':phase,'content':[{'type':'text','text':text}]}}}
class CaptureTests(unittest.TestCase):
 def test_ignore_tools_reasoning_and_commentary(self):
  for kind in ['Reasoning','CommandExecution','McpToolCall']:
   self.assertIsNone(m.record(codex(kind,'private tool'),'codex'))
  self.assertIsNone(m.record(codex('AgentMessage','progress','commentary'),'codex'))
 def test_capture_codex_and_claude_text(self):
  self.assertEqual(m.record(codex('UserMessage','request'),'codex')['text'],'request')
  self.assertEqual(m.record(codex('AgentMessage','done','final_answer'),'codex')['role'],'assistant')
  self.assertEqual(m.record({'timestamp':'2026-09-17T12:00:00Z','type':'user','uuid':'u','message':{'role':'user','content':[{'type':'text','text':'hello'},{'type':'tool_result','content':'private'}]}},'claude')['text'],'hello')
 def test_redacts_obvious_credentials_and_internal_goal_replays(self):
  self.assertEqual(m.clean('<codex_internal_context source="goal">repeat</codex_internal_context>'),'')
  self.assertEqual(m.clean('sk-'+'a'*30),'[TOKEN REDACTED]')
 def test_incremental_repeated_capture_and_partial_line(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);(r/'.claude/hooks').mkdir(parents=True);(r/'.claude/hooks/.host-slug').write_text('macbook');p=r/'session.jsonl'
   first=json.dumps(codex('UserMessage','request'))+'\n';second=json.dumps(codex('AgentMessage','done','final_answer'))
   p.write_text(first+second[:30]);self.assertEqual(m.capture(p,'s','codex',r)['messages'],1)
   self.assertEqual(m.capture(p,'s','codex',r)['added'],0)
   p.write_text(first+second+'\n');self.assertEqual(m.capture(p,'s','codex',r)['messages'],2)
   self.assertEqual(m.capture(p,'s','codex',r)['added'],0)
   out=list((r/'.claude/daily').glob('*.md'));self.assertEqual(len(out),1);self.assertEqual(out[0].read_text().count('### user'),1)
if __name__=='__main__':unittest.main()
