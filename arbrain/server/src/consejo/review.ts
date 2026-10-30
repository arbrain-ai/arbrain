/** Fresh Sonnet review over the deliverable sources. Not a substitute for image-based UI review. */
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { assertClaudeAccount, claudeOptions } from './runtime.js'
const files=['arbrain/server/src/consejo/auth.ts','arbrain/server/src/consejo/runtime.ts','arbrain/server/src/consejo/store.ts','arbrain/server/src/consejo/engine.ts','arbrain/server/src/consejo/context.ts','arbrain/src/features/chat/components/ConsejoPanel.tsx','arbrain/src/features/chat/components/consejo.module.css']
const source=(await Promise.all(files.map(async p=>`\nFILE ${p}\n${await readFile(p,'utf8')}`))).join('\n')
const cwd=await mkdtemp(join(tmpdir(),'consejo-review-'))
let release!: () => void
const ready = new Promise<void>(resolve => { release = resolve })
async function* input(): AsyncGenerator<SDKUserMessage> {
 await ready
 yield {type:'user',session_id:'',parent_tool_use_id:null,message:{role:'user',content:`Actúa como crítico independiente del código recibido. No conoces al constructor ni su razonamiento. Revisa bugs reales de aislamiento, continuidad, persistencia, cancelación y usabilidad móvil. No ejecutes herramientas. Máximo 500 palabras: los 4 problemas más importantes, con archivo, mecanismo y prueba. Si no tienes imagen, no afirmes revisión visual. Contrato: dos propuestas independientes con paquete compartido; síntesis aparte; sólo respuestas públicas; suscripciones exactas; nunca herramientas operativas.\n${source}`}}
}
const q=query({prompt:input(),options:{...claudeOptions(cwd,'claude-sonnet-5'),effort:'medium'}})
const timer=setTimeout(()=>q.close(),90000)
try {
 assertClaudeAccount(await q.accountInfo()); release()
 for await(const e of q) {
  if(e.type==='system' && e.subtype==='init')console.log(JSON.stringify({type:e.type,model:e.model}))
  if(e.type==='assistant' && e.message.model!=='claude-sonnet-5')throw new Error('Reviewer model mismatch')
  if(e.type==='result') {
   if(e.subtype!=='success')throw new Error(e.subtype)
   await writeFile('docs/builds/arbrain-consejo-2026-09-08/independent-code-review-2026-09-10.md',`# Revisión independiente de código\n\n${new Date().toISOString()} · claude-sonnet-5 · suscripción principal · sin herramientas\n\n${e.result}\n`)
   console.log(e.result)
  }
 }
}finally{clearTimeout(timer);q.close()}
