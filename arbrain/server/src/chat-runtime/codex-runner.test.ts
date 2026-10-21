import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeTurnEvent } from './codex-turn.js'
import type { SSEEvent } from '../agent.js'
import { RpcConnectionError } from './codex-rpc.js'
const f = vi.hoisted(() => ({
  request: vi.fn(), validateSelection: vi.fn(), connection: vi.fn(), respond: vi.fn(), reject: vi.fn(),
  events: [] as NativeTurnEvent[], execute: vi.fn(),
}))
vi.mock('./codex-pool.js', () => ({ CodexRuntimePool: class { request = f.request; validateSelection = f.validateSelection; connection = f.connection } }))
vi.mock('./codex-turn.js', () => ({ executeCodexTurn: (...args: unknown[]) => { f.execute(...args); return (async function* () { yield* f.events })() } }))
vi.mock('../ops-logger.js', () => ({ opsLogger: { log: vi.fn() } }))
import { answerCodexQuestion, runCodexStream } from '../codex-agent.js'
const collect = async (iterator: AsyncGenerator<SSEEvent>) => { const result = []; for await (const e of iterator) result.push(e); return result }
const overrides = { model: 'gpt-6-astra', effort: 'xhigh' as const, fast: false, ultracode: false }

beforeEach(() => {
  vi.clearAllMocks()
  f.connection.mockResolvedValue({ request: f.request, respond: f.respond, reject: f.reject })
  f.validateSelection.mockResolvedValue({ value: 'gpt-6-astra' })
  f.request.mockResolvedValue({ thread: { id: 'thread', status: { type: 'idle' } }, model: 'gpt-6-astra' })
  f.respond.mockReturnValue(true)
  f.events = [{ type: 'started', threadId: 'thread', turnId: 'turn' }, { type: 'update', update: { type: 'terminal', status: 'completed', error: null } }]
})

describe('daemon OpenAI runner integration', () => {
  it('executes the frozen selection even when legacy overrides differ', async () => {
    const selection = { model: 'gpt-5.5', effort: 'ultra', serviceTier: 'priority' }
    await collect(runCodexStream('queued', undefined, undefined, 'low', 'web', [], overrides, 'yt', undefined, selection))
    expect(f.validateSelection).toHaveBeenCalledWith('yt', selection)
    expect(f.request).toHaveBeenCalledWith('thread/start', expect.objectContaining({ model: selection.model }))
    expect(f.execute.mock.calls[0][1]).toMatchObject(selection)
  })
  it('rejects an expired frozen capability before any native mutation', async () => {
    f.validateSelection.mockRejectedValueOnce(new Error('This model does not support the selected service tier'))
    const events = await collect(runCodexStream('queued', undefined, undefined, undefined, 'web', [], overrides, 'yt', undefined, { model: 'gpt-6-astra', effort: 'ultra', serviceTier: 'priority' }))
    expect(events).toEqual([{ type: 'error', message: 'This model does not support the selected service tier' }])
    expect(f.request).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled()
  })
  it('uses the selected account, validates before submitting, and binds identities early', async () => {
    const events = await collect(runCodexStream('Hola', undefined, undefined, undefined, 'web', [], overrides, 'yt'))
    expect(f.connection).toHaveBeenCalledWith('yt')
    expect(f.validateSelection).toHaveBeenCalledWith('yt', { model: 'gpt-6-astra', effort: 'xhigh' })
    expect(f.request).toHaveBeenCalledWith('thread/start', expect.objectContaining({ model: 'gpt-6-astra', modelProvider: 'openai' }))
    expect(events[0]).toEqual({ type: 'init', sessionId: 'thread' })
    expect(events).toContainEqual({ type: 'native_turn', threadId: 'thread', turnId: 'turn', account: 'yt' })
    expect(events.at(-1)).toMatchObject({ type: 'result', terminalReason: 'completed' })
  })
  it('resumes the requested thread without replaying client history', async () => {
    await collect(runCodexStream('nuevo', 'thread', undefined, undefined, 'web', [], overrides))
    expect(f.request).toHaveBeenCalledWith('thread/resume', expect.objectContaining({ threadId: 'thread', excludeTurns: true }))
    expect(f.execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ threadId: 'thread', input: [{ type: 'text', text: 'nuevo' }] }))
  })
  it.each([undefined, 'thread'])('requests the account maximum on start/resume (%s)', async threadId => {
    f.validateSelection.mockResolvedValueOnce({ contextWindow: 272000, maxContextWindow: 872000, effectiveContextPercent: 95 })
    await collect(runCodexStream('hola', threadId, undefined, undefined, 'web', [], overrides, 'yt'))
    expect(f.request).toHaveBeenCalledWith(threadId ? 'thread/resume' : 'thread/start', expect.objectContaining({
      config: { model_context_window: 872000, model_auto_compact_token_limit: 784800 },
    }))
  })
  it('does not invent capacity when the selected account has no metadata', async () => {
    await collect(runCodexStream('hola', undefined, undefined, undefined, 'web', [], overrides))
    expect(f.request.mock.calls[0][1]).not.toHaveProperty('config')
  })
  it('replaces the context policy when resuming with a smaller model', async () => {
    f.validateSelection.mockResolvedValueOnce({ contextWindow: 128000, maxContextWindow: null, effectiveContextPercent: 95 })
    const selection = { model: 'gpt-5.5', effort: 'high', serviceTier: 'default' }
    await collect(runCodexStream('hola', 'thread', undefined, undefined, 'web', [], overrides, 'codex', undefined, selection))
    expect(f.request).toHaveBeenCalledWith('thread/resume', expect.objectContaining({
      model: selection.model, config: { model_context_window: 128000, model_auto_compact_token_limit: 115200 },
    }))
  })
  it('forks before an edit and binds the new thread before sending the replacement', async () => {
    f.validateSelection.mockResolvedValueOnce({ contextWindow: 272000, maxContextWindow: 872000, effectiveContextPercent: 95 })
    f.request.mockImplementation(async method => method === 'thread/read' ? { thread: { id: 'parent', status: { type: 'idle' } } }
      : method === 'thread/turns/list' ? { data: [{ id: 'old-turn', items: [{ type: 'userMessage', content: [{ type: 'text', text: 'old' }] }] }] }
        : { thread: { id: 'thread', status: { type: 'idle' } }, model: 'gpt-6-astra' })
    const events = await collect(runCodexStream('replacement', 'parent', undefined, undefined, 'web', [], overrides, 'codex', { originalText: 'old', occurrenceFromEnd: 1 }))
    expect(f.request).toHaveBeenCalledWith('thread/fork', expect.objectContaining({
      config: { model_context_window: 872000, model_auto_compact_token_limit: 784800 },
    }))
    expect(events[0]).toEqual({ type: 'native_branch', parentThreadId: 'parent', beforeTurnId: 'old-turn', threadId: 'thread' })
    expect(f.execute.mock.calls[0][1]).toMatchObject({ threadId: 'thread', input: [{ type: 'text', text: 'replacement' }] })
  })
  it('does not fall back to another account or submit when model/auth validation fails', async () => {
    f.validateSelection.mockRejectedValueOnce(new Error('subscription required'))
    const events = await collect(runCodexStream('hola', undefined, undefined, undefined, 'web', [], overrides, 'yt'))
    expect(events).toEqual([{ type: 'error', message: 'subscription required' }])
    expect(f.connection).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled()
  })
  it('distinguishes read-only edit lookup timeout from an ambiguous fork dispatch', async () => {
    f.request.mockRejectedValueOnce(new RpcConnectionError('read timeout'))
    const preflight = await collect(runCodexStream('new', 'parent', undefined, undefined, 'web', [], overrides, 'codex', { originalText: 'old', occurrenceFromEnd: 1 }))
    expect(preflight).toEqual([{ type: 'error', message: 'read timeout' }])
    f.request.mockResolvedValueOnce({ thread: { id: 'parent' } }).mockResolvedValueOnce({ data: [{ id: 'old-turn', items: [{ type: 'userMessage', content: [{ type: 'text', text: 'old' }] }] }] }).mockRejectedValueOnce(new RpcConnectionError('fork timeout'))
    const fork = await collect(runCodexStream('new', 'parent', undefined, undefined, 'web', [], overrides, 'codex', { originalText: 'old', occurrenceFromEnd: 1 }))
    expect(fork).toEqual([{ type: 'error', message: 'fork timeout', uncertain: true }])
    expect(f.execute).not.toHaveBeenCalled()
  })
  it('does not start a second turn when the native session is still active', async () => {
    f.request.mockResolvedValueOnce({ thread: { id: 'thread', status: { type: 'active' } }, model: 'gpt-6-astra' })
    const events = await collect(runCodexStream('hola', 'thread', undefined, undefined, 'web', [], overrides))
    expect(events.at(-1)).toMatchObject({ type: 'error' })
    expect(f.execute).not.toHaveBeenCalled()
  })
  it('refuses a different resumed identity and an already aborted request', async () => {
    f.request.mockResolvedValueOnce({ thread: { id: 'wrong' }, model: 'gpt-6-astra' })
    expect((await collect(runCodexStream('hola', 'thread', undefined, undefined, 'web', [], overrides))).at(-1)).toMatchObject({ type: 'error' })
    f.request.mockClear()
    await collect(runCodexStream('hola', undefined, AbortSignal.abort(), undefined, 'web', [], overrides))
    expect(f.request).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled()
  })
  it('maps user answers to native question IDs, handles each request once, and cleans up unanswered requests', async () => {
    const question = { id: 'choice', question: '¿Qué alcance?', header: 'Alcance', options: [{ label: 'Todo', description: 'Completo' }] }
    f.events = [{ type: 'request', request: { id: 7, method: 'item/tool/requestUserInput', params: { questions: [question], threadId: 'thread', turnId: 'turn' } } }]
    for await (const event of runCodexStream('hola', undefined, undefined, undefined, 'web', [], overrides)) {
      if (event.type !== 'ask_user_question') continue
      expect(answerCodexQuestion(event.requestId, { '¿Qué alcance?': 'Todo' })).toBe(true)
      expect(answerCodexQuestion(event.requestId, { '¿Qué alcance?': 'Todo' })).toBe(false)
    }
    expect(f.respond).toHaveBeenCalledWith(7, { answers: { choice: { answers: ['Todo'] } } })
    let unansweredId = ''
    for await (const event of runCodexStream('hola', undefined, undefined, undefined, 'web', [], overrides)) {
      if (event.type === 'ask_user_question') unansweredId = event.requestId
    }
    expect(answerCodexQuestion(unansweredId, null)).toBe(false)
    expect(f.reject).toHaveBeenCalledWith(7, expect.stringContaining('terminó'))
  })
  it('does not claim an answer was delivered if the connection rejected it', async () => {
    f.respond.mockReturnValueOnce(false)
    f.events = [{ type: 'request', request: { id: 8, method: 'item/tool/requestUserInput', params: { questions: [{ id: 'q', question: 'Pregunta', header: 'Q' }], threadId: 'thread', turnId: 'turn' } } }]
    for await (const event of runCodexStream('hola', undefined, undefined, undefined, 'web', [], overrides)) {
      if (event.type === 'ask_user_question') expect(answerCodexQuestion(event.requestId, null)).toBe(false)
    }
    expect(f.reject).toHaveBeenCalledWith(8, expect.any(String))
  })
})
