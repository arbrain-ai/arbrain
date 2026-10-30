import { describe, expect, it } from 'vitest'
import { CodexSseProjection } from './codex-sse.js'
import type { RuntimeItem } from './codex-events.js'
const item = (id: string, kind: string, text = '', status: RuntimeItem['status'] = 'running', data = {}): RuntimeItem => ({ id, kind, text, status, data })

describe('native events projected into the existing chat', () => {
  it('streams before item completion and does not duplicate authoritative final text', () => {
    const p = new CodexSseProjection('astra')
    p.apply({ type: 'item', item: item('a', 'agentMessage') })
    expect(p.apply({ type: 'delta', itemId: 'a', field: 'text', delta: 'Hola' })).toContainEqual({ type: 'text_delta', text: 'Hola' })
    expect(p.apply({ type: 'item', item: item('a', 'agentMessage', 'Hola', 'completed') }).filter(e => e.type === 'text_delta')).toEqual([])
    expect(p.apply({ type: 'terminal', status: 'completed', error: null })).toContainEqual({ type: 'result', text: 'Hola', terminalReason: 'completed' })
  })
  it('preserves commentary boundaries and emits messages returned without deltas', () => {
    const p = new CodexSseProjection('astra')
    p.apply({ type: 'item', item: item('a', 'agentMessage', 'Revisando.', 'completed') })
    expect(p.apply({ type: 'item', item: item('b', 'agentMessage', 'Resultado.', 'completed') })).toContainEqual({ type: 'text_delta', text: '\n\nResultado.' })
    expect(p.apply({ type: 'terminal', status: 'completed', error: null })).toContainEqual({ type: 'result', text: 'Revisando.\n\nResultado.', terminalReason: 'completed' })
  })
  it('stops thinking when the reasoning item ends, while the turn can continue', () => {
    const p = new CodexSseProjection('astra')
    expect(p.apply({ type: 'item', item: item('r', 'reasoning') })).toContainEqual({ type: 'thinking_start' })
    expect(p.apply({ type: 'delta', itemId: 'r', field: 'text', delta: 'Resumen' })).toContainEqual({ type: 'thinking_delta', text: 'Resumen' })
    expect(p.apply({ type: 'item', item: item('r', 'reasoning', 'Resumen', 'completed') })).toContainEqual({ type: 'thinking_stop' })
  })
  it('uses actual last-turn tokens and context, without adding overlapping reasoning tokens', () => {
    const p = new CodexSseProjection('astra')
    const events = p.apply({ type: 'usage', usage: { contextWindow: 258400, last: { inputTokens: 100, outputTokens: 25, reasoningOutputTokens: 20, totalTokens: 125 }, total: { inputTokens: 9000, outputTokens: 400 } } })
    expect(events.find(e => e.type === 'usage')).toMatchObject({ inputTokens: 100, outputTokens: 25, contextUsed: 125, contextTotal: 258400 })
    expect(p.apply({ type: 'usage', usage: { contextWindow: null, last: {}, total: {} } }).find(e => e.type === 'usage')).toMatchObject({ contextTotal: undefined })
  })
  it('preserves structured artifacts and exposes failed command results', () => {
    const p = new CodexSseProjection('astra')
    const update = { type: 'item' as const, item: item('tool', 'commandExecution', '', 'failed', { command: 'false', aggregatedOutput: 'failed', exitCode: 1 }) }
    const events = p.apply(update)
    expect(events[0]).toEqual({ type: 'native_update', update })
    expect(events).toContainEqual({ type: 'tool_start', toolId: 'tool', toolName: 'Bash' })
    expect(events.find(e => e.type === 'tool_result')).toMatchObject({ content: 'failed', isError: true })
    const image = { type: 'item' as const, item: item('image', 'imageGeneration', '', 'completed', { savedPath: '/tmp/image.png' }) }
    expect(p.apply(image)[0]).toEqual({ type: 'native_update', update: image })
  })
  it('reports interrupted partial output distinctly from success', () => {
    const p = new CodexSseProjection('astra')
    p.apply({ type: 'item', item: item('a', 'agentMessage', 'Parcial') })
    const events = p.apply({ type: 'terminal', status: 'interrupted', error: null })
    expect(events).toContainEqual({ type: 'interrupt' })
    expect(events).toContainEqual({ type: 'result', text: 'Parcial', terminalReason: 'interrupted' })
  })
  it('keeps failed partial output visible without emitting a success-save result', () => {
    const p = new CodexSseProjection('astra')
    p.apply({ type: 'item', item: item('a', 'agentMessage', 'Voy a revisar') })
    const events = p.apply({ type: 'terminal', status: 'failed', error: 'quota exhausted' })
    expect(events.filter(e => e.type === 'result')).toEqual([])
    expect(events).toContainEqual({ type: 'error', message: 'quota exhausted\n\nRespuesta parcial:\nVoy a revisar' })
    expect(events[0]).toMatchObject({ type: 'native_update', update: { type: 'terminal', status: 'failed' } })
  })
  it('counts all model calls in a turn, subtracts old turns and tolerates duplicate usage', () => {
    for (const previous of [0, 9000]) {
      const p = new CodexSseProjection('astra')
      p.apply({ type: 'usage', usage: { contextWindow: 258400, last: { inputTokens: 100, outputTokens: 10 }, total: { inputTokens: previous + 100, outputTokens: previous + 10 } } })
      const update = { type: 'usage' as const, usage: { contextWindow: 258400, last: { inputTokens: 150, outputTokens: 20, totalTokens: 170 }, total: { inputTokens: previous + 250, outputTokens: previous + 30 } } }
      for (let i = 0; i < 2; i++) expect(p.apply(update).find(e => e.type === 'usage')).toMatchObject({ inputTokens: 250, outputTokens: 30, contextUsed: 170 })
    }
  })

})
