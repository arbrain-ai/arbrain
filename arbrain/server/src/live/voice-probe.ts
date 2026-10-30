import {WarmSpeech} from './speech.js'
import {writeFileSync} from 'node:fs'
const voice=new WarmSpeech(),results=[]
try{
 for(const text of ['Estoy preparando la comparación.','Estos datos son una prueba de voz. La conversación puede continuar mientras llegan las siguientes frases.']){
  const start=performance.now();const audio=await voice.stream(text,1.75,new AbortController().signal);const reader=audio.body.getReader();let first:number|null=null,bytes=0,chunks=0
  for(;;){const {value,done}=await reader.read();if(done)break;first??=performance.now()-start;bytes+=value.length;chunks++}
  results.push({text,firstChunkMs:first,totalMs:performance.now()-start,sampleRate:audio.sampleRate,bytes,chunks,audioSeconds:bytes/2/audio.sampleRate})
 }
 writeFileSync('docs/builds/arbrain-live-workspace-2026-09-14/evidence/apple-pcm-probe.json',JSON.stringify({kind:'real synthesis to buffers; no speaker playback',results},null,2)+'\n')
 console.log(results)
}finally{voice.close()}
