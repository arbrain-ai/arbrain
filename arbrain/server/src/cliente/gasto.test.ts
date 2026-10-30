/**
 * Seguridad del alumno (12 oct 2026), punto 3: tope de gasto. Forma de la respuesta oficial de OpenRouter
 * (`GET /api/v1/key`, doc consultada el 12 oct 2026) y que la llave solo viaja en la cabecera hacia OpenRouter.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { _gastoParaPruebas, consultarGasto, leerRespuestaOpenRouter } from './gasto.js'
import { fijarSecreto, vaciarCofreParaPruebas } from './cofre.js'
import { rutaSoloApp } from './cofre.js'

afterEach(() => { vaciarCofreParaPruebas(); _gastoParaPruebas() })

describe('tope de gasto', () => {
  it('lee usage/limit/limit_remaining de la respuesta oficial', () => {
    expect(leerRespuestaOpenRouter({ data: { label: 'x', usage: 3.2, usage_daily: 0.5, usage_weekly: 1, usage_monthly: 3.2, limit: 10, limit_remaining: 6.8, limit_reset: 'monthly', is_free_tier: false } }))
      .toEqual({ usado: 3.2, usadoHoy: 0.5, usadoSemana: 1, usadoMes: 3.2, limite: 10, restante: 6.8, reinicio: 'monthly', gratis: false })
    expect(leerRespuestaOpenRouter({ data: { usage: 0, limit: null, limit_remaining: null, limit_reset: null } })?.limite).toBeNull()
    expect(leerRespuestaOpenRouter({ error: 'x' })).toBeNull()
  })
  it('consulta OpenRouter con la llave solo en Authorization y no la devuelve', async () => {
    fijarSecreto('OPENROUTER_API_KEY', 'sk-or-v1-abcdef-prueba-que-no-sale')
    const vistas: Array<[string, RequestInit | undefined]> = []
    const f = (async (url: string, init?: RequestInit) => { vistas.push([url, init]); return new Response(JSON.stringify({ data: { usage: 1.5, limit: 5, limit_remaining: 3.5 } }), { status: 200 }) }) as unknown as typeof fetch
    const r = await consultarGasto(f, 1)
    expect(vistas[0][0]).toBe('https://openrouter.ai/api/v1/key')
    expect(new Headers(vistas[0][1]?.headers).get('authorization')).toBe('Bearer sk-or-v1-abcdef-prueba-que-no-sale')
    expect(r.openrouter.gasto?.restante).toBe(3.5)
    expect(JSON.stringify(r)).not.toContain('sk-or-v1')
    expect(r.enlaces.openrouterLlaves).toBe('https://openrouter.ai/settings/keys')
    expect(r.anthropic.gastoDisponible).toBe(false)
  })
  it('sin llave de OpenRouter no sale ninguna petición; la ruta es solo de la app', async () => {
    let llamadas = 0
    const r = await consultarGasto((async () => { llamadas++; return new Response('{}') }) as unknown as typeof fetch, 2)
    expect(llamadas).toBe(0)
    expect(r.openrouter.conectada).toBe(false)
    expect(rutaSoloApp('GET', '/gasto')).toBe(true)
  })
})
