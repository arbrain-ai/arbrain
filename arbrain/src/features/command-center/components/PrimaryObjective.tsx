'use client'

import type { CommandMetrics } from '../hooks/useCommandMetrics'
import { AnimatedNumber, HudPanel, PanelHeader } from './hud'

interface Props {
  metrics: CommandMetrics | null
  /** Objetivo de ingreso recurrente mensual en USD (North Star). */
  targetUsd?: number
}

const GOLD = '255, 145, 1'

function fmtUsd(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US')
}

export function PrimaryObjective({ metrics, targetUsd = 100_000 }: Props) {
  const mrrUsd = metrics ? metrics.mrrCents / 100 : 0
  const pct = Math.min(100, (mrrUsd / targetUsd) * 100)

  return (
    <HudPanel accentRgb={GOLD} accent className="cc-sweep px-5 py-4">
      <PanelHeader label="Primary Objective" meta="MRR · North Star" accentRgb={GOLD} />
      <div className="flex items-end gap-3">
        {metrics ? (
          <AnimatedNumber
            value={metrics.mrrCents}
            format={fmtUsd}
            className="text-3xl font-bold text-white tracking-tight"
          />
        ) : (
          <span className="text-3xl font-bold text-white/30 tracking-tight animate-pulse">$ —</span>
        )}
        <span className="text-sm font-mono text-white/40 mb-1">/ ${targetUsd.toLocaleString('en-US')}</span>
      </div>
      {/* Barra de progreso con glow vivo */}
      <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label="Progreso hacia North Star MRR" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#ff9101] to-[#ffac3d] transition-[width] duration-1000 ease-out shadow-[0_0_14px_rgba(255,145,1,0.65)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-mono text-white/40 tabular-nums">
        <span>{pct.toFixed(1)}%</span>
        <span>{metrics ? `${metrics.activeSubs} subs activas` : ''}</span>
      </div>

      {/* Contadores secundarios */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Conversión" accent="#56bdf8" value={metrics ? metrics.funnelConversionPct30d : null} format={(v) => `${v.toFixed(1)}%`} />
        <Stat label="Ventas 30d" accent="#22c55e" value={metrics ? metrics.newMrrCents30d : null} format={fmtUsd} />
        <Stat label="Leads calientes" accent="#8b5cf6" value={metrics ? metrics.leadsCritical + metrics.leadsHigh : null} format={(v) => `${Math.round(v)}`} />
      </div>
    </HudPanel>
  )
}

function Stat({ label, value, accent, format }: { label: string; value: number | null; accent: string; format: (v: number) => string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      {value != null ? (
        <AnimatedNumber value={value} format={format} className="text-sm font-bold block" style={{ color: accent }} />
      ) : (
        <span className="text-sm font-bold block text-white/25 animate-pulse">—</span>
      )}
      <div className="text-[9px] font-mono uppercase tracking-wider text-white/40 mt-0.5">{label}</div>
    </div>
  )
}
