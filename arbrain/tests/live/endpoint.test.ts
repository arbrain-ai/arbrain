import test from 'node:test'
import assert from 'node:assert/strict'
import {SpeechEndpoint} from '../../src/features/live/voice/endpoint.ts'
const run=(d:SpeechEndpoint,from:number,to:number,level:number,speaking=false,working=false)=>{const events=[];for(let t=from;t<to;t+=20){const e=d.sample(level,t,speaking,working);if(e!=='none')events.push(e)}return events}
test('silence and a short noise never become an utterance',()=>{
 const d=new SpeechEndpoint();assert.deepEqual(run(d,100,5000,0),[])
 run(d,5000,5040,.2);assert.deepEqual(run(d,5040,7000,0),['discard'])
})
test('brief speech pauses preserve the same utterance',()=>{
 const d=new SpeechEndpoint();run(d,100,1000,.1);assert.deepEqual(run(d,1000,1500,0),['speculate']);run(d,1500,2200,.1);assert.deepEqual(run(d,2200,3500,0),['speculate','end'])
})
test('sustained speech interrupts once, a click does not',()=>{
 const d=new SpeechEndpoint();assert.deepEqual(run(d,100,140,.2,true),[]);run(d,140,1500,0,true)
 assert.deepEqual(run(d,1500,2200,.2,true),['interrupt']);assert.deepEqual(run(d,2200,3500,0),['speculate','end'])
})
test('speculation fires once per silence and again after the voice returns',()=>{
 const d=new SpeechEndpoint();run(d,100,1000,.1)
 assert.deepEqual(run(d,1000,1300,0),[]);assert.deepEqual(run(d,1300,1700,0),['speculate']);assert.deepEqual(run(d,1700,1800,0),[])
 run(d,1800,2400,.1);assert.deepEqual(run(d,2400,3600,0),['speculate','end'])
})
test('noise shorter than a word never triggers speculation',()=>{
 const d=new SpeechEndpoint();run(d,100,140,.2);assert.deepEqual(run(d,140,2000,0),['discard'])
})
test('idle capture is periodically discarded rather than growing forever',()=>{
 const d=new SpeechEndpoint();assert.deepEqual(run(d,100,30200,0),['discard'])
})
test('bare stop commands do not become another agent turn',async()=>{
 const {isStopUtterance}=await import('../../src/features/live/voice/endpoint.ts')
 assert.equal(isStopUtterance('Detente.'),true);assert.equal(isStopUtterance('Levy, para'),true)
 assert.equal(isStopUtterance('Espera, compara las dos gráficas.'),false);assert.equal(isStopUtterance('No publiques ese anuncio.'),false)
})
