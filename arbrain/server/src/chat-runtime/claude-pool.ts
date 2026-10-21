import type { Options, SDKMessage, Query } from '@anthropic-ai/claude-agent-sdk'
import { createHash } from 'node:crypto'
import { ClaudeInteractiveSession, ClaudeSubmissionCancelled, type ClaudeBackgroundEvent } from './claude-session.js'
import { ClaudeQueryAccounting } from './claude-accounting.js'
import { offerSpontaneous } from './spontaneous.js'

export interface ClaudeTurnScope { owner: string; account: string; conversationId: string; turnId: string }
type Entry = { session: ClaudeInteractiveSession; signature: string; canUseTool: Options['canUseTool']; onBackground: (event: ClaudeBackgroundEvent) => void; lastUsed: number; reserved: boolean; accounting: ClaudeQueryAccounting }
type Lease = { query: Query; events: AsyncIterable<SDKMessage>; session: ClaudeInteractiveSession; release: () => void }
type SessionFactory = (scope: ClaudeTurnScope, options: Options, sink: (event: ClaudeBackgroundEvent) => void) => ClaudeInteractiveSession

/** Process reuse is scoped to the whole conversation identity. Configuration
 * changes replace only an idle process and resume its native transcript; while
 * the process still has background work the message waits in line instead.
 */
export class ClaudeRuntimePool {
  private entries = new Map<string, Entry>()
  inventoryReader(scope: Pick<ClaudeTurnScope, 'owner' | 'account' | 'conversationId'>): { query: Pick<Query, 'accountInfo' | 'supportedCommands' | 'mcpServerStatus'>; isClosed: () => boolean } | undefined {
    const entry = this.entries.get(JSON.stringify([scope.owner, scope.account, scope.conversationId]))
    return entry && !entry.session.closed ? { query: entry.session.query, isClosed: () => entry.session.closed } : undefined
  }
  constructor(private create: SessionFactory = (scope, options, sink) => new ClaudeInteractiveSession(scope, options, sink), private limit = 8) {}

  open(scope: ClaudeTurnScope, options: Options, message: string, onBackground: (event: ClaudeBackgroundEvent) => void, fresh = false): Lease {
    const key = JSON.stringify([scope.owner, scope.account, scope.conversationId])
    const { canUseTool, abortController: _turnAbort, resume: _resume, ...configuration } = options
    // The SDK stamps this into process.env on its first Query. It does not
    // represent a user configuration change or a reason to restart a session.
    if (configuration.env) { configuration.env = { ...configuration.env }; delete configuration.env.CLAUDE_AGENT_SDK_VERSION }
    const signature = createHash('sha256').update(JSON.stringify(configuration)).digest('hex')
    let entry = this.entries.get(key)
    const resume = fresh ? undefined : options.resume ?? entry?.session.sessionId
    // Una respuesta espontánea (despertar) no bloquea: el turno de Daniel espera a que termine dentro de session.turn().
    if (entry && (entry.reserved || entry.session.foregroundBusy)) throw new Error('La conversación Claude todavía está ejecutando un turno.')
    if (entry && (fresh || entry.session.closed || entry.signature !== signature || (options.resume && entry.session.sessionId && options.resume !== entry.session.sessionId))) {
      if (entry.session.hasBackgroundWork || entry.session.backgroundReplyOpen) return this.afterBackground(entry, () => this.open(scope, options, message, onBackground, fresh), options.abortController?.signal)
      entry.session.close(); this.entries.delete(key); entry = undefined
    }
    if (!entry) {
      if (this.entries.size >= this.limit) {
        const idle = [...this.entries.entries()].filter(([, e]) => !e.reserved && !e.session.busy && !e.session.hasBackgroundWork).sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]
        if (!idle) throw new Error('Todos los procesos Claude están ocupados; el trabajo conserva su identidad para reintentarlo.')
        idle[1].session.close(); this.entries.delete(idle[0])
      }
      const current = { signature, canUseTool, onBackground, lastUsed: Date.now(), reserved: false, accounting: new ClaudeQueryAccounting() } as Entry
      current.session = this.create(scope, { ...options, resume, abortController: undefined, canUseTool: async (...args) => {
        if (!current.canUseTool) return { behavior: 'deny', message: 'No hay controlador de permisos para este turno.' }
        return current.canUseTool(...args)
      } }, event => current.onBackground(event))
      // Respuestas que el CLI da solo (avisos, Bash de fondo, despertadores) se vuelven turnos visibles.
      current.session.adopter = reply => offerSpontaneous({ owner: scope.owner, account: scope.account, conversationId: scope.conversationId }, reply, fn => { current.canUseTool = fn })
      entry = current; this.entries.set(key, entry)
    }
    entry.canUseTool = canUseTool; entry.onBackground = onBackground; entry.lastUsed = Date.now(); entry.reserved = true
    const leased = entry
    let released = false
    const release = () => { if (released) return; released = true; leased.session.detach(scope.turnId); leased.reserved = false }
    const events = (async function* () {
      if (released) throw new Error('Claude turn lease already released')
      try {
        for await (const event of leased.session.turn(scope.turnId, message, options.abortController?.signal)) {
          yield event.type === 'result' ? Object.assign({}, event, { arbrainUsage: leased.accounting.observe(event as unknown as Record<string, unknown>) }) : event
        }
      } finally { release() }
    })()
    return { query: entry.session.query, events, session: entry.session, release }
  }
  /** A real configuration change (model, effort, edit) cannot reach subagents that are still
   * running, and restarting would kill them: the message waits in line, reserving the
   * conversation, until they and the CLI's own reply to them finish. Then the normal
   * replacement resumes the native transcript. Cancelling the wait leaves the process alone.
   */
  private afterBackground(entry: Entry, reopen: () => Lease, signal?: AbortSignal): Lease {
    entry.reserved = true
    let inner: Lease | undefined, released = false
    const release = () => { if (released) return; released = true; if (inner) inner.release(); else entry.reserved = false }
    const current = () => inner?.session ?? entry.session
    const query = new Proxy({} as Query, { get: (_target, key) => {
      // Cancelling a waiting message must not interrupt the live process it is waiting for.
      if (key === 'interrupt' && !inner) return async () => undefined
      const q = current().query as unknown as Record<PropertyKey, unknown>, value = q[key]
      return typeof value === 'function' ? value.bind(q) : value
    } })
    const events = (async function* () {
      try {
        let heartbeat = 0
        while (!entry.session.closed && (entry.session.hasBackgroundWork || entry.session.backgroundReplyOpen)) {
          // Re-announced every minute: also keeps the turn's inactivity watchdog from cutting the wait.
          if (heartbeat-- <= 0) { heartbeat = 59; yield { type: 'system', subtype: 'status', status: 'esperando_tareas' } as unknown as SDKMessage }
          if (signal?.aborted || released) throw new ClaudeSubmissionCancelled('Cancelado mientras esperaba a que terminaran las tareas.')
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
        if (signal?.aborted || released) throw new ClaudeSubmissionCancelled('Cancelado mientras esperaba a que terminaran las tareas.')
        entry.reserved = false
        inner = reopen()
        yield* inner.events
      } finally { release() }
    })()
    return { query, events, get session() { return current() }, release }
  }
  invalidate(scope: Pick<ClaudeTurnScope, 'owner' | 'account' | 'conversationId'>): void {
    const key = JSON.stringify([scope.owner, scope.account, scope.conversationId])
    const entry = this.entries.get(key)
    if (!entry) return
    if (entry.reserved || entry.session.busy || entry.session.hasBackgroundWork) throw new Error('Esta conversación todavía tiene trabajo en curso.')
    entry.session.close(); this.entries.delete(key)
  }
  /** Inyección a mitad de turno (7 oct 2026): solo si ESTE proceso corre ahora mismo ese turno.
   * false = no se pudo (otro proceso, turno ya cerrado, respuesta espontánea): va a la fila normal. */
  inject(scope: ClaudeTurnScope, injectionId: string, content: string): boolean {
    const entry = this.entries.get(JSON.stringify([scope.owner, scope.account, scope.conversationId]))
    if (!entry || entry.session.closed) return false
    return entry.session.inject(scope.turnId, injectionId, content)
  }
  /** Desenlace de las inyecciones de un turno ya cerrado en este proceso (leídas / sin leer tras un Stop). */
  injectionOutcome(scope: ClaudeTurnScope): import('./claude-session.js').InjectionOutcome | undefined {
    return this.entries.get(JSON.stringify([scope.owner, scope.account, scope.conversationId]))?.session.injectionOutcome(scope.turnId)
  }
  /** Algún proceso Claude con turno, reserva o tareas de fondo: el corredor no debe retirarse. */
  get busy(): boolean { return [...this.entries.values()].some(e => e.reserved || e.session.busy || e.session.hasBackgroundWork) }
  close(): void { for (const entry of this.entries.values()) entry.session.close(); this.entries.clear() }
}

export const claudeRuntimePool = new ClaudeRuntimePool()
