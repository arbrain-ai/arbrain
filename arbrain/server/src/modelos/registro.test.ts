import { describe, expect, it, vi, afterEach } from 'vitest'
import { REGISTRO, cuentasChat, esCuentaApi, esCuentaChat, registroPublico, rutaDeCuenta, rutasApi } from './registro.js'
import { catalogoJson, configToml, entornoDeRuta } from './codex-proveedor.js'
import { CodexRuntimePool } from '../chat-runtime/codex-pool.js'

const ruta = () => rutaDeCuenta('deepseek')!

afterEach(() => { vi.unstubAllEnvs() })

describe('registro de modelos', () => {
  it('DeepSeek V4.1 Flash entra por OpenRouter en el motor Codex, con su propio espacio', () => {
    const r = ruta()
    expect(r).toMatchObject({ modelId: 'deepseek/deepseek-v4.1-flash', proveedorId: 'openrouter', motor: 'codex-app-server', cuenta: 'deepseek' })
    expect(r.codex?.applyPatchToolType).toBeNull()
    expect(rutasApi().map(x => x.cuenta)).toEqual(['deepseek', 'gpt-luna', 'gpt-astra', 'gpt-sol', 'gemini', 'muse', 'grok', 'mimo', 'glm', 'kimi'])
  })

  it('solo hay dos motores', () => {
    expect(new Set(REGISTRO.rutas.map(r => r.motor))).toEqual(new Set(['codex-app-server']))
    for (const r of REGISTRO.rutas) expect(['claude-agent-sdk', 'codex-app-server']).toContain(r.motor)
  })

  it('reconoce los espacios de siempre más los del registro', () => {
    expect(cuentasChat()).toEqual(['default', 'bro', 'codex', 'yt', 'deepseek', 'gpt-luna', 'gpt-astra', 'gpt-sol', 'gemini', 'muse', 'grok', 'mimo', 'glm', 'kimi'])
    expect(esCuentaChat('deepseek')).toBe(true)
    expect(esCuentaChat('otro')).toBe(false)
    expect(esCuentaApi('codex')).toBe(false)
  })

  it('las llaves se guardan solo por nombre de variable y la vista pública nunca trae su valor', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-secreto-de-prueba')
    vi.stubEnv('ARBRAIN_MOTOR_API', '1')
    const vista = JSON.stringify(registroPublico())
    expect(vista).toContain('OPENROUTER_API_KEY')
    expect(vista).not.toContain('sk-or-secreto-de-prueba')
    expect(registroPublico().rutas[0]).toMatchObject({ disponible: true, motivo: null })
  })

  it('con el interruptor apagado la ruta no está disponible y lo dice', () => {
    vi.stubEnv('ARBRAIN_MOTOR_API', '0')
    expect(registroPublico()).toMatchObject({ motorApi: false })
    expect(registroPublico().rutas[0].disponible).toBe(false)
    expect(registroPublico().rutas[0].motivo).toMatch(/ARBRAIN_MOTOR_API/)
  })
})

describe('plantilla del proveedor propio', () => {
  it('config.toml declara el proveedor con env_key (nombre) y apaga la búsqueda web', () => {
    const toml = configToml(ruta(), '/tmp/home-x')
    expect(toml).toContain('model = "deepseek/deepseek-v4.1-flash"')
    expect(toml).toContain('model_provider = "openrouter"')
    expect(toml).toContain('[model_providers.openrouter]')
    expect(toml).toContain('env_key = "OPENROUTER_API_KEY"')
    expect(toml).toContain('wire_api = "responses"')
    expect(toml).toContain('web_search = "disabled"')
    expect(toml).toContain('model_catalog_json = "/tmp/home-x/models.json"')
  })

  it('el catálogo usa el slug de la ruta y quita apply_patch', () => {
    const cat = JSON.parse(catalogoJson(ruta()))
    expect(cat.models).toHaveLength(1)
    expect(cat.models[0]).toMatchObject({ slug: 'deepseek/deepseek-v4.1-flash', display_name: 'DeepSeek V4.1 Flash', apply_patch_tool_type: null })
    expect(JSON.stringify(cat)).not.toContain('based on GPT-5')
    expect(JSON.stringify(cat)).toContain('based on DeepSeek V4.1 Flash')
    expect(cat.models[0].supported_reasoning_levels.map((l: { effort: string }) => l.effort)).toEqual(['low', 'high', 'max'])
  })

  it('el entorno del hijo agrega solo la llave de su ruta', () => {
    const env = entornoDeRuta(ruta(), { PATH: '/bin', OPENROUTER_API_KEY: 'k' })
    expect(env).toEqual({ PATH: '/bin', OPENROUTER_API_KEY: 'k' })
  })
})

describe('pool Codex con llave por API', () => {
  it('no exige login de ChatGPT, prepara el home y pasa el entorno con la llave', async () => {
    const prepare = vi.fn()
    const spawned: Array<{ env?: NodeJS.ProcessEnv; home: string }> = []
    const client = { closed: false, request: vi.fn(), onDisconnect: vi.fn(), close: vi.fn(), onNotification: vi.fn(), onServerRequest: vi.fn(), respond: vi.fn(), reject: vi.fn() }
    const pool = new CodexRuntimePool({
      accounts: { deepseek: { home: '/tmp/h', apiKey: { prepare, env: () => ({ OPENROUTER_API_KEY: 'k' }) } } },
      cwd: '/tmp', bin: 'codex', factory: o => { spawned.push(o); return client as never },
    })
    await pool.connection('deepseek')
    expect(prepare).toHaveBeenCalledOnce()
    expect(spawned[0]).toMatchObject({ home: '/tmp/h', env: { OPENROUTER_API_KEY: 'k' } })
    expect(client.request).not.toHaveBeenCalledWith('account/read', expect.anything())
  })

  it('si prepare falla (interruptor apagado) no lanza ningún proceso', async () => {
    const factory = vi.fn()
    const pool = new CodexRuntimePool({
      accounts: { deepseek: { home: '/tmp/h', apiKey: { prepare: () => { throw new Error('apagado') }, env: () => ({}) } } },
      cwd: '/tmp', bin: 'codex', factory,
    })
    await expect(pool.connection('deepseek')).rejects.toThrow('apagado')
    expect(factory).not.toHaveBeenCalled()
  })
})
