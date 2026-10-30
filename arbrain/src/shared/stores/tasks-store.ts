import { create } from 'zustand'
import type { TaskWithAssignees } from '@/types/database'

const BACKLOG_PREF_KEY = 'mc:showBacklog'

function persistBacklogPref(value: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(BACKLOG_PREF_KEY, value ? '1' : '0')
  } catch {
    // localStorage unavailable (private mode / SSR) — ignore
  }
}

export function readBacklogPref(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(BACKLOG_PREF_KEY) === '1'
  } catch {
    return false
  }
}

interface TasksState {
  tasks: TaskWithAssignees[]
  selectedTaskId: string | null
  showArchived: boolean
  showBacklog: boolean
  focusedTaskId: string | null
  setTasks: (tasks: TaskWithAssignees[]) => void
  addTask: (task: TaskWithAssignees) => void
  updateTask: (id: string, updates: Partial<TaskWithAssignees>) => void
  removeTask: (id: string) => void
  selectTask: (id: string | null) => void
  toggleArchived: () => void
  toggleBacklog: () => void
  setShowBacklog: (value: boolean) => void
  focusTask: (id: string | null) => void
  focusNextTask: (allTaskIds: string[]) => void
  focusPrevTask: (allTaskIds: string[]) => void
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],
  selectedTaskId: null,
  showArchived: false,
  showBacklog: false,
  focusedTaskId: null,
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((s) => {
    if (s.tasks.some((t) => t.id === task.id)) return s
    return { tasks: [...s.tasks, task] }
  }),
  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTask: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
      focusedTaskId: s.focusedTaskId === id ? null : s.focusedTaskId,
    })),
  selectTask: (id) => set({ selectedTaskId: id }),
  toggleArchived: () => set((s) => ({ showArchived: !s.showArchived })),
  toggleBacklog: () =>
    set((s) => {
      const next = !s.showBacklog
      persistBacklogPref(next)
      return { showBacklog: next }
    }),
  setShowBacklog: (value) => {
    persistBacklogPref(value)
    set({ showBacklog: value })
  },
  focusTask: (id) => set({ focusedTaskId: id }),
  focusNextTask: (allTaskIds) =>
    set((s) => {
      if (allTaskIds.length === 0) return s
      const idx = s.focusedTaskId ? allTaskIds.indexOf(s.focusedTaskId) : -1
      const next = idx < allTaskIds.length - 1 ? idx + 1 : 0
      return { focusedTaskId: allTaskIds[next] }
    }),
  focusPrevTask: (allTaskIds) =>
    set((s) => {
      if (allTaskIds.length === 0) return s
      const idx = s.focusedTaskId ? allTaskIds.indexOf(s.focusedTaskId) : allTaskIds.length
      const prev = idx > 0 ? idx - 1 : allTaskIds.length - 1
      return { focusedTaskId: allTaskIds[prev] }
    }),
}))
