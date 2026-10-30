/**
 * Truthful `/status` for ONE conversation (M5): the controls of its scope, the
 * context of its last turn as the runtime reported it, and the account quota
 * when the provider exposes one. Nothing here is global daemon state, nothing
 * is estimated, and an absent value is shown as unknown rather than filled in.
 */
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
  if (ms <= 0) return ' · se reinicia ahora'
  const mins = Math.round(ms / 60_000)
  return mins < 60 ? ` · se reinicia en ${mins} min` : mins < 60 * 48 ? ` · se reinicia en ${Math.floor(mins / 60)} h ${mins % 60} min` : ` · se reinicia en ${Math.round(mins / (60 * 24))} d`
}
// The provider does not name its windows; the duration is the honest label.
const windowLine = (w: RateLimitWindowView, now: number) =>
  `- ventana${w.windowDurationMins ? ` de ${fmtDuration(w.windowDurationMins)}` : ''}: ${Math.round(w.usedPercent)}% usada${fmtReset(w.resetsAt, now)}`

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
  const lines: string[] = ['**Estado de esta conversación**', '']
  lines.push(`**Cuenta:** ${input.account} · ${input.engine === 'openai' ? 'OpenAI (ChatGPT)' : 'Claude'}`)
  const model = input.controls.model ?? null
  lines.push(`**Modelo:** ${model ? `\`${model}\` (elegido en esta conversación)` : 'default de la cuenta'}${input.lastTurn?.servedModel && input.lastTurn.servedModel !== model ? ` · último turno servido por \`${input.lastTurn.servedModel}\`` : ''}`)
  lines.push(`**Esfuerzo:** ${input.controls.effort ?? (input.configuredEffort ? `${input.configuredEffort} (por defecto)` : 'el de la cuenta')}`)
  lines.push(`**Fast:** ${input.controls.fast ? 'ON' : 'off'} · **Ultracode:** ${input.controls.ultracode ? 'ON (xhigh + orquestación)' : 'off'}`)
  const usage = input.lastTurn?.usage
  if (input.lastTurn && usage && typeof usage.contextUsed === 'number') {
    const total = typeof usage.contextTotal === 'number' ? usage.contextTotal : null
    lines.push(`**Contexto (último turno):** ${fmtTokens(usage.contextUsed)}${total ? ` / ${fmtTokens(total)} (${Math.round((1 - usage.contextUsed / total) * 100)}% libre)` : ' · ventana no reportada'}`)
  } else if (input.lastTurn) {
    lines.push(`**Contexto (último turno):** no reportado por el runtime (estado ${input.lastTurn.status})`)
  } else {
    lines.push('**Contexto:** sin turnos todavía en esta conversación')
  }
  const quota = input.quota
  if (!quota) lines.push('**Cuota de la cuenta:** desconocida')
  else if (quota.state === 'available') {
    const q = quota.limits
    lines.push(`**Cuota de la cuenta${q.planType ? ` (${q.planType})` : ''}:**${q.reached ? ` LÍMITE ALCANZADO (${q.reached})` : ''}`)
    if (q.primary) lines.push(windowLine(q.primary, now))
    if (q.secondary) lines.push(windowLine(q.secondary, now))
    if (!q.primary && !q.secondary) lines.push('- el proveedor no devolvió ventanas')
    if (q.credits && !q.credits.unlimited) lines.push(`- créditos: ${q.credits.hasCredits ? (q.credits.balance ?? 'disponibles') : 'sin créditos'}`)
  } else lines.push(`**Cuota de la cuenta:** ${quota.state === 'unsupported' ? 'no expuesta' : 'no disponible'} · ${quota.reason}`)
  if (input.cronJobs) {
    lines.push('', `**${input.cronJobs.length} Cron Jobs Activos:**`)
    for (const name of input.cronJobs) lines.push(`- ${name}`)
  }
  return lines.join('\n')
}
