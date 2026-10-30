/**
 * Endurecimiento (contrato v2 §2.1): secretos y llaves por stdin, nunca en el entorno del daemon ni de sus hijos.
 * Todo en temporales; nada lee secretos reales.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { closeSync, mkdtempSync, openSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepararEntornoCliente } from './arranque.js'
import { entornoClaude, guardarSecretos, leerLineaSincrona, NUNCA_EN_ENTORNO, origenSecretos, parsearSecretos, paseAgenteValido, rutaSoloApp, secreto, vaciarCofreParaPruebas, vistaConLlaves } from './cofre.js'
import { haySecretoConfirmar, secretoConfirmarValido } from './secreto.js'
import { estadoLlaves, faltaLlaveClaude } from './llaves.js'
import { readEnvFile } from '../env.js'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const T = 'a'.repeat(64), C = 'c'.repeat(64), P = 'p'.repeat(64)
const base = () => ({ ARBRAIN_EDICION: 'cliente', ARBRAIN_DATA_DIR: join(tmp('cofre-'), 'datos'), ARBRAIN_HOME: join(tmp('ws-'), 'cerebro'), MC_SERVER_PORT: '4567', MISSION_CONTROL_ORIGIN: 'http://127.0.0.1:4568', ARBRAIN_SECRETOS: 'stdin' }) as NodeJS.ProcessEnv
const sinSecretos = (env: NodeJS.ProcessEnv | Record<string, string>) => {
  const valores = Object.values(env).join('\n')
  for (const v of [T, C, 'sk-ant-prueba', 'oat-prueba', 'sk-or-prueba']) expect(valores).not.toContain(v)
}

let edicionPrevia: string | undefined
beforeEach(() => { vaciarCofreParaPruebas(); edicionPrevia = process.env.ARBRAIN_EDICION })
afterEach(() => { vaciarCofreParaPruebas(); if (edicionPrevia === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = edicionPrevia })

describe('lectura de stdin (síncrona, antes de que nada lea configuración)', () => {
  it('devuelve la primera línea y descarta lo demás; EOF sin salto devuelve lo leído', () => {
    const d = tmp('stdin-')
    writeFileSync(join(d, 'a'), '{"x":1}\nlo que sigue no es de nadie\n')
    writeFileSync(join(d, 'b'), '{"y":2}')
    for (const [f, esperado] of [['a', '{"x":1}'], ['b', '{"y":2}']] as const) {
      const fd = openSync(join(d, f), 'r')
      try { expect(leerLineaSincrona(fd)).toBe(esperado) } finally { closeSync(fd) }
    }
  })
  it('solo acepta nombres conocidos con valor de texto; el alias del token se traduce; JSON roto no entrega nada', () => {
    expect(parsearSecretos(JSON.stringify({ ARBRAIN_DAEMON_TOKEN: ` ${T} `, ANTHROPIC_API_KEY: 'sk-ant-prueba', PATH: '/x', OTRO: 'y', ARBRAIN_TOKEN_CONFIRMAR: 5 })))
      .toEqual({ OPENCLAW_GATEWAY_TOKEN: T, ANTHROPIC_API_KEY: 'sk-ant-prueba' })
    expect(parsearSecretos('no es json')).toEqual({})
    expect(parsearSecretos('[1,2]')).toEqual({})
  })
})

describe('arranque con ARBRAIN_SECRETOS=stdin', () => {
  it('nada sensible queda en el entorno; el daemon los conoce por su cofre', () => {
    const env = base()
    const linea = JSON.stringify({ OPENCLAW_GATEWAY_TOKEN: T, ARBRAIN_TOKEN_CONFIRMAR: C, ARBRAIN_PASE_AGENTE: P, ANTHROPIC_API_KEY: 'sk-ant-prueba' })
    const r = prepararEntornoCliente(env, () => linea)
    expect(r.ok).toBe(true)
    expect(origenSecretos()).toBe('stdin')
    for (const k of NUNCA_EN_ENTORNO) expect(env[k]).toBeUndefined()
    sinSecretos(env)
    expect(env.ARBRAIN_PASE_AGENTE).toBe(P)
    expect(secreto('OPENCLAW_GATEWAY_TOKEN')).toBe(T)
    expect(haySecretoConfirmar()).toBe(true)
    expect(secretoConfirmarValido(C)).toBe(true)
    expect(secretoConfirmarValido(T)).toBe(false)
    // Las llaves se ven en el estado (/health) aunque no estén en process.env.
    expect(estadoLlaves(vistaConLlaves(env))).toMatchObject({ anthropic: true, chat: true, proveedor: 'anthropic' })
  })
  it('readEnvFile entrega el token solo a quien lo pide por nombre (server.ts), nunca en un volcado sin lista', () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    guardarSecretos({}, { OPENCLAW_GATEWAY_TOKEN: T, ARBRAIN_TOKEN_CONFIRMAR: C })
    expect(readEnvFile(['OPENCLAW_GATEWAY_TOKEN', 'MC_SERVER_PORT']).OPENCLAW_GATEWAY_TOKEN).toBe(T)
    sinSecretos(readEnvFile())
    expect(readEnvFile(['ARBRAIN_TOKEN_CONFIRMAR']).ARBRAIN_TOKEN_CONFIRMAR).toBe(C)
  })
  it('sin token en stdin falta OPENCLAW_GATEWAY_TOKEN (sale con 78); una línea ilegible no tumba el arranque', () => {
    expect(prepararEntornoCliente(base(), () => '{}').falta).toEqual(['OPENCLAW_GATEWAY_TOKEN'])
    expect(prepararEntornoCliente(base(), () => { throw new Error('stdin cerrado') }).falta).toEqual(['OPENCLAW_GATEWAY_TOKEN'])
  })
  it('compatibilidad v1: si llegan por entorno se capturan igual y se borran', () => {
    const env: NodeJS.ProcessEnv = { ...base(), ARBRAIN_SECRETOS: undefined, ARBRAIN_DAEMON_TOKEN: T, ARBRAIN_TOKEN_CONFIRMAR: C, OPENROUTER_API_KEY: 'sk-or-prueba' }
    expect(prepararEntornoCliente(env, () => { throw new Error('no debe leer stdin') }).ok).toBe(true)
    expect(origenSecretos()).toBe('entorno')
    sinSecretos(env)
    expect(secreto('OPENCLAW_GATEWAY_TOKEN')).toBe(T)
    expect(secretoConfirmarValido(C)).toBe(true)
    // Sin pase de la app, el daemon genera uno: los agentes siguen pudiendo hablarle.
    expect(env.ARBRAIN_PASE_AGENTE).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('entorno del CLI de Claude', () => {
  it('lleva solo sus llaves y el scrub; nunca el token del daemon, el de confirmar ni el secreto de escritorio', () => {
    const env = base()
    prepararEntornoCliente(env, () => JSON.stringify({ OPENCLAW_GATEWAY_TOKEN: T, ARBRAIN_TOKEN_CONFIRMAR: C, ANTHROPIC_API_KEY: 'sk-ant-prueba', OPENROUTER_API_KEY: 'sk-or-prueba' }))
    const cli = entornoClaude({ ...env, ARBRAIN_DESKTOP_SECRET: 'x'.repeat(64), OPENCLAW_GATEWAY_TOKEN: 'colado' })
    expect(cli.ANTHROPIC_API_KEY).toBe('sk-ant-prueba')
    expect(cli.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB).toBe('1')
    for (const k of ['OPENCLAW_GATEWAY_TOKEN', 'ARBRAIN_TOKEN_CONFIRMAR', 'ARBRAIN_DESKTOP_SECRET', 'OPENROUTER_API_KEY']) expect(cli[k]).toBeUndefined()
    expect(Object.values(cli).join('\n')).not.toContain(C)
    expect(cli.ARBRAIN_PASE_AGENTE).toBeDefined()
  })
  it('solo OpenRouter: la llave viaja como ANTHROPIC_AUTH_TOKEN solo al CLI; URL y modelos sí quedan en el entorno', () => {
    const env = base()
    prepararEntornoCliente(env, () => JSON.stringify({ OPENCLAW_GATEWAY_TOKEN: T, OPENROUTER_API_KEY: 'sk-or-prueba' }))
    sinSecretos(env)
    expect(env.ANTHROPIC_BASE_URL).toBe('https://openrouter.ai/api')
    expect(env.ANTHROPIC_MODEL).toBe('anthropic/claude-sonnet-4.5')
    const cli = entornoClaude(env)
    expect(cli.ANTHROPIC_AUTH_TOKEN).toBe('sk-or-prueba')
    expect(cli.ANTHROPIC_API_KEY).toBe('')
    expect(cli.OPENROUTER_API_KEY).toBeUndefined()
    expect(estadoLlaves(vistaConLlaves(env))).toMatchObject({ proveedor: 'openrouter', chat: true })
    expect(faltaLlaveClaude(vistaConLlaves(env))).toBe(false)
  })
  it('sin token de suscripción en ningún camino: stdin, entorno heredado, cofre, /health ni CLI', () => {
    const env: NodeJS.ProcessEnv = { ...base(), CLAUDE_CODE_OAUTH_TOKEN: 'oat-heredado', CLAUDE_CODE_OAUTH_REFRESH_TOKEN: 'rt-heredado', ANTHROPIC_AUTH_TOKEN: 'auth-heredado', CLAUDE_SECURESTORAGE_CONFIG_DIR: '' }
    const r = prepararEntornoCliente(env, () => JSON.stringify({ OPENCLAW_GATEWAY_TOKEN: T, CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-prueba', ANTHROPIC_AUTH_TOKEN: 'sk-ant-oat01-prueba' }))
    expect(r.ok).toBe(true)
    for (const k of ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'ANTHROPIC_AUTH_TOKEN']) {
      expect(env[k]).toBeUndefined()
      expect(secreto(k)).toBeUndefined()
    }
    expect(parsearSecretos(JSON.stringify({ CLAUDE_CODE_OAUTH_TOKEN: 'x', ANTHROPIC_AUTH_TOKEN: 'y' }))).toEqual({})
    // Sin llave real, el chat no tiene vía: el token de suscripción no la abre.
    expect(estadoLlaves(vistaConLlaves(env))).toMatchObject({ chat: false, proveedor: null })
    const cli = entornoClaude({ ...env, CLAUDE_CODE_OAUTH_TOKEN: 'colado', ANTHROPIC_AUTH_TOKEN: 'colado', CLAUDE_SECURESTORAGE_CONFIG_DIR: '' })
    for (const k of ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_SECURESTORAGE_CONFIG_DIR']) expect(cli).not.toHaveProperty(k)
    expect(Object.values(cli).join('\n')).not.toMatch(/oat|colado|heredado/)
  })
  it('con API key de Anthropic, al CLI no le llega ANTHROPIC_AUTH_TOKEN aunque alguien lo cuele', () => {
    const env = base()
    prepararEntornoCliente(env, () => JSON.stringify({ OPENCLAW_GATEWAY_TOKEN: T, ANTHROPIC_API_KEY: 'sk-ant-prueba' }))
    const cli = entornoClaude({ ...env, ANTHROPIC_AUTH_TOKEN: 'colado' })
    expect(cli.ANTHROPIC_API_KEY).toBe('sk-ant-prueba')
    expect(cli).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN')
  })
  it('instalación de Daniel: el entorno pasa tal cual, sin scrub', () => {
    const daniel = { HOME: '/x', ANTHROPIC_API_KEY: 'k', OPENCLAW_GATEWAY_TOKEN: 't' }
    expect(entornoClaude(daniel, false)).toEqual(daniel)
  })
})

describe('pase de agente', () => {
  it('vale como Bearer de agente, nunca para las rutas de la app', () => {
    guardarSecretos({}, { OPENCLAW_GATEWAY_TOKEN: T, ARBRAIN_PASE_AGENTE: P })
    expect(paseAgenteValido(P)).toBe(true)
    expect(paseAgenteValido(T)).toBe(false)
    expect(paseAgenteValido(undefined)).toBe(false)
    // Red team 2 M-1: el chat (que registra la voz de la persona y lanza turnos) también es solo de la app.
    for (const r of ['/confirmaciones/resolver', '/cohorte/consentimiento', '/apagar', '/llaves/probar', '/chat', '/chat/stream', '/chat/answer', '/chat/turn']) expect(rutaSoloApp('POST', r)).toBe(true)
    for (const [m, r] of [['POST', '/confirmaciones/pedir'], ['POST', '/confirmaciones/consumir'], ['GET', '/schedule'], ['GET', '/health']]) expect(rutaSoloApp(m, r)).toBe(false)
    // Red team 4 M4-2: lista blanca. Lo que no está en ella (lecturas de la persona, rutas nuevas, métodos raros) es de la app.
    for (const [m, r] of [['GET', '/confirmaciones'], ['GET', '/chat/backstage'], ['POST', '/chatx'], ['GET', '/ruta-nueva'], [undefined, '/health'], ['HEAD', '/health']] as const) expect(rutaSoloApp(m, r)).toBe(true)
  })
})
