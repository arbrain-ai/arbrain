import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth-utils'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = await getUserRole(user.id)
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') || new Date().toISOString().split('T')[0]
  const to = searchParams.get('to') || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ events: [] })
  }

  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const service = createServiceClient()

    let query = service
      .from('calendar_events')
      .select('*')
      .gte('start_at', `${from}T00:00:00`)
      .lte('start_at', `${to}T23:59:59`)
      .order('start_at', { ascending: true })

    // Non-owners only see business events
    if (role !== 'owner') {
      query = query.eq('account_type', 'business')
    }

    const { data, error } = await query

    if (error) {
      console.error('Calendar query error:', error)
      return NextResponse.json({ events: [] })
    }

    const events = (data || []).map((e) => ({
      id: e.google_event_id,
      title: e.title,
      description: e.description,
      start: e.start_at,
      end: e.end_at,
      allDay: e.all_day,
      account: e.account_type as 'personal' | 'business',
      location: e.location,
      calendarName: e.calendar_name,
    }))

    return NextResponse.json({ events })
  } catch (err) {
    console.error('Calendar fetch failed:', err)
    return NextResponse.json({ events: [] })
  }
}
