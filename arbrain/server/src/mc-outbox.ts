/**
 * Cola durable de entregas a Mission Control (30 sep 2026).
 *
 * El 29 y 30 sep el reporte diario corrió a las 09:02 pero nunca llegó a la
 * campana: la base de Mission Control estaba caída, el webhook respondió 400
 * («No agent found») y `postEvent` solo lo anotó en el log. Un reporte que se
 * genera y no llega es peor que uno que falla: nadie se entera.
 *
 * Regla: todo reporte de cron se intenta al momento; si no hay 2xx queda en la
 * tabla `mc_outbox` y se reintenta con espera creciente hasta 48 h. Al tercer
 * fallo se avisa (log + `alertados`, que Levy lee al abrir conversación). El
 * receptor es idempotente por `runId`, así que reintentar nunca duplica.
 */
import type Database from 'better-sqlite3'

export type Envio = (payload: Record<string, unknown>) => Promise<{ ok: boolean; status?: number; error?: string }>

export interface Pendiente { runId: string; jobId: string; attempts: number; lastError: string | null; createdAt: number; nextAt: number; dead: boolean }

/** Minutos de espera tras cada fallo; después del último, cada hora. */
export const ESPERAS_MIN = [1, 2, 5, 10, 30, 60]
export const VIDA_MS = 48 * 3600_000
export const ALERTA_TRAS = 3

export class McOutbox {
  constructor(private db: Database.Database, private enviar: Envio, private reloj: () => number = Date.now, private alertar: (p: Pendiente) => void = () => {}) {
    db.exec(`CREATE TABLE IF NOT EXISTS mc_outbox (
      run_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, last_error TEXT,
      created_at INTEGER NOT NULL, delivered_at INTEGER, dead INTEGER NOT NULL DEFAULT 0, alerted INTEGER NOT NULL DEFAULT 0)`)
  }

  /** Intenta ya; si falla, el evento queda en la cola (nunca se pierde). */
  async entregar(payload: Record<string, unknown>): Promise<boolean> {
    const runId = String(payload.runId), jobId = String(payload.prompt ?? payload.action ?? 'evento'), now = this.reloj()
    this.db.prepare(`INSERT OR IGNORE INTO mc_outbox (run_id, job_id, payload, next_at, created_at) VALUES (?,?,?,?,?)`)
      .run(runId, jobId, JSON.stringify(payload), now, now)
    return this.intentar(runId)
  }

  private async intentar(runId: string): Promise<boolean> {
    const row = this.db.prepare(`SELECT * FROM mc_outbox WHERE run_id=? AND delivered_at IS NULL AND dead=0`).get(runId) as
      { payload: string; attempts: number; created_at: number; job_id: string; alerted: number } | undefined
    if (!row) return true
    let r: { ok: boolean; status?: number; error?: string }
    try { r = await this.enviar(JSON.parse(row.payload)) } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : String(e) } }
    const now = this.reloj()
    if (r.ok) {
      this.db.prepare(`UPDATE mc_outbox SET delivered_at=?, attempts=attempts+1, last_error=NULL WHERE run_id=?`).run(now, runId)
      return true
    }
    const attempts = row.attempts + 1
    const espera = (ESPERAS_MIN[Math.min(attempts - 1, ESPERAS_MIN.length - 1)]) * 60_000
    const dead = now - row.created_at >= VIDA_MS ? 1 : 0
    const error = (r.status ? `HTTP ${r.status}` : '') + (r.error ? ` ${r.error}` : '')
    this.db.prepare(`UPDATE mc_outbox SET attempts=?, next_at=?, last_error=?, dead=? WHERE run_id=?`).run(attempts, now + espera, error.trim().slice(0, 500), dead, runId)
    if ((attempts >= ALERTA_TRAS || dead) && !row.alerted) {
      this.db.prepare(`UPDATE mc_outbox SET alerted=1 WHERE run_id=?`).run(runId)
      this.alertar({ runId, jobId: row.job_id, attempts, lastError: error.trim(), createdAt: row.created_at, nextAt: now + espera, dead: !!dead })
    }
    return false
  }

  /** Reintenta lo que ya venció. Devuelve cuántos se entregaron. */
  async procesar(): Promise<number> {
    const due = this.db.prepare(`SELECT run_id FROM mc_outbox WHERE delivered_at IS NULL AND dead=0 AND next_at<=? ORDER BY created_at LIMIT 20`).all(this.reloj()) as { run_id: string }[]
    let n = 0
    for (const { run_id } of due) if (await this.intentar(run_id)) n++
    return n
  }

  /** Lo que sigue sin llegar (para Levy y la vista «reporte»). */
  pendientes(): Pendiente[] {
    return (this.db.prepare(`SELECT run_id, job_id, attempts, last_error, created_at, next_at, dead FROM mc_outbox WHERE delivered_at IS NULL ORDER BY created_at`).all() as
      { run_id: string; job_id: string; attempts: number; last_error: string | null; created_at: number; next_at: number; dead: number }[])
      .map(r => ({ runId: r.run_id, jobId: r.job_id, attempts: r.attempts, lastError: r.last_error, createdAt: r.created_at, nextAt: r.next_at, dead: !!r.dead }))
  }

  /** Limpieza: lo entregado hace más de 14 días sale de la tabla. */
  podar(): void { this.db.prepare(`DELETE FROM mc_outbox WHERE delivered_at IS NOT NULL AND delivered_at < ?`).run(this.reloj() - 14 * 86400_000) }
}
