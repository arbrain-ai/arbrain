import { ConsejoRuntime } from './runtime.js'
import { writeFile } from 'node:fs/promises'
const runtime=new ConsejoRuntime();const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),60000)
try {
 const r=await runtime.summarize({messages:[
  {turnId:'t1',role:'user',content:'Caso sintético: puedo dedicar 20 horas a esta idea; no he decidido ejecutarla.'},
  {turnId:'t1',role:'assistant',content:'Podríamos explorar un experimento reversible; sigue siendo propuesta.'},
  {turnId:'t2',role:'user',content:'Corrección: sólo dispongo de cuatro horas, no veinte. No quiero monetizar esta exploración filosófica.'},
  {turnId:'t2',role:'assistant',content:'Queda abierta la diferencia entre autonomía y origen externo de una idea.'},
 ]},ac.signal)
 const evidence={observedAt:new Date().toISOString(),...r}
 await writeFile('docs/builds/arbrain-consejo-2026-09-08/summary-smoke.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence))
}finally{clearTimeout(timer)}
