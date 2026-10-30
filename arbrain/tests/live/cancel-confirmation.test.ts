import test from 'node:test'
import assert from 'node:assert/strict'
import {confirmStopped} from '../../src/features/chat/lib/cancel-confirmation.ts'
test('stop acknowledgement is followed by reads until exact turn confirms terminal',async()=>{
 let calls=0
 const request:typeof fetch=async(url,init)=>{assert.equal(url,'/api/chat/turn');assert.equal(JSON.parse(String(init?.body)).turnId,'t');return Response.json({turn:{turnId:'t',status:++calls===1?'running':'interrupted'}})}
 assert.equal(await confirmStopped({turnId:'t',chatSessionId:'s',account:'yt'},request,async()=>{}),'interrupted');assert.equal(calls,2)
})
test('foreign receipts and failed reads never claim cancellation',async()=>{
 const request:typeof fetch=async()=>Response.json({turn:{turnId:'other',status:'interrupted'}})
 assert.equal(await confirmStopped({turnId:'t',chatSessionId:'s',account:'yt'},request,async()=>{}),null)
})
