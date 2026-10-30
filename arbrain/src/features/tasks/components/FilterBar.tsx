'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFiltersStore, type TaskFilters } from '@/shared/stores/filters-store'
import { PRIORITY_CONFIG, STATUS_CONFIG } from '../utils/priority'
import { Filter, X, ChevronDown } from 'lucide-react'
import type { TaskPriority, TaskStatus, Label, Profile } from '@/types/database'

export function FilterBar() {
  const { filters, setFilter, resetFilters, hasActiveFilters } = useFiltersStore()
  const [labels, setLabels] = useState<Label[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)

  // Dropdowns
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (dataLoaded) return
    const supabase = createClient()
    const [labelsRes, profilesRes] = await Promise.all([
      supabase.from('labels').select('*').order('name'),
      supabase.from('profiles').select('*').order('full_name'),
    ])
    if (labelsRes.data) setLabels(labelsRes.data as Label[])
    if (profilesRes.data) setMembers(profilesRes.data as Profile[])
    setDataLoaded(true)
  }, [dataLoaded])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Close dropdowns on outside click
  useEffect(() => {
    if (!activeDropdown) return
    const handleClick = () => setActiveDropdown(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [activeDropdown])

  const active = hasActiveFilters()

  const removePill = (key: keyof TaskFilters) => {
    if (key === 'search') setFilter('search', '')
    else setFilter(key, null)
  }

  // Get display text for active pills
  const activePills: { key: keyof TaskFilters; label: string; color?: string }[] = []
  if (filters.priority !== null) {
    const p = PRIORITY_CONFIG[filters.priority]
    activePills.push({ key: 'priority', label: `${p.icon} ${p.label}` })
  }
  if (filters.assigneeId) {
    const member = members.find((m) => m.id === filters.assigneeId)
    activePills.push({ key: 'assigneeId', label: member?.full_name ?? 'Miembro' })
  }
  if (filters.labelId) {
    const label = labels.find((l) => l.id === filters.labelId)
    activePills.push({ key: 'labelId', label: label?.name ?? 'Etiqueta', color: label?.color })
  }
  if (filters.status !== null) {
    const s = STATUS_CONFIG[filters.status]
    activePills.push({ key: 'status', label: `${s.icon} ${s.label}` })
  }
  if (filters.search) {
    activePills.push({ key: 'search', label: `"${filters.search}"` })
  }

  return (
    <div className="px-4 py-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Filter toggle */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setActiveDropdown(activeDropdown === 'main' ? null : 'main')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-colors border
              ${active
                ? 'bg-primary/12 border-primary/30 text-primary'
                : 'border-border-subtle text-muted/80 hover:text-muted hover:bg-card'
              }
            `}
          >
            <Filter size={12} />
            Filter
            <ChevronDown size={10} />
          </button>

          {activeDropdown === 'main' && (
            <div className="absolute top-full left-0 mt-1 glass-panel-strong border border-border rounded-xl overflow-hidden z-20 shadow-elevation-md min-w-[180px]">
              {/* Status */}
              <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-muted/70 font-semibold">Estado</div>
              {(['backlog', 'todo', 'in_progress', 'done'] as TaskStatus[]).map((s) => {
                const cfg = STATUS_CONFIG[s]
                return (
                  <button
                    key={s}
                    onClick={() => { setFilter('status', filters.status === s ? null : s); setActiveDropdown(null) }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors
                      ${filters.status === s ? 'bg-card-active text-foreground' : 'text-muted hover:bg-card-hover'}
                    `}
                  >
                    <span className={cfg.color}>{cfg.icon}</span>
                    {cfg.label}
                  </button>
                )
              })}

              <div className="border-t border-border-subtle my-1" />

              {/* Priority */}
              <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-muted/70 font-semibold">Prioridad</div>
              {([1, 2, 3, 4] as TaskPriority[]).map((p) => {
                const cfg = PRIORITY_CONFIG[p]
                return (
                  <button
                    key={p}
                    onClick={() => { setFilter('priority', filters.priority === p ? null : p); setActiveDropdown(null) }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors
                      ${filters.priority === p ? 'bg-card-active text-foreground' : `text-muted hover:bg-card-hover`}
                    `}
                  >
                    <span className={cfg.color}>{cfg.icon}</span>
                    {cfg.label}
                  </button>
                )
              })}

              <div className="border-t border-border-subtle my-1" />

              {/* Assignee */}
              <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-muted/70 font-semibold">Responsable</div>
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setFilter('assigneeId', filters.assigneeId === m.id ? null : m.id); setActiveDropdown(null) }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors
                    ${filters.assigneeId === m.id ? 'bg-card-active text-foreground' : 'text-muted hover:bg-card-hover'}
                  `}
                >
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-card-active flex items-center justify-center text-[9px] text-foreground/70">{(m.full_name ?? '?')[0]}</span>
                  )}
                  {m.full_name ?? m.email ?? 'User'}
                </button>
              ))}

              <div className="border-t border-border-subtle my-1" />

              {/* Labels */}
              <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-muted/70 font-semibold">Etiqueta</div>
              {labels.map((l) => (
                <button
                  key={l.id}
                  onClick={() => { setFilter('labelId', filters.labelId === l.id ? null : l.id); setActiveDropdown(null) }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors
                    ${filters.labelId === l.id ? 'bg-card-active text-foreground' : 'text-muted hover:bg-card-hover'}
                  `}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active filter pills */}
        {activePills.map((pill) => (
          <span
            key={pill.key}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-primary/12 border border-primary/30 text-primary"
            style={pill.color ? { backgroundColor: `${pill.color}15`, borderColor: `${pill.color}30`, color: pill.color } : {}}
          >
            {pill.label}
            <button
              onClick={() => removePill(pill.key)}
              className="hover:text-foreground transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}

        {/* Clear all */}
        {active && (
          <button
            onClick={resetFilters}
            className="text-[10px] text-muted/70 hover:text-muted transition-colors"
          >
            Clear all
          </button>
        )}

        {/* Search pill */}
        <input
          type="text"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          placeholder="Buscar…"
          className="bg-transparent border-none text-[11px] text-foreground/70 placeholder:text-muted/60 outline-none w-20 focus:w-32 transition-all"
        />

        {/* Spacer */}
        <div className="flex-1" />
      </div>
    </div>
  )
}
