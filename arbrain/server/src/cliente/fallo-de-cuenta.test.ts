// Humo de instaladores (13 oct 2026), hallazgo 2: con la llave rechazada o sin crédito, el chat del alumno tardaba 178 s
// en decir «Failed to authenticate. API Error: 401» (los reintentos del CLI). En la edición cliente el turno se corta en
// el primer `api_retry` (o en el aviso de error del asistente) y el aviso sale en español con qué hacer.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import type { SSEEvent } from '../agent.js'

const f = vi.hoisted(() => {
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.ANTHROPIC_API_KEY = 'sk-ant-prueba-falsa-0000'
  return { open: vi.fn(), interrupt: vi.fn(), release: vi.fn(), eventos: [] as Record<string, unknown>[], colgar: true }
})
vi.mock('../chat-runtime/claude-pool.js', () => ({ claudeRuntimePool: { open: f.open } }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn(), getSessionMessages: vi.fn() }))
vi.mock('../ops-logger.js', () => ({ opsLogger: { log: vi.fn() } }))
vi.mock('../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { runAgentStream } from '../agent.js'
import { clasificarFalloDeCuenta, esLlaveRechazada, esSinSaldo, INICIO_LLAVE_RECHAZADA, mensajeFalloDeCuenta } from './sin-saldo.js'

const scope = { owner: 'owner', account: 'default', conversationId: 'chat', turnId: 'turn' }
const init = { type: 'system', subtype: 'init', session_id: 'native', model: 'claude-opus-5', slash_commands: [] }
const reintento = (status: number | null, error: string) => ({ type: 'system', subtype: 'api_retry', attempt: 1, max_retries: 10, retry_delay_ms: 600, error_status: status, error, uuid: 'u', session_id: 'native' })

beforeEach(() => {
  vi.clearAllMocks()
  f.colgar = true
  // El pool real: tras el último evento el CLI sigue reintentando (aquí: espera) hasta que alguien lo interrumpe.
  f.open.mockImplementation(() => {
    let soltar: () => void = () => {}
    const interrumpido = new Promise<void>(r => { soltar = r })
    f.interrupt.mockImplementation(async () => { soltar() })
    return {
      query: { interrupt: f.interrupt }, session: { close: vi.fn() }, release: f.release,
      events: (async function* () {
        yield* f.eventos
        if (f.colgar) {
          await Promise.race([interrumpido, new Promise(r => setTimeout(r, 20_000))])
          yield { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['Request was aborted.'], session_id: 'native' }
        }
      })(),
    }
  })
})
afterAll(() => { delete process.env.ARBRAIN_EDICION; delete process.env.ANTHROPIC_API_KEY })

const correr = async () => {
  const t0 = Date.now()
  const out: SSEEvent[] = []
  for await (const e of runAgentStream('hola', 'native', undefined, undefined, undefined, 'web', false, undefined, undefined, { model: 'claude-opus-5', effort: 'low', fast: false, ultracode: false }, { scope, onBackground: () => {} })) out.push(e)
  return { out, ms: Date.now() - t0, final: out.at(-1) as { type: string; message?: string } }
}

describe('chat del alumno: llave rechazada o sin crédito', () => {
  it('401 de OpenRouter en el primer reintento: corta el turno en segundos y lo dice en español', async () => {
    f.eventos = [init, reintento(401, 'authentication_failed')]
    const { ms, final } = await correr()
    expect(ms).toBeLessThan(3_000)
    expect(f.interrupt).toHaveBeenCalled()
    expect(final.type).toBe('error')
    expect(final.message).toMatch(new RegExp(`^${INICIO_LLAVE_RECHAZADA}`))
    expect(final.message).toMatch(/Ajustes › Llaves/)
    expect(final.message).not.toMatch(/^Failed to authenticate/)
    expect(esLlaveRechazada({ error: true, diagnostic: final.message })).toBe(true)
  })

  it('402 (sin crédito): corta y el chat reconoce «sin crédito» para ofrecer recargar', async () => {
    f.eventos = [init, reintento(402, 'billing_error')]
    const { ms, final } = await correr()
    expect(ms).toBeLessThan(3_000)
    expect(final.type).toBe('error')
    expect(final.message).toMatch(/sin crédito/)
    expect(esSinSaldo(final.message)).toBe(true)
    expect(esLlaveRechazada({ error: true, diagnostic: final.message })).toBe(false)
  })

  it('403 también es de la llave o la cuenta', async () => {
    f.eventos = [init, reintento(403, 'unknown')]
    const { final } = await correr()
    expect(final.message).toMatch(new RegExp(`^${INICIO_LLAVE_RECHAZADA}`))
  })

  it('el aviso de error del asistente (sin reintentos) también corta', async () => {
    f.eventos = [init, { type: 'assistant', error: 'authentication_failed', session_id: 'native', message: { id: 'x', content: [{ type: 'text', text: 'Failed to authenticate. API Error: 401 User not found.' }] } }]
    const { ms, final } = await correr()
    expect(ms).toBeLessThan(3_000)
    expect(final.message).toMatch(new RegExp(`^${INICIO_LLAVE_RECHAZADA}`))
    expect(final.message).toMatch(/Detalle técnico: Failed to authenticate\. API Error: 401 User not found\./)
  })

  it('el turno que muere con 401 en `result` (sin api_retry) también sale en español', async () => {
    f.colgar = false
    f.eventos = [init, { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['Failed to authenticate. API Error: 401 User not found.'], session_id: 'native' }]
    const { final } = await correr()
    expect(final.message).toMatch(new RegExp(`^${INICIO_LLAVE_RECHAZADA}`))
  })

  it('saturación (529) o límite (429) no se cortan: el CLI sigue reintentando como siempre', async () => {
    f.colgar = false
    f.eventos = [init, reintento(529, 'overloaded'), reintento(429, 'rate_limit'),
      { type: 'result', subtype: 'success', is_error: false, result: 'listo', session_id: 'native', usage: { input_tokens: 1, output_tokens: 1 }, modelUsage: {} }]
    const { out, final } = await correr()
    expect(f.interrupt).not.toHaveBeenCalled()
    expect(out.some(e => e.type === 'error')).toBe(false)
    expect(final).toMatchObject({ type: 'result', text: 'listo' })
  })
})

describe('clasificarFalloDeCuenta', () => {
  it('reconoce estados, errores del SDK y textos de Anthropic y OpenRouter', () => {
    expect(clasificarFalloDeCuenta({ status: 401 })).toBe('llave_invalida')
    expect(clasificarFalloDeCuenta({ status: 403 })).toBe('llave_invalida')
    expect(clasificarFalloDeCuenta({ status: 402 })).toBe('sin_saldo')
    expect(clasificarFalloDeCuenta({ status: 400, error: 'billing_error' })).toBe('sin_saldo')
    expect(clasificarFalloDeCuenta({ error: 'authentication_failed' })).toBe('llave_invalida')
    expect(clasificarFalloDeCuenta({ texto: 'Failed to authenticate. API Error: 401 User not found.' })).toBe('llave_invalida')
    expect(clasificarFalloDeCuenta({ texto: 'API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}' })).toBe('llave_invalida')
    expect(clasificarFalloDeCuenta({ texto: 'API Error: 402 {"error":{"message":"Insufficient credits. Add more using https://openrouter.ai/settings/credits","code":402}}' })).toBe('sin_saldo')
    expect(clasificarFalloDeCuenta({ texto: 'Your credit balance is too low to access the Anthropic API.' })).toBe('sin_saldo')
  })
  it('no confunde saturación, red, límites ni números sueltos', () => {
    for (const x of [{ status: 429, error: 'rate_limit' }, { status: 529, error: 'overloaded' }, { status: 500, error: 'server_error' }, { status: null, error: 'unknown' },
      { texto: 'fetch failed' }, { texto: 'Procesé 401 filas y 403 columnas' }, { texto: 'API Error: 529 Overloaded' }, { texto: '' }]) {
      expect(clasificarFalloDeCuenta(x)).toBeNull()
    }
  })
  it('el aviso nombra al proveedor y conserva el detalle técnico al final', () => {
    const m = mensajeFalloDeCuenta('llave_invalida', 'openrouter', 'API Error: 401 (authentication_failed)')
    expect(m).toMatch(/^Tu llave no funcionó: OpenRouter la rechazó/)
    expect(m).toMatch(/\n\nDetalle técnico: API Error: 401 \(authentication_failed\)$/)
    expect(mensajeFalloDeCuenta('sin_saldo', 'anthropic', 'API Error: 400 (billing_error)')).toMatch(/^Tu cuenta de Anthropic se quedó sin crédito/)
  })
})
