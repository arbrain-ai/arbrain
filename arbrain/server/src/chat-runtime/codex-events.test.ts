import { describe, expect, it } from 'vitest'
import { CodexTurnReducer } from './codex-events.js'

function fixture() {
  const reducer = new CodexTurnReducer('thread-a', 'turn-a')
  const event = (method: string, params: Record<string, unknown>) => reducer.apply({ method, params: { threadId: 'thread-a', turnId: 'turn-a', ...params } })
  return { reducer, event }
}
describe('native turn presentation', () => {
  it('streams before completion and reconciles final content without appending it twice', () => {
    const { reducer, event } = fixture()
    const updates = event('item/agentMessage/delta', { itemId: 'message', delta: 'Hola' })
    expect(updates.at(-1)).toEqual({ type: 'delta', itemId: 'message', field: 'text', delta: 'Hola' })
    event('item/agentMessage/delta', { itemId: 'message', delta: ' mundo' })
    event('item/completed', { item: { id: 'message', type: 'agentMessage', text: 'Hola mundo', phase: 'final_answer' } })
    expect(reducer.snapshot().items[0].text).toBe('Hola mundo')
    expect(event('item/completed', { item: { id: 'message', type: 'agentMessage', text: 'Hola mundo' } })).toEqual([])
  })

  it('rejects another thread or turn on the same multiplexed connection', () => {
    const { reducer, event } = fixture()
    expect(event('item/agentMessage/delta', { threadId: 'other', itemId: 'message', delta: 'private' })).toEqual([])
    expect(event('item/agentMessage/delta', { turnId: 'other', itemId: 'message', delta: 'private' })).toEqual([])
    expect(reducer.snapshot().items).toEqual([])
  })

  it('keeps interleaving of commentary, tool, and final answer', () => {
    const { reducer, event } = fixture()
    event('item/completed', { item: { id: 'comment', type: 'agentMessage', text: 'Voy a revisar', phase: 'commentary' } })
    event('item/started', { item: { id: 'tool', type: 'commandExecution', command: 'echo 42' } })
    event('item/commandExecution/outputDelta', { itemId: 'tool', delta: '42\n' })
    event('item/completed', { item: { id: 'tool', type: 'commandExecution', command: 'echo 42', aggregatedOutput: '42\n', exitCode: 0 } })
    event('item/completed', { item: { id: 'answer', type: 'agentMessage', text: '42', phase: 'final_answer' } })
    expect(reducer.snapshot().items.map(i => i.id)).toEqual(['comment', 'tool', 'answer'])
    expect(reducer.snapshot().items[1].data.aggregatedOutput).toBe('42\n')
  })

  it('exposes only reasoning summaries and stops their item at completion', () => {
    const { reducer, event } = fixture()
    event('item/reasoning/summaryTextDelta', { itemId: 'reason', delta: 'Comparando opciones' })
    event('item/reasoning/textDelta', { itemId: 'reason', delta: 'not a display summary' })
    event('item/completed', { item: { id: 'reason', type: 'reasoning', summary: ['Comparando opciones'], content: ['not a display summary'] } })
    expect(reducer.snapshot().items[0]).toMatchObject({ status: 'completed', text: 'Comparando opciones' })
    expect(JSON.stringify(reducer.snapshot())).not.toContain('not a display summary')
  })

  it('keeps usage categories separate and uses the actual reported context window', () => {
    const { reducer, event } = fixture()
    event('thread/tokenUsage/updated', { tokenUsage: { modelContextWindow: 258400, last: { inputTokens: 1000, outputTokens: 100, reasoningOutputTokens: 80 }, total: { inputTokens: 900000 } } })
    expect(reducer.snapshot().usage).toEqual({ contextWindow: 258400, last: { inputTokens: 1000, outputTokens: 100, reasoningOutputTokens: 80 }, total: { inputTokens: 900000 } })
    event('thread/tokenUsage/updated', { tokenUsage: { last: {}, total: {} } })
    expect(reducer.snapshot().usage?.contextWindow).toBe(null)
  })

  it('preserves image, subagent and unknown future items as structured results', () => {
    const { reducer, event } = fixture()
    for (const item of [
      { id: 'img', type: 'imageGeneration', savedPath: '/synthetic/image.png', status: 'completed' },
      { id: 'agent', type: 'subAgentActivity', agentThreadId: 'child', kind: { type: 'completed' } },
      { id: 'future', type: 'newCapability', result: { value: 42 } },
    ]) event('item/completed', { item })
    expect(reducer.snapshot().items.map(i => i.kind)).toEqual(['imageGeneration', 'subAgentActivity', 'newCapability'])
    expect(reducer.snapshot().items[0].data.savedPath).toBe('/synthetic/image.png')
  })

  it('retains an upstream reroute and terminal error and ignores late deltas', () => {
    const { reducer, event } = fixture()
    event('model/rerouted', { fromModel: 'requested', toModel: 'served', reason: 'capacity' })
    event('error', { error: { message: 'retrying' } })
    expect(reducer.snapshot().status).toBe('running')
    event('turn/completed', { turn: { id: 'turn-a', status: 'failed', error: { message: 'quota exhausted' } } })
    expect(event('item/agentMessage/delta', { itemId: 'late', delta: 'stale' })).toEqual([])
    expect(reducer.snapshot()).toMatchObject({ servedModel: 'served', status: 'failed', error: 'quota exhausted', items: [] })
  })

  it('reconciles completed-turn items when intermediate notifications were absent', () => {
    const { reducer, event } = fixture()
    event('turn/completed', { turn: { id: 'turn-a', status: 'completed', items: [{ id: 'answer', type: 'agentMessage', text: 'Recovered' }] } })
    expect(reducer.snapshot()).toMatchObject({ status: 'completed', items: [{ id: 'answer', text: 'Recovered' }] })
    const snapshot = reducer.snapshot(); snapshot.items[0].text = 'external mutation'
    expect(reducer.snapshot().items[0].text).toBe('Recovered')
  })
})
