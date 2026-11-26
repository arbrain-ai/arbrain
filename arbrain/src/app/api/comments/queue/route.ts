import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSFClient } from '@/lib/supabase/sf-client'
import { DECISIONES_BANDEJA, desdeCriticas, plegarCritica, separarCriticas } from '@/features/comments/escudo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sf = createSFClient()

    // Modo bandeja (19 nov 2026): todo borrador en cola espera a Daniel, también los que antes se autopublicaban.
    const queueRes = await sf
      .from('youtube_comments_queue')
      .select('*')
      .in('decision', [...DECISIONES_BANDEJA])
      .eq('response_status', 'queued')
      .order('comment_published_at', { ascending: false })
      .limit(50)

    if (queueRes.error) {
      return NextResponse.json({ error: queueRes.error.message }, { status: 500 })
    }

    // Escudo: críticas y hate sin borrador, plegadas aparte («N críticas»), nunca en la lista principal.
    const criticasRes = await sf
      .from('youtube_comments_queue')
      .select('comment_id, comment_text, author_display_name, video_title, comment_published_at, category', { count: 'exact' })
      .eq('category', 'criticism')
      .is('response_id', null)
      .gte('comment_published_at', desdeCriticas())
      .order('comment_published_at', { ascending: false })
      .limit(50)
    const { items } = separarCriticas(queueRes.data ?? [])

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
      items,
      criticas: {
        total: criticasRes.count ?? 0,
        items: (criticasRes.data ?? []).map(plegarCritica),
      },
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
