import { describe, it, expect } from 'vitest'
import { claudeLimitsFromUsage, claudeWindows, codexLimitsFromPayload, PlanLimitsCache, unavailableLimits } from './plan-limits.js'

// Forma real devuelta por usage_EXPERIMENTAL… (2 oct 2026, recortada).
const claudeUsage = {
  subscription_type: 'max', rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: 8, resets_at: '2026-10-02T13:09:59.644470+00:00' },
    seven_day: { utilization: 55, resets_at: '2026-10-04T22:59:59.644497+00:00' },
    model_scoped: [{ display_name: 'Fable', utilization: 0, resets_at: '2026-10-04T22:59:59.644735+00:00' }],
    limits: [
      { kind: 'session', group: 'session', percent: 8, resets_at: '2026-10-02T13:09:59.644470+00:00', scope: null },
      { kind: 'weekly_all', group: 'weekly', percent: 55, resets_at: '2026-10-04T22:59:59.644497+00:00', scope: null },
      { kind: 'weekly_scoped', group: 'weekly', percent: 0, resets_at: '2026-10-04T22:59:59.644735+00:00', scope: { model: { id: null, display_name: 'Fable' }, surface: null } },
    ],
  },
}

describe('límites de Claude', () => {
  it('usa las filas del servidor, en su orden y con etiquetas en español', () => {
    const limits = claudeLimitsFromUsage('default', claudeUsage, 'ahora')
    expect(limits).toMatchObject({ available: true, plan: 'Max', engine: 'claude', reached: null })
    expect(limits.windows.map(w => [w.label, w.percent])).toEqual([['Ventana de 5 h', 8], ['Semanal', 55], ['Semanal · Fable', 0]])
    expect(limits.windows[0]).toMatchObject({ id: 'session', resetsAt: '2026-10-02T13:09:59.644470+00:00', windowMinutes: 300 })
    expect(limits.windows[1]).toMatchObject({ id: 'weekly_all', windowMinutes: 10080 })
  })
  it('la ventana de 5 h y la semanal siempre están; la que falta queda sin dato, no en cero', () => {
    const limits = claudeLimitsFromUsage('default', { rate_limits_available: true, rate_limits: { limits: [{ kind: 'weekly_all', percent: 30, resets_at: null }] } })
    expect(limits.available).toBe(true)
    expect(limits.windows.map(w => [w.id, w.percent])).toEqual([['session', null], ['weekly_all', 30]])
  })
  it('sin limits[] cae a los campos clásicos sin duplicar el modelo', () => {
    const { limits: _omit, ...legacy } = claudeUsage.rate_limits
    expect(claudeWindows(legacy).map(w => [w.label, w.percent])).toEqual([['Ventana de 5 h', 8], ['Semanal', 55], ['Semanal · Fable', 0]])
  })
  it('rate_limits null o no disponible es «sin dato» con motivo, nunca ceros', () => {
    const nulo = claudeLimitsFromUsage('bro', { subscription_type: 'max', rate_limits_available: true, rate_limits: null })
    expect(nulo).toMatchObject({ available: false, plan: 'Max' })
    expect(nulo.windows.map(w => [w.label, w.percent])).toEqual([['Ventana de 5 h', null], ['Semanal', null]])
    expect(unavailableLimits('default', 'claude', 'x').windows).toHaveLength(2)
    expect(unavailableLimits('codex', 'codex', 'x').windows).toEqual([])
    expect(nulo.reason).toMatch(/no pudo leer/)
    expect(claudeLimitsFromUsage('x', { subscription_type: null, rate_limits_available: false, rate_limits: null }).reason).toMatch(/no tiene límites/)
    expect(claudeLimitsFromUsage('x', null).available).toBe(false)
  })
  it('marca el límite alcanzado y recorta porcentajes fuera de rango', () => {
    const limits = claudeLimitsFromUsage('default', { rate_limits_available: true, rate_limits: { limits: [{ kind: 'session', percent: 140, resets_at: null }] } })
    expect(limits.windows[0].percent).toBe(100)
    expect(limits.reached).toBe('Ventana de 5 h')
  })
})

describe('límites de Codex', () => {
  const payload = {
    rateLimits: { limitId: 'codex', limitName: null, primary: { usedPercent: 6, windowDurationMins: 10080, resetsAt: 1791046964 }, secondary: null, planType: 'pro', rateLimitReachedType: null },
    rateLimitsByLimitId: {
      base_model_inference: { limitId: 'base_model_inference', limitName: 'gpt-reserve', primary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: 1791550884 }, secondary: null },
      codex: { limitId: 'codex', primary: { usedPercent: 6, windowDurationMins: 10080, resetsAt: 1791046964 } },
    },
  }
  it('etiqueta por duración, convierte el epoch a ISO y añade los límites por modelo', () => {
    const limits = codexLimitsFromPayload('codex', payload)
    expect(limits).toMatchObject({ available: true, plan: 'Pro', engine: 'codex' })
    expect(limits.windows.map(w => [w.label, w.percent])).toEqual([['Semanal', 6], ['Semanal · gpt-reserve', 0]])
    expect(limits.windows[0].resetsAt).toBe(new Date(1791046964 * 1000).toISOString())
  })
  it('ventana de 5 h se llama sesión; sin ventanas es «sin dato»', () => {
    const limits = codexLimitsFromPayload('codex', { rateLimits: { limitId: 'codex', primary: { usedPercent: 40, windowDurationMins: 300, resetsAt: 1 }, secondary: { usedPercent: 10, windowDurationMins: 10080, resetsAt: 2 } } })
    expect(limits.windows.map(w => w.label)).toEqual(['Sesión de 5 h', 'Semanal'])
    expect(codexLimitsFromPayload('codex', {}).available).toBe(false)
  })
})

describe('caché de límites', () => {
  it('reutiliza 60 s, no guarda fallos y recarga al vencer', async () => {
    let now = 0, calls = 0, fail = true
    const cache = new PlanLimitsCache(async account => { calls++; if (fail) throw new Error('red'); return unavailableLimits(account, 'claude', 'x') }, 60_000, () => now)
    await expect(cache.read('default')).rejects.toThrow('red')
    fail = false
    await cache.read('default'); await cache.read('default')
    expect(calls).toBe(2)
    now = 61_000
    await cache.read('default')
    expect(calls).toBe(3)
  })
})
