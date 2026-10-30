import { NextRequest, NextResponse } from 'next/server'
import { requireCalendarUser } from '@/lib/calendar/api-auth'
import { calendarAccountsForRole, listCalendarSources } from '@/lib/calendar/gog-bridge'
import { listMirrorCalendarSources } from '@/lib/calendar/mirror'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireCalendarUser()
  if (auth.error) return auth.error
  const fresh = new URL(request.url).searchParams.get('fresh') === '1'

  try {
    if (!fresh) {
      const mirror = await listMirrorCalendarSources({ role: auth.role })
      if (mirror.syncHealth.state === 'fresh') {
        return NextResponse.json(mirror)
      }
    }

    const sources = await listCalendarSources(calendarAccountsForRole(auth.role))
    return NextResponse.json({
      sources,
      syncHealth: {
        state: 'fresh',
        lastSyncedAt: new Date().toISOString(),
        message: 'Synced from Google Calendar',
      },
    })
  } catch (error) {
    // gog CLI no disponible (ej. Vercel/web): caer al mirror de Supabase aunque este stale.
    try {
      const mirror = await listMirrorCalendarSources({ role: auth.role })
      if (mirror.sources.length > 0) return NextResponse.json(mirror)
    } catch {
      // sigue al error de abajo
    }
    return NextResponse.json({
      sources: [],
      syncHealth: {
        state: 'error',
        lastSyncedAt: null,
        message: error instanceof Error ? error.message : 'Calendar bridge unavailable',
      },
    }, { status: 200 })
  }
}
