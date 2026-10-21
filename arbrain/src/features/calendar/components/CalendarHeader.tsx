'use client'

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import type { CalendarView, AccountFilter } from '../types'

interface CalendarHeaderProps {
  currentDate: Date
  view: CalendarView
  setView: (view: CalendarView) => void
  accountFilter: AccountFilter
  setAccountFilter: (filter: AccountFilter) => void
  goNext: () => void
  goPrev: () => void
  goToday: () => void
  showPersonal?: boolean
}

const VIEW_OPTIONS: CalendarView[] = ['month', 'week', 'day']

const ACCOUNT_OPTIONS: { value: AccountFilter; label: string; dot?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'personal', label: 'Personal', dot: 'bg-purple-400' },
  { value: 'business', label: 'Business', dot: 'bg-blue-400' },
  { value: 'tasks', label: 'Tasks', dot: 'bg-emerald-400' },
]

function CalendarHeader({
  currentDate,
  view,
  setView,
  accountFilter,
  setAccountFilter,
  goNext,
  goPrev,
  goToday,
  showPersonal = false,
}: CalendarHeaderProps) {
  const visibleAccounts = showPersonal
    ? ACCOUNT_OPTIONS
    : ACCOUNT_OPTIONS.filter((o) => o.value !== 'personal')
  const title =
    view === 'month'
      ? format(currentDate, 'MMMM yyyy')
      : view === 'week'
        ? `Week of ${format(currentDate, 'MMM d, yyyy')}`
        : format(currentDate, 'EEEE, MMM d, yyyy')

  return (
    <div className="flex flex-col gap-4 mb-4">
      {/* Top row: Title + Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-foreground/70" />
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Today button */}
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-xs font-medium text-foreground/70 hover:text-foreground bg-card/60 hover:bg-card-active border border-border-subtle rounded-lg transition-all duration-200"
          >
            Today
          </button>

          {/* Prev/Next */}
          <div className="flex items-center bg-card/60 border border-border-subtle rounded-lg overflow-hidden">
            <button
              onClick={goPrev}
              className="p-1.5 hover:bg-card-active transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft size={16} className="text-foreground/70" />
            </button>
            <div className="w-[1px] h-4 bg-card-hover" />
            <button
              onClick={goNext}
              className="p-1.5 hover:bg-card-active transition-colors"
              aria-label="Next"
            >
              <ChevronRight size={16} className="text-foreground/70" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom row: View toggle + Account filter */}
      <div className="flex items-center justify-between">
        {/* View toggle */}
        <div className="flex items-center bg-card/60 border border-border-subtle rounded-lg overflow-hidden">
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-all duration-200
                ${
                  view === v
                    ? 'bg-card-active text-foreground'
                    : 'text-muted hover:text-foreground/70 hover:bg-card'
                }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Account filter */}
        <div className="flex items-center bg-card/60 border border-border-subtle rounded-lg overflow-hidden">
          {visibleAccounts.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAccountFilter(opt.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200
                ${
                  accountFilter === opt.value
                    ? 'bg-card-active text-foreground'
                    : 'text-muted hover:text-foreground/70 hover:bg-card'
                }`}
            >
              {opt.dot && (
                <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
              )}
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
