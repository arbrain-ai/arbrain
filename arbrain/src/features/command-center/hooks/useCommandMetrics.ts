'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Subconjunto del ownerSnapshot de /api/analytics/ml que usa el HUD. */
export interface CommandMetrics {
  mrrCents: number
  activeSubs: number
  cancelPending: number
  newMrrCents30d: number
  funnelConversionPct30d: number
  funnelVisits30d: number
  funnelPayments30d: number
  leadsCritical: number
  leadsHigh: number
  leadsTotal: number
  active1d: number
  active7d: number
  active30d: number
  metricDate: string | null
  reconciledAt: string | null
  loadedAt: number
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * Prefetch + cache de métricas. Se dispara al montar (`/command-center`) para que el
 * status report NO espere queries en vivo (prioridad latencia). `refresh()` revalida.
 */
function useCommandMetrics() {
  const [metrics, setMetrics] = useState<CommandMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inflight = useRef(false)

  const load = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    try {
      const res = await fetch('/api/analytics/ml', { cache: 'no-store' })
      if (!res.ok) throw new Error(`analytics ${res.status}`)
      const data = await res.json()
      const snap = data?.ownerSnapshot ?? {}
      const mrrLatest = data?.mrr?.[0] ?? {}
      setMetrics({
        mrrCents: n(snap.mrr_cents ?? mrrLatest.mrr_cents),
        activeSubs: n(snap.active_subs ?? mrrLatest.active_subs),
        cancelPending: n(snap.cancel_at_period_end ?? mrrLatest.cancel_at_period_end),
        newMrrCents30d: n(snap.new_mrr_cents_30d),
        funnelConversionPct30d: n(snap.funnel_conversion_pct_30d),
        funnelVisits30d: n(snap.funnel_visits_30d),
        funnelPayments30d: n(snap.funnel_payments_30d),
        leadsCritical: n(snap.sales_leads_critical),
        leadsHigh: n(snap.sales_leads_high),
        leadsTotal: n(snap.sales_leads_total),
        active1d: n(snap.active_1d),
        active7d: n(snap.active_7d),
        active30d: n(snap.active_30d),
        metricDate: snap.metric_date ?? null,
        reconciledAt: snap.polar_reconciled_at ?? null,
        loadedAt: Date.now(),
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
    } finally {
      setLoading(false)
      inflight.current = false
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { metrics, loading, error, refresh: load }
}
