import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatJournal, JournalConflict, JournalCancelled, type TurnIdentity } from './journal.js'

const connections: Database.Database[] = [], dirs: string[] = []
const id: TurnIdentity = { owner: 'daniel', account: 'codex', conversationId: 'chat-a', turnId: 'turn-a' }
function open(file = ':memory:', clock?: () => number) {
  const db = new Database(file); connections.push(db)
  return { db, journal: new ChatJournal(db, clock) }
}
afterEach(() => { for (const db of connections.splice(0)) if (db.open) db.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('durable conversation journal', () => {
  it('adopts a spontaneous turn already claimed, only when the conversation is free', () => {
    const { journal } = open()
    journal.accept(id, { message: 'hola' }); journal.claim(id, 'w1'); journal.transition(id, 'running')
    const synthetic = { ...id, turnId: 'spont-1' }
    expect(journal.adopt(synthetic, { message: 'Aviso' }, 'w1')).toBeNull()
    journal.complete(id, { done: true }, { text: 'ok' })
    const adopted = journal.adopt(synthetic, { message: 'Aviso' }, 'w1', 123)
    expect(adopted).toMatchObject({ status: 'dispatching', workerId: 'w1', createdAt: 123 })
    expect(journal.queued()).toHaveLength(0)
    expect(journal.adopt(synthetic, { message: 'Aviso' }, 'w2')).toBeNull()
  })
  it('preserves late provider events after completion separately and isolates their cursor feed', () => {
    const { journal: j } = open()
    j.accept(id, {}); j.claim(id, 'worker'); j.complete(id, { text: 'done' }, { text: 'done' })
    const cursor = j.observeProvider(id, { task: 'finished after answer' }, id.turnId)
    expect(j.get(id)?.status).toBe('completed')
    expect(j.providerObservations(id)).toEqual([{ cursor, turnId: id.turnId, event: { task: 'finished after answer' } }])
    expect(j.providerObservations({ ...id, owner: 'other' })).toEqual([])
    expect(j.providerObservations(id, cursor)).toEqual([])
    expect(() => j.observeProvider({ ...id, account: 'bro' }, {}, id.turnId)).toThrow(JournalConflict)
  })
  it('persists cancellation before acceptance across restart, scoped to the exact turn', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arbrain-cancel-')); dirs.push(dir); const file = join(dir, 'test.db')
    const first = open(file)
    expect(first.journal.requestCancellation(id)).toEqual({ turn: null, cursor: null })
    first.db.close()
    const { journal: j } = open(file)
    expect(j.cancellationRequested(id)).toBe(true)
    expect(() => j.accept(id, { message: 'late HTTP request' })).toThrow(JournalCancelled)
    expect(j.get(id)).toBe(null); expect(j.queued()).toEqual([])
    for (const changed of [{ ...id, owner: 'other' }, { ...id, account: 'yt' }, { ...id, conversationId: 'other' }]) {
      expect(j.cancellationRequested(changed)).toBe(false)
      expect(() => j.requestCancellation(changed)).toThrow(JournalConflict)
      expect(() => j.accept(changed, {})).toThrow(JournalConflict)
    }
    expect(j.accept({ ...id, turnId: 'next' }, {}).created).toBe(true)
  })

  it('atomically cancels a queued turn and does not report running effects stopped', () => {
    const { journal: j, db } = open()
    j.accept(id, { message: 'hello', source: 'mobile' })
    db.exec("CREATE TRIGGER cancel_failure BEFORE INSERT ON chat_runtime_delivery BEGIN SELECT RAISE(ABORT, 'outbox unavailable'); END")
    expect(() => j.requestCancellation(id)).toThrow('outbox unavailable')
    expect(j.cancellationRequested(id)).toBe(false); expect(j.get(id)?.status).toBe('queued')
    db.exec('DROP TRIGGER cancel_failure')
    expect(j.requestCancellation(id).turn?.status).toBe('interrupted')
    expect(j.requestCancellation(id).cursor).toBe(null)
    expect(j.events(id)).toHaveLength(1)
    expect(j.accept(id, { message: 'hello', source: 'mobile' }).turn.status).toBe('interrupted')
    expect(j.claim(id, 'worker')).toBe(false)
    const running = { ...id, turnId: 'running' }
    j.accept(running, {}); j.claim(running, 'external-worker'); j.transition(running, 'running')
    expect(j.requestCancellation(running).turn?.status).toBe('running')
    expect(j.cancellationRequested(running)).toBe(true)
    expect(j.events(running)).toEqual([])
  })

  it('lists only unfinished turns of one owner, one per conversation, for the sidebar semaphore', () => {
    const { journal: j } = open()
    const running = { ...id, turnId: 'running', conversationId: 'chat-running' }
    const queued = { ...id, turnId: 'queued', conversationId: 'chat-queued' }
    const done = { ...id, turnId: 'done', conversationId: 'chat-done' }
    const foreign = { ...id, turnId: 'foreign', owner: 'other', conversationId: 'chat-foreign' }
    j.accept(running, {}); j.claim(running, 'w'); j.transition(running, 'running')
    j.accept(queued, {})
    j.accept(done, {}); j.claim(done, 'w'); j.complete(done, { text: 'ok' }, { text: 'ok' })
    j.accept(foreign, {}); j.claim(foreign, 'w'); j.transition(foreign, 'running')
    const active = j.activeTurns('daniel')
    expect(active.map(turn => [turn.conversationId, turn.status]).sort()).toEqual([['chat-queued', 'queued'], ['chat-running', 'running']])
    expect(active.every(turn => turn.account === 'codex')).toBe(true)
    // Un turno encolado detrás de uno en ejecución de la MISMA conversación no duplica la fila.
    const behind = { ...id, turnId: 'behind', conversationId: 'chat-running' }
    j.accept(behind, { message: 'otro' })
    expect(j.activeTurns('daniel').filter(turn => turn.conversationId === 'chat-running')).toMatchObject([{ turnId: 'running', status: 'running' }])
    j.transition(running, 'waiting')
    expect(j.activeTurns('daniel').find(turn => turn.conversationId === 'chat-running')?.status).toBe('waiting')
    expect(j.activeTurns('nadie')).toEqual([])
  })

  it('lista las conversaciones solo-SDK con turnos de Arbrain, por dueño y cuenta, con su primer mensaje', () => {
    let now = 1_000
    const { journal: j } = open(':memory:', () => now)
    const sdk = (conversationId: string, turnId: string, account = 'default', owner = 'daniel') => ({ owner, account, conversationId, turnId })
    const a1 = sdk('sdk:aaa', 'a1'), a2 = sdk('sdk:aaa', 'a2'), b1 = sdk('sdk:bbb', 'b1', 'bro'), ajena = sdk('sdk:ccc', 'c1', 'default', 'otro'), mc = sdk('1111-mc', 'm1')
    j.accept(a1, { message: 'primer mensaje de aaa' }); j.claim(a1, 'w'); now = 5_000; j.complete(a1, { text: 'ok' }, { text: 'ok' })
    now = 6_000; j.accept(a2, { message: 'segundo' })              // sin terminar: cuenta por su inicio
    now = 9_000; j.accept(b1, { message: 'de bro' })
    j.accept(ajena, { message: 'de otro dueño' }); j.accept(mc, { message: 'conversación MC' })
    now = 20_000; j.claim(a2, 'w'); j.transition(a2, 'failed')    // el reaper la cierra mucho después: no debe adelantarla
    const lista = j.sdkConversations('daniel')
    expect(lista.map(c => [c.conversationId, c.account, c.turns])).toEqual([['sdk:bbb', 'bro', 1], ['sdk:aaa', 'default', 2]])
    expect(lista[1]).toMatchObject({ firstPrompt: 'primer mensaje de aaa', firstTurnAt: 1_000, lastActivityAt: 6_000 })
    expect(j.sdkConversations('nadie')).toEqual([])
    // La sombra de una conversación MC (su hilo nativo es el X de `sdk:X`) no se lista: sería un duplicado.
    j.bindNative(mc, 'aaa')
    expect(j.sdkConversations('daniel').map(c => c.conversationId)).toEqual(['sdk:bbb'])
  })

  it('ignores zombie turns that have been open for hours', () => {
    let now = 1_000_000
    const { journal: j } = open(':memory:', () => now)
    j.accept(id, {}); j.claim(id, 'w'); j.transition(id, 'running')
    expect(j.activeTurns('daniel')).toHaveLength(1)
    now += 3 * 60 * 60_000 + 1
    expect(j.activeTurns('daniel')).toEqual([])
    expect(j.activeTurns('daniel', 6 * 60 * 60_000)).toHaveLength(1)
  })

  it('deduplicates accepted sends while rejecting identity or payload collisions', () => {
    const { journal: j } = open()
    expect(j.accept(id, { prompt: 'hello', model: 'astra' }).created).toBe(true)
    expect(j.accept(id, { model: 'astra', prompt: 'hello' }).created).toBe(false)
    for (const changed of [{ ...id, account: 'yt' }, { ...id, owner: 'other' }, { ...id, conversationId: 'other' }]) {
      expect(() => j.accept(changed, { prompt: 'hello' })).toThrow(JournalConflict)
      expect(j.get(changed)).toBe(null)
      expect(() => j.events(changed)).toThrow(JournalConflict)
    }
    expect(() => j.accept(id, { prompt: 'changed' })).toThrow(JournalConflict)
  })

  it('claims execution once, queues the same conversation and allows unrelated work', () => {
    const { journal: j } = open(); const queued = { ...id, turnId: 'turn-b' }, other = { ...id, turnId: 'turn-c', conversationId: 'chat-b' }
    for (const turn of [id, queued, other]) j.accept(turn, { prompt: 'hello' })
    expect(j.claim(id, 'worker-a')).toBe(true); expect(j.claim(id, 'worker-b')).toBe(false)
    expect(j.claim(queued, 'worker-b')).toBe(false); expect(j.claim(other, 'worker-b')).toBe(true)
    j.complete(id, { result: 'done' }, { text: 'done' })
    expect(j.claim(queued, 'worker-b')).toBe(true)
  })

  it('preserves native identity, input attachments and snapshots across database restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arbrain-journal-')); dirs.push(dir); const file = join(dir, 'test.db')
    const first = open(file)
    const input = { prompt: 'read', attachments: [{ id: 'attachment-a', path: 'test.png' }], account: 'codex' }
    first.journal.accept(id, input); first.journal.claim(id, 'worker')
    first.journal.bindNative(id, 'thread-native', 'turn-native')
    first.journal.append(id, 'text:0', { type: 'text_delta', text: 'hola' }, { text: 'hola' })
    first.db.close()
    const { journal: next } = open(file)
    expect(next.get(id)).toMatchObject({ input, nativeThreadId: 'thread-native', nativeTurnId: 'turn-native', snapshot: { text: 'hola' }, status: 'dispatching' })
    expect(next.claim(id, 'new-worker')).toBe(false)
    expect(() => next.bindNative(id, 'wrong-thread')).toThrow(JournalConflict)
    expect(() => next.bindNative(id, 'thread-native', '')).toThrow(JournalConflict)
    expect(() => next.bindNative(id, 'thread-native', 'other-turn')).toThrow(JournalConflict)
    expect(next.get(id)?.nativeTurnId).toBe('turn-native')
  })

  it('marks verified worker death uncertain instead of re-executing effects', () => {
    const { journal: j } = open(); j.accept(id, {}); j.claim(id, 'worker'); j.transition(id, 'running')
    expect(j.markWorkerStopped('another-worker')).toBe(0)
    expect(j.markWorkerStopped('worker')).toBe(1)
    expect(j.get(id)?.status).toBe('uncertain'); expect(j.claim(id, 'replacement')).toBe(false)
    const second = { ...id, turnId: 'turn-b' }; j.accept(second, {})
    expect(j.claim(second, 'replacement')).toBe(false)
    j.complete(id, { recovered: true }, { text: 'native completed' })
    expect(j.claim(second, 'replacement')).toBe(true)
  })

  it('estampa startedAt (inicio del turno) al reclamar la entrega sin tocar el payload guardado', () => {
    let now = 5_000
    const { journal: j } = open(':memory:', () => now)
    j.accept(id, {}); j.claim(id, 'model-worker')
    const payload = { text: 'done' }
    now = 9_000_000 // el turno termina mucho después de empezar
    j.complete(id, payload, payload)
    const delivery = j.claimDelivery('sender-a', 100)!
    expect(delivery.payload).toEqual({ text: 'done', startedAt: 5_000 })
    // El payload persistido sigue inmutable: completar de nuevo con el original no choca.
    expect(() => j.complete(id, payload, payload)).not.toThrow()
  })

  it('replays by cursor, deduplicates events and does not truncate at 20,000 events', () => {
    const { journal: j, db } = open(); j.accept(id, {})
    db.transaction(() => { for (let i = 0; i < 20_010; i++) j.append(id, `delta:${i}`, { text: String(i) }) })()
    const page = j.events(id, 20_000)
    expect(page).toHaveLength(10); expect(page[0].event).toEqual({ text: '20000' })
    expect(j.events(id, 0, 1000)).toHaveLength(500)
    expect(j.append(id, 'delta:0', { text: '0' })).toBe(1)
    expect(() => j.append(id, 'delta:0', { text: 'different' })).toThrow(JournalConflict)
  })

  it('persists completion and outbox together, retries delivery without rerunning inference', () => {
    let now = 1000
    const { journal: j } = open(':memory:', () => now)
    j.accept(id, {}); j.claim(id, 'model-worker')
    const payload = { text: 'done', tools: [{ output: '42' }], attachments: [{ id: 'file' }] }
    j.complete(id, payload, payload); j.complete(id, payload, payload)
    const delivery = j.claimDelivery('sender-a', 100)
    expect(delivery).toMatchObject({ payload, attempt: 1 }); expect(j.claimDelivery('sender-b')).toBe(null)
    expect(j.retryDelivery(id.turnId, 'sender-a', 1, 200)).toBe(true)
    expect(j.claimDelivery('sender-b')).toBe(null)
    now += 200
    expect(j.claimDelivery('sender-b', 100)).toMatchObject({ payload, attempt: 2 })
    expect(j.acknowledgeDelivery(id.turnId, 'sender-a', 1)).toBe(false)
    expect(j.acknowledgeDelivery(id.turnId, 'sender-b', 2)).toBe(true)
    expect(j.claimDelivery('sender-b')).toBe(null)
    expect(j.claim(id, 'model-worker')).toBe(false)
    expect(j.events(id)).toHaveLength(1)
  })

  it('recovers a dead delivery lease and rejects stale acknowledgements', () => {
    let now = 1000; const { journal: j } = open(':memory:', () => now)
    j.accept(id, {}); j.claim(id, 'worker'); j.complete(id, { text: 'done' }, {})
    j.claimDelivery('dead', 100); now += 101
    expect(j.acknowledgeDelivery(id.turnId, 'dead', 1)).toBe(false)
    expect(j.claimDelivery('alive', 100)?.attempt).toBe(2)
    expect(j.acknowledgeDelivery(id.turnId, 'alive', 2)).toBe(true)
  })

  it('fences expired delivery attempts even when the worker name is reused', () => {
    let now = 1000; const { journal: j } = open(':memory:', () => now)
    j.accept(id, {}); j.claim(id, 'worker'); j.complete(id, {}, {})
    j.claimDelivery('sender', 100); now += 101
    expect(j.claimDelivery('sender', 100)?.attempt).toBe(2)
    expect(j.acknowledgeDelivery(id.turnId, 'sender', 1)).toBe(false)
    expect(j.retryDelivery(id.turnId, 'sender', 1, 0)).toBe(false)
    expect(j.acknowledgeDelivery(id.turnId, 'sender', 2)).toBe(true)
  })

  it('rolls back terminal state when storing the outbox fails', () => {
    const { journal: j, db } = open(); j.accept(id, {}); j.claim(id, 'worker')
    db.exec("CREATE TRIGGER fail_delivery BEFORE INSERT ON chat_runtime_delivery BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
    expect(() => j.complete(id, { text: 'done' }, {})).toThrow('injected failure')
    expect(j.get(id)?.status).toBe('dispatching'); expect(j.events(id)).toEqual([])
    db.exec('DROP TRIGGER fail_delivery')
    j.complete(id, { text: 'done' }, {})
    expect(j.get(id)?.status).toBe('completed')
  })

  it('keeps terminal states final and prevents a poorer completion winning later', () => {
    const { journal: j } = open(); j.accept(id, {}); j.claim(id, 'worker')
    j.complete(id, { text: 'done', tools: ['tool'] }, { tools: ['tool'] })
    expect(() => j.transition(id, 'running')).toThrow(JournalConflict)
    expect(() => j.complete(id, { text: 'done' }, {})).toThrow(JournalConflict)
    expect(() => j.append(id, 'late-delta', { text: 'partial' }, { text: 'partial' })).toThrow(JournalConflict)
    expect(j.get(id)?.snapshot).toEqual({ tools: ['tool'] })
  })
  it('preserves delivery order inside a conversation while another conversation can deliver', () => {
    let now = 1000
    const { journal: j } = open(':memory:', () => now)
    const b = { ...id, turnId: 'turn-b' }, other = { ...id, conversationId: 'other', turnId: 'other' }
    for (const turn of [id, b, other]) { j.accept(turn, {}); j.claim(turn, 'worker'); j.complete(turn, { turnId: turn.turnId }, {}) }
    const first = j.claimDelivery('sender')!
    expect(first.turnId).toBe(id.turnId)
    j.retryDelivery(first.turnId, 'sender', first.attempt, 5000)
    const independent = j.claimDelivery('sender')!
    expect(independent.turnId).toBe('other')
    j.acknowledgeDelivery(independent.turnId, 'sender', independent.attempt)
    expect(j.claimDelivery('sender')).toBe(null)
    now += 6000
    const retry = j.claimDelivery('sender')!
    expect(retry.turnId).toBe(id.turnId)
    j.acknowledgeDelivery(retry.turnId, 'sender', retry.attempt)
    expect(j.claimDelivery('sender')?.turnId).toBe(b.turnId)
  })
  it('persists cancellation and its delivery atomically before any worker runs', () => {
    const { db, journal: j } = open()
    j.accept(id, { message: 'cancel me' })
    db.exec("CREATE TRIGGER fail_cancel BEFORE INSERT ON chat_runtime_delivery BEGIN SELECT RAISE(ABORT, 'no delivery'); END")
    expect(() => j.cancelQueued(id, { cancelled: true }, {})).toThrow('no delivery')
    expect(j.get(id)?.status).toBe('queued'); expect(j.events(id)).toEqual([])
    db.exec('DROP TRIGGER fail_cancel')
    expect(j.cancelQueued(id, { cancelled: true }, {})).toBeGreaterThan(0)
    expect(j.get(id)?.status).toBe('interrupted')
    expect(j.claimDelivery('sender')?.payload).toMatchObject({ cancelled: true, startedAt: expect.any(Number) })
  })
  it('renews only the current unexpired delivery lease', () => {
    let now = 1000
    const { journal: j } = open(':memory:', () => now)
    j.accept(id, {}); j.claim(id, 'worker'); j.complete(id, {}, {})
    const delivery = j.claimDelivery('sender', 100)!
    now += 50
    expect(j.renewDelivery(id.turnId, 'sender', delivery.attempt, 100)).toBe(true)
    now += 60
    expect(j.claimDelivery('other')).toBe(null)
    now += 100
    expect(j.renewDelivery(id.turnId, 'sender', delivery.attempt)).toBe(false)
    expect(j.claimDelivery('other')?.attempt).toBe(2)
  })

})
