import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatJournal, JournalCancelled, type TurnIdentity } from './journal.js'
import { ChatSupervisor, JobRejected, type JobRunner } from './supervisor.js'
const cleanup: Array<() => void> = []
afterEach(() => { for (const close of cleanup.splice(0)) close() })
const id = (turnId: string, conversationId = 'chat'): TurnIdentity => ({ owner: 'owner', account: 'codex', conversationId, turnId })
const result = { status: 'completed' as const, payload: { complete: true }, snapshot: { text: 'done' } }
function fixture(run: JobRunner, deliver = async () => true) {
  const db = new Database(':memory:'); let now = 1000
  const journal = new ChatJournal(db, () => now)
  const worker = new ChatSupervisor(journal, { workerId: 'worker', run, deliver, workerConfirmedDead: () => false })
  cleanup.push(() => { worker.stop(); db.close() })
  return { journal, worker, db, advance: (ms: number) => { now += ms } }
}

describe('durable chat supervision', () => {
  it('libera la conversación cuando un reinicio dejó un turno huérfano incierto, sin reejecutarlo', async () => {
    const db = new Database(':memory:'); const journal = new ChatJournal(db, () => 1000)
    journal.accept(id('viejo'), { message: 'antes del reinicio' })
    expect(journal.claim(id('viejo'), 'muerto:1:x')).toBe(true)
    journal.transition(id('viejo'), 'running')
    journal.markWorkerStopped('muerto:1:x')
    journal.accept(id('nuevo'), { message: 'después del reinicio' })
    const run = vi.fn(async () => result)
    const worker = new ChatSupervisor(journal, { workerId: 'vivo', run, deliver: async () => true, workerConfirmedDead: w => w === 'muerto:1:x' })
    cleanup.push(() => { worker.stop(); db.close() })
    worker.start()
    expect(journal.get(id('viejo'))?.status).toBe('interrupted')
    await vi.waitFor(() => expect(journal.get(id('nuevo'))?.status).toBe('completed'))
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('executes one accepted submission once and survives observer detachment', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const run = vi.fn(async (_turn, emit) => { emit({ type: 'text_delta', text: 'first' }); await gate; emit({ type: 'result', text: 'done' }); return result })
    const { worker, journal } = fixture(run)
    worker.start(); worker.accept(id('t'), { message: 'hello' })
    const unsubscribe = worker.subscribe(id('t'), () => { throw new Error('socket gone') })
    unsubscribe()
    expect(worker.accept(id('t'), { message: 'hello' }).created).toBe(false)
    release()
    await vi.waitFor(() => expect(journal.get(id('t'))?.status).toBe('completed'))
    expect(run).toHaveBeenCalledTimes(1)
    expect(journal.events(id('t')).map(e => (e.event as { type: string }).type)).toEqual(['text_delta', 'result', 'terminal'])
  })
  it('prevents a late send after cancellation and observes another worker cancellation request', async () => {
    const run = vi.fn(async (_turn, _emit, signal: AbortSignal) => {
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      return { ...result, status: 'interrupted' as const }
    })
    const { worker, journal } = fixture(run)
    worker.start()
    expect(worker.interrupt(id('late'))).toBe(true)
    expect(() => worker.accept(id('late'), {})).toThrow(JournalCancelled)
    expect(run).not.toHaveBeenCalled()
    worker.accept(id('active'), {})
    journal.requestCancellation(id('active')) // another worker handling HTTP
    expect(journal.get(id('active'))?.status).toBe('running')
    await worker.pump()
    await vi.waitFor(() => expect(journal.get(id('active'))?.status).toBe('interrupted'))
    expect(run).toHaveBeenCalledTimes(1)
    expect(worker.interrupt(id('active'))).toBe(true)
  })

  it('serializes a conversation while allowing another one to finish', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const started: string[] = []
    const { worker, journal } = fixture(async turn => { started.push(turn.turnId); if (turn.turnId === 'a') await gate; return result })
    worker.start(); worker.accept(id('a'), {}); worker.accept(id('b'), {}); worker.accept(id('other', 'other-chat'), {})
    await vi.waitFor(() => expect(journal.get(id('other', 'other-chat'))?.status).toBe('completed'))
    expect(started).toEqual(['a', 'other']); expect(journal.get(id('b'))?.status).toBe('queued')
    release(); await vi.waitFor(() => expect(journal.get(id('b'))?.status).toBe('completed'))
    expect(started).toEqual(['a', 'other', 'b'])
  })
  it('dispatches accepted queued work when a worker starts and never reruns uncertain work', async () => {
    const run = vi.fn(async () => { throw new Error('connection lost after tool dispatch') })
    const { worker, journal } = fixture(run)
    worker.accept(id('t'), { completeEnvelope: true })
    expect(run).not.toHaveBeenCalled()
    worker.start()
    await vi.waitFor(() => expect(journal.get(id('t'))?.status).toBe('uncertain'))
    worker.accept(id('t'), { completeEnvelope: true }); await worker.pump()
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('retries delivery without executing the model again', async () => {
    const deliver = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const run = vi.fn(async () => result)
    const { worker, journal, advance } = fixture(run, deliver)
    worker.start(); worker.accept(id('t'), {})
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1))
    advance(3000); await worker.deliver()
    expect(deliver).toHaveBeenCalledTimes(2); expect(run).toHaveBeenCalledTimes(1)
    expect(journal.claimDelivery('another')).toBe(null)
  })
  it('publishes the persisted terminal cursor and persists cancellation before dispatch', async () => {
    const { worker, journal } = fixture(async () => result)
    worker.accept(id('cancel'), {})
    expect(worker.interrupt(id('cancel'))).toBe(true)
    expect(journal.events(id('cancel'))[0].event).toEqual({ type: 'terminal', status: 'interrupted' })
    worker.accept(id('run'), {})
    const seen: number[] = []
    worker.subscribe(id('run'), event => seen.push(event.cursor))
    worker.start()
    await vi.waitFor(() => expect(journal.get(id('run'))?.status).toBe('completed'))
    expect(seen.at(-1)).toBe(journal.events(id('run')).at(-1)?.cursor)
    expect(seen.at(-1)).toBeGreaterThan(0)
  })
  it('accepts the full record selected by session-only interruption', () => {
    const { worker, journal } = fixture(async () => result)
    worker.accept(id('selected'), { message: 'hello' })
    const selected = journal.latest('owner', 'codex', 'chat')!
    expect(worker.interrupt(selected)).toBe(true)
    expect(journal.get(id('selected'))?.status).toBe('interrupted')
  })
  it('closes only confirmed dead workers as interrupted on restart (never re-run) and leaves live ones alone', () => {
    const { journal, worker } = fixture(async () => result)
    journal.accept(id('dead', 'dead-chat'), {}); journal.claim(id('dead', 'dead-chat'), 'dead-worker')
    journal.accept(id('live', 'live-chat'), {}); journal.claim(id('live', 'live-chat'), 'live-worker')
    const restarted = new ChatSupervisor(journal, { workerId: 'new-worker', run: async () => result, deliver: async () => true, workerConfirmedDead: id => id === 'dead-worker' })
    restarted.start(); restarted.stop(); worker.stop()
    expect(journal.get(id('dead', 'dead-chat'))?.status).toBe('interrupted')
    expect(journal.get(id('live', 'live-chat'))?.status).toBe('dispatching')
  })

  it('stores a cursor with the snapshot so recovery never repeats its deltas', async () => {
    const { worker, journal } = fixture(async (_turn, emit) => {
      emit({ type: 'text_delta', text: 'a' }, { text: 'a' })
      emit({ type: 'text_delta', text: 'b' })
      return { ...result, snapshot: { text: 'ab' } }
    })
    worker.start(); worker.accept(id('snapshot'), {})
    await vi.waitFor(() => expect(journal.get(id('snapshot'))?.status).toBe('completed'))
    const snapshot = journal.get(id('snapshot'))!.snapshot as { cursor: number; state: unknown }
    expect(snapshot.state).toEqual({ text: 'ab' })
    expect(journal.events(id('snapshot'), snapshot.cursor)).toEqual([])
  })

  it('does not leave an apparently running job after failing to persist a preflight rejection', async () => {
    const run = vi.fn(async () => { throw new JobRejected('attachment unavailable') })
    const { worker, journal } = fixture(run)
    vi.spyOn(journal, 'complete').mockImplementationOnce(() => { throw new Error('temporary storage failure') })
    worker.start(); worker.accept(id('rejected'), {})
    await vi.waitFor(() => expect(journal.get(id('rejected'))?.status).toBe('uncertain'))
    expect(journal.events(id('rejected')).at(-1)?.event).toMatchObject({ type: 'execution_uncertain' })
    await worker.pump()
    expect(run).toHaveBeenCalledTimes(1)
  })

})
