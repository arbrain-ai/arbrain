import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SSEEvent } from '../agent.js'
const f = vi.hoisted(() => ({ open: vi.fn(), query: vi.fn(), release: vi.fn(), validate: vi.fn(), events: [] as Record<string, unknown>[] }))
vi.mock('./claude-selection.js', async () => ({ ...await vi.importActual('./claude-selection.js'), validateClaudeSelection: f.validate }))
vi.mock('./claude-pool.js', () => ({ claudeRuntimePool: { open: f.open } }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: f.query, getSessionMessages: vi.fn() }))
vi.mock('../ops-logger.js', () => ({ opsLogger: { log: vi.fn() } }))
vi.mock('../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
import { runAgentStream } from '../agent.js'
const scope = { owner: 'owner', account: 'default', conversationId: 'chat', turnId: 'turn' }
const collect = async (events: AsyncIterable<SSEEvent>) => { const out: SSEEvent[] = []; for await (const event of events) out.push(event); return out }
beforeEach(() => {
  vi.clearAllMocks()
  f.validate.mockResolvedValue(undefined)
  f.events = [
    { type: 'system', subtype: 'init', session_id: 'native', model: 'claude-opus-5', slash_commands: [] },
    { type: 'assistant', user_message_uuid: 'turn', session_id: 'native', message: { id: 'a', model: 'claude-opus-5', content: [], usage: { input_tokens: 3, cache_read_input_tokens: 20, cache_creation_input_tokens: 4 } } },
    { type: 'result', subtype: 'success', is_error: false, result: 'done', user_message_uuid: 'turn', session_id: 'native', usage: { input_tokens: 3, output_tokens: 2 }, modelUsage: { 'claude-opus-5': { contextWindow: 200_000 } }, total_cost_usd: 8, arbrainUsage: { estimatedCostUsd: 2, cumulativeEstimatedCostUsd: 8, inputTokens: 4, outputTokens: 2, cacheReadTokens: 20, cacheWriteTokens: 4, kind: 'estimate', scope: 'query_since_previous_result' } },
  ]
  f.open.mockImplementation(() => ({ query: { interrupt: vi.fn().mockResolvedValue(undefined) }, session: { close: vi.fn() }, release: f.release, events: (async function* () { yield* f.events })() }))
})
const run = () => collect(runAgentStream('synthetic', 'native', undefined, undefined, undefined, 'web', false, undefined, undefined, { model: 'claude-opus-5', effort: 'xhigh', fast: false, ultracode: false }, { scope, onBackground: () => {} }))
describe('durable Claude runner uses persistent transport', () => {
  it('uses frozen settings over later conversation changes and refuses invalid selection before native submission', async () => {
    const selection = { account: 'default', requestedModel: 'opus', model: 'claude-opus-5', effort: 'xhigh' as const, fast: false, ultracode: false, adaptiveThinking: true, observedAt: 'synthetic', source: 'user' }
    const frozenRun = () => collect(runAgentStream('synthetic', 'native', undefined, 'max', undefined, 'web', false, undefined, undefined, { model: 'haiku', effort: 'low', fast: true, ultracode: true }, { scope, onBackground: () => {}, selection }))
    await frozenRun()
    expect(f.validate).toHaveBeenCalledWith(expect.any(String), 'default', selection, expect.any(Object))
    expect(f.open.mock.calls[0][1]).toMatchObject({ model: 'claude-opus-5', effort: 'xhigh', settings: { fastMode: false, ultracode: false } })
    expect(f.open.mock.calls[0][1].betas).toBeUndefined()
    f.open.mockClear(); f.validate.mockRejectedValueOnce(new Error('model removed'))
    expect((await frozenRun()).at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('model removed') })
    expect(f.open).toHaveBeenCalledOnce(); expect(f.query).not.toHaveBeenCalled()
    expect(f.release).toHaveBeenCalledTimes(2)
  })
  it('binds confirmed UUID, projects scoped usage and releases only the observation lease', async () => {
    const events = await run()
    expect(f.query).not.toHaveBeenCalled()
    expect(f.open.mock.calls[0][0]).toEqual(scope)
    expect(events).toContainEqual({ type: 'native_turn', threadId: 'native', turnId: 'turn', account: 'default' })
    expect(events).toContainEqual(expect.objectContaining({ type: 'usage', costUsd: 2, inputTokens: 4, contextUsed: 27, contextTotal: 200_000, accounting: expect.objectContaining({ billing: 'subscription', cumulativeEstimatedCostUsd: 8 }) }))
    expect(f.release).toHaveBeenCalledOnce()
  })
  it('does not reuse another turn context window or invent 1M when the runtime omits it', async () => {
    await run()
    f.events = [f.events[0], { ...f.events[2], modelUsage: {} }]
    const events = await run()
    expect(events.find(e => e.type === 'usage')).toMatchObject({ contextUsed: undefined, contextTotal: undefined })
  })
  it('never retries a missing durable native history with a fresh empty conversation', async () => {
    f.events = [{ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['No conversation found with session ID native'] }]
    const events = await run()
    expect(f.open).toHaveBeenCalledOnce()
    expect(events.at(-1)).toMatchObject({ type: 'error' })
    expect(f.release).toHaveBeenCalledOnce()
  })
})
