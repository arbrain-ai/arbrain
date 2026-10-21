import { describe, expect, it, vi } from 'vitest'
import { ClaudeCapabilityCatalog, findClaudeModel, summarizeClaudeSettings } from './claude-capabilities.js'
const models = [
  { value: 'default', resolvedModel: 'claude-opus-5[1m]', displayName: 'Default', description: '' },
  { value: 'opus[1m]', resolvedModel: 'claude-opus-5[1m]', displayName: 'Opus 1M', description: '' },
  { value: 'opus', resolvedModel: 'claude-opus-5', displayName: 'Opus', description: '' },
]
describe('Claude runtime capabilities', () => {
  it('does not advertise settings defaults when environment or policy can override them', () => {
    const resolved = { effective: { model: 'opus', effortLevel: 'high' }, provenance: { model: { source: 'user' } } }
    expect(summarizeClaudeSettings(resolved, {})).toEqual({ configuredModel: 'opus', configuredEffort: 'high', settingsSource: 'user' })
    expect(summarizeClaudeSettings(resolved, { CLAUDE_CODE_EFFORT_LEVEL: 'low' })).toMatchObject({ configuredModel: 'opus', configuredEffort: null })
    expect(summarizeClaudeSettings({ ...resolved, effective: { ...resolved.effective, env: { ANTHROPIC_MODEL: 'sonnet', CLAUDE_CODE_EFFORT_LEVEL: 'max' } } }, {})).toMatchObject({ configuredModel: null, configuredEffort: null, settingsSource: null })
    expect(summarizeClaudeSettings({ ...resolved, effective: { ...resolved.effective, policyHelper: 'managed command' } }, {})).toMatchObject({ configuredModel: null, configuredEffort: null })
  })

  it('OpenRouter del alumno: el ANTHROPIC_MODEL que fija el daemon es el modelo configurado (y una variable ajena sigue bloqueando)', () => {
    const vacio = { effective: {} }
    const or = { ARBRAIN_PROVEEDOR_CLAUDE: 'openrouter', ANTHROPIC_MODEL: 'anthropic/claude-sonnet-4.5' }
    expect(summarizeClaudeSettings(vacio, or)).toEqual({ configuredModel: 'anthropic/claude-sonnet-4.5', configuredEffort: null, settingsSource: 'openrouter' })
    expect(summarizeClaudeSettings({ effective: { model: 'opus' }, provenance: { model: { source: 'project' } } }, or)).toMatchObject({ configuredModel: 'opus', settingsSource: 'project' })
    expect(summarizeClaudeSettings(vacio, { ANTHROPIC_MODEL: 'anthropic/claude-sonnet-4.5' })).toMatchObject({ configuredModel: null, unresolvedModel: true })
    const orModels = [{ value: 'sonnet', resolvedModel: 'anthropic/claude-sonnet-4.5', displayName: 'Sonnet', description: '' }]
    expect(findClaudeModel(orModels, 'anthropic/claude-sonnet-4.5')?.value).toBe('sonnet')
  })

  it('preserves context variants and never equates advertised default with configured model', () => {
    expect(findClaudeModel(models, null)).toBeUndefined()
    expect(findClaudeModel(models, 'default')).toBeUndefined()
    expect(findClaudeModel(models, 'claude-opus-5')?.value).toBe('opus')
    expect(findClaudeModel(models, 'claude-opus-5[1m]')?.value).toBe('opus[1m]')
    expect(findClaudeModel(models, 'missing')).toBeUndefined()
  })
  it('coalesces per account, expires metadata and does not cache failures', async () => {
    let now = 0
    const load = vi.fn(async (account: string) => ({ account, observedAt: 'synthetic', models, commandNames: [], agentNames: [] }))
    const catalog = new ClaudeCapabilityCatalog(load, 30, () => now)
    const [a,b,other] = await Promise.all([catalog.read('default'),catalog.read('default'),catalog.read('bro')])
    expect(a).toBe(b); expect(other.account).toBe('bro'); expect(load).toHaveBeenCalledTimes(2)
    now = 31; load.mockRejectedValueOnce(new Error('auth unavailable'))
    await expect(catalog.read('default')).rejects.toThrow('auth unavailable')
    await catalog.read('default'); expect(load).toHaveBeenCalledTimes(4)
    await expect(catalog.read('__proto__')).rejects.toThrow('Unknown')
    expect(load).toHaveBeenCalledTimes(4)
  })
})
