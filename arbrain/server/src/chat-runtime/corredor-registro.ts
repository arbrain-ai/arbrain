import type Database from 'better-sqlite3'
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * El corredor (daemon-levy, 1 oct 2026): un proceso aparte, fuera del grupo de procesos
 * de launchd, que es dueño de los turnos de chat. El agent-server se reinicia (deploy,
 * caída) y el corredor sigue escribiendo en el journal; el servidor nuevo solo observa.
 * Este módulo es lo que ambos procesos comparten: identidad, vida/muerte y el relevo
 * de respuestas a preguntas del modelo.
 */

export const CORREDOR_PREFIX = 'corredor'

let cachedBoot: string | undefined
/** Identidad del arranque del Mac. Tras un reinicio los PID se reciclan: un PID vivo
 * de otro arranque NO es el mismo proceso. */
export function bootId(): string {
  if (cachedBoot) return cachedBoot
  try {
    const raw = execFileSync('/usr/sbin/sysctl', ['-n', 'kern.boottime'], { encoding: 'utf8', timeout: 2000 })
    const sec = /sec\s*=\s*(\d+)/.exec(raw)?.[1]
    if (sec) return (cachedBoot = sec)
  } catch { /* no es macOS o sysctl no respondió */ }
  try {
    const raw = execFileSync('cat', ['/proc/sys/kernel/random/boot_id'], { encoding: 'utf8', timeout: 2000 }).trim()
    if (raw) return (cachedBoot = raw.replace(/[^0-9a-f]/gi, ''))
  } catch { /* sin boot id: se usa solo el PID */ }
  return (cachedBoot = 'desconocido')
}

export function corredorWorkerId(pid = process.pid): string {
  return [CORREDOR_PREFIX, hostname(), String(pid), bootId(), randomUUID()].join(':')
}

export function isCorredorWorker(workerId: string | null | undefined): boolean {
  return !!workerId && workerId.startsWith(`${CORREDOR_PREFIX}:`)
}

export type WorkerDeath = 'alive' | 'dead' | 'rebooted'

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' }
}

/** Formatos: `host:pid:uuid` (worker dentro del agent-server) y
 * `corredor:host:pid:boot:uuid`. Otra máquina = muerto para esta base. */
export function workerState(workerId: string, host = hostname(), boot = bootId(), alive = pidAlive): WorkerDeath {
  const parts = workerId.split(':')
  if (parts[0] === CORREDOR_PREFIX) {
    const [, workerHost, pid, workerBoot] = parts
    if (workerHost !== host) return 'dead'
    if (workerBoot && boot !== 'desconocido' && workerBoot !== boot) return 'rebooted'
    if (!/^\d+$/.test(pid ?? '')) return 'alive'
    return alive(Number(pid)) ? 'alive' : 'dead'
  }
  const [workerHost, pid] = parts
  if (workerHost !== host) return 'dead'
  if (!/^\d+$/.test(pid ?? '')) return 'alive'
  return alive(Number(pid)) ? 'alive' : 'dead'
}

export function workerConfirmedDead(workerId: string): boolean {
  return workerState(workerId) !== 'alive'
}

/** Sello del código del corredor. Un build nuevo reescribe dist/: el corredor viejo
 * deja de tomar turnos y termina los suyos; el agent-server lanza uno nuevo. */
export function corredorEntry(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const ext = fileURLToPath(import.meta.url).endsWith('.ts') ? '.ts' : '.js'
  return join(here, `corredor${ext}`)
}
export function codeStamp(file = corredorEntry()): string {
  try { return String(Math.trunc(statSync(file).mtimeMs)) } catch { return 'sin-sello' }
}

export function corredorEnabled(env: Record<string, string | undefined>): boolean {
  return env.ARBRAIN_CORREDOR === '1'
}

export interface CorredorRow { workerId: string; pid: number; stamp: string; startedAt: number; heartbeatAt: number; draining: boolean }

/** Tablas aditivas en el mismo claudeclaw.db: registro de corredores y relevo de respuestas. */
export class CorredorRegistro {
  constructor(private db: Database.Database, private clock: () => number = Date.now) {
    db.pragma('busy_timeout = 5000')
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_runtime_runners (
        worker_id TEXT PRIMARY KEY,
        pid INTEGER NOT NULL,
        stamp TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        heartbeat_at INTEGER NOT NULL,
        draining INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS chat_runtime_answers (
        request_id TEXT PRIMARY KEY,
        answers_json TEXT,
        created_at INTEGER NOT NULL,
        consumed_by TEXT,
        consumed_at INTEGER
      );
    `)
  }

  register(workerId: string, pid: number, stamp: string): void {
    const now = this.clock()
    this.db.prepare('INSERT OR REPLACE INTO chat_runtime_runners (worker_id, pid, stamp, started_at, heartbeat_at, draining) VALUES (?, ?, ?, ?, ?, 0)').run(workerId, pid, stamp, now, now)
  }
  heartbeat(workerId: string, draining: boolean): void {
    this.db.prepare('UPDATE chat_runtime_runners SET heartbeat_at = ?, draining = ? WHERE worker_id = ?').run(this.clock(), draining ? 1 : 0, workerId)
  }
  unregister(workerId: string): void {
    this.db.prepare('DELETE FROM chat_runtime_runners WHERE worker_id = ?').run(workerId)
  }
  runners(): CorredorRow[] {
    return (this.db.prepare('SELECT * FROM chat_runtime_runners ORDER BY started_at').all() as Array<Record<string, unknown>>).map(row => ({
      workerId: String(row.worker_id), pid: Number(row.pid), stamp: String(row.stamp),
      startedAt: Number(row.started_at), heartbeatAt: Number(row.heartbeat_at), draining: Number(row.draining) === 1,
    }))
  }
  /** Corredores vivos; los muertos se borran del registro al verlos. */
  alive(isDead: (workerId: string) => boolean = workerConfirmedDead): CorredorRow[] {
    const result: CorredorRow[] = []
    for (const row of this.runners()) {
      if (isDead(row.workerId)) this.unregister(row.workerId)
      else result.push(row)
    }
    return result
  }

  /** Respuesta a una pregunta que vive en un corredor. Solo se encola si un turno activo
   * tiene esa pregunta abierta en su journal: así el «ok» no promete de más. */
  relayAnswer(requestId: string, answers: Record<string, string> | null): boolean {
    if (!requestId) return false
    return this.db.transaction(() => {
      const open = this.db.prepare(`SELECT 1 FROM chat_runtime_events e JOIN chat_runtime_turns t ON t.turn_id = e.turn_id
        WHERE t.status IN ('dispatching','running','waiting') AND json_extract(e.event_json, '$.type') = 'ask_user_question' AND json_extract(e.event_json, '$.requestId') = ?
          AND NOT EXISTS (SELECT 1 FROM chat_runtime_events r WHERE r.turn_id = e.turn_id AND json_extract(r.event_json, '$.type') = 'question_resolved' AND json_extract(r.event_json, '$.requestId') = ?)
        LIMIT 1`).get(requestId, requestId)
      if (!open) return false
      const existing = this.db.prepare('SELECT consumed_at FROM chat_runtime_answers WHERE request_id = ?').get(requestId) as { consumed_at: number | null } | undefined
      if (existing) return existing.consumed_at === null
      this.db.prepare('INSERT INTO chat_runtime_answers (request_id, answers_json, created_at) VALUES (?, ?, ?)').run(requestId, JSON.stringify(answers), this.clock())
      return true
    }).immediate()
  }

  pendingAnswers(): Array<{ requestId: string; answers: Record<string, string> | null; createdAt: number }> {
    return (this.db.prepare('SELECT request_id, answers_json, created_at FROM chat_runtime_answers WHERE consumed_at IS NULL ORDER BY created_at LIMIT 50').all() as Array<{ request_id: string; answers_json: string | null; created_at: number }>)
      .map(row => ({ requestId: row.request_id, answers: row.answers_json ? JSON.parse(row.answers_json) : null, createdAt: row.created_at }))
  }
  /** Reclama la respuesta antes de entregarla al SDK: dos corredores no la aplican dos veces. */
  claimAnswer(requestId: string, workerId: string): boolean {
    return this.db.prepare('UPDATE chat_runtime_answers SET consumed_by = ?, consumed_at = ? WHERE request_id = ? AND consumed_at IS NULL').run(workerId, this.clock(), requestId).changes === 1
  }
  pruneAnswers(maxAgeMs = 24 * 60 * 60 * 1000): void {
    this.db.prepare('DELETE FROM chat_runtime_answers WHERE created_at < ?').run(this.clock() - maxAgeMs)
  }
}
