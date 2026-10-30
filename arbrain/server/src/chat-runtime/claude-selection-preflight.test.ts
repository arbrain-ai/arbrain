import { beforeEach, describe, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({ settings: vi.fn() }))
vi.mock('./claude-capabilities.js', async () => ({ ...await vi.importActual('./claude-capabilities.js'), readClaudeSettings: f.settings }))
import { validateClaudeSelection, type ClaudeSelection } from './claude-selection.js'
const selection: ClaudeSelection = { account: 'default', requestedModel: 'opus', model: 'claude-opus-test', effort: 'high', fast: false, ultracode: false, adaptiveThinking: true, observedAt: 'accepted', source: 'user' }
const row = { value: 'opus', resolvedModel: selection.model, displayName: 'Opus', description: '', supportedEffortLevels: ['high'] as ['high'], supportsAdaptiveThinking: true }
beforeEach(() => { vi.clearAllMocks(); f.settings.mockResolvedValue({ configuredModel: 'later-default', configuredEffort: 'low', settingsSource: 'user' }) })
describe('Claude preflight on the leased process', () => {
  it('keeps accepted settings despite later defaults, but fails closed for a new environment override or removed model', async () => {
    const query = { supportedModels: vi.fn().mockResolvedValue([row]) }
    await validateClaudeSelection('/synthetic', 'default', selection, query)
    expect(query.supportedModels).toHaveBeenCalledOnce()
    expect(f.settings).toHaveBeenCalledWith('/synthetic', 'default')
    f.settings.mockResolvedValueOnce({ configuredModel: 'opus', configuredEffort: null, unresolvedEffort: true })
    await expect(validateClaudeSelection('/synthetic', 'default', selection, query)).rejects.toThrow('variable de entorno')
    query.supportedModels.mockResolvedValue([])
    await expect(validateClaudeSelection('/synthetic', 'default', selection, query)).rejects.toThrow('no se sustituirá')
  })
  it('bounds a stalled metadata response without ever submitting input', async () => {
    vi.useFakeTimers()
    try {
      const pending = validateClaudeSelection('/synthetic', 'default', selection, { supportedModels: () => new Promise(() => {}) })
      const rejected = expect(pending).rejects.toThrow('preflight timed out')
      await vi.advanceTimersByTimeAsync(15_000)
      await rejected
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
})
