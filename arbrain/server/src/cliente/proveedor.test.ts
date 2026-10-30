/** BYOK por OpenRouter (11 oct 2026): sin red; solo el entorno que hereda el CLI y la traducción de modelos. */
import { describe, it, expect } from 'vitest'
import { configurarProveedorClaude, modeloParaProveedor, proveedorClaude, OPENROUTER_ANTHROPIC_BASE, MODELOS_OPENROUTER_DEFECTO } from './proveedor.js'
import { estadoLlaves, faltaLlaveClaude } from './llaves.js'
import { prepararEntornoCliente } from './arranque.js'
import { claudeSelectionOptions } from '../chat-runtime/claude-selection.js'
import { requireClaudeSubscription } from '../chat-runtime/claude-session.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('proveedor del motor de Claude (BYOK)', () => {
  it('prioridad: API de Anthropic > OpenRouter; un token de suscripción nunca es vía', () => {
    expect(proveedorClaude({ ANTHROPIC_API_KEY: 'a', OPENROUTER_API_KEY: 'o' })).toBe('anthropic')
    expect(proveedorClaude({ CLAUDE_CODE_OAUTH_TOKEN: 't', OPENROUTER_API_KEY: 'o' })).toBe('openrouter')
    expect(proveedorClaude({ CLAUDE_CODE_OAUTH_TOKEN: 't' })).toBeNull()
    expect(proveedorClaude({ ANTHROPIC_AUTH_TOKEN: 't' })).toBeNull()
    expect(proveedorClaude({ OPENROUTER_API_KEY: 'o' })).toBe('openrouter')
    expect(proveedorClaude({})).toBeNull()
  })
  it('solo OpenRouter: el entorno del CLI apunta a OpenRouter y el chat queda disponible', () => {
    const env: NodeJS.ProcessEnv = { ARBRAIN_EDICION: 'cliente', OPENROUTER_API_KEY: ' sk-or-prueba ' }
    expect(configurarProveedorClaude(env)).toBe('openrouter')
    expect(env.ANTHROPIC_BASE_URL).toBe(OPENROUTER_ANTHROPIC_BASE)
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-or-prueba')
    expect(env.ANTHROPIC_API_KEY).toBe('')
    expect(env.ANTHROPIC_MODEL).toBe(MODELOS_OPENROUTER_DEFECTO.sonnet)
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toMatch(/^anthropic\//)
    expect(estadoLlaves(env)).toMatchObject({ chat: true, proveedor: 'openrouter', anthropic: false, openrouter: true })
    expect(faltaLlaveClaude(env)).toBe(false)
    // Idempotente: un segundo arranque no cambia nada.
    const copia = { ...env }
    expect(configurarProveedorClaude(env)).toBe('openrouter')
    expect(env).toEqual(copia)
  })
  it('con llave de Anthropic no toca el entorno', () => {
    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'a', OPENROUTER_API_KEY: 'o' }
    configurarProveedorClaude(env)
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(estadoLlaves(env).proveedor).toBe('anthropic')
  })
  it('modelos fijables por variable', () => {
    const env: NodeJS.ProcessEnv = { OPENROUTER_API_KEY: 'o', ARBRAIN_OR_MODELO: 'anthropic/claude-opus-5.5', ARBRAIN_OR_MODELO_HAIKU: 'anthropic/claude-haiku-5' }
    configurarProveedorClaude(env)
    expect(env.ANTHROPIC_MODEL).toBe('anthropic/claude-opus-5.5')
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe('anthropic/claude-haiku-5')
  })
  it('traduce ids de Claude a OpenRouter solo con ese proveedor; alias e ids con «/» intactos', () => {
    const or: NodeJS.ProcessEnv = { ARBRAIN_PROVEEDOR_CLAUDE: 'openrouter' }
    expect(modeloParaProveedor('claude-sonnet-4-5', or)).toBe('anthropic/claude-sonnet-4.5')
    expect(modeloParaProveedor('claude-sonnet-4-5-20250929', or)).toBe('anthropic/claude-sonnet-4.5')
    expect(modeloParaProveedor('claude-opus-5-5[1m]', or)).toBe('anthropic/claude-opus-5.5')
    expect(modeloParaProveedor('claude-opus-4', or)).toBe('anthropic/claude-opus-4')
    expect(modeloParaProveedor('opus', or)).toBe('opus')
    expect(modeloParaProveedor('sonnet[1m]', or)).toBe('sonnet[1m]')
    expect(modeloParaProveedor('anthropic/claude-sonnet-4.5', or)).toBe('anthropic/claude-sonnet-4.5')
    expect(modeloParaProveedor(undefined, or)).toBeUndefined()
    expect(modeloParaProveedor('claude-opus-5-5', {})).toBe('claude-opus-5-5')
  })
  it('la selección congelada del chat pasa el id traducido al SDK', () => {
    const previo = process.env.ARBRAIN_PROVEEDOR_CLAUDE
    process.env.ARBRAIN_PROVEEDOR_CLAUDE = 'openrouter'
    try {
      expect(claudeSelectionOptions({ model: 'claude-sonnet-4-5', effort: null, fast: false, ultracode: false, adaptiveThinking: false } as never).model).toBe('anthropic/claude-sonnet-4.5')
    } finally { if (previo === undefined) delete process.env.ARBRAIN_PROVEEDOR_CLAUDE; else process.env.ARBRAIN_PROVEEDOR_CLAUDE = previo }
  })
  it('el arranque de la edición cliente aplica OpenRouter cuando es la única llave', () => {
    const data = mkdtempSync(join(tmpdir(), 'or-'))
    const env: NodeJS.ProcessEnv = { ARBRAIN_DATA_DIR: data, MC_SERVER_PORT: '4999', MISSION_CONTROL_ORIGIN: 'http://127.0.0.1:4998', OPENCLAW_GATEWAY_TOKEN: 'x'.repeat(32), OPENROUTER_API_KEY: 'sk-or-prueba' }
    expect(prepararEntornoCliente(env).ok).toBe(true)
    expect(env.ANTHROPIC_BASE_URL).toBe(OPENROUTER_ANTHROPIC_BASE)
  })
})

describe('autenticación del chat interactivo según la edición', () => {
  const openrouter = { apiProvider: 'firstParty', tokenSource: 'ANTHROPIC_AUTH_TOKEN', apiKeySource: 'none' } as never
  const apiKey = { apiProvider: 'firstParty', tokenSource: 'none', apiKeySource: 'ANTHROPIC_API_KEY' } as never
  it('instalación original: solo suscripción', () => {
    expect(() => requireClaudeSubscription(openrouter, false)).toThrow(/suscripción/)
    expect(() => requireClaudeSubscription(apiKey, false)).toThrow(/suscripción/)
    expect(() => requireClaudeSubscription({ apiProvider: 'firstParty', subscriptionType: 'max', tokenSource: 'claude.ai' } as never, false)).not.toThrow()
  })
  it('edición cliente: la llave del alumno (OpenRouter o API) vale', () => {
    expect(() => requireClaudeSubscription(openrouter, true)).not.toThrow()
    expect(() => requireClaudeSubscription(apiKey, true)).not.toThrow()
  })
})
