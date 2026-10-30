import { describe,it,expect,vi,afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { ConsejoEngine,IDENTITIES } from './engine.js'
import { ConsejoStore } from './store.js'
import { existingExecutor,isExecutionRequest } from './executor.js'
import { ChatSupervisor } from '../chat-runtime/supervisor.js'
import { ChatJournal } from '../chat-runtime/journal.js'
import type { Runtime } from './types.js'
vi.mock('./runtime.js',()=>({verifyClaudePrincipal:vi.fn(async()=>{})}))
vi.mock('../chat-runtime/claude-selection.js',()=>({resolveClaudeSelection:vi.fn(async()=>({model:'claude-fable-5-1',account:'default'}))}))
const cleanup:Array<()=>void>=[];afterEach(()=>cleanup.splice(0).forEach(f=>f()))
function setup(){
 const db=new Database(':memory:');const store=new ConsejoStore(':memory:');const journal=new ChatJournal(db)
 let executions=0
 const worker=new ChatSupervisor(journal,{workerId:'test',workerConfirmedDead:()=>true,
  run:async(turn,emit)=>{executions++;emit({type:'text_delta',text:'Una sola ejecución.'});return {status:'completed',snapshot:{text:'Una sola ejecución.'},payload:{deliveryTarget:'consejo'}}},
  deliver:async()=>true})
 worker.start()
 const runtime:Runtime={identities:vi.fn(async()=>IDENTITIES),infer:vi.fn(async(stage)=>({text:'Deliberación',identity:IDENTITIES[stage==='openai'?'openai':'claude']}))}
 const e=new ConsejoEngine(store,runtime,()=> 'Levy',5000,280000,existingExecutor(()=>worker,()=>true))
 const owner=randomUUID(),c=store.create(owner,randomUUID())
 const input={conversationId:c.id,turnId:randomUUID(),branchId:c.rootBranchId,parentId:null,message:'Ejecuta: calcula 2+2 sin herramientas.'}
 cleanup.push(()=>{worker.stop();store.close();db.close()})
 return{e,store,owner,c,input,worker,runtime,executions:()=>executions}
}
describe('single existing executor handoff',()=>{
 it.each(['Ejecuta: crea la tarea','ejecútalo','/ejecutar revisa el documento','Hazlo ahora: verifica el archivo'])('recognizes explicit instruction %s',q=>expect(isExecutionRequest(q)).toBe(true))
 it.each(['¿Debería ejecutar esto?','No ejecutes nada','Si digo "ejecuta" ¿qué sucede?','"Ejecuta: crea la tarea"','Explora la idea de Claude'])('does not route discussion to an executor: %s',q=>expect(isExecutionRequest(q)).toBe(false))
 it('sends an authorized operation once, does not invoke deliberation, and returns result to canonical history',async()=>{
  const s=setup();s.e.submit(s.owner,s.input);s.e.submit(s.owner,s.input);await s.e.idle(s.input.turnId)
  const t=s.store.turn(s.owner,s.c.id,s.input.turnId)
  expect(t.mode).toBe('execution');expect(t.final).toBe('Una sola ejecución.');expect(t.delivery).toBe('execution')
  expect(s.executions()).toBe(1);expect(s.runtime.identities).not.toHaveBeenCalled();expect(s.runtime.infer).not.toHaveBeenCalled()
  s.e.retry(s.owner,s.c.id,s.input.turnId);await s.e.idle(s.input.turnId);expect(s.executions()).toBe(1)
  const next={...s.input,turnId:randomUUID(),parentId:t.id,message:'¿Qué se concluye de ese resultado?'}
  s.e.submit(s.owner,next);await s.e.idle(next.turnId)
  const n=s.store.turn(s.owner,s.c.id,next.turnId)
  expect(n.packet.messages[1].content).toBe('Una sola ejecución.')
 })
 it('reconciles a completed executor after a crash without executing it again',async()=>{
  const s=setup();s.e.submit(s.owner,s.input);await s.e.idle(s.input.turnId)
  const t=s.store.turn(s.owner,s.c.id,s.input.turnId);t.state='running';delete t.final;s.store.save(t)
  const e2=new ConsejoEngine(s.store,s.runtime,()=> 'Levy',5000,280000,existingExecutor(()=>s.worker,()=>true))
  e2.retry(s.owner,s.c.id,t.id);await e2.idle(t.id)
  expect(s.executions()).toBe(1);expect(s.store.turn(s.owner,s.c.id,t.id).final).toBe('Una sola ejecución.')
 })
 it('rejects a question answer from another owner or turn',()=>{
  const s=setup();expect(()=>s.e.answer(randomUUID(),s.c.id,s.input.turnId,'question',{})).toThrow()
  expect(()=>s.e.answer(s.owner,s.c.id,randomUUID(),'question',{})).toThrow()
 })
})
