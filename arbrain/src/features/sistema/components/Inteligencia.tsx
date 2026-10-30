'use client'

// Casa de los SENSORES: agrupa por fecha los runs de crons que le hablan a
// Daniel (morning-briefing, morning-habits, evening-reflection,
// business-council, monthly-review), últimos ~30 días. Reemplaza el feed
// plano "AUTOMATIZACIONES" de SistemaPage — misma data (`conversations`
// source='cron'), mejor casa: agrupado por día + categoría del embudo +
// link a la superficie donde vive el efecto de ese cron.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Brain, ChevronDown, Compass, Heart, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import { MarkdownMessage } from '@/features/chat/components/MarkdownMessage'
import { type CronRun } from '../types'
import { categoriaDeCron, superficieDeCron, cronLabel, CRON_CATEGORIA_LABEL, type CronCategoria } from '@/shared/constants/cron-taxonomy'

const GOLD = '#ff9101'

const CATEGORIA_ICON: Record<CronCategoria, typeof Brain> = {
  inteligencia: Brain,
  personal: Heart,
  adquisicion: Compass,
  conversion: TrendingUp,
  retencion: ShieldCheck,
  infra: Sparkles,
}

const CATEGORIA_COLOR: Record<CronCategoria, string> = {
  inteligencia: '#a78bfa',
  personal: '#f472b6',
  adquisicion: '#38bdf8',
  conversion: GOLD,
  retencion: '#34d399',
  infra: '#94a3b8',
}

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

function dayLabel(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  if (isToday(date)) return 'Hoy'
  if (isYesterday(date)) return 'Ayer'
  return format(date, "EEEE d 'de' MMMM", { locale: es })
}

function timeLabel(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return format(date, 'h:mm a')
}

export function Inteligencia({ runs, loading }: { runs: CronRun[]; loading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, CronRun[]>()
    for (const run of runs) {
      const key = dayKey(run.created_at)
      const list = map.get(key) ?? []
      list.push(run)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [runs])

  return (
    <section className="mt-10 mb-16">
      <h2 className="mb-1 text-lg font-extrabold" style={{ color: GOLD }}>INTELIGENCIA</h2>
      <p className="mb-3 text-sm text-zinc-500">Lo que tus sensores te dicen: briefings, reflexiones y councils. Llegan aquí, no al chat.</p>

      {loading && runs.length === 0 && <div className="text-sm text-zinc-600">Cargando…</div>}
      {!loading && runs.length === 0 && <div className="text-sm text-zinc-600">Sin reportes de sensores todavía.</div>}

      <div className="space-y-5">
        {groups.map(([day, dayRuns]) => (
          <div key={day}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{dayLabel(dayRuns[0].created_at)}</span>
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] text-zinc-600">{dayRuns.length}</span>
            </div>
            <div className="space-y-2">
              {dayRuns.map((run) => (
                <SensorCard
                  key={run.id}
                  run={run}
                  expanded={expandedId === run.id}
                  onToggle={() => setExpandedId((cur) => (cur === run.id ? null : run.id))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SensorCard({ run, expanded, onToggle }: { run: CronRun; expanded: boolean; onToggle: () => void }) {
  const isError = run.status === 'error' || !!run.error
  const hasOutput = Boolean(run.response || run.error)
  const categoria = categoriaDeCron(run.jobId)
  const superficie = superficieDeCron(run.jobId)
  const Icon = CATEGORIA_ICON[categoria]
  const color = CATEGORIA_COLOR[categoria]
  const preview = (run.error ?? run.response ?? '').replace(/[#*`]/g, '').slice(0, 100)

  return (
    <div className="rounded-xl border bg-[rgba(18,19,27,0.6)]" style={{ borderColor: isError ? 'rgba(185,28,28,0.5)' : 'rgba(255,255,255,0.08)' }}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full border"
          style={{ borderColor: `${color}55`, background: `${color}1a`, color }}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold" style={{ color: isError ? '#f87171' : '#e4e4e7' }}>{cronLabel(run.jobId)}</span>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color, background: `${color}1a` }}>
              {CRON_CATEGORIA_LABEL[categoria]}
            </span>
            {isError && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300">ERROR</span>}
            {!hasOutput && <span className="text-[10px] text-zinc-600">sin output registrado</span>}
          </div>
          {!expanded && preview && <div className="mt-0.5 truncate text-xs text-zinc-500">{preview}</div>}
        </div>
        <span className="flex-none text-xs text-zinc-500">{timeLabel(run.created_at)}</span>
        <ChevronDown size={14} className={`flex-none text-zinc-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-4 py-3">
          {run.error && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2.5 text-red-300">
              <AlertCircle size={13} className="mt-0.5 flex-none" />
              <MarkdownMessage content={run.error} />
            </div>
          )}
          {run.response ? (
            <MarkdownMessage content={run.response} />
          ) : (
            !run.error && <p className="text-xs text-zinc-600">Este run no guardó output (job silencioso o sin datos).</p>
          )}
          <div className="mt-3 border-t border-white/5 pt-2">
            <Link href={superficie} className="text-xs text-zinc-500 transition-colors hover:text-zinc-200" style={{ color }}>
              abrir superficie →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
