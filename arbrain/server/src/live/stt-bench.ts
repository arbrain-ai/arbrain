import {WarmSpeech} from './speech.js'
import {transcribe,speechProviders} from './transcribe.js'
import {readEnvFile} from '../env.js'
import {writeFileSync,mkdirSync} from 'node:fs'
const cases=[
 {id:'short',parts:['Hola, Levy.']},
 {id:'numbers',parts:['Compara ciento veinte con doscientos cuarenta. No uses porcentajes inventados.']},
 {id:'correction',parts:['No, espera. Me refería a la última semana, no al último mes.']},
 {id:'pause',parts:['Muéstrame la comparación de ventas.','Y conserva la fuente visible.']},
 {id:'long',parts:['Primero quiero entender qué cambió en el negocio durante la última semana. Conserva la comparación a la vista mientras revisamos de dónde vienen las ventas. Después podemos separar los cobros nuevos de las renovaciones y comprobar si hay reembolsos. Si falta algún dato, indícalo con claridad. No conviertas una ausencia de información en un cero. Cuando terminemos de mirar la evidencia, propón una siguiente acción y explícame por qué tendría sentido. No ejecutes ninguna acción real durante esta prueba. Este audio sirve para verificar que una instrucción larga conserva sus palabras, sus pausas y sus correcciones sin transformarse en varias órdenes independientes.']},
 {id:'negation',parts:['No publiques ese anuncio. Solo prepara un borrador y muéstramelo a la derecha.']},
]
type Run={provider:string;ms:number;text?:string;error?:string}
const results:Array<{id:string;expected:string;seconds:number;runs:Run[]}>=[]
const voice=new WarmSpeech(),providers=speechProviders(readEnvFile());mkdirSync('/tmp/arbrain-live-corpus',{recursive:true})
try{
 for(const item of cases){
  const pieces:Buffer[]=[];let rate=0
  for(const text of item.parts){const audio=await voice.stream(text,1,new AbortController().signal);if(rate&&rate!==audio.sampleRate)throw new Error('sample rate changed');rate=audio.sampleRate;const reader=audio.body.getReader();for(;;){const {value,done}=await reader.read();if(done)break;pieces.push(Buffer.from(value))}if(item.parts.length>1)pieces.push(Buffer.alloc(Math.round(rate*.6)*2))}
  const pcm=Buffer.concat(pieces),header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40)
  const wav=Buffer.concat([header,pcm]);writeFileSync(`/tmp/arbrain-live-corpus/${item.id}.wav`,wav)
  const runs=await Promise.all(providers.map(async provider=>{const start=performance.now();try{const result=await transcribe(new Blob([new Uint8Array(wav)],{type:'audio/wav'}),[provider],AbortSignal.timeout(60000));return {provider:provider.name,ms:performance.now()-start,text:result.text}}catch(e){return {provider:provider.name,ms:performance.now()-start,error:String(e)}}}))
  results.push({id:item.id,expected:item.parts.join(' '),seconds:pcm.length/2/rate,runs});console.log(item.id,runs.map(r=>({provider:r.provider,ms:Math.round(r.ms),ok:!('error'in r)})))
 }
}finally{voice.close()}
const summary=providers.map(p=>{const rows=results.flatMap(r=>r.runs).filter(r=>r.provider===p.name),times=rows.map(r=>r.ms).sort((a,b)=>a-b);return {provider:p.name,samples:rows.length,errors:rows.filter(r=>'error'in r).length,p50:times[Math.ceil(times.length*.5)-1],p95:times[Math.ceil(times.length*.95)-1]}})
writeFileSync('docs/builds/arbrain-live-workspace-2026-09-14/evidence/stt-corpus-bench.json',JSON.stringify({method:'Same synthesized WAV per case, direct provider adapters from same host. Not microphone or full conversation latency.',summary,results},null,2)+'\n');console.log(summary)
