'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { cacheSnapshot, getCachedSnapshot } from '@/lib/local-first'

/**
 * Compact health indicator: Polar live vs reconciled snapshot.
 * Lives in the page header, not duplicating any KPI.
 *
 * Status:
 *   green   → live and snapshot match within 2%
 *   yellow  → drift between 2% and 5% (or live unavailable)
 *   red     → drift > 5%
 */

interface PolarResponse {
  live: { active_subs: number } | null
  live_error: string | null
  reconciled: { polar_reconciled_at: string } | null
  delta: { subs: number; mrr_pct: number; status: 'green' | 'yellow' | 'red' | 'unknown' }
  last_reconcile: { run_at: string; fixes: { revokes?: number } } | null
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function PolarHealthChip() {
  const [data, setData] = useState<PolarResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    // Stale-while-revalidate: pinta el snapshot cacheado al instante, refresca en background.
    getCachedSnapshot<PolarResponse>('business:polar')
      .then((cached) => { if (active && cached) { setData(cached); setLoading(false) } })
      .catch(() => {})
      .finally(() => {
        if (!active) return
        fetch('/api/analytics/polar', { cache: 'no-store' })
          .then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            const json = await r.json() as PolarResponse
            cacheSnapshot('business', 'business:polar', json).catch(() => {})
            return json
          })
          .then((json) => { if (active) setData(json) })
          .catch(async () => {
            const cached = await getCachedSnapshot<PolarResponse>('business:polar').catch(() => null)
            if (active && cached) setData(cached)
          })
          .finally(() => { if (active) setLoading(false) })
      })
    return () => { active = false }
  }, [])

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border border-border text-[10px] text-muted">
        <Loader2 size={10} className="animate-spin" />
      </div>
    )
  }

  if (!data) return null

  const status = data.delta.status
  const colors = {
    green: 'bg-emerald-500/[0.10] text-emerald-300 border-emerald-500/25',
    yellow: 'bg-amber-500/[0.10] text-amber-300 border-amber-500/25',
    red: 'bg-rose-500/[0.10] text-rose-300 border-rose-500/25',
    unknown: 'bg-card-hover text-muted border-border',
  }
  const Icon = status === 'green' ? CheckCircle2 : AlertTriangle

  const synced = `synced ${timeAgo(data.reconciled?.polar_reconciled_at)} ago`
  let badge: string
  let detail: string
  if (data.live_error) {
    badge = 'snapshot'
    detail = synced
  } else if (status === 'green') {
    badge = 'OK'
    detail = synced
  } else {
    badge = 'drift'
    const dir = data.delta.subs > 0 ? '+' : ''
    detail = `${dir}${data.delta.subs} subs · ${(data.delta.mrr_pct * 100).toFixed(1)}% MRR`
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] ${colors[status]}`}
      title={data.last_reconcile ? `Last reconcile: ${timeAgo(data.last_reconcile.run_at)} ago · ${data.last_reconcile.fixes?.revokes ?? 0} revokes` : 'No reconcile log yet'}
    >
      <Icon size={11} />
      <span className="font-medium">Polar {badge}</span>
      <span className="text-muted/80">·</span>
      <span>{detail}</span>
    </div>
  )
}
