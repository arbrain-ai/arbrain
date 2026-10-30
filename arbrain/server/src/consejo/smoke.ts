/** Inocuous Claude subscription probe; does not pretend to certify missing OpenAI .gz. */
import { writeFile } from 'node:fs/promises'
import { ConsejoRuntime } from './runtime.js'
import { packet } from './context.js'
import { IDENTITIES } from './engine.js'
import { randomUUID } from 'node:crypto'
const runtime = new ConsejoRuntime()
const ac = new AbortController(); const timer = setTimeout(()=>ac.abort(),90000)
const started = Date.now()
try {
  const p = packet('Prueba inocua de integración sin herramientas.',[],randomUUID(),'Responde exactamente CONSEJO_CLAUDE_OK. No uses herramientas ni escribas archivos.',[],IDENTITIES)
  const result = await runtime.infer('claude',p,{claude:{state:'pending'},openai:{state:'pending'},synthesis:{state:'pending'}},ac.signal)
  const evidence = {observedAt:new Date().toISOString(),durationMs:Date.now()-started,...result}
  await writeFile('docs/builds/arbrain-consejo-2026-09-08/claude-smoke.json',JSON.stringify(evidence,null,2)+'\n')
  console.log(JSON.stringify(evidence))
} catch(e) {console.log(JSON.stringify({error:e instanceof Error?e.message:String(e),durationMs:Date.now()-started}));process.exitCode=1}
finally {clearTimeout(timer)}
