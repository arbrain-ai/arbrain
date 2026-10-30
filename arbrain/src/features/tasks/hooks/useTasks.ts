'use client'
import { useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTasksStore } from '@/shared/stores/tasks-store'
import { listLocalTasks, localTaskToTaskWithAssignees, onLocalFirstChanged, cacheSnapshot, getCachedSnapshot } from '@/lib/local-first'
import type { LocalTaskRecord } from '@/lib/local-first'
import type { Profile, Label, Task, TaskStatus, TaskPriority, TaskWithAssignees } from '@/types/database'

interface TaskAssigneeRow {
  id: string
  task_id: string
  profile_id: string | null
  assigned_at: string | null
  profiles: Profile | null
}

interface TaskLabelRow {
  labels: Label | null
}

interface SubtaskRow {
  id: string
  status: string
}

interface TaskRow {
  id: string
  sequence_number: number
  title: string
  description: string
  status: string
  priority: number
  tags: string[] | null
  border_color: string | null
  session_key: string | null
  openclaw_run_id: string | null
  started_at: string | null
  due_at: string | null
  estimate: number | null
  parent_task_id: string | null
  position: number
  used_coding_tools: boolean | null
  tenant_id: string | null
  created_at: string | null
  updated_at: string | null
  task_assignees: TaskAssigneeRow[]
  task_labels?: TaskLabelRow[]
  subtasks?: SubtaskRow[]
}

function transformTask(row: TaskRow): TaskWithAssignees {
  const assignees: Profile[] = row.task_assignees
    .map((ta) => ta.profiles)
    .filter((profile): profile is Profile => profile !== null)

  const labels: Label[] = (row.task_labels ?? [])
    .map((tl) => tl.labels)
    .filter((label): label is Label => label !== null)

  const subtasks: Task[] = (row.subtasks ?? []).map((s) => ({
    id: s.id,
    sequence_number: 0,
    title: '',
    description: '',
    status: s.status as TaskStatus,
    priority: 0 as TaskPriority,
    tags: null,
    border_color: null,
    session_key: null,
    openclaw_run_id: null,
    started_at: null,
    due_at: null,
    estimate: null,
    parent_task_id: row.id,
    position: 0,
    used_coding_tools: null,
    tenant_id: null,
    created_at: null,
    updated_at: null,
  }))

  return {
    id: row.id,
    sequence_number: row.sequence_number,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: (row.priority ?? 0) as TaskPriority,
    tags: row.tags,
    border_color: row.border_color,
    session_key: row.session_key,
    openclaw_run_id: row.openclaw_run_id,
    started_at: row.started_at,
    due_at: row.due_at,
    estimate: row.estimate,
    parent_task_id: row.parent_task_id,
    position: row.position ?? 0,
    used_coding_tools: row.used_coding_tools,
    tenant_id: row.tenant_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    assignees,
    labels,
    subtasks,
  }
}

function isDirtyLocalTask(task: LocalTaskRecord) {
  if (!task.cloudId) return true
  return ['local', 'queued', 'syncing', 'failed', 'conflict'].includes(task.syncStatus ?? '')
}

function mergeCloudAndLocalTasks(cloudTasks: TaskWithAssignees[], localRows: LocalTaskRecord[]) {
  const dirtyLocalRows = localRows.filter(isDirtyLocalTask)
  const dirtyLocalTasks = dirtyLocalRows.map(localTaskToTaskWithAssignees)
  const dirtyLocalIds = new Set(dirtyLocalRows.map((task) => task.id))
  const dirtyLocalCloudIds = new Set(dirtyLocalRows.map((task) => task.cloudId).filter((id): id is string => Boolean(id)))

  return [
    ...dirtyLocalTasks,
    ...cloudTasks.filter((task) => !dirtyLocalIds.has(task.id) && !dirtyLocalCloudIds.has(task.id)),
  ]
}

export function useTasks() {
  const { tasks, setTasks, addTask, updateTask, removeTask } = useTasksStore()

  const fetchSingleTask = useCallback(async (taskId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('tasks')
      .select('*, task_assignees(*, profiles(*)), task_labels(labels(*)), subtasks:tasks!parent_task_id(id, status)')
      .eq('id', taskId)
      .single()

    if (data) {
      return transformTask(data as unknown as TaskRow)
    }
    return null
  }, [])

  const loadTasks = useCallback(async () => {
    const localRows = await listLocalTasks()
      .catch(() => [])

    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' })
      const json = await res.json().catch(() => ({})) as { tasks?: TaskRow[]; error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      const cloudTasks = json.tasks ? (json.tasks as unknown as TaskRow[]).map(transformTask) : []
      setTasks(mergeCloudAndLocalTasks(cloudTasks, localRows))
      cacheSnapshot('tasks', 'tasks:board', cloudTasks).catch(() => {})
    } catch {
      const cached = await getCachedSnapshot<TaskWithAssignees[]>('tasks:board').catch(() => null)
      if (cached?.length) setTasks(mergeCloudAndLocalTasks(cached, localRows))
      else setTasks(localRows.map(localTaskToTaskWithAssignees))
    }
  }, [setTasks])

  useEffect(() => {
    const supabase = createClient()

    // Stale-while-revalidate: pinta el board cacheado al instante si el store esta vacio.
    let activeEager = true
    getCachedSnapshot<TaskWithAssignees[]>('tasks:board')
      .then(async (cached) => {
        if (!activeEager || !cached?.length) return
        if (useTasksStore.getState().tasks.length > 0) return
        const localRows = await listLocalTasks().catch(() => [])
        if (activeEager && useTasksStore.getState().tasks.length === 0) {
          setTasks(mergeCloudAndLocalTasks(cached, localRows))
        }
      })
      .catch(() => {})

    loadTasks()
    const offLocalChange = onLocalFirstChanged(loadTasks)

    // Realtime subscription on tasks table.
    // Nombre de canal ÚNICO por montaje: el cliente browser es singleton y
    // supabase dedupea canales por topic — dos montajes vivos (p.ej. board y
    // calendar bajo KeepAliveRouter) sobre el MISMO topic truenan con
    // "cannot add postgres_changes callbacks after subscribe()".
    const channel = supabase
      .channel(`tasks-changes-${Math.random().toString(36).slice(2, 9)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks' },
        async (payload) => {
          const task = await fetchSingleTask(payload.new.id as string)
          if (task) {
            addTask(task)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks' },
        (payload) => {
          const updated = payload.new as Record<string, unknown>
          updateTask(updated.id as string, {
            sequence_number: updated.sequence_number as number,
            title: updated.title as string,
            description: updated.description as string,
            status: updated.status as TaskStatus,
            priority: (updated.priority as number ?? 0) as TaskPriority,
            tags: updated.tags as string[] | null,
            border_color: updated.border_color as string | null,
            session_key: updated.session_key as string | null,
            openclaw_run_id: updated.openclaw_run_id as string | null,
            started_at: updated.started_at as string | null,
            due_at: updated.due_at as string | null,
            estimate: updated.estimate as number | null,
            parent_task_id: updated.parent_task_id as string | null,
            position: updated.position as number ?? 0,
            used_coding_tools: updated.used_coding_tools as boolean | null,
            tenant_id: updated.tenant_id as string | null,
            created_at: updated.created_at as string | null,
            updated_at: updated.updated_at as string | null,
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tasks' },
        (payload) => {
          const deleted = payload.old as Record<string, unknown>
          removeTask(deleted.id as string)
        }
      )
      .subscribe()

    return () => {
      activeEager = false
      offLocalChange()
      supabase.removeChannel(channel)
    }
  }, [addTask, updateTask, removeTask, fetchSingleTask, loadTasks, setTasks])

  return { tasks }
}
