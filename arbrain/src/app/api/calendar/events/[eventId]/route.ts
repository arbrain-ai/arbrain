import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { canUseAccount, logCalendarActivity, requireCalendarUser } from '@/lib/calendar/api-auth'
import { deleteGoogleCalendarEvent, updateGoogleCalendarEvent } from '@/lib/calendar/gog-bridge'

export const runtime = 'nodejs'

const updateEventSchema = z.object({
  accountEmail: z.string().email(),
  googleCalendarId: z.string().min(1),
  title: z.string().min(1).optional(),
  start: z.string().min(1).optional(),
  end: z.string().min(1).optional(),
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
  recurrenceScope: z.enum(['single', 'future', 'all']).optional(),
  originalStart: z.string().optional(),
})

const deleteSchema = z.object({
  accountEmail: z.string().email(),
  googleCalendarId: z.string().min(1),
  recurrenceScope: z.enum(['single', 'future', 'all']).optional(),
  originalStart: z.string().optional(),
  sendUpdates: z.enum(['all', 'externalOnly', 'none']).optional(),
})

interface Params {
  params: Promise<{ eventId: string }>
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireCalendarUser()
  if (auth.error) return auth.error

  const { eventId } = await params
  const parsed = updateEventSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event update', issues: parsed.error.issues }, { status: 400 })
  }

  if (!canUseAccount(auth.role, parsed.data.accountEmail)) {
    return NextResponse.json({ error: 'Forbidden calendar account' }, { status: 403 })
  }

  try {
    const event = await updateGoogleCalendarEvent({
      ...parsed.data,
      eventId: decodeURIComponent(eventId),
    })
    await logCalendarActivity(`Updated calendar event: ${parsed.data.title ?? decodeURIComponent(eventId)}`)
    return NextResponse.json({ event })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update event' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireCalendarUser()
  if (auth.error) return auth.error

  const { eventId } = await params
  const parsed = deleteSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid delete input', issues: parsed.error.issues }, { status: 400 })
  }

  if (!canUseAccount(auth.role, parsed.data.accountEmail)) {
    return NextResponse.json({ error: 'Forbidden calendar account' }, { status: 403 })
  }

  try {
    await deleteGoogleCalendarEvent({
      ...parsed.data,
      eventId: decodeURIComponent(eventId),
    })
    await logCalendarActivity(`Deleted calendar event: ${decodeURIComponent(eventId)}`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete event' }, { status: 500 })
  }
}
