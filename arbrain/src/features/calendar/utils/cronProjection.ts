// Proyeccion de ocurrencias futuras de un cron job dentro del rango visible
// del calendario. Misma lib y misma TZ que el daemon (arbrain/server/src/scheduler.ts:36,
// computeNextRun usa parseExpression(expr, { tz: 'America/Mexico_City' })), asi la
// semantica de la proyeccion es identica por construccion.
import { parseExpression } from 'cron-parser'
import { nombreRutina } from '@/features/rutinas/catalogo'

const DAEMON_TZ = 'America/Mexico_City'

// Frecuencia aproximada (runs/dia) para ordenar por "mas usados". Heuristica
// sobre la expresion de 5 campos, no necesita ser exacta, solo ordenar bien.
export function estimateRunsPerDay(schedule: string): number {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return 0
  const [minute, hour, dom, , dow] = parts

  const countField = (field: string, max: number) => {
    if (field === '*') return max
    const step = field.match(/^\*\/(\d+)$/)
    if (step) return Math.max(1, Math.floor(max / Number(step[1])))
    const rangeStep = field.match(/^(\d+)-(\d+)\/(\d+)$/)
    if (rangeStep) return Math.max(1, Math.floor((Number(rangeStep[2]) - Number(rangeStep[1]) + 1) / Number(rangeStep[3])))
    const range = field.match(/^(\d+)-(\d+)$/)
    if (range) return Number(range[2]) - Number(range[1]) + 1
    return field.split(',').length
  }

  let perDay = countField(minute, 60) === 60 && hour === '*'
    ? 1440
    : countField(minute, 60) * (hour === '*' ? 24 : countField(hour, 24)) / (countField(minute, 60) === 60 ? 60 : 1)
  // Caso comun: minuto fijo -> runs/dia = horas que matchean.
  if (/^\d+$/.test(minute)) perDay = hour === '*' ? 24 : countField(hour, 24)

  if (dow !== '*') perDay *= countField(dow, 7) / 7
  if (dom !== '*') perDay *= countField(dom, 31) / 30
  return perDay
}

// "custom-calendar-mirror-sync-silencioso-mqaj2zv3" -> "calendar mirror sync silencioso"
// Nombre de dueño del catálogo de Rutinas (25 sep 2026); los ids sin entrada
// quedan legibles como antes.
export function cronDisplayName(jobId: string) {
  return nombreRutina(jobId)
}

// Cap defensivo: una vista mes con un job `*/15 * * * *` generaria ~2,900
// ocurrencias y reventaria el render. 200 es mas que suficiente visualmente.
const MAX_OCCURRENCES_PER_JOB = 200

/**
 * Ocurrencias futuras (epoch ms) de `schedule` que caen dentro de [fromMs, toMs).
 * `nextRunEpochSec` (scheduled_tasks.next_run) es AUTORITATIVO para la primera:
 * el daemon ya la computo; el iterador arranca 1s despues para no duplicarla.
 * Expresion invalida => [] (no rompe el render).
 */
export function projectOccurrences(
  schedule: string,
  fromMs: number,
  toMs: number,
  nextRunEpochSec: number | null,
  tz: string = DAEMON_TZ,
): number[] {
  const occurrences: number[] = []
  const nowMs = Date.now()
  const windowStart = Math.max(fromMs, nowMs)

  const nextRunMs = nextRunEpochSec ? nextRunEpochSec * 1000 : null
  if (nextRunMs && nextRunMs >= windowStart && nextRunMs < toMs) {
    occurrences.push(nextRunMs)
  }

  try {
    const iterStart = nextRunMs && nextRunMs >= windowStart ? nextRunMs + 1000 : windowStart - 1
    const interval = parseExpression(schedule, {
      currentDate: new Date(iterStart),
      tz,
    })
    while (occurrences.length < MAX_OCCURRENCES_PER_JOB) {
      const next = interval.next().getTime()
      if (next >= toMs) break
      if (next >= windowStart) occurrences.push(next)
    }
  } catch {
    // Expresion cron invalida o iterador agotado: devolver lo acumulado.
  }

  return occurrences
}
