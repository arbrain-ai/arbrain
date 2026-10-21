/**
 * Inyección a mitad de turno (7 oct 2026, pedido de Daniel: «como Claude Code: le escribo
 * mientras trabaja y lo lee sin que yo lo detenga»).
 *
 * Un mensaje de Daniel que llega con un turno SUYO corriendo en la misma conversación no
 * espera en la fila: queda aquí como `pending`, el worker dueño del turno lo empuja al
 * proceso vivo del motor (Claude: SDKUserMessage con priority 'next', que el CLI pliega en
 * la siguiente frontera de herramienta; Codex: turn/steer) y lo marca `sent`.
 *
 * Nunca se pierde: si el turno termina antes de que el worker lo empuje, o el motor no
 * acepta inyecciones, `release` lo convierte en un turno normal de la fila con LA MISMA
 * identidad (turnId = id de la inyección) y el mismo input congelado. La decisión
 * «inyectar o encolar» se toma en una transacción contra el estado del turno, y `release`
 * corre después de `complete`: SQLite serializa ambas, así que no hay hueco entre procesos.
 */
import Database from 'better-sqlite3'
import { ChatJournal, esTurnoSintetico, type TurnIdentity, type TurnRecord } from './journal.js'

/** unread = Daniel detuvo el turno antes de que el modelo lo leyera: no se reencola solo; el cliente lo
 * devuelve a su fila EN PAUSA (decisión del 7 oct: nunca se descarta, nunca sale sin que él lo decida). */
export type InjectionStatus = 'pending' | 'sent' | 'requeued' | 'unread'
export interface Injection {
  id: string
  target: TurnIdentity
  input: unknown
  status: InjectionStatus
  createdAt: number
  sentAt: number | null
  /** Última herramienta del turno cuando el motor lo tomó: ahí se pinta en la actividad. */
  afterToolId: string | null
}
/** Lo que la web necesita para pintar una inyección dentro de la actividad del turno. */
export interface InjectionView { injectionId: string; message: string; status: InjectionStatus; afterToolId: string | null; at: number }
/** La inyección quedó registrada contra el turno vivo `into`. */
export interface Injected { into: TurnRecord; injection: Injection }

const VIVO = ['dispatching', 'running', 'waiting']

export class ChatInjections {
  constructor(private db: Database.Database, private journal: ChatJournal, private clock: () => number = Date.now) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_runtime_injections (
        injection_id TEXT PRIMARY KEY,
        target_turn_id TEXT NOT NULL REFERENCES chat_runtime_turns(turn_id),
        owner TEXT NOT NULL,
        account TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        input_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','sent','requeued','unread')),
        created_at INTEGER NOT NULL,
        sent_at INTEGER,
        sent_by TEXT,
        after_tool_id TEXT
      );
      CREATE INDEX IF NOT EXISTS chat_runtime_injections_target ON chat_runtime_injections(target_turn_id, status, created_at);
    `)
  }

  /** Lo que el endpoint intenta antes de `accept` cuando el cliente pide «inyectar si se puede».
   * Inyecta solo en un turno HUMANO vivo de la misma conversación. null = no se inyectó y no se
   * escribió nada: quien llama hace el `accept` normal (que además cede los avisos ante Daniel).
   * Idempotente por id: un reintento de una inyección ya registrada devuelve la misma. */
  tryInject(id: TurnIdentity, input: unknown): Injected | null {
    return this.db.transaction((): Injected | null => {
      const previa = this.get(id.turnId)
      if (previa) {
        if (previa.target.owner !== id.owner || previa.target.account !== id.account || previa.target.conversationId !== id.conversationId) throw new Error('Injection id conflicts with an existing request')
        const into = this.journal.get(previa.target)
        // Ya se reencoló: el reintento es el turno normal que nació de ella (accept idempotente).
        if (previa.status === 'requeued') return null
        return { into: into!, injection: previa }
      }
      if (this.journal.get(id)) return null
      const vivo = this.db.prepare(`SELECT turn_id FROM chat_runtime_turns WHERE owner = ? AND account = ? AND conversation_id = ? AND status IN (${VIVO.map(() => '?').join(',')}) ORDER BY created_at DESC LIMIT 1`)
        .get(id.owner, id.account, id.conversationId, ...VIVO) as { turn_id: string } | undefined
      const into = vivo ? this.journal.get({ ...id, turnId: vivo.turn_id }) : null
      // Con mensajes humanos esperando delante, inyectar rompería el orden: va detrás de ellos.
      if (!into || esTurnoSintetico(into.input) || this.journal.cancellationRequested(into) || this.humanoEnFila(id)) return null
      const now = this.clock()
      this.db.prepare(`INSERT INTO chat_runtime_injections (injection_id, target_turn_id, owner, account, conversation_id, input_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .run(id.turnId, into.turnId, id.owner, id.account, id.conversationId, JSON.stringify(input), now)
      return { into, injection: this.get(id.turnId)! }
    }).immediate()
  }

  get(injectionId: string): Injection | null {
    const row = this.db.prepare('SELECT * FROM chat_runtime_injections WHERE injection_id = ?').get(injectionId) as Record<string, unknown> | undefined
    return row ? decode(row) : null
  }

  /** Pendientes de un turno, en orden de llegada. */
  pending(target: Pick<TurnIdentity, 'turnId'>): Injection[] {
    return (this.db.prepare(`SELECT * FROM chat_runtime_injections WHERE target_turn_id = ? AND status = 'pending' ORDER BY created_at, rowid`).all(target.turnId) as Record<string, unknown>[]).map(decode)
  }

  /** Todas las que alcanzaron el turno (para el payload de entrega y la UI). */
  sent(target: TurnIdentity): Injection[] {
    return (this.db.prepare(`SELECT * FROM chat_runtime_injections WHERE target_turn_id = ? AND status = 'sent' ORDER BY sent_at, rowid`).all(target.turnId) as Record<string, unknown>[]).map(decode)
  }

  /** El worker dueño ya la empujó al motor. false = otro la reencoló primero (no se cuenta dos veces).
   * Guarda la última herramienta del turno en ese instante: es «el punto donde el motor lo tomó». */
  markSent(injectionId: string, workerId: string): boolean {
    const row = this.db.prepare('SELECT target_turn_id FROM chat_runtime_injections WHERE injection_id = ?').get(injectionId) as { target_turn_id: string } | undefined
    const afterToolId = row ? this.lastToolId(row.target_turn_id) : null
    return this.db.prepare(`UPDATE chat_runtime_injections SET status = 'sent', sent_at = ?, sent_by = ?, after_tool_id = ? WHERE injection_id = ? AND status = 'pending'`)
      .run(this.clock(), workerId, afterToolId, injectionId).changes === 1
  }

  /** Stop antes de que el modelo las leyera (enviadas o aún pendientes): no se reencolan solas. */
  markUnread(target: Pick<TurnIdentity, 'turnId'>, injectionIds: string[]): Injection[] {
    return this.db.transaction(() => {
      const marked: Injection[] = []
      for (const id of injectionIds) {
        const changed = this.db.prepare(`UPDATE chat_runtime_injections SET status = 'unread' WHERE injection_id = ? AND target_turn_id = ? AND status IN ('pending','sent')`).run(id, target.turnId).changes
        if (changed === 1) marked.push(this.get(id)!)
      }
      return marked
    }).immediate()
  }

  /** Todas las inyecciones de un turno, para el reenganche (`resume_meta`) y la entrega. */
  ofTurn(target: Pick<TurnIdentity, 'turnId'>): InjectionView[] {
    return (this.db.prepare('SELECT * FROM chat_runtime_injections WHERE target_turn_id = ? ORDER BY created_at, rowid').all(target.turnId) as Record<string, unknown>[])
      .map(decode).map(view)
  }

  private lastToolId(turnId: string): string | null {
    const row = this.db.prepare(`SELECT json_extract(event_json, '$.toolId') AS tool FROM chat_runtime_events WHERE turn_id = ? AND json_extract(event_json, '$.type') = 'tool_start' ORDER BY cursor DESC LIMIT 1`).get(turnId) as { tool: string | null } | undefined
    return row?.tool ?? null
  }

  /** El motor no la tomó (turno cerrándose, Codex): vuelve a pendiente para la fila. */
  unmarkSent(injectionId: string): void {
    this.db.prepare(`UPDATE chat_runtime_injections SET status = 'pending', sent_at = NULL, sent_by = NULL WHERE injection_id = ? AND status = 'sent'`).run(injectionId)
  }

  /** El turno terminó con inyecciones sin empujar: cada una vuelve a la fila como turno normal, con su
   * propia identidad e input. Llamar DESPUÉS de cerrar el turno en el journal. Si el turno se detuvo
   * (`stopped`), no salen solas: quedan `unread` y el cliente las ofrece en su fila en pausa. */
  release(target: Pick<TurnIdentity, 'turnId'>, stopped = false): TurnRecord[] {
    if (stopped) { this.markUnread(target, this.pending(target).map(i => i.id)); return [] }
    return this.db.transaction(() => {
      const turnos: TurnRecord[] = []
      for (const injection of this.pending(target)) {
        const changed = this.db.prepare(`UPDATE chat_runtime_injections SET status = 'requeued' WHERE injection_id = ? AND status = 'pending'`).run(injection.id).changes
        if (changed !== 1) continue
        turnos.push(this.journal.accept({ ...injection.target, turnId: injection.id }, injection.input).turn)
      }
      return turnos
    }).immediate()
  }

  private humanoEnFila(id: TurnIdentity): boolean {
    const rows = this.db.prepare(`SELECT input_json FROM chat_runtime_turns WHERE owner = ? AND account = ? AND conversation_id = ? AND status = 'queued'`)
      .all(id.owner, id.account, id.conversationId) as Array<{ input_json: string }>
    return rows.some(row => !esTurnoSintetico(JSON.parse(row.input_json)))
  }
}

export function view(injection: Injection): InjectionView {
  const message = (injection.input as { message?: unknown } | null)?.message
  return { injectionId: injection.id, message: typeof message === 'string' ? message : '', status: injection.status, afterToolId: injection.afterToolId, at: injection.sentAt ?? injection.createdAt }
}

function decode(row: Record<string, unknown>): Injection {
  return {
    id: String(row.injection_id),
    target: { owner: String(row.owner), account: String(row.account), conversationId: String(row.conversation_id), turnId: String(row.target_turn_id) },
    input: JSON.parse(String(row.input_json)),
    status: row.status as InjectionStatus,
    createdAt: Number(row.created_at),
    sentAt: row.sent_at == null ? null : Number(row.sent_at),
    afterToolId: typeof row.after_tool_id === 'string' ? row.after_tool_id : null,
  }
}
