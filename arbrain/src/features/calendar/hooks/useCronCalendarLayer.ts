'use client'

// Capa CRON del calendario (Cron Lens): convierte jobs del scheduler de ClaudeClaw
// + historial de runs (Supabase conversations, source='cron') en CalendarEvents
// sinteticos de SOLO LECTURA. Nunca toca Google ni los caches del pipeline normal:
// se compone en el render del CalendarCommandCenter, fuera de fetchEvents.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCronJobs, useCronRunsRange, type CronJob, type CronRun } from '@/features/cron/hooks/useCronJobs'
import { cronDisplayName, projectOccurrences } from '../utils/cronProjection'
import type { CalendarEvent } from '../types'

const VISIBLE_CRONS_KEY = 'mc-calendar-visible-crons'
const CRON_COLORS_KEY = 'mc-calendar-cron-colors'
// Sin duracion real por run (started_at == ended_at en conversations): bloque
// visual fijo de 30 min. Pasados TERMINAN en created_at; futuros EMPIEZAN en la ocurrencia.
const RUN_BLOCK_MS = 30 * 60 * 1000

// Paleta de categorias default (heuristica por keywords del job id). Daniel puede
// repintar cualquier job con el picker: el color ES la categoria en el rail.
const CATEGORY_PALETTE: Array<{ pattern: RegExp; color: string; name: string }> = [
  { pattern: /youtube/, color: '#ef4444', name: 'YouTube' },
  { pattern: /intel/, color: '#f97316', name: 'Intel' },
  { pattern: /autoresearch|video-|churn|funnel|ml/, color: '#8b5cf6', name: 'ML & Research' },
  { pattern: /polar|metrics|business|monthly|income/, color: '#ffac3d', name: 'Negocio' },
  { pattern: /calendar|gmail|google|habit/, color: '#60a5fa', name: 'Workspace' },
  { pattern: /system|workspace|state|knowledge|backup/, color: '#64748b', name: 'Sistema' },
]
const DEFAULT_CRON_COLOR = '#10b981' // emerald

// Identidad ESTABLE con el lente cerrado: si el memo retorna [] literal, cada
// navegacion de rango produce un array nuevo -> fcEvents cambia de identidad ->
// FullCalendar resetea su event source y re-renderiza TODOS los eventos (parpadeo).
const NO_CRON_EVENTS: CalendarEvent[] = []

// Nombre default por color de grupo (el rail permite renombrar; override en localStorage).
export const CRON_CATEGORY_NAMES: Record<string, string> = {
  ...Object.fromEntries(CATEGORY_PALETTE.map(({ color, name }) => [color, name])),
  [DEFAULT_CRON_COLOR]: 'Agentes',
}

function defaultCronColor(jobId: string) {
  for (const { pattern, color } of CATEGORY_PALETTE) {
    if (pattern.test(jobId)) return color
  }
  return DEFAULT_CRON_COLOR
}

function foregroundFor(backgroundColor: string) {
  const hex = backgroundColor.replace('#', '')
  if (hex.length !== 6) return '#ffffff'
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000
  return luminance > 160 ? '#0f172a' : '#ffffff'
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function runToEvent(run: CronRun, color: string): CalendarEvent {
  const endMs = new Date(run.created_at).getTime()
  const status = run.status ?? 'done'
  // El bloque conserva el color de la CATEGORIA; el ESTADO (ok/fallo) lo lleva un
  // punto verde/rojo a la izquierda (CSS). Asi un fallo se ve aunque la categoria
  // ya sea roja (ej. YouTube), y un exito no se confunde con error.
  const background = color
  return {
    id: `cron-run-${run.id}`,
    title: `${status === 'error' ? '⚠ ' : ''}${cronDisplayName(run.job_id)}`,
    start: new Date(endMs - RUN_BLOCK_MS).toISOString(),
    end: new Date(endMs).toISOString(),
    allDay: false,
    editable: false,
    kind: 'cron_run',
    color: background,
    textColor: foregroundFor(background),
    cronJobId: run.job_id,
    cronRunId: run.run_id,
    cronRunStatus: status,
    cronOutput: run.error ?? run.response,
  }
}

function occurrenceToEvent(job: CronJob, occurrenceMs: number, color: string): CalendarEvent {
  return {
    id: `cron-next-${job.id}-${occurrenceMs}`,
    title: cronDisplayName(job.id),
    start: new Date(occurrenceMs).toISOString(),
    end: new Date(occurrenceMs + RUN_BLOCK_MS).toISOString(),
    allDay: false,
    editable: false,
    kind: 'cron_scheduled',
    color,
    textColor: foregroundFor(color),
    cronJobId: job.id,
    cronRunStatus: null,
    cronOutput: null,
  }
}

// Banderas de migracion del scheduler (v3-migrated, etc): filas con prompt vacio
// que NO son jobs reales. NUNCA mostrarlas ni (peor) borrarlas — sin la bandera,
// el daemon re-ejecuta la migracion historica al boot. Leccion del 12 jun 2026.
function isMigrationMarker(job: CronJob) {
  return /^v\d+-migrated$/.test(job.id) || !job.prompt?.trim()
}

export function useCronCalendarLayer(range: { from: string; to: string }, enabled: boolean) {
  const cron = useCronJobs()
  const realJobs = useMemo(() => cron.jobs.filter((job) => !isMigrationMarker(job)), [cron.jobs])
  const [visibleJobIds, setVisibleJobIds] = useState<string[]>(() => readJson<string[]>(VISIBLE_CRONS_KEY, []))
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>(
    () => readJson<Record<string, string>>(CRON_COLORS_KEY, {})
  )

  const activeJobIds = enabled ? visibleJobIds : []
  const { runs, refetch: refetchRuns } = useCronRunsRange(range.from, range.to, activeJobIds)

  const colorFor = useCallback(
    (jobId: string) => colorOverrides[jobId] ?? defaultCronColor(jobId),
    [colorOverrides]
  )

  const setJobColor = useCallback((jobId: string, color: string) => {
    const hex = color.trim().toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(hex)) return
    setColorOverrides((prev) => {
      const next = { ...prev, [jobId]: hex }
      writeJson(CRON_COLORS_KEY, next)
      return next
    })
  }, [])

  const toggleJob = useCallback((jobId: string) => {
    setVisibleJobIds((prev) => {
      const next = prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
      writeJson(VISIBLE_CRONS_KEY, next)
      return next
    })
  }, [])

  // Reemplaza la seleccion completa: botones Todos/Ninguno y toggle por grupo de color.
  const setVisibleJobs = useCallback((ids: string[]) => {
    const next = [...new Set(ids)]
    setVisibleJobIds(next)
    writeJson(VISIBLE_CRONS_KEY, next)
  }, [])

  // Refresca jobs al abrir el lente (next_run puede haber avanzado).
  useEffect(() => {
    if (enabled) cron.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const cronEvents = useMemo<CalendarEvent[]>(() => {
    if (!enabled || visibleJobIds.length === 0) return NO_CRON_EVENTS
    const visible = new Set(visibleJobIds)
    const fromMs = new Date(range.from).getTime()
    const toMs = new Date(range.to).getTime()

    const past = runs.filter((run) => visible.has(run.job_id)).map((run) => runToEvent(run, colorFor(run.job_id)))
    const future = realJobs
      .filter((job) => visible.has(job.id) && job.status === 'active')
      .flatMap((job) =>
        projectOccurrences(job.schedule, fromMs, toMs, job.next_run, cron.tz ?? undefined).map((ms) => occurrenceToEvent(job, ms, colorFor(job.id)))
      )

    return [...past, ...future]
  }, [enabled, visibleJobIds, runs, realJobs, range.from, range.to, colorFor, cron.tz])

  const runAction = useCallback(async (jobId: string, action: 'run' | 'pause' | 'resume') => {
    await cron.runAction(jobId, action)
    if (action === 'run') setTimeout(() => { refetchRuns() }, 1500)
  }, [cron, refetchRuns])

  return {
    jobs: realJobs,
    offline: cron.offline,
    offlineReason: cron.offlineReason,
    loading: cron.loading,
    visibleJobIds,
    toggleJob,
    setVisibleJobs,
    colorFor,
    setJobColor,
    cronEvents,
    runAction,
    refetchRuns,
  }
}
