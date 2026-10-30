import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasRole } from '@/lib/auth-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireTaskUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await hasRole(user.id, 'owner', 'admin'))) {
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, error: null }
}

export async function GET() {
  const auth = await requireTaskUser()
  if (auth.error) return auth.error

  const service = createServiceClient()
  const { data, error } = await service
    .from('tasks')
    .select('*, task_assignees(*, profiles(*)), task_labels(labels(*)), subtasks:tasks!parent_task_id(id, status)')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    console.error('[api/tasks GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tasks: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireTaskUser()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({})) as {
    title?: string
    description?: string | null
    status?: string | null
    priority?: number | null
    due_at?: string | null
    assignee_id?: string | null
    label_ids?: string[]
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Task title is required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: task, error } = await service
    .from('tasks')
    .insert({
      title: body.title.trim(),
      description: body.description ?? '',
      status: body.status ?? 'backlog',
      priority: body.priority ?? 0,
      due_at: body.due_at ?? null,
    })
    .select('*')
    .single()

  if (error || !task) {
    return NextResponse.json({ error: error?.message ?? 'Task insert failed' }, { status: 500 })
  }

  if (body.assignee_id) {
    await service.from('task_assignees').insert({ task_id: task.id, profile_id: body.assignee_id }).then(() => undefined)
  }

  if (body.label_ids?.length) {
    await service
      .from('task_labels')
      .insert(body.label_ids.map((labelId) => ({ task_id: task.id, label_id: labelId })))
      .then(() => undefined)
  }

  const { data: hydrated } = await service
    .from('tasks')
    .select('*, task_assignees(*, profiles(*)), task_labels(labels(*)), subtasks:tasks!parent_task_id(id, status)')
    .eq('id', task.id)
    .single()

  return NextResponse.json({ task: hydrated ?? task })
}

export async function PATCH(request: Request) {
  const auth = await requireTaskUser()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({})) as {
    id?: string
    status?: string | null
  }

  if (!body.id) {
    return NextResponse.json({ error: 'Task id is required' }, { status: 400 })
  }

  const allowedStatuses = new Set(['backlog', 'todo', 'in_progress', 'review', 'done', 'archived'])
  if (!body.status || !allowedStatuses.has(body.status)) {
    return NextResponse.json({ error: 'Valid task status is required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('tasks')
    .update({ status: body.status })
    .eq('id', body.id)
    .select('*, task_assignees(*, profiles(*)), task_labels(labels(*)), subtasks:tasks!parent_task_id(id, status)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task: data })
}
