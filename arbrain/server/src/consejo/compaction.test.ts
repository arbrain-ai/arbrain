import { describe,it,expect,afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { ConsejoEngine,IDENTITIES } from './engine.js'
import { ConsejoStore } from './store.js'
import { compactPacket,packet,packetSize,summaryInput } from './context.js'
import type { Packet,Runtime,Stage,Submission,Turn } from './types.js'
const stores:ConsejoStore[]=[];afterEach(()=>stores.splice(0).forEach(s=>s.close()))
function setup(fail=false){
 const store=new ConsejoStore(':memory:');stores.push(store);const owner=randomUUID();const c=store.create(owner,randomUUID())
 const calls:Array<{stage:Stage;p:Packet}>=[];let summaries=0
 const runtime:Runtime={identities:async()=>IDENTITIES,
  summarize:async()=>{summaries++;if(fail)throw new Error('summary failure');return {text:'La conversación conserva una corrección y una pregunta abierta.',identity:IDENTITIES.claude}},
  infer:async(stage,p)=>{calls.push({stage,p});return {text:stage==='synthesis'?'Respuesta pública. '.repeat(200):`Propuesta ${stage}`,identity:IDENTITIES[stage==='openai'?'openai':'claude']}}
 }
 const e=new ConsejoEngine(store,runtime,()=> 'Levy',10000,15000)
 const send=async(message:string,parentId:string|null=null,extra:Partial<Submission>={})=>{const i={conversationId:c.id,branchId:c.rootBranchId,parentId,turnId:randomUUID(),message,...extra};e.submit(owner,i);await e.idle(i.turnId);return store.turn(owner,c.id,i.turnId)}
 return{e,store,owner,c,calls,runtime,send,summaries:()=>summaries,setFail:(v:boolean)=>{fail=v}}
}
describe('shared versioned compaction',()=>{
 it('compacts once, preserves exact corrections, uses the same summary for both providers and reuses it after reopen',async()=>{
  const s=setup();let parent:string|null=null;let last!:Turn
  for(let i=0;i<8;i++){last=await s.send(i===1?'Corrección: son cuatro horas, no veinte.':`Mensaje ${i}`,parent);parent=last.id}
  expect(s.summaries()).toBeGreaterThan(0)
  expect(last.packet.summary?.userMessages.some(m=>m.content==='Corrección: son cuatro horas, no veinte.')).toBe(true)
  const branchCalls=s.calls.filter(x=>x.p.messages.at(-1)!.turnId===last.id)
  expect(branchCalls[0].p).toEqual(branchCalls[1].p)
  expect(last.packet.summary?.sourceTurnIds.length).toBeGreaterThan(0)
  expect(last.sourcePacket ?? s.store.turns(s.owner,s.c.id).find(t=>t.sourcePacket)).toBeTruthy()
  const replay=s.store.turn(s.owner,s.c.id,last.id)
  expect(replay.packet.summary).toEqual(last.packet.summary)
  const next=packet('Levy',s.store.turns(s.owner,s.c.id),randomUUID(),'Continúa',[],IDENTITIES)
  expect(next.summary?.sourceHash).toBe(last.packet.summary?.sourceHash)
 })
 it('retains exact originals and does not let a summary include the branch being edited away',async()=>{
  const s=setup();let parent:string|null=null;let first!:Turn
  for(let i=0;i<8;i++){const t=await s.send(i===0?'Premisa original':'Futuro rechazado',parent);if(!i)first=t;parent=t.id}
  const edited=await s.send('Premisa corregida',null,{branchId:randomUUID(),editTurnId:first.id})
  expect(edited.packet.summary).toBeUndefined()
  expect(JSON.stringify(edited.packet)).not.toContain('Futuro rechazado')
  expect(s.store.turns(s.owner,s.c.id)).toHaveLength(9)
 })
 it('does not launch independent proposals if compaction fails; retry uses the original source packet',async()=>{
  const s=setup(true);let parent:string|null=null;let last!:Turn
  for(let i=0;i<5;i++){last=await s.send(`Mensaje ${i}`,parent);parent=last.id;if(last.state==='failed')break}
  if(last.state!=='failed')last=await s.send('Siguiente',parent)
  expect(last.state).toBe('failed');expect(last.contextPreparation?.state).toBe('failed')
  expect(s.calls.some(c=>c.p.messages.at(-1)!.turnId===last.id)).toBe(false)
  const sourceHash=last.packet.hash;s.setFail(false);s.e.retry(s.owner,s.c.id,last.id);await s.e.idle(last.id)
  const completed=s.store.turn(s.owner,s.c.id,last.id)
  expect(completed.state).toBe('complete');expect(completed.sourcePacket?.hash).toBe(sourceHash)
 })
 it('treats empty or oversized summaries as errors, never as success',()=>{
  const p=packet('Levy',[],randomUUID(),'message',[],IDENTITIES)
  const input={messages:[{turnId:randomUUID(),role:'user' as const,content:'corrijo'}]}
  expect(()=>compactPacket(p,input,'')).toThrow('no es válido')
  expect(()=>compactPacket(p,input,'x'.repeat(40001))).toThrow('no es válido')
  expect(summaryInput(p)).toBeNull();expect(packetSize(p)).toBeGreaterThan(0)
 })
})
