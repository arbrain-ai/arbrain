'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import {
  AlignLeft,
  Archive,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  Video,
  X,
} from 'lucide-react'
import { addDays, addHours, format, startOfDay, subDays } from 'date-fns'
import { useCalendarCommandCenter } from '../hooks/useCalendarCommandCenter'
import { useCronCalendarLayer } from '../hooks/useCronCalendarLayer'
import { CronRail, CronQuickView, type CronQuickViewState } from './CronRail'
import { CronHistoryPanel } from './CronHistoryPanel'
import { EventEditor, type EventEditorDraft } from './EventEditor'
import { TaskDetailPanel } from '@/features/tasks/components'
import { useTasks } from '@/features/tasks/hooks/useTasks'
import { useTasksStore } from '@/shared/stores/tasks-store'
import { PRIORITY_CONFIG } from '@/features/tasks/utils/priority'
import { upsertLocalTask } from '@/lib/local-first'
import type { CalendarEvent, CalendarSource, CalendarView } from '../types'
import type { TaskWithAssignees } from '@/types/database'

interface QuickViewState {
  event: CalendarEvent
  x: number
  y: number
}

const VIEW_TO_FULLCALENDAR: Record<CalendarView, string> = {
  day: 'timeGridDay',
  four_day: 'timeGridFourDay',
  week: 'timeGridRollingWeek',
  month: 'dayGridMonth',
  agenda: 'listRollingWeek',
}

const FULLCALENDAR_TO_VIEW: Record<string, CalendarView> = {
  timeGridDay: 'day',
  timeGridFourDay: 'four_day',
  timeGridRollingWeek: 'week',
  dayGridMonth: 'month',
  listRollingWeek: 'agenda',
}

const MAX_DAILY_OBJECTIVES_PER_DAY = 2

function rollingSevenDayRange(currentDate: Date) {
  const start = subDays(startOfDay(currentDate), 1)
  return {
    start,
    end: addDays(start, 7),
  }
}

function nowScrollTime() {
  const now = new Date()
  const hour = Math.max(5, now.getHours() - 1)
  return `${String(hour).padStart(2, '0')}:00:00`
}

// Para eventos all-day, FullCalendar entrega Date a medianoche LOCAL. Usar toISOString()
// lo convierte a UTC y desfasa el dia (ej. UTC+2 -> el dia anterior), por lo que gog --all-day
// persistia mal y el evento "se regresaba". Para all-day mandamos fecha local YYYY-MM-DD.
function eventTimesFromArg(
  arg: { event: { start: Date | null; end: Date | null; allDay: boolean } },
  fallback: CalendarEvent,
): { start: string; end: string } {
  const fcStart = arg.event.start
  const fcEnd = arg.event.end
  if (arg.event.allDay) {
    return {
      start: fcStart ? format(fcStart, 'yyyy-MM-dd') : fallback.start,
      end: fcEnd
        ? format(fcEnd, 'yyyy-MM-dd')
        : fcStart ? format(addDays(fcStart, 1), 'yyyy-MM-dd') : fallback.end,
    }
  }
  return {
    start: fcStart?.toISOString() ?? fallback.start,
    end: fcEnd?.toISOString() ?? fcStart?.toISOString() ?? fallback.end,
  }
}

function toFullCalendarEvent(event: CalendarEvent): EventInput {
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.kind === 'daily_objective' ? true : event.allDay,
    editable: event.editable,
    backgroundColor: event.color ?? undefined,
    borderColor: event.kind === 'task_due' ? '#683acc' : event.color ?? undefined,
    textColor: event.textColor ?? undefined,
    extendedProps: event,
    classNames: [
      `mc-cal-event-${event.kind}`,
      event.editable ? 'mc-cal-event-editable' : 'mc-cal-event-readonly',
      // Runs pasados: clase de estado -> punto verde (ok) / rojo (fallo) / ambar
      // (pending) a la izquierda, via CSS. Distingue exito/fallo aunque el color
      // del bloque sea el de la categoria (ej. YouTube tambien es rojo).
      ...(event.kind === 'cron_run' && event.cronRunStatus
        ? [`mc-cal-cron-${event.cronRunStatus}`]
        : []),
    ],
  }
}

function eventFromArg(arg: EventClickArg | EventDropArg | EventResizeDoneArg): CalendarEvent | null {
  return (arg.event.extendedProps ?? null) as CalendarEvent | null
}

function askRecurrenceScope(event: CalendarEvent): 'single' | 'future' | 'all' | undefined {
  if (!event.recurringEventId) return undefined
  const answer = window.prompt(
    `This is a recurring event. Type one scope:\n\nsingle = this event only\nfuture = this and following\nall = all events in the series`,
    'single'
  )
  if (answer === 'future' || answer === 'all') return answer
  return 'single'
}

function visibleRangeEnd(to: string) {
  return new Date(new Date(to).getTime() - 1)
}

function scheduleMatchKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function eventDayKey(event: CalendarEvent) {
  const date = new Date(event.start)
  if (!Number.isNaN(date.getTime())) return format(date, 'yyyy-MM-dd')
  return event.start.slice(0, 10)
}

function visibleCalendarGridEvents(events: CalendarEvent[]) {
  const dailyObjectiveCount = new Map<string, number>()

  return events.filter((event) => {
    if (event.kind === 'task_due') return false
    if (event.kind !== 'daily_objective') return true

    const key = eventDayKey(event)
    const count = dailyObjectiveCount.get(key) ?? 0
    if (count >= MAX_DAILY_OBJECTIVES_PER_DAY) return false

    dailyObjectiveCount.set(key, count + 1)
    return true
  })
}

function formatRangeTitle(date: Date, view: CalendarView, range?: { from: string; to: string }) {
  const rangeStart = range ? new Date(range.from) : date
  const rangeEnd = range ? visibleRangeEnd(range.to) : date

  if (view === 'day') return format(rangeStart, 'EEEE, MMM d')
  if (view === 'four_day') return `${format(rangeStart, 'MMM d')} - ${format(rangeEnd, 'MMM d')}`
  if (view === 'month') return format(date, 'MMMM yyyy')
  if (view === 'agenda') return `Agenda · ${format(rangeStart, 'MMM d')} - ${format(rangeEnd, 'MMM d')}`
  return `${format(rangeStart, 'MMM d')} - ${format(rangeEnd, 'MMM d, yyyy')}`
}

export function CalendarCommandCenter() {
  useTasks()
  const calendarRef = useRef<FullCalendar | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const scrollShellRef = useRef<HTMLDivElement | null>(null)
  const horizontalWheelDelta = useRef(0)
  const lastHorizontalNavigation = useRef(0)
  const [draft, setDraft] = useState<EventEditorDraft | null>(null)
  const [quickView, setQuickView] = useState<QuickViewState | null>(null)
  const [lastDeletedEvent, setLastDeletedEvent] = useState<CalendarEvent | null>(null)
  const [undoingDelete, setUndoingDelete] = useState(false)
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false)
  const [taskRailOpen, setTaskRailOpen] = useState(false)
  // Cron Lens: con el lente abierto, el grid muestra SOLO actividad de agentes
  // (eventos de Google y tasks ocultos). Mutuamente excluyente con el Task rail.
  const [cronLensOpen, setCronLensOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)
  const controlsRef = useRef<HTMLDivElement | null>(null)
  const [cronQuickView, setCronQuickView] = useState<CronQuickViewState | null>(null)
  const [cronHistoryJobId, setCronHistoryJobId] = useState<string | null>(null)
  const tasks = useTasksStore((s) => s.tasks)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const selectTask = useTasksStore((s) => s.selectTask)
  const updateTask = useTasksStore((s) => s.updateTask)
  const [archivingTaskIds, setArchivingTaskIds] = useState<Set<string>>(() => new Set())

  const calendar = useCalendarCommandCenter()
  const cronLayer = useCronCalendarLayer(calendar.range, cronLensOpen)
  const calendarGridEvents = useMemo(() => visibleCalendarGridEvents(calendar.events), [calendar.events])
  const scheduledTaskBlocks = useMemo(() => {
    const blocks = new Map<string, CalendarEvent>()
    const taskIdsByTitle = new Map(tasks.map((task) => [scheduleMatchKey(task.title), task.id]))

    for (const event of calendar.events) {
      const linkedTaskId = event.kind === 'task_scheduled_block' && event.taskId
        ? event.taskId
        : !event.allDay
          ? taskIdsByTitle.get(scheduleMatchKey(event.title))
          : null

      if (!linkedTaskId) continue
      const current = blocks.get(linkedTaskId)
      if (!current || event.start.localeCompare(current.start) < 0) {
        blocks.set(linkedTaskId, event)
      }
    }
    return blocks
  }, [calendar.events, tasks])
  // Tasks del board con due_at -> bloques en el grid (la columna vertebral como lente).
  // Con hora => bloque temporizado de 30 min; sin hora (medianoche) => chip all-day.
  // El click ya esta cableado (handleEventClick abre el detalle de la task).
  const taskDueEvents = useMemo<CalendarEvent[]>(() => {
    return tasks
      .filter((t) => t.due_at && t.status !== 'archived' && t.status !== 'done')
      .map((t) => {
        const due = new Date(t.due_at!)
        const hasTime = !Number.isNaN(due.getTime()) && (due.getHours() !== 0 || due.getMinutes() !== 0)
        const end = hasTime ? new Date(due.getTime() + 30 * 60 * 1000).toISOString() : t.due_at!
        return {
          id: `task-${t.id}`,
          title: t.title,
          start: t.due_at!,
          end,
          allDay: !hasTime,
          editable: false,
          kind: 'task_due' as const,
          account: 'tasks' as const,
          taskId: t.id,
          color: '#683acc',
          textColor: '#ffffff',
        }
      })
  }, [tasks])
  // Modo lente: Crons abierto = SOLO eventos cron; cerrado = calendario normal + tasks.
  const fcEvents = useMemo(
    () => (cronLensOpen ? cronLayer.cronEvents : [...calendarGridEvents, ...taskDueEvents]).map(toFullCalendarEvent),
    [cronLensOpen, cronLayer.cronEvents, calendarGridEvents, taskDueEvents]
  )
  // El editor solo debe ofrecer calendarios que el usuario tiene activados (selectedSources)
  // y que son editables. Al editar, se incluye el calendario propio del evento aunque este
  // deseleccionado, para no moverlo de calendario sin querer.
  const editorSources = useMemo(() => {
    const selectable = calendar.selectedSources.filter((source) => source.editable)
    const ev = draft?.event
    if (ev) {
      const present = selectable.some((s) => s.accountEmail === ev.accountEmail && s.googleCalendarId === ev.googleCalendarId)
      if (!present) {
        const own = calendar.sources.find((s) => s.accountEmail === ev.accountEmail && s.googleCalendarId === ev.googleCalendarId)
        if (own) return [own, ...selectable]
      }
    }
    return selectable
  }, [calendar.selectedSources, calendar.sources, draft])

  const api = () => calendarRef.current?.getApi()

  const changeView = useCallback((view: CalendarView) => {
    calendar.setView(view)
    api()?.changeView(VIEW_TO_FULLCALENDAR[view])
  }, [calendar])

  const goToday = useCallback(() => {
    const instance = api()
    instance?.today()
    calendar.setCurrentDate(new Date())
  }, [calendar])

  const goPrev = useCallback(() => {
    const instance = api()
    instance?.prev()
    if (instance) calendar.setCurrentDate(instance.getDate())
  }, [calendar])

  const goNext = useCallback(() => {
    const instance = api()
    instance?.next()
    if (instance) calendar.setCurrentDate(instance.getDate())
  }, [calendar])

  const nudgeDays = useCallback((days: number) => {
    const instance = api()
    instance?.incrementDate({ days })
    if (instance) calendar.setCurrentDate(instance.getDate())
  }, [calendar])

  const openNewEvent = useCallback(() => {
    const start = new Date()
    start.setMinutes(0, 0, 0)
    const end = addHours(start, 1)
    setDraft({
      mode: 'create',
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
    })
  }, [])

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    const nextView = FULLCALENDAR_TO_VIEW[arg.view.type] ?? calendar.view
    calendar.setView(nextView)
    calendar.setCurrentDate(arg.view.calendar.getDate())
    calendar.setCalendarRange(arg.start.toISOString(), arg.end.toISOString())
  }, [calendar])

  const handleSelect = useCallback((arg: DateSelectArg) => {
    setDraft({
      mode: 'create',
      start: arg.startStr,
      end: arg.endStr,
      allDay: arg.allDay,
    })
    arg.view.calendar.unselect()
  }, [])

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const event = eventFromArg(arg)
    if (!event) return
    if (event.kind === 'task_due' && event.taskId) {
      selectTask(event.taskId)
      return
    }
    if (event.kind === 'cron_run' || event.kind === 'cron_scheduled') {
      setCronQuickView({
        event,
        x: arg.jsEvent.clientX,
        y: arg.jsEvent.clientY,
      })
      return
    }
    setQuickView({
      event,
      x: arg.jsEvent.clientX,
      y: arg.jsEvent.clientY,
    })
  }, [selectTask])

  const deleteCalendarEvent = useCallback(async (event: CalendarEvent) => {
    if (!event.googleEventId || !event.accountEmail || !event.googleCalendarId || event.kind === 'task_due' || event.kind === 'read_only') {
      window.alert(event.kind === 'task_due'
        ? 'This is a Board due-date marker. Delete or edit the task due date from the Board.'
        : 'This event cannot be deleted from Mission Control because Google Calendar exposes it as read-only.')
      return
    }

    const recurrenceScope = askRecurrenceScope(event)
    const res = await fetch(`/api/calendar/events/${encodeURIComponent(event.googleEventId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountEmail: event.accountEmail,
        googleCalendarId: event.googleCalendarId,
        recurrenceScope,
        originalStart: event.originalStart ?? undefined,
        sendUpdates: 'none',
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      window.alert(data.error ?? 'Failed to delete Google Calendar event')
      return
    }

    setLastDeletedEvent(event)
    setQuickView(null)
    calendar.refresh()
  }, [calendar])

  const restoreDeletedEvent = useCallback(async () => {
    const event = lastDeletedEvent
    if (!event?.accountEmail || !event.googleCalendarId) return

    setUndoingDelete(true)
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountEmail: event.accountEmail,
          googleCalendarId: event.googleCalendarId,
          title: event.title,
          start: event.start,
          end: event.end,
          allDay: event.allDay,
          description: event.description ?? undefined,
          location: event.location ?? undefined,
          attendees: event.attendees?.map((attendee) => attendee.email),
          reminders: event.reminders,
          recurrence: event.recurrence,
          sendUpdates: 'none',
          withMeet: Boolean(event.hangoutLink),
          taskId: event.taskId ?? undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to restore event')
      setLastDeletedEvent(null)
      calendar.refresh()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to restore event')
    } finally {
      setUndoingDelete(false)
    }
  }, [calendar, lastDeletedEvent])

  const patchEventTime = useCallback(async (event: CalendarEvent, start: string, end: string, allDay: boolean, revert: () => void) => {
    if (!event.googleEventId || !event.accountEmail || !event.googleCalendarId || event.kind === 'task_due') {
      revert()
      return
    }

    const recurrenceScope = askRecurrenceScope(event)
    const res = await fetch(`/api/calendar/events/${encodeURIComponent(event.googleEventId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountEmail: event.accountEmail,
        googleCalendarId: event.googleCalendarId,
        start,
        end,
        allDay,
        recurrenceScope,
        originalStart: event.originalStart ?? undefined,
        sendUpdates: 'none',
      }),
    })
    if (!res.ok) {
      revert()
      const data = await res.json().catch(() => ({}))
      window.alert(data.error ?? 'Failed to update Google Calendar event')
      return
    }
    calendar.reloadEvents()
  }, [calendar])

  const handleDrop = useCallback((arg: EventDropArg) => {
    const event = eventFromArg(arg)
    if (!event) return arg.revert()
    const { start, end } = eventTimesFromArg(arg, event)
    patchEventTime(event, start, end, arg.event.allDay, arg.revert)
  }, [patchEventTime])

  const handleResize = useCallback((arg: EventResizeDoneArg) => {
    const event = eventFromArg(arg)
    if (!event) return arg.revert()
    const { start, end } = eventTimesFromArg(arg, event)
    patchEventTime(event, start, end, arg.event.allDay, arg.revert)
  }, [patchEventTime])

  // Listener nativo NO pasivo: React delega wheel como passive, asi que
  // event.preventDefault() fallaba ("Unable to preventDefault inside passive
  // event listener" x200 en consola) y el swipe peleaba contra el scroll nativo.
  useEffect(() => {
    const shell = scrollShellRef.current
    if (!shell) return

    const handleWheel = (event: globalThis.WheelEvent) => {
      const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.shiftKey
          ? event.deltaY
          : 0
      if (!horizontalDelta) return

      event.preventDefault()
      horizontalWheelDelta.current += horizontalDelta

      const threshold = event.deltaMode === 1 ? 4 : 85
      const now = performance.now()
      if (Math.abs(horizontalWheelDelta.current) < threshold || now - lastHorizontalNavigation.current < 90) return

      nudgeDays(horizontalWheelDelta.current > 0 ? 1 : -1)
      horizontalWheelDelta.current = 0
      lastHorizontalNavigation.current = now
    }

    shell.addEventListener('wheel', handleWheel, { passive: false })
    return () => shell.removeEventListener('wheel', handleWheel)
  }, [nudgeDays])

  // FullCalendar solo recalcula el ancho de columnas en `window resize`. Hay dos casos
  // que NO disparan ese resize y dejaban el grid con un ancho stale -> overflow-x-hidden
  // recortaba las columnas de la derecha:
  //   1. El contenedor cambia de ancho (colapsar/expandir sidebar, togglear paneles).
  //   2. Cambia el zoom de UI (--ui-zoom, Cmd +/-). El shell esta counter-zoomeado a
  //      efectivo 1.0 (ver globals.css), asi que al cambiar el zoom su ancho en px de
  //      layout cambia y FullCalendar debe redistribuir columnas.
  // ResizeObserver cubre (1) y casi siempre (2); el MutationObserver sobre <html>.style
  // garantiza el recalculo en cambios de zoom y en la carrera de montaje inicial.
  useEffect(() => {
    const shell = scrollShellRef.current
    if (!shell || typeof ResizeObserver === 'undefined') return

    let raf = 0
    const refresh = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => calendarRef.current?.getApi().updateSize())
    }

    const resizeObserver = new ResizeObserver(refresh)
    resizeObserver.observe(shell)

    const zoomObserver = new MutationObserver(refresh)
    zoomObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      zoomObserver.disconnect()
    }
  }, [])

  const scheduleTask = useCallback((task: TaskWithAssignees) => {
    const base = task.due_at ? new Date(task.due_at) : new Date()
    const start = Number.isNaN(base.getTime()) ? new Date() : base
    if (start.getHours() === 0 && start.getMinutes() === 0) {
      const now = new Date()
      start.setHours(Math.max(9, now.getHours()), 0, 0, 0)
    }
    const end = addHours(start, 1)
    setDraft({
      mode: 'create',
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      task: { id: task.id, title: task.title },
    })
  }, [])

  const archiveTask = useCallback(async (task: TaskWithAssignees) => {
    const previousStatus = task.status
    setArchivingTaskIds((prev) => new Set(prev).add(task.id))
    updateTask(task.id, { status: 'archived' })
    if (selectedTaskId === task.id) selectTask(null)

    try {
      const isLocalTask = task.id.startsWith('local_task_') || task.sequence_number === 0
      if (isLocalTask) {
        await upsertLocalTask({
          id: task.id,
          cloudId: task.id.startsWith('local_task_') ? null : task.id,
          title: task.title,
          description: task.description ?? null,
          status: 'archived',
          priority: task.priority ?? 0,
          dueAt: task.due_at ?? null,
          assigneeId: task.assignees?.[0]?.id ?? null,
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          syncStatus: 'queued',
        }, true)
      } else {
        const res = await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: task.id, status: 'archived' }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to archive task')
      }
    } catch (error) {
      updateTask(task.id, { status: previousStatus })
      window.alert(error instanceof Error ? error.message : 'Failed to archive task')
    } finally {
      setArchivingTaskIds((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }, [selectTask, selectedTaskId, updateTask])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && lastDeletedEvent) {
        event.preventDefault()
        restoreDeletedEvent()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        calendar.refresh()
        return
      }

      if (event.key === 'Escape') {
        // El editor de evento es el overlay mas "modal": Esc lo cierra aunque el
        // foco este en un input (esto va ANTES del bailout de INPUT/TEXTAREA de abajo).
        if (draft) {
          event.preventDefault()
          setDraft(null)
          return
        }
        if (quickView) {
          event.preventDefault()
          setQuickView(null)
          return
        }
        if (cronHistoryJobId) {
          event.preventDefault()
          setCronHistoryJobId(null)
          return
        }
        if (cronQuickView) {
          event.preventDefault()
          setCronQuickView(null)
          return
        }
        if (sourcePanelOpen) {
          event.preventDefault()
          setSourcePanelOpen(false)
          return
        }
        if (cronLensOpen) {
          event.preventDefault()
          setCronLensOpen(false)
          return
        }
      }

      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
      if (draft) return

      if ((event.key === 'Delete' || event.key === 'Backspace') && quickView) {
        event.preventDefault()
        deleteCalendarEvent(quickView.event)
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'd') { event.preventDefault(); changeView('day') }
      else if (key === 'x') { event.preventDefault(); changeView('four_day') }
      else if (key === 'w') { event.preventDefault(); changeView('week') }
      else if (key === 'm') { event.preventDefault(); changeView('month') }
      else if (key === 'a') { event.preventDefault(); changeView('agenda') }
      else if (key === 't') { event.preventDefault(); goToday() }
      else if (key === 'n') { event.preventDefault(); openNewEvent() }
      else if (key === 'r') { event.preventDefault(); calendar.refresh() }
      else if (key === '/') { event.preventDefault(); searchRef.current?.focus() }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); event.shiftKey ? api()?.incrementDate({ days: -1 }) : goPrev() }
      else if (event.key === 'ArrowRight') { event.preventDefault(); event.shiftKey ? api()?.incrementDate({ days: 1 }) : goNext() }
      else if (event.key === '?') {
        event.preventDefault()
        window.alert('Calendar shortcuts: D day, W week, X 4-day, M month, A agenda, T today, N new event, R refresh, / search, arrows navigate, Esc close.')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [calendar, changeView, cronHistoryJobId, cronLensOpen, cronQuickView, deleteCalendarEvent, draft, goNext, goPrev, goToday, lastDeletedEvent, openNewEvent, quickView, restoreDeletedEvent, sourcePanelOpen])

  useEffect(() => {
    if (!controlsOpen) return
    const onDown = (e: MouseEvent) => {
      if (controlsRef.current && !controlsRef.current.contains(e.target as Node)) setControlsOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [controlsOpen])

  const status = calendar.syncHealth.state

  return (
    <div className="calendar-command-center h-full min-h-0 flex flex-col overflow-hidden">
      <div className="relative z-30 px-4 pt-3 pb-2 border-b border-border-subtle bg-background/70 backdrop-blur-xl">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="icon-btn size-9 text-primary">
                <CalendarDays size={17} />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-foreground truncate">
                  {formatRangeTitle(calendar.currentDate, calendar.view, calendar.range)}
                </h1>
                <p className="text-[11px] text-muted truncate">
                  Local calendar mirror · Google sync in the background
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button onClick={goPrev} className="icon-btn size-8" title="Previous"><ChevronLeft size={15} /></button>
              <button onClick={goToday} className="btn-secondary px-3 py-1.5 text-xs">Today</button>
              <button onClick={goNext} className="icon-btn size-8" title="Next"><ChevronRight size={15} /></button>
              <button onClick={openNewEvent} className="btn-primary px-3 py-1.5 text-xs">
                <Plus size={14} />
                New Event
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-border-subtle bg-card/60 overflow-hidden">
              {(['day', 'four_day', 'week', 'month', 'agenda'] as CalendarView[]).map((nextView) => (
                <button
                  key={nextView}
                  onClick={() => changeView(nextView)}
                  className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${calendar.view === nextView ? 'bg-card-active text-foreground' : 'text-muted hover:text-foreground hover:bg-card-hover'}`}
                >
                  {nextView === 'four_day' ? '4 Day' : nextView[0].toUpperCase() + nextView.slice(1)}
                </button>
              ))}
            </div>

            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/70" />
              <input
                ref={searchRef}
                value={calendar.query}
                onChange={(e) => calendar.setQuery(e.target.value)}
                placeholder="Search events, locations, attendees..."
                className="w-full rounded-lg border border-border-subtle bg-card/60 pl-8 pr-3 py-1.5 text-xs text-foreground outline-none placeholder:text-muted/60 focus:border-border-accent"
              />
            </div>

            <div className="relative" ref={controlsRef}>
              <button
                onClick={() => setControlsOpen((v) => !v)}
                className={`btn-secondary px-2.5 py-1.5 text-xs ${controlsOpen ? 'border-border-accent text-foreground' : ''}`}
                title="Paneles y sync"
              >
                <Settings2 size={13} />
                Paneles
                <span
                  className={`ml-0.5 inline-block size-1.5 rounded-full ${status === 'error' ? 'bg-red-400' : status === 'stale' ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                  title={calendar.syncHealth.message ?? undefined}
                />
              </button>
              {controlsOpen && (
                <div className="absolute right-0 top-full z-40 mt-1.5 w-52 rounded-xl border border-border-subtle bg-card p-1.5 shadow-2xl">
                  <button
                    onClick={() => { calendar.refresh(); setControlsOpen(false) }}
                    disabled={calendar.syncing}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-foreground hover:bg-card-hover disabled:opacity-50"
                  >
                    {calendar.syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Sync ahora
                    <span className="ml-auto text-[10px] text-muted">⌘⌥S</span>
                  </button>
                  <div className="my-1 h-px bg-border-subtle" />
                  <button
                    onClick={() => { setSourcePanelOpen((v) => !v); setControlsOpen(false) }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-card-hover ${sourcePanelOpen ? 'text-foreground' : 'text-muted'}`}
                  >
                    <Settings2 size={13} /> Calendars
                    {sourcePanelOpen && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
                  </button>
                  <button
                    onClick={() => { setTaskRailOpen((v) => !v); setCronLensOpen(false); setControlsOpen(false) }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-card-hover ${taskRailOpen ? 'text-foreground' : 'text-muted'}`}
                  >
                    <Sparkles size={13} /> Tasks
                    {taskRailOpen && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
                  </button>
                  <button
                    onClick={() => {
                      setCronLensOpen((v) => {
                        const next = !v
                        if (next) setTaskRailOpen(false)
                        if (!next) setCronQuickView(null)
                        return next
                      })
                      setControlsOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-card-hover ${cronLensOpen ? 'text-emerald-300' : 'text-muted'}`}
                  >
                    <Bot size={13} /> Crons
                    {cronLensOpen && <span className="ml-auto size-1.5 rounded-full bg-emerald-400" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <main className="flex-1 min-w-0 min-h-0 p-3 md:p-4">
          <div className="relative h-full min-h-0 titanium-panel overflow-hidden">
            <div
              ref={scrollShellRef}
              className={`calendar-scroll-shell calendar-scroll-shell-${calendar.view} h-full min-h-0 overflow-x-hidden overflow-y-hidden`}
            >
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                initialView="timeGridRollingWeek"
                initialDate={new Date()}
                views={{
                  timeGridRollingWeek: {
                    type: 'timeGrid',
                    visibleRange: rollingSevenDayRange,
                    dateIncrement: { days: 7 },
                    buttonText: 'week',
                  },
                  listRollingWeek: {
                    type: 'list',
                    visibleRange: rollingSevenDayRange,
                    dateIncrement: { days: 7 },
                    buttonText: 'agenda',
                  },
                  timeGridFourDay: {
                    type: 'timeGrid',
                    duration: { days: 4 },
                    buttonText: '4 day',
                  },
                }}
                headerToolbar={false}
                height="100%"
                allDaySlot
                dayMaxEventRows={4}
                moreLinkClick="popover"
                nowIndicator
                editable
                selectable
                selectMirror
                eventResizableFromStart
                snapDuration="00:15:00"
                slotDuration="00:30:00"
                // Calendario normal: desde las 5 hasta el final del día (la madrugada solo en Cron Lens).
                // Cron Lens: 24h completas — los agentes SI trabajan de madrugada.
                slotMinTime={cronLensOpen ? '00:00:00' : '05:00:00'}
                slotMaxTime="24:00:00"
                scrollTime={nowScrollTime()}
                firstDay={1}
                events={fcEvents}
                datesSet={handleDatesSet}
                select={handleSelect}
                eventClick={handleEventClick}
                eventDrop={handleDrop}
                eventResize={handleResize}
                eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
                dayHeaderFormat={{ weekday: 'short', month: 'short', day: 'numeric' }}
                eventDidMount={(info) => {
                  const event = info.event.extendedProps as CalendarEvent
                  info.el.setAttribute('title', `${event.title}${event.calendarName ? ` · ${event.calendarName}` : ''}`)
                }}
              />
            </div>
          </div>
        </main>

        {taskRailOpen && (
          <TaskRail
            tasks={tasks}
            scheduledTaskBlocks={scheduledTaskBlocks}
            onOpenTask={selectTask}
            onSchedule={scheduleTask}
            onArchive={archiveTask}
            archivingTaskIds={archivingTaskIds}
          />
        )}

        {cronLensOpen && (
          <CronRail
            jobs={cronLayer.jobs}
            visibleJobIds={cronLayer.visibleJobIds}
            offline={cronLayer.offline}
            offlineReason={cronLayer.offlineReason}
            loading={cronLayer.loading}
            onToggleJob={cronLayer.toggleJob}
            onSetVisible={cronLayer.setVisibleJobs}
            colorFor={cronLayer.colorFor}
            onColorChange={cronLayer.setJobColor}
            onOpenHistory={setCronHistoryJobId}
          />
        )}
      </div>

      <SourcePanel
        open={sourcePanelOpen}
        sources={calendar.sources}
        selectedIds={calendar.selectedSourceIds}
        onToggle={calendar.toggleSource}
        onColorChange={calendar.updateSourceColor}
        onClose={() => setSourcePanelOpen(false)}
      />

      <EventQuickView
        quickView={quickView}
        onClose={() => setQuickView(null)}
        onEdit={(event) => {
          setQuickView(null)
          setDraft({ mode: 'edit', event })
        }}
        onDelete={deleteCalendarEvent}
      />

      <CronQuickView
        view={cronQuickView}
        job={cronLayer.jobs.find((j) => j.id === cronQuickView?.event.cronJobId)}
        offline={cronLayer.offline}
        onClose={() => setCronQuickView(null)}
        onAction={cronLayer.runAction}
        onOpenHistory={(jobId) => {
          setCronQuickView(null)
          setCronHistoryJobId(jobId)
        }}
      />

      {cronHistoryJobId && (
        <CronHistoryPanel
          jobId={cronHistoryJobId}
          job={cronLayer.jobs.find((j) => j.id === cronHistoryJobId)}
          color={cronLayer.colorFor(cronHistoryJobId)}
          onClose={() => setCronHistoryJobId(null)}
        />
      )}

      {lastDeletedEvent && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border-subtle bg-card px-4 py-3 text-sm text-foreground shadow-2xl">
          <span className="max-w-[48vw] truncate">Deleted {lastDeletedEvent.title}</span>
          <button
            onClick={restoreDeletedEvent}
            disabled={undoingDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-card-hover disabled:opacity-50"
          >
            {undoingDelete ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
            Ctrl/Cmd+Z
          </button>
          <button onClick={() => setLastDeletedEvent(null)} className="icon-btn size-7" title="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      <EventEditor
        draft={draft}
        sources={editorSources}
        defaultSource={calendar.defaultEditableSource}
        onClose={() => setDraft(null)}
        onSaved={calendar.refresh}
      />

      {selectedTaskId && <TaskDetailPanel />}
    </div>
  )
}

function formatEventMoment(event: CalendarEvent) {
  const start = new Date(event.start)
  const end = new Date(event.end)
  if (Number.isNaN(start.getTime())) return event.allDay ? 'All day' : ''

  if (event.allDay) return `${format(start, 'EEEE, MMM d')} · All day`
  if (Number.isNaN(end.getTime())) return format(start, 'EEEE, MMM d · h:mm a')

  const sameDay = start.toDateString() === end.toDateString()
  if (sameDay) return `${format(start, 'EEEE, MMM d')} · ${format(start, 'h:mm')} - ${format(end, 'h:mm a')}`
  return `${format(start, 'MMM d, h:mm a')} - ${format(end, 'MMM d, h:mm a')}`
}

function plainDescription(value?: string | null) {
  if (!value) return ''
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    // Conservar el destino de los anchors (ej. link de Meet) antes de strippear tags.
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href, label) => {
      const cleanLabel = String(label).replace(/<[^>]*>/g, '').trim()
      return cleanLabel && cleanLabel !== href ? `${cleanLabel} ${href}` : href
    })
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// URLs en texto plano -> anchors clickeables (el link de Meet vive en la description).
function linkifyText(text: string) {
  return text.split(/(https?:\/\/[^\s<>"')\]]+)/g).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="break-all font-medium text-primary underline-offset-2 hover:underline"
      >
        {part}
      </a>
    ) : (
      part
    )
  )
}

function reminderLabel(event: CalendarEvent) {
  const reminder = event.reminders?.[0]
  if (!reminder) return null
  if (reminder.minutes < 60) return `${reminder.minutes} minutes before`
  if (reminder.minutes < 1440) return `${Math.round(reminder.minutes / 60)} hours before`
  return `${Math.round(reminder.minutes / 1440)} days before`
}

function EventQuickView({
  quickView,
  onClose,
  onEdit,
  onDelete,
}: {
  quickView: QuickViewState | null
  onClose: () => void
  onEdit: (event: CalendarEvent) => void
  onDelete: (event: CalendarEvent) => Promise<void>
}) {
  if (!quickView) return null
  return (
    <EventQuickViewCard
      key={`${quickView.event.id}:${quickView.x}:${quickView.y}`}
      quickView={quickView}
      onClose={onClose}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  )
}

function EventQuickViewCard({
  quickView,
  onClose,
  onEdit,
  onDelete,
}: {
  quickView: QuickViewState
  onClose: () => void
  onEdit: (event: CalendarEvent) => void
  onDelete: (event: CalendarEvent) => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  const cardRef = useRef<HTMLElement | null>(null)
  // Posicion medida real: el popover NUNCA se sale del viewport (antes asumia 360px
  // de alto fijo y se cortaba el contenido — ej. link de Meet — en eventos de abajo).
  const [pos, setPos] = useState(() => ({ left: quickView.x + 12, top: quickView.y + 12, ready: false }))

  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el || typeof window === 'undefined') return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setPos({
        left: Math.max(12, Math.min(quickView.x + 12, window.innerWidth - rect.width - 12)),
        top: Math.max(12, Math.min(quickView.y + 12, window.innerHeight - rect.height - 12)),
        ready: true,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [quickView])

  const { event } = quickView
  const description = plainDescription(event.description)
  const reminder = reminderLabel(event)
  const attendees = event.attendees?.map((attendee) => attendee.displayName || attendee.email).filter(Boolean) ?? []
  const canDelete = Boolean(event.googleEventId && event.accountEmail && event.googleCalendarId && event.kind !== 'task_due' && event.kind !== 'read_only')
  const { left, top } = pos

  const handleDelete = async () => {
    if (!canDelete) return
    setDeleting(true)
    try {
      await onDelete(event)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <button type="button" aria-label="Close event preview" className="fixed inset-0 z-40 cursor-default bg-transparent" onClick={onClose} />
      <section
        ref={cardRef}
        className="fixed z-50 flex max-h-[calc(100vh-24px)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-card text-foreground shadow-2xl"
        style={{ left, top, visibility: pos.ready ? 'visible' : 'hidden' }}
      >
        <div className="flex items-center justify-end gap-1 border-b border-border-subtle px-3 py-2">
          {event.htmlLink && (
            <a href={event.htmlLink} target="_blank" rel="noreferrer" className="icon-btn size-8" title="Open in Google Calendar">
              <ExternalLink size={15} />
            </a>
          )}
          <button onClick={() => onEdit(event)} className="icon-btn size-8" title="Edit event">
            <Edit3 size={15} />
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="icon-btn size-8 text-red-700 hover:bg-red-500/10 disabled:opacity-35 dark:text-red-300"
            title={canDelete ? 'Delete selected event' : 'Cannot delete this event'}
          >
            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          </button>
          <button onClick={onClose} className="icon-btn size-8" title="Close">
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="flex items-start gap-4">
            <span
              className="mt-2 size-3 rounded-sm"
              style={{ backgroundColor: event.color ?? '#8b5cf6' }}
            />
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-xl font-semibold leading-tight text-foreground">
                {event.title}
              </h2>
              <p className="mt-1 text-sm text-foreground/75">{formatEventMoment(event)}</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {description && (
              <div className="flex gap-4">
                <AlignLeft size={16} className="mt-0.5 shrink-0 text-muted" />
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground/80">{linkifyText(description)}</p>
              </div>
            )}

            {event.location && (
              <div className="flex gap-4">
                <MapPin size={16} className="mt-0.5 shrink-0 text-muted" />
                <p className="text-sm text-foreground/80">{event.location}</p>
              </div>
            )}

            {event.hangoutLink && (
              <div className="flex gap-4">
                <Video size={16} className="mt-0.5 shrink-0 text-muted" />
                <a href={event.hangoutLink} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary hover:text-primary-hover">
                  Join Google Meet
                </a>
              </div>
            )}

            {reminder && (
              <div className="flex gap-4">
                <Bell size={16} className="mt-0.5 shrink-0 text-muted" />
                <p className="text-sm text-foreground/80">{reminder}</p>
              </div>
            )}

            <div className="flex gap-4">
              <CalendarDays size={16} className="mt-0.5 shrink-0 text-muted" />
              <p className="text-sm text-foreground/80">{event.calendarName ?? event.googleCalendarId ?? 'Calendar'}</p>
            </div>

            {attendees.length > 0 && (
              <div className="flex gap-4">
                <Clock size={16} className="mt-0.5 shrink-0 text-muted" />
                <p className="line-clamp-2 text-sm text-foreground/80">{attendees.join(', ')}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}

function colorInputValue(value?: string | null) {
  const color = value?.trim()
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color
  return '#8b5cf6'
}

function SourcePanel({
  open,
  sources,
  selectedIds,
  onToggle,
  onColorChange,
  onClose,
}: {
  open: boolean
  sources: CalendarSource[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onColorChange: (sourceId: string, color: string) => void
  onClose: () => void
}) {
  const grouped = useMemo(() => ({
    personal: sources.filter((source) => source.accountType === 'personal'),
    business: sources.filter((source) => source.accountType === 'business'),
  }), [sources])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center p-4 pt-[11vh]">
      <button
        type="button"
        aria-label="Close calendars"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <section className="pointer-events-auto relative flex max-h-[78vh] w-full max-w-xl flex-col overflow-hidden titanium-panel">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Settings2 size={15} className="text-muted" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">Calendars</h2>
              <p className="truncate text-[11px] text-muted">Toggle Google calendars without shrinking the schedule.</p>
            </div>
          </div>
          <button onClick={onClose} className="icon-btn size-8" title="Close calendars">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {(['personal', 'business'] as const).map((group) => (
            <div key={group}>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-muted/70 font-semibold">{group}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {grouped[group].map((source) => {
                  const active = selectedIds.includes(source.id)
                  return (
                    <div
                      key={source.id}
                      className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${active ? 'bg-card-active border-border-accent' : 'bg-card/40 border-border-subtle hover:bg-card-hover'}`}
                    >
                      <span
                        className="relative flex size-6 flex-shrink-0 items-center justify-center rounded-md hover:bg-card-hover"
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        title={`Change ${source.summary} color`}
                      >
                        <span
                          className="size-3 rounded-full border border-white/35 shadow-sm"
                          style={{ backgroundColor: colorInputValue(source.backgroundColor) }}
                        />
                        <input
                          type="color"
                          aria-label={`Change ${source.summary} color`}
                          value={colorInputValue(source.backgroundColor)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            event.stopPropagation()
                            onColorChange(source.id, event.target.value)
                          }}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggle(source.id)}
                        className="min-w-0 flex flex-1 items-center gap-2 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-foreground/80">{source.summary}</span>
                          <span className="block truncate text-[10px] text-muted/70">{source.editable ? 'editable' : source.accessRole}</span>
                        </span>
                        <span className={`w-3 h-3 rounded border ${active ? 'bg-primary border-primary' : 'border-border'}`} />
                      </button>
                    </div>
                  )
                })}
                {grouped[group].length === 0 && <p className="text-xs text-muted/60">No {group} calendars available.</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function TaskRail({
  tasks,
  scheduledTaskBlocks,
  onOpenTask,
  onSchedule,
  onArchive,
  archivingTaskIds,
}: {
  tasks: TaskWithAssignees[]
  scheduledTaskBlocks: Map<string, CalendarEvent>
  onOpenTask: (taskId: string) => void
  onSchedule: (task: TaskWithAssignees) => void
  onArchive: (task: TaskWithAssignees) => void
  archivingTaskIds: Set<string>
}) {
  const activeTasks = tasks
    .filter((task) => task.status !== 'done' && task.status !== 'archived')
    .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? '') || (a.priority ?? 0) - (b.priority ?? 0))
    .slice(0, 18)

  return (
    <aside className="hidden xl:flex w-[22rem] flex-col border-l border-border-subtle bg-surface/50 min-h-0">
      <div className="px-3 py-3 border-b border-border-subtle">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Clock size={14} className="text-muted" />
            <span className="truncate text-xs font-semibold uppercase tracking-widest text-muted">Schedule Tasks</span>
          </div>
          <span className="rounded-full border border-border-subtle bg-card/60 px-2 py-0.5 text-[10px] font-semibold text-muted">
            {activeTasks.length}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted/70">Open tasks here, change status, or schedule a real Calendar block.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTasks.map((task) => {
          const priority = task.priority ?? 0
          const cfg = PRIORITY_CONFIG[priority]
          const scheduledBlock = scheduledTaskBlocks.get(task.id)
          const completedSubtasks = task.subtasks?.filter((subtask) => subtask.status === 'done').length ?? 0
          const totalSubtasks = task.subtasks?.length ?? 0
          const isArchiving = archivingTaskIds.has(task.id)
          return (
            <article
              key={task.id}
              className="card-interactive group cursor-pointer p-3"
              role="button"
              tabIndex={0}
              onClick={() => onOpenTask(task.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenTask(task.id)
                }
              }}
            >
              <div className="flex items-start gap-2">
                <span className={`text-xs ${cfg.color}`}>{cfg.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
                    <span className="font-mono">MC-{task.sequence_number}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onArchive(task)
                      }}
                      disabled={isArchiving}
                      className="icon-btn -mr-1 -mt-1 size-7 shrink-0 text-muted/70 hover:text-foreground disabled:opacity-50"
                      title="Archive task"
                      aria-label={`Archive MC-${task.sequence_number}`}
                    >
                      {isArchiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                    </button>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
                    {task.title}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                <span className="rounded-md border border-border-subtle bg-card/60 px-1.5 py-0.5">
                  {task.due_at ? `Due ${format(new Date(task.due_at), 'MMM d, h:mm a')}` : 'No due date'}
                </span>
                {totalSubtasks > 0 && (
                  <span className="rounded-md border border-border-subtle bg-card/60 px-1.5 py-0.5">
                    {completedSubtasks}/{totalSubtasks} subtasks
                  </span>
                )}
                {task.assignees?.slice(0, 2).map((assignee) => (
                  <span key={assignee.id} className="rounded-md border border-border-subtle bg-card/60 px-1.5 py-0.5">
                    {assignee.full_name?.split(' ')[0] ?? assignee.email?.split('@')[0] ?? 'Assigned'}
                  </span>
                ))}
                {scheduledBlock && (
                  <span className="rounded-md border border-border-subtle bg-background/60 px-1.5 py-0.5 text-foreground/70">
                    Scheduled {format(new Date(scheduledBlock.start), 'MMM d, h:mm a')}
                  </span>
                )}
              </div>

              <div className="mt-3">
                {scheduledBlock ? (
                  <button
                    type="button"
                    disabled
                    onClick={(event) => event.stopPropagation()}
                    className="btn-secondary w-full px-2 py-1.5 text-xs opacity-80"
                    title={`Scheduled for ${format(new Date(scheduledBlock.start), 'MMM d, h:mm a')}`}
                  >
                    <CheckCircle2 size={13} />
                    Scheduled
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSchedule(task)
                    }}
                    className="btn-secondary w-full px-2 py-1.5 text-xs"
                  >
                    <Plus size={13} />
                    Schedule block
                  </button>
                )}
              </div>
            </article>
          )
        })}
        {activeTasks.length === 0 && (
          <div className="rounded-lg border border-border-subtle bg-card/40 p-3 text-xs text-muted">
            No active tasks to schedule.
          </div>
        )}
      </div>
    </aside>
  )
}
