import test from 'node:test'
import assert from 'node:assert/strict'
import { PcmDecoder, SpeechClauses, rms } from '../../src/features/live/voice/pcm.ts'
test('sample sequence survives every possible HTTP chunk boundary',()=>{
 const raw=new Uint8Array(40);const view=new DataView(raw.buffer)
 for(let i=0;i<20;i++)view.setInt16(i*2,(i-10)*1000,true)
 const expected=Array.from({length:20},(_,i)=>(i-10)*1000/32768)
 for(let size=1;size<15;size++){
  const decoder=new PcmDecoder();const actual:number[]=[]
  for(let offset=0;offset<raw.length;offset+=size)actual.push(...decoder.decode(raw.slice(offset,offset+size)))
  decoder.finish();assert.deepEqual(actual,expected)
 }
})
test('truncated sample is reported, silence has zero energy',()=>{
 const decoder=new PcmDecoder();decoder.decode(new Uint8Array([4]));assert.throws(()=>decoder.finish(),/incompleta/)
 assert.equal(rms(new Float32Array(40)),0)
})
test('speech starts at natural clauses while later text is still arriving',()=>{
 const stream=new SpeechClauses()
 assert.deepEqual(stream.push('Estoy consultando las ventas del período. '),['Estoy consultando las ventas'])
 assert.deepEqual(stream.flushSentence(),['del período.'])
 assert.deepEqual(stream.push('Esta segunda frase todavía no termina'),[])
 assert.deepEqual(stream.flush(),['Esta segunda frase todavía no termina'])
})
test('decimal numbers and short fragments are not split into individual utterances',()=>{
 const stream=new SpeechClauses();const spoken=[...stream.push('El valor es 12.35 y todavía estoy calculando'),...stream.flush()]
 assert.equal(spoken.join(' '),'El valor es 12.35 y todavía estoy calculando');assert.ok(spoken.every(part=>!/12\.$|^35/.test(part)))
})
test('code and incomplete fenced output never become speech',async()=>{
 const {speechText}=await import('../../src/features/live/voice/pcm.ts')
 assert.equal(speechText('Mira esto. ```js\nfetch("secret")'),'Mira esto. ')
 assert.equal(speechText('**Hola** [fuente](https://example.com)'),'Hola fuente')
})
test('the first chunk leaves after about five words, without waiting for punctuation',()=>{
 const s=new SpeechClauses();assert.deepEqual(s.push('Claro déjame revisar tu agenda de mañana y te digo'),['Claro déjame revisar tu agenda'])
 assert.deepEqual(s.push(' qué reuniones tienes antes de la comida.'),[])
})
test('a sentence can finish at a tool boundary without waiting for more text',()=>{
 const s=new SpeechClauses();assert.deepEqual(s.push('Estoy revisando la fuente.'),[]);assert.deepEqual(s.flushSentence(),['Estoy revisando la fuente.']);assert.deepEqual(s.flush(),[])
 const n=new SpeechClauses();n.push('El resultado fue 12.');assert.deepEqual(n.flushSentence(),[]);n.push('35 dólares.');assert.deepEqual(n.flushSentence(),['El resultado fue 12.35 dólares.'])
})
