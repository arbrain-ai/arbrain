import { NextResponse } from 'next/server'
import { isLocalDesktopUserId } from '@/lib/desktop-auth'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { instalacion } from '@/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OWNER_PROFILE_ID = instalacion().idPerfilDueno

type LocalTaskPayload = {
  id?: string
  cloudId?: string | null
  title?: string
  description?: string | null
  status?: string | null
  priority?: number | null
  dueAt?: string | null
  assigneeId?: string | null
}

type LocalDrawingPayload = {
  id?: string
  cloudId?: string | null
  title?: string
  dataJson?: string
  deletedAt?: string | null
}

function cloudIdFrom(payload: { id?: string; cloudId?: string | null }, localPrefix: string) {
  if (payload.cloudId) return payload.cloudId
  if (payload.id && !payload.id.startsWith(localPrefix)) return payload.id
  return null
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return user
}

async function syncTask(service: ReturnType<typeof createServiceClient>, payload: LocalTaskPayload) {
  if (!payload.title?.trim()) throw new Error('Task title is required')

  const cloudId = cloudIdFrom(payload, 'local_task_')
  const row = {
    title: payload.title.trim(),
    description: payload.description ?? '',
    status: payload.status ?? 'backlog',
    priority: payload.priority ?? 0,
    due_at: payload.dueAt ?? null,
    updated_at: new Date().toISOString(),
  }

  if (cloudId) {
    const { data, error } = await service
      .from('tasks')
      .update(row)
      .eq('id', cloudId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (data?.id) return data.id as string
  }

  const { data, error } = await service
    .from('tasks')
    .insert(row)
    .select('id')
    .single()
  if (error || !data?.id) throw new Error(error?.message ?? 'Failed to insert task')

  if (payload.assigneeId) {
    await service
      .from('task_assignees')
      .insert({ task_id: data.id, profile_id: payload.assigneeId })
      .then(() => undefined)
  }

  return data.id as string
}

async function syncDrawing(
  service: ReturnType<typeof createServiceClient>,
  payload: LocalDrawingPayload,
  userId: string,
) {
  const cloudId = cloudIdFrom(payload, 'local_drawing_')

  if (payload.deletedAt) {
    if (!cloudId) return null
    const { error } = await service
      .from('draw')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('page_id', cloudId)
    if (error) throw error
    return cloudId
  }

  const pageElements = payload.dataJson
    ? JSON.parse(payload.dataJson) as Record<string, unknown>
    : { elements: [], files: {}, schemaVersion: 3 }
  const row = {
    name: payload.title ?? 'Canvas',
    page_elements: pageElements,
    updated_at: new Date().toISOString(),
  }

  if (cloudId) {
    const { data, error } = await service
      .from('draw')
      .update(row)
      .eq('page_id', cloudId)
      .select('page_id')
      .maybeSingle()
    if (error) throw error
    if (data?.page_id) return data.page_id as string
  }

  const ownerId = isLocalDesktopUserId(userId) ? OWNER_PROFILE_ID : userId
  const { data, error } = await service
    .from('draw')
    .insert({
      user_id: ownerId,
      name: row.name,
      page_elements: row.page_elements,
      agent_version: 0,
    })
    .select('page_id')
    .single()
  if (error || !data?.page_id) throw new Error(error?.message ?? 'Failed to insert drawing')
  return data.page_id as string
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({})) as {
      entityType?: string
      payload?: unknown
    }
    const service = createServiceClient()

    if (body.entityType === 'task') {
      const cloudId = await syncTask(service, body.payload as LocalTaskPayload)
      return NextResponse.json({ ok: true, cloudId })
    }

    if (body.entityType === 'drawing') {
      const cloudId = await syncDrawing(service, body.payload as LocalDrawingPayload, user.id)
      return NextResponse.json({ ok: true, cloudId })
    }

    return NextResponse.json({ error: `Unsupported entity type: ${body.entityType ?? 'unknown'}` }, { status: 400 })
  } catch (error) {
    console.error('[api/local-first/sync]', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Sync failed',
    }, { status: 500 })
  }
}
