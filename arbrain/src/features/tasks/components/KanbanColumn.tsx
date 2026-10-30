'use client'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { TaskCard } from './TaskCard'
import type { TaskStatus, TaskWithAssignees } from '@/types/database'

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Algún día',
  todo: 'Por hacer',
  in_progress: 'En curso',
  done: 'Hecho',
  archived: 'Archivado',
}

// Dot semántico por estado (Linear-style): el color cuenta la historia de la columna
const STATUS_DOT: Record<TaskStatus, string> = {
  backlog: 'bg-muted/50',
  todo: 'bg-accent-purple shadow-[0_0_8px_rgba(139,92,246,0.6)]',
  in_progress: 'bg-gold shadow-[0_0_8px_rgba(255,145,1,0.6)]',
  done: 'bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)]',
  archived: 'bg-muted/30',
}

interface KanbanColumnProps {
  status: TaskStatus
  tasks: TaskWithAssignees[]
}

export function KanbanColumn({ status, tasks }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: 'column', status },
  })

  const taskIds = tasks.map((t) => t.id)

  return (
    <div
      ref={setNodeRef}
      className={`
        solid-card flex-shrink-0 w-72 flex flex-col overflow-hidden
        transition-all duration-200
        ${isOver ? '!border-border-accent !shadow-depth-hover' : ''}
      `}
    >
      {/* Specular rim */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent rounded-t-2xl" />

      {/* Column Header */}
      <div className="relative px-3 pt-3 pb-2 border-b border-border-subtle">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} aria-hidden />
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted">
              {STATUS_LABELS[status]}
            </h3>
            <span className="text-[10px] font-medium text-muted/80 bg-card-hover px-2 py-0.5 rounded-full min-w-[24px] text-center tabular-nums">
              {tasks.length}
            </span>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.length > 0 ? (
            tasks.map((task) => <TaskCard key={task.id} task={task} />)
          ) : (
            <div className={`flex items-center justify-center h-20 m-1 rounded-xl border border-dashed transition-colors duration-200 ${isOver ? 'border-border-accent bg-primary/5' : 'border-border-subtle'}`}>
              <p className="text-xs text-muted/60">{isOver ? 'Suelta aquí' : 'Sin tareas'}</p>
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  )
}
