import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSFClient } from '@/lib/supabase/sf-client'

/**
 * /api/analytics/polar
 *
 * Single Source of Truth dashboard data:
 * - `live`: Polar API live state (requires POLAR_ACCESS_TOKEN env)
 * - `reconciled`: Latest snapshot written by polar_reconcile.py to daily_business_metrics
 * - `delta`: Difference between live and reconciled (visible drift indicator)
 * - `last_reconcile`: Most recent polar_reconcile_log entry
 *
 * Cache: client should not aggressive-cache (Next handles via revalidate).
 * Rate limits: Polar allows ~120/min, this endpoint is ~5 calls/visit, fine.
 */

// Cache for 60 seconds — Polar API call is slow-ish (~600ms)
export const revalidate = 60

const POLAR_API = 'https://api.polar.sh/v1'
// Sin este header Polar usa "Current", que rota sola cada trimestre y puede
// cambiar campos sin avisar. Se fija la version; migrar a mano.
const POLAR_VERSION = '2026-04'

interface PolarSub {
  status: string
  recurring_interval?: 'month' | 'year'
  amount?: number
  cancel_at_period_end?: boolean
}

interface LiveMetrics {
  mrr_cents: number
  active_subs: number
  monthly_subs: number
  yearly_subs: number
  cancel_at_period_end: number
  fetched_at: string
}

async function fetchAllPolarSubs(token: string): Promise<PolarSub[]> {
  const all: PolarSub[] = []
  let page = 1
  while (true) {
    const url = `${POLAR_API}/subscriptions?limit=100&page=${page}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Polar-Version': POLAR_VERSION },
      // Don't cache — we want fresh data
      cache: 'no-store',
    })
    if (!res.ok) {
      throw new Error(`Polar API ${res.status}: ${res.statusText}`)
    }
    const data = await res.json()
    const items: PolarSub[] = data.items || []
    all.push(...items)
    const maxPage = data.pagination?.max_page || 1
    if (page >= maxPage || items.length === 0) break
    page += 1
  }
  return all
}

function computeLiveMetrics(subs: PolarSub[]): LiveMetrics {
  // Polar dashboard convention: active = active + trialing + past_due (still has access).
  // MRR excludes past_due (those aren't paying right now).
  const activeForCount = subs.filter(s =>
    ['active', 'trialing', 'past_due'].includes(s.status)
  )
  const activeForMrr = subs.filter(s => ['active', 'trialing'].includes(s.status))

  const monthly = activeForCount.filter(s => s.recurring_interval === 'month').length
  const yearly = activeForCount.filter(s => s.recurring_interval === 'year').length
  const cape = activeForCount.filter(s => s.cancel_at_period_end).length

  const mrr =
    activeForMrr
      .filter(s => s.recurring_interval === 'month')
      .reduce((acc, s) => acc + (s.amount || 0), 0) +
    activeForMrr
      .filter(s => s.recurring_interval === 'year')
      .reduce((acc, s) => acc + Math.floor((s.amount || 0) / 12), 0)

  return {
    mrr_cents: mrr,
    active_subs: activeForCount.length,
    monthly_subs: monthly,
    yearly_subs: yearly,
    cancel_at_period_end: cape,
    fetched_at: new Date().toISOString(),
  }
}

function deltaStatus(live: LiveMetrics | null, reconciled: { active_subs: number; mrr_cents: number } | null) {
  if (!live || !reconciled) return { subs: 0, mrr_pct: 0, status: 'unknown' as const }
  const subsDelta = Math.abs(live.active_subs - reconciled.active_subs)
  const mrrPct = reconciled.mrr_cents
    ? Math.abs(live.mrr_cents - reconciled.mrr_cents) / reconciled.mrr_cents
    : 0
  let status: 'green' | 'yellow' | 'red' = 'green'
  if (subsDelta > 5 || mrrPct > 0.05) status = 'red'
  else if (subsDelta > 2 || mrrPct > 0.02) status = 'yellow'
  return { subs: live.active_subs - reconciled.active_subs, mrr_pct: mrrPct, status }
}

export async function GET() {
  // Auth: require logged-in user (only Daniel can see)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sf = createSFClient()

  // Fetch reconciled snapshot (always available)
  const { data: latestMetrics, error: metricsError } = await sf
    .from('daily_business_metrics')
    .select('date, mrr_cents, active_subs, monthly_subs, yearly_subs, cancel_at_period_end, arpu_cents, polar_reconciled_at, reconcile_delta_subs')
    .not('polar_reconciled_at', 'is', null)
    .order('polar_reconciled_at', { ascending: false })
    .limit(1)
    .single()

  if (metricsError) {
    return NextResponse.json({ error: 'Failed to fetch reconciled metrics', details: metricsError.message }, { status: 500 })
  }

  // Fetch last 30 days of MRR/subs trend
  const { data: trend } = await sf
    .from('daily_business_metrics')
    .select('date, mrr_cents, active_subs, monthly_subs, yearly_subs, daily_revenue_cents')
    .order('date', { ascending: false })
    .limit(30)

  // Fetch last reconcile log entry
  const { data: lastReconcile } = await sf
    .from('polar_reconcile_log')
    .select('run_at, polar_active, sf_completed_before, sf_completed_after, fixes, duration_ms, dry_run')
    .order('run_at', { ascending: false })
    .limit(1)
    .single()

  // Try Polar live (graceful fallback if no token)
  const polarToken = process.env.POLAR_ACCESS_TOKEN
  let live: LiveMetrics | null = null
  let liveError: string | null = null

  if (polarToken) {
    try {
      const subs = await fetchAllPolarSubs(polarToken)
      live = computeLiveMetrics(subs)
    } catch (e) {
      liveError = e instanceof Error ? e.message : 'Polar fetch failed'
    }
  } else {
    liveError = 'POLAR_ACCESS_TOKEN not configured (read-only PAT in env)'
  }

  return NextResponse.json({
    live,
    live_error: liveError,
    reconciled: latestMetrics,
    delta: deltaStatus(live, latestMetrics),
    last_reconcile: lastReconcile,
    trend: (trend ?? []).reverse(), // chronological for chart
  })
}
