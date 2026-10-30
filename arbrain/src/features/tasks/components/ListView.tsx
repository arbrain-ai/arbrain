'use client'
import { useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTasksStore } from '@/shared/stores/tasks-store'
import { useFiltersStore } from '@/shared/stores/filters-store'
import { PRIORITY_CONFIG, STATUS_CONFIG as SHARED_STATUS_CONFIG, formatDueDate, getDueDateColor } from '../utils/priority'
import { TaskDetailPanel } from './TaskDetailPanel'
import { FilterBar } from './FilterBar'
import { useAuth } from '@/hooks/useAuth'
import { useAskLevy } from '@/shared/hooks/useAskLevy'
import { sortTasksByPriorityThenDue } from '../utils/sort'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import type { TaskStatus, TaskWithAssignees } from '@/types/database'

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  backlog: { label: 'Algún día', color: 'bg-card-active' },
  todo: { label: 'Por hacer', color: 'bg-blue-500/20' },
  in_progress: { label: 'En curso', color: 'bg-yellow-500/20' },
  done: { label: 'Hecho', color: 'bg-emerald-500/20' },
  archived: { label: 'Archivado', color: 'bg-card' },
}

const VISIBLE_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'done']

export function ListView() {
  const tasks = useTasksStore((s) => s.tasks)
  const showArchived = useTasksStore((s) => s.showArchived)
  const toggleArchived = useTasksStore((s) => s.toggleArchived)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const selectTask = useTasksStore((s) => s.selectTask)
  const updateTask = useTasksStore((s) => s.updateTask)

  const filters = useFiltersStore((s) => s.filters)
  const { isOwner } = useAuth()
  const askLevy = useAskLevy()

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const statuses = showArchived ? [...VISIBLE_STATUSES, 'archived' as TaskStatus] : VISIBLE_STATUSES

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filters.priority !== null && (task.priority ?? 0) !== filters.priority) return false
      if (filters.assigneeId && !task.assignees.some((a) => a.id === filters.assigneeId)) return false
      if (filters.labelId && !(task.labels ?? []).some((l) => l.id === filters.labelId)) return false
      if (filters.status !== null && task.status !== filters.status) return false
      if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase())) return false
      return true
    })
  }, [tasks, filters])

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, TaskWithAssignees[]> = {
      backlog: [], todo: [], in_progress: [], done: [], archived: [],
    }
    for (const task of filteredTasks) {
      if (grouped[task.status]) grouped[task.status].push(task)
    }
    for (const status of Object.keys(grouped) as TaskStatus[]) {
      grouped[status] = sortTasksByPriorityThenDue(grouped[status])
    }
    return grouped
  }, [filteredTasks])

  const toggleGroup = (status: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    updateTask(taskId, { status: newStatus })
    const supabase = createClient()
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
  }, [updateTask])

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <FilterBar />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        {isOwner ? (
          <button
            onClick={() => askLevy('Crea una tarea: ')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-card-active text-foreground/75 border border-border hover:bg-card-active hover:text-foreground transition-colors"
            title="Abre el chat con el draft listo; tú lo completas y lo mandas."
          >
            <Plus size={14} />
            Pedir a Levy
          </button>
        ) : (
          <div />
        )}
        <button
          onClick={toggleArchived}
          className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors
            ${showArchived ? 'bg-card-active border-border-accent text-foreground/70' : 'border-border-subtle text-muted/80 hover:text-muted hover:bg-card'}`}
        >
          {showArchived ? 'Ocultar archivadas' : 'Mostrar archivadas'}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Table */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Table Header */}
          <div className="sticky top-0 z-10 bg-background grid grid-cols-[60px_1fr_100px_100px_100px_80px] gap-2 px-3 py-2 border-b border-border-subtle text-[10px] uppercase tracking-widest text-muted/80 font-semibold">
            <span>ID</span>
            <span>Tarea</span>
            <span>Estado</span>
            <span>Prioridad</span>
            <span>Vence</span>
            <span>Est.</span>
          </div>

          {/* Grouped rows */}
          {statuses.map((status) => {
            const statusTasks = tasksByStatus[status]
            const isCollapsed = collapsedGroups.has(status)
            const config = STATUS_CONFIG[status]

            return (
              <div key={status} className="mb-1">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(status)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card rounded-lg transition-colors"
                >
                  {isCollapsed ? <ChevronRight size={12} className="text-muted/80" /> : <ChevronDown size={12} className="text-muted/80" />}
                  <span className={`w-2 h-2 rounded-full ${config.color}`} />
                  <span className="text-xs font-medium text-foreground/70">{config.label}</span>
                  <span className="text-[10px] text-muted/70 bg-card-hover px-1.5 py-0.5 rounded-full">{statusTasks.length}</span>
                </button>

                {/* Task rows */}
                {!isCollapsed && statusTasks.map((task) => {
                  const priority = task.priority ?? 0
                  const pConfig = PRIORITY_CONFIG[priority]
                  const dueDateStr = formatDueDate(task.due_at)
                  const dueDateColor = getDueDateColor(task.due_at)
                  const isSelected = selectedTaskId === task.id

                  const sConfig = SHARED_STATUS_CONFIG[task.status]

                  return (
                    <div
                      key={task.id}
                      onClick={() => selectTask(task.id)}
                      className={`grid grid-cols-[60px_1fr_100px_100px_100px_80px] gap-2 items-center px-3 py-2 rounded-lg cursor-pointer transition-colors
                        ${isSelected ? 'bg-card-active' : 'hover:bg-card'}
                      `}
                    >
                      {/* ID */}
                      <span className="text-[11px] font-mono text-muted flex items-center gap-1">
                        <span className={`leading-none ${sConfig.color}`}>{sConfig.icon}</span>
                        MC-{task.sequence_number}
                      </span>

                      {/* Title + assignee */}
                      <div className="flex items-center gap-2 min-w-0">
                        {task.assignees[0] && (
                          task.assignees[0].avatar_url ? (
                            <img src={task.assignees[0].avatar_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-card-active flex items-center justify-center text-[10px] text-foreground/70 flex-shrink-0">{(task.assignees[0].full_name ?? '?')[0]}</span>
                          )
                        )}
                        <span className="text-sm text-foreground truncate">{task.title}</span>
                        {(task.labels ?? []).length > 0 && (
                          <div className="flex gap-1 flex-shrink-0">
                            {(task.labels ?? []).slice(0, 2).map((l) => (
                              <span key={l.id} className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Status */}
                      <select
                        value={task.status}
                        onChange={(e) => { e.stopPropagation(); handleStatusChange(task.id, e.target.value as TaskStatus) }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent text-[11px] text-muted outline-none cursor-pointer"
                      >
                        {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                          <option key={val} value={val}>{cfg.label}</option>
                        ))}
                      </select>

                      {/* Priority */}
                      <span className={`text-[11px] ${pConfig.color}`}>
                        {priority > 0 ? `${pConfig.icon} ${pConfig.label}` : '—'}
                      </span>

                      {/* Due date */}
                      <span className={`text-[11px] ${dueDateColor}`}>
                        {dueDateStr || '—'}
                      </span>

                      {/* Estimate */}
                      <span className="text-[11px] text-muted/80">
                        {task.estimate ? `${task.estimate}pt` : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Detail Panel */}
        {selectedTaskId && <TaskDetailPanel />}
      </div>
    </div>
  )
}
