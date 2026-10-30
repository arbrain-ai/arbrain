import { randomUUID } from 'node:crypto'
import { ChatJournal, type TurnIdentity, type TurnRecord } from './journal.js'
import { view, type ChatInjections, type Injection } from './inyecciones.js'

export class JobRejected extends Error {}

export interface JobResult { payload: unknown; snapshot: unknown; status: 'completed' | 'failed' | 'interrupted' }
export type JobRunner = (turn: TurnRecord, emit: (event: unknown, snapshot?: unknown) => void, signal: AbortSignal) => Promise<JobResult>

/** Owns jobs independently of HTTP observers. Never retries uncertain model/tool execution. */
export class ChatSupervisor {
  private jobs = new Map<string, AbortController>()
  private activeIdentities = new Map<string, TurnIdentity>()
  private listeners = new Map<string, Set<(event: { cursor: number; event: unknown }) => void>>()
  private timer?: ReturnType<typeof setInterval>
  private pumping = false
  private delivering = false
  private stopped = true
  constructor(readonly journal: ChatJournal, private options: {
    workerId: string
    run: JobRunner
    deliver: (payload: unknown) => Promise<boolean>
    workerConfirmedDead: (workerId: string) => boolean
    onError?: (error: unknown) => void
    concurrency?: number
    /** false = este proceso no toma turnos (los ejecuta un corredor aparte); sigue aceptando, cancelando y entregando. */
    canClaim?: () => boolean
    tickMs?: number
    /** Por qué murió un worker ajeno: lo dice el cierre honesto del turno huérfano. */
    deathCause?: (workerId: string) => 'server' | 'reboot' | 'runner'
    /** Revisar huérfanos también en caliente (un corredor puede caer sin que este proceso reinicie). */
    reapEveryMs?: number
    /** Se llama en cada pulso en que este proceso no toma turnos: p. ej. asegurar que haya un corredor. */
    delegate?: () => void
    /** false = no entrega resultados (el corredor deja la entrega al agent-server, que ve los acks del cliente). */
    deliveries?: boolean
    /** Un aviso cedió su lugar a Daniel: se interrumpió y volvió a la fila detrás de él. */
    onCede?: (info: { cedido: string; reencolado: string; conversationId: string }) => void
    /** Inyección a mitad de turno (7 oct 2026). Sin estas dos, todo mensaje nuevo espera en la fila como antes. */
    injections?: ChatInjections
    /** Empuja el mensaje al proceso vivo del motor de ESTE worker. Síncrono: true = el motor lo tomó. */
    inject?: (turn: TurnIdentity, injection: Injection) => boolean
    /** Del turno ya cerrado en el motor: ids inyectados que el modelo no alcanzó a leer (Stop). */
    unreadInjections?: (turn: TurnIdentity) => string[]
  }) {}
  private lastReap = 0

  get workerId(): string { return this.options.workerId }

  /** Turnos que ESTE proceso ejecuta ahora mismo. */
  get activeJobs(): number { return this.jobs.size }

  start(): void {
    if (!this.stopped) return
    this.reap()
    this.stopped = false
    this.timer = setInterval(() => {
      if (this.options.reapEveryMs && Date.now() - this.lastReap >= this.options.reapEveryMs) this.reap()
      void this.pump(); void this.deliver()
    }, this.options.tickMs ?? 1000)
    this.timer.unref()
    void this.pump(); void this.deliver()
  }

  /** Turnos de workers confirmados muertos: incierto y luego interrumpido con lo que alcanzó a salir. */
  reap(): void {
    this.lastReap = Date.now()
    try {
      for (const worker of this.journal.unfinishedWorkers()) {
        if (worker !== this.options.workerId && this.options.workerConfirmedDead(worker)) this.journal.markWorkerStopped(worker)
      }
      // Un turno huérfano de un worker muerto no se reintenta, pero tampoco puede bloquear la conversación.
      const huerfanos = this.journal.interruptOrphanedUncertain(worker => worker !== this.options.workerId && this.options.workerConfirmedDead(worker), this.options.deathCause)
      for (const turnId of huerfanos) this.options.injections?.release({ turnId }, true)
    } catch (error) { this.options.onError?.(error) }
  }

  accept(id: TurnIdentity, input: unknown): { created: boolean; turn: TurnRecord } {
    const accepted = this.journal.accept(id, input)
    if (accepted.created) this.cederADaniel(accepted.turn)
    void this.pump()
    return accepted
  }

  /** Daniel escribió mientras corre un aviso: el aviso se interrumpe limpio (mismo camino que el
   * cancel) y vuelve a la fila detrás de él. Un turno de Daniel nunca se interrumpe por un aviso. */
  private cederADaniel(turn: TurnIdentity): void {
    try {
      const cesion = this.journal.cederADaniel(turn, randomUUID)
      if (!cesion) return
      // Si el aviso corre en este proceso se aborta ya; si corre en un corredor, lo lee de la cancelación en su pulso.
      this.jobs.get(cesion.cedido.turnId)?.abort()
      this.options.onCede?.({ cedido: cesion.cedido.turnId, reencolado: cesion.reencolado.turnId, conversationId: turn.conversationId })
    } catch (error) { this.options.onError?.(error) }
  }

  subscribe(id: TurnIdentity, listener: (event: { cursor: number; event: unknown }) => void): () => void {
    if (!this.journal.get(id)) throw new Error('Turn not found')
    const listeners = this.listeners.get(id.turnId) ?? new Set()
    listeners.add(listener); this.listeners.set(id.turnId, listeners)
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(id.turnId) }
  }

  interrupt(id: TurnIdentity): boolean {
    const { turn, cursor } = this.journal.requestCancellation(id)
    if (cursor !== null) {
      this.publish(id, { cursor, event: { type: 'terminal', status: 'interrupted' } })
      void this.deliver()
    }
    if (!turn || ['completed', 'failed', 'interrupted'].includes(turn.status)) return true
    const job = this.jobs.get(id.turnId)
    // Another worker reads the persisted intent on its next pump. A receipt
    // means cancellation requested, never that an external effect was undone.
    job?.abort()
    return true
  }

  /** Ejecuta un turno que este worker ya reclamó con `journal.adopt` (respuesta espontánea o despertador). */
  runAdopted(turn: TurnRecord): void {
    if (this.jobs.has(turn.turnId)) return
    const ac = new AbortController()
    this.jobs.set(turn.turnId, ac)
    this.activeIdentities.set(turn.turnId, turn)
    void this.execute(turn, ac)
  }

  /** Stops accepting new work in this worker; existing jobs finish and retain ownership. */
  stop(): void { this.stopped = true; clearInterval(this.timer) }

  async pump(): Promise<void> {
    if (this.stopped || this.pumping) return
    this.pumping = true
    try {
      for (const [turnId, ac] of this.jobs) {
        const turn = this.activeIdentities.get(turnId)
        if (turn && this.journal.cancellationRequested(turn)) ac.abort()
        else if (turn) this.injectPending(turn)
      }
      if (this.options.canClaim && !this.options.canClaim()) { this.options.delegate?.(); return }
      const capacity = (this.options.concurrency ?? 8) - this.jobs.size
      if (capacity <= 0) return
      for (const turn of this.journal.queued(capacity)) {
        if (!this.journal.claim(turn, this.options.workerId)) continue
        const ac = new AbortController()
        this.jobs.set(turn.turnId, ac)
        this.activeIdentities.set(turn.turnId, turn)
        void this.execute(turn, ac)
      }
    } catch (error) { this.options.onError?.(error) }
    finally { this.pumping = false }
  }

  /** Lo que Daniel escribió con este turno vivo entra al motor; si el motor no lo toma, espera
   * en la tabla y `release` lo pasa a la fila al cerrar el turno. Nada se pierde ni se duplica. */
  private injectPending(turn: TurnIdentity): void {
    const { injections, inject } = this.options
    if (!injections || !inject) return
    try {
      for (const injection of injections.pending(turn)) {
        // Primero se reclama (pending→sent) y luego se empuja: nunca puede quedar en el motor Y en la fila.
        if (!injections.markSent(injection.id, this.options.workerId)) continue
        if (!inject(turn, injection)) { injections.unmarkSent(injection.id); break } // en orden: si uno no entra, los de atrás tampoco
        const visto = view(injections.get(injection.id) ?? injection)
        const event = { type: 'user_injected', injectionId: visto.injectionId, message: visto.message, afterToolId: visto.afterToolId, at: visto.at }
        const cursor = this.journal.append(turn, `inject:${injection.id}`, event, undefined, true)
        this.publish(turn, { cursor, event })
      }
    } catch (error) { this.options.onError?.(error) }
  }

  /** Inyecciones de un turno para quien se reengancha (resume_meta) o pinta la actividad. */
  injectionsOf(turn: Pick<TurnIdentity, 'turnId'>) { return this.options.injections?.ofTurn(turn) ?? [] }

  /** Antes de cerrar el turno: con Stop, lo que el modelo no leyó (enviado sin plegar o aún pendiente) queda
   * `unread` y se anuncia para que la web lo devuelva a su fila en pausa; lo leído queda como de Daniel. */
  private settleInjections(turn: TurnRecord, status: JobResult['status'], emit: (event: unknown) => void): void {
    const { injections } = this.options
    if (!injections) return
    try {
      const stopped = status === 'interrupted' || this.journal.cancellationRequested(turn)
      const unread = new Set(this.options.unreadInjections?.(turn) ?? [])
      if (stopped) for (const pending of injections.pending(turn)) unread.add(pending.id)
      const sinLeer = injections.markUnread(turn, [...unread]).map(view)
      const todas = injections.ofTurn(turn)
      if (!todas.length) return
      emit({ type: 'injections_settled', leidas: todas.filter(i => i.status === 'sent').map(i => i.injectionId), sinLeer })
    } catch (error) { this.options.onError?.(error) }
  }

  /** Mensajes que el modelo leyó: viajan en su entrega para guardarse como filas de Daniel, en orden. */
  private withInjected(turn: TurnRecord, payload: unknown): unknown {
    const sent = this.options.injections?.sent(turn) ?? []
    if (!sent.length || !payload || typeof payload !== 'object') return payload
    return { ...payload, injectedMessages: sent.map(i => ({ turnId: i.id, message: (i.input as { message?: unknown }).message, sentAt: i.sentAt, afterToolId: i.afterToolId })) }
  }

  private async execute(turn: TurnRecord, ac: AbortController): Promise<void> {
    let sequence = 0
    const emit = (event: unknown, snapshot?: unknown) => {
      // Commit before delivery; a dead socket cannot discard authoritative events.
      const cursor = this.journal.append(turn, `${this.options.workerId}:${++sequence}`, event, snapshot, true)
      this.publish(turn, { cursor, event })
    }
    try {
      this.journal.transition(turn, 'running')
      const result = await this.options.run(turn, emit, ac.signal)
      this.settleInjections(turn, result.status, emit)
      const cursor = this.journal.complete(turn, this.withInjected(turn, result.payload), result.snapshot, result.status, true)
      this.publish(turn, { cursor, event: { type: 'terminal', status: result.status } })
      void this.deliver()
    } catch (error) {
      if (error instanceof JobRejected) {
        try {
          const input = turn.input as Record<string, unknown>
          const snapshot = { status: 'failed', text: '', error: error.message }
          const payload = { chatSessionId: turn.conversationId, turnId: turn.turnId, ownerId: turn.owner, account: turn.account,
            userMessage: input.message, assistantMessage: '', source: input.source, terminalStatus: 'failed', error: error.message, runtimeSnapshot: snapshot }
          emit({ type: 'error', message: error.message }, snapshot)
          const cursor = this.journal.complete(turn, payload, snapshot, 'failed', true)
          this.publish(turn, { cursor, event: { type: 'terminal', status: 'failed' } })
          void this.deliver()
          return
        } catch (storageError) { this.options.onError?.(storageError) }
      }
      // Includes storage failures after a provider accepted work. Never rerun automatically.
      try {
        this.journal.transition(turn, 'uncertain')
        emit({ type: 'execution_uncertain', message: 'No se pudo confirmar el resultado del turno. Se requiere recuperar el estado del motor antes de reenviarlo.' })
      } catch (storageError) { this.options.onError?.(storageError) }
      this.options.onError?.(error)
    } finally {
      this.jobs.delete(turn.turnId)
      this.activeIdentities.delete(turn.turnId)
      // Lo que no alcanzó a entrar al motor vuelve a la fila con su identidad (después de cerrar el turno).
      try { this.options.injections?.release(turn, this.journal.get(turn)?.status === 'interrupted') } catch (error) { this.options.onError?.(error) }
      void this.pump()
    }
  }

  async deliver(): Promise<void> {
    if (this.delivering || this.stopped || this.options.deliveries === false) return
    this.delivering = true
    try {
      for (let n = 0; n < 20; n++) {
        const delivery = this.journal.claimDelivery(this.options.workerId)
        if (!delivery) break
        let ok = false, leaseLost = false
        const heartbeat = setInterval(() => {
          try { leaseLost ||= !this.journal.renewDelivery(delivery.turnId, this.options.workerId, delivery.attempt) }
          catch (error) { leaseLost = true; this.options.onError?.(error) }
        }, 10_000)
        heartbeat.unref()
        try { ok = await this.options.deliver(delivery.payload) }
        catch (error) { this.options.onError?.(error) }
        finally { clearInterval(heartbeat) }
        if (leaseLost) continue
        if (ok) this.journal.acknowledgeDelivery(delivery.turnId, this.options.workerId, delivery.attempt)
        else this.journal.retryDelivery(delivery.turnId, this.options.workerId, delivery.attempt, Math.min(300_000, 1000 * 2 ** Math.min(delivery.attempt, 8)))
      }
    } catch (error) { this.options.onError?.(error) }
    finally { this.delivering = false }
  }

  private publish(id: TurnIdentity, event: { cursor: number; event: unknown }): void {
    for (const listener of this.listeners.get(id.turnId) ?? []) {
      try { listener(event) } catch { /* An observer is not the owner of execution. */ }
    }
  }
}
