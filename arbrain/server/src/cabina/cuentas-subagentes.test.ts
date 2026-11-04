import { describe, expect, it } from 'vitest'
import { aplicarCuenta, elegirCuenta } from './sin-pantalla.js'

// Dos suscripciones de Claude (3 nov 2026): cada subagente de claude nace en una cuenta y se queda en ella.
const ALTERNA = '/Users/x/.claude-bro'
let n = 0
const sub = (cuenta?: 'default' | 'bro', o: { cerrado?: string; harness?: string } = {}) => ({ id: ++n, harness: o.harness ?? 'claude', cerrado: o.cerrado, ...(cuenta ? { cuenta } : {}) })

describe('aplicarCuenta', () => {
  it('default quita CLAUDE_CONFIG_DIR (el CLI usa ~/.claude y su llavero)', () => {
    expect(aplicarCuenta({ CLAUDE_CONFIG_DIR: ALTERNA, PATH: '/bin' }, 'default', ALTERNA)).toEqual({ PATH: '/bin' })
  })
  it('bro fija la carpeta alterna', () => {
    expect(aplicarCuenta({ PATH: '/bin' }, 'bro', ALTERNA)).toEqual({ PATH: '/bin', CLAUDE_CONFIG_DIR: ALTERNA })
  })
  it('sin cuenta (registro viejo) deja lo que resolvió el adaptador', () => {
    expect(aplicarCuenta({ CLAUDE_CONFIG_DIR: ALTERNA }, undefined, ALTERNA)).toEqual({ CLAUDE_CONFIG_DIR: ALTERNA })
  })
})

describe('elegirCuenta', () => {
  const o = { politica: 'alternar', dirEnv: ALTERNA, alterna: ALTERNA }
  it('va a la cuenta con menos subagentes de claude abiertos; los viejos cuentan para la del .env', () => {
    expect(elegirCuenta([sub(), sub(), sub()], o)).toBe('default')
    expect(elegirCuenta([sub(), sub('default'), sub('default')], o)).toBe('bro')
  })
  it('no cuenta cerrados ni otros harness', () => {
    expect(elegirCuenta([sub('default', { cerrado: 'x' }), sub('default', { harness: 'codex' }), sub('bro')], o)).toBe('default')
  })
  it('empate: default', () => { expect(elegirCuenta([], o)).toBe('default') })
  it('CABINA_CLAUDE_CUENTA fija una', () => {
    expect(elegirCuenta([sub('bro')], { ...o, politica: 'bro' })).toBe('bro')
    expect(elegirCuenta([], { ...o, politica: 'default' })).toBe('default')
  })
  it('con vivos, solo cuentan los que tienen turno corriendo (los abiertos en reposo no gastan cuota)', () => {
    const viejos = [sub(), sub(), sub(), sub()]           // 4 abiertos de la cuenta del .env, en reposo
    const trabajando = [sub('default'), sub('default')]
    const vivos = new Set(trabajando.map(s => s.id))
    expect(elegirCuenta([...viejos, ...trabajando], o)).toBe('default')
    expect(elegirCuenta([...viejos, ...trabajando], { ...o, vivos })).toBe('bro')
  })
  it('acepta ~ en CABINA_CLAUDE_CONFIG_DIR', () => {
    expect(elegirCuenta([sub()], { politica: 'alternar', dirEnv: '~/.claude-bro', alterna: `${process.env.HOME}/.claude-bro` })).toBe('default')
  })
})
