import { NextResponse } from 'next/server'
import { planningOwner, planningError } from '@/lib/planning/server'
import { createSFClient } from '@/lib/supabase/sf-client'

export async function GET() {
  try { await planningOwner() } catch(error) { return planningError(error) }

  try {
    const sf = createSFClient()

    const [videosRes, channelsRes] = await Promise.all([
      sf
        .from('intel_videos')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(300),

      sf
        .from('intel_channels')
        .select('*')
        .order('language')
        .order('category')
        .order('channel_name'),
    ])

    if (videosRes.error) {
      return NextResponse.json({ error: videosRes.error.message }, { status: 500 })
    }

    const videos = (videosRes.data ?? []) as Record<string, unknown>[]
    const channels = (channelsRes.data ?? []) as Record<string, unknown>[]

    // Trending: last 7 days sorted by velocity
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const trending = videos
      .filter(v => v.published_at && new Date(v.published_at as string) >= sevenDaysAgo)
      .sort((a, b) => ((b.velocity as number) || 0) - ((a.velocity as number) || 0))

    // Opportunities: videos where opportunity_flag = true AND have a topic
    const opportunities = videos
      .filter(v => v.opportunity_flag === true && v.opportunity_topic)
      .sort((a, b) => ((b.relevance_score as number) || 0) - ((a.relevance_score as number) || 0))

    // Feed: videos from monitored channels, sorted by published_at (most recent first)
    const monitoredChannelIds = new Set(channels.map(ch => ch.channel_id as string))
    const monitoredChannelNames = new Set(channels.map(ch => ch.channel_name as string))

    // Build a channel lookup for enrichment
    const channelLookup = new Map<string, Record<string, unknown>>()
    for (const ch of channels) {
      channelLookup.set(ch.channel_id as string, ch)
      channelLookup.set(ch.channel_name as string, ch)
    }

    const feedVideos = videos
      .filter(v => monitoredChannelIds.has(v.channel_id as string) || monitoredChannelNames.has(v.channel_name as string))
      .sort((a, b) => {
        const da = a.published_at ? new Date(a.published_at as string).getTime() : 0
        const db = b.published_at ? new Date(b.published_at as string).getTime() : 0
        return db - da
      })

    const feed = feedVideos.map(v => {
      const ch = channelLookup.get(v.channel_id as string) || channelLookup.get(v.channel_name as string)
      return {
        ...v,
        channel_thumbnail_url: (ch as Record<string, unknown>)?.channel_thumbnail_url as string || null,
        channel_url: (ch as Record<string, unknown>)?.channel_url as string || null,
        channel_category: (ch as Record<string, unknown>)?.category as string || null,
        channel_language: (ch as Record<string, unknown>)?.language as string || null,
      }
    })

    // Compute summary stats
    const now = Date.now()
    const day = 86400000
    const newLast24h = videos.filter(v => v.published_at && now - new Date(v.published_at as string).getTime() < day).length
    const highVelocity = videos.filter(v => (v.velocity as number) > 500).length

    const summary = {
      total_videos: videos.length,
      total_channels: channels.length,
      new_last_24h: newLast24h,
      high_velocity: highVelocity,
      with_predictions: videos.filter(v => v.predicted_conversion && (v.predicted_conversion as number) > 0).length,
    }

    // Solo lo que la UI renderiza: trending (top 3 en UI), opportunities, feed, summary.
    return NextResponse.json({
      trending: trending.slice(0, 10),
      opportunities: opportunities.slice(0, 20),
      feed,
      summary,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Intel API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
