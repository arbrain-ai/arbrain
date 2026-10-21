import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeAgent,voiceIdFor,DEFAULT_AGENT_VOICES} from '../../src/features/live/voice/voices.ts'
import {classifyFailure,speakEleven,resetElevenBlock,elevenBlocked} from '../../src/features/live/server/elevenlabs.ts'
import {LatencyTrace} from '../../src/features/live/voice/latency.ts'
import {LivePcmPlayer} from '../../src/features/live/voice/player.ts'
const real=globalThis.fetch
const stream=(chunks:number[][],delay=0)=>new ReadableStream<Uint8Array>({async start(c){if(delay)await new Promise(r=>setTimeout(r,delay));for(const k of chunks)c.enqueue(Uint8Array.from(k));c.close()}})
test('el agente se normaliza y el id de voz nunca viene del cliente',()=>{
 assert.equal(normalizeAgent(' Trinity '),'trinity');assert.equal(normalizeAgent('x'),'levy');assert.equal(normalizeAgent(undefined),'levy')
 assert.equal(voiceIdFor('levy'),DEFAULT_AGENT_VOICES.levy.voiceId)
 assert.equal(voiceIdFor('sensei',{LIVE_VOICE_SENSEI:'abcdefghij1234'}),'abcdefghij1234')
 assert.equal(voiceIdFor('sensei',{LIVE_VOICE_SENSEI:'../../etc'}),DEFAULT_AGENT_VOICES.sensei.voiceId)
})
test('saldo agotado y clave sin permiso descansan largo; límite de concurrencia, poco',()=>{
 assert.equal(classifyFailure(401,'{"status":"quota_exceeded"}').reason,'saldo_agotado')
 assert.equal(classifyFailure(401,'missing_permissions').reason,'clave_o_permiso')
 assert.ok(classifyFailure(429,'').blockMs<classifyFailure(402,'').blockMs)
})
test('ElevenLabs entrega PCM con el primer chunk intacto y pide la voz y el contexto correctos',async()=>{
 process.env.ELEVENLABS_API_KEY='k';resetElevenBlock()
 let seen:{url:string;body:Record<string,unknown>}|null=null
 globalThis.fetch=(async(url:string,init:RequestInit)=>{seen={url,body:JSON.parse(String(init.body))};return new Response(stream([[1,2],[3,4]]))}) as typeof fetch
 try{
  const r=await speakEleven({text:'Hola.',voiceId:'VOZ123',previousText:'Antes.'});assert.ok(r.ok)
  const got:number[]=[];for await(const c of r.body as unknown as AsyncIterable<Uint8Array>)got.push(...c)
  assert.deepEqual(got,[1,2,3,4]);assert.ok(seen!.url.includes('/VOZ123/stream?output_format=pcm_24000'))
  assert.equal(seen!.body.model_id,'eleven_flash_v2_5');assert.equal(seen!.body.previous_text,'Antes.')
 }finally{globalThis.fetch=real}
})
test('primer byte lento (>presupuesto) cae al respaldo y descansa un momento',async()=>{
 process.env.ELEVENLABS_API_KEY='k';resetElevenBlock()
 globalThis.fetch=((_u:string,init:RequestInit)=>new Promise((_res,rej)=>init.signal!.addEventListener('abort',()=>rej(new Error('abort'))))) as typeof fetch
 try{
  const r=await speakEleven({text:'Hola.',voiceId:'VOZ123',budgetMs:40});assert.deepEqual(r,{ok:false,reason:'primer_byte_lento'});assert.equal(elevenBlocked(),'primer_byte_lento')
  assert.deepEqual(await speakEleven({text:'Otra.',voiceId:'VOZ123'}),{ok:false,reason:'primer_byte_lento'})
 }finally{globalThis.fetch=real;resetElevenBlock()}
})
test('saldo agotado: falla y bloquea sin reintentar cada frase',async()=>{
 process.env.ELEVENLABS_API_KEY='k';resetElevenBlock();let calls=0
 globalThis.fetch=(async()=>{calls++;return new Response('{"detail":{"status":"quota_exceeded"}}',{status:401})}) as typeof fetch
 try{
  assert.deepEqual(await speakEleven({text:'a',voiceId:'V'}),{ok:false,reason:'saldo_agotado'})
  assert.deepEqual(await speakEleven({text:'b',voiceId:'V'}),{ok:false,reason:'saldo_agotado'});assert.equal(calls,1)
 }finally{globalThis.fetch=real;resetElevenBlock()}
})
test('la traza de latencia resume por pasos y registra una sola vez',()=>{
 const t=new LatencyTrace('levy');t.mark('voiceEnd',0);t.mark('endpoint',1000);t.mark('sttDone',1400);t.mark('firstToken',2000);t.mark('firstToken',9999);t.mark('firstSound',2600)
 const s=t.summary();assert.equal(s.totalMs,2600);assert.deepEqual(s.steps.map(x=>x.ms),[1000,400,600,600])
})
test('el reproductor manda agente y contexto, y anota proveedor y respaldo',async()=>{
 const bodies:Record<string,unknown>[]=[]
 const transport=(async(_u:string,init:RequestInit)=>{bodies.push(JSON.parse(String(init.body)));return new Response(Uint8Array.from([0,0]),{headers:{'X-Sample-Rate':'24000','X-Voice-Provider':'apple-juan','X-Voice-Fallback':'saldo_agotado'}})}) as typeof fetch
 const p=new LivePcmPlayer(transport);p.setAgent('Sensei')
 ;(p as unknown as {context:unknown}).context={currentTime:0,outputLatency:0,createAnalyser(){},resume(){}}
 p.begin();p.enqueue('Primera.',1.75);p.enqueue('Segunda.',1.75,'trinity')
 await new Promise(r=>setTimeout(r,50))
 assert.equal(bodies[0].agent,'sensei');assert.equal(bodies[0].previousText,'');assert.equal(bodies[1].agent,'trinity');assert.equal(bodies[1].previousText,'Primera.')
 assert.equal(p.timings[0].provider,'apple-juan');assert.equal(p.timings[0].fallback,'saldo_agotado')
 p.cancel()
})
