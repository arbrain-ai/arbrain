'use client'

// Historial completo de un cron job agrupado por fecha, abierto desde el rail
// "Agent Crons" del calendario (NO es una superficie nueva: vive encima del
// mismo lente). Fuente: tabla `conversations` (Supabase MC), filas con
// source='cron' y prompt=job_id. `response` guarda el output COMPLETO que el
// daemon manda en el evento `end` (ver src/app/api/openclaw/event/route.ts,
// handleCronEvent) — no es un resumen truncado, es lo que hay.
//
// Limite conocido: jobs "silenciosos" (sin output sustantivo, ej. algunos
// watchdogs) pueden no llevar `response`; en ese caso solo se ve timestamp +
// status. Ver nota al pie del panel.

import { useMemo, useState } from 'react'
import { AlertCircle, Bot, CheckCircle2, ChevronDown, Clock, Loader2, X } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCronRunsForJob, type CronJob, type CronRun } from '@/features/cron/hooks/useCronJobs'
import { MarkdownMessage } from '@/features/chat/components/MarkdownMessage'
import { cronDisplayName, humanizeCron } from './CronRail'

const HISTORY_LIMIT = 300

function dayKey(iso: string) {
  return iso.slice(0, 10) // YYYY-MM-DD, timezone del row (created_at es timestamptz)
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

function statusMeta(status: CronRun['status']) {
  if (status === 'error') return { label: 'error', className: 'text-red-400 border-red-500/30 bg-red-500/10', Icon: AlertCircle }
  if (status === 'pending') return { label: 'pending', className: 'text-amber-300 border-amber-500/30 bg-amber-500/10', Icon: Loader2 }
  return { label: 'done', className: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', Icon: CheckCircle2 }
}

export function CronHistoryPanel({
  jobId,
  job,
  color,
  onClose,
}: {
  jobId: string | null
  job: CronJob | undefined
  color: string
  onClose: () => void
}) {
  const { runs, loading } = useCronRunsForJob(jobId, HISTORY_LIMIT)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  const groups = useMemo(() => {
    const map = new Map<string, CronRun[]>()
    for (const run of runs) {
      const key = dayKey(run.created_at)
      const list = map.get(key) ?? []
      list.push(run)
      map.set(key, list)
    }
    // runs ya vienen desc por created_at desde el hook -> los grupos salen en
    // orden de aparicion, que es orden de fecha descendente.
    return [...map.entries()]
  }, [runs])

  if (!jobId) return null

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center p-4 pt-[6vh]">
      <button
        type="button"
        aria-label="Cerrar historial"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <section className="pointer-events-auto relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden titanium-panel">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <Bot size={15} className="shrink-0 text-muted" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">{cronDisplayName(jobId)}</h2>
              <p className="truncate text-[11px] text-muted">
                Historial por fecha
                {job && <> · {humanizeCron(job.schedule)} · {job.status}</>}
                {' · '}
                {runs.length} run{runs.length === 1 ? '' : 's'}
                {runs.length >= HISTORY_LIMIT && ` (limite ${HISTORY_LIMIT})`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="icon-btn size-8 shrink-0" title="Cerrar">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {loading && runs.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-card/40 p-3 text-xs text-muted">
              <Loader2 size={13} className="animate-spin" /> Cargando historial...
            </div>
          )}

          {!loading && runs.length === 0 && (
            <div className="rounded-lg border border-border-subtle bg-card/40 p-3 text-xs text-muted">
              Sin corridas registradas para este job todavia.
            </div>
          )}

          {groups.map(([day, dayRuns]) => (
            <section key={day}>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  {dayLabel(dayRuns[0].created_at)}
                </span>
                <span className="h-px flex-1 bg-border-subtle" />
                <span className="text-[10px] text-muted/70">{dayRuns.length}</span>
              </div>
              <div className="space-y-1.5">
                {dayRuns.map((run) => {
                  const expanded = expandedRunId === run.id
                  const meta = statusMeta(run.status)
                  const hasOutput = Boolean(run.response || run.error)
                  return (
                    <article key={run.id} className="rounded-lg border border-border-subtle bg-card/50 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedRunId(expanded ? null : run.id)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-card-hover"
                      >
                        <Clock size={12} className="shrink-0 text-muted" />
                        <span className="text-xs font-medium text-foreground/85">{timeLabel(run.created_at)}</span>
                        <span className={`ml-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.className}`}>
                          <meta.Icon size={10} className={run.status === 'pending' ? 'animate-spin' : ''} />
                          {meta.label}
                        </span>
                        {!hasOutput && (
                          <span className="text-[10px] text-muted/60">sin output registrado</span>
                        )}
                        <ChevronDown
                          size={13}
                          className={`ml-auto shrink-0 text-muted/60 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {expanded && (
                        <div className="border-t border-border-subtle bg-background/40 px-3 py-2.5">
                          {run.error && (
                            <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2.5">
                              <MarkdownMessage content={run.error} />
                            </div>
                          )}
                          {run.response ? (
                            <MarkdownMessage content={run.response} />
                          ) : (
                            !run.error && <p className="text-xs text-muted/70">Este run no guardo output (posible job silencioso).</p>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="border-t border-border-subtle px-4 py-2">
          <p className="text-[10px] text-muted/60">
            Fuente: conversations (source=cron) en Supabase Mission Control. Muestra el output tal
            cual quedo guardado; jobs configurados como silenciosos pueden no tener texto.
          </p>
        </div>
      </section>
    </div>
  )
}
