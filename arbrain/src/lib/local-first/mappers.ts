import type { CalendarEvent } from '@/features/calendar/types'
import type { TaskPriority, TaskStatus, TaskWithAssignees } from '@/types/database'
import type { LocalEventRecord, LocalTaskRecord } from './types'

export function localTaskToTaskWithAssignees(task: LocalTaskRecord): TaskWithAssignees {
  return {
    id: task.id,
    sequence_number: 0,
    title: task.title,
    description: task.description ?? '',
    status: (task.status ?? 'backlog') as TaskStatus,
    priority: (task.priority ?? 0) as TaskPriority,
    tags: task.syncStatus ? [`local:${task.syncStatus}`] : null,
    border_color: task.syncStatus === 'failed' ? '#f97316' : '#06b6d4',
    session_key: null,
    openclaw_run_id: null,
    started_at: null,
    due_at: task.dueAt ?? null,
    estimate: null,
    parent_task_id: null,
    position: 0,
    used_coding_tools: null,
    tenant_id: null,
    created_at: task.updatedAt,
    updated_at: task.updatedAt,
    assignees: [],
    labels: [],
    subtasks: [],
  }
}

export function localEventToCalendarEvent(event: LocalEventRecord): CalendarEvent {
  return {
    id: event.id,
    googleEventId: event.cloudId ?? undefined,
    googleCalendarId: event.calendarId ?? 'local',
    accountEmail: event.accountEmail ?? 'local@mission-control',
    accountType: 'personal',
    account: 'personal',
    calendarName: 'Local Workspace',
    title: event.title,
    description: event.description ?? null,
    location: null,
    start: event.startsAt,
    end: event.endsAt ?? event.startsAt,
    allDay: /^\d{4}-\d{2}-\d{2}$/.test(event.startsAt),
    color: event.status === 'failed' ? '#f97316' : '#06b6d4',
    textColor: '#ffffff',
    editable: true,
    kind: 'google_event',
    status: event.status ?? 'queued',
    raw: {
      localFirst: true,
      syncStatus: event.status ?? 'queued',
    },
  }
}
