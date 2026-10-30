import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatJournal, type TurnIdentity } from './journal.js'
import { ChatSupervisor } from './supervisor.js'
import { CorredorRegistro, codeStamp, isCorredorWorker, workerState } from './corredor-registro.js'
import { CorredorLanzador } from './corredor-lanzador.js'

const cleanup: Array<() => void> = []
afterEach(() => { for (const close of cleanup.splice(0)) close() })
const id = (turnId: string, conversationId = 'chat'): TurnIdentity => ({ owner: 'owner', account: 'default', conversationId, turnId })
function base(now = { value: 1000 }) {
  const db = new Database(':memory:')
  const journal = new ChatJournal(db, () => now.value)
  const registro = new CorredorRegistro(db, () => now.value)
  cleanup.push(() => db.close())
  return { db, journal, registro, now }
}

describe('identidad y vida del corredor', () => {
  const alive = (pids: number[]) => (pid: number) => pids.includes(pid)
  it('distingue corredor vivo, muerto y de otro arranque del Mac', () => {
    expect(isCorredorWorker('corredor:studio:42:1700:u')).toBe(true)
    expect(isCorredorWorker('studio:42:u')).toBe(false)
    expect(workerState('corredor:studio:42:1700:u', 'studio', '1700', alive([42]))).toBe('alive')
    expect(workerState('corredor:studio:42:1700:u', 'studio', '1700', alive([]))).toBe('dead')
    // Tras reiniciar el Mac el PID puede estar ocupado por otro proceso: no es el mismo corredor.
    expect(workerState('corredor:studio:42:1700:u', 'studio', '1800', alive([42]))).toBe('rebooted')
    expect(workerState('corredor:mini:42:1700:u', 'studio', '1700', alive([42]))).toBe('dead')
  })
  it('conserva el formato del worker interno del agent-server', () => {
    expect(workerState('studio:42:u', 'studio', '1700', alive([42]))).toBe('alive')
    expect(workerState('studio:42:u', 'studio', '1700', alive([]))).toBe('dead')
    expect(workerState('mini:42:u', 'studio', '1700', alive([42]))).toBe('dead')
  })
  it('el registro olvida a los corredores muertos al verlos', () => {
    const { registro } = base()
    registro.register('corredor:h:1:b:a', 1, 's1')
    registro.register('corredor:h:2:b:b', 2, 's1')
    expect(registro.alive(w => w.includes(':1:')).map(r => r.pid)).toEqual([2])
    expect(registro.runners().map(r => r.pid)).toEqual([2])
  })
})

describe('relevo de respuestas a preguntas que viven en el corredor', () => {
  it('solo acepta respuestas a una pregunta abierta de un turno activo, y una sola vez', () => {
    const { journal, registro } = base()
    journal.accept(id('t'), { message: 'pregunta algo' })
    journal.claim(id('t'), 'corredor:h:1:b:u'); journal.transition(id('t'), 'running')
    expect(registro.relayAnswer('req-1', { '¿Color?': 'Azul' })).toBe(false)
    journal.append(id('t'), 'k1', { type: 'ask_user_question', requestId: 'req-1', questions: [] })
    expect(registro.relayAnswer('req-1', { '¿Color?': 'Azul' })).toBe(true)
    expect(registro.pendingAnswers()).toEqual([{ requestId: 'req-1', answers: { '¿Color?': 'Azul' }, createdAt: 1000 }])
    expect(registro.claimAnswer('req-1', 'corredor:h:1:b:u')).toBe(true)
    expect(registro.claimAnswer('req-1', 'corredor:h:2:b:v')).toBe(false)
    // Ya aplicada: un segundo envío no promete nada.
    expect(registro.relayAnswer('req-1', null)).toBe(false)
  })
  it('no releva preguntas resueltas por tiempo ni de turnos terminados', () => {
    const { journal, registro } = base()
    journal.accept(id('t'), { message: 'x' })
    journal.claim(id('t'), 'corredor:h:1:b:u'); journal.transition(id('t'), 'running')
    journal.append(id('t'), 'k1', { type: 'ask_user_question', requestId: 'req-2', questions: [] })
    journal.append(id('t'), 'k2', { type: 'question_resolved', requestId: 'req-2', outcome: 'timeout' })
    expect(registro.relayAnswer('req-2', null)).toBe(false)
  })
})

describe('lanzador', () => {
  it('lanza solo con cola, sin corredor vigente, y respeta el enfriamiento', () => {
    const { journal, registro, now } = base({ value: Number(codeStamp()) + 60_000 })
    const launch = vi.fn()
    const lanzador = new CorredorLanzador(journal, registro, { logFile: '/dev/null', cwd: '.', launch, isDead: () => false, clock: () => now.value })
    expect(lanzador.ensure()).toBe('sin-cola')
    journal.accept(id('t'), { message: 'hola' })
    expect(lanzador.ensure()).toBe('lanzado')
    expect(lanzador.ensure()).toBe('esperando')
    expect(launch).toHaveBeenCalledTimes(1)
    registro.register('corredor:h:9:b:u', 9, codeStamp())
    now.value += 10_000
    expect(lanzador.ensure()).toBe('listo')
  })
  it('un corredor con código viejo o retirándose no cuenta; lanza uno con el build asentado', () => {
    const { journal, registro, now } = base({ value: Number(codeStamp()) + 60_000 })
    const launch = vi.fn()
    const lanzador = new CorredorLanzador(journal, registro, { logFile: '/dev/null', cwd: '.', launch, isDead: () => false, clock: () => now.value })
    journal.accept(id('t'), { message: 'hola' })
    registro.register('corredor:h:1:b:viejo', 1, 'build-anterior')
    registro.register('corredor:h:2:b:actual', 2, codeStamp()); registro.heartbeat('corredor:h:2:b:actual', true)
    expect(lanzador.ensure()).toBe('lanzado')
  })
  it('mientras dist/ se reescribe no lanza código a medio construir', () => {
    const { journal, registro } = base()
    const launch = vi.fn()
    const lanzador = new CorredorLanzador(journal, registro, { logFile: '/dev/null', cwd: '.', launch, isDead: () => false, clock: () => Number(codeStamp()) + 1000 })
    journal.accept(id('t'), { message: 'hola' })
    expect(lanzador.ensure()).toBe('esperando')
    expect(launch).not.toHaveBeenCalled()
  })
})

describe('agent-server como observador', () => {
  it('no toma turnos, delega y sigue entregando lo que el corredor completó', async () => {
    const { journal } = base()
    const run = vi.fn()
    const delegate = vi.fn()
    const deliver = vi.fn(async () => true)
    const servidor = new ChatSupervisor(journal, { workerId: 'h:1:u', run, deliver, workerConfirmedDead: () => false, canClaim: () => false, delegate, tickMs: 20 })
    cleanup.push(() => servidor.stop())
    servidor.start()
    servidor.accept(id('t'), { message: 'hola' })
    await vi.waitFor(() => expect(delegate).toHaveBeenCalled())
    expect(run).not.toHaveBeenCalled()
    expect(journal.get(id('t'))?.status).toBe('queued')
    // El corredor (otro proceso, misma base) toma y completa el turno.
    const corredor = new ChatSupervisor(journal, { workerId: 'corredor:h:2:b:u', deliveries: false, deliver: async () => false, workerConfirmedDead: () => false,
      run: async (_turn, emit) => { emit({ type: 'text_delta', text: 'hola Daniel' }); return { status: 'completed', payload: { done: true }, snapshot: { text: 'hola Daniel' } } } })
    cleanup.push(() => corredor.stop())
    corredor.start()
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledWith({ done: true, startedAt: expect.any(Number) }))
    expect(journal.get(id('t'))?.workerId).toBe('corredor:h:2:b:u')
  })
  it('la cancelación pedida al servidor llega al turno del corredor', async () => {
    const { journal } = base()
    const servidor = new ChatSupervisor(journal, { workerId: 'h:1:u', run: vi.fn(), deliver: async () => true, workerConfirmedDead: () => false, canClaim: () => false })
    let aborted = false
    const corredor = new ChatSupervisor(journal, { workerId: 'corredor:h:2:b:u', deliveries: false, deliver: async () => false, workerConfirmedDead: () => false, tickMs: 20,
      run: async (_turn, _emit, signal) => { await new Promise<void>(resolve => signal.addEventListener('abort', () => { aborted = true; resolve() }, { once: true })); return { status: 'interrupted', payload: {}, snapshot: {} } } })
    cleanup.push(() => { corredor.stop(); servidor.stop() })
    corredor.start()
    servidor.accept(id('t'), { message: 'largo' })
    await vi.waitFor(() => expect(journal.get(id('t'))?.status).toBe('running'))
    servidor.interrupt(id('t'))
    await vi.waitFor(() => expect(aborted).toBe(true))
    await vi.waitFor(() => expect(journal.get(id('t'))?.status).toBe('interrupted'))
  })
  it('un corredor vivo de otro proceso no es un huérfano; uno muerto se cierra con lo que alcanzó a escribir', () => {
    const { journal } = base()
    journal.accept(id('vivo', 'a'), { message: 'a', source: 'desktop' })
    journal.claim(id('vivo', 'a'), 'corredor:h:2:b:vivo'); journal.transition(id('vivo', 'a'), 'running')
    journal.accept(id('muerto', 'b'), { message: 'b', source: 'desktop' })
    journal.claim(id('muerto', 'b'), 'corredor:h:3:b:muerto'); journal.transition(id('muerto', 'b'), 'running')
    journal.append(id('muerto', 'b'), 'x1', { type: 'text_delta', text: 'Primera parte ' })
    journal.append(id('muerto', 'b'), 'x2', { type: 'tool_start', toolId: 't', toolName: 'Bash' })
    journal.append(id('muerto', 'b'), 'x3', { type: 'text_delta', text: 'y segunda.' })
    const servidor = new ChatSupervisor(journal, { workerId: 'h:1:u', run: vi.fn(), deliver: async () => true, canClaim: () => false,
      workerConfirmedDead: w => w.endsWith(':muerto'), deathCause: () => 'reboot' })
    cleanup.push(() => servidor.stop())
    servidor.reap()
    expect(journal.get(id('vivo', 'a'))?.status).toBe('running')
    const cerrado = journal.get(id('muerto', 'b'))!
    expect(cerrado.status).toBe('interrupted')
    const state = (cerrado.snapshot as { state: { text: string; error: string } }).state
    expect(state.text.startsWith('Primera parte y segunda.')).toBe(true)
    expect(state.error).toContain('El Mac se reinició')
    expect(state.error).toContain('lo demás se perdió')
  })
})
