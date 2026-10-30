export type CalendarMode = 'day' | 'fourDays' | 'week' | 'month' | 'year' | 'agenda' | 'crons' | 'habits'

export interface CalendarSource {
  id: string
  calendarId: string
  account: string
  title: string
  color: string | null
  timeZone: string
  editable: boolean
  selected: boolean
  objective: boolean
}

export interface PlanEvent {
  id: string
  externalId: string
  kind: 'event'
  sourceId: string
  account: string
  calendarId: string
  title: string
  description: string
  location: string
  start: string
  end: string
  allDay: boolean
  timeZone: string
  etag: string | null
  recurringEventId: string | null
  recurrence: string[]
  editable: boolean
  url?: string
  /** Videollamada (Meet) e invitados: solo lectura, los trae la pluma desde el 5 oct 2026. */
  meetUrl?: string | null
  attendees?: { email: string; name: string; response: string; self: boolean; organizer: boolean }[]
  /** Color del evento en Google (1–11). Manda sobre la categoría inferida (categorias.ts, 10 oct 2026). */
  colorId?: string | null
}

export interface PlanTask {
  id: string
  externalId: string
  kind: 'task'
  title: string
  description: string
  projectId: string | null
  sectionId: string | null
  parentId: string | null
  priority: number
  due: string | null
  timeZone: string | null
  recurring: boolean
  recurrenceText: string | null
  durationMinutes: number | null
  durationOrigin?: 'todoist' | 'arbrain' | null
  completed: boolean
  updatedAt: string | null
  completedAt?: string | null
  /** Etiquetas de Todoist; `objetivo` ancla el objetivo del día (5 oct 2026). */
  labels?: string[]
  pending?: boolean
  url?: string
}

export type PlanItem = PlanEvent | PlanTask
export interface SourceHealth { id: string; state: 'fresh' | 'error' | 'stale'; checkedAt: string; message?: string }
export interface PlanningSnapshot {
  ownerId: string
  sources: CalendarSource[]
  events: PlanEvent[]
  tasks: PlanTask[]
  projects: { id: string; title: string; color: string | null }[]
  sections?: { id: string; projectId: string; title: string }[]
  completedTasks?: PlanTask[]
  health: SourceHealth[]
  loadedAt: string
  range: { from: string; to: string }
}

export interface PlanMutation {
  requestId: string
  kind: 'event' | 'task'
  action: 'create' | 'update' | 'delete' | 'complete' | 'move' | 'reopen'
  ownerId: string
  externalId?: string
  account?: string
  calendarId?: string
  etag?: string | null
  updatedAt?: string | null
  scope?: 'occurrence'
  data?: Record<string, unknown>
}
export interface MutationResult { ok: true; event?: PlanEvent; task?: PlanTask; deletedId?: string; completedId?: string; recurring?: boolean }

export interface CronSchedule {
  id: string; schedule: string; status: 'active' | 'paused'; next_run: number | null
  last_run: number | null; last_result: string | null
}
export interface CronRun {
  id: string; job_id: string; status: string; created_at: string
  response: string | null; error: string | null; duration_ms?: number | null
}
export interface CronSnapshot {
  jobs: CronSchedule[]; runs: CronRun[]; timeZone: string; loadedAt: string
  scheduleError: string | null; historyError: string | null; historyTruncated?: boolean
}
