import Database from 'better-sqlite3'
import { createServer, get } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamDurableTurn } from './http-stream.js'
import type { query, SDKMessage, SDKUserMessage, Query } from '@anthropic-ai/claude-agent-sdk'
import { ClaudeInteractiveSession } from './claude-session.js'
import { ChatJournal, type TurnIdentity } from './journal.js'
import { ChatInjections } from './inyecciones.js'
import { ChatSupervisor, type JobRunner } from './supervisor.js'

// Pedido de Daniel (7 oct 2026): escribirle a Levy mientras trabaja y que lo lea A MITAD del
// turno, como Claude Code, sin detenerlo ni esperar a que termine. Prueba real del SDK 0.3.288
// (scripts/prueba-inyeccion-sdk.mjs): un SDKUserMessage empujado tras un tool_use se pliega en
// la siguiente frontera de herramienta y el ÚNICO result trae ambos uuids en user_message_uuids.

const a = '44444444-4444-4444-8444-444444444444', b = '88888888-8888-4888-8888-888888888888', c = '44444444-4444-4444-8888-888888888888'
const scope = { owner: 'owner', account: 'default', conversationId: 'chat' }
function fake() {
  let wake: (() => void) | undefined, closed = false
  const pending: SDKMessage[] = [], sent: SDKUserMessage[] = []
  const interrupt = vi.fn().mockResolvedValue({ still_queued: [] })
  const q = {
    accountInfo: async () => ({ apiProvider: 'firstParty', subscriptionType: 'Claude Max' }), close: () => { closed = true; wake?.() }, interrupt,
    async *[Symbol.asyncIterator]() {
      while (!closed) {
        if (pending.length) { yield pending.shift()!; continue }
        await new Promise<void>(resolve => { wake = resolve })
      }
    },
  } as unknown as Query
  const create = (({ prompt }: Parameters<typeof query>[0]) => {
    void (async () => { try { for await (const msg of prompt as AsyncIterable<SDKUserMessage>) sent.push(msg) } catch { /* cierre */ } })()
    return q
  }) as typeof query
  const emit = (event: unknown) => { pending.push(event as SDKMessage); wake?.() }
  return { create, sent, emit, interrupt }
}
const collect = async (source: AsyncIterable<SDKMessage>) => { const events: SDKMessage[] = []; for await (const m of source) events.push(m); return events }

describe('sesión Claude: inyección a mitad de turno', () => {
  it('pliegue normal: el mensaje entra con priority next y el turno cierra con el único result que consume ambos', async () => {
    const f = fake()
    const session = new ClaudeInteractiveSession(scope, {}, () => {}, f.create)
    const turn = collect(session.turn(a, 'corre tres pasos'))
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.emit({ type: 'assistant', user_message_uuid: a, message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } })
    await vi.waitFor(() => expect(session.busy).toBe(true))
    expect(session.inject(a, b, 'además di PINGUINO')).toBe(true)
    await vi.waitFor(() => expect(f.sent).toHaveLength(2))
    expect(f.sent[1]).toMatchObject({ uuid: b, priority: 'next', message: { role: 'user', content: 'además di PINGUINO' } })
    f.emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'paso1 paso2 paso3. PINGUINO' }] } })
    f.emit({ type: 'result', subtype: 'success', user_message_uuid: a, user_message_uuids: [a, b], result: 'PINGUINO' })
    const events = await turn
    expect(events.at(-1)).toMatchObject({ type: 'result', result: 'PINGUINO' })
    expect(session.busy).toBe(false)
    session.close(); await session.drained
  })

  it('llegó tarde (sin otra herramienta): el result del primero NO cierra; la continuación del CLI con su uuid es del mismo turno', async () => {
    const f = fake(), fondo: unknown[] = []
    const session = new ClaudeInteractiveSession(scope, {}, e => fondo.push(e), f.create)
    const turn = collect(session.turn(a, 'hola'))
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.emit({ type: 'assistant', user_message_uuid: a, message: { content: [{ type: 'text', text: 'casi' }] } })
    await new Promise(r => setTimeout(r, 10))
    expect(session.inject(a, b, 'y otra cosa')).toBe(true)
    f.emit({ type: 'result', subtype: 'success', user_message_uuid: a, user_message_uuids: [a], result: 'casi' })
    f.emit({ type: 'assistant', user_message_uuid: b, message: { content: [{ type: 'text', text: 'la otra cosa' }] } })
    f.emit({ type: 'result', subtype: 'success', user_message_uuid: b, user_message_uuids: [b], result: 'la otra cosa' })
    const events = await turn
    const results = events.filter(e => e.type === 'result')
    expect(results).toHaveLength(1) // agent.ts trata `result` como final: solo sale el último
    // La respuesta guardada conserva lo que contestó antes de la inyección tardía.
    expect(results[0]).toMatchObject({ result: 'casi\n\nla otra cosa' })
    expect(events.some(e => e.type === 'assistant' && JSON.stringify(e).includes('la otra cosa'))).toBe(true)
    session.close(); await session.drained
  })

  it('no inyecta si el turno no es el vivo, ya cerró o es una respuesta espontánea: quien llama lo encola', async () => {
    const f = fake()
    const session = new ClaudeInteractiveSession(scope, {}, () => {}, f.create)
    expect(session.inject(a, b, 'sin turno')).toBe(false)
    const turn = collect(session.turn(a, 'hola'))
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    expect(session.inject(c, b, 'otro turno')).toBe(false)
    f.emit({ type: 'result', subtype: 'success', user_message_uuid: a, result: 'ok' })
    await turn
    expect(session.inject(a, b, 'tarde')).toBe(false)
    expect(f.sent).toHaveLength(1)
    session.close(); await session.drained
  })

  it('Stop sigue siendo «para todo»: lo inyectado que el CLI corre después del interrupt se detiene en su primer frame', async () => {
    const f = fake()
    const session = new ClaudeInteractiveSession(scope, {}, () => {}, f.create)
    const turn = collect(session.turn(a, 'largo'))
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.emit({ type: 'assistant', user_message_uuid: a, message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } })
    await new Promise(r => setTimeout(r, 10))
    expect(session.inject(a, b, 'y luego esto')).toBe(true)
    f.emit({ type: 'result', subtype: 'error_during_execution', terminal_reason: 'interrupted', user_message_uuid: a, user_message_uuids: [a], result: '' })
    f.emit({ type: 'stream_event', user_message_uuid: b, event: { type: 'message_start' } })
    await vi.waitFor(() => expect(f.interrupt).toHaveBeenCalledTimes(1))
    f.emit({ type: 'result', subtype: 'error_during_execution', terminal_reason: 'interrupted', user_message_uuid: b, user_message_uuids: [b], result: '' })
    await turn
    expect(session.busy).toBe(false)
    // Decisión del 7 oct: lo que el modelo no leyó vuelve a la fila en pausa; el supervisor lo sabe por aquí.
    expect(session.injectionOutcome(a)).toEqual({ leidos: [], sinLeer: [b] })
    // Tras el Stop no entra nada más al turno.
    session.close(); await session.drained
  })

  it('lo plegado cuenta como leído en el desenlace', async () => {
    const f = fake()
    const session = new ClaudeInteractiveSession(scope, {}, () => {}, f.create)
    const turn = collect(session.turn(a, 'x'))
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.emit({ type: 'assistant', user_message_uuid: a, message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } })
    await new Promise(r => setTimeout(r, 10))
    session.inject(a, b, 'y esto')
    f.emit({ type: 'result', subtype: 'success', user_message_uuid: a, user_message_uuids: [a, b], result: 'ok' })
    await turn
    expect(session.injectionOutcome(a)).toEqual({ leidos: [b], sinLeer: [] })
    session.close(); await session.drained
  })
})

const cleanup: Array<() => void> = []
afterEach(() => { for (const close of cleanup.splice(0)) close() })
const id = (turnId: string): TurnIdentity => ({ owner: 'daniel', account: 'default', conversationId: 'sdk:hilo', turnId })
function mundo() {
  let now = 1_000
  const db = new Database(':memory:')
  cleanup.push(() => db.close())
  const journal = new ChatJournal(db, () => ++now)
  return { db, journal, injections: new ChatInjections(db, journal, () => ++now) }
}

describe('journal de inyecciones', () => {
  it('sin turno vivo es un accept normal; con turno humano vivo queda pendiente para ese turno', () => {
    const { journal, injections } = mundo()
    expect(injections.tryInject(id('solo'), { message: 'hola' })).toBeNull()
    journal.accept(id('solo'), { message: 'hola' })
    journal.claim(id('solo'), 'w'); journal.transition(id('solo'), 'running')
    const r = injections.tryInject(id('dos'), { message: 'y esto' })
    expect(r).toMatchObject({ into: { turnId: 'solo' }, injection: { status: 'pending' } })
    expect(journal.get(id('dos'))).toBeNull()
    expect(injections.pending(id('solo')).map(i => i.id)).toEqual(['dos'])
    // Reintento por ACK perdido: misma respuesta, sin duplicar.
    expect(injections.tryInject(id('dos'), { message: 'y esto' })).toMatchObject({ into: { turnId: 'solo' } })
    expect(injections.pending(id('solo'))).toHaveLength(1)
  })

  it('un aviso en curso no recibe inyecciones (cede ante Daniel por la fila); con humano en fila, va detrás', () => {
    const { journal, injections } = mundo()
    journal.accept(id('aviso'), { message: '[Aviso]', despertador: { id: 's', texto: 'x', programadoPara: 1, disparo: 1, tipo: 'subagente' } })
    journal.claim(id('aviso'), 'w'); journal.transition(id('aviso'), 'running')
    expect(injections.tryInject(id('d1'), { message: 'oye' })).toBeNull()
    const { journal: j2, injections: i2 } = mundo()
    j2.accept(id('corre'), { message: 'a' }); j2.claim(id('corre'), 'w'); j2.transition(id('corre'), 'running')
    j2.accept(id('esperando'), { message: 'b' })
    expect(i2.tryInject(id('c'), { message: 'c' })).toBeNull()
  })

  it('release: lo que no alcanzó a entrar vuelve a la fila con su identidad e input; lo enviado no se repite', () => {
    const { journal, injections } = mundo()
    journal.accept(id('t'), { message: 'a' }); journal.claim(id('t'), 'w'); journal.transition(id('t'), 'running')
    injections.tryInject(id('i1'), { message: 'uno' })
    injections.tryInject(id('i2'), { message: 'dos' })
    expect(injections.markSent('i1', 'w')).toBe(true)
    journal.complete(id('t'), {}, { text: 'ok' })
    expect(injections.release(id('t')).map(t => t.turnId)).toEqual(['i2'])
    expect(journal.get(id('i2'))).toMatchObject({ status: 'queued', input: { message: 'dos' } })
    expect(journal.get(id('i1'))).toBeNull()
    expect(injections.markSent('i2', 'w')).toBe(false)
    // El reintento de la petición original ya no inyecta: el accept idempotente devuelve el turno normal.
    expect(injections.tryInject(id('i2'), { message: 'dos' })).toBeNull()
    expect(journal.accept(id('i2'), { message: 'dos' })).toMatchObject({ created: false, turn: { turnId: 'i2' } })
    // Turno cerrado: el siguiente mensaje ya no se inyecta.
    expect(injections.tryInject(id('i3'), { message: 'tres' })).toBeNull()
  })
})

describe('Stop con inyecciones sin leer', () => {
  it('quedan unread, se anuncian en injections_settled, no se reencolan y no se guardan como mensajes del turno', async () => {
    const { journal, injections } = mundo()
    let soltar!: () => void
    const compuerta = new Promise<void>(resolve => { soltar = resolve })
    const run: JobRunner = vi.fn(async (turn, emit) => {
      emit({ type: 'tool_start', toolName: 'Bash', toolId: 'tool-1' })
      await compuerta
      return { status: 'interrupted' as const, payload: { turnId: turn.turnId }, snapshot: { text: '' } }
    })
    const entregas: unknown[] = []
    const worker = new ChatSupervisor(journal, { workerId: 'w', run, deliver: async p => { entregas.push(p); return true }, workerConfirmedDead: () => false, injections,
      inject: () => true, unreadInjections: () => ['enviada'] })
    cleanup.push(() => worker.stop())
    worker.start()
    worker.accept(id('t'), { message: 'trabaja' })
    await vi.waitFor(() => expect(journal.events(id('t')).length).toBeGreaterThan(0))
    injections.tryInject(id('enviada'), { message: 'uno' })
    await worker.pump()
    // Llegó al motor con la herramienta en curso como punto de la actividad.
    expect(journal.events(id('t')).map(e => e.event)).toContainEqual(expect.objectContaining({ type: 'user_injected', injectionId: 'enviada', afterToolId: 'tool-1' }))
    expect(worker.injectionsOf(id('t'))).toEqual([expect.objectContaining({ injectionId: 'enviada', status: 'sent', afterToolId: 'tool-1' })])
    soltar()
    await vi.waitFor(() => expect(journal.get(id('t'))?.status).toBe('interrupted'))
    const settled = journal.events(id('t')).map(e => e.event as { type: string }).find(e => e.type === 'injections_settled')
    expect(settled).toMatchObject({ leidas: [], sinLeer: [{ injectionId: 'enviada', message: 'uno', status: 'unread' }] })
    expect(journal.get(id('enviada'))).toBeNull()
    await vi.waitFor(() => expect(entregas).toHaveLength(1))
    expect(entregas[0]).not.toHaveProperty('injectedMessages')
  })

  it('release de un turno detenido deja lo pendiente unread en vez de reencolarlo', () => {
    const { journal, injections } = mundo()
    journal.accept(id('t'), { message: 'a' }); journal.claim(id('t'), 'w'); journal.transition(id('t'), 'running')
    injections.tryInject(id('p'), { message: 'pendiente' })
    journal.complete(id('t'), {}, { text: '' }, 'interrupted')
    expect(injections.release(id('t'), true)).toEqual([])
    expect(injections.get('p')?.status).toBe('unread')
    expect(journal.get(id('p'))).toBeNull()
  })
})

describe('supervisor con inyección', () => {
  it('empuja lo pendiente al motor del turno vivo, lo anuncia en su stream y lo incluye en la entrega; el turno no se interrumpe', async () => {
    const { journal, injections } = mundo()
    let soltar!: () => void
    const compuerta = new Promise<void>(resolve => { soltar = resolve })
    const abortados: string[] = [], motor: string[] = []
    const run: JobRunner = vi.fn(async (turn, _emit, signal) => {
      signal.addEventListener('abort', () => abortados.push(turn.turnId), { once: true })
      await compuerta
      return { status: 'completed' as const, payload: { turnId: turn.turnId }, snapshot: { text: 'ok' } }
    })
    const entregas: unknown[] = []
    const worker = new ChatSupervisor(journal, { workerId: 'w', run, deliver: async p => { entregas.push(p); return true }, workerConfirmedDead: () => false, injections,
      inject: (_turn, injection) => { motor.push(injection.id); return true } })
    cleanup.push(() => worker.stop())
    worker.start()
    worker.accept(id('primero'), { message: 'trabaja' })
    await vi.waitFor(() => expect(journal.get(id('primero'))?.status).toBe('running'))
    expect(injections.tryInject(id('segundo'), { message: 'y esto también' })).not.toBeNull()
    await worker.pump()
    expect(motor).toEqual(['segundo'])
    expect(journal.events(id('primero')).map(e => e.event)).toContainEqual(expect.objectContaining({ type: 'user_injected', injectionId: 'segundo', message: 'y esto también' }))
    soltar()
    await vi.waitFor(() => expect(journal.get(id('primero'))?.status).toBe('completed'))
    expect(abortados).toEqual([])
    expect(journal.get(id('segundo'))).toBeNull() // nunca se volvió turno aparte
    await vi.waitFor(() => expect(entregas).toHaveLength(1))
    expect(entregas[0]).toMatchObject({ injectedMessages: [{ turnId: 'segundo', message: 'y esto también' }] })
  })

  it('si el motor no acepta (Codex sin steer, turno en cierre), el mensaje sale como turno normal al terminar', async () => {
    const { journal, injections } = mundo()
    let soltar!: () => void
    const compuerta = new Promise<void>(resolve => { soltar = resolve })
    const orden: string[] = []
    const run: JobRunner = vi.fn(async turn => { orden.push(turn.turnId); if (turn.turnId === 'primero') await compuerta; return { status: 'completed' as const, payload: {}, snapshot: { text: 'ok' } } })
    const worker = new ChatSupervisor(journal, { workerId: 'w', run, deliver: async () => true, workerConfirmedDead: () => false, injections, inject: () => false })
    cleanup.push(() => worker.stop())
    worker.start()
    worker.accept(id('primero'), { message: 'trabaja' })
    await vi.waitFor(() => expect(journal.get(id('primero'))?.status).toBe('running'))
    expect(injections.tryInject(id('segundo'), { message: 'después' })).not.toBeNull()
    await worker.pump()
    soltar()
    await vi.waitFor(() => expect(journal.get(id('segundo'))?.status).toBe('completed'))
    expect(orden).toEqual(['primero', 'segundo'])
  })
})

describe('reenganche (/chat/live) con inyecciones', () => {
  it('resume_meta trae las inyecciones del turno para pintarlas dentro de su actividad', async () => {
    const { journal, injections } = mundo()
    let soltar!: () => void
    const compuerta = new Promise<void>(resolve => { soltar = resolve })
    const run: JobRunner = vi.fn(async (_turn, emit) => { emit({ type: 'tool_start', toolName: 'Bash', toolId: 'tool-9' }); await compuerta; return { status: 'completed' as const, payload: {}, snapshot: { text: 'ok' } } })
    const worker = new ChatSupervisor(journal, { workerId: 'w', run, deliver: async () => true, workerConfirmedDead: () => false, injections, inject: () => true })
    worker.start()
    worker.accept(id('t'), { message: 'trabaja' })
    await vi.waitFor(() => expect(journal.events(id('t')).length).toBeGreaterThan(0))
    injections.tryInject(id('i'), { message: 'y esto' })
    await worker.pump()
    const server = createServer((_req, res) => streamDurableTurn(res, worker, journal.get(id('t'))!, 0, 20, true))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => { soltar(); worker.stop(); server.closeAllConnections(); server.close() })
    const primera = await new Promise<string>((resolve, reject) => {
      get(`http://127.0.0.1:${(server.address() as { port: number }).port}/`, res => {
        res.setEncoding('utf8'); let buf = ''
        res.on('data', (c: string) => { buf += c; const linea = buf.split('\n').find(l => l.startsWith('data: ')); if (linea) { res.destroy(); resolve(linea.slice(6)) } })
      }).on('error', reject)
    })
    expect(JSON.parse(primera)).toMatchObject({ type: 'resume_meta', inyectados: [{ injectionId: 'i', message: 'y esto', status: 'sent', afterToolId: 'tool-9' }] })
  })
})
