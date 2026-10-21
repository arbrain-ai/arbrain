import Database from 'better-sqlite3'
import { createServer, get, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatJournal, type TurnIdentity } from './journal.js'
import { ChatSupervisor, type JobRunner } from './supervisor.js'
import { streamDurableTurn } from './http-stream.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanup.splice(0)) await close() })
const id: TurnIdentity = { owner: 'owner', account: 'codex', conversationId: 'chat', turnId: 'turn' }
const result = { status: 'completed' as const, payload: { complete: true }, snapshot: { text: 'finished' } }
async function fixture(run: JobRunner) {
  const db = new Database(':memory:')
  const journal = new ChatJournal(db)
  const worker = new ChatSupervisor(journal, { workerId: 'worker', run, deliver: async () => true, workerConfirmedDead: () => false })
  const responses = new Set<ServerResponse>()
  const server = createServer((req, res) => {
    responses.add(res); res.on('close', () => responses.delete(res))
    const query = new URL(req.url!, 'http://localhost').searchParams
    streamDurableTurn(res, worker, journal.get(id)!, Number(query.get('after') ?? 0), 20, query.get('snapshot') === 'true')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  cleanup.push(async () => {
    worker.stop(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    db.close()
  })
  return { worker, journal, responses, url: `http://127.0.0.1:${address.port}` }
}

describe('durable HTTP observer with real sockets', () => {
  it('disconnects mid-turn, finishes without an observer, and resumes strictly after its cursor without executing twice', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let executionSignal!: AbortSignal
    const run = vi.fn<JobRunner>(async (_turn, emit, signal) => {
      executionSignal = signal
      emit({ type: 'text_delta', text: 'first' })
      await gate
      emit({ type: 'text_delta', text: 'second' })
      return result
    })
    const { worker, journal, responses, url } = await fixture(run)
    worker.start(); worker.accept(id, { message: 'hello' })
    const abort = new AbortController()
    const response = await fetch(url, { signal: abort.signal })
    const reader = response.body!.getReader()
    let received = ''
    while (!received.includes('first')) received += new TextDecoder().decode((await reader.read()).value)
    const cursor = Number(received.match(/id: (\d+)/)![1])
    abort.abort()
    await vi.waitFor(() => expect(responses.size).toBe(0))
    expect(executionSignal.aborted).toBe(false)
    release()
    await vi.waitFor(() => expect(journal.get(id)!.status).toBe('completed'))
    expect(worker.accept(id, { message: 'hello' }).created).toBe(false)
    const replay = await (await fetch(`${url}?after=${cursor}`)).text()
    expect(replay).not.toContain('first')
    expect(replay).toContain('second')
    expect(replay).toContain('"type":"terminal"')
    expect(replay).toContain('[DONE]')
    expect([...replay.matchAll(/id: (\d+)/g)].map(match => Number(match[1]))).toEqual(journal.events(id, cursor).map(row => row.cursor))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('bounds buffering for a paused reader and catches up through a terminal event written during replay', async () => {
    const { worker, journal, responses, url } = await fixture(async () => result)
    journal.accept(id, { message: 'large replay' }); journal.claim(id, 'worker')
    const text = 'x'.repeat(64 * 1024)
    for (let i = 0; i < 160; i++) journal.append(id, String(i), { type: 'text_delta', text })
    const incoming = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
      get(url, response => { response.pause(); resolve(response) }).on('error', reject)
    })
    await vi.waitFor(() => expect([...responses][0]?.writableNeedDrain).toBe(true))
    // Ten MB of replay stays in the journal, not in an unbounded write queue.
    expect([...responses][0].writableLength).toBeLessThan(256 * 1024)
    journal.complete(id, {}, { text: 'finished' })
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      incoming.on('data', chunk => chunks.push(chunk))
      incoming.on('end', resolve); incoming.on('error', reject); incoming.resume()
    })
    const replay = Buffer.concat(chunks).toString()
    expect([...replay.matchAll(/id: (\d+)/g)].map(match => Number(match[1]))).toEqual(journal.events(id, 0, 500).map(row => row.cursor))
    expect(replay.endsWith('data: [DONE]\n\n')).toBe(true)
    worker.stop()
  })

  it('drains completion committed by another writer between its page and status reads', async () => {
    const { journal, url } = await fixture(async () => result)
    journal.accept(id, {}); journal.claim(id, 'external')
    journal.append(id, 'first', { type: 'text_delta', text: 'first' })
    const original = journal.events.bind(journal)
    let injected = false
    vi.spyOn(journal, 'events').mockImplementation((scope, after, limit) => {
      const page = original(scope, after, limit)
      if (limit === 32 && !injected) {
        injected = true
        journal.append(id, 'tail', { type: 'text_delta', text: 'tail' })
        journal.complete(id, {}, {})
      }
      return page
    })
    const replay = await (await fetch(url)).text()
    expect(replay).toContain('tail')
    expect(replay).toContain('"type":"terminal"')
    expect([...replay.matchAll(/id: (\d+)/g)]).toHaveLength(3)
  })

  it('observes another worker completing an idle stream without local notifications', async () => {
    const { journal, url } = await fixture(async () => result)
    journal.accept(id, {}); journal.claim(id, 'external')
    const response = await fetch(url)
    // Headers/meta arrived after an empty replay; this writer has no access to
    // the observing supervisor's listener map.
    journal.append(id, 'external-tail', { type: 'text_delta', text: 'external result' })
    journal.complete(id, {}, {})
    const replay = await response.text()
    expect(replay).toContain('external result')
    expect(replay.endsWith('data: [DONE]\n\n')).toBe(true)
  })

  it('a turn queued behind another of the same conversation says so instead of staying silent', async () => {
    const { journal, url } = await fixture(async () => result)
    const delante = { ...id, turnId: 'turn-delante' }
    journal.accept(delante, { message: 'primero' }); journal.claim(delante, 'external')
    journal.accept(id, { message: 'segundo' })
    const response = await fetch(url)
    const reader = response.body!.getReader()
    let received = ''
    while (!received.includes('en_fila_turno')) received += new TextDecoder().decode((await reader.read()).value)
    expect(received).toContain('"type":"status","status":"en_fila_turno"')
    await reader.cancel()
  })

  it('the queue frame says what is ahead and refreshes when an aviso yields to Daniel', async () => {
    const { journal, url } = await fixture(async () => result)
    const aviso = { ...id, turnId: 'turn-aviso' }
    journal.accept(aviso, { message: '[Aviso del motor s-1]', despertador: { id: 's-1', texto: 'x', programadoPara: 1, disparo: 1, tipo: 'subagente' } }); journal.claim(aviso, 'external')
    journal.accept(id, { message: 'Daniel' })
    const response = await fetch(url)
    const reader = response.body!.getReader()
    let received = ''
    while (!received.includes('en_fila_turno')) received += new TextDecoder().decode((await reader.read()).value)
    expect(received).toContain('"fila":{"mensajes":0,"avisos":1,"pregunta":false,"cediendo":false}')
    journal.cederADaniel(id, () => 'turn-reencolado')
    while (!received.includes('"cediendo":true')) received += new TextDecoder().decode((await reader.read()).value)
    await reader.cancel()
  })

  it('a queued turn with nothing ahead does not claim to be waiting', async () => {
    const { journal, url } = await fixture(async () => result)
    journal.accept(id, { message: 'solo' })
    const response = await fetch(url)
    journal.claim(id, 'external'); journal.complete(id, {}, {})
    expect(await response.text()).not.toContain('en_fila_turno')
  })

  it('sends an authoritative snapshot and only the tail after its cursor', async () => {
    const { journal, url } = await fixture(async () => result)
    journal.accept(id, { message: 'hello' }); journal.claim(id, 'external')
    journal.append(id, 'old', { type: 'text_delta', text: 'old delta' }, { text: 'snapshot text', status: 'running' }, true)
    journal.append(id, 'tail', { type: 'text_delta', text: 'tail' })
    const response = await fetch(`${url}?snapshot=true`)
    journal.complete(id, {}, { text: 'snapshot texttail' })
    const replay = await response.text()
    expect(replay).toContain('"type":"resume_snapshot"')
    expect(replay).toContain('snapshot text')
    expect(replay).not.toContain('old delta')
    expect([...replay.matchAll(/id: (\d+)/g)].map(match => Number(match[1]))).toEqual([2, 3])
  })
})
