'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  endOfMonth,
  endOfWeek,
  formatISO,
  subDays,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { CalendarEvent, CalendarSource, CalendarSyncHealth, CalendarView } from '../types'
import { cacheSnapshot, getCachedSnapshot, listLocalEvents, localEventToCalendarEvent } from '@/lib/local-first'
import { calendarColorFor } from '@/lib/calendar/colors'

const SELECTED_SOURCES_KEY = 'mc-calendar-selected-sources'
// v2 (12 jun 2026): bump invalida overrides legacy que dejaban colores Google crudos
// (Trabajo Duro gris, EJERCICIO rosa) pegados por superficie y desincronizaban desktop vs web.
const SOURCE_COLOR_OVERRIDES_KEY = 'mc-calendar-source-colors-v2'
const STALE_REFRESH_MS = 6 * 60 * 60 * 1000
// Buffer de fetch: se piden eventos para visible +-7 dias. Asi cada nudge del
// rolling week encuentra el dia entrante YA en memoria (FullCalendar recorta a lo
// visible) y navegar no dispara fetches bloqueantes ni re-renders del event source.
const BUFFER_DAYS = 7
// Dentro del buffer, los datos se consideran frescos por 30s; despues una
// navegacion revalida en background (keepIfIdentical evita repaint si nada cambio).
const BUFFER_REVALIDATE_MS = 30 * 1000

const LOCAL_SOURCE: CalendarSource = {
  id: 'local-workspace',
  accountEmail: 'local@mission-control',
  accountType: 'personal',
  googleCalendarId: 'local',
  summary: 'Local Workspace',
  description: 'Offline Mission Control calendar events queued for sync',
  backgroundColor: '#06b6d4',
  foregroundColor: '#ffffff',
  accessRole: 'owner',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  selected: true,
  hidden: false,
  primary: false,
  editable: true,
  syncEnabled: true,
}

function defaultRange(date: Date, view: CalendarView) {
  if (view === 'month') {
    return {
      from: formatISO(startOfWeek(startOfMonth(date), { weekStartsOn: 1 })),
      to: formatISO(endOfWeek(endOfMonth(date), { weekStartsOn: 1 })),
    }
  }

  if (view === 'day') {
    const start = startOfDay(date)
    return { from: formatISO(start), to: formatISO(addDays(start, 1)) }
  }

  if (view === 'four_day') {
    const start = startOfDay(date)
    return { from: formatISO(start), to: formatISO(addDays(start, 4)) }
  }

  if (view === 'week' || view === 'agenda') {
    const start = subDays(startOfDay(date), 1)
    return { from: formatISO(start), to: formatISO(addDays(start, 7)) }
  }

  const start = startOfWeek(date, { weekStartsOn: 1 })
  return { from: formatISO(start), to: formatISO(addDays(start, 7)) }
}

function bufferedRange(range: { from: string; to: string }) {
  return {
    from: formatISO(subDays(new Date(range.from), BUFFER_DAYS)),
    to: formatISO(addDays(new Date(range.to), BUFFER_DAYS)),
  }
}

function rangeWithin(inner: { from: string; to: string }, outer: { from: string; to: string }) {
  return new Date(inner.from).getTime() >= new Date(outer.from).getTime()
    && new Date(inner.to).getTime() <= new Date(outer.to).getTime()
}

// Google calendar ids efectivos para un set de sources seleccionados (sin el local).
function calendarIdsFor(sources: CalendarSource[], selectedIds: string[]) {
  return sources
    .filter((source) => selectedIds.includes(source.id))
    .filter((source) => source.googleCalendarId !== LOCAL_SOURCE.googleCalendarId)
    .map((source) => source.googleCalendarId)
}

function calendarIdsKey(ids: string[]) {
  return [...ids].sort().join(',')
}

function readSelectedSources() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SELECTED_SOURCES_KEY)
    return raw ? JSON.parse(raw) as string[] : null
  } catch {
    return null
  }
}

function writeSelectedSources(ids: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SELECTED_SOURCES_KEY, JSON.stringify(ids))
}

type SourceColorOverride = {
  backgroundColor: string
  foregroundColor: string
}

function readSourceColorOverrides() {
  if (typeof window === 'undefined') return {} as Record<string, SourceColorOverride>
  try {
    const raw = window.localStorage.getItem(SOURCE_COLOR_OVERRIDES_KEY)
    return raw ? JSON.parse(raw) as Record<string, SourceColorOverride> : {}
  } catch {
    return {}
  }
}

function writeSourceColorOverrides(overrides: Record<string, SourceColorOverride>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SOURCE_COLOR_OVERRIDES_KEY, JSON.stringify(overrides))
}

function normalizeHexColor(value: string) {
  const color = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split('').map((char) => `${char}${char}`).join('')}`.toLowerCase()
  }
  return null
}

function foregroundForColor(backgroundColor: string) {
  const color = normalizeHexColor(backgroundColor) ?? '#8b5cf6'
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000
  return luminance > 160 ? '#0f172a' : '#ffffff'
}

function withLocalSource(sources: CalendarSource[]) {
  if (sources.some((source) => source.id === LOCAL_SOURCE.id)) return sources
  return [...sources, LOCAL_SOURCE]
}

// Fuente UNICA de color para las calendar sources: paleta de marca (calendarColorFor)
// con override del usuario por source.id. Ignora el backgroundColor crudo de Google
// (que en desktop llega gris/distinto), asi el dot del panel, el picker y el dropdown
// del editor coinciden con el color de los eventos.
function applyCalendarColors(sources: CalendarSource[]) {
  const overrides = readSourceColorOverrides()
  return sources.map((source) => {
    const override = overrides[source.id]
    if (override) return { ...source, ...override }
    // El workspace local conserva su cyan distintivo (eventos offline en cola).
    if (source.googleCalendarId === LOCAL_SOURCE.googleCalendarId) return source
    const brand = calendarColorFor(source.summary)
    return { ...source, backgroundColor: brand.backgroundColor, foregroundColor: brand.foregroundColor }
  })
}

// Color deterministico por nombre de calendario (paleta de marca en lib/calendar/colors),
// con override del usuario por source.id. NO depende del array `sources` (que lo pisan
// 3 fetches con colores distintos de Google/mirror) -> no parpadea.
function colorEvents(events: CalendarEvent[]) {
  const overrides = readSourceColorOverrides()
  return events.map((event) => {
    if (event.kind === 'task_due' || !event.googleCalendarId) return event
    const override = overrides[`${event.accountEmail ?? ''}:${event.googleCalendarId}`]
    const brand = calendarColorFor(event.calendarName)
    return {
      ...event,
      color: override?.backgroundColor ?? brand.backgroundColor,
      textColor: override?.foregroundColor ?? brand.foregroundColor,
    }
  })
}

// Si el refetch trae exactamente lo mismo que ya esta en pantalla, conservar la
// IDENTIDAD del array: cero re-render de FullCalendar, cero parpadeo.
function keepIfIdentical(prev: CalendarEvent[], next: CalendarEvent[]) {
  if (prev.length !== next.length) return next
  const fingerprint = (events: CalendarEvent[]) =>
    events.map((e) => `${e.id}|${e.start}|${e.end}|${e.title}|${e.color}|${e.allDay}`).sort().join(';')
  return fingerprint(prev) === fingerprint(next) ? prev : next
}

function mergeCalendarEvents(cloudEvents: CalendarEvent[], localEvents: CalendarEvent[]) {
  const pendingLocalEvents = localEvents.filter((event) => event.status !== 'synced')
  const localIds = new Set(pendingLocalEvents.map((event) => event.id))
  const localGoogleIds = new Set(pendingLocalEvents.map((event) => event.googleEventId).filter(Boolean))
  return [
    ...pendingLocalEvents,
    ...cloudEvents.filter((event) => !localIds.has(event.id) && !localGoogleIds.has(event.googleEventId)),
  ]
}

function mergeCachedCalendarEvents(cachedEvents: CalendarEvent[], localEvents: CalendarEvent[]) {
  const localIds = new Set(localEvents.map((event) => event.id))
  const localGoogleIds = new Set(localEvents.map((event) => event.googleEventId).filter(Boolean))
  return [
    ...localEvents,
    ...cachedEvents.filter((event) => !localIds.has(event.id) && !localGoogleIds.has(event.googleEventId)),
  ]
}

function eventOverlapsRange(event: CalendarEvent, range: { from: string; to: string }) {
  const start = new Date(event.start).getTime()
  const end = new Date(event.end || event.start).getTime()
  const from = new Date(range.from).getTime()
  const to = new Date(range.to).getTime()
  if ([start, end, from, to].some((value) => Number.isNaN(value))) return false
  return start < to && end > from
}

type CalendarEventsSnapshot = {
  range?: { from: string; to: string }
  events?: CalendarEvent[]
}

async function readLocalEvents(range: { from: string; to: string }) {
  return listLocalEvents(range.from, range.to)
    .then((events) => events.map(localEventToCalendarEvent))
    .catch(() => [])
}

async function readCachedEvents(range: { from: string; to: string }) {
  const snapshots = await Promise.all([
    getCachedSnapshot<CalendarEventsSnapshot>('calendar:last-range').catch(() => null),
    getCachedSnapshot<CalendarEventsSnapshot>('calendar:last-sync').catch(() => null),
  ])

  for (const snapshot of snapshots) {
    const events = snapshot?.events?.filter((event) => eventOverlapsRange(event, range)) ?? []
    if (events.length > 0) return events
  }

  return []
}

async function readOfflineEvents(range: { from: string; to: string }) {
  const [localEvents, cachedEvents] = await Promise.all([
    readLocalEvents(range),
    readCachedEvents(range),
  ])
  return mergeCachedCalendarEvents(cachedEvents, localEvents)
}

export function useCalendarCommandCenter() {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [view, setView] = useState<CalendarView>('week')
  const [sources, setSources] = useState<CalendarSource[]>([])
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncHealth, setSyncHealth] = useState<CalendarSyncHealth>({ state: 'idle' })
  const [range, setRange] = useState(() => defaultRange(new Date(), 'week'))
  const [colorVersion, setColorVersion] = useState(0)
  const initializedSources = useRef(false)
  // Secuenciador compartido de fetch/sync: solo la respuesta MAS reciente puede
  // tocar estado. Sin esto, swipes rapidos (un nudge cada ~90ms) dejaban aterrizar
  // respuestas viejas que pisaban a las nuevas -> eventos desaparecian/reaparecian.
  const fetchSeqRef = useRef(0)
  // Ultima ventana buffered que aterrizo con exito (+ calendarios + timestamp).
  const loadedRef = useRef<{ range: { from: string; to: string }; idsKey: string; at: number } | null>(null)

  const selectedSources = useMemo(
    () => sources.filter((source) => selectedSourceIds.includes(source.id)),
    [sources, selectedSourceIds]
  )

  const editableSources = useMemo(
    () => selectedSources.filter((source) => source.editable),
    [selectedSources]
  )

  const defaultEditableSource = editableSources[0] ?? sources.find((source) => source.editable)

  const fetchSources = useCallback(async () => {
    const cachedSources = await getCachedSnapshot<CalendarSource[]>('calendar:sources').catch(() => null)
    const hasCachedSources = Boolean(cachedSources?.length)
    if (cachedSources?.length) {
      const nextSources = applyCalendarColors(withLocalSource(cachedSources))
      setSources(nextSources)

      if (!initializedSources.current) {
        initializedSources.current = true
        const saved = readSelectedSources()
        const sourceIds = new Set(nextSources.map((source) => source.id))
        const validSaved = saved?.filter((id) => sourceIds.has(id))
        const defaults = nextSources.filter((source) => source.selected && !source.hidden).map((source) => source.id)
        setSelectedSourceIds(validSaved?.length ? validSaved : defaults)
      }
    }

    const res = await fetch('/api/calendar/sources', { cache: 'no-store' }).catch((error: unknown) => {
      if (hasCachedSources) {
        setSyncHealth({
          state: 'stale',
          message: error instanceof Error ? error.message : 'Calendar sources loaded from local cache',
        })
        return null
      }
      throw error
    })
    if (!res) return

    const data = await res.json() as { sources?: CalendarSource[]; syncHealth?: CalendarSyncHealth }
    const nextSources = applyCalendarColors(withLocalSource(data.sources ?? []))
    setSources(nextSources)
    if (data.syncHealth) setSyncHealth(data.syncHealth)

    if (!initializedSources.current) {
      initializedSources.current = true
      const saved = readSelectedSources()
      const sourceIds = new Set(nextSources.map((source) => source.id))
      const validSaved = saved?.filter((id) => sourceIds.has(id))
      const defaults = nextSources.filter((source) => source.selected && !source.hidden).map((source) => source.id)
      setSelectedSourceIds(validSaved?.length ? validSaved : defaults)
    }
  }, [])

  const fetchEvents = useCallback(async (nextRange = range, nextSelectedIds = selectedSourceIds) => {
    const seq = ++fetchSeqRef.current
    // Toda la ventana se pide buffered (visible +-7 dias): el endpoint es
    // mirror-backed (Supabase), ampliar el rango es barato y FullCalendar recorta.
    const fetchRange = bufferedRange(nextRange)
    const offlineEvents = await readOfflineEvents(fetchRange)
    if (seq !== fetchSeqRef.current) return
    // Pre-paint offline SOLO en cold start (sin eventos en memoria). En navegacion
    // entre dias ya hay eventos validos: pintar el snapshot intermedio re-montaba
    // todo el DOM dos veces por nudge y causaba flashes de columnas fantasma.
    if (offlineEvents.length > 0) {
      setEvents((prev) => (prev.length > 0 ? prev : offlineEvents))
    }
    setLoading(false)

    const params = new URLSearchParams({ from: fetchRange.from, to: fetchRange.to })
    const selectedCalendarIds = calendarIdsFor(sources, nextSelectedIds)
    for (const calendarId of selectedCalendarIds) params.append('calendarId', calendarId)

    try {
      const res = await fetch(`/api/calendar/events?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json() as { events?: CalendarEvent[]; sources?: CalendarSource[]; syncHealth?: CalendarSyncHealth }
      const localEvents = await readLocalEvents(fetchRange)
      if (seq !== fetchSeqRef.current) return
      const cloudEvents = data.events ?? []
      setEvents((prev) => keepIfIdentical(prev, mergeCalendarEvents(cloudEvents, localEvents)))
      cacheSnapshot('calendar', 'calendar:last-range', { range: fetchRange, events: cloudEvents }).catch(() => {})
      loadedRef.current = { range: fetchRange, idsKey: calendarIdsKey(selectedCalendarIds), at: Date.now() }
      if (data.sources?.length) setSources(applyCalendarColors(withLocalSource(data.sources)))
      if (data.syncHealth) setSyncHealth(data.syncHealth)
    } catch (error) {
      if (seq !== fetchSeqRef.current) return
      loadedRef.current = null
      const localEvents = offlineEvents.length > 0 ? offlineEvents : await readOfflineEvents(fetchRange)
      if (seq !== fetchSeqRef.current) return
      setSyncHealth({
        state: localEvents.length ? 'stale' : 'error',
        message: localEvents.length
          ? 'Showing local workspace calendar snapshot'
          : error instanceof Error ? error.message : 'Failed to load calendar',
      })
      setEvents(localEvents)
    } finally {
      setLoading(false)
    }
  }, [range, selectedSourceIds, sources])

  const refresh = useCallback(async () => {
    const seq = ++fetchSeqRef.current
    const fetchRange = bufferedRange(range)
    setSyncing(true)
    try {
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fetchRange.from,
          to: fetchRange.to,
          calendarIds: selectedSources.map((source) => source.googleCalendarId),
        }),
      })
      const data = await res.json() as { events?: CalendarEvent[]; sources?: CalendarSource[]; syncHealth?: CalendarSyncHealth }
      const localEvents = await readLocalEvents(fetchRange)
      if (seq !== fetchSeqRef.current) return
      const cloudEvents = data.events ?? []
      setEvents((prev) => keepIfIdentical(prev, mergeCalendarEvents(cloudEvents, localEvents)))
      cacheSnapshot('calendar', 'calendar:last-sync', { range: fetchRange, events: cloudEvents }).catch(() => {})
      loadedRef.current = {
        range: fetchRange,
        idsKey: calendarIdsKey(calendarIdsFor(sources, selectedSourceIds)),
        at: Date.now(),
      }
      if (data.sources?.length) setSources(applyCalendarColors(withLocalSource(data.sources)))
      if (data.syncHealth) setSyncHealth(data.syncHealth)
    } catch (error) {
      if (seq !== fetchSeqRef.current) return
      loadedRef.current = null
      const localEvents = await readOfflineEvents(fetchRange)
      if (seq !== fetchSeqRef.current) return
      setEvents(localEvents)
      setSyncHealth({
        state: localEvents.length ? 'stale' : 'error',
        message: localEvents.length
          ? 'Sync unavailable; showing local workspace calendar'
          : error instanceof Error ? error.message : 'Calendar sync failed',
      })
    } finally {
      setSyncing(false)
    }
  }, [range, selectedSources, selectedSourceIds, sources])

  const toggleSource = useCallback((sourceId: string) => {
    setSelectedSourceIds((prev) => {
      const next = prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId]
      writeSelectedSources(next)
      fetchEvents(range, next)
      return next
    })
  }, [fetchEvents, range])

  const updateSourceColor = useCallback((sourceId: string, color: string) => {
    const backgroundColor = normalizeHexColor(color)
    if (!backgroundColor) return
    const foregroundColor = foregroundForColor(backgroundColor)

    setSources((prev) => {
      const next = prev.map((source) => (
        source.id === sourceId
          ? { ...source, backgroundColor, foregroundColor }
          : source
      ))
      const overrides = readSourceColorOverrides()
      writeSourceColorOverrides({
        ...overrides,
        [sourceId]: { backgroundColor, foregroundColor },
      })
      cacheSnapshot('calendar', 'calendar:sources', next).catch(() => {})
      return next
    })
    setColorVersion((version) => version + 1)
  }, [])

  const setCalendarRange = useCallback((from: string, to: string) => {
    const next = { from, to }
    setRange(next)
    // Navegacion dentro del buffer cargado con los mismos calendarios y datos
    // frescos: cero fetch, cero cambio de identidad del array de eventos ->
    // FullCalendar solo mueve la ventana visible, sin re-render del event source.
    const loaded = loadedRef.current
    if (
      loaded
      && loaded.idsKey === calendarIdsKey(calendarIdsFor(sources, selectedSourceIds))
      && rangeWithin(next, loaded.range)
      && Date.now() - loaded.at < BUFFER_REVALIDATE_MS
    ) {
      return
    }
    fetchEvents(next)
  }, [fetchEvents, sources, selectedSourceIds])

  useEffect(() => {
    let cancelled = false

    async function hydrateOfflineEvents() {
      const [cachedSources, offlineEvents] = await Promise.all([
        getCachedSnapshot<CalendarSource[]>('calendar:sources').catch(() => null),
        readOfflineEvents(range),
      ])
      if (cancelled) return

      const nextSources = cachedSources?.length
        ? applyCalendarColors(withLocalSource(cachedSources))
        : []
      if (nextSources.length > 0) setSources(nextSources)
      if (offlineEvents.length > 0) {
        setEvents(offlineEvents)
        setLoading(false)
      }
    }

    hydrateOfflineEvents().catch(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
    // Initial local hydration should happen before source initialization gates network fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchSources().catch((error) => {
      setSources([LOCAL_SOURCE])
      setSelectedSourceIds([LOCAL_SOURCE.id])
      setSyncHealth({ state: 'stale', message: error instanceof Error ? `Local calendar only: ${error.message}` : 'Local calendar only' })
      setLoading(false)
    })
  }, [fetchSources])

  useEffect(() => {
    if (initializedSources.current && selectedSourceIds.length > 0) {
      fetchEvents()
    }
    // Fetch is intentionally driven after source initialization/selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceIds.length])

  useEffect(() => {
    const onFocus = () => {
      if (!syncHealth.lastSyncedAt) return
      const age = Date.now() - new Date(syncHealth.lastSyncedAt).getTime()
      if (age > STALE_REFRESH_MS) refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh, syncHealth.lastSyncedAt])

  const filteredEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return events
    return events.filter((event) => {
      return [
        event.title,
        event.description,
        event.location,
        event.calendarName,
        event.attendees?.map((a) => a.email).join(' '),
      ].filter(Boolean).join(' ').toLowerCase().includes(normalized)
    })
  }, [events, query])

  const coloredEvents = useMemo(
    () => colorEvents(filteredEvents),
    // colorVersion bumps when the user changes a source color so events repaint.
    // Intentionally NOT depending on `sources` -> kills the gog/mirror color race flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredEvents, colorVersion]
  )

  return {
    currentDate,
    setCurrentDate,
    view,
    setView,
    sources,
    selectedSourceIds,
    selectedSources,
    editableSources,
    defaultEditableSource,
    toggleSource,
    updateSourceColor,
    events: coloredEvents,
    query,
    setQuery,
    loading,
    syncing,
    syncHealth,
    range,
    setCalendarRange,
    refresh,
    reloadEvents: () => fetchEvents(),
  }
}
