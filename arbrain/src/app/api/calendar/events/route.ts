import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { canUseAccount, logCalendarActivity, requireCalendarUser } from '@/lib/calendar/api-auth'
import { createGoogleCalendarEvent, listCalendarEvents } from '@/lib/calendar/gog-bridge'
import { listMirrorCalendarEvents, listMirrorCalendarSources } from '@/lib/calendar/mirror'

export const runtime = 'nodejs'

const createEventSchema = z.object({
  accountEmail: z.string().email(),
  googleCalendarId: z.string().min(1),
  title: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.boolean().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string().email()).optional(),
  recurrence: z.array(z.string()).optional(),
  reminders: z.array(z.object({
    method: z.enum(['popup', 'email']),
    minutes: z.number().int().min(0),
  })).optional(),
  colorId: z.string().optional(),
  visibility: z.string().optional(),
  transparency: z.string().optional(),
  sendUpdates: z.enum(['all', 'externalOnly', 'none']).optional(),
  withMeet: z.boolean().optional(),
  taskId: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireCalendarUser()
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const calendarIds = searchParams.getAll('calendarId')
  const fresh = searchParams.get('fresh') === '1'

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing from/to' }, { status: 400 })
  }

  try {
    if (!fresh) {
      const [eventsData, sourcesData] = await Promise.all([
        listMirrorCalendarEvents({
          from,
          to,
          calendarIds: calendarIds.length ? calendarIds : undefined,
          role: auth.role ?? undefined,
        }),
        listMirrorCalendarSources({ role: auth.role ?? undefined }),
      ])

      if (eventsData.syncHealth.state === 'fresh') {
        return NextResponse.json({
          events: eventsData.events,
          sources: sourcesData.sources,
          syncHealth: eventsData.syncHealth,
        })
      }
    }

    const data = await listCalendarEvents({
      from,
      to,
      calendarIds: calendarIds.length ? calendarIds : undefined,
      role: auth.role ?? undefined,
    })

    return NextResponse.json({
      events: data.events,
      sources: data.sources,
      syncHealth: {
        state: 'fresh',
        lastSyncedAt: new Date().toISOString(),
        message: 'Synced from Google Calendar',
      },
    })
  } catch (error) {
    return NextResponse.json({
      events: [],
      sources: [],
      syncHealth: {
        state: 'error',
        message: error instanceof Error ? error.message : 'Calendar bridge unavailable',
      },
    }, { status: 200 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireCalendarUser()
  if (auth.error) return auth.error

  const parsed = createEventSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event input', issues: parsed.error.issues }, { status: 400 })
  }

  if (!canUseAccount(auth.role, parsed.data.accountEmail)) {
    return NextResponse.json({ error: 'Forbidden calendar account' }, { status: 403 })
  }

  try {
    const event = await createGoogleCalendarEvent(parsed.data)
    if (event?.googleEventId && parsed.data.taskId) {
      await linkTaskEventBestEffort(parsed.data.taskId, parsed.data.accountEmail, parsed.data.googleCalendarId, event.googleEventId)
    }
    await logCalendarActivity(`Created calendar event: ${parsed.data.title}`, parsed.data.taskId ?? null)
    return NextResponse.json({ event })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create event' }, { status: 500 })
  }
}

async function linkTaskEventBestEffort(taskId: string, accountEmail: string, googleCalendarId: string, googleEventId: string) {
  try {
    const service = createServiceClient()
    await service.from('task_calendar_links').upsert({
      task_id: taskId,
      account_email: accountEmail,
      google_calendar_id: googleCalendarId,
      google_event_id: googleEventId,
      link_type: 'scheduled_block',
    }, { onConflict: 'task_id,account_email,google_calendar_id,google_event_id' })
  } catch {
    // The Google event is the source of truth; link persistence is best effort.
  }
}
