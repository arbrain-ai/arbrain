import { addDays, eachDayOfInterval, format, getDay, parseISO, startOfDay } from 'date-fns'
import type { PlanEvent } from './types'

/** Vista Año: doce meses compactos. Los datos se leen por ventanas porque el proveedor limita cada lectura a 65 días. */
export interface YearDay { key: string; day: number; inMonth: boolean }
export interface YearMonth { month: number; days: YearDay[] }

const key = (d: Date) => format(d, 'yyyy-MM-dd')

/** Semanas completas (lunes a domingo) de un mes. */
export function buildMonth(year: number, month: number): YearMonth {
  const first = new Date(year, month, 1), last = new Date(year, month + 1, 0)
  const lead = (getDay(first) + 6) % 7
  const trail = (7 - ((getDay(last) + 6) % 7) - 1) % 7
  const days = eachDayOfInterval({ start: addDays(first, -lead), end: addDays(last, trail) })
    .map(d => ({ key: key(d), day: d.getDate(), inMonth: d.getMonth() === month }))
  return { month, days }
}
export const buildYear = (year: number) => Array.from({ length: 12 }, (_, m) => buildMonth(year, m))

/** Ventanas de lectura que cubren el año con ≤ 60 días cada una (seis). */
export function yearWindows(year: number) {
  const out: { from: string; to: string }[] = []
  for (let m = 0; m < 12; m += 2) out.push({ from: new Date(year, m, 1).toISOString(), to: new Date(year, m + 2, 1).toISOString() })
  return out
}

/** Eventos por día (un evento de varios días cuenta en cada uno). El final de un evento es exclusivo. */
export function dayLoad(events: readonly Pick<PlanEvent, 'start' | 'end'>[]) {
  const load = new Map<string, number>()
  for (const e of events) {
    const start = parseISO(e.start), end = parseISO(e.end)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue
    const first = startOfDay(start)
    const last = new Date(Math.max(startOfDay(new Date(end.getTime() - 1)).getTime(), first.getTime()))
    for (let d = first, n = 0; d.getTime() <= last.getTime() && n < 400; d = addDays(d, 1), n++) load.set(key(d), (load.get(key(d)) ?? 0) + 1)
  }
  return load
}

/** Una rutina es un evento que se repite (ocurrencia de una serie): llena los días y no dice qué tiene algo de verdad. */
export const isRoutine = (e: Pick<PlanEvent, 'recurringEventId' | 'recurrence'>) => Boolean(e.recurringEventId || e.recurrence?.length)

/** Carga por día sin rutinas, y el máximo del año para escalar el color. */
export function yearLoad(events: readonly Pick<PlanEvent, 'start' | 'end' | 'recurringEventId' | 'recurrence'>[]) {
  const load = dayLoad(events.filter(e => !isRoutine(e)))
  return { load, max: Math.max(0, ...load.values()) }
}

/** Intensidad 0–4 para pintar el día, escalada por el máximo del año (≥1 evento siempre se ve). */
export const intensity = (n: number, max: number) => n <= 0 || max <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((4 * n) / max)))
