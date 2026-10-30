import { describe, it, expect } from 'vitest'
import { freezeClaudeSelection, checkClaudeSelection, claudeSelectionOptions } from './claude-selection.js'
import { summarizeClaudeSettings, type ClaudeCapabilities } from './claude-capabilities.js'
const catalog: ClaudeCapabilities = { account: 'default', observedAt: 'synthetic', commandNames: [], agentNames: [], models: [
  { value: 'default', resolvedModel: 'claude-sonnet-5', displayName: 'Default', description: '' },
  { value: 'opus', resolvedModel: 'claude-opus-5', displayName: 'Opus', description: '', supportsFastMode: true, supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'], supportsAdaptiveThinking: true },
  { value: 'claude-fable-5-1[1m]', resolvedModel: 'claude-fable-5-1', displayName: 'Fable', description: '', supportedEffortLevels: ['high', 'xhigh'] },
  { value: 'haiku', resolvedModel: 'claude-haiku-test', displayName: 'Haiku', description: '' },
] }
const defaults = { configuredModel: 'opus', configuredEffort: 'high', settingsSource: 'user' }
const overrides = { model: null, effort: null, fast: false, ultracode: false }
describe('Claude accepted selection', () => {
  it('pins the actual account config, clears inherited flags, and survives defaults/alias changes without substitution', () => {
    const selected = freezeClaudeSelection('default', overrides, undefined, catalog, defaults)
    expect(selected).toMatchObject({ model: 'claude-opus-5', effort: 'medium', account: 'default' })
    expect(claudeSelectionOptions(selected)).toEqual({ model: 'claude-opus-5', effort: 'medium', thinking: { type: 'adaptive', display: 'summarized' }, settings: { fastMode: false, ultracode: false } })
    const changed = { ...catalog, configuredModel: 'haiku', configuredEffort: 'low' }
    expect(checkClaudeSelection(selected, 'default', changed).value).toBe('opus')
    expect(() => checkClaudeSelection(selected, 'bro', { ...catalog, account: 'bro' })).toThrow('account mismatch')
    expect(() => checkClaudeSelection(selected, 'default', { ...catalog, models: catalog.models.map(m => m.value === 'opus' ? { ...m, resolvedModel: 'claude-opus-future' } : m) })).toThrow('no se sustituirá')
  })
  it('keeps an advertised context qualifier when wire model omits it, without upgrading a bare canonical request', () => {
    const selected = freezeClaudeSelection('default', { ...overrides, model: 'claude-fable-5-1[1m]' }, undefined, catalog, defaults)
    expect(selected.model).toBe('claude-fable-5-1[1m]')
    expect(checkClaudeSelection(selected, 'default', catalog).value).toBe('claude-fable-5-1[1m]')
    expect(() => freezeClaudeSelection('default', { ...overrides, model: 'claude-fable-5-1' }, undefined, catalog, defaults, 'reject')).toThrow('confirmar el modelo')
    expect(freezeClaudeSelection('default', { ...overrides, model: 'claude-fable-5-1' }, undefined, catalog, defaults).model).not.toBe('claude-fable-5-1[1m]')
    expect(() => freezeClaudeSelection('default', { ...overrides, model: selected.model, fast: true }, undefined, catalog, defaults)).toThrow('Fast')
  })
  it('validates an accepted bare ID when a native Query omits its alias row, without granting or adding a context qualifier', () => {
    const selected = freezeClaudeSelection('default', overrides, undefined, catalog, defaults)
    const native = { ...catalog, models: [{ ...catalog.models[1], value: 'opus[1m]', resolvedModel: 'claude-opus-5[1m]' }] }
    expect(checkClaudeSelection(selected, 'default', native, true).value).toBe('opus[1m]')
    expect(claudeSelectionOptions(selected).model).toBe('claude-opus-5')
    expect(() => freezeClaudeSelection('default', { ...overrides, model: selected.model }, undefined, native, defaults)).toThrow('confirmar el modelo')
    expect(() => checkClaudeSelection({ ...selected, model: 'claude-opus-5[2m]' }, 'default', native, true)).toThrow('no se sustituirá')
    const conflicting = { ...native, models: [...native.models, { ...native.models[0], value: 'opus[2m]', resolvedModel: 'claude-opus-5[2m]', supportsFastMode: false }] }
    expect(() => checkClaudeSelection({ ...selected, fast: true }, 'default', conflicting, true)).toThrow('mismas capacidades')
    expect(() => checkClaudeSelection({ ...selected, fast: true }, 'default', { ...conflicting, models: [...conflicting.models].reverse() }, true)).toThrow('mismas capacidades')
  })
  it('defaults to medium whatever the account config says, then per-conversation, then per-message, but never guesses env-driven effort', () => {
    // 2 oct 2026: el esfuerzo configurado de la cuenta (high/max aquí) ya no manda; el default es medium.
    const settings = summarizeClaudeSettings({ effective: { model: 'opus', effortLevel: 'high', modelSettings: { 'claude-opus-5': { effortLevel: 'max' } } } }, {})
    expect(freezeClaudeSelection('default', overrides, undefined, catalog, settings).effort).toBe('medium')
    expect(freezeClaudeSelection('default', { ...overrides, effort: 'low' }, undefined, catalog, settings).effort).toBe('low')
    expect(freezeClaudeSelection('default', { ...overrides, effort: 'low' }, 'xhigh', catalog, settings).effort).toBe('xhigh')
    expect(() => freezeClaudeSelection('default', overrides, undefined, catalog, { ...settings, unresolvedEffort: true })).toThrow('esfuerzo compatible')
    expect(() => freezeClaudeSelection('default', overrides, 'high', catalog, { ...settings, unresolvedEffort: true })).toThrow('esfuerzo compatible')
    expect(() => freezeClaudeSelection('default', { ...overrides, model: 'opus' }, undefined, catalog, { ...settings, unresolvedModel: true })).toThrow('confirmar el modelo')
    expect(() => freezeClaudeSelection('default', overrides, undefined, catalog, { ...settings, configuredModel: null })).toThrow('confirmar el modelo')
    expect(() => freezeClaudeSelection('default', overrides, undefined, catalog, { ...settings, unresolvedPolicy: true })).toThrow('política')
  })
  it('never blocks a conversation whose STORED model left the catalog (3 oct 2026: SDK 0.3.288 dropped opus[1m])', () => {
    // Catálogo real tras el bump: Opus 5.5 solo como `opus`, sin fila [1m].
    const live = { ...catalog, models: catalog.models.map(m => m.value === 'opus' ? { ...m, resolvedModel: 'claude-opus-5-5' } : m) }
    // 1. Mismo modelo, sufijo de contexto retirado: alias y canónico.
    expect(freezeClaudeSelection('default', { ...overrides, model: 'opus[1m]' }, undefined, live, defaults)).toMatchObject({ model: 'claude-opus-5-5', source: 'conversation' })
    expect(freezeClaudeSelection('default', { ...overrides, model: 'claude-opus-5-5[1m]' }, undefined, live, defaults).model).toBe('claude-opus-5-5')
    // 2. Modelo retirado del todo: cae al configurado de la cuenta y lo deja visible.
    const retired = freezeClaudeSelection('default', { ...overrides, model: 'claude-opus-4-8' }, undefined, live, defaults)
    expect(retired).toMatchObject({ model: 'claude-opus-5-5', requestedModel: 'opus', source: 'conversation-unavailable:claude-opus-4-8' })
    // Elección explícita en el selector: estricta, no se guarda lo que la cuenta no anuncia.
    expect(() => freezeClaudeSelection('default', { ...overrides, model: 'claude-opus-4-8' }, undefined, live, defaults, 'reject')).toThrow('confirmar el modelo')
    expect(freezeClaudeSelection('default', { ...overrides, model: 'opus[1m]' }, undefined, live, defaults, 'reject').model).toBe('claude-opus-5-5')
    // Sin modelo de cuenta conocido no se inventa uno.
    expect(() => freezeClaudeSelection('default', { ...overrides, model: 'claude-opus-4-8' }, undefined, live, { ...defaults, configuredModel: null })).toThrow('confirmar el modelo')
  })
  it('uses the nearest advertised level when the model lacks medium, and drops a stored effort the model no longer advertises', () => {
    const fable = { ...overrides, model: 'claude-fable-5-1[1m]' }
    expect(freezeClaudeSelection('default', fable, undefined, catalog, defaults).effort).toBe('high')
    expect(freezeClaudeSelection('default', { ...fable, effort: 'max' }, undefined, catalog, defaults).effort).toBe('high')
    expect(() => freezeClaudeSelection('default', fable, 'max', catalog, defaults)).toThrow('esfuerzo compatible')
  })
  it('does not force adaptive thinking or inherited effort on models without advertised support', () => {
    const selected = freezeClaudeSelection('default', { ...overrides, model: 'haiku' }, undefined, catalog, defaults)
    expect(claudeSelectionOptions(selected)).toEqual({ model: 'claude-haiku-test', settings: { fastMode: false, ultracode: false } })
    expect(() => freezeClaudeSelection('default', { ...overrides, model: 'haiku' }, 'high', catalog, defaults)).toThrow('no anuncia soporte')
  })
  it('makes the SDK Ultracode xhigh contract explicit rather than silently overwriting another selected effort', () => {
    expect(freezeClaudeSelection('default', { ...overrides, ultracode: true }, undefined, catalog, defaults)).toMatchObject({ ultracode: true, effort: 'xhigh' })
    expect(() => freezeClaudeSelection('default', { ...overrides, ultracode: true, effort: 'max' }, undefined, catalog, defaults)).toThrow('Ultracode requiere xhigh')
  })
})
