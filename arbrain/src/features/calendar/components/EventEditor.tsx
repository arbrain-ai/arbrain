'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Check, ChevronsUpDown, ExternalLink, Loader2, MapPin, Trash2, Video, X } from 'lucide-react'
import { format } from 'date-fns'
import type { CalendarEvent, CalendarSource } from '../types'
import { isOnline, upsertLocalEvent } from '@/lib/local-first'
import { calendarColorFor } from '@/lib/calendar/colors'

// Selector de calendario con punto de color (la paleta de marca, igual que los eventos).
// Reemplaza el <select> nativo, que no puede pintar color por opcion.
function CalendarSelect({ sources, value, onChange, disabled }: {
  sources: CalendarSource[]
  value: string
  onChange: (key: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = sources.find((s) => `${s.accountEmail}:${s.googleCalendarId}` === value)

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="input-field py-2 text-xs flex w-full items-center justify-between gap-2 disabled:opacity-60"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected?.backgroundColor ?? calendarColorFor(selected?.summary).backgroundColor }} />
          <span className="truncate">{selected ? `${selected.summary} · ${selected.accountType}` : 'Selecciona calendario'}</span>
        </span>
        <ChevronsUpDown size={13} className="shrink-0 text-muted" />
      </button>

      {open && !disabled && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border-subtle bg-card p-1 shadow-lg">
            {sources.map((source) => {
              const key = `${source.accountEmail}:${source.googleCalendarId}`
              const isSelected = key === value
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => { onChange(key); setOpen(false) }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-card-hover ${isSelected ? 'bg-card-active' : ''}`}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: source.backgroundColor ?? calendarColorFor(source.summary).backgroundColor }} />
                  <span className="flex-1 truncate">{source.summary} · {source.accountType}</span>
                  {isSelected && <Check size={13} className="shrink-0 text-primary" />}
                </button>
              )
            })}
            {sources.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted">No hay calendarios activos. Actívalos en el panel Calendars.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom'
type CustomRecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
type CustomRecurrenceEnd = 'never' | 'on' | 'after'

export interface EventEditorDraft {
  mode: 'create' | 'edit'
  event?: CalendarEvent
  start?: string
  end?: string
  allDay?: boolean
  task?: {
    id: string
    title: string
  }
}

interface EventEditorProps {
  draft: EventEditorDraft | null
  sources: CalendarSource[]
  defaultSource?: CalendarSource
  onClose: () => void
  onSaved: () => void
}

function toLocalDateTimeInput(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return format(date, "yyyy-MM-dd'T'HH:mm")
}

function toDateInput(value?: string) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return format(date, 'yyyy-MM-dd')
}

function fromInputValue(value: string, allDay: boolean) {
  if (!value) return ''
  if (allDay) return value
  return new Date(value).toISOString()
}

function splitAttendees(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const WEEKDAY_OPTIONS = [
  { value: 'MO', label: 'Mon' },
  { value: 'TU', label: 'Tue' },
  { value: 'WE', label: 'Wed' },
  { value: 'TH', label: 'Thu' },
  { value: 'FR', label: 'Fri' },
  { value: 'SA', label: 'Sat' },
  { value: 'SU', label: 'Sun' },
] as const

const WEEKDAY_BY_DATE_INDEX = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

function boundedInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function weekdayFromInput(value: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return 'MO'
  return WEEKDAY_BY_DATE_INDEX[date.getDay()]
}

function rruleUntilFromDateInput(value: string) {
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return null
  return `${year}${month}${day}T235959Z`
}

export function EventEditor({ draft, sources, defaultSource, onClose, onSaved }: EventEditorProps) {
  const editableSources = useMemo(() => sources.filter((source) => source.editable), [sources])
  const fallbackSource = defaultSource ?? editableSources[0]

  const [calendarKey, setCalendarKey] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [attendees, setAttendees] = useState('')
  const [sendUpdates, setSendUpdates] = useState<'none' | 'all' | 'externalOnly'>('none')
  const [withMeet, setWithMeet] = useState(false)
  const [recurrence, setRecurrence] = useState<RecurrencePreset>('none')
  const [customFrequency, setCustomFrequency] = useState<CustomRecurrenceFrequency>('WEEKLY')
  const [customInterval, setCustomInterval] = useState(1)
  const [customWeekdays, setCustomWeekdays] = useState<string[]>([])
  const [customEnd, setCustomEnd] = useState<CustomRecurrenceEnd>('never')
  const [customUntil, setCustomUntil] = useState('')
  const [customCount, setCustomCount] = useState(10)
  const [recurrenceScope, setRecurrenceScope] = useState<'single' | 'future' | 'all'>('single')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const event = draft?.event
  const isOpen = Boolean(draft)
  const isEdit = Boolean(draft?.mode === 'edit' && event?.googleEventId)
  const isTaskDue = event?.kind === 'task_due'
  const isRecurring = Boolean(event?.recurringEventId)
  const selectedSource = sources.find((source) => `${source.accountEmail}:${source.googleCalendarId}` === calendarKey) ?? fallbackSource
  const selectedCustomWeekdays = useMemo(() => (
    customWeekdays.length > 0 ? customWeekdays : [weekdayFromInput(start)]
  ), [customWeekdays, start])
  const customRecurrenceError = useMemo(() => {
    if (recurrence !== 'custom') return null
    if (customInterval < 1 || customInterval > 99) return 'Custom repeat interval must be between 1 and 99.'
    if (customEnd === 'on' && !rruleUntilFromDateInput(customUntil)) return 'Choose an end date for the custom repeat.'
    if (customEnd === 'after' && (customCount < 1 || customCount > 999)) return 'Occurrences must be between 1 and 999.'
    return null
  }, [customCount, customEnd, customInterval, customUntil, recurrence])
  const canSave = Boolean(title.trim() && selectedSource && start && end && !isTaskDue && !customRecurrenceError)

  useEffect(() => {
    if (!draft) return
    const source = draft.event
      ? sources.find((s) => s.accountEmail === draft.event?.accountEmail && s.googleCalendarId === draft.event?.googleCalendarId) ?? fallbackSource
      : fallbackSource
    setCalendarKey(source ? `${source.accountEmail}:${source.googleCalendarId}` : '')
    setTitle(draft.task?.title ?? draft.event?.title ?? '')
    setDescription(draft.event?.description ?? '')
    setLocation(draft.event?.location ?? '')
    const nextAllDay = Boolean(draft.allDay ?? draft.event?.allDay)
    setAllDay(nextAllDay)
    setStart(nextAllDay ? toDateInput(draft.start ?? draft.event?.start) : toLocalDateTimeInput(draft.start ?? draft.event?.start))
    setEnd(nextAllDay ? toDateInput(draft.end ?? draft.event?.end) : toLocalDateTimeInput(draft.end ?? draft.event?.end))
    setAttendees(draft.event?.attendees?.map((a) => a.email).join(', ') ?? '')
    setSendUpdates('none')
    setWithMeet(Boolean(draft.event?.hangoutLink))
    setRecurrence('none')
    setCustomFrequency('WEEKLY')
    setCustomInterval(1)
    setCustomWeekdays([])
    setCustomEnd('never')
    setCustomUntil('')
    setCustomCount(10)
    setRecurrenceScope('single')
    setError(null)
  }, [draft, fallbackSource, sources])

  if (!isOpen) return null

  const save = async () => {
    if (!canSave || !selectedSource) return
    if (customRecurrenceError) {
      setError(customRecurrenceError)
      return
    }
    setSaving(true)
    setError(null)

    const customRuleParts = [
      `FREQ=${customFrequency}`,
      `INTERVAL=${boundedInteger(customInterval, 1, 99)}`,
      customFrequency === 'WEEKLY' ? `BYDAY=${selectedCustomWeekdays.join(',')}` : null,
      customEnd === 'on' && customUntil ? `UNTIL=${rruleUntilFromDateInput(customUntil)}` : null,
      customEnd === 'after' ? `COUNT=${boundedInteger(customCount, 1, 999)}` : null,
    ].filter(Boolean)

    const recurrenceRules = recurrence === 'none'
      ? undefined
      : recurrence === 'daily'
        ? ['RRULE:FREQ=DAILY']
        : recurrence === 'weekly'
          ? ['RRULE:FREQ=WEEKLY']
          : recurrence === 'monthly'
            ? ['RRULE:FREQ=MONTHLY']
            : [`RRULE:${customRuleParts.join(';')}`]

    const payload = {
      accountEmail: selectedSource.accountEmail,
      googleCalendarId: selectedSource.googleCalendarId,
      title: title.trim(),
      start: fromInputValue(start, allDay),
      end: fromInputValue(end, allDay),
      allDay,
      description,
      location,
      attendees: splitAttendees(attendees),
      sendUpdates,
      withMeet,
      recurrence: recurrenceRules,
      taskId: draft?.task?.id,
      recurrenceScope: isRecurring ? recurrenceScope : undefined,
      originalStart: event?.originalStart ?? undefined,
    }

    try {
      if (!isOnline()) throw new Error('offline')
      const url = isEdit
        ? `/api/calendar/events/${encodeURIComponent(event!.googleEventId!)}`
        : '/api/calendar/events'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save event')
      onSaved()
      onClose()
    } catch (err) {
      if (payload.recurrence?.length) {
        setError(err instanceof Error && err.message !== 'offline'
          ? `${err.message}. Recurring events were not queued offline.`
          : 'Recurring events need Google Calendar connection before saving.')
        return
      }

      try {
        const localEvent = {
          id: event?.id ?? `local_event_${crypto.randomUUID()}`,
          cloudId: event?.googleEventId ?? null,
          accountEmail: selectedSource.accountEmail,
          calendarId: selectedSource.googleCalendarId,
          title: title.trim(),
          description: description || null,
          startsAt: payload.start,
          endsAt: payload.end,
          timezone: selectedSource.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          status: 'queued' as const,
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        }
        await upsertLocalEvent(localEvent, true)
        onSaved()
        onClose()
      } catch {
        setError(err instanceof Error ? err.message : 'Failed to save event')
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteEvent = async () => {
    if (!event?.googleEventId || !event.accountEmail || !event.googleCalendarId) return
    const confirmed = window.confirm(`Delete "${event.title}" from Google Calendar?`)
    if (!confirmed) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/calendar/events/${encodeURIComponent(event.googleEventId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountEmail: event.accountEmail,
          googleCalendarId: event.googleCalendarId,
          recurrenceScope: isRecurring ? recurrenceScope : undefined,
          originalStart: event.originalStart ?? undefined,
          sendUpdates,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete event')
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[8vh] pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl max-h-[86vh] overflow-hidden titanium-panel flex flex-col">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar size={16} className="text-muted" />
              <span className="text-sm font-semibold text-foreground truncate">
                {isTaskDue ? 'Task due date' : isEdit ? 'Edit event' : draft?.task ? 'Schedule task' : 'New event'}
              </span>
            </div>
            <button onClick={onClose} className="icon-btn size-8" title="Close">
              <X size={15} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isTaskDue && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                This is a Board due-date marker. Use Schedule Task from the task rail to create a real Google Calendar block.
              </div>
            )}

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isTaskDue}
              placeholder="Event title"
              className="w-full bg-transparent text-xl font-semibold text-foreground placeholder:text-muted/60 outline-none disabled:opacity-60"
            />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-widest text-muted">Calendar</span>
                <CalendarSelect
                  sources={editableSources}
                  value={calendarKey}
                  onChange={setCalendarKey}
                  disabled={isTaskDue}
                />
              </div>

              <label className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-widest text-muted">Notify guests</span>
                <select value={sendUpdates} onChange={(e) => setSendUpdates(e.target.value as typeof sendUpdates)} className="input-field py-2 text-xs">
                  <option value="none">Do not notify</option>
                  <option value="externalOnly">External guests only</option>
                  <option value="all">Notify all guests</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input id="calendar-all-day" type="checkbox" checked={allDay} disabled={isTaskDue} onChange={(e) => setAllDay(e.target.checked)} />
              <label htmlFor="calendar-all-day" className="text-xs text-foreground/75">All-day event</label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-widest text-muted">Start</span>
                <input
                  type={allDay ? 'date' : 'datetime-local'}
                  value={start}
                  disabled={isTaskDue}
                  onChange={(e) => setStart(e.target.value)}
                  className="input-field py-2 text-xs [color-scheme:light] dark:[color-scheme:dark]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-widest text-muted">End</span>
                <input
                  type={allDay ? 'date' : 'datetime-local'}
                  value={end}
                  disabled={isTaskDue}
                  onChange={(e) => setEnd(e.target.value)}
                  className="input-field py-2 text-xs [color-scheme:light] dark:[color-scheme:dark]"
                />
              </label>
            </div>

            {isRecurring && (
              <label className="space-y-1.5 block">
                <span className="text-[10px] uppercase tracking-widest text-muted">Recurring edit scope</span>
                <select value={recurrenceScope} onChange={(e) => setRecurrenceScope(e.target.value as typeof recurrenceScope)} className="input-field py-2 text-xs">
                  <option value="single">This event only</option>
                  <option value="future">This and following events</option>
                  <option value="all">All events in the series</option>
                </select>
              </label>
            )}

            {!isEdit && !draft?.task && (
              <div className="space-y-2">
                <label className="space-y-1.5 block">
                  <span className="text-[10px] uppercase tracking-widest text-muted">Repeats</span>
                  <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value as RecurrencePreset)}
                    className="input-field py-2 text-xs"
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom...</option>
                  </select>
                </label>

                {recurrence === 'custom' && (
                  <div className="rounded-lg border border-border-subtle bg-card/45 p-3 space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="text-[10px] uppercase tracking-widest text-muted">Every</span>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={customInterval}
                          onChange={(e) => setCustomInterval(Number(e.target.value))}
                          className="input-field py-2 text-xs"
                        />
                      </label>

                      <label className="space-y-1.5">
                        <span className="text-[10px] uppercase tracking-widest text-muted">Frequency</span>
                        <select
                          value={customFrequency}
                          onChange={(e) => setCustomFrequency(e.target.value as CustomRecurrenceFrequency)}
                          className="input-field py-2 text-xs"
                        >
                          <option value="DAILY">Day(s)</option>
                          <option value="WEEKLY">Week(s)</option>
                          <option value="MONTHLY">Month(s)</option>
                          <option value="YEARLY">Year(s)</option>
                        </select>
                      </label>
                    </div>

                    {customFrequency === 'WEEKLY' && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase tracking-widest text-muted">On</span>
                        <div className="flex flex-wrap gap-1.5">
                          {WEEKDAY_OPTIONS.map((day) => {
                            const selected = selectedCustomWeekdays.includes(day.value)
                            return (
                              <button
                                key={day.value}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => {
                                  setCustomWeekdays((prev) => {
                                    const current = prev.length > 0 ? prev : selectedCustomWeekdays
                                    if (!current.includes(day.value)) return [...current, day.value]
                                    return current.length <= 1 ? current : current.filter((value) => value !== day.value)
                                  })
                                }}
                                className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${selected ? 'border-border-accent bg-card-active text-foreground' : 'border-border-subtle bg-card/45 text-muted hover:bg-card-hover hover:text-foreground'}`}
                              >
                                {day.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="text-[10px] uppercase tracking-widest text-muted">Ends</span>
                        <select
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value as CustomRecurrenceEnd)}
                          className="input-field py-2 text-xs"
                        >
                          <option value="never">Never</option>
                          <option value="on">On date</option>
                          <option value="after">After occurrences</option>
                        </select>
                      </label>

                      {customEnd === 'on' && (
                        <label className="space-y-1.5">
                          <span className="text-[10px] uppercase tracking-widest text-muted">End date</span>
                          <input
                            type="date"
                            value={customUntil}
                            onChange={(e) => setCustomUntil(e.target.value)}
                            className="input-field py-2 text-xs [color-scheme:light] dark:[color-scheme:dark]"
                          />
                        </label>
                      )}

                      {customEnd === 'after' && (
                        <label className="space-y-1.5">
                          <span className="text-[10px] uppercase tracking-widest text-muted">Occurrences</span>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={customCount}
                            onChange={(e) => setCustomCount(Number(e.target.value))}
                            className="input-field py-2 text-xs"
                          />
                        </label>
                      )}
                    </div>

                    {customRecurrenceError && (
                      <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                        {customRecurrenceError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <label className="space-y-1.5 block">
              <span className="text-[10px] uppercase tracking-widest text-muted flex items-center gap-1"><MapPin size={11} /> Location</span>
              <input value={location} disabled={isTaskDue} onChange={(e) => setLocation(e.target.value)} className="input-field py-2 text-sm" placeholder="Add location" />
            </label>

            <label className="space-y-1.5 block">
              <span className="text-[10px] uppercase tracking-widest text-muted">Attendees</span>
              <input value={attendees} disabled={isTaskDue} onChange={(e) => setAttendees(e.target.value)} className="input-field py-2 text-sm" placeholder="email1@example.com, email2@example.com" />
            </label>

            <div className="flex items-center gap-2">
              <input id="calendar-meet" type="checkbox" checked={withMeet} disabled={isTaskDue || isEdit} onChange={(e) => setWithMeet(e.target.checked)} />
              <label htmlFor="calendar-meet" className="text-xs text-foreground/75 flex items-center gap-1"><Video size={13} /> {isEdit ? 'Google Meet' : 'Add Google Meet'}</label>
            </div>

            <label className="space-y-1.5 block">
              <span className="text-[10px] uppercase tracking-widest text-muted">Description</span>
              <textarea value={description} disabled={isTaskDue} onChange={(e) => setDescription(e.target.value)} rows={5} className="input-field resize-y text-sm" placeholder="Notes, agenda, links..." />
            </label>

            {event?.htmlLink && (
              <a href={event.htmlLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary-hover">
                <ExternalLink size={13} />
                Open in Google Calendar
              </a>
            )}

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
            <div>
              {isEdit && !isTaskDue && (
                <button onClick={deleteEvent} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300 hover:bg-red-500/10 disabled:opacity-40">
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} disabled={saving} className="btn-secondary px-3 py-2 text-xs">Cancel</button>
              {!isTaskDue && (
                <button onClick={save} disabled={!canSave || saving} className="btn-primary px-4 py-2 text-xs">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {isEdit ? 'Save changes' : draft?.task ? 'Schedule task' : 'Create event'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
