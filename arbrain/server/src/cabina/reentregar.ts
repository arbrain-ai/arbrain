/**
 * Reentrega un reporte de cron que no llegó a Mission Control.
 *   node dist/cabina/reentregar.js <jobId> <archivo-con-el-texto> <originalAt ISO> [url-webhook]
 * El runId se deriva de la hora original: reentregar dos veces no duplica
 * (el receptor es idempotente por runId). Llega a la campana sin sonar.
 */
import { readFileSync } from 'node:fs'
import { initDatabase, getDb } from '../db.js'
import { enviarEvento, mcCronResult, initMcOutbox } from '../mc-client.js'
import { McOutbox } from '../mc-outbox.js'

const [jobId, archivo, originalAt, url] = process.argv.slice(2)
if (!jobId || !archivo || !originalAt || !Number.isFinite(Date.parse(originalAt))) {
  console.error('uso: reentregar <jobId> <archivo> <originalAt ISO>'); process.exit(2)
}
initDatabase()
const runId = `cron-${jobId}-${Date.parse(originalAt)}`
const texto = readFileSync(archivo, 'utf8').trim()
// Con URL explícita se entrega a ese receptor (misma cola durable); sin ella, al de siempre.
const outbox = url ? new McOutbox(getDb(), p => enviarEvento(p, url)) : initMcOutbox(getDb())
if (url) await outbox.entregar({ action: 'end', runId, agentId: 'levy', prompt: jobId, response: texto, source: 'cron', originalAt, timestamp: new Date().toISOString() })
else await mcCronResult(jobId, texto, undefined, { originalAt, runId })
const sigue = outbox.pendientes().find(p => p.runId === runId)
console.log(JSON.stringify(sigue ? { runId, entregado: false, enCola: sigue } : { runId, entregado: true }))
process.exit(0)
