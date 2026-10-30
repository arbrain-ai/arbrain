import { query,type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { readFile,writeFile,mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomInt } from 'node:crypto'
import { assertClaudeAccount,claudeOptions } from './runtime.js'
const root='docs/builds/arbrain-consejo-2026-09-08/visual'
const round=process.env.CONSEJO_VISUAL_ROUND || '1'
const files=Number(round)>=3 ? ['mobile-390-20260910.png','real-mobile-430-final-20260910.png','real-expanded-final-20260910.png','real-desktop-20260910.png','pending-keyboard-20260910.png','provider-failure-20260910.png','reference-chatgpt.webp','reference-claude.webp'] : round==='2' ? ['mobile-control-collapsed.png','round2-collapsed.png','round2-expanded.png','mobile-390-perspectives.png','desktop.png','reference-chatgpt.webp','reference-claude.webp'] : ['mobile-390-collapsed.png','mobile-390-claude.png','mobile-390-perspectives.png','mobile-430.png','desktop.png','reference-chatgpt.webp','reference-claude.webp']
for(let i=files.length-1;i>0;i--){const j=randomInt(i+1);[files[i],files[j]]=[files[j],files[i]]}
const blocks:unknown[]=[{type:'text',text:'Revisión visual independiente. No tienes código ni razonamiento del constructor. Las imágenes están en orden aleatorio. Evalúa jerarquía de conversación, lectura móvil, expansión de perspectivas y controles. Algunos referentes oficiales son capturas publicadas con marco promocional: compara sólo la conversación visible dentro del teléfono y declara la limitación; no certifican interacciones ni teclado. Los textos [offline] y [fallo], cuando aparezcan dentro de un mensaje del usuario, fueron escritos literalmente por el probador para disparar fallos sintéticos; evalúa la recuperación mostrada, no los confundas con logs de producción. Hay imágenes de escenarios de prueba con respuestas reales y otras sintéticas: NO certifiques cuentas ni calidad conversacional solo por las capturas. Algunas vistas están desplazadas para mostrar el final: no deduzcas ausencia de mensajes anteriores solo porque no caben en el viewport. Devuelve el mayor gap visible por componente y conjunto, evidencias por letra, y si hay un bloqueo de usabilidad. Máximo 600 palabras. No asumas que una UI debe ganar, no puntúes ficticiamente. Distingue hallazgos visibles de hipótesis.'}]
for(const [i,file]of files.entries()){
 blocks.push({type:'text',text:`Imagen ${String.fromCharCode(65+i)}`},{type:'image',source:{type:'base64',media_type:file.endsWith('.webp')?'image/webp':'image/png',data:(await readFile(join(root,file))).toString('base64')}})
}
let release!:()=>void;const ready=new Promise<void>(r=>{release=r})
async function* input():AsyncGenerator<SDKUserMessage>{await ready;yield {type:'user',session_id:'',parent_tool_use_id:null,message:{role:'user',content:blocks as SDKUserMessage['message']['content']}}}
const cwd=await mkdtemp(join(tmpdir(),'consejo-visual-review-'))
const q=query({prompt:input(),options:{...claudeOptions(cwd,'claude-sonnet-5'),effort:'medium'}})
const timer=setTimeout(()=>q.close(),120000)
try{
 assertClaudeAccount(await q.accountInfo());release()
 let reviewed=false
 for await(const e of q){
  if(e.type==='assistant' && e.message.model!=='claude-sonnet-5')throw new Error('Modelo crítico inesperado')
  if(e.type==='result'){
   if(e.subtype!=='success')throw new Error(e.subtype)
   await writeFile(join(root,`review-round${round}.md`),`# Crítica visual independiente\n\n${new Date().toISOString()} · claude-sonnet-5 · sin herramientas · orden aleatorio\n\n${e.result}\n`)
   await writeFile(join(root,`blind-key-round${round}.json`),JSON.stringify(files.map((file,i)=>({label:String.fromCharCode(65+i),file})),null,2)+'\n')
   console.log(e.result);reviewed=true
  }
 }
 if(!reviewed)throw new Error('El crítico no entregó dictamen')
}finally{clearTimeout(timer);q.close()}
