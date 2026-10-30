/**
 * Mission Control client — ClaudeClaw → Mission Control webhook.
 * Fires start/end/error events so every conversation
 * appears as a task on the Kanban board in real time.
 */

import { readEnvFile } from './env.js'
import { logger } from './logger.js'
import { McOutbox } from './mc-outbox.js'
import type Database from 'better-sqlite3'
import { esEdicionCliente } from './edicion.js'

const _env = readEnvFile(['MISSION_CONTROL_URL', 'MISSION_CONTROL_TOKEN'])
const MC_URL = _env['MISSION_CONTROL_URL'] ?? 'http://127.0.0.1:3300/api/openclaw/event'
const MC_TOKEN = _env['MISSION_CONTROL_TOKEN'] ?? ''

// Edición cliente (AUDITORIA A9, empaquetado 11 oct 2026): nada de esto sale de la máquina del alumno. Ni prompts, ni
// respuestas, ni resultados de crons: Mission Control es de Daniel. Los eventos se descartan aquí, antes de la red.
const CLIENTE = esEdicionCliente()

if (!MC_TOKEN && !CLIENTE) {
  logger.warn({ url: MC_URL }, 'MISSION_CONTROL_TOKEN not set — cron output will NOT be delivered to Mission Control')
}

/** Un intento de entrega. Devuelve el resultado en vez de tragárselo: la cola
 *  durable (mc-outbox) decide si reintenta. */
export async function enviarEvento(payload: Record<string, unknown>, url = MC_URL): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (CLIENTE) return { ok: true, status: 204 }
  if (!MC_TOKEN) return { ok: false, error: 'MISSION_CONTROL_TOKEN ausente' }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MC_TOKEN}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const detalle = (await res.text().catch(() => '')).slice(0, 200)
      logger.error({ status: res.status, runId: payload.runId, action: payload.action, detalle }, 'mc-client: Mission Control rejected event')
      return { ok: false, status: res.status, error: detalle }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    logger.error({ err, runId: payload.runId, action: payload.action }, 'mc-client: failed to deliver event to Mission Control')
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function postEvent(payload: Record<string, unknown>): Promise<void> {
  await enviarEvento(payload)
}

// ── Cola durable para reportes de cron ──
let outbox: McOutbox | null = null
/** Se llama tras initDatabase(). Sin cola (tests, scripts) se entrega directo. */
export function initMcOutbox(db: Database.Database): McOutbox {
  outbox = new McOutbox(db, p => enviarEvento(p), Date.now, p => {
    logger.error({ runId: p.runId, jobId: p.jobId, attempts: p.attempts, lastError: p.lastError, dead: p.dead }, 'mc-outbox: un reporte de cron no llega a Mission Control; sigue en cola')
  })
  return outbox
}
export function mcOutbox(): McOutbox | null { return outbox }

export function mcStart(runId: string, prompt: string, source: string): void {
  void postEvent({
    runId,
    action: 'start',
    agentId: 'levy',
    prompt,
    source,
    timestamp: new Date().toISOString(),
  })
}

export function mcEnd(runId: string, response: string): void {
  void postEvent({
    runId,
    action: 'end',
    agentId: 'levy',
    response,
    timestamp: new Date().toISOString(),
  })
}

export function mcError(runId: string, error: string): void {
  void postEvent({
    runId,
    action: 'error',
    agentId: 'levy',
    error,
    timestamp: new Date().toISOString(),
  })
}

export interface CronRunUsage {
  costUsd: number
  inputTokens: number
  outputTokens: number
  durationMs: number
  numTurns: number
  model?: string
}

export function mcCronResult(
  jobId: string,
  output: string,
  error?: string,
  opts?: { silent?: boolean; usage?: CronRunUsage; originalAt?: string; runId?: string },
): Promise<void> {
  const payload: Record<string, unknown> = {
    action: 'end',
    runId: `cron-${jobId}-${Date.now()}`,
    agentId: 'levy',
    prompt: jobId,
    response: output,
    source: 'cron',
    timestamp: new Date().toISOString(),
  }
  if (error) payload.error = error
  // silent: el webhook registra el run en conversations (historial input/output
  // que consume el Cron Lens del calendario) pero NO inyecta al chat ni manda push.
  if (opts?.silent) payload.silent = true
  // usage: une jobId + costo/tokens en la fila de conversations (sala Acciones
  // del Artificial Brain). Antes el costo moría sin jobId en ops_events.
  if (opts?.usage) payload.usage = opts.usage
  if (opts?.originalAt) payload.originalAt = opts.originalAt
  if (opts?.runId) payload.runId = opts.runId
  if (CLIENTE) return Promise.resolve()
  // Los reportes no se pierden: pasan por la cola durable (reintento 48 h).
  if (outbox) return outbox.entregar(payload).then(() => undefined)
  return postEvent(payload)
}
