import { DUENO, DUENO_M } from '../dueno.js'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomInt } from 'node:crypto'
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { assertClaudeAccount, claudeOptions } from './runtime.js'
import type { Turn } from './types.js'
const root='docs/builds/arbrain-consejo-2026-09-08'
const {turns}:{turns:Turn[]}=JSON.parse(await readFile(join(root,'real-five-turns-2026-09-10.json'),'utf8'))
if(turns.length!==5 || turns.some(t=>t.state!=='complete'))throw new Error('Five real completed turns required')
const keys:unknown[]=[]
const cases=turns.map((t,i)=>{
 const candidates=[{source:'claude',text:t.proposals.claude.text},{source:'openai',text:t.proposals.openai.text},{source:'integrated',text:t.final}]
 for(let k=2;k>0;k--){const j=randomInt(k+1);[candidates[k],candidates[j]]=[candidates[j],candidates[k]]}
 keys.push({turn:i+1,mapping:candidates.map((c,k)=>({label:String.fromCharCode(65+k),source:c.source}))})
 return {turn:i+1,commonContext:t.packet.messages,references:t.packet.references,candidates:candidates.map((c,k)=>({label:String.fromCharCode(65+k),text:c.text}))}
})
await writeFile(join(root,'blind-conversation-key-round2-2026-09-10.json'),JSON.stringify(keys,null,2)+'\n')
const cwd=await mkdtemp(join(tmpdir(),'consejo-blind-'))
let release!:()=>void;const ready=new Promise<void>(r=>release=r)
async function* input():AsyncGenerator<SDKUserMessage>{await ready;yield {type:'user',session_id:'',parent_tool_use_id:null,message:{role:'user',content:`Eres crítico independiente. Ignoras qué candidato es síntesis y cuáles individuales. Cada turno tiene A/B/C en orden aleatorio distinto. Contexto de producto común a TODOS los candidatos: la interfaz permite abrir las dos perspectivas originales completas bajo cada respuesta con un control plegado. Una nota opcional Dónde difieren es parte autorizada del producto, no un error por sí sola: evalúa si el desacuerdo es sustantivo y fiel a las fuentes. No deduzcas ni premies la identidad del candidato. Compara los tres sobre EL MISMO contexto provisto. Juzga utilidad estratégica (1,2), profundidad filosófica sin CTA (3), fidelidad a citas y referencias (4), continuidad tras corrección y reapertura (5). Identifica pérdida de ideas, errores añadidos y prosa vacía con citas exactas. Por turno devuelve preferencia razonada o empate y mayor gap. Evalúa además el conjunto: el historial público realmente recibido está en commonContext, no presupongas que es el mejor. No inventes superioridad ni gustos de ${DUENO}. Máximo 1100 palabras.\n${JSON.stringify(cases)}`}}}
const q=query({prompt:input(),options:{...claudeOptions(cwd,'claude-sonnet-5'),effort:'medium'}});const timer=setTimeout(()=>q.close(),120000)
try {assertClaudeAccount(await q.accountInfo());release();let done=false
 for await(const e of q){if(e.type==='assistant'&&e.message.model!=='claude-sonnet-5')throw new Error('Wrong critic model')
 if(e.type==='result'){if(e.subtype!=='success')throw new Error(e.subtype);await writeFile(join(root,'blind-conversation-review-round2-2026-09-10.md'),`# Revisión ciega de conversación\n\n${new Date().toISOString()} · Sonnet 5 · suscripción principal · contexto fresco · sin herramientas\n\n${e.result}\n`);console.log(e.result);done=true}}
 if(!done)throw new Error('No review delivered')
}finally{clearTimeout(timer);q.close()}
