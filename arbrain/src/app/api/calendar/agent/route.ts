import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logCalendarActivity } from '@/lib/calendar/api-auth'
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  listCalendarEvents,
  updateGoogleCalendarEvent,
} from '@/lib/calendar/gog-bridge'
import { listMirrorCalendarEvents, listMirrorCalendarSources } from '@/lib/calendar/mirror'
import { sameSecret } from '@/lib/desktop-auth'

export const runtime = 'nodejs'

const reminderSchema = z.object({
  method: z.enum(['popup', 'email']),
  minutes: z.number().int().min(0),
})

const queryEventsSchema = z.object({
  action: z.literal('query_events'),
  from: z.string().min(1),
  to: z.string().min(1),
  calendarIds: z.array(z.string()).optional(),
})

const createEventSchema = z.object({
  action: z.literal('create_event'),
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
  reminders: z.array(reminderSchema).optional(),
  colorId: z.string().optional(),
  visibility: z.string().optional(),
  transparency: z.string().optional(),
  sendUpdates: z.enum(['all', 'externalOnly', 'none']).optional(),
  withMeet: z.boolean().optional(),
  taskId: z.string().optional(),
})

const updateEventSchema = createEventSchema
  .omit({ action: true, title: true, start: true, end: true })
  .extend({
    action: z.literal('update_event'),
    eventId: z.string().min(1),
    title: z.string().min(1).optional(),
    start: z.string().min(1).optional(),
    end: z.string().min(1).optional(),
    targetCalendarId: z.string().optional(),
    recurrenceScope: z.enum(['single', 'future', 'all']).optional(),
    originalStart: z.string().optional(),
  })

const deleteEventSchema = z.object({
  action: z.literal('delete_event'),
  accountEmail: z.string().email(),
  googleCalendarId: z.string().min(1),
  eventId: z.string().min(1),
  recurrenceScope: z.enum(['single', 'future', 'all']).optional(),
  originalStart: z.string().optional(),
  sendUpdates: z.enum(['all', 'externalOnly', 'none']).optional(),
})

const syncEventsSchema = z.object({
  action: z.literal('sync_events'),
  from: z.string().min(1),
  to: z.string().min(1),
  calendarIds: z.array(z.string()).optional(),
})

const actionSchema = z.discriminatedUnion('action', [
  queryEventsSchema,
  createEventSchema,
  updateEventSchema,
  deleteEventSchema,
  syncEventsSchema,
])

function requireBearer(request: NextRequest) {
  const expected = process.env.OPENCLAW_GATEWAY_TOKEN
  const received = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  if (!expected) {
    return NextResponse.json({ error: 'OPENCLAW_GATEWAY_TOKEN is not configured' }, { status: 500 })
  }
  if (!received || !sameSecret(received, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function GET(request: NextRequest) {
  const authError = requireBearer(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const calendarIds = searchParams.getAll('calendarId')

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing from/to' }, { status: 400 })
  }

  try {
    const [eventsData, sourcesData] = await Promise.all([
      listMirrorCalendarEvents({
        from,
        to,
        calendarIds: calendarIds.length ? calendarIds : undefined,
        role: 'owner',
      }),
      listMirrorCalendarSources({ role: 'owner' }),
    ])

    return NextResponse.json({
      events: eventsData.events,
      sources: sourcesData.sources,
      syncHealth: eventsData.syncHealth,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to query calendar mirror',
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authError = requireBearer(request)
  if (authError) return authError

  const parsed = actionSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid calendar action', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    switch (parsed.data.action) {
      case 'query_events': {
        const [eventsData, sourcesData] = await Promise.all([
          listMirrorCalendarEvents({
            from: parsed.data.from,
            to: parsed.data.to,
            calendarIds: parsed.data.calendarIds,
            role: 'owner',
          }),
          listMirrorCalendarSources({ role: 'owner' }),
        ])
        return NextResponse.json({
          events: eventsData.events,
          sources: sourcesData.sources,
          syncHealth: eventsData.syncHealth,
        })
      }

      case 'create_event': {
        const event = await createGoogleCalendarEvent(parsed.data)
        await logCalendarActivity(`Created calendar event: ${parsed.data.title}`, parsed.data.taskId ?? null)
        return NextResponse.json({ event })
      }

      case 'update_event': {
        const event = await updateGoogleCalendarEvent(parsed.data)
        await logCalendarActivity(`Updated calendar event: ${parsed.data.title ?? parsed.data.eventId}`)
        return NextResponse.json({ event })
      }

      case 'delete_event': {
        await deleteGoogleCalendarEvent(parsed.data)
        await logCalendarActivity(`Deleted calendar event: ${parsed.data.eventId}`)
        return NextResponse.json({ ok: true })
      }

      case 'sync_events': {
        const data = await listCalendarEvents({
          from: parsed.data.from,
          to: parsed.data.to,
          calendarIds: parsed.data.calendarIds,
          role: 'owner',
        })
        return NextResponse.json({
          ...data,
          syncHealth: {
            state: 'fresh',
            lastSyncedAt: new Date().toISOString(),
            message: 'Synced from Google Calendar',
          },
        })
      }
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Calendar action failed',
    }, { status: 500 })
  }
}
