import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { ConsejoRuntime } from './runtime.js'
import { packet } from './context.js'
import { IDENTITIES } from './engine.js'
const runtime = new ConsejoRuntime()
const ac = new AbortController(); const timer = setTimeout(()=>ac.abort(),90000)
const evidence: Record<string,unknown> = {observedAt:new Date().toISOString()}
try {
  evidence.identities = await runtime.identities(ac.signal)
  const p = packet('Prueba inocua sin herramientas.',[],randomUUID(),'Responde exactamente CONSEJO_OK. No uses herramientas.',[],IDENTITIES)
  const proposals = {claude:{state:'pending' as const},openai:{state:'pending' as const},synthesis:{state:'pending' as const}}
  evidence.results = await Promise.all((['claude','openai'] as const).map(async stage => {
    const start=Date.now(); const result = await runtime.infer(stage,p,proposals,ac.signal)
    return {stage,durationMs:Date.now()-start,...result}
  }))
} catch(e) { evidence.error=e instanceof Error?e.message:String(e);process.exitCode=1 }
finally {
  clearTimeout(timer)
  await writeFile('docs/builds/arbrain-consejo-2026-09-08/subscription-smoke-2026-09-10.json',JSON.stringify(evidence,null,2)+'\n')
  console.log(JSON.stringify(evidence))
}
