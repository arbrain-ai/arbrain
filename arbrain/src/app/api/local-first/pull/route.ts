import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getUserRole } from '@/lib/auth-utils'
import { listMirrorCalendarEvents, listMirrorCalendarSources } from '@/lib/calendar/mirror'
import { writeCanvasPagesToCache } from '@/lib/local-first/server-canvas-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PullPayload = {
  pulledAt: string
  range: { from: string; to: string }
  tasks: unknown[]
  drawings: unknown[]
  calendarEvents: unknown[]
  calendarSources: unknown[]
  snapshots: Record<string, { module: string; payload: unknown }>
  errors: string[]
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, role: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const role = await getUserRole(user.id)
  if (!role) return { user: null, role: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  return { user, role, error: null }
}

async function safe<T>(label: string, errors: string[], fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : 'failed'}`)
    return fallback
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.error

  const { searchParams } = request.nextUrl
  const from = searchParams.get('from') ?? new Date(Date.now() - 60 * 86400000).toISOString()
  const to = searchParams.get('to') ?? new Date(Date.now() + 180 * 86400000).toISOString()
  const pulledAt = new Date().toISOString()
  const errors: string[] = []
  const service = createServiceClient()

  const [tasks, drawings, calendarData, sourceData, opsEvents, sessions, cronHistory, activityAnalytics] = await Promise.all([
    safe('tasks', errors, async () => {
      const { data, error } = await service
        .from('tasks')
        .select('id, title, description, status, priority, due_at, created_at, updated_at, task_assignees(profile_id)')
        .order('updated_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data ?? []
    }, []),

    safe('drawings', errors, async () => {
      const { data, error } = await service
        .from('draw')
        .select('page_id, name, page_elements, created_at, updated_at')
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data ?? []
    }, []),

    safe('calendar events', errors, () => listMirrorCalendarEvents({
      from,
      to,
      role: auth.role,
    }), { events: [], syncHealth: { state: 'stale' as const } }),

    safe('calendar sources', errors, () => listMirrorCalendarSources({ role: auth.role }), {
      sources: [],
      syncHealth: { state: 'stale' as const },
    }),

    safe('ops events', errors, async () => {
      const { data, error } = await service
        .from('ops_events')
        .select('id, event_id, type, source, session_id, data, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.event_id,
        type: row.type,
        timestamp: new Date(row.created_at).getTime(),
        source: row.source,
        sessionId: row.session_id ?? undefined,
        data: row.data ?? {},
      }))
    }, []),

    safe('sessions', errors, async () => {
      const { data, error } = await service
        .from('chat_sessions')
        .select('id, title, is_favorite, created_at, updated_at, chat_messages(count)')
        .order('updated_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map((session) => ({
        id: session.id,
        title: session.title,
        is_favorite: session.is_favorite,
        created_at: session.created_at,
        updated_at: session.updated_at,
        message_count: ((session.chat_messages as Array<{ count: number }> | null)?.[0]?.count ?? 0),
      }))
    }, []),

    safe('cron history', errors, async () => {
      const { data, error } = await service
        .from('conversations')
        .select('id, run_id, prompt, response, error, status, created_at')
        .eq('source', 'cron')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.id,
        run_id: row.run_id,
        job_id: row.prompt,
        response: row.response,
        error: row.error,
        status: row.status,
        created_at: row.created_at,
      }))
    }, []),

    safe('activity analytics', errors, async () => {
      const [agentsRes, tasksRes, activitiesRes] = await Promise.all([
        service.from('agents').select('*'),
        service.from('tasks').select('*, task_assignees(agent_id)').limit(1000),
        service.from('activities').select('*').order('created_at', { ascending: false }).limit(500),
      ])
      if (agentsRes.error) throw agentsRes.error
      if (tasksRes.error) throw tasksRes.error
      if (activitiesRes.error) throw activitiesRes.error
      return {
        agents: agentsRes.data ?? [],
        tasks: tasksRes.data ?? [],
        activities: activitiesRes.data ?? [],
      }
    }, { agents: [], tasks: [], activities: [] }),
  ])

  const payload: PullPayload = {
    pulledAt,
    range: { from, to },
    tasks,
    drawings,
    calendarEvents: calendarData.events,
    calendarSources: sourceData.sources,
    snapshots: {
      'ops:events': { module: 'ops', payload: opsEvents },
      'ops:sessions': { module: 'ops', payload: sessions },
      'cron:history': { module: 'ops', payload: cronHistory },
      'activity:analytics': { module: 'activity', payload: activityAnalytics },
      'calendar:sources': { module: 'calendar', payload: sourceData.sources },
      'calendar:health': {
        module: 'calendar',
        payload: {
          events: calendarData.syncHealth,
          sources: sourceData.syncHealth,
        },
      },
    },
    errors,
  }

  await writeCanvasPagesToCache(drawings as Parameters<typeof writeCanvasPagesToCache>[0]).catch((error) => {
    errors.push(`canvas cache: ${error instanceof Error ? error.message : 'failed'}`)
  })

  return NextResponse.json(payload)
}
