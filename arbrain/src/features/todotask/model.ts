import { civilToday, shiftDay } from '@/features/sistema/calendar-days'
import type { PlanTask, PlanningSnapshot } from '@/features/planning/types'

export function canonicalSection(title: string) {
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim()
}
export function taskDate(task: PlanTask, timeZone: string) {
  if (!task.due) return null
  if (task.due.includes('T') && /(?:Z|[+-]\d\d:\d\d)$/.test(task.due)) return civilToday(timeZone, new Date(task.due))
  return task.due.slice(0, 10)
}
export function taskGroup(task: PlanTask, today: string, timeZone: string) {
  const day = taskDate(task, timeZone)
  if (!day) return 'Sin fecha'
  if (day < today) return 'Por reprogramar'
  if (day === today) return 'Hoy'
  if (day === shiftDay(today, 1)) return 'Mañana'
  if (day <= shiftDay(today, 7)) return 'Próximos 7 días'
  return 'Después'
}
export function nextAction(snapshot: PlanningSnapshot, today: string, timeZone: string) {
  const active = snapshot.tasks.filter(t => !t.completed)
  const doing = new Set((snapshot.sections ?? []).filter(s => canonicalSection(s.title) === 'haciendo').map(s => s.id))
  const ordered = [...active].sort((a,b) => a.priority - b.priority || (a.due ?? 'z').localeCompare(b.due ?? 'z') || a.id.localeCompare(b.id))
  const working = ordered.find(t => t.sectionId && doing.has(t.sectionId))
  if (working) return { task:working, reason:'Ya está en Haciendo. Continúa lo que empezaste.' }
  const due = ordered.find(t => taskDate(t, timeZone) === today)
  if (due) return { task:due, reason:'Compromiso de hoy, ordenado por prioridad.' }
  const overdue = ordered.find(t => { const date = taskDate(t, timeZone); return date && date < today })
  if (overdue) return { task:overdue, reason:'Tiene una fecha pasada. Decide si la retomas o la reprogramas.' }
  return { task:null, reason:'No hay una tarea en curso ni comprometida para hoy. Elige una desde Todotask.' }
}
export function objectives(snapshot: PlanningSnapshot, day: string) {
  const source = new Map(snapshot.sources.filter(s => s.objective).map(s => [s.id, canonicalSection(s.title)]))
  const active = snapshot.events.filter(e => source.has(e.sourceId) && e.start.slice(0,10) <= day && e.end.slice(0,10) > day)
  return {
    day:active.filter(e => /dia/.test(source.get(e.sourceId)!)),
    week:active.filter(e => /semana/.test(source.get(e.sourceId)!)),
    month:active.filter(e => /mes/.test(source.get(e.sourceId)!)),
  }
}
