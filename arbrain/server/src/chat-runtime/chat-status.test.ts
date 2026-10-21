import { describe, expect, it } from 'vitest'
import { buildChatStatus, rateLimitView } from './chat-status.js'

const now = Date.parse('2026-09-07T05:00:00Z')

describe('rateLimitView', () => {
  it('normalises the app-server payload and leaves unknown fields null', () => {
    const view = rateLimitView({ rateLimits: { limitId: 'codex', limitName: 'codex', primary: { usedPercent: 12.4, windowDurationMins: 300, resetsAt: 1788758400 }, secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: null }, credits: { hasCredits: true, unlimited: false, balance: '3' }, planType: 'pro', rateLimitReachedType: null } })
    expect(view).toEqual({ limitName: 'codex', primary: { usedPercent: 12.4, windowDurationMins: 300, resetsAt: 1788758400 }, secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: null }, planType: 'pro', reached: null, credits: { hasCredits: true, unlimited: false, balance: '3' } })
    expect(rateLimitView({ rateLimits: { primary: { usedPercent: 'x' } } })?.primary).toBeNull()
    expect(rateLimitView(null)?.primary ?? null).toBeNull()
  })
})

describe('buildChatStatus', () => {
  it('reports scope controls, last-turn context and OpenAI quota windows with resets', () => {
    const text = buildChatStatus({
      account: 'codex', engine: 'openai', now,
      controls: { model: 'gpt-6-astra', effort: null, fast: false, ultracode: false }, configuredEffort: 'medium',
      lastTurn: { status: 'completed', servedModel: 'gpt-6-astra', usage: { contextUsed: 36000, contextTotal: 258400 } },
      quota: { state: 'available', limits: { limitName: 'codex', planType: 'pro', reached: null, credits: null, primary: { usedPercent: 12.4, windowDurationMins: 300, resetsAt: Math.floor(now / 1000) + 3 * 3600 + 20 * 60 }, secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: null } } },
      cronJobs: ['morning-briefing'],
    })
    expect(text).toContain('**Cuenta:** codex · OpenAI (ChatGPT)')
    expect(text).toContain('`gpt-6-astra` (elegido en esta conversación)')
    expect(text).toContain('**Esfuerzo:** medium (por defecto)')
    expect(text).toContain('**Contexto (último turno):** 36.0K / 258.4K (86% libre)')
    expect(text).toContain('**Cuota de la cuenta (pro):**')
    expect(text).toContain('- ventana de 5 h: 12% usada · se reinicia en 3 h 20 min')
    expect(text).toContain('- ventana de 7 d: 40% usada')
    expect(text).toContain('**1 Cron Jobs Activos:**')
  })
  it('never fabricates: no turn, no usage and unsupported quota are stated as such', () => {
    const empty = buildChatStatus({ account: 'default', engine: 'claude', controls: {}, quota: { state: 'unsupported', reason: 'no expuesta por el SDK' } })
    expect(empty).toContain('**Modelo:** default de la cuenta')
    expect(empty).toContain('**Contexto:** sin turnos todavía en esta conversación')
    expect(empty).toContain('**Cuota de la cuenta:** no expuesta · no expuesta por el SDK')
    const noUsage = buildChatStatus({ account: 'default', engine: 'claude', controls: {}, lastTurn: { status: 'failed', usage: null } })
    expect(noUsage).toContain('no reportado por el runtime (estado failed)')
    expect(noUsage).toContain('**Cuota de la cuenta:** desconocida')
    expect(buildChatStatus({ account: 'codex', engine: 'openai', controls: {}, quota: { state: 'available', limits: { limitName: null, planType: null, reached: 'rate_limit_reached', credits: null, primary: null, secondary: null } } })).toContain('LÍMITE ALCANZADO (rate_limit_reached)')
  })
})
