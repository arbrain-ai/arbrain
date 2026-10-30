'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useTasksStore } from '@/shared/stores/tasks-store'
import { PRIORITY_CONFIG, STATUS_CONFIG, formatDueDate, getDueDateColor } from '../utils/priority'
import type { TaskWithAssignees } from '@/types/database'

// AI-first (11 jul 2026): la card es RENDER PURO + drag. Los quick-editors
// (título inline, popover de assign, menú de status/priority) se podaron:
// editar = hablar con Levy. Quedan como acciones rápidas solo el drag de
// columna y el botón de archivar (misma clase: cambio de status).

interface TaskCardProps {
  task: TaskWithAssignees
  isDragOverlay?: boolean
}

export function TaskCard({ task, isDragOverlay }: TaskCardProps) {
  const { role } = useAuth()
  const canArchive = role === 'owner' || role === 'admin'

  const selectTask = useTasksStore((s) => s.selectTask)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const updateTask = useTasksStore((s) => s.updateTask)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation()
    updateTask(task.id, { status: 'archived' })
    const supabase = createClient()
    await supabase.from('tasks').update({ status: 'archived' }).eq('id', task.id)
  }

  const isSelected = selectedTaskId === task.id
  const isFocused = useTasksStore((s) => s.focusedTaskId === task.id)
  const firstAssignee = task.assignees[0]

  const borderStyle = task.border_color
    ? { borderLeftColor: task.border_color, borderLeftWidth: '3px' }
    : {}

  const priority = task.priority ?? 0
  const priorityConfig = PRIORITY_CONFIG[priority]
  const statusConfig = STATUS_CONFIG[task.status]
  const dueDateStr = formatDueDate(task.due_at)
  const dueDateColor = getDueDateColor(task.due_at)
  const labels = task.labels ?? []
  const taskId = `MC-${task.sequence_number}`
  const subtaskCount = task.subtasks?.length ?? 0
  const subtaskDone = task.subtasks?.filter((s) => s.status === 'done').length ?? 0
  const createdDate = task.created_at
    ? new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={{ ...style, ...borderStyle }}
      {...(isDragOverlay ? {} : attributes)}
      {...(isDragOverlay ? {} : listeners)}
      onClick={() => selectTask(task.id)}
      className={`
        card-interactive p-3 cursor-grab active:cursor-grabbing
        ${isSelected ? '!bg-card-active !border-border-accent shadow-depth-anchor' : ''}
        ${isFocused && !isSelected ? 'ring-1 ring-border-accent !bg-card-hover' : ''}
        ${isDragOverlay ? 'shadow-elevation-lg rotate-2 scale-105' : ''}
      `}
    >
      {/* Top row: Status icon + ID + Priority + Labels */}
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className={`text-[10px] leading-none ${statusConfig.color}`}>{statusConfig.icon}</span>
        <span className="text-[10px] font-mono text-muted leading-none">{taskId}</span>
        {priority > 0 && (
          <span className={`text-[10px] ${priorityConfig.color}`}>
            {priorityConfig.icon}
          </span>
        )}
        {labels.slice(0, 2).map((label) => (
          <span
            key={label.id}
            className="text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${label.color}20`, color: label.color }}
          >
            {label.name}
          </span>
        ))}
        {labels.length > 2 && (
          <span className="text-[9px] text-muted/80">+{labels.length - 2}</span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-foreground line-clamp-2 mb-2">
        {task.title}
      </h4>

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-md bg-card-hover text-muted border border-border-subtle"
            >
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-[10px] text-muted/80">
              +{task.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer: Assignee + Due Date + Timestamp */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5">
          {firstAssignee && (
            <>
              {firstAssignee.avatar_url ? (
                <img src={firstAssignee.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-card-active flex items-center justify-center text-[10px] text-foreground/70">
                  {(firstAssignee.full_name ?? '?')[0]}
                </div>
              )}
              <span className="text-[11px] text-muted truncate max-w-[80px]">
                {firstAssignee.full_name ?? 'User'}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {subtaskCount > 0 && (
            <span className="text-[10px] text-muted/80 flex-shrink-0">
              {subtaskDone}/{subtaskCount}
            </span>
          )}
          {dueDateStr && (
            <span className={`text-[10px] flex-shrink-0 ${dueDateColor}`}>
              {dueDateStr}
            </span>
          )}
          {task.estimate && (
            <span className="text-[10px] text-muted/70 bg-card px-1 py-0.5 rounded">
              {task.estimate}pt
            </span>
          )}
          {!dueDateStr && createdDate && (
            <span className="text-[10px] text-muted/70 flex-shrink-0">
              {createdDate}
            </span>
          )}
          {canArchive && task.status !== 'archived' && (
            <button
              onClick={handleArchive}
              title="Archivar"
              className="text-muted/60 hover:text-foreground/70 transition-colors flex-shrink-0 -mr-0.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
