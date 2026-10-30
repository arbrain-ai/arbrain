'use client'

import {
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  parseISO,
} from 'date-fns'
import type { CalendarEvent, CalendarView } from '../types'

interface CalendarGridProps {
  currentDate: Date
  events: CalendarEvent[]
  view: CalendarView
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MAX_VISIBLE_EVENTS = 3

function getEventsForDay(
  events: CalendarEvent[],
  day: Date
): CalendarEvent[] {
  return events.filter((event) => {
    const eventStart = parseISO(event.start)
    return isSameDay(eventStart, day)
  })
}

function EventBar({ event }: { event: CalendarEvent }) {
  const color = event.account === 'business'
    ? 'bg-blue-400'
    : event.account === 'tasks'
      ? 'bg-emerald-400'
      : 'bg-purple-400'
  const time = event.allDay ? 'All day' : format(parseISO(event.start), 'h:mm a')

  return (
    <div
      className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded group/event cursor-default hover:bg-card-hover transition-colors`}
      title={`${event.title} - ${time}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />
      <span className="text-[10px] text-muted truncate leading-tight">
        {event.title}
      </span>
    </div>
  )
}

function DayCell({
  day,
  currentDate,
  dayEvents,
}: {
  day: Date
  currentDate: Date
  dayEvents: CalendarEvent[]
}) {
  const isCurrentMonth = isSameMonth(day, currentDate)
  const isDayToday = isToday(day)
  const extraCount = dayEvents.length - MAX_VISIBLE_EVENTS

  return (
    <div
      className={`min-h-[100px] md:min-h-[120px] border-b border-r border-border-subtle p-1.5 transition-colors hover:bg-card
        ${!isCurrentMonth ? 'opacity-30' : ''}`}
    >
      {/* Day number */}
      <div className="flex items-center justify-center mb-1">
        <span
          className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
            ${
              isDayToday
                ? 'bg-blue-500 text-foreground ring-2 ring-blue-500/30'
                : 'text-foreground/70'
            }`}
        >
          {format(day, 'd')}
        </span>
      </div>

      {/* Events */}
      <div className="flex flex-col gap-0.5">
        {dayEvents.slice(0, MAX_VISIBLE_EVENTS).map((event) => (
          <EventBar key={event.id} event={event} />
        ))}
        {extraCount > 0 && (
          <span className="text-[9px] text-muted/80 pl-1.5">
            +{extraCount} more
          </span>
        )}
      </div>
    </div>
  )
}

function WeekView({
  currentDate,
  events,
}: {
  currentDate: Date
  events: CalendarEvent[]
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

  // Hours to display (5am to 11pm)
  const hours = Array.from({ length: 19 }, (_, i) => i + 5)

  return (
    <div className="flex-1 overflow-auto">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] sticky top-0 z-10 bg-background">
        <div className="border-b border-r border-border-subtle p-2" />
        {days.map((day) => {
          const isDayToday = isToday(day)
          return (
            <div
              key={day.toISOString()}
              className="border-b border-r border-border-subtle p-2 text-center"
            >
              <span className="text-[10px] uppercase tracking-wider text-muted">
                {format(day, 'EEE')}
              </span>
              <div className="mt-0.5">
                <span
                  className={`text-sm font-medium w-7 h-7 inline-flex items-center justify-center rounded-full
                    ${
                      isDayToday
                        ? 'bg-blue-500 text-foreground ring-2 ring-blue-500/30'
                        : 'text-foreground/70'
                    }`}
                >
                  {format(day, 'd')}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)]">
        {hours.map((hour) => (
          <div key={hour} className="contents">
            {/* Hour label */}
            <div className="border-b border-r border-border-subtle p-1 text-right pr-2">
              <span className="text-[10px] text-muted/80">
                {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
              </span>
            </div>
            {/* Day columns */}
            {days.map((day) => {
              const dayEvents = getEventsForDay(events, day)
              const hourEvents = dayEvents.filter((e) => {
                const eventHour = parseISO(e.start).getHours()
                return eventHour === hour
              })

              return (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  className="border-b border-r border-border-subtle min-h-[48px] p-0.5 hover:bg-card/60 transition-colors"
                >
                  {hourEvents.map((event) => {
                    const color =
                      event.account === 'business'
                        ? 'bg-blue-500/20 border-blue-400/30 text-blue-300'
                        : event.account === 'tasks'
                          ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                          : 'bg-primary/20 border-purple-400/30 text-primary'
                    return (
                      <div
                        key={event.id}
                        className={`rounded px-1.5 py-1 text-[10px] leading-tight border ${color} cursor-default`}
                        title={event.title}
                      >
                        <div className="font-medium truncate">
                          {event.title}
                        </div>
                        <div className="opacity-60">
                          {event.allDay ? 'All day' : format(parseISO(event.start), 'h:mm a')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function DayView({
  currentDate,
  events,
}: {
  currentDate: Date
  events: CalendarEvent[]
}) {
  const hours = Array.from({ length: 19 }, (_, i) => i + 5)
  const dayEvents = getEventsForDay(events, currentDate)
  const allDayEvents = dayEvents.filter((e) => e.allDay)

  return (
    <div className="flex-1 overflow-auto">
      {/* Day header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border-subtle p-3 text-center">
        <span className="text-[10px] uppercase tracking-wider text-muted">
          {format(currentDate, 'EEEE')}
        </span>
        <div className="mt-0.5">
          <span
            className={`text-lg font-medium w-9 h-9 inline-flex items-center justify-center rounded-full
              ${isToday(currentDate) ? 'bg-blue-500 text-foreground ring-2 ring-blue-500/30' : 'text-foreground/70'}`}
          >
            {format(currentDate, 'd')}
          </span>
        </div>
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="border-b border-border-subtle px-3 py-2">
          <span className="text-[10px] text-muted/80 uppercase tracking-wider">All day</span>
          <div className="mt-1 space-y-0.5">
            {allDayEvents.map((event) => (
              <EventBar key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Hourly grid */}
      <div className="grid grid-cols-[60px_1fr]">
        {hours.map((hour) => {
          const hourEvents = dayEvents.filter((e) => {
            if (e.allDay) return false
            return parseISO(e.start).getHours() === hour
          })
          return (
            <div key={hour} className="contents">
              <div className="border-b border-r border-border-subtle p-1 text-right pr-2">
                <span className="text-[10px] text-muted/80">
                  {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
                </span>
              </div>
              <div className="border-b border-border-subtle min-h-[56px] p-1 hover:bg-card/60 transition-colors">
                {hourEvents.map((event) => {
                  const color =
                    event.account === 'business'
                      ? 'bg-blue-500/20 border-blue-400/30 text-blue-300'
                      : event.account === 'tasks'
                        ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                        : 'bg-primary/20 border-purple-400/30 text-primary'
                  return (
                    <div key={event.id} className={`rounded px-2 py-1.5 text-xs border ${color} mb-0.5`}>
                      <div className="font-medium">{event.title}</div>
                      <div className="opacity-60 text-[10px]">
                        {format(parseISO(event.start), 'h:mm a')}
                        {event.location && ` · ${event.location}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalendarGrid({ currentDate, events, view }: CalendarGridProps) {
  if (view === 'day') {
    return (
      <div className="flex-1 min-h-0 bg-card/60 backdrop-blur-sm border border-border-subtle rounded-2xl overflow-hidden relative flex flex-col">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent rounded-t-2xl" />
        <DayView currentDate={currentDate} events={events} />
      </div>
    )
  }

  if (view === 'week') {
    return (
      <div className="flex-1 min-h-0 bg-card/60 backdrop-blur-sm border border-border-subtle rounded-2xl overflow-hidden relative flex flex-col">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent rounded-t-2xl" />
        <WeekView currentDate={currentDate} events={events} />
      </div>
    )
  }

  // Month view
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  return (
    <div className="flex-1 min-h-0 bg-card/60 backdrop-blur-sm border border-border-subtle rounded-2xl overflow-hidden relative flex flex-col">
      {/* Specular rim */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent rounded-t-2xl" />

      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b border-border-subtle">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-muted border-r border-border-subtle last:border-r-0"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayEvents = getEventsForDay(events, day)
            return (
              <DayCell
                key={day.toISOString()}
                day={day}
                currentDate={currentDate}
                dayEvents={dayEvents}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
