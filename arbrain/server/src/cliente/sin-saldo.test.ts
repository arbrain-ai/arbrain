// A/B del primer arranque, ronda 2: «sin crédito» es una sola regla (prueba de la llave y chat) y el aviso de llave
// faltante ya no manda a «iniciar sesión con Claude».
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { esSinSaldo, CODIGO_SIN_SALDO, INICIO_FALTA_LLAVE, INICIO_FALTA_LLAVE_EN, INICIO_LLAVE_RECHAZADA, INICIO_LLAVE_RECHAZADA_EN, esFaltaLlave, esLlaveRechazada, mensajeFalloDeCuenta } from './sin-saldo.js'
import { MENSAJE_FALTA_LLAVE } from './llaves.js'
import { tr } from '../i18n/tr.js'

describe('sin crédito', () => {
  it('reconoce los 402 de OpenRouter y el «credit balance» de Anthropic', () => {
    expect(esSinSaldo('API Error: 402 {"error":{"message":"Insufficient credits. Add more using https://openrouter.ai/settings/credits","code":402}}')).toBe(true)
    expect(esSinSaldo('Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.')).toBe(true)
    expect(esSinSaldo('This request requires more credits, or fewer max_tokens.')).toBe(true)
    expect(CODIGO_SIN_SALDO).toBe('sin_saldo')
  })
  it('no confunde una llave inválida, la saturación ni la red', () => {
    for (const t of ['API Error: 401 invalid x-api-key', 'API Error: 529 Overloaded', 'fetch failed', 'rate limit', '4021 tokens']) expect(esSinSaldo(t)).toBe(false)
  })
})

describe('aviso de llave faltante', () => {
  // 22 oct 2026: «Iniciar sesión con Claude» volvió como botón (login oficial del CLI de la persona, sin tokens en Arbrain).
  it('apunta a Ajustes › Llaves con sus dos caminos', () => {
    expect(MENSAJE_FALTA_LLAVE).toMatch(/Iniciar sesión con Claude/)
    expect(MENSAJE_FALTA_LLAVE).toMatch(/Conectar con OpenRouter/)
    expect(MENSAJE_FALTA_LLAVE).toMatch(/Ajustes › Llaves/)
  })
})

describe('idioma: la web reconoce los avisos de llave en español y en inglés (13 nov 2026)', () => {
  // El catálogo y, mientras no se fusionen, los fragmentos de traducción en curso (src/shared/i18n/fragmentos).
  const cat: Record<string, string> = JSON.parse(readFileSync(fileURLToPath(new URL('../i18n/en.json', import.meta.url)), 'utf8'))
  const dir = fileURLToPath(new URL('../../../src/shared/i18n/fragmentos', import.meta.url))
  try { for (const n of readdirSync(dir).filter(n => n.endsWith('.json'))) Object.assign(cat, JSON.parse(readFileSync(join(dir, n), 'utf8'))) } catch { /* sin fragmentos */ }
  const en = (es: string, vars?: Record<string, string | number>) => tr(cat[es] ?? es, vars)

  it('MENSAJE_FALTA_LLAVE empieza con su inicio fijo en los dos idiomas', () => {
    expect(MENSAJE_FALTA_LLAVE.startsWith(INICIO_FALTA_LLAVE)).toBe(true)
    expect(cat[MENSAJE_FALTA_LLAVE]?.startsWith(INICIO_FALTA_LLAVE_EN)).toBe(true)
    expect(esFaltaLlave({ error: true, diagnostic: cat[MENSAJE_FALTA_LLAVE] })).toBe(true)
  })
  it('la llave rechazada empieza con su inicio fijo en los dos idiomas', () => {
    expect(cat[INICIO_LLAVE_RECHAZADA]).toBe(INICIO_LLAVE_RECHAZADA_EN)
    const ingles = mensajeFalloDeCuenta('llave_invalida', 'openrouter', 'API Error: 401', { tr: en })
    expect(ingles.startsWith(INICIO_LLAVE_RECHAZADA_EN)).toBe(true)
    expect(esLlaveRechazada({ error: true, diagnostic: ingles })).toBe(true)
    expect(esLlaveRechazada({ error: true, diagnostic: mensajeFalloDeCuenta('llave_invalida', 'openrouter', 'API Error: 401') })).toBe(true)
  })
})
