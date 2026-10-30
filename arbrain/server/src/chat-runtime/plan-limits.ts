import { randomUUID } from 'node:crypto'
import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { ClaudeInteractiveSession, requireClaudeSubscription } from './claude-session.js'

/**
 * Límites de uso del plan de UNA cuenta (2 oct 2026), para el popover de la
 * barra de entrada. Solo lo que el proveedor reporta: lo que falta queda null
 * o fuera de la lista, nunca se estima.
 *  - Claude: `usage_EXPERIMENTAL…` del Agent SDK (los mismos datos que `/usage`).
 *  - Codex: `account/rateLimits/read` del App Server.
 */
export interface PlanLimitWindow {
  id: string
  label: string
  /** 0-100, o null si el proveedor no lo dio. */
  percent: number | null
  /** ISO 8601 del próximo restablecimiento, o null. */
  resetsAt: string | null
  windowMinutes: number | null
}
export interface PlanLimits {
  account: string
  engine: 'claude' | 'codex'
  plan: string | null
  /** false = el proveedor no devolvió límites (`reason` dice por qué). */
  available: boolean
  reason: string | null
  windows: PlanLimitWindow[]
  reached: string | null
  observedAt: string
  source: 'claude-usage' | 'codex-rate-limits'
}

const asNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
const asText = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null
const capitalize = (text: string | null) => text ? text.charAt(0).toUpperCase() + text.slice(1) : null
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const percentOf = (value: unknown): number | null => { const n = asNumber(value); return n === null ? null : Math.max(0, Math.min(100, n)) }

/** Etiquetas en español de las filas de Claude. `kind` es del servidor; nunca se clasifica por etiqueta. */
function claudeRowLabel(kind: string, scope: Record<string, unknown> | null): string {
  const model = asText(record(scope?.model)?.display_name)
  const surface = asText(record(scope?.surface)?.display_name)
  if (kind === 'session') return 'Ventana de 5 h'
  if (kind === 'weekly_all') return 'Semanal'
  if (kind === 'weekly_scoped') return `Semanal · ${model ?? surface ?? 'por modelo'}`
  return model ?? surface ?? kind
}

/** Las dos filas que Daniel pidió ver siempre (2 oct 2026): ventana de 5 h y semanal. Si el
 * proveedor no las trae, quedan con percent null («sin dato»), nunca con un cero. */
const CLAUDE_FIXED: Array<Pick<PlanLimitWindow, 'id' | 'label' | 'windowMinutes'>> = [
  { id: 'session', label: 'Ventana de 5 h', windowMinutes: 300 },
  { id: 'weekly_all', label: 'Semanal', windowMinutes: 10080 },
]
function withClaudeFixed(windows: PlanLimitWindow[]): PlanLimitWindow[] {
  const fixed = CLAUDE_FIXED.map(row => windows.find(w => w.id === row.id) ?? { ...row, percent: null, resetsAt: null })
  return [...fixed, ...windows.filter(w => !CLAUDE_FIXED.some(row => row.id === w.id))]
}

/** `rate_limits` de `usage_EXPERIMENTAL…` → ventanas: primero las fijas (5 h y semanal), luego las
 * del servidor por modelo. Prefiere `limits[]` (filas del servidor, en su orden); sin él, los campos clásicos. */
export function claudeWindows(rateLimits: unknown): PlanLimitWindow[] {
  return withClaudeFixed(serverWindows(rateLimits))
}
function serverWindows(rateLimits: unknown): PlanLimitWindow[] {
  const root = record(rateLimits)
  if (!root) return []
  const rows = Array.isArray(root.limits) ? root.limits : null
  if (rows?.length) {
    return rows.flatMap((raw, index): PlanLimitWindow[] => {
      const row = record(raw)
      const kind = asText(row?.kind)
      if (!row || !kind) return []
      const scope = record(row.scope)
      const fixed = (kind === 'session' || kind === 'weekly_all') && !rows.slice(0, index).some(r => record(r)?.kind === kind)
      return [{ id: fixed ? kind : `${kind}:${index}`, label: claudeRowLabel(kind, scope), percent: percentOf(row.percent), resetsAt: asText(row.resets_at), windowMinutes: kind === 'session' ? 300 : kind.startsWith('weekly') ? 10080 : null }]
    })
  }
  const legacy: PlanLimitWindow[] = []
  const add = (id: string, label: string, value: unknown, windowMinutes: number) => {
    const window = record(value)
    if (!window || percentOf(window.utilization) === null) return
    legacy.push({ id, label, percent: percentOf(window.utilization), resetsAt: asText(window.resets_at), windowMinutes })
  }
  add('session', 'Ventana de 5 h', root.five_hour, 300)
  add('weekly_all', 'Semanal', root.seven_day, 10080)
  if (Array.isArray(root.model_scoped)) {
    for (const raw of root.model_scoped) {
      const row = record(raw)
      const name = asText(row?.display_name)
      if (row && name) add(`scoped:${name}`, `Semanal · ${name}`, row, 10080)
    }
  } else {
    add('seven_day_opus', 'Semanal · Opus', root.seven_day_opus, 10080)
    add('seven_day_sonnet', 'Semanal · Sonnet', root.seven_day_sonnet, 10080)
  }
  return legacy
}

/** Respuesta de `usage_EXPERIMENTAL…` → límites normalizados. */
export function claudeLimitsFromUsage(account: string, usage: unknown, observedAt = new Date().toISOString()): PlanLimits {
  const root = record(usage)
  const base = { account, engine: 'claude' as const, plan: capitalize(asText(root?.subscription_type)), reached: null, observedAt, source: 'claude-usage' as const }
  const windows = root?.rate_limits_available === true ? claudeWindows(root.rate_limits) : withClaudeFixed([])
  if (!windows.some(w => w.percent !== null)) {
    return { ...base, available: false, windows, reason: root?.rate_limits_available === false ? 'Esta cuenta no tiene límites de plan (no es una suscripción de claude.ai).' : 'Claude no pudo leer los límites de esta cuenta (la sesión no tiene acceso al perfil o la consulta falló).' }
  }
  const reached = windows.find(w => w.percent !== null && w.percent >= 100)
  return { ...base, available: true, reason: null, windows, reached: reached?.label ?? null }
}

const minutesLabel = (minutes: number | null): string => {
  if (minutes === null) return 'Ventana de uso'
  if (minutes >= 10080 && minutes % 10080 === 0) return minutes === 10080 ? 'Semanal' : `Ventana de ${minutes / 10080} semanas`
  if (minutes >= 1440 && minutes % 1440 === 0) return minutes === 1440 ? 'Diario' : `Ventana de ${minutes / 1440} días`
  if (minutes >= 60) return `Sesión de ${Math.round(minutes / 60)} h`
  return `Ventana de ${minutes} min`
}
const epochToIso = (value: unknown): string | null => {
  const n = asNumber(value)
  if (n === null) return null
  return new Date(n * (n < 1e12 ? 1000 : 1)).toISOString()
}

/** Payload de `account/rateLimits/read`: ventanas del plan y, aparte, las de cada modelo con cuota propia. */
export function codexLimitsFromPayload(account: string, payload: unknown, observedAt = new Date().toISOString()): PlanLimits {
  const root = record(payload)
  const main = record(root?.rateLimits)
  const base = { account, engine: 'codex' as const, plan: capitalize(asText(main?.planType)), observedAt, source: 'codex-rate-limits' as const }
  const windows: PlanLimitWindow[] = []
  const collect = (snapshot: Record<string, unknown> | null, id: string, scope: string | null) => {
    for (const slot of ['primary', 'secondary'] as const) {
      const window = record(snapshot?.[slot])
      const percent = percentOf(window?.usedPercent)
      if (!window || percent === null) continue
      const minutes = asNumber(window.windowDurationMins)
      windows.push({ id: `${id}:${slot}`, label: scope ? `${minutesLabel(minutes)} · ${scope}` : minutesLabel(minutes), percent, resetsAt: epochToIso(window.resetsAt), windowMinutes: minutes })
    }
  }
  collect(main, asText(main?.limitId) ?? 'codex', asText(main?.limitName))
  const byId = record(root?.rateLimitsByLimitId)
  for (const [id, raw] of Object.entries(byId ?? {})) {
    if (id === (asText(main?.limitId) ?? 'codex')) continue
    const snapshot = record(raw)
    collect(snapshot, id, asText(snapshot?.limitName) ?? id)
  }
  const reached = asText(main?.rateLimitReachedType)
  if (!windows.length) return { ...base, available: false, reason: 'Codex no devolvió ventanas de uso para esta cuenta.', windows: [], reached }
  return { ...base, available: true, reason: null, windows, reached }
}

/** Sin dato: el motivo viaja al popover en vez de un cero inventado. */
export function unavailableLimits(account: string, engine: 'claude' | 'codex', reason: string): PlanLimits {
  return { account, engine, plan: null, available: false, reason, windows: engine === 'claude' ? withClaudeFixed([]) : [], reached: null, observedAt: new Date().toISOString(), source: engine === 'claude' ? 'claude-usage' : 'codex-rate-limits' }
}

type Loader = (account: string) => Promise<PlanLimits>
/** Caché corto por cuenta: abrir el popover varias veces no debe lanzar un proceso por vez. Los fallos no se guardan. */
export class PlanLimitsCache {
  private entries = new Map<string, { expiresAt: number; pending: Promise<PlanLimits> }>()
  constructor(private load: Loader, private ttlMs = 60_000, private now = () => Date.now()) {}
  read(account: string): Promise<PlanLimits> {
    const old = this.entries.get(account)
    if (old && old.expiresAt > this.now()) return old.pending
    const entry = { expiresAt: Infinity, pending: Promise.resolve(null as unknown as PlanLimits) }
    entry.pending = this.load(account).then(result => { entry.expiresAt = this.now() + this.ttlMs; return result })
      .catch(error => { if (this.entries.get(account) === entry) this.entries.delete(account); throw error })
    this.entries.set(account, entry)
    return entry.pending
  }
}

/** Sesión de metadatos de Claude (sin prompt, sin turno de Levy). Importa: SIN
 * CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, que deja `rate_limits` en null
 * (probado el 2 oct 2026); por eso se quita aunque el entorno la herede. */
export function createClaudeLimitsLoader(cwd: string): Loader {
  return async account => {
    const options: Options = { cwd, settingSources: ['project', 'user'], settings: { disableAllHooks: true }, tools: [], permissionMode: 'default', canUseTool: async () => ({ behavior: 'deny', message: 'Metadata only' }), env: { CLAUDECLAW_DAEMON: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: undefined } }
    const session = new ClaudeInteractiveSession({ owner: 'host-plan-limits', account, conversationId: randomUUID() }, options, () => {})
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        (async () => {
          requireClaudeSubscription(await session.query.accountInfo())
          const usage = await session.query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })
          return claudeLimitsFromUsage(account, usage)
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Claude no respondió a tiempo con los límites del plan.')), 15_000) }),
      ])
    } finally { clearTimeout(timer); session.close(); await session.drained }
  }
}

let claudeCache: PlanLimitsCache | undefined
/** Límites de una cuenta Claude ('default' | 'bro'), con caché de 60 s. */
export function readClaudePlanLimits(cwd: string, account: string): Promise<PlanLimits> {
  if (!['default', 'bro'].includes(account)) return Promise.reject(new Error('Cuenta Claude desconocida.'))
  return (claudeCache ??= new PlanLimitsCache(createClaudeLimitsLoader(cwd))).read(account)
}
const codexCaches = new Map<string, PlanLimitsCache>()
/** Límites de una cuenta Codex, con caché de 60 s; `request` consulta `account/rateLimits/read`. */
export function readCodexPlanLimits(account: string, request: () => Promise<unknown>): Promise<PlanLimits> {
  let cache = codexCaches.get(account)
  if (!cache) { cache = new PlanLimitsCache(async name => codexLimitsFromPayload(name, await request())); codexCaches.set(account, cache) }
  return cache.read(account)
}
