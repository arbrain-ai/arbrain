import { describe, it, expect, vi } from 'vitest'
import type { Options, Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { ClaudeRuntimePool, type ClaudeTurnScope } from './claude-pool.js'
import type { ClaudeInteractiveSession, ClaudeBackgroundEvent } from './claude-session.js'
const scope = { owner: 'owner', account: 'default', conversationId: 'chat', turnId: 'turn' }
const drain = async (events: AsyncIterable<SDKMessage>) => { const out = []; for await (const e of events) out.push(e); return out }
function fixture(limit = 8) {
  const created: Array<{ scope: ClaudeTurnScope; options: Options; sink: (event: ClaudeBackgroundEvent) => void; session: ClaudeInteractiveSession }> = []
  const create = vi.fn((scope: ClaudeTurnScope, options: Options, sink: (event: ClaudeBackgroundEvent) => void) => {
    let count = 0
    const state = {
      busy: false, closed: false, hasBackgroundWork: false, sessionId: options.resume ?? `native-${created.length}`, query: {} as Query,
      async *turn() { state.busy = true; try { yield { type: 'result', total_cost_usd: ++count * 2, modelUsage: { opus: { inputTokens: count * 10, outputTokens: count * 4 } } } as unknown as SDKMessage } finally { state.busy = false } },
      detach: vi.fn(), close: vi.fn(() => { state.closed = true }),
    }
    const session = state as unknown as ClaudeInteractiveSession
    created.push({ scope, options, sink, session }); return session
  })
  return { pool: new ClaudeRuntimePool(create, limit), created, create }
}
describe('Claude conversation process pool', () => {
  it('ignores the SDK environment stamp but explicitly discards history for a first-message edit', async () => {
    const f = fixture()
    await drain(f.pool.open(scope, { env: { TEST: 'same' } }, 'original', () => {}).events)
    await drain(f.pool.open(scope, { env: { TEST: 'same', CLAUDE_AGENT_SDK_VERSION: 'synthetic' } }, 'followup', () => {}).events)
    expect(f.created).toHaveLength(1)
    await drain(f.pool.open(scope, { env: { TEST: 'same' }, resume: 'native-0' }, 'replacement', () => {}, true).events)
    expect(f.created).toHaveLength(2)
    expect(f.created[1].options.resume).toBeUndefined()
    expect(f.created[0].session.close).toHaveBeenCalledOnce()
    f.pool.close()
  })
  it('reserves immediately, reuses the exact scope, and refreshes callbacks without cumulative double count', async () => {
    const f = fixture(), firstPermission = vi.fn(), nextPermission = vi.fn(), sink = vi.fn(), nextSink = vi.fn()
    const first = f.pool.open(scope, { canUseTool: firstPermission }, 'first', sink)
    expect(() => f.pool.open(scope, {}, 'overlap', sink)).toThrow('ejecutando')
    await drain(first.events)
    const second = f.pool.open({ ...scope, turnId: 'second' }, { canUseTool: nextPermission }, 'second', nextSink)
    await f.created[0].options.canUseTool!('Read', {}, {} as never)
    expect(nextPermission).toHaveBeenCalledOnce(); expect(firstPermission).not.toHaveBeenCalled()
    const events = await drain(second.events)
    expect(events[0]).toMatchObject({ arbrainUsage: { estimatedCostUsd: 2, cumulativeEstimatedCostUsd: 4, inputTokens: 10, outputTokens: 4 } })
    f.created[0].sink({ type: 'uncertain', turnId: 'second', error: 'synthetic' })
    expect(nextSink).toHaveBeenCalledOnce(); expect(sink).not.toHaveBeenCalled()
    expect(f.create).toHaveBeenCalledOnce(); f.pool.close()
  })
  it('isolates owner/account/conversation and resumes its own native history on configuration change', async () => {
    const f = fixture()
    for (const own of [scope, { ...scope, owner: 'other' }, { ...scope, account: 'bro' }, { ...scope, conversationId: 'other' }]) await drain(f.pool.open(own, { model: 'opus' }, 'hello', () => {}).events)
    expect(f.created).toHaveLength(4)
    const observer = f.pool.inventoryReader(scope)!
    expect(observer.isClosed()).toBe(false)
    expect(f.pool.inventoryReader({ ...scope, owner: 'missing-owner' })).toBeUndefined()
    await drain(f.pool.open(scope, { model: 'sonnet' }, 'changed', () => {}).events)
    expect(observer.isClosed()).toBe(true)
    expect(f.created[4].options.resume).toBe('native-0')
    expect(f.created[0].session.close).toHaveBeenCalledOnce()
    for (const entry of f.created.slice(1, 4)) expect(entry.session.close).not.toHaveBeenCalled()
    f.pool.close()
  })
  it('does not evict background work or run a released lease', async () => {
    const f = fixture(1)
    const lease = f.pool.open(scope, {}, 'never sent', () => {})
    lease.release()
    await expect(drain(lease.events)).rejects.toThrow('released')
    Object.defineProperty(f.created[0].session, 'hasBackgroundWork', { value: true })
    expect(() => f.pool.open({ ...scope, conversationId: 'other' }, {}, 'new', () => {})).toThrow('ocupados')
    expect(f.created[0].session.close).not.toHaveBeenCalled()
    f.pool.close()
  })
})
it('Live handoff invalidates only an idle conversation process', async()=>{
 const f=fixture(),turn=f.pool.open(scope,{},'chat',()=>{})
 expect(()=>f.pool.invalidate(scope)).toThrow(/curso/)
 await drain(turn.events)
 f.pool.invalidate(scope)
 expect(f.created[0].session.close).toHaveBeenCalledOnce()
 await drain(f.pool.open(scope,{resume:'native-0'},'after live',()=>{}).events)
 expect(f.created).toHaveLength(2)
 expect(f.created[1].options.resume).toBe('native-0')
 f.pool.close()
})
describe('mensajes mientras hay tareas de fondo (2 oct)', () => {
  it('same configuration enters the live session while its subagents run', async () => {
    const f = fixture()
    await drain(f.pool.open(scope, { model: 'opus' }, 'lanza subagentes', () => {}).events)
    Object.defineProperty(f.created[0].session, 'hasBackgroundWork', { value: true, configurable: true })
    await drain(f.pool.open({ ...scope, turnId: 'second' }, { model: 'opus' }, 'otro mensaje', () => {}).events)
    expect(f.created).toHaveLength(1); expect(f.created[0].session.close).not.toHaveBeenCalled()
    f.pool.close()
  })
  it('a dead process with unfinished task ids is replaced and resumed, never a refusal', async () => {
    const f = fixture()
    await drain(f.pool.open(scope, { model: 'opus' }, 'lanza subagentes', () => {}).events)
    // Real session: closed ⇒ hasBackgroundWork false. The fixture models the corrected contract.
    const dead = f.created[0].session as unknown as { closed: boolean; hasBackgroundWork: boolean }
    dead.closed = true; dead.hasBackgroundWork = false
    expect(f.pool.busy).toBe(false)
    await drain(f.pool.open({ ...scope, turnId: 'second' }, { model: 'opus' }, 'otro mensaje', () => {}).events)
    expect(f.created).toHaveLength(2); expect(f.created[1].options.resume).toBe('native-0')
    f.pool.close()
  })
  it('a real configuration change waits in line for the background work, then resumes with the new configuration', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture()
      await drain(f.pool.open(scope, { model: 'opus' }, 'lanza subagentes', () => {}).events)
      const live = f.created[0].session as unknown as { hasBackgroundWork: boolean; backgroundReplyOpen: boolean }
      live.hasBackgroundWork = true
      const lease = f.pool.open({ ...scope, turnId: 'second' }, { model: 'sonnet' }, 'cambié de modelo', () => {})
      expect(f.pool.busy).toBe(true)
      expect(() => f.pool.open({ ...scope, turnId: 'third' }, { model: 'sonnet' }, 'otro', () => {})).toThrow('ejecutando')
      const it = lease.events[Symbol.asyncIterator]()
      const first = await it.next()
      expect(first.value).toMatchObject({ type: 'system', subtype: 'status', status: 'esperando_tareas' })
      const pending = it.next()
      await vi.advanceTimersByTimeAsync(5_000)
      expect(f.created).toHaveLength(1); expect(f.created[0].session.close).not.toHaveBeenCalled()
      live.hasBackgroundWork = false; live.backgroundReplyOpen = true
      await vi.advanceTimersByTimeAsync(5_000)
      expect(f.created).toHaveLength(1)
      live.backgroundReplyOpen = false
      await vi.advanceTimersByTimeAsync(2_000)
      expect((await pending).value).toMatchObject({ type: 'result' })
      expect(f.created).toHaveLength(2)
      expect(f.created[1].options).toMatchObject({ model: 'sonnet', resume: 'native-0' })
      expect(f.created[0].session.close).toHaveBeenCalledOnce()
      expect((await it.next()).done).toBe(true)
      expect(f.pool.busy).toBe(false)
      f.pool.close()
    } finally { vi.useRealTimers() }
  })
  it('a waiting message can be cancelled without touching the busy session', async () => {
    const f = fixture()
    await drain(f.pool.open(scope, { model: 'opus' }, 'lanza subagentes', () => {}).events)
    Object.defineProperty(f.created[0].session, 'hasBackgroundWork', { value: true, configurable: true })
    const abort = new AbortController()
    const lease = f.pool.open({ ...scope, turnId: 'second' }, { model: 'sonnet', abortController: abort }, 'cambié de modelo', () => {})
    const interrupt = vi.fn(); (f.created[0].session as unknown as { query: unknown }).query = { interrupt }
    const it = lease.events[Symbol.asyncIterator]()
    await it.next()
    await lease.query.interrupt()
    expect(interrupt).not.toHaveBeenCalled()
    abort.abort()
    await expect(it.next()).rejects.toThrow('Cancelado')
    expect(f.created).toHaveLength(1); expect(f.created[0].session.close).not.toHaveBeenCalled()
    expect(f.pool.busy).toBe(true) // its own background work, not the cancelled lease
    Object.defineProperty(f.created[0].session, 'hasBackgroundWork', { value: false, configurable: true })
    expect(f.pool.busy).toBe(false)
    f.pool.close()
  })
})
