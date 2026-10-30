import { create } from 'zustand'
import type { TaskPriority, TaskStatus } from '@/types/database'

// Horizonte temporal (lente d/w/m unificado con el calendario y los objetivos):
// filtra el board a tasks cuya due_at cae hoy / esta semana / este mes.
export type DueHorizon = 'today' | 'week' | 'month'

export interface TaskFilters {
  priority: TaskPriority | null
  assigneeId: string | null
  labelId: string | null
  status: TaskStatus | null
  dueHorizon: DueHorizon | null
  search: string
}

interface FiltersState {
  filters: TaskFilters
  setFilter: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void
  resetFilters: () => void
  hasActiveFilters: () => boolean
}

const DEFAULT_FILTERS: TaskFilters = {
  priority: null,
  assigneeId: null,
  labelId: null,
  status: null,
  dueHorizon: null,
  search: '',
}

export const useFiltersStore = create<FiltersState>((set, get) => ({
  filters: { ...DEFAULT_FILTERS },
  setFilter: (key, value) => set((s) => ({
    filters: { ...s.filters, [key]: value },
  })),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
  hasActiveFilters: () => {
    const f = get().filters
    return f.priority !== null || f.assigneeId !== null || f.labelId !== null || f.status !== null || f.dueHorizon !== null || f.search.length > 0
  },
}))
