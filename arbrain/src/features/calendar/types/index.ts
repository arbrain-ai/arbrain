export type CalendarAccountType = 'personal' | 'business'

export type CalendarView = 'day' | 'four_day' | 'week' | 'month' | 'agenda'

export type AccountFilter = 'all' | 'personal' | 'business' | 'tasks'

export type CalendarEventKind =
  | 'google_event'
  | 'daily_objective'
  | 'task_due'
  | 'task_scheduled_block'
  | 'cron_run'
  | 'cron_scheduled'
  | 'focus_time'
  | 'out_of_office'
  | 'working_location'
  | 'read_only'

type CalendarAccessRole = 'owner' | 'writer' | 'reader' | 'freeBusyReader' | string

export interface CalendarSource {
  id: string
  accountEmail: string
  accountType: CalendarAccountType
  googleCalendarId: string
  summary: string
  description?: string | null
  backgroundColor?: string | null
  foregroundColor?: string | null
  accessRole: CalendarAccessRole
  timeZone?: string | null
  selected: boolean
  hidden: boolean
  primary: boolean
  editable: boolean
  syncEnabled: boolean
  lastSyncedAt?: string | null
  lastError?: string | null
}

interface CalendarAttendee {
  email: string
  displayName?: string
  responseStatus?: string
  optional?: boolean
}

interface CalendarReminder {
  method: 'popup' | 'email'
  minutes: number
}

export interface CalendarEvent {
  id: string
  googleEventId?: string
  googleCalendarId?: string
  accountEmail?: string
  accountType?: CalendarAccountType
  account?: 'personal' | 'business' | 'tasks'
  calendarName?: string
  title: string
  description?: string | null
  location?: string | null
  start: string
  end: string
  allDay: boolean
  color?: string | null
  textColor?: string | null
  editable: boolean
  kind: CalendarEventKind
  status?: string | null
  htmlLink?: string | null
  recurringEventId?: string | null
  originalStart?: string | null
  attendees?: CalendarAttendee[]
  reminders?: CalendarReminder[]
  recurrence?: string[]
  hangoutLink?: string | null
  taskId?: string | null
  priority?: number | null
  // Capa cron (kinds cron_run / cron_scheduled, solo lectura client-side)
  cronJobId?: string | null
  cronRunId?: string | null
  cronRunStatus?: 'done' | 'error' | 'pending' | null
  cronOutput?: string | null
  raw?: unknown
}

export interface CalendarSyncHealth {
  state: 'idle' | 'syncing' | 'fresh' | 'stale' | 'error'
  lastSyncedAt?: string | null
  message?: string | null
  staleSources?: number
}

export interface CalendarEventInput {
  accountEmail: string
  googleCalendarId: string
  title: string
  start: string
  end: string
  allDay?: boolean
  description?: string
  location?: string
  attendees?: string[]
  reminders?: CalendarReminder[]
  recurrence?: string[]
  colorId?: string
  visibility?: string
  transparency?: string
  sendUpdates?: 'all' | 'externalOnly' | 'none'
  withMeet?: boolean
  taskId?: string
}

export interface CalendarEventUpdateInput extends Partial<Omit<CalendarEventInput, 'accountEmail' | 'googleCalendarId'>> {
  accountEmail: string
  googleCalendarId: string
  eventId: string
  targetCalendarId?: string
  recurrenceScope?: 'single' | 'future' | 'all'
  originalStart?: string
}

export interface CalendarDeleteInput {
  accountEmail: string
  googleCalendarId: string
  eventId: string
  recurrenceScope?: 'single' | 'future' | 'all'
  originalStart?: string
  sendUpdates?: 'all' | 'externalOnly' | 'none'
}
