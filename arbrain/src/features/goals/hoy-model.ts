import type { PlanEvent, PlanningSnapshot } from '@/features/planning/types'
import { objectives } from '@/features/todotask/model'
import type { Goal, Horizon } from './model'

// Hoy en el teléfono (25 sep 2026): lógica pura, sin React, para probarla aislada.

export interface Focus { id: string; title: string; label: string | null; state: Goal['status'] | null; origin: 'plan' | 'calendario' }

/** «🎯 Semana 1 · Decidir la oferta» → label «Semana 1», title «Decidir la oferta». */
export function splitLabel(raw: string) {
  const clean = raw.replace(/^[^\p{L}\p{N}]+/u, '').trim()
  const m = clean.match(/^((?:semana|mes|d[ií]a)\s*\d*)\s*[·:—-]\s*(.+)$/iu)
  return m ? { label: m[1].trim(), title: m[2].trim() } : { label: null, title: clean }
}

/** Objetivos que cubren `day` en un horizonte. Manda el registro de objetivos
 * (`.claude/plan/objetivos.md`); solo si no tiene ninguno para ese horizonte se
 * muestra el evento del calendario «Objetivo de …» de Google, rotulado como tal. */
export function focusFor(goals: Goal[], snapshot: PlanningSnapshot | null, day: string, scope: Horizon): Focus[] {
  const own = goals.filter(g => g.scope === scope && g.start <= day && g.end > day)
  if (own.length) return own.map(g => ({ id: g.id, title: g.title, label: null, state: g.status, origin: 'plan' }))
  if (!snapshot) return []
  const events = objectives(snapshot, day)[scope]
  return events.map(e => ({ id: e.id, ...splitLabel(e.title), state: null, origin: 'calendario' }))
}

export type AgendaState = 'past' | 'now' | 'next' | 'later'
export interface AgendaRow { event: PlanEvent; state: AgendaState }

/** Agenda de un día: bloques de «todo el día» aparte (sin los calendarios Objetivo) y
 * los bloques con hora en orden, marcando el que está en curso y el siguiente. */
export function dayAgenda(snapshot: PlanningSnapshot | null, day: string, nowMs: number, isToday: boolean) {
  if (!snapshot) return { allDay: [] as PlanEvent[], timed: [] as AgendaRow[] }
  const objective = new Set(snapshot.sources.filter(s => s.objective).map(s => s.id))
  const inDay = snapshot.events.filter(e => !objective.has(e.sourceId))
  const allDay = inDay.filter(e => e.allDay && e.start.slice(0, 10) <= day && e.end.slice(0, 10) > day)
  // La ventana leída puede cubrir más días (caché compartida): se proyecta solo `day`.
  const timed = inDay.filter(e => !e.allDay && e.start.slice(0, 10) <= day && e.end.slice(0, 16) > `${day}T00:00`).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
  let nextMarked = false
  const rows = timed.map(event => {
    const start = Date.parse(event.start), end = Date.parse(event.end)
    let state: AgendaState = 'later'
    if (isToday) {
      if (end <= nowMs) state = 'past'
      else if (start <= nowMs) state = 'now'
      else if (!nextMarked) { state = 'next'; nextMarked = true }
    }
    return { event, state }
  })
  return { allDay, timed: rows }
}

/** Progreso de hábitos del día: cuenta solo marcas explícitas de cumplido. */
export function habitProgress(states: (boolean | null | undefined)[]) {
  return { done: states.filter(s => s === true).length, total: states.length }
}
