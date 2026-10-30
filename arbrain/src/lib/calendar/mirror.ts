import { createServiceClient } from '@/lib/supabase/service'
import { calendarColorFor } from '@/lib/calendar/colors'
import type {
  CalendarAccountType,
  CalendarEvent,
  CalendarEventKind,
  CalendarSource,
  CalendarSyncHealth,
} from '@/features/calendar/types'
import { instalacion } from '@/config'

// Cuentas y calendario del objetivo: de la configuración de la instalación (config/instalacion.ts).
const PERSONAL_ACCOUNT = instalacion().correoDueno
const BUSINESS_ACCOUNT = instalacion().correoNegocio
const DAILY_OBJECTIVE_CALENDAR_ID = instalacion().calendarioObjetivoId
const MIRROR_STALE_AFTER_MS = 6 * 60 * 60 * 1000

const ACCOUNT_EMAIL_BY_TYPE: Record<CalendarAccountType, string> = {
  personal: PERSONAL_ACCOUNT,
  business: BUSINESS_ACCOUNT,
}

interface CalendarEventRow {
  id: string
  google_event_id: string | null
  title: string | null
  description: string | null
  start_at: string
  end_at: string
  all_day: boolean | null
  account_type: CalendarAccountType | null
  calendar_id: string | null
  calendar_name: string | null
  location: string | null
  synced_at: string | null
}

interface CalendarSourceRow {
  id: string
  account_email: string
  account_type: CalendarAccountType
  google_calendar_id: string
  summary: string | null
  description: string | null
  background_color: string | null
  foreground_color: string | null
  access_role: string | null
  time_zone: string | null
  selected: boolean | null
  hidden: boolean | null
  primary_calendar: boolean | null
  sync_enabled: boolean | null
  last_seen_at: string | null
}

function accountTypesForRole(role?: string | null): CalendarAccountType[] {
  return role === 'owner' ? ['personal', 'business'] : ['business']
}

function isEditable(accessRole?: string | null) {
  return accessRole === 'owner' || accessRole === 'writer'
}

function latestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null
}

function syncHealth(lastSyncedAt: string | null): CalendarSyncHealth {
  if (!lastSyncedAt) {
    return {
      state: 'stale',
      lastSyncedAt: null,
      message: 'Mission Control calendar mirror has no sync yet',
    }
  }

  const age = Date.now() - new Date(lastSyncedAt).getTime()
  return {
    state: age > MIRROR_STALE_AFTER_MS ? 'stale' : 'fresh',
    lastSyncedAt,
    message: 'Loaded from Mission Control calendar mirror',
  }
}

async function fetchTaskLinks(
  service: ReturnType<typeof createServiceClient>,
  rows: CalendarEventRow[],
): Promise<Map<string, string>> {
  const eventIds = [...new Set(rows.map((row) => row.google_event_id).filter((id): id is string => Boolean(id)))]
  if (!eventIds.length) return new Map()

  const { data, error } = await service
    .from('task_calendar_links')
    .select('task_id, google_event_id')
    .in('google_event_id', eventIds)

  if (error || !data) return new Map()
  return new Map(data.map((row) => [row.google_event_id as string, row.task_id as string]))
}

function eventKind(row: CalendarEventRow): CalendarEventKind {
  const title = row.title ?? ''
  if (
    row.calendar_id === DAILY_OBJECTIVE_CALENDAR_ID &&
    (/^objetivo:/i.test(title) || /definir objetivo del dia/i.test(title))
  ) {
    return 'daily_objective'
  }
  return 'google_event'
}

function mapEventRow(row: CalendarEventRow, linkByEventId?: Map<string, string>): CalendarEvent {
  const accountType = row.account_type ?? 'personal'
  const colors = calendarColorFor(row.calendar_name)
  const baseKind = eventKind(row)
  // Con gog disponible, el taskId/kind viene de extendedProperties (gog-bridge). En el
  // fallback al mirror esa metadata no existe en calendar_events, asi que la recuperamos
  // del indice operativo task_calendar_links (poblado por el schedule API).
  const linkedTaskId = row.google_event_id ? linkByEventId?.get(row.google_event_id) ?? null : null
  const kind: CalendarEventKind =
    baseKind === 'daily_objective'
      ? 'daily_objective'
      : linkedTaskId
        ? 'task_scheduled_block'
        : baseKind

  return {
    id: `${accountType}:${row.calendar_id ?? 'calendar'}:${row.google_event_id ?? row.id}`,
    googleEventId: row.google_event_id ?? undefined,
    googleCalendarId: row.calendar_id ?? undefined,
    accountEmail: ACCOUNT_EMAIL_BY_TYPE[accountType],
    accountType,
    account: accountType,
    calendarName: row.calendar_name ?? row.calendar_id ?? 'Calendar',
    title: row.title ?? 'Sin titulo',
    description: row.description,
    location: row.location,
    start: row.start_at,
    end: row.end_at,
    allDay: Boolean(row.all_day),
    color: baseKind === 'daily_objective' ? '#ffac3d' : colors.backgroundColor,
    textColor: baseKind === 'daily_objective' ? '#1f1300' : colors.foregroundColor,
    editable: true,
    kind,
    taskId: linkedTaskId,
    raw: row,
  }
}

function mapSourceRow(row: CalendarSourceRow): CalendarSource {
  const accessRole = row.access_role ?? 'reader'

  return {
    id: `${row.account_email}:${row.google_calendar_id}`,
    accountEmail: row.account_email,
    accountType: row.account_type,
    googleCalendarId: row.google_calendar_id,
    summary: row.summary ?? row.google_calendar_id,
    description: row.description,
    backgroundColor: row.background_color,
    foregroundColor: row.foreground_color,
    accessRole,
    timeZone: row.time_zone,
    selected: row.selected !== false,
    hidden: Boolean(row.hidden),
    primary: Boolean(row.primary_calendar),
    editable: isEditable(accessRole),
    syncEnabled: row.sync_enabled !== false,
    lastSyncedAt: row.last_seen_at,
  }
}

function sourceFromEventRows(rows: CalendarEventRow[]) {
  const grouped = new Map<string, CalendarSource>()

  for (const row of rows) {
    const accountType = row.account_type ?? 'personal'
    const calendarId = row.calendar_id ?? ACCOUNT_EMAIL_BY_TYPE[accountType]
    const key = `${accountType}:${calendarId}`
    const existing = grouped.get(key)
    const colors = calendarColorFor(row.calendar_name)
    const syncedAt = latestTimestamp([existing?.lastSyncedAt, row.synced_at])

    grouped.set(key, {
      id: `${ACCOUNT_EMAIL_BY_TYPE[accountType]}:${calendarId}`,
      accountEmail: ACCOUNT_EMAIL_BY_TYPE[accountType],
      accountType,
      googleCalendarId: calendarId,
      summary: row.calendar_name ?? calendarId,
      backgroundColor: colors.backgroundColor,
      foregroundColor: colors.foregroundColor,
      accessRole: 'owner',
      selected: true,
      hidden: false,
      primary: calendarId === ACCOUNT_EMAIL_BY_TYPE[accountType] || calendarId === 'primary',
      editable: true,
      syncEnabled: true,
      lastSyncedAt: syncedAt,
    })
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.accountType !== b.accountType) return a.accountType === 'personal' ? -1 : 1
    if (a.primary !== b.primary) return a.primary ? -1 : 1
    return a.summary.localeCompare(b.summary)
  })
}

export async function listMirrorCalendarEvents(params: {
  from: string
  to: string
  calendarIds?: string[]
  role?: string | null
}) {
  const service = createServiceClient()
  let query = service
    .from('calendar_events')
    .select('id, google_event_id, title, description, start_at, end_at, all_day, account_type, calendar_id, calendar_name, location, synced_at')
    .lt('start_at', params.to)
    .gt('end_at', params.from)
    .in('account_type', accountTypesForRole(params.role))
    .order('start_at', { ascending: true })
    .limit(500)

  if (params.calendarIds?.length) {
    query = query.in('calendar_id', params.calendarIds)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as CalendarEventRow[]
  const linkByEventId = await fetchTaskLinks(service, rows)
  const latestInRange = latestTimestamp(rows.map((row) => row.synced_at))
  let lastSyncedAt = latestInRange

  if (!lastSyncedAt) {
    const { data: latest } = await service
      .from('calendar_events')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    lastSyncedAt = latest?.synced_at ?? null
  }

  return {
    events: rows.map((row) => mapEventRow(row, linkByEventId)),
    syncHealth: syncHealth(lastSyncedAt),
  }
}

export async function listMirrorCalendarSources(params: { role?: string | null } = {}) {
  const service = createServiceClient()
  const accountTypes = accountTypesForRole(params.role)

  const richSources = await service
    .from('calendar_sources')
    .select('id, account_email, account_type, google_calendar_id, summary, description, background_color, foreground_color, access_role, time_zone, selected, hidden, primary_calendar, sync_enabled, last_seen_at')
    .in('account_type', accountTypes)
    .order('summary', { ascending: true })

  if (!richSources.error && richSources.data?.length) {
    const rows = richSources.data as CalendarSourceRow[]
    const sources = rows.map(mapSourceRow)
    return {
      sources,
      syncHealth: syncHealth(latestTimestamp(sources.map((source) => source.lastSyncedAt))),
    }
  }

  const { data, error } = await service
    .from('calendar_events')
    .select('id, google_event_id, title, description, start_at, end_at, all_day, account_type, calendar_id, calendar_name, location, synced_at')
    .in('account_type', accountTypes)
    .order('calendar_name', { ascending: true })
    .limit(1000)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as CalendarEventRow[]
  const sources = sourceFromEventRows(rows)
  const latestSyncedAt = latestTimestamp(rows.map((row) => row.synced_at))
  return {
    sources,
    syncHealth: {
      ...syncHealth(latestSyncedAt),
      state: 'stale' as const,
      message: 'Loaded legacy sources from calendar_events mirror',
    },
  }
}
