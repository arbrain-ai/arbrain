// A/B del primer arranque, ronda 2: «sin crédito» es una sola regla (prueba de la llave y chat) y el aviso de llave
// faltante ya no manda a «iniciar sesión con Claude».
import { describe, expect, it } from 'vitest'
import { esSinSaldo, CODIGO_SIN_SALDO } from './sin-saldo.js'
import { MENSAJE_FALTA_LLAVE } from './llaves.js'

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
  it('apunta a «Conectar con OpenRouter» y no a una opción que ya no existe', () => {
    expect(MENSAJE_FALTA_LLAVE).not.toMatch(/inicia sesión con Claude/i)
    expect(MENSAJE_FALTA_LLAVE).toMatch(/Conectar con OpenRouter/)
    expect(MENSAJE_FALTA_LLAVE).toMatch(/Ajustes › Llaves/)
  })
})
