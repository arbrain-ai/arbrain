import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSFClient } from '@/lib/supabase/sf-client'
import { hasRole } from '@/lib/auth-utils'
import type {
  ActionSeverity,
  CommandAction,
  CommandCenterState,
  CommandDataHealth,
  CommandFailingJob,
  CommandOwnerState,
  CommandSourceStatus,
  CommandSystemState,
  CommandWarning,
} from '@/features/command-center/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SourceKey = 'ml' | 'polar' | 'cron' | 'tasks'

interface OwnerSnapshot {
  metric_date?: string | null
  mrr_cents?: number | null
  active_subs?: number | null
  cancel_at_period_end?: number | null
  polar_reconciled_at?: string | null
  purchases_7d?: number | null
  booked_cents_7d?: number | null
  purchases_30d?: number | null
  booked_cents_30d?: number | null
  funnel_visits_30d?: number | null
  funnel_clicks_30d?: number | null
  funnel_checkouts_30d?: number | null
  funnel_plans_30d?: number | null
  funnel_payments_30d?: number | null
  funnel_conversion_pct_30d?: number | null
  active_7d?: number | null
  active_30d?: number | null
  flagged_interventions_48h?: number | null
  sales_leads_total?: number | null
  sales_leads_critical?: number | null
  sales_leads_high?: number | null
  top_video_title_30d?: string | null
  top_video_payments_30d?: number | null
  top_video_revenue_cents_30d?: number | null
}

interface DailyMetricRow {
  date?: string | null
  mrr_cents?: number | null
  active_subs?: number | null
  cancel_at_period_end?: number | null
  polar_reconciled_at?: string | null
}

interface PurchaseRow {
  created_at?: string | null
  status?: string | null
  locked_price_cents?: number | null
  locked_billing_interval?: string | null
}

interface SalesLeadRow {
  lead_score?: number | null
  lead_urgency?: string | null
}

interface ConversationRow {
  classification?: {
    flags?: {
      frustration_detected?: boolean | string | null
      escalation_needed?: boolean | string | null
      bug_reported?: boolean | string | null
    } | null
  } | null
}

interface AttributionRow {
  video_id?: string | null
  funnel_payments?: number | null
  funnel_revenue_cents?: number | null
}

interface VideoTitleRow {
  video_id?: string | null
  title?: string | null
}

interface MLResponse {
  ownerSnapshot?: OwnerSnapshot | null
  activeMembers?: {
    active_1d?: number | null
    active_7d?: number | null
    active_30d?: number | null
  } | null
}

interface PolarResponse {
  live?: { mrr_cents?: number | null; active_subs?: number | null; cancel_at_period_end?: number | null } | null
  live_error?: string | null
  reconciled?: {
    date?: string | null
    mrr_cents?: number | null
    active_subs?: number | null
    cancel_at_period_end?: number | null
    polar_reconciled_at?: string | null
  } | null
  delta?: { status?: 'green' | 'yellow' | 'red' | 'unknown'; subs?: number; mrr_pct?: number } | null
  last_reconcile?: { run_at?: string | null } | null
}

interface CronJob {
  id?: string | null
  chat_id?: string | null
  thread_id?: string | null
  prompt?: string | null
  schedule?: string | null
  next_run?: string | null
  last_run?: string | null
  last_result?: unknown
  status?: string | null
  created_at?: string | null
}

interface CronResponse {
  tasks?: CronJob[]
  offline?: boolean
  offlineReason?: string
  detail?: string
  upstreamStatus?: number
}

interface TaskRow {
  id?: string | null
  title?: string | null
  status?: string | null
  priority?: number | null
  due_at?: string | null
}

interface TasksResponse {
  tasks?: TaskRow[]
}

type SourceResult<T> =
  | { ok: true; data: T; latencyMs: number }
  | { ok: false; error: string; latencyMs: number; status?: number }

const ACTION_RANK: Record<ActionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function positive(value: unknown): number {
  return Math.max(0, toNumber(value) ?? 0)
}

function cents(value: number | null): string {
  if (value == null) return 'dato no disponible'
  return `$${Math.round(value / 100).toLocaleString('en-US')}`
}

function pct(value: number | null): string {
  if (value == null) return 'dato no disponible'
  return `${value.toFixed(1)}%`
}

function compact(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function isFlaggedConversation(row: ConversationRow) {
  const flags = row.classification?.flags
  if (!flags) return false
  return [flags.frustration_detected, flags.escalation_needed, flags.bug_reported]
    .some((value) => value === true || value === 'true')
}

function ageLabel(value: string | null | undefined) {
  if (!value) return 'sin fecha'
  const ms = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(ms)) return 'fecha invalida'
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function isStale(iso: string | null | undefined, hours = 36) {
  if (!iso) return true
  const ms = Date.now() - new Date(iso).getTime()
  return !Number.isFinite(ms) || ms > hours * 60 * 60 * 1000
}

async function requireCommandUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await hasRole(user.id, 'owner', 'admin'))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { error: null }
}

async function fetchSource<T>(
  req: NextRequest,
  path: string,
  timeoutMs = 4_000,
): Promise<SourceResult<T>> {
  const started = Date.now()
  const url = new URL(path, req.url)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        cookie: req.headers.get('cookie') ?? '',
      },
      signal: controller.signal,
    })
    const latencyMs = Date.now() - started
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = typeof json?.error === 'string'
        ? json.error
        : typeof json?.details === 'string'
          ? json.details
          : `${path} ${res.status}`
      return { ok: false, error: message, latencyMs, status: res.status }
    }
    return { ok: true, data: json as T, latencyMs }
  } catch (error) {
    const latencyMs = Date.now() - started
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message, latencyMs }
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchOwnerSnapshotDirect(): Promise<SourceResult<MLResponse>> {
  const started = Date.now()
  const sf = createSFClient()
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)

  try {
    const [
      latestMetricRes,
      purchasesRes,
      pageViewsRes,
      ctaClicksRes,
      checkoutsRes,
      plansRes,
      active1dRes,
      active7dRes,
      active30dRes,
      leadsRes,
      conversationsRes,
      attributionRes,
    ] = await Promise.all([
      sf
        .from('daily_business_metrics')
        .select('date, mrr_cents, active_subs, cancel_at_period_end, polar_reconciled_at')
        .order('date', { ascending: false })
        .limit(1)
        .single(),
      sf
        .from('community_purchases')
        .select('created_at, status, locked_price_cents, locked_billing_interval')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .in('status', ['completed', 'cancelled'])
        .limit(1000),
      sf
        .from('funnel_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString())
        .eq('event_name', 'about_page_view'),
      sf
        .from('funnel_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString())
        .eq('event_name', 'about_cta_click'),
      sf
        .from('funnel_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString())
        .eq('event_name', 'checkout_page_view'),
      sf
        .from('funnel_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString())
        .eq('event_name', 'plan_selected'),
      sf
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('has_community_access', true)
        .gte('last_seen', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
      sf
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('has_community_access', true)
        .gte('last_seen', sevenDaysAgo.toISOString()),
      sf
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('has_community_access', true)
        .gte('last_seen', thirtyDaysAgo.toISOString()),
      sf
        .from('youtube_comment_classifications')
        .select('lead_score, lead_urgency')
        .eq('category', 'sales-opportunity')
        .not('lead_score', 'is', null)
        .gte('lead_score', 60)
        .limit(5000),
      sf
        .from('conversation_sessions')
        .select('classification')
        .gte('first_message_at', fortyEightHoursAgo.toISOString())
        .gt('user_message_count', 0)
        .not('classification', 'is', null)
        .limit(500),
      sf
        .from('daily_video_attribution')
        .select('video_id, funnel_payments, funnel_revenue_cents')
        .gte('date', thirtyDaysAgo.toISOString().slice(0, 10))
        .gt('funnel_payments', 0)
        .limit(1000),
    ])

    const errors = [
      latestMetricRes.error,
      purchasesRes.error,
      pageViewsRes.error,
      ctaClicksRes.error,
      checkoutsRes.error,
      plansRes.error,
      active1dRes.error,
      active7dRes.error,
      active30dRes.error,
      leadsRes.error,
      conversationsRes.error,
      attributionRes.error,
    ].filter(Boolean)

    if (errors.length) {
      throw new Error(errors.map((error) => error?.message).join(' | '))
    }

    const purchases = (purchasesRes.data ?? []) as PurchaseRow[]
    const purchaseStats = purchases.reduce((acc, row) => {
      const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0
      const interval = row.locked_billing_interval === 'year' ? 'year' : 'month'
      const price = Number(row.locked_price_cents ?? (interval === 'year' ? 19_900 : 1_900))

      if (createdAt >= sevenDaysAgo.getTime()) {
        acc.purchases_7d += 1
        acc.booked_cents_7d += price
      }

      if (createdAt >= thirtyDaysAgo.getTime()) {
        acc.purchases_30d += 1
        acc.booked_cents_30d += price
      }

      return acc
    }, {
      purchases_7d: 0,
      booked_cents_7d: 0,
      purchases_30d: 0,
      booked_cents_30d: 0,
    })

    const leads = (leadsRes.data ?? []) as SalesLeadRow[]
    const salesLeadStats = leads.reduce((acc, row) => {
      acc.sales_leads_total += 1
      if (row.lead_urgency === 'critical') acc.sales_leads_critical += 1
      if (row.lead_urgency === 'high') acc.sales_leads_high += 1
      return acc
    }, {
      sales_leads_total: 0,
      sales_leads_critical: 0,
      sales_leads_high: 0,
    })

    const attribution = (attributionRes.data ?? []) as AttributionRow[]
    const attributionByVideo = new Map<string, { payments: number; revenue: number }>()
    for (const row of attribution) {
      if (!row.video_id) continue
      const existing = attributionByVideo.get(row.video_id) ?? { payments: 0, revenue: 0 }
      existing.payments += positive(row.funnel_payments)
      existing.revenue += positive(row.funnel_revenue_cents)
      attributionByVideo.set(row.video_id, existing)
    }
    const topAttribution = Array.from(attributionByVideo.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)[0] ?? null

    let topVideoTitle: string | null = null
    if (topAttribution?.[0]) {
      const { data: videoTitle } = await sf
        .from('youtube_videos')
        .select('video_id, title')
        .eq('video_id', topAttribution[0])
        .limit(1)
        .single()
      topVideoTitle = ((videoTitle as VideoTitleRow | null)?.title ?? null)
    }

    const latestMetric = latestMetricRes.data as DailyMetricRow | null
    const funnelVisits30d = pageViewsRes.count ?? 0
    const ownerSnapshot: OwnerSnapshot = {
      metric_date: latestMetric?.date ?? null,
      mrr_cents: toNumber(latestMetric?.mrr_cents),
      active_subs: toNumber(latestMetric?.active_subs),
      cancel_at_period_end: toNumber(latestMetric?.cancel_at_period_end),
      polar_reconciled_at: latestMetric?.polar_reconciled_at ?? null,
      purchases_7d: purchaseStats.purchases_7d,
      booked_cents_7d: purchaseStats.booked_cents_7d,
      purchases_30d: purchaseStats.purchases_30d,
      booked_cents_30d: purchaseStats.booked_cents_30d,
      funnel_visits_30d: funnelVisits30d,
      funnel_clicks_30d: ctaClicksRes.count ?? 0,
      funnel_checkouts_30d: checkoutsRes.count ?? 0,
      funnel_plans_30d: plansRes.count ?? 0,
      funnel_payments_30d: purchaseStats.purchases_30d,
      funnel_conversion_pct_30d: funnelVisits30d > 0
        ? Math.round((purchaseStats.purchases_30d / funnelVisits30d) * 10_000) / 100
        : 0,
      active_7d: active7dRes.count ?? 0,
      active_30d: active30dRes.count ?? 0,
      flagged_interventions_48h: ((conversationsRes.data ?? []) as ConversationRow[]).filter(isFlaggedConversation).length,
      ...salesLeadStats,
      top_video_title_30d: topVideoTitle,
      top_video_payments_30d: topAttribution?.[1].payments ?? 0,
      top_video_revenue_cents_30d: topAttribution?.[1].revenue ?? 0,
    }

    return {
      ok: true,
      latencyMs: Date.now() - started,
      data: {
        ownerSnapshot,
        activeMembers: {
          active_1d: active1dRes.count ?? 0,
          active_7d: active7dRes.count ?? 0,
          active_30d: active30dRes.count ?? 0,
        },
      },
    }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function statusOf<T>(result: SourceResult<T>): CommandSourceStatus {
  return result.ok
    ? { ok: true, latencyMs: result.latencyMs }
    : { ok: false, latencyMs: result.latencyMs, error: result.error }
}

function buildDataHealth(
  ml: SourceResult<MLResponse>,
  polar: SourceResult<PolarResponse>,
  cron: SourceResult<CronResponse>,
  tasks: SourceResult<TasksResponse>,
): CommandDataHealth {
  const warnings: CommandWarning[] = []
  const snap = ml.ok ? ml.data.ownerSnapshot : null
  const reconciled = polar.ok ? polar.data.reconciled : null
  const driftStatus = polar.ok ? (polar.data.delta?.status ?? 'unknown') : 'unknown'
  const reconciledAt = reconciled?.polar_reconciled_at ?? null

  const sources: Array<[SourceKey, SourceResult<unknown>]> = [
    ['ml', ml],
    ['polar', polar],
    ['cron', cron],
    ['tasks', tasks],
  ]

  for (const [key, result] of sources) {
    if (!result.ok) {
      warnings.push({
        id: `source-${key}`,
        severity: key === 'polar' ? 'critical' : 'warning',
        message: `${key} no respondio: ${result.error}`,
      })
    }
  }

  if (snap && !snap.polar_reconciled_at) {
    warnings.push({
      id: 'latest-row-unreconciled',
      severity: 'warning',
      message: 'La fila diaria mas reciente no tiene polar_reconciled_at.',
    })
  }

  if (
    snap &&
    positive(snap.mrr_cents) === 0 &&
    positive(reconciled?.mrr_cents) > 0 &&
    !snap.polar_reconciled_at
  ) {
    warnings.push({
      id: 'billing-zero-daily-row',
      severity: 'critical',
      message: 'La fila diaria trae MRR en cero, pero existe billing reconciliado no-cero. Usando Polar reconciliado.',
    })
  }

  if (polar.ok && polar.data.live_error) {
    warnings.push({
      id: 'polar-live-error',
      severity: 'warning',
      message: `Polar live no esta disponible: ${polar.data.live_error}`,
    })
  }

  if (cron.ok && cron.data.offline) {
    warnings.push({
      id: 'cron-offline',
      severity: 'critical',
      message: `ClaudeClaw bridge offline: ${cron.data.offlineReason ?? cron.data.detail ?? 'sin detalle'}`,
    })
  }

  if (!reconciled) {
    warnings.push({
      id: 'billing-missing',
      severity: 'critical',
      message: 'No hay snapshot de billing reconciliado disponible.',
    })
  } else if (isStale(reconciledAt, 36)) {
    warnings.push({
      id: 'billing-stale',
      severity: 'warning',
      message: `Billing reconciliado esta stale (${ageLabel(reconciledAt)}).`,
    })
  }

  const billingStatus = !reconciled || warnings.some((w) => w.id === 'billing-missing')
    ? 'error'
    : isStale(reconciledAt, 36)
      ? 'stale'
      : 'fresh'

  return {
    billingStatus,
    billingSnapshotDate: reconciled?.date ?? snap?.metric_date ?? null,
    polarReconciledAt: reconciledAt,
    polarDriftStatus: driftStatus,
    warnings,
  }
}

function buildOwner(ml: SourceResult<MLResponse>, polar: SourceResult<PolarResponse>): CommandOwnerState {
  const snap = ml.ok ? ml.data.ownerSnapshot : null
  const active = ml.ok ? ml.data.activeMembers : null
  const reconciled = polar.ok ? polar.data.reconciled : null

  return {
    mrrCents: toNumber(reconciled?.mrr_cents) ?? toNumber(snap?.mrr_cents),
    activeSubs: toNumber(reconciled?.active_subs) ?? toNumber(snap?.active_subs),
    cancelAtPeriodEnd: toNumber(reconciled?.cancel_at_period_end) ?? toNumber(snap?.cancel_at_period_end),
    bookedCents7d: toNumber(snap?.booked_cents_7d),
    purchases7d: toNumber(snap?.purchases_7d),
    bookedCents30d: toNumber(snap?.booked_cents_30d),
    purchases30d: toNumber(snap?.purchases_30d),
    funnelConversion30d: toNumber(snap?.funnel_conversion_pct_30d),
    active1d: toNumber(active?.active_1d),
    active7d: toNumber(snap?.active_7d) ?? toNumber(active?.active_7d),
    active30d: toNumber(snap?.active_30d) ?? toNumber(active?.active_30d),
    topVideoTitle30d: snap?.top_video_title_30d ?? null,
    topVideoRevenueCents30d: toNumber(snap?.top_video_revenue_cents_30d),
    topVideoPayments30d: toNumber(snap?.top_video_payments_30d),
    salesLeadsCritical: toNumber(snap?.sales_leads_critical),
    salesLeadsHigh: toNumber(snap?.sales_leads_high),
    salesLeadsTotal: toNumber(snap?.sales_leads_total),
    flaggedInterventions48h: toNumber(snap?.flagged_interventions_48h),
  }
}

function lastResultText(value: unknown) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function buildSystem(cron: SourceResult<CronResponse>, tasks: SourceResult<TasksResponse>): CommandSystemState {
  const cronJobs = cron.ok ? (cron.data.tasks ?? []) : []
  const boardTasks = tasks.ok ? (tasks.data.tasks ?? []) : []

  const cronActive = cronJobs.filter((job) => {
    const status = job.status?.toLowerCase()
    return status === 'active' || status === 'running' || status === 'enabled'
  }).length
  const cronPaused = cronJobs.filter((job) => {
    const status = job.status?.toLowerCase()
    return status === 'paused' || status === 'disabled'
  }).length

  const failingJobs: CommandFailingJob[] = cronJobs
    .filter((job) => {
      const status = job.status?.toLowerCase() ?? ''
      const result = lastResultText(job.last_result)
      return /fail|error|timeout|exception/i.test(`${status} ${result}`)
    })
    .slice(0, 5)
    .map((job) => ({
      id: compact(job.id, compact(job.chat_id, 'cron-job')),
      label: compact(job.prompt, compact(job.chat_id, 'Cron job')).slice(0, 80),
      age: ageLabel(job.last_run ?? job.created_at ?? null),
      error: lastResultText(job.last_result).slice(0, 180) || compact(job.status, 'status desconocido'),
    }))

  const open = boardTasks.filter((task) => !['done', 'archived'].includes(task.status ?? ''))
  const now = Date.now()
  const dueSoon = open.filter((task) => {
    if (!task.due_at) return false
    const ms = new Date(task.due_at).getTime() - now
    return Number.isFinite(ms) && ms <= 48 * 60 * 60 * 1000 && ms >= 0
  })
  const overdue = open.filter((task) => {
    if (!task.due_at) return false
    const ms = new Date(task.due_at).getTime() - now
    return Number.isFinite(ms) && ms < 0
  })

  let bridgeStatus: CommandSystemState['bridgeStatus'] = 'online'
  if (!cron.ok || cron.data.offline) bridgeStatus = 'offline'
  else if (failingJobs.length > 0) bridgeStatus = 'degraded'

  return {
    cronActive,
    cronPaused,
    failingJobs,
    bridgeStatus,
    tasksOpen: open.length,
    tasksUrgent: open.filter((task) => task.priority === 1).length,
    tasksHigh: open.filter((task) => task.priority === 2).length,
    tasksDueSoon: dueSoon.length,
    tasksOverdue: overdue.length,
  }
}

function pushAction(actions: CommandAction[], action: CommandAction) {
  if (!actions.some((existing) => existing.id === action.id)) actions.push(action)
}

function buildActions(owner: CommandOwnerState, system: CommandSystemState, health: CommandDataHealth): CommandAction[] {
  const actions: CommandAction[] = []
  const hotLeads = positive(owner.salesLeadsCritical) + positive(owner.salesLeadsHigh)

  if (hotLeads > 0) {
    pushAction(actions, {
      id: 'review-hot-leads',
      title: 'Revisar leads calientes',
      detail: `${positive(owner.salesLeadsCritical)} critical, ${positive(owner.salesLeadsHigh)} high, ${positive(owner.salesLeadsTotal)} total en comentarios.`,
      severity: positive(owner.salesLeadsCritical) > 0 ? 'critical' : 'high',
      source: 'sales',
      suggestedPrompt: 'Analiza los leads calientes de YouTube y dime a quien responder primero, con orden de prioridad y draft de respuesta para cada caso. Usa solo datos disponibles.',
    })
  }

  if (positive(owner.flaggedInterventions48h) > 0) {
    pushAction(actions, {
      id: 'support-interventions',
      title: 'Intervenir soporte hoy',
      detail: `${positive(owner.flaggedInterventions48h)} conversaciones flaggeadas en 48h.`,
      severity: 'high',
      source: 'support',
      suggestedPrompt: 'Dame el plan de intervencion para las conversaciones flaggeadas: cual atacar primero, que responder, y que aprendizaje vuelve al producto o contenido.',
    })
  }

  if (owner.funnelConversion30d != null && owner.funnelConversion30d < 1.5) {
    pushAction(actions, {
      id: 'audit-funnel',
      title: 'Auditar landing a pago',
      detail: `${pct(owner.funnelConversion30d)} conversion 30d con ${positive(owner.purchases30d)} pagos.`,
      severity: owner.funnelConversion30d < 1 ? 'critical' : 'medium',
      source: 'funnel',
      suggestedPrompt: 'Audita el paso landing a pago con los datos actuales. Dame 3 hipotesis, como validarlas, y el cambio de mayor apalancamiento sin inventar metricas.',
    })
  }

  if (positive(owner.cancelAtPeriodEnd) > 0) {
    pushAction(actions, {
      id: 'retention-defense',
      title: 'Defender retencion',
      detail: `${positive(owner.cancelAtPeriodEnd)} subs con cancel_at_period_end.`,
      severity: positive(owner.cancelAtPeriodEnd) >= 3 ? 'high' : 'medium',
      source: 'retention',
      suggestedPrompt: 'Analiza el riesgo de retencion y propon un playbook de defensa para cancel_at_period_end sin sonar desesperado ni hacer descuentos tontos.',
    })
  }

  const criticalWarnings = health.warnings.filter((warning) => warning.severity === 'critical')
  if (criticalWarnings.length > 0) {
    pushAction(actions, {
      id: 'fix-data-health',
      title: 'Corregir data health',
      detail: criticalWarnings.map((warning) => warning.message).join(' '),
      severity: 'critical',
      source: 'system',
      suggestedPrompt: 'Investiga el data health del Command Center. Prioriza Polar sync, cron bridge, y fuentes parciales. Dame causa probable y siguiente comando seguro.',
    })
  }

  if (system.failingJobs.length > 0) {
    pushAction(actions, {
      id: 'fix-cron-jobs',
      title: 'Revisar jobs fallando',
      detail: `${system.failingJobs.length} jobs con error o timeout.`,
      severity: 'high',
      source: 'system',
      suggestedPrompt: 'Revisa los cron jobs fallando y dame un plan de debug con orden exacto: que job, que error, que comando correr, y que no tocar.',
    })
  }

  if (system.tasksUrgent > 0 || system.tasksOverdue > 0) {
    pushAction(actions, {
      id: 'triage-board',
      title: 'Triage del board',
      detail: `${system.tasksUrgent} urgentes, ${system.tasksOverdue} vencidas, ${system.tasksOpen} abiertas.`,
      severity: system.tasksOverdue > 0 ? 'high' : 'medium',
      source: 'system',
      suggestedPrompt: 'Haz triage del board como owner. Dime que eliminar, delegar, hacer hoy, o convertir en automatizacion. No escribas a la BD sin confirmacion.',
    })
  }

  if (actions.length === 0) {
    pushAction(actions, {
      id: 'owner-cadence',
      title: 'Mantener cadencia owner',
      detail: 'No hay incendios claros. Prioriza contenido, producto y distribucion.',
      severity: 'low',
      source: 'content',
      suggestedPrompt: 'No hay incendios claros. Dime la accion owner de mayor apalancamiento para hoy usando el estado actual del Business OS.',
    })
  }

  return actions
    .sort((a, b) => ACTION_RANK[a.severity] - ACTION_RANK[b.severity])
    .slice(0, 6)
}

function buildBrief(owner: CommandOwnerState, system: CommandSystemState, health: CommandDataHealth, actions: CommandAction[]) {
  const top = actions[0]
  const warningCount = health.warnings.length
  const sales = `${cents(owner.bookedCents7d)} en 7d, ${cents(owner.bookedCents30d)} en 30d`
  const funnel = owner.funnelConversion30d == null ? 'funnel sin dato' : `${pct(owner.funnelConversion30d)} funnel 30d`
  const riskParts = [
    positive(owner.cancelAtPeriodEnd) ? `${positive(owner.cancelAtPeriodEnd)} cancel pending` : null,
    system.bridgeStatus !== 'online' ? `bridge ${system.bridgeStatus}` : null,
    warningCount ? `${warningCount} warnings de data` : null,
  ].filter(Boolean)

  return {
    headline: top?.severity === 'critical'
      ? `Atencion: ${top.title}`
      : positive(owner.bookedCents7d) > 0
        ? 'El negocio esta vendiendo, ahora toca defender conversion y sistema.'
        : 'No hay senal fuerte de ventas recientes; hay que mover demanda o diagnosticar data.',
    status: `Ventas: ${sales}. MRR: ${cents(owner.mrrCents)}. ${funnel}.`,
    risk: riskParts.length ? `Riesgo: ${riskParts.join(', ')}.` : 'Riesgo: sin incendio critico visible.',
    decision: top ? `Decision: atacar ${top.title.toLowerCase()} antes de optimizar cosmetica.` : 'Decision: mantener cadencia.',
    nextAction: top ? top.detail : 'Pedir status y elegir una accion owner.',
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireCommandUser()
  if (auth.error) return auth.error

  const [ml, polar, cron, tasks] = await Promise.all([
    fetchOwnerSnapshotDirect(),
    fetchSource<PolarResponse>(req, '/api/analytics/polar', 5_500),
    fetchSource<CronResponse>(req, '/api/cron', 4_000),
    fetchSource<TasksResponse>(req, '/api/tasks', 4_000),
  ])

  const dataHealth = buildDataHealth(ml, polar, cron, tasks)
  const owner = buildOwner(ml, polar)
  const system = buildSystem(cron, tasks)
  const actions = buildActions(owner, system, dataHealth)

  const state: CommandCenterState = {
    generatedAt: new Date().toISOString(),
    partial: [ml, polar, cron, tasks].some((result) => !result.ok),
    dataHealth,
    owner,
    system,
    actions,
    brief: buildBrief(owner, system, dataHealth, actions),
    sources: {
      ml: statusOf(ml),
      polar: statusOf(polar),
      cron: statusOf(cron),
      tasks: statusOf(tasks),
    },
  }

  return NextResponse.json({ state }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
