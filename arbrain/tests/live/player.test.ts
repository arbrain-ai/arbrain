import test from 'node:test'
import assert from 'node:assert/strict'
import { LivePcmPlayer } from '../../src/features/live/voice/player.ts'
const played:number[]=[]
class FakeContext{
 currentTime=0;outputLatency=0;destination={}
 async resume(){}async close(){}
 createAnalyser(){return {fftSize:256,connect(){},getByteTimeDomainData(data:Uint8Array){data.fill(128)}}}
 createBuffer(_channels:number,length:number,rate:number){return {duration:length/rate,marker:0,copyToChannel(data:Float32Array){this.marker=data[0]}}}
 createBufferSource(){return {buffer:null as {marker:number}|null,onended:null as (()=>void)|null,connect(){},disconnect(){},stop(){},start(){played.push(this.buffer?.marker??0)}}}
}
Object.defineProperty(globalThis,'AudioContext',{value:FakeContext,configurable:true})
function pcm(marker:number){const bytes=new Uint8Array(6000);const d=new DataView(bytes.buffer);for(let i=0;i<3000;i++)d.setInt16(i*2,marker,true);return bytes}
const response=(marker:number)=>new Response(pcm(marker),{headers:{'X-Sample-Rate':'24000'}})
const tick=()=>new Promise(resolve=>setTimeout(resolve,20))
test('out-of-order sentence downloads play in spoken order',async()=>{
 played.length=0
 let first:((response:Response)=>void)|undefined
 let calls=0
 const transport:typeof fetch=async()=>++calls===1?new Promise(resolve=>{first=resolve}):response(2000)
 const player=new LivePcmPlayer(transport);await player.resume();player.begin()
 try{
  player.enqueue('Primera frase.',1.75);player.enqueue('Segunda frase.',1.75);player.finish();await tick()
  assert.deepEqual(played,[])
  first!(response(1000));await tick()
  assert.deepEqual(played,[1000/32768,2000/32768])
 }finally{player.dispose()}
})
test('late response after cancel never resurrects audio',async()=>{
 played.length=0
 let resolve:((r:Response)=>void)|undefined
 const player=new LivePcmPlayer(async()=>new Promise(r=>{resolve=r}));await player.resume();player.begin()
 try{
  player.enqueue('Turno cancelado.',1.75);player.cancel();resolve!(response(1000));await tick()
  assert.deepEqual(played,[]);assert.equal(player.busy,false)
 }finally{player.dispose()}
})
test('first audio can be scheduled before sentence response closes',async()=>{
 played.length=0
 let stream:ReadableStreamDefaultController<Uint8Array>|undefined
 const player=new LivePcmPlayer(async()=>new Response(new ReadableStream({start(c){stream=c}}),{headers:{'X-Sample-Rate':'24000'}}))
 await player.resume();player.begin()
 try{
  player.enqueue('Streaming real por fragmentos.',1.75);await tick();stream!.enqueue(pcm(1500));await tick()
  assert.deepEqual(played,[1500/32768]);assert.equal(player.timings[0].completed,false)
  stream!.close();player.finish();await tick();assert.equal(player.timings[0].completed,true)
 }finally{player.dispose()}
})
