import { describe, expect, it } from 'vitest'
import type { Connection } from './codex-pool.js'
import type { RpcNotification, RpcServerRequest } from './codex-rpc.js'
import { executeCodexTurn } from './codex-turn.js'

function fixture(start: (notify: (n: RpcNotification) => void) => Promise<unknown>) {
  const notifications = new Set<(n: RpcNotification) => void>(), requests = new Set<(r: RpcServerRequest) => void>(), disconnects = new Set<(e: Error) => void>()
  const calls: string[] = []
  const parameters: unknown[] = []
  const notify = (n: RpcNotification) => { for (const listener of notifications) listener(n) }
  const client: Connection = {
    closed: false, close() { throw new Error('Observer must not close shared runtime') },
    onNotification(fn) { notifications.add(fn); return () => { notifications.delete(fn) } },
    onServerRequest(fn) { requests.add(fn); return () => { requests.delete(fn) } },
    onDisconnect(fn) { disconnects.add(fn); return () => { disconnects.delete(fn) } },
    respond() { return true }, reject() { return true },
    async request<T>(method: string, params?: unknown): Promise<T> {
      calls.push(method)
      parameters.push(params)
      if (method === 'turn/start') return await start(notify) as T
      if (method === 'turn/interrupt') notify({ method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'interrupted' } } })
      return {} as T
    },
  }
  return { client, calls, parameters, notify, ask: (r: RpcServerRequest) => { for (const fn of requests) fn(r) }, listeners: () => notifications.size + requests.size + disconnects.size }
}

describe('native turn lifecycle', () => {
  it('requests visible provider summaries without changing the selected effort', async () => {
    const f = fixture(async () => ({ turn: { id: 'turn', status: 'completed' } }))
    for await (const _event of executeCodexTurn(f.client, { threadId: 'thread', input: [], effort: 'xhigh' })) { /* drain */ }
    expect(f.parameters[0]).toMatchObject({ effort: 'xhigh', summary: 'auto' })
  })
  it('sets speed for this turn without changing the native thread tier', async () => {
    const f = fixture(async () => ({ turn: { id: 'turn', status: 'completed' } }))
    for await (const _event of executeCodexTurn(f.client, { threadId: 'thread', input: [], serviceTier: 'default' })) { /* drain */ }
    expect(f.parameters[0]).toMatchObject({ serviceTierForTurn: 'default' })
    expect(f.parameters[0]).not.toHaveProperty('serviceTier')
  })
  it('captures deltas and completion emitted before the start response', async () => {
    const f = fixture(async notify => {
      notify({ method: 'item/agentMessage/delta', params: { threadId: 'thread', turnId: 'turn', itemId: 'message', delta: 'early' } })
      notify({ method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'completed' } } })
      return { turn: { id: 'turn', status: 'inProgress' } }
    })
    const events = []
    for await (const event of executeCodexTurn(f.client, { threadId: 'thread', input: [] })) events.push(event)
    expect(events[0]).toEqual({ type: 'started', threadId: 'thread', turnId: 'turn' })
    expect(events.some(e => e.type === 'update' && e.update.type === 'delta' && e.update.delta === 'early')).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'update', update: { type: 'terminal', status: 'completed' } })
    expect(f.listeners()).toBe(0)
  })

  it('does not resubmit on an ambiguous start failure', async () => {
    const f = fixture(async () => { throw new Error('observation timed out') })
    await expect(executeCodexTurn(f.client, { threadId: 'thread', input: [] }).next()).rejects.toThrow('timed out')
    expect(f.calls).toEqual(['turn/start']); expect(f.listeners()).toBe(0)
  })

  it('sends one explicit interruption and leaves the shared process alone', async () => {
    const f = fixture(async () => ({ turn: { id: 'turn', status: 'inProgress' } }))
    const ac = new AbortController()
    const iterator = executeCodexTurn(f.client, { threadId: 'thread', input: [], signal: ac.signal })
    expect((await iterator.next()).value).toMatchObject({ type: 'started' })
    ac.abort()
    expect((await iterator.next()).value).toMatchObject({ type: 'update', update: { type: 'terminal', status: 'interrupted' } })
    await iterator.next()
    expect(f.calls).toEqual(['turn/start', 'turn/interrupt']); expect(f.listeners()).toBe(0)
  })

  it('never submits an already cancelled turn', async () => {
    const f = fixture(async () => { throw new Error('must not start') })
    const signal = AbortSignal.abort()
    await expect(executeCodexTurn(f.client, { threadId: 'thread', input: [], signal }).next()).rejects.toThrow('before submission')
    expect(f.calls).toEqual([])
  })

  it('finishes a short turn returned already complete without requiring another notification', async () => {
    const f = fixture(async () => ({ turn: { id: 'turn', status: 'completed', items: [{ id: 'answer', type: 'agentMessage', text: 'done' }] } }))
    const events = []
    for await (const event of executeCodexTurn(f.client, { threadId: 'thread', input: [] })) events.push(event)
    expect(events.at(-1)).toMatchObject({ type: 'update', update: { type: 'terminal', status: 'completed' } })
  })
  it('delivers thread-scoped elicitation without a turn ID instead of hanging', async () => {
    const f = fixture(async () => ({ turn: { id: 'turn', status: 'inProgress' } }))
    const iterator = executeCodexTurn(f.client, { threadId: 'thread', input: [] })
    await iterator.next()
    for (const turnId of [null, undefined]) {
      const request = { id: 8, method: 'mcpServer/elicitation/request', params: { threadId: 'thread', turnId } }
      f.ask(request)
      expect((await iterator.next()).value).toEqual({ type: 'request', request })
    }
    await iterator.return(undefined)
  })

})
