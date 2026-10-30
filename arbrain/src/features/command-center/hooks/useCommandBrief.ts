'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommandCenterState } from '../types'
import type { CommandMetrics } from './useCommandMetrics'

/**
 * Fuente de datos unificada del Command Center: consume el "cerebro" /api/command-center/brief
 * (CommandCenterState: MRR real con fallback, action queue, brief, system health) y lo adapta a
 * la forma `CommandMetrics` que ya usan los paneles del HUD. Expone también el `state` completo
 * (acciones + brief) para el contexto de voz y la telemetría.
 *
 * Reemplaza al passthrough delgado /api/analytics/ml (que devolvía MRR $0 cuando el snapshot del
 * día aún no reconcilia). El brief hace el fallback al último MRR bueno.
 */

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function toMetrics(state: CommandCenterState): CommandMetrics {
  const o = state.owner
  const conv = num(o.funnelConversion30d)
  const payments = num(o.purchases30d)
  // El brief no trae visitas directas; se derivan de pagos / conversión (consistente con el funnel).
  const visits = conv > 0 ? Math.round(payments / (conv / 100)) : 0
  return {
    mrrCents: num(o.mrrCents),
    activeSubs: num(o.activeSubs),
    cancelPending: num(o.cancelAtPeriodEnd),
    newMrrCents30d: num(o.bookedCents30d), // se muestra como "Ventas 30d"
    funnelConversionPct30d: conv,
    funnelVisits30d: visits,
    funnelPayments30d: payments,
    leadsCritical: num(o.salesLeadsCritical),
    leadsHigh: num(o.salesLeadsHigh),
    leadsTotal: num(o.salesLeadsTotal),
    active1d: num(o.active1d),
    active7d: num(o.active7d),
    active30d: num(o.active30d),
    metricDate: state.dataHealth.billingSnapshotDate,
    reconciledAt: state.dataHealth.polarReconciledAt,
    loadedAt: Date.now(),
  }
}

export function useCommandBrief() {
  const [state, setState] = useState<CommandCenterState | null>(null)
  const [metrics, setMetrics] = useState<CommandMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inflight = useRef(false)

  const load = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    try {
      const res = await fetch('/api/command-center/brief', { cache: 'no-store' })
      if (!res.ok) throw new Error(`brief ${res.status}`)
      const data = await res.json()
      const s: CommandCenterState = data?.state ?? data
      if (!s?.owner) throw new Error('respuesta sin owner')
      setState(s)
      setMetrics(toMetrics(s))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
    } finally {
      setLoading(false)
      inflight.current = false
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { state, metrics, loading, error, refresh: load }
}
