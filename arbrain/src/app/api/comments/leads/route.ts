import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSFClient } from '@/lib/supabase/sf-client'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const minScore = Number(url.searchParams.get('min_score') ?? '60')
  const urgency = url.searchParams.get('urgency')

  // Ventana de frescura: un lead de hace meses no es lead, es arqueología.
  const FRESHNESS_DAYS = 14
  const freshCutoff = new Date(Date.now() - FRESHNESS_DAYS * 86400000).toISOString()

  try {
    const sf = createSFClient()

    // ITEMS: filtered list (limit 60). NOTE: no FK declared between youtube_comments
    // and youtube_videos in BD, so we fetch videos separately below.
    let itemsQ = sf
      .from('youtube_comment_classifications')
      .select(`
        comment_id,
        category,
        confidence,
        lead_score,
        lead_intent,
        lead_urgency,
        lead_signals,
        comment:youtube_comments!inner(
          text_original,
          author_display_name,
          author_profile_image_url,
          author_channel_id,
          published_at,
          video_id
        )
      `)
      .eq('category', 'sales-opportunity')
      .not('lead_score', 'is', null)
      .gte('lead_score', minScore)
      .gte('comment.published_at', freshCutoff)
      .order('lead_score', { ascending: false })
      .limit(60)

    if (urgency) itemsQ = itemsQ.eq('lead_urgency', urgency)

    // COUNTS: solo leads FRESCOS (misma ventana que los items)
    const countQ = (u: string) =>
      sf
        .from('youtube_comment_classifications')
        .select('comment_id, comment:youtube_comments!inner(published_at)', { count: 'exact', head: true })
        .eq('category', 'sales-opportunity')
        .gte('lead_score', minScore)
        .gte('comment.published_at', freshCutoff)
        .eq('lead_urgency', u)

    const [itemsRes, criticalRes, highRes, mediumRes, lowRes] = await Promise.all([
      itemsQ,
      countQ('critical'),
      countQ('high'),
      countQ('medium'),
      countQ('low'),
    ])

    if (itemsRes.error) {
      return NextResponse.json({ error: itemsRes.error.message }, { status: 500 })
    }

    const rawItems = itemsRes.data ?? []

    // Fetch video metadata for the unique video_ids in the items
    const videoIds = Array.from(
      new Set(rawItems.map((r: any) => r.comment?.video_id).filter(Boolean))
    ) as string[]

    const videoMap = new Map<string, { title: string | null; thumbnail_url: string | null }>()
    if (videoIds.length > 0) {
      const videosRes = await sf
        .from('youtube_videos')
        .select('video_id, title, thumbnail_url')
        .in('video_id', videoIds)
      for (const v of videosRes.data ?? []) {
        videoMap.set(v.video_id, { title: v.title, thumbnail_url: v.thumbnail_url })
      }
    }

    const items = rawItems.map((r: any) => {
      const vid = r.comment?.video_id
      const meta = vid ? videoMap.get(vid) : undefined
      const fallbackThumb = vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : null
      return {
        comment_id: r.comment_id,
        score: r.lead_score,
        urgency: r.lead_urgency,
        intent: r.lead_intent,
        signals: r.lead_signals ?? [],
        author_name: r.comment?.author_display_name,
        author_avatar: r.comment?.author_profile_image_url,
        author_channel_id: r.comment?.author_channel_id,
        comment_text: r.comment?.text_original,
        published_at: r.comment?.published_at,
        video_id: vid,
        video_title: meta?.title ?? null,
        video_thumbnail: meta?.thumbnail_url ?? fallbackThumb,
      }
    })

    const counts = {
      critical: criticalRes.count ?? 0,
      high: highRes.count ?? 0,
      medium: mediumRes.count ?? 0,
      low: lowRes.count ?? 0,
      total: (criticalRes.count ?? 0) + (highRes.count ?? 0) + (mediumRes.count ?? 0) + (lowRes.count ?? 0),
    }

    return NextResponse.json({ items, counts })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
