import { query, type Options, type Query, type SDKMessage, type SDKUserMessage, type AccountInfo } from '@anthropic-ai/claude-agent-sdk'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { DEFAULT_ACCOUNT_CONFIG_DIR } from '../config.js'
import { esEdicionCliente } from '../edicion.js'
import { dirClaudeAlternaO } from '../cuentas-alternas.js'

class Mailbox<T> implements AsyncIterable<T> {
  private values: T[] = []
  private wake?: () => void
  private ended = false
  private failure?: Error
  constructor(private limit = 10_000) {}
  push(value: T): void {
    if (this.ended) throw new Error('Session channel is closed')
    if (this.values.length >= this.limit) throw new Error('Session observer capacity exceeded')
    this.values.push(value); this.wake?.()
  }
  end(error?: Error): void { this.ended = true; this.failure ??= error; this.wake?.() }
  drain(): T[] { return this.values.splice(0) }
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      if (this.values.length) { yield this.values.shift()!; continue }
      if (this.failure) throw this.failure
      if (this.ended) return
      await new Promise<void>(resolve => { this.wake = resolve })
      this.wake = undefined
    }
  }
}

const BACKGROUND_SILENCE_MS = 30 * 60_000
/** Tras un Stop, cuánto se espera a que el CLI corra (y se detenga) lo inyectado que tenía en cola. */
const STOP_DRAIN_MS = 5_000

/** esperando = en la cola del CLI; leido = un result lo consumió; sin_leer = Stop antes de que el modelo lo leyera. */
export type InjectionState = 'esperando' | 'leido' | 'sin_leer'
export interface InjectionOutcome { leidos: string[]; sinLeer: string[] }

export class ClaudeExecutionUncertain extends Error {}
export class ClaudeSubmissionCancelled extends Error {}
export type ClaudeBackgroundEvent = { type: 'message'; message: SDKMessage; turnId?: string } | { type: 'uncertain'; turnId: string; error: string }
/** Respuesta que el CLI da por su cuenta (aviso de subagente, Bash de fondo que terminó, despertador):
 * nadie la pidió con un turno, pero es una respuesta completa de Levy y debe verse. */
export interface ClaudeSpontaneousReply {
  /** UUID propio del turno sintético (el del CLI no lo controlamos). */
  id: string
  /** Mensajes de la respuesta, de su primer evento al `result`. */
  events: AsyncIterable<SDKMessage>
  /** Por qué despertó: avisos de tareas que llegaron justo antes (pueden ser 0). */
  prelude: SDKMessage[]
  startedAt: number
  interrupt: () => Promise<void>
  /** Resuelve al cerrar la respuesta (result o caída del proceso). */
  done: Promise<void>
}
/** Devuelve true si alguien se hace cargo de la respuesta; false = sigue el camino viejo (sink de fondo). */
export type SpontaneousAdopter = (reply: ClaudeSpontaneousReply) => boolean
/** «Solo suscripción» es regla de la instalación original (nunca cobrar API por accidente). En la edición cliente el
 * alumno trae su llave (API de Anthropic, OpenRouter o su sesión de Claude; contrato §4): cualquiera vale, y sin llave
 * el daemon ya respondió `falta_llave` antes de llegar aquí (11 oct 2026, hallado por la evidencia del .app). */
export function requireClaudeSubscription(account: AccountInfo, cliente = esEdicionCliente()): void {
  if (cliente) return
  if (account.apiProvider !== 'firstParty' || !account.subscriptionType || account.tokenSource === 'none' || (account.apiKeySource && account.apiKeySource !== 'none')) {
    throw new Error('La sesión no confirmó autenticación por suscripción Claude. No se envió ningún prompt.')
  }
}

/** One long-lived SDK process, one explicit foreground turn at a time. The
 * supervisor owns queued work; this adapter never silently coalesces user sends.
 * Idle/background messages have a separate sink instead of contaminating the
 * next foreground turn. Consumer detachment does not close the native process.
 */
export class ClaudeInteractiveSession {
  readonly query: Query
  private input = new Mailbox<SDKUserMessage>(8)
  private background = new Mailbox<ClaudeBackgroundEvent>()
  /** Caller must journal/drain this when no explicit background sink was supplied. */
  readonly backgroundEvents: AsyncIterable<ClaudeBackgroundEvent> = this.background
  private active?: { id: string; output: Mailbox<SDKMessage>; terminal: boolean; submitted: boolean; detached: boolean; observer: AbortController; spontaneous?: { finish: () => void; done: Promise<void> }
    /** Mensajes de Daniel inyectados a mitad de turno (7 oct 2026): uuid → si el modelo ya lo leyó. */
    injected?: Map<string, InjectionState>
    /** Result retenido mientras falta consumir alguna inyección (sale si el CLI ya no la corre). */
    held?: SDKMessage
    heldTimer?: ReturnType<typeof setTimeout>
    /** Daniel detuvo el turno: lo inyectado que el CLI aún no plegó no debe correr después del Stop. */
    stopping?: Set<string>
    /** Texto de los result intermedios (inyección que llegó tarde): el result final los lleva delante. */
    partials?: string[] }
  /** Avisos de tareas de fondo sin turno desde el último result: explican por qué el CLI despierta. */
  private prelude: SDKMessage[] = []
  /** Quien convierte las respuestas espontáneas en turnos visibles (lo fija el pool). */
  adopter?: SpontaneousAdopter
  private ended = false
  private failure?: Error
  private initialization: Promise<void>
  private initMessage?: SDKMessage
  private nativeSessionId?: string
  private replyOwner?: string
  private taskOwners = new Map<string, string>()
  private toolOwners = new Map<string, string>()
  private backgroundTasks = new Set<string>()
  /** The CLI answers a task notification on its own (init … result) outside any foreground turn. */
  private backgroundReply = false
  private lastMessageAt = Date.now()
  readonly drained: Promise<void>

  constructor(readonly scope: { owner: string; account: string; conversationId: string }, options: Options, private onIdle?: (event: ClaudeBackgroundEvent) => void, create: typeof query = query, inheritEnvironment = true) {
    for (const value of [scope.owner, scope.account, scope.conversationId]) if (typeof value !== 'string' || !value.trim()) throw new Error('Claude session identity required')
    if (!['default', 'bro'].includes(scope.account)) throw new Error('Unknown Claude subscription account')
    const env = inheritEnvironment ? { ...process.env, ...options.env } : { ...options.env }
    // Even explicitly naming ~/.claude can select a different Keychain key.
    // The default account follows the CLI's default resolution, as production does.
    if (scope.account === 'default' && !DEFAULT_ACCOUNT_CONFIG_DIR) delete env.CLAUDE_CONFIG_DIR
    else env.CLAUDE_CONFIG_DIR = scope.account === 'default' ? DEFAULT_ACCOUNT_CONFIG_DIR! : dirClaudeAlternaO()
    // Instalación original: solo suscripción, se quitan las vías de API. Edición cliente: la llave del alumno ES la vía
    // (API de Anthropic u OpenRouter como ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL; contrato §4). Sin esto el chat del
    // alumno con OpenRouter respondía «Not logged in» (11 oct 2026, evidencia del .app).
    const cliente = esEdicionCliente()
    if (!cliente) for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete env[key]
    this.query = create({ prompt: this.input, options: { ...options, env } })
    this.initialization = this.query.accountInfo().then(info => requireClaudeSubscription(info, cliente))
    // Attach immediately; metadata failures must not create unhandled rejection.
    void this.initialization.catch(error => this.fail(error instanceof Error ? error : new Error('Claude initialization failed')))
    this.drained = this.read()
  }

  get closed(): boolean { return this.ended }
  get sessionId(): string | undefined { return this.nativeSessionId }
  get busy(): boolean { return !!this.active }
  /** Hay un turno pedido por alguien (no una respuesta espontánea del CLI). */
  get foregroundBusy(): boolean { return !!this.active && !this.active.spontaneous }
  /** A dead process has no work left: its subagents died with it (2 oct, 07:32: the stale ids
   * kept every later message out with «Espera a que terminen las tareas…»). */
  get hasBackgroundWork(): boolean { return this.listening && this.backgroundTasks.size > 0 }
  get backgroundReplyOpen(): boolean { return this.listening && (this.backgroundReply || !!this.active?.spontaneous) }
  /** A live process that has said nothing for 30 min no longer holds the conversation or the
   * runner's retirement: a lost notification must not become a permanent «busy». */
  private get listening(): boolean { return !this.ended && Date.now() - this.lastMessageAt < BACKGROUND_SILENCE_MS }

  /** ¿Este mensaje sin turno abre una respuesta del CLI? Solo entonces se crea el turno sintético. */
  private startSpontaneous(message: SDKMessage): boolean {
    const kind = message as { type: string; subtype?: string; status?: string | null; parent_tool_use_id?: string | null }
    if (kind.parent_tool_use_id) return false
    if (kind.type === 'system' && kind.subtype === 'task_notification') {
      // Aún no es respuesta: se recuerda para contar por qué despertó y sigue al sink de fondo.
      this.prelude.push(message); if (this.prelude.length > 20) this.prelude.shift()
      return false
    }
    if (kind.type === 'result') { this.prelude = []; return false }
    const opens = (kind.type === 'system' && (kind.subtype === 'init' || (kind.subtype === 'status' && kind.status === 'requesting')))
      || kind.type === 'stream_event' || kind.type === 'assistant'
    if (!opens || !this.adopter || this.ended) return false
    let finish: () => void = () => {}
    const done = new Promise<void>(resolve => { finish = resolve })
    const reply = { id: randomUUID(), output: new Mailbox<SDKMessage>(), terminal: false, submitted: true, detached: false, observer: new AbortController(), spontaneous: { finish, done } }
    const prelude = this.prelude.splice(0)
    let adopted = false
    try {
      adopted = this.adopter({ id: reply.id, events: reply.output, prelude, startedAt: Date.now(), interrupt: async () => {
        // Solo mientras esta respuesta siga activa: si ya cerró, el interrupt caería sobre el mensaje siguiente de Daniel.
        if (this.active === reply && !reply.terminal) await this.query.interrupt()
      }, done })
    } catch { adopted = false }
    if (!adopted) { this.prelude = prelude; return false }
    this.active = reply
    // Lo que el sink de fondo ya vio sigue ahí (observaciones); el turno visible arranca con este mensaje.
    reply.output.push(message)
    if (message.type === 'result') this.closeSpontaneous(reply)
    return true
  }
  private closeSpontaneous(reply: NonNullable<ClaudeInteractiveSession['active']>): void {
    reply.terminal = true; reply.output.end()
    if (this.active === reply) this.active = undefined
    this.backgroundReply = false
    this.prelude = []
    reply.spontaneous?.finish()
  }

  private idle(message: SDKMessage, turnId?: string): void {
    const kind = message as { type: string; subtype?: string; parent_tool_use_id?: string | null }
    if (!kind.parent_tool_use_id && kind.type === 'system' && (kind.subtype === 'task_notification' || kind.subtype === 'init')) this.backgroundReply = true
    if (!kind.parent_tool_use_id && kind.type === 'result') this.backgroundReply = false
    this.emitBackground({ type: 'message', message, ...(turnId ? { turnId } : {}) })
  }
  private emitBackground(event: ClaudeBackgroundEvent): void {
    if (this.onIdle) this.onIdle(event)
    else this.background.push(event)
  }

  private async read(): Promise<void> {
    try {
      for await (let message of this.query) {
        const event = message as SDKMessage & { subtype?: string; session_id?: string; user_message_uuid?: string; task_id?: string; parent_tool_use_id?: string | null; tasks?: Array<{ task_id?: unknown }> }
        this.lastMessageAt = Date.now()
        if (event.type === 'system' && event.subtype === 'init') {
          if (this.nativeSessionId && event.session_id !== this.nativeSessionId) throw new Error('Claude session identity changed')
          this.nativeSessionId = event.session_id; this.initMessage = message
        }
        const active = this.active
        if (!event.parent_tool_use_id && event.user_message_uuid && (message.type === 'assistant' || message.type === 'stream_event')) this.replyOwner = event.user_message_uuid
        const parentOwner = event.parent_tool_use_id ? this.toolOwners.get(event.parent_tool_use_id) : undefined
        const messageOwner = event.parent_tool_use_id ? parentOwner : this.replyOwner
        // Tool spawning IDs are stable across later subagent frames, which
        // don't carry task_id or user_message_uuid on every delta.
        if (message.type === 'assistant' && messageOwner) {
          for (const block of message.message.content) if (block.type === 'tool_use') this.toolOwners.set(block.id, messageOwner)
        }
        if (message.type === 'stream_event' && message.event.type === 'content_block_start' && message.event.content_block.type === 'tool_use' && messageOwner) {
          this.toolOwners.set(message.event.content_block.id, messageOwner)
        }
        if (event.subtype === 'task_started' && event.task_id && this.replyOwner) this.taskOwners.set(event.task_id, this.replyOwner)
        if (event.subtype === 'task_started' && event.task_id) this.backgroundTasks.add(event.task_id)
        if (event.subtype === 'task_notification' && event.task_id) this.backgroundTasks.delete(event.task_id)
        // The SDK's full list of running background tasks is authoritative over our own bookkeeping.
        if (event.type === 'system' && event.subtype === 'background_tasks_changed' && Array.isArray(event.tasks)) {
          this.backgroundTasks = new Set(event.tasks.flatMap(task => typeof task?.task_id === 'string' ? [task.task_id] : []))
        }
        const taskOwner = event.task_id ? this.taskOwners.get(event.task_id) : undefined
        if (event.parent_tool_use_id) { this.idle(message, parentOwner); continue }
        if (active?.spontaneous && !active.terminal) {
          // Respuesta espontánea en curso: todo lo de primer nivel le pertenece hasta su result.
          active.output.push(message)
          if (message.type === 'result') this.closeSpontaneous(active)
          continue
        }
        if ((!active || active.terminal) && this.startSpontaneous(message)) continue
        if (!active || active.terminal) { this.idle(message, event.user_message_uuid ?? taskOwner); continue }
        const owns = (uuid?: string) => !!uuid && (uuid === active.id || !!active.injected?.has(uuid))
        if (taskOwner && !owns(taskOwner)) { this.idle(message, taskOwner); continue }
        if (event.user_message_uuid && !owns(event.user_message_uuid)) { this.idle(message, event.user_message_uuid); continue }
        // Scheduled/synthetic and some session-wide errors have no client UUID.
        // They cannot prove this foreground submission has finished.
        if (message.type === 'result' && !owns(event.user_message_uuid)) { this.idle(message); continue }
        if ((message.type === 'assistant' || message.type === 'stream_event' || message.type === 'user') && !owns(this.replyOwner)) {
          this.idle(message, this.replyOwner); continue
        }
        // Tras un Stop, el CLI corre lo inyectado que no alcanzó a plegar (`still_queued`): se detiene
        // en su primer frame y su result interrumpido lo consume. Stop sigue significando «para todo».
        if (active.stopping && event.user_message_uuid && active.injected?.get(event.user_message_uuid) === 'esperando' && !active.stopping.has(event.user_message_uuid)) {
          active.stopping.add(event.user_message_uuid)
          void this.query.interrupt().catch(() => {})
        }
        if (message.type === 'result' && active.injected?.size) {
          const r = event as { terminal_reason?: unknown; subtype?: string }
          const interrupted = r.terminal_reason === 'interrupted' || r.subtype === 'error_during_execution'
          if (interrupted) active.stopping ??= new Set()
          // Lo inyectado que el CLI plegó en este turno viene en user_message_uuids; lo que llegó
          // tarde (sin otra ronda de herramientas) corre como turno siguiente del CLI y sigue siendo
          // de ESTE turno de Arbrain: el turno no cierra hasta que cada inyección tenga su result.
          const consumed = (event as { user_message_uuids?: unknown }).user_message_uuids
          for (const uuid of [event.user_message_uuid, ...(Array.isArray(consumed) ? consumed : [])]) {
            if (typeof uuid !== 'string' || active.injected.get(uuid) !== 'esperando') continue
            // Detenido en su primer frame tras el Stop: el modelo nunca lo leyó.
            active.injected.set(uuid, interrupted && active.stopping?.has(uuid) ? 'sin_leer' : 'leido')
          }
          if ([...active.injected.values()].some(state => state === 'esperando')) {
            // Result intermedio: no cierra el turno de Arbrain (agent.ts trata `result` como final).
            // Su texto ya salió en los `assistant`; queda como observación del sink de fondo.
            if (this.replyOwner && owns(this.replyOwner)) this.replyOwner = undefined
            const text = (message as { result?: unknown }).result
            if (typeof text === 'string' && text.trim()) (active.partials ??= []).push(text)
            this.idle(message, active.id)
            active.held = message
            // Tras un Stop, si el CLI no corre lo que tenía en cola (o lo canceló), el turno cierra igual.
            if (active.stopping && !active.heldTimer) {
              active.heldTimer = setTimeout(() => {
                if (this.active !== active || active.terminal || !active.held) return
                for (const [uuid, state] of active.injected ?? []) if (state === 'esperando') active.injected!.set(uuid, 'sin_leer')
                this.finishActive(active, active.held)
              }, STOP_DRAIN_MS)
              active.heldTimer.unref?.()
            }
            continue
          }
        }
        this.finishActive(active, message, owns(this.replyOwner))
      }
      if (!this.ended) this.fail(new Error('Claude process ended'))
    } catch (error) { this.fail(error instanceof Error ? error : new Error('Claude transport failed')) }
  }

  /** Entrega un mensaje del turno activo; con `result`, lo cierra (uniendo el texto de los result retenidos). */
  private finishActive(active: NonNullable<ClaudeInteractiveSession['active']>, message: SDKMessage, ownsReply = false): void {
    if (message.type === 'result' && active.partials?.length) {
      const final = (message as { result?: unknown }).result
      const partes = [...active.partials]
      // Si el result final es el mismo que se retuvo (cierre por plazo tras Stop), no se repite su texto.
      if (message === active.held) partes.pop()
      if (typeof final === 'string') message = Object.assign({}, message, { result: [...partes, final].filter(t => t.trim()).join('\n\n') }) as SDKMessage
    }
    if (active.detached) this.idle(message, active.id)
    else active.output.push(message)
    if (message.type !== 'result') return
    if (ownsReply) this.replyOwner = undefined
    clearTimeout(active.heldTimer)
    if (active.injected?.size) {
      const leidos: string[] = [], sinLeer: string[] = []
      for (const [uuid, state] of active.injected) (state === 'leido' ? leidos : sinLeer).push(uuid)
      this.outcomes.set(active.id, { leidos, sinLeer })
      if (this.outcomes.size > 50) this.outcomes.delete(this.outcomes.keys().next().value!)
    }
    active.terminal = true; active.output.end()
    if (active.detached) this.active = undefined
  }

  /** Qué inyecciones de un turno ya cerrado leyó el modelo y cuáles no (Stop antes de leerlas). */
  injectionOutcome(turnId: string): InjectionOutcome | undefined { return this.outcomes.get(turnId) }
  private outcomes = new Map<string, InjectionOutcome>()

  /** Stable application UUID is passed unchanged to the SDK. No retries. */
  async *turn(id: string, content: SDKUserMessage['message']['content'], signal?: AbortSignal): AsyncGenerator<SDKMessage> {
    // Una respuesta espontánea en curso no es un choque: el mensaje de Daniel entra en cuanto ella termina,
    // en el mismo orden que verá en el chat.
    while (this.active?.spontaneous && !this.ended) {
      if (signal?.aborted) throw new ClaudeSubmissionCancelled('Cancelado antes de enviar al SDK.')
      await Promise.race([this.active.spontaneous.done, new Promise(resolve => setTimeout(resolve, 250))])
    }
    if (this.active) throw new Error('Esta conversación ya tiene un turno en curso.')
    if (this.ended) throw this.failure ?? new Error('Claude session closed')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Stable UUID required before Claude submission')
    const active = { id, output: new Mailbox<SDKMessage>(), terminal: false, submitted: false, detached: false, observer: new AbortController() }
    this.active = active
    let onCancel: () => void = () => {}
    const cancelled = new Promise<boolean>(resolve => { onCancel = () => resolve(false); signal?.addEventListener('abort', onCancel, { once: true }) })
    try {
      if (signal?.aborted) throw new ClaudeSubmissionCancelled('Cancelado antes de enviar al SDK.')
      const ready = await Promise.race([this.initialization.then(() => true), cancelled, new Promise<boolean>(resolve => active.observer.signal.addEventListener('abort', () => resolve(false), { once: true }))])
      if (signal?.aborted) throw new ClaudeSubmissionCancelled('Cancelado antes de enviar al SDK.')
      if (!ready || active.detached) return
      if (this.ended) throw this.failure ?? new Error('Claude session closed')
      if (this.initMessage) active.output.push(this.initMessage)
      this.input.push({ type: 'user', uuid: id as SDKUserMessage['uuid'], session_id: this.nativeSessionId, parent_tool_use_id: null, message: { role: 'user', content } })
      active.submitted = true
      yield* active.output
    } catch (error) {
      if (active.submitted && !active.terminal) throw new ClaudeExecutionUncertain(error instanceof Error ? error.message : 'Resultado Claude incierto')
      throw error
    } finally {
      signal?.removeEventListener('abort', onCancel)
      // Also drain when a result arrived before the observer called return().
      this.detach(id)
    }
  }

  /** Mensaje de Daniel A MITAD del turno en curso (como Claude Code): el CLI lo pliega en la
   * siguiente frontera de herramienta; si el modelo ya no llama herramientas, corre justo
   * después como continuación de este mismo turno. Solo entra si `turnId` sigue vivo y ya se
   * envió; si no, devuelve false y quien llama lo deja como turno normal en la fila.
   * Síncrono: entre revisar y empujar no puede colarse el result del turno. */
  inject(turnId: string, id: string, content: SDKUserMessage['message']['content']): boolean {
    const active = this.active
    if (this.ended || !active || active.id !== turnId || active.spontaneous || active.terminal || !active.submitted || active.detached) return false
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Stable UUID required before Claude injection')
    // Tras un Stop no entra nada más: lo que llegue va a la fila (en pausa, del lado del cliente).
    if (active.stopping) return false
    active.injected ??= new Map()
    if (active.injected.has(id)) return true
    this.input.push({ type: 'user', uuid: id as SDKUserMessage['uuid'], session_id: this.nativeSessionId, parent_tool_use_id: null, priority: 'next', message: { role: 'user', content } })
    active.injected.set(id, 'esperando')
    return true
  }

  async interrupt(): Promise<Awaited<ReturnType<Query['interrupt']>>> { return this.query.interrupt() }

  /** Synchronous observer cancellation, including when next() is waiting.
   * It does not interrupt the model or release an unfinished execution slot.
   */
  detach(turnId: string): void {
    const active = this.active
    if (!active || active.id !== turnId) return
    active.detached = true; active.observer.abort()
    for (const message of active.output.drain()) this.idle(message, active.id)
    active.output.end()
    if (active.terminal || !active.submitted) this.active = undefined
  }

  private fail(error: Error): void {
    if (this.ended) return
    this.ended = true; this.failure = error
    if (this.active?.submitted && !this.active.terminal) {
      try { this.emitBackground({ type: 'uncertain', turnId: this.active.id, error: error.message }) }
      catch { this.background.end(new ClaudeExecutionUncertain(error.message)) }
    }
    this.input.end(error); this.active?.output.end(error)
    this.active?.spontaneous?.finish()
    this.background.end()
    this.query.close()
  }
  close(): void { this.fail(new Error('Claude session closed')) }
}
