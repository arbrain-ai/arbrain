import { addDays, format, parseISO } from 'date-fns'
import { period, taskDay, type Goal, type Horizon } from '@/features/goals/model'
import type { PlanTask } from './types'
import type { AlcanceObjetivos } from './accesos'

/** Vista unificada (4 oct 2026): el objetivo y las tareas de arriba cubren EL MISMO periodo que pinta el calendario de abajo. */
export const HORIZONTE: Record<AlcanceObjetivos, Horizon> = { dia: 'day', semana: 'week', mes: 'month' }

/** [desde, hasta) en días civiles. Día y Semana siguen lo que el calendario muestra (4 días y Agenda incluidos); el mes, el mes civil del ancla. */
export function ventanaDelPeriodo(alcance: AlcanceObjetivos, ancla: string, rango: { from: string; to: string }): { desde: string; hasta: string } {
  if (alcance === 'mes') { const p = period('month', ancla); return { desde: p.start, hasta: p.end } }
  const desde = format(parseISO(rango.from), 'yyyy-MM-dd'), hasta = format(parseISO(rango.to), 'yyyy-MM-dd')
  if (hasta > desde) return { desde, hasta }
  return { desde: ancla, hasta: format(addDays(parseISO(ancla), 1), 'yyyy-MM-dd') }
}

/** Tareas abiertas con fecha dentro del periodo: primero lo que tiene hora más temprana, y a igual hora la de mayor prioridad. */
export function tareasDelPeriodo(tareas: PlanTask[], desde: string, hasta: string, zona: string): PlanTask[] {
  return tareas.filter(t => { const d = taskDay(t, zona); return !t.completed && !!d && d >= desde && d < hasta })
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '') || a.priority - b.priority)
}

/** Los objetivos propios del periodo (el registro de objetivos), con el mismo criterio que la vista Objetivos. */
export function objetivosDelPeriodo(goals: Goal[], alcance: AlcanceObjetivos, ancla: string): Goal[] {
  const h = HORIZONTE[alcance], p = period(h, ancla)
  return goals.filter(g => g.scope === h && g.start === p.start)
}

export const TITULO_OBJETIVO: Record<AlcanceObjetivos, string> = { dia: 'Objetivo del día', semana: 'Objetivo de la semana', mes: 'Objetivo del mes' }
export const TITULO_VACIO: Record<AlcanceObjetivos, string> = { dia: 'Sin objetivo para este día.', semana: 'Sin objetivo para esta semana.', mes: 'Sin objetivo para este mes.' }
