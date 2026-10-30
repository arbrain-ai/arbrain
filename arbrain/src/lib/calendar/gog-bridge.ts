import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServiceClient } from '@/lib/supabase/service'
import type {
  CalendarAccountType,
  CalendarDeleteInput,
  CalendarEvent,
  CalendarEventInput,
  CalendarEventUpdateInput,
  CalendarSource,
} from '@/features/calendar/types'
import { instalacion } from '@/config'

const execFileAsync = promisify(execFile)

// Cuentas y calendario del objetivo: de la configuración de la instalación (config/instalacion.ts).
const PERSONAL_ACCOUNT = instalacion().correoDueno
const BUSINESS_ACCOUNT = instalacion().correoNegocio
const DAILY_OBJECTIVE_CALENDAR_ID = instalacion().calendarioObjetivoId
const ACCOUNT_TYPES: Record<string, CalendarAccountType> = {
  [PERSONAL_ACCOUNT]: 'personal',
  [BUSINESS_ACCOUNT]: 'business',
}

const ALLOWED_ACCOUNTS = [PERSONAL_ACCOUNT, BUSINESS_ACCOUNT]

interface GogCalendarListResponse {
  calendars?: GogCalendar[]
}

interface GogCalendar {
  id: string
  summary?: string
  description?: string
  backgroundColor?: string
  foregroundColor?: string
  accessRole?: string
  timeZone?: string
  selected?: boolean
  primary?: boolean
  hidden?: boolean
}

interface GogEventsResponse {
  events?: GogEvent[]
}

interface GogEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  status?: string
  htmlLink?: string
  colorId?: string
  eventType?: string
  recurringEventId?: string
  originalStartTime?: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string; optional?: boolean }>
  reminders?: { useDefault?: boolean; overrides?: Array<{ method: 'popup' | 'email'; minutes: number }> }
  recurrence?: string[]
  hangoutLink?: string
  updated?: string
  iCalUID?: string
  etag?: string
  transparency?: string
  visibility?: string
  extendedProperties?: {
    private?: Record<string, string>
    shared?: Record<string, string>
  }
}

function gogEnv() {
  return {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`,
    // Del entorno; si falta, de la configuración de la instalación (nunca un valor escrito aquí; la copia del alumno no trae ninguno).
    GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD ?? instalacion().gogKeyring,
  }
}

async function runGog(args: string[]) {
  try {
    const { stdout } = await execFileAsync('gog', args, {
      env: gogEnv(),
      timeout: 30_000,
      maxBuffer: 1024 * 1024 * 10,
    })
    if (!stdout.trim()) return {}
    return JSON.parse(stdout)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'gog command failed'
    throw new Error(`Google Calendar bridge failed: ${message}`)
  }
}

function requireAllowedAccount(accountEmail: string) {
  if (!ALLOWED_ACCOUNTS.includes(accountEmail)) {
    throw new Error(`Unsupported calendar account: ${accountEmail}`)
  }
}

function isSystemCalendar(calendar: GogCalendar) {
  return calendar.id.includes('#holiday') || calendar.id.includes('contacts') || calendar.summary?.toLowerCase().includes('festivos')
}

function isEditable(accessRole?: string) {
  return accessRole === 'owner' || accessRole === 'writer'
}

function normalizeSource(accountEmail: string, calendar: GogCalendar): CalendarSource {
  const accountType = ACCOUNT_TYPES[accountEmail] ?? 'personal'
  const system = isSystemCalendar(calendar)
  const accessRole = calendar.accessRole ?? 'reader'
  const selected = calendar.selected !== false && !system

  return {
    id: `${accountEmail}:${calendar.id}`,
    accountEmail,
    accountType,
    googleCalendarId: calendar.id,
    summary: calendar.summary ?? calendar.id,
    description: calendar.description ?? null,
    backgroundColor: calendar.backgroundColor ?? null,
    foregroundColor: calendar.foregroundColor ?? null,
    accessRole,
    timeZone: calendar.timeZone ?? null,
    selected,
    hidden: Boolean(calendar.hidden || system),
    primary: Boolean(calendar.primary || calendar.id === 'primary'),
    editable: isEditable(accessRole),
    syncEnabled: selected,
  }
}

function eventStart(event: GogEvent) {
  return event.start?.dateTime ?? event.start?.date ?? ''
}

function eventEnd(event: GogEvent) {
  return event.end?.dateTime ?? event.end?.date ?? eventStart(event)
}

function normalizeEvent(accountEmail: string, source: CalendarSource, event: GogEvent): CalendarEvent | null {
  const start = eventStart(event)
  if (!event.id || !start || event.status === 'cancelled') return null

  const allDay = !event.start?.dateTime
  const eventType = event.eventType
  const readOnly = !source.editable
  const taskId = event.extendedProperties?.private?.mc_task_id ?? null
  const summary = event.summary || 'Sin titulo'
  const isDailyObjective = source.googleCalendarId === DAILY_OBJECTIVE_CALENDAR_ID &&
    (/^objetivo:/i.test(summary) || /definir objetivo del dia/i.test(summary))

  return {
    id: `${accountEmail}:${source.googleCalendarId}:${event.id}`,
    googleEventId: event.id,
    googleCalendarId: source.googleCalendarId,
    accountEmail,
    accountType: source.accountType,
    calendarName: source.summary,
    title: summary,
    description: event.description ?? null,
    location: event.location ?? null,
    start,
    end: eventEnd(event),
    allDay,
    color: isDailyObjective ? '#ffac3d' : source.backgroundColor ?? null,
    textColor: isDailyObjective ? '#1f1300' : source.foregroundColor ?? null,
    editable: source.editable && event.status !== 'cancelled',
    kind: isDailyObjective
      ? 'daily_objective'
      : taskId
      ? 'task_scheduled_block'
      : readOnly
      ? 'read_only'
      : eventType === 'focusTime'
        ? 'focus_time'
        : eventType === 'outOfOffice'
          ? 'out_of_office'
          : eventType === 'workingLocation'
            ? 'working_location'
            : 'google_event',
    status: event.status ?? null,
    htmlLink: event.htmlLink ?? null,
    recurringEventId: event.recurringEventId ?? null,
    originalStart: event.originalStartTime?.dateTime ?? event.originalStartTime?.date ?? null,
    attendees: event.attendees?.filter((a) => a.email).map((a) => ({
      email: a.email!,
      displayName: a.displayName,
      responseStatus: a.responseStatus,
      optional: a.optional,
    })),
    reminders: event.reminders?.overrides,
    recurrence: event.recurrence,
    hangoutLink: event.hangoutLink ?? null,
    taskId,
    raw: event,
  }
}

export async function listCalendarSources(accountEmails = ALLOWED_ACCOUNTS): Promise<CalendarSource[]> {
  const responses = await Promise.allSettled(
    accountEmails.map(async (accountEmail) => {
      requireAllowedAccount(accountEmail)
      const data = await runGog(['cal', 'calendars', '--account', accountEmail, '--json', '--no-input']) as GogCalendarListResponse
      return (data.calendars ?? []).map((calendar) => normalizeSource(accountEmail, calendar))
    })
  )

  const sources = responses.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
  if (sources.length === 0 && responses.some((result) => result.status === 'rejected')) {
    const firstError = responses.find((result) => result.status === 'rejected')
    throw firstError?.reason instanceof Error ? firstError.reason : new Error('Google Calendar bridge unavailable')
  }

  return sources.sort((a, b) => {
    if (a.accountType !== b.accountType) return a.accountType === 'personal' ? -1 : 1
    if (a.primary !== b.primary) return a.primary ? -1 : 1
    return a.summary.localeCompare(b.summary)
  })
}

export async function listCalendarEvents(params: {
  from: string
  to: string
  accountEmails?: string[]
  calendarIds?: string[]
  role?: string
}) {
  const accountEmails = params.role === 'owner'
    ? (params.accountEmails?.length ? params.accountEmails : ALLOWED_ACCOUNTS)
    : [BUSINESS_ACCOUNT]

  const sources = await listCalendarSources(accountEmails)
  const selectedSources = sources.filter((source) => {
    if (params.calendarIds?.length) return params.calendarIds.includes(source.googleCalendarId)
    return source.selected && !source.hidden
  })

  const eventGroups = await Promise.all(
    selectedSources.map(async (source) => {
      const data = await runGog([
        'cal',
        'events',
        source.googleCalendarId,
        '--from',
        params.from,
        '--to',
        params.to,
        '--account',
        source.accountEmail,
        '--json',
        '--no-input',
        '--max',
        '250',
      ]) as GogEventsResponse

      return (data.events ?? [])
        .map((event) => normalizeEvent(source.accountEmail, source, event))
        .filter((event): event is CalendarEvent => event !== null)
    })
  )

  const events = eventGroups.flat().sort((a, b) => a.start.localeCompare(b.start))
  syncMirrorBestEffort({
    sources: selectedSources,
    events,
    from: params.from,
    to: params.to,
  }).catch(() => undefined)

  return { sources, events }
}

function appendOptional(args: string[], flag: string, value?: string | null) {
  if (value !== undefined && value !== null && value !== '') {
    args.push(flag, value)
  }
}

function appendCommonEventArgs(
  args: string[],
  input: Partial<CalendarEventInput>,
  options: { includeMeet?: boolean } = {}
) {
  appendOptional(args, '--summary', input.title)
  appendOptional(args, '--from', input.start)
  appendOptional(args, '--to', input.end)
  appendOptional(args, '--description', input.description)
  appendOptional(args, '--location', input.location)
  appendOptional(args, '--attendees', input.attendees?.join(','))
  appendOptional(args, '--event-color', input.colorId)
  appendOptional(args, '--visibility', input.visibility)
  appendOptional(args, '--transparency', input.transparency)
  appendOptional(args, '--send-updates', input.sendUpdates ?? 'none')
  if (input.allDay) args.push('--all-day')
  if (options.includeMeet !== false && input.withMeet) args.push('--with-meet')
  for (const rule of input.recurrence ?? []) args.push('--rrule', rule)
  for (const reminder of input.reminders ?? []) {
    args.push('--reminder', `${reminder.method}:${reminder.minutes}m`)
  }
  if (input.taskId) args.push('--private-prop', `mc_task_id=${input.taskId}`)
}

export async function createGoogleCalendarEvent(input: CalendarEventInput) {
  requireAllowedAccount(input.accountEmail)
  const args = ['cal', 'create', input.googleCalendarId, '--account', input.accountEmail, '--json', '--no-input']
  appendCommonEventArgs(args, input, { includeMeet: true })
  const created = await runGog(args) as GogEvent | { event?: GogEvent }
  const source = (await listCalendarSources([input.accountEmail])).find((s) => s.googleCalendarId === input.googleCalendarId)
  const rawEvent = 'event' in created && created.event ? created.event : created as GogEvent
  const event = normalizeEvent(input.accountEmail, source ?? fallbackSource(input), rawEvent)
  if (event) await upsertMirrorBestEffort([event])
  return event
}

export async function updateGoogleCalendarEvent(input: CalendarEventUpdateInput) {
  requireAllowedAccount(input.accountEmail)
  const args = ['cal', 'update', input.googleCalendarId, input.eventId, '--account', input.accountEmail, '--json', '--no-input']
  appendCommonEventArgs(args, input, { includeMeet: false })
  appendOptional(args, '--scope', input.recurrenceScope)
  appendOptional(args, '--original-start', input.originalStart)
  const updated = await runGog(args) as GogEvent | { event?: GogEvent }
  const source = (await listCalendarSources([input.accountEmail])).find((s) => s.googleCalendarId === input.googleCalendarId)
  const rawEvent = 'event' in updated && updated.event ? updated.event : updated as GogEvent
  const event = normalizeEvent(input.accountEmail, source ?? fallbackSource(input), rawEvent)
  if (event) await upsertMirrorBestEffort([event])
  return event
}

export async function deleteGoogleCalendarEvent(input: CalendarDeleteInput) {
  requireAllowedAccount(input.accountEmail)
  const args = ['cal', 'delete', input.googleCalendarId, input.eventId, '--account', input.accountEmail, '--json', '--no-input', '--force']
  appendOptional(args, '--scope', input.recurrenceScope)
  appendOptional(args, '--original-start', input.originalStart)
  appendOptional(args, '--send-updates', input.sendUpdates ?? 'none')
  await runGog(args)
  await markMirrorDeletedBestEffort(input)
  return { ok: true }
}

function fallbackSource(input: { accountEmail: string; googleCalendarId: string }): CalendarSource {
  return {
    id: `${input.accountEmail}:${input.googleCalendarId}`,
    accountEmail: input.accountEmail,
    accountType: ACCOUNT_TYPES[input.accountEmail] ?? 'personal',
    googleCalendarId: input.googleCalendarId,
    summary: input.googleCalendarId,
    accessRole: 'owner',
    selected: true,
    hidden: false,
    primary: input.googleCalendarId === 'primary',
    editable: true,
    syncEnabled: true,
  }
}

async function upsertMirrorBestEffort(events: CalendarEvent[]) {
  if (events.length === 0) return
  try {
    const service = createServiceClient()
    await upsertMirrorEvents(service, events)
  } catch {
    // Mirror sync must not block Google-backed Calendar usage.
  }
}

async function syncMirrorBestEffort(input: {
  sources: CalendarSource[]
  events: CalendarEvent[]
  from: string
  to: string
}) {
  try {
    const service = createServiceClient()
    await upsertMirrorEvents(service, input.events)
    await pruneMirrorEvents(service, input)
  } catch {
    // Google Calendar remains the source of truth when the mirror cannot sync.
  }
}

async function upsertMirrorEvents(service: ReturnType<typeof createServiceClient>, events: CalendarEvent[]) {
  const rows = events
    .filter((event) => event.googleEventId && event.googleCalendarId)
    .map((event) => ({
      google_event_id: event.googleEventId!,
      title: event.title,
      description: event.description ?? '',
      start_at: event.start,
      end_at: event.end,
      all_day: event.allDay,
      account_type: event.accountType ?? 'personal',
      calendar_id: event.googleCalendarId!,
      calendar_name: event.calendarName ?? event.googleCalendarId!,
      location: event.location ?? '',
      synced_at: new Date().toISOString(),
    }))
  if (rows.length === 0) return
  await service.from('calendar_events').upsert(rows, { onConflict: 'google_event_id,account_type' })
}

function mirrorSourceKey(accountType: CalendarAccountType, calendarId: string) {
  return `${accountType}:${calendarId}`
}

function mirrorCalendarIdsForSource(source: CalendarSource) {
  const ids = new Set([source.googleCalendarId])
  if (source.primary || source.googleCalendarId === source.accountEmail) ids.add('primary')
  return [...ids]
}

function postgrestInList(values: string[]) {
  return `(${values.join(',')})`
}

async function pruneMirrorEvents(
  service: ReturnType<typeof createServiceClient>,
  input: {
    sources: CalendarSource[]
    events: CalendarEvent[]
    from: string
    to: string
  }
) {
  const currentIdsBySource = new Map<string, Set<string>>()

  for (const event of input.events) {
    if (!event.googleEventId || !event.googleCalendarId) continue
    const accountType = event.accountType ?? 'personal'
    const key = mirrorSourceKey(accountType, event.googleCalendarId)
    const ids = currentIdsBySource.get(key) ?? new Set<string>()
    ids.add(event.googleEventId)
    currentIdsBySource.set(key, ids)
  }

  for (const source of input.sources) {
    const currentIds = currentIdsBySource.get(mirrorSourceKey(source.accountType, source.googleCalendarId)) ?? new Set<string>()
    let query = service
      .from('calendar_events')
      .delete()
      .eq('account_type', source.accountType)
      .in('calendar_id', mirrorCalendarIdsForSource(source))
      .lt('start_at', input.to)
      .gt('end_at', input.from)

    if (currentIds.size > 0) {
      query = query.not('google_event_id', 'in', postgrestInList([...currentIds]))
    }

    await query
  }
}

async function markMirrorDeletedBestEffort(input: CalendarDeleteInput) {
  try {
    const service = createServiceClient()
    await service
      .from('calendar_events')
      .delete()
      .eq('google_event_id', input.eventId)
      .eq('account_type', ACCOUNT_TYPES[input.accountEmail] ?? 'personal')
  } catch {
    // Best effort only.
  }
}

export function calendarAccountsForRole(role: string | null) {
  return role === 'owner' ? ALLOWED_ACCOUNTS : [BUSINESS_ACCOUNT]
}
