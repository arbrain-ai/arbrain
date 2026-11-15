/**
 * Truthful `/status` for ONE conversation (M5): the controls of its scope, the
 * context of its last turn as the runtime reported it, and the account quota
 * when the provider exposes one. Nothing here is global daemon state, nothing
 * is estimated, and an absent value is shown as unknown rather than filled in.
 */
import { tr } from '../i18n/tr.js'

export interface RateLimitWindowView { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null }
export interface RateLimitView {
  limitName: string | null
  primary: RateLimitWindowView | null
  secondary: RateLimitWindowView | null
  planType: string | null
  reached: string | null
  credits: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null
}
export interface StatusUsage { contextUsed?: number | null; contextTotal?: number | null; inputTokens?: number | null; outputTokens?: number | null; model?: string | null }
export interface StatusInput {
  account: string
  engine: 'openai' | 'claude'
  controls: { model?: string | null; effort?: string | null; fast?: boolean | null; ultracode?: boolean | null }
  /** Esfuerzo que corre sin elección explícita (hoy: medium para todas las cuentas). */
  configuredEffort?: string | null
  lastTurn?: { status: string; servedModel?: string | null; usage?: StatusUsage | null; updatedAt?: number | null } | null
  quota?: { state: 'available'; limits: RateLimitView } | { state: 'unavailable'; reason: string } | { state: 'unsupported'; reason: string }
  cronJobs?: string[]
  now?: number
}

export const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
const fmtDuration = (mins: number) => mins >= 60 * 24 ? `${Math.round(mins / (60 * 24))} d` : mins >= 60 ? `${Math.round(mins / 60)} h` : `${mins} min`
const fmtReset = (resetsAt: number | null, now: number) => {
  if (resetsAt == null) return ''
  const ms = resetsAt * (resetsAt < 1e12 ? 1000 : 1) - now
  if (ms <= 0) return ` · ${tr('se reinicia ahora')}`
  const mins = Math.round(ms / 60_000)
  return ` · ${mins < 60 ? tr('se reinicia en {min} min', { min: mins }) : mins < 60 * 48 ? tr('se reinicia en {h} h {min} min', { h: Math.floor(mins / 60), min: mins % 60 }) : tr('se reinicia en {d} d', { d: Math.round(mins / (60 * 24)) })}`
}
// The provider does not name its windows; the duration is the honest label.
const windowLine = (w: RateLimitWindowView, now: number) =>
  `- ${w.windowDurationMins ? tr('ventana de {duracion}: {pct}% usada', { duracion: fmtDuration(w.windowDurationMins), pct: Math.round(w.usedPercent) }) : tr('ventana: {pct}% usada', { pct: Math.round(w.usedPercent) })}${fmtReset(w.resetsAt, now)}`

/** Normalises the app-server `account/rateLimits/read` payload; unknown fields stay null. */
export function rateLimitView(payload: unknown): RateLimitView | null {
  const root = (payload ?? {}) as Record<string, unknown>
  const snapshot = (root.rateLimits ?? root) as Record<string, unknown>
  if (!snapshot || typeof snapshot !== 'object') return null
  const window = (value: unknown): RateLimitWindowView | null => {
    const w = value as Record<string, unknown> | null
    if (!w || typeof w.usedPercent !== 'number') return null
    return { usedPercent: w.usedPercent, windowDurationMins: typeof w.windowDurationMins === 'number' ? w.windowDurationMins : null, resetsAt: typeof w.resetsAt === 'number' ? w.resetsAt : null }
  }
  const credits = snapshot.credits as Record<string, unknown> | null
  return {
    limitName: typeof snapshot.limitName === 'string' ? snapshot.limitName : null,
    primary: window(snapshot.primary), secondary: window(snapshot.secondary),
    planType: typeof snapshot.planType === 'string' ? snapshot.planType : null,
    reached: typeof snapshot.rateLimitReachedType === 'string' ? snapshot.rateLimitReachedType : null,
    credits: credits && typeof credits.hasCredits === 'boolean' ? { hasCredits: credits.hasCredits, unlimited: credits.unlimited === true, balance: typeof credits.balance === 'string' ? credits.balance : null } : null,
  }
}

export function buildChatStatus(input: StatusInput): string {
  const now = input.now ?? Date.now()
  const lines: string[] = [tr('**Estado de esta conversación**'), '']
  lines.push(tr('**Cuenta:** {cuenta} · {motor}', { cuenta: input.account, motor: input.engine === 'openai' ? 'OpenAI (ChatGPT)' : 'Claude' }))
  const model = input.controls.model ?? null
  const servido = input.lastTurn?.servedModel && input.lastTurn.servedModel !== model ? ` · ${tr('último turno servido por `{modelo}`', { modelo: input.lastTurn.servedModel })}` : ''
  lines.push(`${model ? tr('**Modelo:** `{modelo}` (elegido en esta conversación)', { modelo: model }) : tr('**Modelo:** default de la cuenta')}${servido}`)
  lines.push(input.controls.effort ? tr('**Esfuerzo:** {esfuerzo}', { esfuerzo: input.controls.effort }) : input.configuredEffort ? tr('**Esfuerzo:** {esfuerzo} (por defecto)', { esfuerzo: input.configuredEffort }) : tr('**Esfuerzo:** el de la cuenta'))
  lines.push(`**Fast:** ${input.controls.fast ? 'ON' : 'off'} · **Ultracode:** ${input.controls.ultracode ? tr('ON (xhigh + orquestación)') : 'off'}`)
  const usage = input.lastTurn?.usage
  if (input.lastTurn && usage && typeof usage.contextUsed === 'number') {
    const total = typeof usage.contextTotal === 'number' ? usage.contextTotal : null
    lines.push(total
      ? tr('**Contexto (último turno):** {usado} / {total} ({libre}% libre)', { usado: fmtTokens(usage.contextUsed), total: fmtTokens(total), libre: Math.round((1 - usage.contextUsed / total) * 100) })
      : tr('**Contexto (último turno):** {usado} · ventana no reportada', { usado: fmtTokens(usage.contextUsed) }))
  } else if (input.lastTurn) {
    lines.push(tr('**Contexto (último turno):** no reportado por el runtime (estado {estado})', { estado: input.lastTurn.status }))
  } else {
    lines.push(tr('**Contexto:** sin turnos todavía en esta conversación'))
  }
  const quota = input.quota
  if (!quota) lines.push(tr('**Cuota de la cuenta:** desconocida'))
  else if (quota.state === 'available') {
    const q = quota.limits
    lines.push(`${q.planType ? tr('**Cuota de la cuenta ({plan}):**', { plan: q.planType }) : tr('**Cuota de la cuenta:**')}${q.reached ? ` ${tr('LÍMITE ALCANZADO ({tipo})', { tipo: q.reached })}` : ''}`)
    if (q.primary) lines.push(windowLine(q.primary, now))
    if (q.secondary) lines.push(windowLine(q.secondary, now))
    if (!q.primary && !q.secondary) lines.push(tr('- el proveedor no devolvió ventanas'))
    if (q.credits && !q.credits.unlimited) lines.push(tr('- créditos: {saldo}', { saldo: q.credits.hasCredits ? (q.credits.balance ?? tr('disponibles')) : tr('sin créditos') }))
  } else lines.push(tr('**Cuota de la cuenta:** {estado} · {motivo}', { estado: quota.state === 'unsupported' ? tr('no expuesta') : tr('no disponible'), motivo: quota.reason }))
  if (input.cronJobs) {
    lines.push('', tr('**{n} Cron Jobs Activos:**', { n: input.cronJobs.length }))
    for (const name of input.cronJobs) lines.push(`- ${name}`)
  }
  return lines.join('\n')
}
