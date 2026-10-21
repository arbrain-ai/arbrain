'use client'

import type { CommandMetrics } from '../hooks/useCommandMetrics'
import { HudPanel } from './hud'

export type PanelKey = 'overview' | 'revenue' | 'funnel' | 'community' | 'content' | 'leads'

// Alias que el orquestador puede emitir vía [panel:xxx]
const ALIASES: Record<string, PanelKey> = {
  overview: 'overview', resumen: 'overview',
  revenue: 'revenue', mrr: 'revenue', ventas: 'revenue', ingresos: 'revenue',
  funnel: 'funnel', embudo: 'funnel', conversion: 'funnel',
  community: 'community', comunidad: 'community', support: 'community', soporte: 'community',
  content: 'content', contenido: 'content', youtube: 'content',
  leads: 'leads',
}

export function normalizePanel(raw: string): PanelKey {
  return ALIASES[raw.toLowerCase()] ?? 'overview'
}

function fmtUsd(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US')
}

const TITLES: Record<PanelKey, string> = {
  overview: 'Resumen del negocio',
  revenue: 'Revenue & Suscripciones',
  funnel: 'Embudo de conversión',
  community: 'Comunidad & Soporte',
  content: 'Contenido & YouTube',
  leads: 'Leads calientes',
}

export function SecondaryPanel({ panel, metrics }: { panel: PanelKey; metrics: CommandMetrics | null }) {
  return (
    <HudPanel className="p-5 h-full overflow-hidden flex flex-col" delay={120} pulseKey={panel}>
      {/* El título cruza con el contenido al cambiar de panel */}
      <div key={`h-${panel}`} className="cc-swap flex items-center justify-between mb-4">
        <span className="cc-label" style={{ color: 'rgba(var(--cc-rgb), 0.95)' }}>{TITLES[panel]}</span>
        <span className="h-1.5 w-1.5 rounded-full bg-[#56bdf8] animate-pulse" aria-hidden />
      </div>
      <div key={panel} className="cc-swap flex-1 grid grid-cols-2 gap-3 content-start">
        {renderCells(panel, metrics)}
      </div>
    </HudPanel>
  )
}

function renderCells(panel: PanelKey, m: CommandMetrics | null) {
  if (!m) return <>
    <CellSkeleton /><CellSkeleton /><CellSkeleton /><CellSkeleton />
  </>
  switch (panel) {
    case 'revenue':
      return <>
        <Cell label="MRR" value={fmtUsd(m.mrrCents)} accent="#ff9101" big />
        <Cell label="Subs activas" value={`${m.activeSubs}`} accent="#22c55e" big />
        <Cell label="Ventas 30d" value={fmtUsd(m.newMrrCents30d)} accent="#56bdf8" />
        <Cell label="Cancel pending" value={`${m.cancelPending}`} accent={m.cancelPending > 0 ? '#ef4444' : '#22c55e'} />
      </>
    case 'funnel':
      return <>
        <Cell label="Conversión 30d" value={`${m.funnelConversionPct30d.toFixed(1)}%`} accent="#ff9101" big />
        <Cell label="Visitas 30d" value={m.funnelVisits30d.toLocaleString()} accent="#56bdf8" big />
        <Cell label="Pagos 30d" value={`${m.funnelPayments30d}`} accent="#22c55e" />
        <Cell label="Visitas → pago" value={`${m.funnelVisits30d} → ${m.funnelPayments30d}`} />
      </>
    case 'community':
      return <>
        <Cell label="Activos hoy" value={`${m.active1d}`} accent="#22c55e" big />
        <Cell label="Activos 7d" value={`${m.active7d}`} accent="#56bdf8" big />
        <Cell label="Activos 30d" value={`${m.active30d}`} accent="#8b5cf6" />
        <Cell label="Subs activas" value={`${m.activeSubs}`} />
      </>
    case 'leads':
      return <>
        <Cell label="Critical" value={`${m.leadsCritical}`} accent="#ef4444" big />
        <Cell label="High" value={`${m.leadsHigh}`} accent="#ff9101" big />
        <Cell label="Total" value={`${m.leadsTotal}`} accent="#56bdf8" />
        <Cell label="Calientes" value={`${m.leadsCritical + m.leadsHigh}`} accent="#22c55e" />
      </>
    case 'content':
      return <>
        <Cell label="Activos 30d" value={`${m.active30d}`} accent="#ff9101" big />
        <Cell label="Conversión" value={`${m.funnelConversionPct30d.toFixed(1)}%`} accent="#56bdf8" big />
        <Cell label="Pagos 30d" value={`${m.funnelPayments30d}`} accent="#22c55e" />
        <Cell label="Visitas 30d" value={m.funnelVisits30d.toLocaleString()} />
      </>
    default:
      return <>
        <Cell label="MRR" value={fmtUsd(m.mrrCents)} accent="#ff9101" big />
        <Cell label="Subs" value={`${m.activeSubs}`} accent="#22c55e" big />
        <Cell label="Conversión" value={`${m.funnelConversionPct30d.toFixed(1)}%`} accent="#56bdf8" />
        <Cell label="Leads calientes" value={`${m.leadsCritical + m.leadsHigh}`} accent="#8b5cf6" />
      </>
  }
}

function Cell({ label, value, accent = '#ffffff', big }: { label: string; value: string; accent?: string; big?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className={`font-bold tabular-nums ${big ? 'text-2xl' : 'text-lg'}`} style={{ color: accent, textShadow: `0 0 18px ${accent}33` }}>{value}</div>
      <div className="text-[9px] font-mono uppercase tracking-wider text-white/40 mt-1">{label}</div>
    </div>
  )
}

function CellSkeleton() {
  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-3">
      <div className="h-7 w-20 rounded-md bg-white/[0.07] animate-pulse" />
      <div className="h-2.5 w-14 rounded bg-white/[0.05] animate-pulse mt-2" />
    </div>
  )
}
