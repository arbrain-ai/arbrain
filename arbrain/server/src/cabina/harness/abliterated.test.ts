// Modo «abliterated» (3 nov 2026): Claude Code contra un endpoint en formato Anthropic que no es Anthropic.
import { describe, expect, it } from 'vitest'
import { ADAPTADORES, NOMBRES, leerBitacora } from './index.js'
import { ABLITERATION_AI, CONFIG_ABLITERATED, MODELO_ABLITERATED, abliterated } from './abliterated.js'
import { claude } from './claude.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { comandoInteractivo, entornoFaltante, entornoPara, perfilPara } from '../sin-pantalla.js'

const muestra = (n: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'muestras', `${n}.jsonl`), 'utf8')

describe('abliterated: registro y argv', () => {
  it('es un harness más; el default claude no cambia', () => {
    expect(NOMBRES).toContain('abliterated')
    expect(ADAPTADORES.abliterated).toBe(abliterated)
    expect(claude.modeloDefault(() => undefined)).toBe('claude-opus-5-5')
    expect(claude.entorno).toEqual({ CLAUDE_CONFIG_DIR: { fuentes: ['CABINA_CLAUDE_CONFIG_DIR'] } })
    expect(claude.perfilDefault).toBeUndefined()
  })
  it('mismo binario y argv de claude, nunca con --effort', () => {
    expect(abliterated.binario).toBe('claude')
    const p = { encargo: 'hola', modelo: MODELO_ABLITERATED, esfuerzo: 'max', cwd: '/tmp/x', permisos: 'bypass' as const, sesion: 'u-1' }
    expect(abliterated.lanzar(p)).toEqual(claude.lanzar({ ...p, esfuerzo: null }))
    expect(abliterated.lanzar(p)).not.toContain('--effort')
    expect(abliterated.reanudar({ sesion: 'u-1', texto: 'y?', modelo: null, esfuerzo: 'high', cwd: '/tmp/x', permisos: 'bypass' })).not.toContain('--effort')
    expect(abliterated.vivo!.argv({ reanudar: false, modelo: null, esfuerzo: 'xhigh', permisos: 'bypass', cwd: '/tmp/x' })).not.toContain('--effort')
    expect(abliterated.recibeEsfuerzo).toBe(false)
    expect(abliterated.cuentaCatalogo).toBeUndefined()
  })
  it('lleva la guardia de perfil como claude (lista negra encima del bypass)', () => {
    const argv = abliterated.lanzar({ encargo: 'x', modelo: null, cwd: '/tmp/x', permisos: 'bypass', perfil: 'lectura', guardia: '/bin/guardia lectura' })
    expect(argv.join(' ')).toContain('PreToolUse')
    expect(abliterated.guardia).toBe(true)
  })
  it('modelo: abliterated-model-large-flash salvo CABINA_MODELO_ABLITERATED (nuestro pod)', () => {
    expect(abliterated.modeloDefault(() => undefined)).toBe('abliterated-model-large-flash')
    expect(abliterated.modeloDefault(k => k === 'CABINA_MODELO_ABLITERATED' ? 'DeepSeek-V4.1-Flash-1017-abliterated' : undefined)).toBe('DeepSeek-V4.1-Flash-1017-abliterated')
    expect(abliterated.modeloOk('DeepSeek-V4.1-Flash-1017-abliterated')).toBe(true)
  })
  it('lee el stream-json de claude (misma muestra real)', () => {
    const b = leerBitacora(`{"arbrain":"inicio","en":1,"texto":"x"}\n${muestra('claude-lanzar')}{"arbrain":"salida","codigo":0,"en":2}\n`, abliterated)
    expect(b.turnos[0].final ?? b.turnos[0].mensajes.at(-1)).toBe('hola uno')
  })
})

describe('abliterated: perfil lectura por default', () => {
  it('sin perfil pedido nace en lectura; total o código hay que pedirlos', () => {
    expect(perfilPara(abliterated, undefined)).toBe('lectura')
    expect(perfilPara(abliterated, '')).toBe('lectura')
    expect(perfilPara(abliterated, 'total')).toBe('total')
    expect(perfilPara(abliterated, 'codigo')).toBe('codigo')
    expect(perfilPara(claude, undefined)).toBe('total')
  })
})

describe('abliterated: entorno (dos destinos, el login de Anthropic nunca viaja)', () => {
  it('default: api.abliteration.ai con su llave', () => {
    const env = entornoPara(abliterated, { PATH: '/usr/bin', HOME: '/x' }, { ABLITERATION_AI_API_KEY: 'ak_1' })
    expect(env).toMatchObject({ ANTHROPIC_BASE_URL: ABLITERATION_AI, ANTHROPIC_AUTH_TOKEN: 'ak_1', CLAUDE_CONFIG_DIR: CONFIG_ABLITERATED })
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe(MODELO_ABLITERATED)
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe(MODELO_ABLITERATED)
    expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1')
    expect(env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS).toBe('1')
  })
  it('nuestro pod: ds41.py conectar deja URL, token y modelo; el token del pod gana', () => {
    const env = entornoPara(abliterated, {}, {
      ABLITERATED_BASE_URL: 'https://abc123-8000.proxy.runpod.net', ABLITERATED_API_KEY: 'sk-ds41-x', ABLITERATION_AI_API_KEY: 'ak_1',
      CABINA_MODELO_ABLITERATED: 'DeepSeek-V4.1-Flash-1017-abliterated',
    })
    expect(env).toMatchObject({ ANTHROPIC_BASE_URL: 'https://abc123-8000.proxy.runpod.net', ANTHROPIC_AUTH_TOKEN: 'sk-ds41-x', ANTHROPIC_DEFAULT_SONNET_MODEL: 'DeepSeek-V4.1-Flash-1017-abliterated' })
  })
  it('carpeta propia de Claude Code aunque el proceso traiga otra (la de la cuenta de Daniel)', () => {
    const env = entornoPara(abliterated, { CLAUDE_CONFIG_DIR: '/Users/x/.claude', CABINA_CLAUDE_CONFIG_DIR: '/Users/x/.claude-bro' }, { ABLITERATION_AI_API_KEY: 'ak_1' })
    expect(env.CLAUDE_CONFIG_DIR).toBe(CONFIG_ABLITERATED)
  })
  it('sin token no se lanza, y un token heredado del proceso no se cuela', () => {
    expect(entornoFaltante(abliterated, {}, {})).toEqual(['ANTHROPIC_AUTH_TOKEN'])
    expect(entornoFaltante(abliterated, { ANTHROPIC_AUTH_TOKEN: 'ajeno' }, {})).toEqual(['ANTHROPIC_AUTH_TOKEN'])
    expect(entornoPara(abliterated, { ANTHROPIC_AUTH_TOKEN: 'ajeno' }, {}).ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(entornoFaltante(abliterated, { ABLITERATION_AI_API_KEY: 'ak_proc' }, {})).toEqual([])
    expect(entornoFaltante(claude, {}, {})).toEqual([])
  })
  it('la terminal interactiva no escribe el secreto en el comando', () => {
    const cmd = comandoInteractivo(abliterated, '/opt/homebrew/bin/claude', 'u-1', 'abliterated-model-large-flash', { ABLITERATION_AI_API_KEY: 'ak_secreto' }, { rutaEnv: '/r/.env', script: '/s/con-entorno.sh' })
    expect(cmd).not.toContain('ak_secreto')
    expect(cmd).toContain('ANTHROPIC_AUTH_TOKEN=ABLITERATION_AI_API_KEY')
    expect(cmd).toContain(`ANTHROPIC_BASE_URL=${ABLITERATION_AI}`)
    expect(cmd).not.toContain('--effort')
  })
})
