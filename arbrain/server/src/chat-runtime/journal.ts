import { DUENO, DUENO_M } from '../dueno.js'
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'

export interface TurnIdentity { owner: string; account: string; conversationId: string; turnId: string }
export type TurnStatus = 'queued' | 'dispatching' | 'running' | 'waiting' | 'uncertain' | 'completed' | 'failed' | 'interrupted'
export interface TurnRecord extends TurnIdentity {
  status: TurnStatus
  input: unknown
  snapshot: unknown
  nativeThreadId: string | null
  nativeTurnId: string | null
  workerId: string | null
  createdAt: number
  updatedAt: number
}
export interface JournalEvent { cursor: number; key: string; event: unknown }
export class JournalConflict extends Error {}
export class JournalCancelled extends JournalConflict {}

const transitions: Record<TurnStatus, TurnStatus[]> = {
  queued: ['dispatching', 'interrupted'],
  dispatching: ['running', 'waiting', 'uncertain', 'failed', 'interrupted', 'completed'],
  running: ['waiting', 'uncertain', 'completed', 'failed', 'interrupted'],
  waiting: ['running', 'uncertain', 'completed', 'failed', 'interrupted'],
  uncertain: ['running', 'waiting', 'completed', 'failed', 'interrupted'],
  completed: [], failed: [], interrupted: [],
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]))
  return value
}
function fingerprint(input: unknown): string { return createHash('sha256').update(JSON.stringify(stable(input))).digest('hex') }
function scope(id: TurnIdentity): string[] { return [id.turnId, id.owner, id.account, id.conversationId] }
const whereScope = 'turn_id = ? AND owner = ? AND account = ? AND conversation_id = ?'

/** Turno que la persona no escribió: aviso del motor (subagente), despertador o respuesta espontánea
 * de Levy (aviso de fondo). Caso del 5 oct: un mensaje humano quedó 3º en fila detrás
 * de dos avisos del motor y esperó 6 min. Desde entonces lo humano va primero (ver `queued`). */
export function esTurnoSintetico(input: unknown): boolean {
  const i = input as { despertador?: unknown; spontaneous?: unknown } | null
  return !!i && typeof i === 'object' && (i.despertador != null || i.spontaneous != null)
}
const sintetico = (alias: string) => `(json_extract(${alias}.input_json, '$.despertador') IS NOT NULL OR json_extract(${alias}.input_json, '$.spontaneous') IS NOT NULL)`
const PREFIJO_REENCOLADO = `[Retomo: este aviso se pausó para atender primero a ${DUENO}]\n`

/** El aviso que cedió su lugar a Daniel vuelve a la fila como turno sintético nuevo, sin perder nada. */
export function reencolarAviso(turn: Pick<TurnRecord, 'turnId' | 'input' | 'createdAt'>): Record<string, unknown> {
  const input = turn.input as Record<string, unknown> & { message?: string; spontaneous?: { label?: string }; despertador?: Record<string, unknown> }
  const base = String(input.message ?? '').replace(PREFIJO_REENCOLADO, '')
  if (input.despertador) return { ...input, message: PREFIJO_REENCOLADO + base, reencolado: { de: turn.turnId } }
  const label = input.spontaneous?.label ?? base
  const { spontaneous: _vivo, ...resto } = input
  return {
    ...resto,
    message: [
      PREFIJO_REENCOLADO.trim(),
      `${DUENO_M} no escribió este mensaje. Mientras respondías a este aviso de segundo plano llegó un mensaje suyo y se atendió primero:`,
      label,
      `El aviso ya está en tu contexto: revisa lo que terminó, decide el siguiente paso y cuéntaselo a ${DUENO} en breve.`,
    ].join('\n'),
    despertador: { id: `s-${turn.turnId.slice(0, 8)}`, texto: label, programadoPara: turn.createdAt, disparo: 1, tipo: 'subagente' },
    reencolado: { de: turn.turnId },
  }
}

/** Qué hay delante de un turno en fila: lo dice la UI en lugar de una espera muda. */
export interface FilaDelante { mensajes: number; avisos: number; pregunta: boolean; cediendo: boolean }

/** Durable acceptance, execution ownership, replay and completion delivery.
 * Uses a supplied connection so production can share its existing transaction/storage boundary.
 * Construction only adds namespaced tables; never rewrites existing conversations.
 */
export class ChatJournal {
  constructor(private db: Database.Database, private clock: () => number = Date.now) {
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_runtime_turns (
        turn_id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        account TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        input_json TEXT NOT NULL,
        snapshot_json TEXT,
        status TEXT NOT NULL CHECK(status IN ('queued','dispatching','running','waiting','uncertain','completed','failed','interrupted')),
        native_thread_id TEXT,
        native_turn_id TEXT,
        worker_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS chat_runtime_single_execution
        ON chat_runtime_turns(owner, account, conversation_id)
        WHERE status IN ('dispatching','running','waiting','uncertain');
      CREATE INDEX IF NOT EXISTS chat_runtime_conversation ON chat_runtime_turns(owner, account, conversation_id);
      CREATE INDEX IF NOT EXISTS chat_runtime_queue ON chat_runtime_turns(status, created_at);
      CREATE TABLE IF NOT EXISTS chat_runtime_cancellations (
        turn_id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        account TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_runtime_events (
        cursor INTEGER PRIMARY KEY AUTOINCREMENT,
        turn_id TEXT NOT NULL REFERENCES chat_runtime_turns(turn_id),
        source_key TEXT NOT NULL,
        event_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(turn_id, source_key)
      );
      CREATE INDEX IF NOT EXISTS chat_runtime_replay ON chat_runtime_events(turn_id, cursor);
      CREATE TABLE IF NOT EXISTS chat_runtime_provider_observations (
        cursor INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL, account TEXT NOT NULL, conversation_id TEXT NOT NULL,
        turn_id TEXT, event_json TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_runtime_provider_scope ON chat_runtime_provider_observations(owner, account, conversation_id, cursor);
      CREATE TABLE IF NOT EXISTS chat_runtime_delivery (
        turn_id TEXT PRIMARY KEY REFERENCES chat_runtime_turns(turn_id),
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        due_at INTEGER NOT NULL,
        lease_owner TEXT,
        lease_until INTEGER,
        delivered_at INTEGER
      );
    `)
  }

  accept(id: TurnIdentity, input: unknown): { created: boolean; turn: TurnRecord } {
    for (const value of scope(id)) if (typeof value !== 'string' || !value.trim()) throw new JournalConflict('Invalid turn identity')
    const hash = fingerprint(input), now = this.clock()
    return this.db.transaction(() => {
      const cancellation = this.db.prepare('SELECT * FROM chat_runtime_cancellations WHERE turn_id = ?').get(id.turnId) as Record<string, unknown> | undefined
      if (cancellation && (cancellation.owner !== id.owner || cancellation.account !== id.account || cancellation.conversation_id !== id.conversationId)) {
        throw new JournalConflict('Turn id conflicts with an existing request')
      }
      const existing = this.db.prepare('SELECT * FROM chat_runtime_turns WHERE turn_id = ?').get(id.turnId) as Record<string, unknown> | undefined
      if (existing) {
        if (existing.owner !== id.owner || existing.account !== id.account || existing.conversation_id !== id.conversationId || existing.fingerprint !== hash) {
          throw new JournalConflict('Turn id conflicts with an existing request')
        }
        return { created: false, turn: this.decode(existing) }
      }
      if (cancellation) throw new JournalCancelled('Turn was cancelled before acceptance')
      this.db.prepare(`INSERT INTO chat_runtime_turns (turn_id, owner, account, conversation_id, fingerprint, input_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`)
        .run(...scope(id), hash, JSON.stringify(input), now, now)
      return { created: true, turn: this.get(id)! }
    }).immediate()
  }

  /** Turno sintético (respuesta espontánea de Levy o despertador), ya reclamado por quien tiene el
   * flujo vivo: entra y se reclama en UNA transacción, para que ningún otro worker lo tome de la cola.
   * null = la conversación tiene otro turno en ejecución; el llamador reintenta después. */
  adopt(id: TurnIdentity, input: unknown, workerId: string, createdAt?: number): TurnRecord | null {
    for (const value of scope(id)) if (typeof value !== 'string' || !value.trim()) throw new JournalConflict('Invalid turn identity')
    if (!workerId) throw new JournalConflict('Worker identity required')
    return this.db.transaction(() => {
      const existing = this.get(id)
      if (existing) return existing.workerId === workerId ? existing : null
      const busy = this.db.prepare(`SELECT 1 FROM chat_runtime_turns WHERE owner = ? AND account = ? AND conversation_id = ? AND status IN ('dispatching','running','waiting','uncertain')`)
        .get(id.owner, id.account, id.conversationId)
      if (busy || this.humanoEsperando(id)) return null
      const now = this.clock()
      this.db.prepare(`INSERT INTO chat_runtime_turns (turn_id, owner, account, conversation_id, fingerprint, input_json, status, worker_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'dispatching', ?, ?, ?)`)
        .run(...scope(id), fingerprint(input), JSON.stringify(input), workerId, createdAt ?? now, now)
      return this.get(id)
    }).immediate()
  }

  get(id: TurnIdentity): TurnRecord | null {
    const row = this.db.prepare(`SELECT * FROM chat_runtime_turns WHERE ${whereScope}`).get(...scope(id)) as Record<string, unknown> | undefined
    return row ? this.decode(row) : null
  }

  /** Late SDK/background events remain durable without rewriting an immutable
   * completed turn. They are projected by the session observer separately.
   */
  observeProvider(scope: Omit<TurnIdentity, 'turnId'>, event: unknown, turnId?: string): number {
    if (turnId && !this.get({ ...scope, turnId })) throw new JournalConflict('Unknown provider observation turn')
    return Number(this.db.prepare('INSERT INTO chat_runtime_provider_observations (owner, account, conversation_id, turn_id, event_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(scope.owner, scope.account, scope.conversationId, turnId ?? null, JSON.stringify(event), this.clock()).lastInsertRowid)
  }

  providerObservations(scope: Omit<TurnIdentity, 'turnId'>, after = 0): Array<{ cursor: number; turnId: string | null; event: unknown }> {
    if (!Number.isSafeInteger(after) || after < 0) throw new JournalConflict('Invalid observation cursor')
    const rows = this.db.prepare('SELECT cursor, turn_id, event_json FROM chat_runtime_provider_observations WHERE owner = ? AND account = ? AND conversation_id = ? AND cursor > ? ORDER BY cursor LIMIT 500')
      .all(scope.owner, scope.account, scope.conversationId, after) as Array<{ cursor: number; turn_id: string | null; event_json: string }>
    return rows.map(row => ({ cursor: row.cursor, turnId: row.turn_id, event: JSON.parse(row.event_json) }))
  }

  /**
   * Cierra como `interrupted` los turnos `uncertain` cuyo worker está confirmado muerto (daemon
   * reiniciado a media respuesta, 27 sep 2026). Nunca re-ejecuta el modelo: solo libera la
   * conversación, que de otro modo queda trabada para siempre detrás de ese turno.
   * Retoma honesta (daemon-levy, 1 oct): lo que el modelo alcanzó a escribir se conserva tal
   * cual, reconstruido de los eventos durables, y se dice qué se perdió y por qué.
   */
  interruptOrphanedUncertain(workerConfirmedDead: (workerId: string) => boolean, cause: (workerId: string) => 'server' | 'reboot' | 'runner' = () => 'server'): string[] {
    const rows = this.db.prepare(`SELECT turn_id, owner, account, conversation_id, worker_id FROM chat_runtime_turns WHERE status = 'uncertain' AND worker_id IS NOT NULL`)
      .all() as Array<{ turn_id: string; owner: string; account: string; conversation_id: string; worker_id: string }>
    const closed: string[] = []
    for (const row of rows) {
      if (!workerConfirmedDead(row.worker_id)) continue
      const id: TurnIdentity = { turnId: row.turn_id, owner: row.owner, account: row.account, conversationId: row.conversation_id }
      const turn = this.get(id)
      if (!turn || turn.status !== 'uncertain') continue
      const input = turn.input as Record<string, unknown>
      const partial = this.partialText(id)
      const kind = cause(row.worker_id)
      const why = kind === 'reboot' ? 'El Mac se reinició' : kind === 'runner' ? 'Se cayó el proceso que ejecutaba la respuesta' : 'El servidor se reinició'
      const error = partial
        ? `${why} mientras Levy respondía. Arriba queda lo que alcanzó a escribir; lo demás se perdió y no se reconstruye. Reenvía el mensaje para retomarlo.`
        : `${why} mientras se generaba esta respuesta. Reenvía el mensaje si la necesitas.`
      const text = partial ? `${partial}\n\n_(${error})_` : ''
      const snapshot = { status: 'interrupted', text, error }
      const payload = { chatSessionId: turn.conversationId, turnId: turn.turnId, ownerId: turn.owner, account: turn.account,
        userMessage: input.message, assistantMessage: text, source: input.source, terminalStatus: 'interrupted', error, runtimeSnapshot: snapshot }
      this.complete(id, payload, snapshot, 'interrupted', true)
      closed.push(row.turn_id)
    }
    return closed
  }

  /** Texto visible que el modelo ya emitió en este turno, según el journal (no el snapshot, que va por lotes). */
  partialText(id: TurnIdentity): string {
    const rows = this.db.prepare(`SELECT event_json FROM chat_runtime_events WHERE turn_id = ? AND json_extract(event_json, '$.type') IN ('text_delta','result') ORDER BY cursor`)
      .all(id.turnId) as Array<{ event_json: string }>
    let text = ''
    for (const row of rows) {
      const event = JSON.parse(row.event_json) as { type: string; text?: string }
      if (event.type === 'result' && typeof event.text === 'string') text = event.text
      else if (event.type === 'text_delta' && typeof event.text === 'string') text += event.text
    }
    return text.trim()
  }

  /** Records intent even if the original HTTP send has not arrived. The same
   * identity can never start later; this does not claim running effects stopped.
   * Queued cancellation and its delivery are committed in the same transaction.
   */
  requestCancellation(id: TurnIdentity): { turn: TurnRecord | null; cursor: number | null } {
    for (const value of scope(id)) if (typeof value !== 'string' || !value.trim()) throw new JournalConflict('Invalid turn identity')
    return this.db.transaction(() => {
      for (const table of ['chat_runtime_turns', 'chat_runtime_cancellations']) {
        const existing = this.db.prepare(`SELECT owner, account, conversation_id FROM ${table} WHERE turn_id = ?`).get(id.turnId) as Record<string, unknown> | undefined
        if (existing && (existing.owner !== id.owner || existing.account !== id.account || existing.conversation_id !== id.conversationId)) throw new JournalConflict('Turn id conflicts with an existing request')
      }
      this.db.prepare('INSERT OR IGNORE INTO chat_runtime_cancellations (turn_id, owner, account, conversation_id, created_at) VALUES (?, ?, ?, ?, ?)').run(...scope(id), this.clock())
      const turn = this.get(id)
      if (turn?.status !== 'queued') return { turn, cursor: null }
      const input = turn.input as Record<string, unknown>
      const snapshot = { status: 'interrupted', text: '', error: null }
      const payload = { chatSessionId: turn.conversationId, turnId: turn.turnId, ownerId: turn.owner, account: turn.account,
        userMessage: input.message, assistantMessage: '', source: input.source, terminalStatus: 'interrupted', runtimeSnapshot: snapshot }
      const cursor = this.complete(id, payload, snapshot, 'interrupted', true)
      return { turn: this.get(id), cursor }
    }).immediate()
  }

  cancellationRequested(id: TurnIdentity): boolean {
    return !!this.db.prepare(`SELECT 1 FROM chat_runtime_cancellations WHERE ${whereScope}`).get(...scope(id))
  }

  /** ¿Otro turno de la misma conversación ocupa la ejecución? Entonces este espera en fila detrás de él. */
  waitsBehindAnother(id: TurnIdentity): boolean {
    return !!this.db.prepare(`SELECT 1 FROM chat_runtime_turns WHERE owner = ? AND account = ? AND conversation_id = ? AND turn_id != ?
      AND status IN ('dispatching','running','waiting','uncertain') LIMIT 1`).get(id.owner, id.account, id.conversationId, id.turnId)
  }

  latest(owner: string, account: string, conversationId: string): TurnRecord | null {
    const row = this.db.prepare(`SELECT * FROM chat_runtime_turns WHERE owner = ? AND account = ? AND conversation_id = ? ORDER BY CASE WHEN status IN ('running','dispatching','waiting','uncertain') THEN 0 ELSE 1 END, created_at DESC, rowid DESC LIMIT 1`).get(owner, account, conversationId) as Record<string, unknown> | undefined
    return row ? this.decode(row) : null
  }

  /** Conversaciones del dueño con un turno sin terminar (1 oct 2026), para el semáforo del sidebar:
   * UNA consulta indexada por dueño en lugar de un /chat/turn por conversación. `waiting` = Levy
   * espera una respuesta tuya (AskUserQuestion). Un turno `queued` también cuenta: el usuario ya
   * envió y la respuesta está pendiente. Si hubiera más de uno por conversación gana el más avanzado.
   * `maxAgeMs`: un turno que lleva horas «en curso» es un zombi que nadie ha cerrado (medido: 33
   * turnos failed/interrupted quedaron abiertos hasta 12 días antes de que el reaper los cerrara; el
   * más largo que terminó bien duró 55 min). El semáforo no debe pulsar por él. */
  activeTurns(owner: string, maxAgeMs = 3 * 60 * 60_000): Array<{ account: string; conversationId: string; turnId: string; status: TurnStatus; createdAt: number; updatedAt: number }> {
    const rows = this.db.prepare(`SELECT turn_id, account, conversation_id, status, created_at, updated_at FROM chat_runtime_turns
      WHERE owner = ? AND created_at >= ? AND status IN ('queued','dispatching','running','waiting','uncertain')
      ORDER BY CASE WHEN status = 'queued' THEN 1 ELSE 0 END, created_at DESC, rowid DESC LIMIT 500`).all(owner, this.clock() - maxAgeMs) as Array<Record<string, unknown>>
    const seen = new Set<string>(), out = []
    for (const row of rows) {
      const key = `${row.account}\u0000${row.conversation_id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ account: String(row.account), conversationId: String(row.conversation_id), turnId: String(row.turn_id), status: row.status as TurnStatus, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) })
    }
    return out
  }

  /** Conversaciones solo-SDK (`sdk:<uuid>`, sin fila en Mission Control) que Arbrain SÍ conduce (1 oct 2026).
   * El pool de transcripts (~/.claude) es el mismo que usan Claude Desktop, Claude Code y los crons, así que
   * listarlo mezcla conversaciones ajenas; el journal solo tiene turnos enviados desde Arbrain. Ese es el
   * criterio para mostrarlas en «Recientes» y «Ver todas» sin volver a llenar la lista de ruido.
   * `lastActivityAt`: fin del último turno completado; un turno que no terminó cuenta por su inicio (los
   * zombis que el reaper cierra días después no deben hacer pasar por reciente una conversación vieja). */
  sdkConversations(owner: string, limit = 100): Array<{ account: string; conversationId: string; firstPrompt: string | null; turns: number; firstTurnAt: number; lastActivityAt: number }> {
    // Fuera las `sdk:X` cuyo X ya es el hilo nativo de una conversación de Mission Control: son la sombra de
    // esa conversación, no otra (1 oct 2026: las tres con turnos lo eran; un mensaje escrito por la copia
    // de una conversación no se guardó, porque /api/chat/complete salta las `sdk:`). Aviso de otra sesión de Levy.
    const rows = this.db.prepare(`SELECT account, conversation_id, COUNT(*) AS turns, MIN(created_at) AS first_at,
        MAX(CASE WHEN status = 'completed' THEN updated_at ELSE created_at END) AS last_at
      FROM chat_runtime_turns WHERE owner = ? AND conversation_id LIKE 'sdk:%'
        AND substr(conversation_id, 5) NOT IN (SELECT native_thread_id FROM chat_runtime_turns
          WHERE owner = ? AND conversation_id NOT LIKE 'sdk:%' AND native_thread_id IS NOT NULL)
      GROUP BY account, conversation_id ORDER BY last_at DESC LIMIT ?`).all(owner, owner, Math.max(1, Math.min(limit, 200))) as Array<Record<string, unknown>>
    const primero = this.db.prepare(`SELECT input_json FROM chat_runtime_turns WHERE owner = ? AND account = ? AND conversation_id = ? ORDER BY created_at, rowid LIMIT 1`)
    return rows.map(row => {
      let firstPrompt: string | null = null
      try {
        const input = JSON.parse(String((primero.get(owner, row.account, row.conversation_id) as { input_json?: string } | undefined)?.input_json ?? '{}')) as { message?: unknown }
        if (typeof input.message === 'string' && input.message.trim()) firstPrompt = input.message.slice(0, 200)
      } catch { /* sin input legible: el cliente pone un título genérico */ }
      return { account: String(row.account), conversationId: String(row.conversation_id), firstPrompt, turns: Number(row.turns), firstTurnAt: Number(row.first_at), lastActivityAt: Number(row.last_at) }
    })
  }

  /** Next eligible turn per conversation; blocked conversations do not starve others.
   * Lo humano antes que lo sintético aunque el aviso se haya creado antes; entre iguales, orden de llegada. */
  queued(limit = 8): TurnRecord[] {
    const rows = this.db.prepare(`SELECT t.* FROM chat_runtime_turns t
      WHERE t.status = 'queued'
        AND NOT EXISTS (SELECT 1 FROM chat_runtime_turns a WHERE a.owner = t.owner AND a.account = t.account AND a.conversation_id = t.conversation_id AND a.status IN ('dispatching','running','waiting','uncertain'))
        AND t.rowid = (SELECT q.rowid FROM chat_runtime_turns q WHERE q.owner = t.owner AND q.account = t.account AND q.conversation_id = t.conversation_id AND q.status = 'queued'
          ORDER BY ${sintetico('q')}, q.rowid LIMIT 1)
      ORDER BY ${sintetico('t')}, t.created_at, t.rowid LIMIT ?`).all(Math.max(1, Math.min(limit, 100))) as Record<string, unknown>[]
    return rows.map(row => this.decode(row))
  }

  /** ¿Hay un mensaje de Daniel esperando en esta conversación? `activos`: cuenta también uno ya reclamado
   * (`dispatching`/`running`): si una respuesta espontánea del CLI sigue sin turno, ese mensaje está
   * bloqueado detrás de ella en la sesión, porque el proceso no atiende dos a la vez. */
  humanoEsperando(scope: Omit<TurnIdentity, 'turnId'>, activos = false): boolean {
    return !!this.db.prepare(`SELECT 1 FROM chat_runtime_turns t WHERE t.owner = ? AND t.account = ? AND t.conversation_id = ?
      AND t.status IN (${activos ? "'queued','dispatching','running'" : "'queued'"}) AND NOT ${sintetico('t')} LIMIT 1`)
      .get(scope.owner, scope.account, scope.conversationId)
  }

  /**
   * Daniel escribió (turno humano recién aceptado): el turno sintético que corre en su conversación
   * cede. Se pide su cancelación (el worker dueño la lee en su pulso, como el cancel existente) y el
   * aviso vuelve a la fila detrás de Daniel. Nunca toca un turno humano ni uno que espera respuesta
   * a una pregunta (`waiting`). Idempotente: un aviso ya cedido no se reencola dos veces.
   */
  cederADaniel(human: TurnIdentity, newTurnId: () => string): { cedido: TurnRecord; reencolado: TurnRecord } | null {
    return this.db.transaction(() => {
      const turn = this.get(human)
      if (!turn || turn.status !== 'queued' || esTurnoSintetico(turn.input)) return null
      const row = this.db.prepare(`SELECT t.* FROM chat_runtime_turns t WHERE t.owner = ? AND t.account = ? AND t.conversation_id = ?
        AND t.status IN ('dispatching','running') AND ${sintetico('t')}
        AND NOT EXISTS (SELECT 1 FROM chat_runtime_cancellations c WHERE c.turn_id = t.turn_id) LIMIT 1`)
        .get(human.owner, human.account, human.conversationId) as Record<string, unknown> | undefined
      if (!row) return null
      const cedido = this.decode(row)
      this.db.prepare('INSERT OR IGNORE INTO chat_runtime_cancellations (turn_id, owner, account, conversation_id, created_at) VALUES (?, ?, ?, ?, ?)').run(...scope(cedido), this.clock())
      const { turn: reencolado } = this.accept({ owner: cedido.owner, account: cedido.account, conversationId: cedido.conversationId, turnId: newTurnId() }, reencolarAviso(cedido))
      return { cedido, reencolado }
    }).immediate()
  }

  /** Lo que tiene delante un turno en fila, con el mismo orden que usa `queued`. */
  filaDelante(id: TurnIdentity): FilaDelante | null {
    const turn = this.get(id)
    if (!turn || turn.status !== 'queued') return null
    const mio = (this.db.prepare(`SELECT rowid AS r FROM chat_runtime_turns WHERE ${whereScope}`).get(...scope(id)) as { r: number }).r
    const soySintetico = esTurnoSintetico(turn.input) ? 1 : 0
    const rows = this.db.prepare(`SELECT t.turn_id, t.status, ${sintetico('t')} AS sint,
        EXISTS (SELECT 1 FROM chat_runtime_cancellations c WHERE c.turn_id = t.turn_id) AS cancelado
      FROM chat_runtime_turns t WHERE t.owner = ? AND t.account = ? AND t.conversation_id = ? AND t.turn_id != ?
        AND (t.status IN ('dispatching','running','waiting','uncertain')
          OR (t.status = 'queued' AND (${sintetico('t')} < ? OR (${sintetico('t')} = ? AND t.rowid < ?))))`)
      .all(id.owner, id.account, id.conversationId, id.turnId, soySintetico, soySintetico, mio) as Array<{ status: TurnStatus; sint: number; cancelado: number }>
    const fila: FilaDelante = { mensajes: 0, avisos: 0, pregunta: false, cediendo: false }
    for (const row of rows) {
      if (row.status === 'waiting') fila.pregunta = true
      if (row.status !== 'queued' && row.sint && row.cancelado) { fila.cediendo = true; continue }
      if (row.sint) fila.avisos++
      else fila.mensajes++
    }
    return fila
  }

  unfinishedWorkers(): string[] {
    return (this.db.prepare(`SELECT DISTINCT worker_id FROM chat_runtime_turns WHERE worker_id IS NOT NULL AND status IN ('dispatching','running','waiting')`).all() as Array<{ worker_id: string }>).map(row => row.worker_id)
  }

  /** Claim BEFORE calling a provider. No automatic lease expiry/re-execution for model operations. */
  claim(id: TurnIdentity, workerId: string): boolean {
    if (!workerId) throw new JournalConflict('Worker identity required')
    return this.db.transaction(() => {
      const turn = this.require(id)
      if (turn.status !== 'queued') return false
      const active = this.db.prepare(`SELECT turn_id FROM chat_runtime_turns WHERE owner = ? AND account = ? AND conversation_id = ? AND status IN ('dispatching','running','waiting','uncertain')`)
        .get(id.owner, id.account, id.conversationId)
      if (active) return false
      this.db.prepare(`UPDATE chat_runtime_turns SET status = 'dispatching', worker_id = ?, updated_at = ? WHERE ${whereScope}`)
        .run(workerId, this.clock(), ...scope(id))
      return true
    }).immediate()
  }

  bindNative(id: TurnIdentity, nativeThreadId: string, nativeTurnId?: string): void {
    if (typeof nativeThreadId !== 'string' || !nativeThreadId.trim()) throw new JournalConflict('Native thread identity required')
    if (nativeTurnId !== undefined && (typeof nativeTurnId !== 'string' || !nativeTurnId.trim())) throw new JournalConflict('Invalid native turn identity')
    this.db.transaction(() => {
      const turn = this.require(id)
      if ((turn.nativeThreadId !== null && turn.nativeThreadId !== nativeThreadId) || (turn.nativeTurnId !== null && nativeTurnId !== undefined && turn.nativeTurnId !== nativeTurnId)) {
        throw new JournalConflict('Native identity cannot change after binding')
      }
      this.db.prepare(`UPDATE chat_runtime_turns SET native_thread_id = ?, native_turn_id = COALESCE(?, native_turn_id), updated_at = ? WHERE ${whereScope}`)
        .run(nativeThreadId, nativeTurnId ?? null, this.clock(), ...scope(id))
    }).immediate()
  }

  cancelQueued(id: TurnIdentity, payload: unknown, snapshot: unknown): number | null {
    return this.db.transaction(() => {
      if (this.require(id).status !== 'queued') return null
      return this.complete(id, payload, snapshot, 'interrupted', true)
    }).immediate()
  }

  transition(id: TurnIdentity, next: TurnStatus): void {
    this.db.transaction(() => {
      const current = this.require(id).status
      if (current === next) return
      if (!transitions[current].includes(next)) throw new JournalConflict(`Invalid transition ${current} -> ${next}`)
      this.db.prepare(`UPDATE chat_runtime_turns SET status = ?, updated_at = ? WHERE ${whereScope}`).run(next, this.clock(), ...scope(id))
    }).immediate()
  }

  /** Call only after the host verifies this worker stopped, not because an HTTP observation timed out. */
  markWorkerStopped(workerId: string): number {
    return this.db.prepare(`UPDATE chat_runtime_turns SET status = 'uncertain', updated_at = ? WHERE worker_id = ? AND status IN ('dispatching','running','waiting')`)
      .run(this.clock(), workerId).changes
  }

  append(id: TurnIdentity, sourceKey: string, event: unknown, snapshot?: unknown, withCursor = false): number {
    if (!sourceKey) throw new JournalConflict('Event identity required')
    return this.db.transaction(() => {
      const turn = this.require(id)
      const encoded = JSON.stringify(event)
      const old = this.db.prepare('SELECT cursor, event_json FROM chat_runtime_events WHERE turn_id = ? AND source_key = ?').get(id.turnId, sourceKey) as { cursor: number; event_json: string } | undefined
      if (old) {
        if (old.event_json !== encoded) throw new JournalConflict('Event id reused with different content')
        return old.cursor
      }
      if (transitions[turn.status].length === 0) throw new JournalConflict('Cannot append new events to a terminal turn')
      const inserted = this.db.prepare('INSERT INTO chat_runtime_events (turn_id, source_key, event_json, created_at) VALUES (?, ?, ?, ?)')
        .run(id.turnId, sourceKey, encoded, this.clock())
      if (snapshot !== undefined) this.db.prepare(`UPDATE chat_runtime_turns SET snapshot_json = ?, updated_at = ? WHERE ${whereScope}`).run(JSON.stringify(withCursor ? { cursor: Number(inserted.lastInsertRowid), state: snapshot } : snapshot), this.clock(), ...scope(id))
      return Number(inserted.lastInsertRowid)
    }).immediate()
  }

  events(id: TurnIdentity, after = 0, limit = 500): JournalEvent[] {
    this.require(id)
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1) throw new JournalConflict('Invalid replay cursor or page size')
    const rows = this.db.prepare('SELECT cursor, source_key, event_json FROM chat_runtime_events WHERE turn_id = ? AND cursor > ? ORDER BY cursor LIMIT ?')
      .all(id.turnId, after, Math.min(limit, 500)) as Array<{ cursor: number; source_key: string; event_json: string }>
    return rows.map(row => ({ cursor: row.cursor, key: row.source_key, event: JSON.parse(row.event_json) }))
  }

  /** Terminal state, full snapshot and outbox become visible atomically, including on retry. */
  complete(id: TurnIdentity, payload: unknown, snapshot: unknown, status: 'completed' | 'failed' | 'interrupted' = 'completed', withCursor = false): number {
    return this.db.transaction(() => {
      const existing = this.db.prepare('SELECT payload_json FROM chat_runtime_delivery WHERE turn_id = ?').get(id.turnId) as { payload_json: string } | undefined
      this.require(id)
      if (existing) {
        if (existing.payload_json !== JSON.stringify(payload)) throw new JournalConflict('Completion payload is immutable')
        return (this.db.prepare("SELECT cursor FROM chat_runtime_events WHERE turn_id = ? AND source_key = 'terminal'").get(id.turnId) as { cursor: number }).cursor
      }
      const cursor = this.append(id, 'terminal', { type: 'terminal', status }, snapshot, withCursor)
      this.transition(id, status)
      this.db.prepare('INSERT INTO chat_runtime_delivery (turn_id, payload_json, due_at) VALUES (?, ?, ?)').run(id.turnId, JSON.stringify(payload), this.clock())
      return cursor
    }).immediate()
  }

  claimDelivery(workerId: string, leaseMs = 30_000): { turnId: string; payload: unknown; attempt: number } | null {
    if (!workerId || leaseMs <= 0) throw new JournalConflict('Invalid delivery lease')
    return this.db.transaction(() => {
      const now = this.clock()
      const row = this.db.prepare(`SELECT d.turn_id, d.payload_json, d.attempts, t.created_at AS started_at FROM chat_runtime_delivery d JOIN chat_runtime_turns t ON t.turn_id = d.turn_id
        WHERE d.delivered_at IS NULL AND d.due_at <= ? AND (d.lease_until IS NULL OR d.lease_until <= ?)
          AND NOT EXISTS (SELECT 1 FROM chat_runtime_turns earlier WHERE earlier.owner = t.owner AND earlier.account = t.account AND earlier.conversation_id = t.conversation_id AND earlier.rowid < t.rowid AND
            (earlier.status IN ('queued','dispatching','running','waiting','uncertain') OR EXISTS (SELECT 1 FROM chat_runtime_delivery pending WHERE pending.turn_id = earlier.turn_id AND pending.delivered_at IS NULL)))
        ORDER BY d.due_at, t.rowid LIMIT 1`)
        .get(now, now) as { turn_id: string; payload_json: string; attempts: number; started_at: number } | undefined
      if (!row) return null
      this.db.prepare('UPDATE chat_runtime_delivery SET lease_owner = ?, lease_until = ?, attempts = attempts + 1 WHERE turn_id = ?')
        .run(workerId, now + leaseMs, row.turn_id)
      // `startedAt` (1 oct 2026): cuándo EMPEZÓ el turno, no cuándo terminó. El webhook inserta las filas al
      // completar, y con ese created_at un turno largo (o interrumpido por «Enviar ya») caía DESPUÉS del
      // siguiente turno al ordenar. Se agrega aquí, al reclamar, porque el payload guardado es inmutable
      // (`complete()` compara el JSON) y created_at del turno ya vive en esta misma fila del journal.
      const payload = JSON.parse(row.payload_json) as unknown
      const conInicio = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? { ...(payload as Record<string, unknown>), startedAt: row.started_at }
        : payload
      return { turnId: row.turn_id, payload: conInicio, attempt: row.attempts + 1 }
    }).immediate()
  }

  renewDelivery(turnId: string, workerId: string, attempt: number, leaseMs = 30_000): boolean {
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new JournalConflict('Invalid delivery lease')
    const now = this.clock()
    return this.db.prepare('UPDATE chat_runtime_delivery SET lease_until = ? WHERE turn_id = ? AND lease_owner = ? AND attempts = ? AND delivered_at IS NULL AND lease_until > ?')
      .run(now + leaseMs, turnId, workerId, attempt, now).changes === 1
  }

  acknowledgeDelivery(turnId: string, workerId: string, attempt: number): boolean {
    return this.db.prepare('UPDATE chat_runtime_delivery SET delivered_at = ?, lease_owner = NULL, lease_until = NULL WHERE turn_id = ? AND lease_owner = ? AND attempts = ? AND delivered_at IS NULL AND lease_until > ?')
      .run(this.clock(), turnId, workerId, attempt, this.clock()).changes === 1
  }

  retryDelivery(turnId: string, workerId: string, attempt: number, delayMs: number): boolean {
    if (delayMs < 0 || !Number.isFinite(delayMs)) throw new JournalConflict('Invalid retry delay')
    return this.db.prepare('UPDATE chat_runtime_delivery SET due_at = ?, lease_owner = NULL, lease_until = NULL WHERE turn_id = ? AND lease_owner = ? AND attempts = ? AND delivered_at IS NULL AND lease_until > ?')
      .run(this.clock() + delayMs, turnId, workerId, attempt, this.clock()).changes === 1
  }

  private require(id: TurnIdentity): TurnRecord {
    const turn = this.get(id)
    if (!turn) throw new JournalConflict('Turn not found in this conversation')
    return turn
  }

  private decode(row: Record<string, unknown>): TurnRecord {
    return {
      owner: String(row.owner), account: String(row.account), conversationId: String(row.conversation_id), turnId: String(row.turn_id),
      status: row.status as TurnStatus, input: JSON.parse(String(row.input_json)), snapshot: row.snapshot_json ? JSON.parse(String(row.snapshot_json)) : null,
      nativeThreadId: row.native_thread_id as string | null, nativeTurnId: row.native_turn_id as string | null, workerId: row.worker_id as string | null,
      createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    }
  }
}
