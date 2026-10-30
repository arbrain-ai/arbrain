'use client'

// Cron Lens: rail lateral para elegir que cron jobs ver en el calendario
// + popover de detalle (input/output) por run. Capa de SOLO LECTURA sobre
// el grid; las acciones (run/pause/resume) van al endpoint /api/cron existente.

import { useLayoutEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Loader2,
  Pause,
  Pencil,
  Play,
  X,
} from 'lucide-react'
import type { CronJob } from '@/features/cron/hooks/useCronJobs'
import type { CalendarEvent } from '../types'

export interface CronQuickViewState {
  event: CalendarEvent
  x: number
  y: number
}

import { cronDisplayName, estimateRunsPerDay } from '../utils/cronProjection'
import { CRON_CATEGORY_NAMES } from '../hooks/useCronCalendarLayer'

export { cronDisplayName }

type CronSort = 'frecuencia' | 'recientes' | 'nombre'

const GROUP_NAMES_KEY = 'mc-calendar-cron-group-names'
const SHOW_PAUSED_KEY = 'mc-calendar-cron-show-paused'
const SORT_KEY = 'mc-calendar-cron-sort'

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLS(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function sortJobs(jobs: CronJob[], sort: CronSort): CronJob[] {
  const sorted = [...jobs]
  if (sort === 'frecuencia') sorted.sort((a, b) => estimateRunsPerDay(b.schedule) - estimateRunsPerDay(a.schedule))
  else if (sort === 'recientes') sorted.sort((a, b) => (b.last_run ?? 0) - (a.last_run ?? 0))
  else sorted.sort((a, b) => cronDisplayName(a.id).localeCompare(cronDisplayName(b.id)))
  return sorted
}

// Humanizador best-effort de expresiones cron de 5 campos (TZ del daemon: Mexico).
export function humanizeCron(schedule: string) {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return schedule
  const [min, hour, dom, , dow] = parts
  const pad = (value: string) => value.padStart(2, '0')

  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && dow === '*') {
    return `Diario ${hour}:${pad(min)}`
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && /^\d$/.test(dow)) {
    const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
    return `${days[Number(dow)] ?? dow} ${hour}:${pad(min)}`
  }
  const everyN = hour.match(/^\*\/(\d+)$/)
  if (/^\d+$/.test(min) && everyN) return `Cada ${everyN[1]}h`
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom)) {
    return `Dia ${dom} del mes, ${hour}:${pad(min)}`
  }
  return schedule
}

function formatEpoch(ts: number | null) {
  if (!ts) return 'nunca'
  const diff = Date.now() - ts * 1000
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`
  return new Date(ts * 1000).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Rail lateral
// ---------------------------------------------------------------------------

export function CronRail({
  jobs,
  visibleJobIds,
  offline,
  offlineReason,
  loading,
  onToggleJob,
  onSetVisible,
  colorFor,
  onColorChange,
  onOpenHistory,
}: {
  jobs: CronJob[]
  visibleJobIds: string[]
  offline: boolean
  offlineReason: string | null
  loading: boolean
  onToggleJob: (jobId: string) => void
  onSetVisible: (ids: string[]) => void
  colorFor: (jobId: string) => string
  onColorChange: (jobId: string, color: string) => void
  onOpenHistory: (jobId: string) => void
}) {
  const [showPaused, setShowPaused] = useState(() => readLS(SHOW_PAUSED_KEY, false))
  const [sort, setSort] = useState<CronSort>(() => readLS<CronSort>(SORT_KEY, 'frecuencia'))
  const [groupNames, setGroupNames] = useState<Record<string, string>>(() => readLS(GROUP_NAMES_KEY, {}))
  // Rename INLINE: window.prompt no existe en el webview de la app desktop (Tauri).
  const [renamingColor, setRenamingColor] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const groupNameFor = (color: string) => groupNames[color] ?? CRON_CATEGORY_NAMES[color] ?? 'Personalizado'

  const startRename = (color: string) => {
    setRenamingColor(color)
    setRenameDraft(groupNameFor(color))
  }

  const commitRename = () => {
    if (renamingColor && renameDraft.trim()) {
      setGroupNames((prev) => {
        const updated = { ...prev, [renamingColor]: renameDraft.trim() }
        writeLS(GROUP_NAMES_KEY, updated)
        return updated
      })
    }
    setRenamingColor(null)
  }

  const pausedCount = jobs.filter((job) => job.status === 'paused').length
  const shownJobs = showPaused ? jobs : jobs.filter((job) => job.status === 'active')

  // El COLOR es la categoria: agrupar jobs por su color actual. Repintar un job
  // con el picker lo mueve de grupo.
  const groups = new Map<string, CronJob[]>()
  for (const job of shownJobs) {
    const color = colorFor(job.id)
    const list = groups.get(color) ?? []
    list.push(job)
    groups.set(color, list)
  }
  const sortedGroups = [...groups.entries()]
    .map(([color, groupJobs]) => [color, sortJobs(groupJobs, sort)] as const)
    .sort((a, b) => b[1].length - a[1].length)
  const visibleSet = new Set(visibleJobIds)

  return (
    <aside className="hidden xl:flex w-[22rem] flex-col border-l border-border-subtle bg-surface/50 min-h-0">
      <div className="px-3 py-3 border-b border-border-subtle">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Bot size={14} className="text-muted" />
            <span className="truncate text-xs font-semibold uppercase tracking-widest text-muted">Agent Crons</span>
          </div>
          <span className="rounded-full border border-border-subtle bg-card/60 px-2 py-0.5 text-[10px] font-semibold text-muted">
            {visibleJobIds.length} visibles
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSetVisible(shownJobs.map((job) => job.id))}
            className="btn-secondary flex-1 px-2 py-1 text-[11px]"
          >
            Mostrar todos
          </button>
          <button
            type="button"
            onClick={() => onSetVisible([])}
            className="btn-secondary flex-1 px-2 py-1 text-[11px]"
          >
            Ninguno
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <select
            value={sort}
            onChange={(event) => {
              const value = event.target.value as CronSort
              setSort(value)
              writeLS(SORT_KEY, value)
            }}
            className="flex-1 rounded-lg border border-border-subtle bg-card/60 px-2 py-1 text-[11px] text-foreground outline-none"
            aria-label="Ordenar crons"
          >
            <option value="frecuencia">Mas frecuentes</option>
            <option value="recientes">Corrieron reciente</option>
            <option value="nombre">A - Z</option>
          </select>
          {pausedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setShowPaused((prev) => {
                  writeLS(SHOW_PAUSED_KEY, !prev)
                  return !prev
                })
              }}
              className={`btn-secondary px-2 py-1 text-[11px] ${showPaused ? 'text-amber-300' : ''}`}
            >
              {showPaused ? `Ocultar pausados` : `Pausados (${pausedCount})`}
            </button>
          )}
        </div>
        {offline && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
            <AlertCircle size={12} className="shrink-0" />
            Agente offline ({offlineReason ?? 'sin conexion'}). Historial visible; acciones y proximas corridas no disponibles.
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading && jobs.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-card/40 p-3 text-xs text-muted">
            <Loader2 size={13} className="animate-spin" /> Cargando crons...
          </div>
        )}

        {sortedGroups.map(([color, groupJobs]) => {
          const groupIds = groupJobs.map((job) => job.id)
          const allOn = groupIds.every((id) => visibleSet.has(id))
          return (
            <section key={color}>
              <div className="mb-1.5 flex w-full items-center gap-2 rounded-md px-1 py-1 hover:bg-card/40">
                {renamingColor === color ? (
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename()
                        if (event.key === 'Escape') setRenamingColor(null)
                      }}
                      className="w-full rounded-md border border-border-accent bg-card/80 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-foreground outline-none"
                      aria-label="Nombre del grupo"
                    />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      // Toggle grupal: si todos estan prendidos, apaga el grupo; si no, lo prende completo.
                      const others = visibleJobIds.filter((id) => !groupIds.includes(id))
                      onSetVisible(allOn ? others : [...others, ...groupIds])
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    title={allOn ? 'Apagar todo el grupo' : 'Prender todo el grupo'}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted">
                      {groupNameFor(color)} · {groupJobs.length}
                    </span>
                    <span className={`ml-auto shrink-0 text-[10px] font-semibold ${allOn ? 'text-emerald-400' : 'text-muted/60'}`}>
                      {allOn ? 'todos on' : 'prender grupo'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (renamingColor === color ? commitRename() : startRename(color))}
                  className="icon-btn size-6 shrink-0 text-muted/50 hover:text-foreground"
                  title="Renombrar grupo"
                >
                  <Pencil size={11} />
                </button>
              </div>
              <div className="space-y-2">
                {groupJobs.map((job) => (
                  <CronRow
                    key={job.id}
                    job={job}
                    color={color}
                    visible={visibleSet.has(job.id)}
                    onToggle={() => onToggleJob(job.id)}
                    onColorChange={(value) => onColorChange(job.id, value)}
                    onOpenHistory={() => onOpenHistory(job.id)}
                  />
                ))}
              </div>
            </section>
          )
        })}

        {!loading && jobs.length === 0 && (
          <div className="rounded-lg border border-border-subtle bg-card/40 p-3 text-xs text-muted">
            No hay cron jobs (agente offline y sin cache local).
          </div>
        )}
      </div>
    </aside>
  )
}

function CronRow({
  job,
  color,
  visible,
  onToggle,
  onColorChange,
  onOpenHistory,
}: {
  job: CronJob
  color: string
  visible: boolean
  onToggle: () => void
  onColorChange: (color: string) => void
  onOpenHistory: () => void
}) {
  return (
    <article
      className={`card-interactive group cursor-pointer p-3 ${job.status === 'paused' ? 'opacity-60' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 flex h-4.5 w-8 shrink-0 items-center rounded-full border px-0.5 transition-colors"
          style={{
            borderColor: visible ? color : 'var(--border-subtle)',
            backgroundColor: visible ? `${color}55` : undefined,
          }}
          aria-hidden
        >
          <span
            className={`size-3.5 rounded-full transition-transform ${visible ? 'translate-x-3' : 'translate-x-0 bg-muted/50'}`}
            style={visible ? { backgroundColor: color } : undefined}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold leading-snug ${visible ? 'text-foreground' : 'text-foreground/80'} group-hover:text-primary`}>
            {cronDisplayName(job.id)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
            <span className="rounded-md border border-border-subtle bg-card/60 px-1.5 py-0.5">
              <Clock size={9} className="mr-1 inline -translate-y-px" />
              {humanizeCron(job.schedule)}
            </span>
            <span className="rounded-md border border-border-subtle bg-card/60 px-1.5 py-0.5">
              ultimo: {formatEpoch(job.last_run)}
            </span>
            {job.status === 'paused' && (
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                pausado
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpenHistory()
          }}
          className="icon-btn mt-0.5 size-6 shrink-0 text-muted/60 hover:text-foreground"
          title="Ver historial por fecha"
          aria-label={`Historial de ${cronDisplayName(job.id)}`}
        >
          <History size={13} />
        </button>
        <label
          className="relative mt-0.5 size-5 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border-subtle"
          style={{ backgroundColor: color }}
          title="Cambiar color (categoria)"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="color"
            value={color}
            onChange={(event) => onColorChange(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label={`Color de ${cronDisplayName(job.id)}`}
          />
        </label>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Popover de detalle (input/output de un run, o proxima ejecucion)
// ---------------------------------------------------------------------------

export function CronQuickView({
  view,
  job,
  offline,
  onClose,
  onAction,
  onOpenHistory,
}: {
  view: CronQuickViewState | null
  job: CronJob | undefined
  offline: boolean
  onClose: () => void
  onAction: (jobId: string, action: 'run' | 'pause' | 'resume') => Promise<void>
  onOpenHistory: (jobId: string) => void
}) {
  if (!view) return null
  return (
    <CronQuickViewCard
      key={view.event.id}
      view={view}
      job={job}
      offline={offline}
      onClose={onClose}
      onAction={onAction}
      onOpenHistory={onOpenHistory}
    />
  )
}

function CronQuickViewCard({
  view,
  job,
  offline,
  onClose,
  onAction,
  onOpenHistory,
}: {
  view: CronQuickViewState
  job: CronJob | undefined
  offline: boolean
  onClose: () => void
  onAction: (jobId: string, action: 'run' | 'pause' | 'resume') => Promise<void>
  onOpenHistory: (jobId: string) => void
}) {
  const { event } = view
  const cardRef = useRef<HTMLElement | null>(null)
  const [pos, setPos] = useState(() => ({ left: view.x + 12, top: view.y + 12, ready: false }))
  const [acting, setActing] = useState<string | null>(null)

  // Mismo patron de posicion medida que EventQuickViewCard: nunca se sale del viewport.
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el || typeof window === 'undefined') return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setPos({
        left: Math.max(12, Math.min(view.x + 12, window.innerWidth - rect.width - 12)),
        top: Math.max(12, Math.min(view.y + 12, window.innerHeight - rect.height - 12)),
        ready: true,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [view])

  const isFuture = event.kind === 'cron_scheduled'
  const status = event.cronRunStatus
  const jobId = event.cronJobId ?? ''
  const when = new Date(isFuture ? event.start : event.end)

  const act = async (action: 'run' | 'pause' | 'resume') => {
    setActing(action)
    try {
      await onAction(jobId, action)
    } finally {
      setActing(null)
    }
  }

  return (
    <>
      <button type="button" aria-label="Close cron preview" className="fixed inset-0 z-40 cursor-default bg-transparent" onClick={onClose} />
      <section
        ref={cardRef}
        className="fixed z-50 flex max-h-[calc(100vh-24px)] w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-card text-foreground shadow-2xl"
        style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Bot size={14} className="shrink-0 text-muted" />
            <span className="truncate text-xs font-semibold uppercase tracking-widest text-muted">
              {isFuture ? 'Proxima ejecucion' : 'Run del agente'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {jobId && (
              <button
                onClick={() => onOpenHistory(jobId)}
                className="icon-btn size-8"
                title="Ver historial por fecha"
              >
                <History size={15} />
              </button>
            )}
            <a href="/rutinas" className="icon-btn size-8" title="Ver en Rutinas">
              <ExternalLink size={15} />
            </a>
            <button onClick={onClose} className="icon-btn size-8" title="Close">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-1.5 size-3 shrink-0 rounded-sm" style={{ backgroundColor: event.color ?? 'var(--l-verde-4, #10b981)' }} />
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-lg font-semibold leading-tight">{cronDisplayName(jobId)}</h2>
              <p className="mt-1 text-sm text-foreground/75">
                {when.toLocaleString('es-MX', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {!isFuture && status && (
                  <span className={`ml-2 inline-flex items-center gap-1 text-xs font-semibold ${
                    status === 'error' ? 'text-red-400' : status === 'pending' ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {status === 'error' ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                    {status}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Input (prompt del job)</p>
              <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border-subtle bg-background/60 p-2.5 font-mono text-[11px] leading-relaxed text-foreground/80">
                {job?.prompt ?? '(prompt no disponible: agente offline y job fuera de cache)'}
              </pre>
            </div>

            {!isFuture && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Output {status === 'error' ? '(error)' : ''}
                </p>
                <pre className={`mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border p-2.5 font-mono text-[11px] leading-relaxed ${
                  status === 'error'
                    ? 'border-red-500/30 bg-red-500/5 text-red-200'
                    : 'border-border-subtle bg-background/60 text-foreground/80'
                }`}>
                  {event.cronOutput ?? '(sin output registrado)'}
                </pre>
              </div>
            )}

            {job && (
              <p className="text-[11px] text-muted">
                Schedule: <span className="font-mono">{job.schedule}</span> ({humanizeCron(job.schedule)}) · {job.status}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-2.5">
          <button
            type="button"
            onClick={() => act('run')}
            disabled={offline || !jobId || acting !== null}
            className="btn-secondary px-2.5 py-1.5 text-xs disabled:opacity-40"
            title={offline ? 'Agente offline' : 'Ejecutar ahora'}
          >
            {acting === 'run' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Run now
          </button>
          {job?.status === 'active' ? (
            <button
              type="button"
              onClick={() => act('pause')}
              disabled={offline || acting !== null}
              className="btn-secondary px-2.5 py-1.5 text-xs disabled:opacity-40"
            >
              {acting === 'pause' ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />}
              Pause
            </button>
          ) : job ? (
            <button
              type="button"
              onClick={() => act('resume')}
              disabled={offline || acting !== null}
              className="btn-secondary px-2.5 py-1.5 text-xs disabled:opacity-40"
            >
              {acting === 'resume' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Resume
            </button>
          ) : null}
        </div>
      </section>
    </>
  )
}
