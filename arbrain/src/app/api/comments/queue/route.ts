import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSFClient } from '@/lib/supabase/sf-client'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sf = createSFClient()

    // Get queue items: only ESCALATE comments waiting for Daniel
    const queueRes = await sf
      .from('youtube_comments_queue')
      .select('*')
      .eq('decision', 'ESCALATE')
      .eq('response_status', 'queued')
      .order('comment_published_at', { ascending: false })
      .limit(50)

    if (queueRes.error) {
      return NextResponse.json({ error: queueRes.error.message }, { status: 500 })
    }

    // Counts
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [escalateQueuedRes, autoQueuedRes, approvedCountRes, postedTodayRes] = await Promise.all([
      sf
        .from('youtube_comments_queue')
        .select('comment_id', { count: 'exact', head: true })
        .eq('decision', 'ESCALATE')
        .eq('response_status', 'queued'),
      sf
        .from('youtube_comments_queue')
        .select('comment_id', { count: 'exact', head: true })
        .eq('decision', 'AUTO_PUBLISH')
        .eq('response_status', 'queued'),
      sf
        .from('youtube_comment_responses')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .is('posted_at', null),
      sf
        .from('youtube_comment_responses')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'posted')
        .gte('posted_at', today.toISOString()),
    ])

    return NextResponse.json({
      items: queueRes.data ?? [],
      counts: {
        escalate_pending: escalateQueuedRes.count ?? 0,
        auto_publish_stuck: autoQueuedRes.count ?? 0,
        approved_pending_post: approvedCountRes.count ?? 0,
        posted_today: postedTodayRes.count ?? 0,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
