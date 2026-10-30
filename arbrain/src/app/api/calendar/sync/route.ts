import { NextRequest, NextResponse } from 'next/server'
import { requireCalendarUser } from '@/lib/calendar/api-auth'
import { listCalendarEvents } from '@/lib/calendar/gog-bridge'
import { listMirrorCalendarEvents, listMirrorCalendarSources } from '@/lib/calendar/mirror'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireCalendarUser()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({})) as { from?: string; to?: string; calendarIds?: string[] }
  const now = new Date()
  const from = body.from ?? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
  const to = body.to ?? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 45).toISOString()

  try {
    const data = await listCalendarEvents({
      from,
      to,
      calendarIds: body.calendarIds,
      role: auth.role ?? undefined,
    })
    return NextResponse.json({
      ok: true,
      events: data.events,
      sources: data.sources,
      syncHealth: {
        state: 'fresh',
        lastSyncedAt: new Date().toISOString(),
        message: `Synced ${data.events.length} events from Google Calendar`,
      },
    })
  } catch (error) {
    // gog CLI no disponible (ej. Vercel/web): leer del mirror de Supabase.
    try {
      const [mirror, sources] = await Promise.all([
        listMirrorCalendarEvents({ from, to, calendarIds: body.calendarIds, role: auth.role }),
        listMirrorCalendarSources({ role: auth.role }),
      ])
      return NextResponse.json({
        ok: true,
        events: mirror.events,
        sources: sources.sources,
        syncHealth: mirror.syncHealth,
      })
    } catch {
      return NextResponse.json({
        ok: false,
        events: [],
        sources: [],
        syncHealth: {
          state: 'error',
          message: error instanceof Error ? error.message : 'Calendar sync failed',
        },
      }, { status: 200 })
    }
  }
}
