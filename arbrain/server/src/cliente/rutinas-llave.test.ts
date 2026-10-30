/**
 * Chat con la suscripción, rutinas con la llave de tope (29 oct 2026, «solo en tu servidor»). Temporales; ningún
 * `claude` real, ninguna llave real.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fijarSecreto, vaciarCofreParaPruebas } from './cofre.js'
import { entornoRutinaConLlave, MARCA_TOPE, MODELO_RUTINAS, rutinasConLlaveTope, topeVerificado } from './rutinas-llave.js'

const OR = 'sk-or-v1-' + 'y'.repeat(40)
function datos(tope?: unknown): string {
  const d = mkdtempSync(join(tmpdir(), 'rut-'))
  mkdirSync(join(d, 'config'), { recursive: true })
  if (tope !== undefined) writeFileSync(join(d, 'config', MARCA_TOPE), JSON.stringify({ tope, vista: 'sk-or-v…yyyy' }))
  return d
}
const env = (d: string, extra: Record<string, string> = {}) => ({ ARBRAIN_EDICION: 'cliente', ARBRAIN_MOTOR_CLAUDE: 'suscripcion', ARBRAIN_DATA_DIR: d, ...extra }) as NodeJS.ProcessEnv

beforeEach(() => vaciarCofreParaPruebas())
afterEach(() => vaciarCofreParaPruebas())

describe('rutinasConLlaveTope', () => {
  it('suscripción + llave de OpenRouter + tope verificado: las rutinas corren por la llave', () => {
    expect(rutinasConLlaveTope(env(datos(10)), OR)).toBe(true)
  })
  it('sin la marca de tope (una llave pegada en Ajustes sin verificar): las rutinas siguen sin correr', () => {
    expect(rutinasConLlaveTope(env(datos()), OR)).toBe(false)
  })
  it('tope cero, negativo o ilegible no cuenta', () => {
    for (const t of [0, -5, 'mucho', null]) expect(rutinasConLlaveTope(env(datos(t)), OR)).toBe(false)
  })
  it('sin llave en el cofre no hay con qué correr', () => {
    expect(rutinasConLlaveTope(env(datos(10)), undefined)).toBe(false)
    expect(rutinasConLlaveTope(env(datos(10)), '  ')).toBe(false)
  })
  it('con el motor de llave o fuera de la edición cliente no cambia nada', () => {
    expect(rutinasConLlaveTope({ ...env(datos(10)), ARBRAIN_MOTOR_CLAUDE: 'llave' }, OR)).toBe(false)
    expect(rutinasConLlaveTope({ ...env(datos(10)), ARBRAIN_EDICION: 'original' }, OR)).toBe(false)
  })
  it('lee la llave del cofre por defecto', () => {
    const d = datos(10)
    expect(rutinasConLlaveTope(env(d))).toBe(false)
    fijarSecreto('OPENROUTER_API_KEY', OR)
    expect(rutinasConLlaveTope(env(d))).toBe(true)
  })
  it('ARBRAIN_CONFIG_DIR manda sobre <datos>/config', () => {
    const d = datos()
    const c = join(datos(7), 'config')
    expect(topeVerificado(c)).toBe(7)
    expect(rutinasConLlaveTope(env(d, { ARBRAIN_CONFIG_DIR: c }), OR)).toBe(true)
  })
})

describe('entornoRutinaConLlave', () => {
  it('Haiku 5.5 por defecto; ARBRAIN_OR_MODELO_RUTINAS lo cambia', () => {
    expect(entornoRutinaConLlave(env(datos(10), { ARBRAIN_OR_MODELO_RUTINAS: 'anthropic/claude-sonnet-5.5' }), OR).ANTHROPIC_MODEL).toBe('anthropic/claude-sonnet-5.5')
  })
  it('va por OpenRouter con la llave como token y carpeta aislada; nada de la suscripción ni secretos de la app', () => {
    const d = datos(10)
    const e = entornoRutinaConLlave(env(d, {
      PATH: '/usr/bin', CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-no', ANTHROPIC_API_KEY: 'sk-ant-api03-no', OPENCLAW_GATEWAY_TOKEN: 'z'.repeat(32),
      CLAUDE_SECURESTORAGE_CONFIG_DIR: '/otra',
    }), OR)
    expect(e.ANTHROPIC_BASE_URL).toBe('https://openrouter.ai/api')
    expect(e.ANTHROPIC_AUTH_TOKEN).toBe(OR)
    expect(e.ARBRAIN_PROVEEDOR_CLAUDE).toBe('openrouter')
    expect(e.ANTHROPIC_API_KEY).toBe('')
    expect(e.CLAUDE_CONFIG_DIR).toBe(join(d, 'claude'))
    expect(e.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB).toBe('1')
    expect(e.PATH).toBe('/usr/bin')
    expect(MODELO_RUTINAS).toBe('anthropic/claude-haiku-5.5')
    expect([e.ANTHROPIC_MODEL, e.ANTHROPIC_DEFAULT_HAIKU_MODEL, e.ANTHROPIC_SMALL_FAST_MODEL]).toEqual([MODELO_RUTINAS, MODELO_RUTINAS, MODELO_RUTINAS])
    for (const k of ['ARBRAIN_MOTOR_CLAUDE', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENROUTER_API_KEY', 'OPENCLAW_GATEWAY_TOKEN', 'CLAUDE_SECURESTORAGE_CONFIG_DIR']) expect(e[k]).toBeUndefined()
    expect(JSON.stringify(e)).not.toContain('sk-ant-')
  })
})

describe('login de Claude en el servidor', () => {
  it('en el servidor el botón no lanza nada: explica que la sesión se inicia desde una terminal', async () => {
    const { iniciarSesionClaude, MENSAJE_LOGIN_SERVIDOR, enServidorNube } = await import('./suscripcion.js')
    expect(enServidorNube({ ARBRAIN_SERVIDOR_NUBE: '1' })).toBe(true)
    expect(enServidorNube({})).toBe(false)
    const r = iniciarSesionClaude({ env: { ARBRAIN_EDICION: 'cliente', ARBRAIN_SERVIDOR_NUBE: '1', PATH: '/nada' } })
    expect(r.estado).toBe('fallo')
    expect(r.mensaje).toBe(MENSAJE_LOGIN_SERVIDOR)
    expect(MENSAJE_LOGIN_SERVIDOR).toMatch(/terminal/)
  })
})
