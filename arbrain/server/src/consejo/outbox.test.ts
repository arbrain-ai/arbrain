import {describe,it,expect} from 'vitest'
const sourcePath='../../../src/features/chat/lib/consejo-outbox.ts'
const {saveEnvelope,pendingEnvelopes,acknowledgeEnvelope}=await import(sourcePath)
function storage(){const data=new Map<string,string>();return {get length(){return data.size},key:(i:number)=>[...data.keys()][i]??null,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)},removeItem:(k:string)=>{data.delete(k)}}}
describe('durable multi-tab outbox',()=>{
 it('retains both offline sends and acknowledges only the accepted turn',()=>{
  const s=storage(),prefix='consejo:owner:pending'
  const a={turnId:'a',message:'corrección original'},b={turnId:'b',message:'otra pestaña'}
  saveEnvelope(s,prefix,a);saveEnvelope(s,prefix,b)
  expect(pendingEnvelopes(s,prefix)).toEqual([a,b])
  acknowledgeEnvelope(s,prefix,'b')
  expect(pendingEnvelopes(s,prefix)).toEqual([a])
  expect(()=>saveEnvelope(s,prefix,{...a,message:'sobrescribir'})).toThrow()
  expect(pendingEnvelopes(s,'consejo:other:pending')).toEqual([])
 })
 it('migrates the original single pending slot once without losing a newer send',()=>{
  const s=storage(),p='pending',a={turnId:'a',message:'original'}
  s.setItem(p,JSON.stringify(a));saveEnvelope(s,p,{turnId:'b'})
  expect(pendingEnvelopes(s,p)).toEqual([{turnId:'b'},a])
  expect(s.getItem(p)).toBeNull()
  expect(pendingEnvelopes(s,p)).toHaveLength(2)
 })
})
