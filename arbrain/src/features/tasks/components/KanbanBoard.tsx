'use client'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useTasksStore, readBacklogPref } from '@/shared/stores/tasks-store'
import { useFiltersStore, type DueHorizon } from '@/shared/stores/filters-store'
import { KanbanColumn } from './KanbanColumn'
import { TaskCard } from './TaskCard'
import { TaskDetailPanel } from './TaskDetailPanel'
import { FilterBar } from './FilterBar'
import { useAuth } from '@/hooks/useAuth'
import { useAskLevy } from '@/shared/hooks/useAskLevy'
import { sortTasksByPriorityThenDue } from '../utils/sort'
import { isOnline, upsertLocalTask } from '@/lib/local-first'
import type { TaskStatus, TaskWithAssignees } from '@/types/database'

// Lente d/w/m: due_at cae dentro del horizonte (hoy / esta semana / este mes).
function withinHorizon(dueAt: string | null, horizon: DueHorizon): boolean {
  if (!dueAt) return false
  const d = new Date(dueAt)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  if (horizon === 'today') return isWithinInterval(d, { start: startOfDay(now), end: endOfDay(now) })
  if (horizon === 'week') return isWithinInterval(d, { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) })
  return isWithinInterval(d, { start: startOfMonth(now), end: endOfMonth(now) })
}

const VISIBLE_STATUSES: TaskStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'done',
]

export function KanbanBoard() {
  const tasks = useTasksStore((s) => s.tasks)
  const showArchived = useTasksStore((s) => s.showArchived)
  const toggleArchived = useTasksStore((s) => s.toggleArchived)
  const showBacklog = useTasksStore((s) => s.showBacklog)
  const toggleBacklog = useTasksStore((s) => s.toggleBacklog)
  const setShowBacklog = useTasksStore((s) => s.setShowBacklog)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const updateTask = useTasksStore((s) => s.updateTask)

  const filters = useFiltersStore((s) => s.filters)

  const [activeTask, setActiveTask] = useState<TaskWithAssignees | null>(null)
  const { isOwner } = useAuth()
  const askLevy = useAskLevy()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Backlog is hidden by default (deliberate "someday" stash). Toggle in header
  // reveals it; preference persists in localStorage (see tasks-store).
  const base = showBacklog
    ? VISIBLE_STATUSES
    : VISIBLE_STATUSES.filter((s) => s !== 'backlog')
  const columns = showArchived ? [...base, 'archived' as TaskStatus] : base

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filters.priority !== null && (task.priority ?? 0) !== filters.priority) return false
      if (filters.assigneeId && !task.assignees.some((a) => a.id === filters.assigneeId)) return false
      if (filters.labelId && !(task.labels ?? []).some((l) => l.id === filters.labelId)) return false
      if (filters.status !== null && task.status !== filters.status) return false
      if (filters.dueHorizon && !withinHorizon(task.due_at, filters.dueHorizon)) return false
      if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase())) return false
      return true
    })
  }, [tasks, filters])

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, TaskWithAssignees[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      done: [],
      archived: [],
    }

    for (const task of filteredTasks) {
      if (grouped[task.status]) {
        grouped[task.status].push(task)
      }
    }

    for (const status of Object.keys(grouped) as TaskStatus[]) {
      grouped[status] = sortTasksByPriorityThenDue(grouped[status])
    }

    return grouped
  }, [filteredTasks])

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const taskId = event.active.id as string
      const task = tasks.find((t) => t.id === taskId)
      if (task) {
        setActiveTask(task)
      }
    },
    [tasks]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null)

      const { active, over } = event
      if (!over) return

      const taskId = active.id as string
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return

      let newStatus: TaskStatus

      const overData = over.data.current as
        | { type: string; status?: TaskStatus; task?: TaskWithAssignees }
        | undefined

      if (overData?.type === 'column' && overData.status) {
        newStatus = overData.status
      } else if (overData?.type === 'task' && overData.task) {
        newStatus = overData.task.status
      } else {
        const possibleStatus = over.id as string
        if (columns.includes(possibleStatus as TaskStatus)) {
          newStatus = possibleStatus as TaskStatus
        } else {
          const overTask = tasks.find((t) => t.id === possibleStatus)
          if (overTask) {
            newStatus = overTask.status
          } else {
            return
          }
        }
      }

      if (task.status === newStatus) return

      updateTask(taskId, { status: newStatus })

      if (taskId.startsWith('local_task_') || !isOnline()) {
        upsertLocalTask({
          id: taskId,
          cloudId: taskId.startsWith('local_task_') ? null : taskId,
          title: task.title,
          description: task.description,
          status: newStatus,
          priority: task.priority ?? 0,
          dueAt: task.due_at,
          assigneeId: task.assignees[0]?.id ?? null,
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          syncStatus: 'queued',
        }).catch(console.error)
        return
      }

      const supabase = createClient()
      supabase.from('tasks').update({ status: newStatus }).eq('id', taskId).then(({ error }) => {
        if (!error) return
        upsertLocalTask({
          id: taskId,
          cloudId: taskId,
          title: task.title,
          description: task.description,
          status: newStatus,
          priority: task.priority ?? 0,
          dueAt: task.due_at,
          assigneeId: task.assignees[0]?.id ?? null,
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          syncStatus: 'queued',
        }).catch(console.error)
      })
    },
    [tasks, columns, updateTask]
  )

  // Hydrate persisted Backlog visibility preference (localStorage) after mount
  // to avoid SSR/hydration mismatch (server always renders hidden).
  useEffect(() => {
    setShowBacklog(readBacklogPref())
  }, [setShowBacklog])

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <FilterBar />

      {/* Board header actions */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        {isOwner ? (
          <button
            onClick={() => askLevy('Crea una tarea: ')}
            className="btn-primary text-xs"
            title="Abre el chat con el draft listo; tú lo completas y lo mandas."
          >
            <Plus size={14} strokeWidth={2} />
            Pedir a Levy
          </button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleBacklog}
            className={`btn-secondary text-[11px] px-2.5 py-1 ${showBacklog ? 'nav-item-active' : ''}`}
          >
            {showBacklog ? 'Ocultar Algún día' : 'Mostrar Algún día'}
          </button>
          <button
            onClick={toggleArchived}
            className={`btn-secondary text-[11px] px-2.5 py-1 ${showArchived ? 'nav-item-active' : ''}`}
          >
            {showArchived ? 'Ocultar archivadas' : 'Mostrar archivadas'}
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 flex gap-4 overflow-x-auto px-4 pb-4">
            {columns.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tasks={tasksByStatus[status]}
              />
            ))}
          </div>

          {/* El DragOverlay se PORTALEA a <body> (bug del card que cae ~ancho-del-sidebar
              a la derecha, 21 jul 2026). Causa raíz: el wrapper de página `.page-enter`
              (en <main>, después del sidebar) corre una animación con keyframes de
              `transform` y fill `both`; en WebKit eso deja a `.page-enter` como bloque
              CONTENEDOR de los hijos position:fixed AUN después de terminar (transform
              computado = none, pero el CB persiste). El DragOverlay (fixed) quedaba
              posicionado relativo a <main>, no al viewport → su getBoundingClientRect
              `left` (coords de viewport) se aplicaba +offset-del-main ≈ ancho del
              sidebar. Portalearlo a <body> lo saca de ese CB → se posiciona contra el
              viewport y cae bajo el cursor. Verificado en WebKit: fixed dentro de un
              page-enter completado renderiza en la pos del padre; en <body>, en 0.
              (Nada de zoom: --ui-zoom = 1; el counter-zoom anterior era no-op erróneo.) */}
          {typeof document !== 'undefined' &&
            createPortal(
              <DragOverlay dropAnimation={null}>
                {activeTask ? (
                  <div className="w-72">
                    <TaskCard task={activeTask} isDragOverlay />
                  </div>
                ) : null}
              </DragOverlay>,
              document.body
            )}
        </DndContext>
      </div>

      {/* Task Detail Modal (overlay) */}
      {selectedTaskId && <TaskDetailPanel />}
    </div>
  )
}
