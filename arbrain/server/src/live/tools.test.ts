import {it,expect} from 'vitest'
import {LiveStore} from './store.js'
import {LiveToolbox} from './tools.js'
it('a query obtains a scoped receipt and an edit publishes the committed scene',async()=>{
 const store=new LiveStore(':memory:'),scope={owner:'qa',account:'bro',conversationId:'c'},ac=new AbortController(),events:Record<string,unknown>[]=[]
 store.begin(scope,'t')
 try{
  const tools=new LiveToolbox(store,scope,'t',ac.signal,{sales:async()=>({data:[{value:12}],coverage:'QA fixture'})},e=>events.push(e))
  const result=await tools.call({action:'query',source:'sales'}),receipt=JSON.parse(result.text)
  expect(receipt.hash).toHaveLength(64)
  const edit=await tools.call({action:'edit',patch:{id:'op',baseRevision:0,operations:[{type:'put',artifact:{id:'chart',title:'Chart',html:'<p>12</p>',frame:{x:0,y:0,width:100,height:100},evidence:'observed',sources:[{receiptId:receipt.id,label:'sales'}],pinned:false}}]}})
  expect(edit.error).toBeUndefined();expect(events.at(-1)?.type).toBe('live_scene')
  ac.abort();expect((await tools.call({action:'read'})).error).toBe(true)
 }finally{store.close()}
})
it('an async query cannot publish after cancellation or a new turn',async()=>{
 const store=new LiveStore(':memory:'),scope={owner:'qa',account:'bro',conversationId:'c'};store.begin(scope,'t')
 let resolve:((x:{data:unknown;coverage:string})=>void)|undefined
 const tools=new LiveToolbox(store,scope,'t',new AbortController().signal,{slow:()=>new Promise(r=>resolve=r)},()=>{})
 try{const pending=tools.call({action:'query',source:'slow'});store.end(scope,'t');store.begin(scope,'new');resolve!({data:[],coverage:'qa'});expect((await pending).error).toBe(true);expect(store.read(scope).receipts).toHaveLength(0)}finally{store.close()}
})
it('rejects forged receipts and unknown readers without changing state',async()=>{
 const store=new LiveStore(':memory:'),scope={owner:'qa',account:'bro',conversationId:'c'};store.begin(scope,'t')
 try{
 const tools=new LiveToolbox(store,scope,'t',new AbortController().signal,{},()=>{})
 expect((await tools.call({action:'query',source:'toString'})).error).toBe(true)
 const result=await tools.call({action:'edit',patch:{id:'op',baseRevision:0,operations:[{type:'put',artifact:{id:'a',title:'invented',html:'<p>unknown</p>',frame:{x:0,y:0,width:100,height:100},pinned:false,evidence:'observed',sources:[{receiptId:'fake',label:'not a real source'}]}}]}})
 expect(result.error).toBe(true);expect(store.read(scope).scene.revision).toBe(0)
 }finally{store.close()}
})
it('sales summary keeps full order evidence in its scoped receipt',async()=>{
 const store=new LiveStore(':memory:'),scope={owner:'qa',account:'bro',conversationId:'summary'},turn='t';store.begin(scope,turn)
 try{
 const full={totals:{USD:{paidCents:1200}},evidence:{orders:[{id:'real-qa-order'}],total:1,offset:0,nextOffset:null}}
 const toolbox=new LiveToolbox(store,scope,turn,new AbortController().signal,{sales:async()=>({data:full,coverage:'QA'})},()=>{})
 const result=JSON.parse((await toolbox.call({action:'query',source:'sales'})).text)
 expect(result.data.evidence.orders).toBeUndefined();expect(result.data.evidence.ordersOmitted).toBe(true)
 const exact=JSON.parse((await toolbox.call({action:'read',receiptId:result.id})).text)
 expect(exact.data).toEqual(full);expect(exact.hash).toBe(result.hash)
 const page=JSON.parse((await toolbox.call({action:'query',source:'sales',query:{offset:0}})).text)
 expect(page.data.evidence.orders).toHaveLength(1)
 }finally{store.close()}
})
