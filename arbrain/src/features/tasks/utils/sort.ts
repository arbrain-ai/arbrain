import type { TaskWithAssignees } from '@/types/database'

const PRIORITY_RANK: Record<number, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  0: 4,
}

function priorityRank(priority: number | null | undefined) {
  return PRIORITY_RANK[priority ?? 0] ?? 4
}

function dueTime(task: TaskWithAssignees) {
  if (!task.due_at) return Number.POSITIVE_INFINITY
  const time = new Date(task.due_at).getTime()
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

function createdTime(task: TaskWithAssignees) {
  if (!task.created_at) return 0
  const time = new Date(task.created_at).getTime()
  return Number.isNaN(time) ? 0 : time
}

function compareTasksByPriorityThenDue(a: TaskWithAssignees, b: TaskWithAssignees) {
  const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority)
  if (priorityDelta !== 0) return priorityDelta

  const dueDelta = dueTime(a) - dueTime(b)
  if (dueDelta !== 0) return dueDelta

  return createdTime(b) - createdTime(a)
}

export function sortTasksByPriorityThenDue(tasks: TaskWithAssignees[]) {
  return [...tasks].sort(compareTasksByPriorityThenDue)
}
