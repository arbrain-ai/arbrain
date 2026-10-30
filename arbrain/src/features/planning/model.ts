import { addDays, addMinutes, format, parseISO } from 'date-fns'
import type { PlanEvent, PlanItem, PlanMutation, PlanTask, PlanningSnapshot } from './types'

export const MODES = [
  { id: 'day', label: 'Día', calendar: 'timeGridDay' },
  { id: 'week', label: 'Semana', calendar: 'timeGridWeek' },
  { id: 'month', label: 'Mes', calendar: 'dayGridMonth' },
  { id: 'year', label: 'Año', calendar: null },
  { id: 'agenda', label: 'Agenda', calendar: 'rollingAgenda' },
  { id: 'crons', label: 'Rutinas', calendar: null },
  // La cuarta escala (25 oct 2026, Daniel: «con Ctrl+H accedo a ella y es la de hábitos a través del tiempo»): superficie propia.
  { id: 'habits', label: 'Hábitos', calendar: null },
] as const

export function localInput(date: Date) { return format(date, "yyyy-MM-dd'T'HH:mm") }
export function dayKey(date: Date) { return format(date, 'yyyy-MM-dd') }
export function hasTime(value: string | null) { return Boolean(value?.includes('T')) }
export function taskStart(task: PlanTask): Date | null {
  if (!task.due) return null
  const date = parseISO(task.due)
  return Number.isFinite(date.getTime()) ? date : null
}
export function taskEnd(task: PlanTask) {
  const start = taskStart(task)
  return start ? hasTime(task.due) ? addMinutes(start, task.durationMinutes ?? 30) : addDays(start, 1) : null
}
export function mutationFor(item: PlanItem, ownerId: string, data: Record<string, unknown>, action: PlanMutation['action'] = 'update'): PlanMutation {
  return { ownerId, requestId: crypto.randomUUID(), kind: item.kind, action, externalId: item.externalId,
    ...(item.kind === 'event' ? { account: item.account, calendarId: item.calendarId, etag: item.etag,
      ...(item.recurringEventId ? { scope: 'occurrence' as const } : {}) } : { updatedAt: item.updatedAt }), data }
}

export function eventData(event: PlanEvent) {
  return { title: event.title, description: event.description, location: event.location,
    start: event.start, end: event.end, allDay: event.allDay, timeZone: event.timeZone }
}
export function taskData(task: PlanTask) {
  return { title: task.title, description: task.description, priority: task.priority,
    due: task.due, durationMinutes: task.durationMinutes }
}

/** Provisional UI only. A provider rejection restores the previous snapshot. */
export function optimisticTask(snapshot: PlanningSnapshot, operation: PlanMutation): PlanningSnapshot {
  if(operation.kind!=='task')return snapshot
  const task=snapshot.tasks.find(t=>t.externalId===operation.externalId)
  if(!task)return snapshot
  if(operation.action==='complete')return {...snapshot,
    tasks:snapshot.tasks.filter(t=>t.id!==task.id),
    completedTasks:[...(snapshot.completedTasks??[]).filter(t=>t.id!==task.id),{...task,completed:true,pending:true,completedAt:new Date().toISOString()}]}
  if(operation.action==='move'&&typeof operation.data?.projectId==='string')return {...snapshot,tasks:snapshot.tasks.map(t=>t.id===task.id?{...t,projectId:operation.data!.projectId as string,sectionId:null,pending:true}:t)}
  if(operation.action==='move')return {...snapshot,tasks:snapshot.tasks.map(t=>t.id===task.id?{...t,sectionId:typeof operation.data?.sectionId==='string'?operation.data.sectionId:null,pending:true}:t)}
  return snapshot
}

/** Failed sources preserve their last known data and are explicitly stale. */
export function mergeSnapshot(previous: PlanningSnapshot | null, next: PlanningSnapshot): PlanningSnapshot {
  if (!previous || previous.ownerId !== next.ownerId) return next
  const failed = new Set(next.health.filter(h => h.state === 'error').map(h => h.id))
  const inRange = (e: PlanEvent) => Date.parse(e.start) < Date.parse(next.range.to) && Date.parse(e.end) > Date.parse(next.range.from)
  const preservedEvents = previous.events.filter(e => (failed.has(e.sourceId) || failed.has(e.account)) && inRange(e))
  const sourceIds = new Set(next.sources.map(s => s.id))
  return { ...next,
    sources: [...next.sources, ...previous.sources.filter(s => failed.has(s.account) && !sourceIds.has(s.id))],
    events: [...next.events, ...preservedEvents.filter(e => !next.events.some(n => n.id === e.id))],
    tasks: failed.has('todoist') ? previous.tasks : next.tasks,
    projects: failed.has('projects') ? previous.projects : next.projects,
    sections: failed.has('sections') ? previous.sections : next.sections,
    completedTasks: failed.has('completed') ? previous.completedTasks : next.completedTasks,
    health: next.health.map(h => failed.has(h.id) ? { ...h, state: 'stale' } : h),
  }
}

/** Vistas que no son de FullCalendar (Año y Rutinas pintan su propia superficie). */
export const isOwnSurface = (mode: string) => mode === 'year' || mode === 'crons' || mode === 'habits'

/** 4 días se retiró (5 oct 2026, 17:51): Daniel planea por Día, Semana y Mes. Lo que llegue con 4 días (URL, preferencias,
 *  órdenes viejas) cae en Semana. El tipo lo conserva solo como legado de entrada. */
export const escalaVigente = <T extends string | null | undefined>(m: T): T => (m === 'fourDays' ? 'week' : m) as T
