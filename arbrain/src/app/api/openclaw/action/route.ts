import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import webpush from 'web-push'
import { z } from 'zod'
import { instalacion } from '@/config'

// ---------------------------------------------------------------------------
// VAPID (lazy init for push notifications)
// ---------------------------------------------------------------------------

let vapidReady = false
function ensureVapid() {
  if (vapidReady) return false
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim()
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? '').trim()
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(
    `mailto:${(process.env.VAPID_EMAIL ?? instalacion().correoDueno).trim()}`,
    publicKey,
    privateKey,
  )
  vapidReady = true
  return true
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const baseSchema = z.object({
  agentId: z.string().optional(),
})

const createTaskSchema = baseSchema.extend({
  action: z.literal('create_task'),
  title: z.string().min(1),
  description: z.string().optional().default(''),
  status: z.enum(['backlog', 'todo', 'in_progress', 'done', 'archived']).optional().default('backlog'),
  tags: z.array(z.string()).optional().default([]),
  assignTo: z.string().optional(),
})

const updateTaskSchema = baseSchema.extend({
  action: z.literal('update_task'),
  taskId: z.string().uuid(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'done', 'archived']).optional(),
  tags: z.array(z.string()).optional(),
})

const queryTasksSchema = baseSchema.extend({
  action: z.literal('query_tasks'),
  status: z.enum(['backlog', 'todo', 'in_progress', 'done', 'archived']).optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
})

const logActivitySchema = baseSchema.extend({
  action: z.literal('log_activity'),
  type: z.string().min(1),
  message: z.string().min(1),
  taskId: z.string().uuid().optional(),
})

const updateAgentSchema = baseSchema.extend({
  action: z.literal('update_agent'),
  targetAgent: z.string().min(1),
  status: z.enum(['idle', 'active', 'blocked']).optional(),
})

const queryAgentsSchema = baseSchema.extend({
  action: z.literal('query_agents'),
})

const logConversationSchema = baseSchema.extend({
  action: z.literal('log_conversation'),
  prompt: z.string().min(1),
  response: z.string().min(1),
  source: z.string().optional().default('mission-control'),
})

const actionSchema = z.discriminatedUnion('action', [
  createTaskSchema,
  updateTaskSchema,
  queryTasksSchema,
  logActivitySchema,
  updateAgentSchema,
  queryAgentsSchema,
  logConversationSchema,
])

type ActionPayload = z.infer<typeof actionSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveAgentId(
  supabase: ReturnType<typeof createServiceClient>,
  agentKey: string,
): Promise<string | null> {
  // Try session_key first
  const { data: byKey } = await supabase
    .from('agents')
    .select('id')
    .eq('session_key', agentKey)
    .limit(1)
    .single()
  if (byKey) return byKey.id

  // Try name (case-insensitive)
  const { data: byName } = await supabase
    .from('agents')
    .select('id')
    .ilike('name', agentKey)
    .limit(1)
    .single()
  if (byName) return byName.id

  // Try UUID directly
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidRegex.test(agentKey)) return agentKey

  return null
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleCreateTask(
  supabase: ReturnType<typeof createServiceClient>,
  payload: z.infer<typeof createTaskSchema>,
) {
  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      title: payload.title,
      description: payload.description,
      status: payload.status,
      tags: payload.tags,
    })
    .select('id, title, status, created_at')
    .single()

  if (error || !task) {
    return { error: error?.message ?? 'Failed to create task' }
  }

  // Assign agent if requested
  if (payload.assignTo) {
    const assigneeId = await resolveAgentId(supabase, payload.assignTo)
    if (assigneeId) {
      await supabase.from('task_assignees').insert({
        task_id: task.id,
        agent_id: assigneeId,
      })

      // Send push notification to the assigned agent's linked user
      try {
        const { data: agent } = await supabase
          .from('agents')
          .select('user_id')
          .eq('id', assigneeId)
          .single()

        if (agent?.user_id) {
          ensureVapid()
          const { data: subs } = await supabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', agent.user_id)

          if (subs?.length) {
            const pushPayload = JSON.stringify({
              title: 'Nueva tarea asignada',
              body: task.title,
              url: '/board',
              tag: `task-assigned-${task.id}`,
              icon: '/icon-192.png',
            })
            await Promise.allSettled(
              subs.map((sub) =>
                webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                  pushPayload,
                ),
              ),
            )
          }
        }
      } catch (pushErr) {
        console.error('[openclaw/action] Push notification failed:', pushErr)
      }
    }
  }

  // Log activity
  if (payload.agentId) {
    const actorId = await resolveAgentId(supabase, payload.agentId)
    if (actorId) {
      await supabase.from('activities').insert({
        type: 'task_created',
        agent_id: actorId,
        message: `created task "${task.title}"`,
        target_id: task.id,
      })
    }
  }

  return { task }
}

async function handleUpdateTask(
  supabase: ReturnType<typeof createServiceClient>,
  payload: z.infer<typeof updateTaskSchema>,
) {
  const updates: Record<string, unknown> = {}
  if (payload.title !== undefined) updates.title = payload.title
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.status !== undefined) updates.status = payload.status
  if (payload.tags !== undefined) updates.tags = payload.tags

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update' }
  }

  const { data: task, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', payload.taskId)
    .select('id, title, status, updated_at')
    .single()

  if (error || !task) {
    return { error: error?.message ?? 'Failed to update task' }
  }

  // Log activity
  if (payload.agentId) {
    const actorId = await resolveAgentId(supabase, payload.agentId)
    if (actorId) {
      const changes = Object.keys(updates).join(', ')
      await supabase.from('activities').insert({
        type: 'task_updated',
        agent_id: actorId,
        message: `updated ${changes} on "${task.title}"`,
        target_id: task.id,
      })
    }
  }

  return { task }
}

async function handleQueryTasks(
  supabase: ReturnType<typeof createServiceClient>,
  payload: z.infer<typeof queryTasksSchema>,
) {
  let query = supabase
    .from('tasks')
    .select('id, title, status, tags, started_at, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(payload.limit)

  if (payload.status) {
    query = query.eq('status', payload.status)
  }

  const { data: tasks, error } = await query

  if (error) {
    return { error: error.message }
  }

  return { tasks: tasks ?? [] }
}

async function handleLogActivity(
  supabase: ReturnType<typeof createServiceClient>,
  payload: z.infer<typeof logActivitySchema>,
) {
  const agentId = payload.agentId
    ? await resolveAgentId(supabase, payload.agentId)
    : null

  if (!agentId) {
    return { error: 'Could not resolve agent' }
  }

  const { data: activity, error } = await supabase
    .from('activities')
    .insert({
      type: payload.type,
      agent_id: agentId,
      message: payload.message,
      target_id: payload.taskId ?? null,
    })
    .select('id, type, message, created_at')
    .single()

  if (error || !activity) {
    return { error: error?.message ?? 'Failed to log activity' }
  }

  return { activity }
}

async function handleUpdateAgent(
  supabase: ReturnType<typeof createServiceClient>,
  payload: z.infer<typeof updateAgentSchema>,
) {
  const targetId = await resolveAgentId(supabase, payload.targetAgent)
  if (!targetId) {
    return { error: `Agent "${payload.targetAgent}" not found` }
  }

  const updates: Record<string, unknown> = {}
  if (payload.status !== undefined) updates.status = payload.status

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update' }
  }

  const { data: agent, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', targetId)
    .select('id, name, status, updated_at')
    .single()

  if (error || !agent) {
    return { error: error?.message ?? 'Failed to update agent' }
  }

  return { agent }
}

async function handleQueryAgents(
  supabase: ReturnType<typeof createServiceClient>,
) {
  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, name, role, status, session_key, current_task_id, updated_at')
    .order('name')

  if (error) {
    return { error: error.message }
  }

  return { agents: agents ?? [] }
}

async function handleLogConversation(
  supabase: ReturnType<typeof createServiceClient>,
  payload: z.infer<typeof logConversationSchema>,
) {
  const agentId = payload.agentId
    ? await resolveAgentId(supabase, payload.agentId)
    : null

  const { data: conv, error } = await supabase
    .from('conversations')
    .insert({
      run_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agent_id: agentId,
      prompt: payload.prompt,
      response: payload.response,
      source: payload.source,
      status: 'done',
    })
    .select('id, run_id, status, created_at')
    .single()

  if (error || !conv) {
    return { error: error?.message ?? 'Failed to log conversation' }
  }

  return { conversation: conv }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // Auth
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.OPENCLAW_GATEWAY_TOKEN

    if (!expectedToken) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    const token = authHeader?.replace('Bearer ', '')
    if (token !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse
    const body: unknown = await request.json()
    const parseResult = actionSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parseResult.error.format() },
        { status: 400 },
      )
    }

    const payload: ActionPayload = parseResult.data
    const supabase = createServiceClient()

    // Dispatch
    let result: Record<string, unknown>

    switch (payload.action) {
      case 'create_task':
        result = await handleCreateTask(supabase, payload)
        break
      case 'update_task':
        result = await handleUpdateTask(supabase, payload)
        break
      case 'query_tasks':
        result = await handleQueryTasks(supabase, payload)
        break
      case 'log_activity':
        result = await handleLogActivity(supabase, payload)
        break
      case 'update_agent':
        result = await handleUpdateAgent(supabase, payload)
        break
      case 'query_agents':
        result = await handleQueryAgents(supabase)
        break
      case 'log_conversation':
        result = await handleLogConversation(supabase, payload)
        break
    }

    const hasError = 'error' in result
    return NextResponse.json(
      { ok: !hasError, ...result },
      { status: hasError ? 400 : 200 },
    )
  } catch (err) {
    console.error('[openclaw/action] Unhandled error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
