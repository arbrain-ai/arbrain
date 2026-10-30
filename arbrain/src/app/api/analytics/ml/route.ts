import { NextResponse } from 'next/server'
import { planningOwner, planningError } from '@/lib/planning/server'
import { createSFClient } from '@/lib/supabase/sf-client'
import { instalacion } from '@/config'

const SF_PROJECT = instalacion().proyectoComunidad
const MGMT_API = `https://api.supabase.com/v1/projects/${SF_PROJECT}/database/query`
type SFClient = ReturnType<typeof createSFClient>
type Row = Record<string, unknown>

async function rawSQL(query: string): Promise<Record<string, unknown>[]> {
  // Supabase Management API is blocked/unavailable from the dashboard runtime
  // in local/prod, so SQL is opt-in only. PostgREST fallbacks below are the
  // production path.
  if (process.env.ENABLE_SUPABASE_MGMT_SQL !== 'true') return []

  const pat = process.env.SF_SUPABASE_PAT ?? process.env.SUPABASE_ACCESS_TOKEN
  if (!pat) {
    console.warn('[rawSQL] SF_SUPABASE_PAT not set, skipping query')
    return []
  }

  const res = await fetch(MGMT_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[rawSQL] API error ${res.status}: ${body.slice(0, 200)}`)
    return []
  }
  const data = await res.json()
  if (!Array.isArray(data)) {
    console.error('[rawSQL] Unexpected response format:', JSON.stringify(data).slice(0, 200))
    return []
  }
  return data
}

async function fetchAll(
  sf: SFClient,
  table: string,
  columns: string,
  configure?: (query: any) => any,
  pageSize = 1000,
  maxRows = 10000
): Promise<Row[]> {
  const rows: Row[] = []

  for (let from = 0; from < maxRows; from += pageSize) {
    let query = sf.from(table).select(columns)
    if (configure) query = configure(query)

    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) {
      console.error(`[postgrest] ${table} query error:`, error.message)
      return rows
    }

    const page = (data ?? []) as unknown as Row[]
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return rows
}

async function countRows(
  sf: SFClient,
  table: string,
  configure?: (query: any) => any
): Promise<number> {
  let query = sf.from(table).select('*', { count: 'exact', head: true })
  if (configure) query = configure(query)

  const { count, error } = await query
  if (error) {
    console.error(`[postgrest] ${table} count error:`, error.message)
    return 0
  }

  return count ?? 0
}

/**
 * PostgREST fallback for tier distribution + active members.
 * Used when rawSQL returns empty (e.g. SF_SUPABASE_PAT missing).
 */
async function fallbackTiersAndActive(sf: ReturnType<typeof createSFClient>) {
  // Fetch all profiles with relevant fields (PostgREST, no PAT needed)
  const { data: profiles, error } = await sf
    .from('profiles')
    .select('tier, has_community_access, last_seen')
    .limit(5000)

  if (error || !profiles) {
    console.error('[fallback] profiles query error:', error?.message)
    return { tiers: [], activeMembers: { active_30d: 0, active_7d: 0, active_1d: 0, total: 0 } }
  }

  // Build tier distribution
  const tierMap = new Map<string, { tier: string; has_community_access: boolean; cnt: number }>()
  for (const p of profiles) {
    const key = `${p.tier}|${p.has_community_access}`
    const existing = tierMap.get(key)
    if (existing) {
      existing.cnt++
    } else {
      tierMap.set(key, { tier: p.tier || 'unknown', has_community_access: !!p.has_community_access, cnt: 1 })
    }
  }
  const tiers = Array.from(tierMap.values()).sort((a, b) => b.cnt - a.cnt)

  // Build active members
  const now = Date.now()
  const DAY = 86400_000
  let active_1d = 0, active_7d = 0, active_30d = 0, total = 0
  for (const p of profiles) {
    if (!p.has_community_access) continue
    total++
    if (!p.last_seen) continue
    const age = now - new Date(p.last_seen).getTime()
    if (age <= 1 * DAY) active_1d++
    if (age <= 7 * DAY) active_7d++
    if (age <= 30 * DAY) active_30d++
  }

  return { tiers, activeMembers: { active_30d, active_7d, active_1d, total } }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function monthKey(value: unknown): string {
  const date = typeof value === 'string' ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'unknown'
  return date.toISOString().slice(0, 7)
}

function monthStartKey(value: unknown): string {
  const key = monthKey(value)
  return key === 'unknown' ? key : `${key}-01`
}

function asRecord(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function eventTime(value: unknown): number {
  const date = typeof value === 'string' ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0
}

function eventPriceCents(row: Row): number {
  const properties = asRecord(row.properties)
  return toNumber(properties.price_cents)
}

async function postgrestVideoAttributionMetrics(
  sf: SFClient,
  startDate?: Date
): Promise<Map<string, { total_visits: number; total_payments: number; total_revenue_cents: number }>> {
  const inferenceWindowDays = 30
  const linkedEventsStart = startDate
    ? new Date(startDate.getTime() - inferenceWindowDays * 86_400_000)
    : undefined

  const [linkedEvents, paymentEvents] = await Promise.all([
    fetchAll(
      sf,
      'funnel_events',
      'id,event_name,created_at,user_id,session_id,ip_hash,link_slug',
      query => {
        let next = query
          .not('link_slug', 'is', null)
          .in('event_name', ['about_page_view', 'about_cta_click', 'checkout_page_view', 'plan_selected'])
        if (linkedEventsStart) next = next.gte('created_at', linkedEventsStart.toISOString())
        return next
      },
      1000,
      50000
    ),
    fetchAll(
      sf,
      'funnel_events',
      'id,event_name,created_at,user_id,link_slug,properties',
      query => {
        let next = query.eq('event_name', 'payment_verified')
        if (startDate) next = next.gte('created_at', startDate.toISOString())
        return next
      },
      1000,
      20000
    ),
  ])

  const metricsBySlug = new Map<string, { total_visits: number; total_payments: number; total_revenue_cents: number }>()
  const linkedEventsByUser = new Map<string, { createdAtMs: number; linkSlug: string }[]>()
  const visitKeysBySlug = new Map<string, Set<string>>()

  for (const event of linkedEvents) {
    const linkSlug = String(event.link_slug ?? '')
    if (!linkSlug) continue

    const createdAtMs = eventTime(event.created_at)
    const userId = String(event.user_id ?? '')
    if (userId && createdAtMs > 0) {
      const rows = linkedEventsByUser.get(userId) ?? []
      rows.push({ createdAtMs, linkSlug })
      linkedEventsByUser.set(userId, rows)
    }

    if (event.event_name !== 'about_page_view') continue
    const visitKey = String(event.session_id ?? event.ip_hash ?? event.user_id ?? event.id ?? '')
    if (!visitKey) continue

    const visits = visitKeysBySlug.get(linkSlug) ?? new Set<string>()
    visits.add(visitKey)
    visitKeysBySlug.set(linkSlug, visits)
  }

  for (const rows of linkedEventsByUser.values()) {
    rows.sort((a, b) => a.createdAtMs - b.createdAtMs)
  }

  for (const [linkSlug, visits] of visitKeysBySlug.entries()) {
    const current = metricsBySlug.get(linkSlug) ?? { total_visits: 0, total_payments: 0, total_revenue_cents: 0 }
    current.total_visits = visits.size
    metricsBySlug.set(linkSlug, current)
  }

  const paymentGroups = new Map<string, { createdAtMs: number; userId: string; priceCents: number; directSlug: string | null }>()
  for (const event of paymentEvents) {
    const userId = String(event.user_id ?? '')
    const createdAtMs = eventTime(event.created_at)
    const priceCents = eventPriceCents(event)
    if (!userId || createdAtMs <= 0 || priceCents <= 0) continue

    // Polar webhooks currently emit the same purchase several times within seconds.
    // Bucket by user + price + 10m window so one real checkout counts once.
    const bucket = Math.floor(createdAtMs / 600_000)
    const key = `${userId}|${priceCents}|${bucket}`
    const directSlug = String(event.link_slug ?? '') || null
    const current = paymentGroups.get(key)
    if (!current) {
      paymentGroups.set(key, { createdAtMs, userId, priceCents, directSlug })
      continue
    }

    if (!current.directSlug && directSlug) current.directSlug = directSlug
    if (createdAtMs < current.createdAtMs) current.createdAtMs = createdAtMs
  }

  for (const payment of paymentGroups.values()) {
    let linkSlug = payment.directSlug

    if (!linkSlug) {
      const userEvents = linkedEventsByUser.get(payment.userId) ?? []
      const minAttributionMs = payment.createdAtMs - inferenceWindowDays * 86_400_000
      for (let i = userEvents.length - 1; i >= 0; i -= 1) {
        const event = userEvents[i]
        if (event.createdAtMs > payment.createdAtMs) continue
        if (event.createdAtMs < minAttributionMs) break
        linkSlug = event.linkSlug
        break
      }
    }

    if (!linkSlug) continue
    const current = metricsBySlug.get(linkSlug) ?? { total_visits: 0, total_payments: 0, total_revenue_cents: 0 }
    current.total_payments += 1
    current.total_revenue_cents += payment.priceCents
    metricsBySlug.set(linkSlug, current)
  }

  return metricsBySlug
}

async function postgrestTopTopics(sf: SFClient): Promise<Row[]> {
  const sessions = await fetchAll(
    sf,
    'conversation_sessions',
    'classification,user_message_count',
    query => query.not('classification', 'is', null).gt('user_message_count', 0),
    1000,
    10000
  )

  const topicMap = new Map<string, { topic: string; total: number; frustrated: number; resolved: number }>()
  for (const session of sessions) {
    const classification = asRecord(session.classification)
    const flags = asRecord(classification.flags)
    const topics = asStringArray(classification.topics)

    for (const topic of topics) {
      const current = topicMap.get(topic) ?? { topic, total: 0, frustrated: 0, resolved: 0 }
      current.total += 1
      if (flags.frustration_detected === true) current.frustrated += 1
      if (flags.resolved === true) current.resolved += 1
      topicMap.set(topic, current)
    }
  }

  return Array.from(topicMap.values())
    .filter(topic => topic.total >= 20)
    .sort((a, b) => b.total - a.total)
    .slice(0, 15)
}

async function postgrestChurnRisk(sf: SFClient): Promise<Row[]> {
  const [purchases, profiles] = await Promise.all([
    fetchAll(
      sf,
      'community_purchases',
      'user_id,status,scheduled_for_removal,cancel_at_period_end,locked_price_cents,locked_billing_interval,created_at',
      query => query.in('status', ['completed', 'cancelled']).order('created_at', { ascending: false }),
      1000,
      5000
    ),
    fetchAll(
      sf,
      'profiles',
      'id,full_name,email,current_level,total_points,tier,has_community_access,last_seen',
      query => query.eq('has_community_access', true),
      1000,
      5000
    ),
  ])

  const latestByUser = new Map<string, Row>()
  for (const purchase of purchases) {
    const userId = String(purchase.user_id ?? '')
    if (userId && !latestByUser.has(userId)) latestByUser.set(userId, purchase)
  }

  const profileById = new Map(profiles.map(profile => [String(profile.id), profile]))
  const now = Date.now()
  const dayMs = 86_400_000

  const riskRows = Array.from(latestByUser.entries())
    .map(([userId, purchase]) => {
      const profile = profileById.get(userId)
      if (!profile) return null
      if (purchase.status !== 'completed') return null
      if (purchase.cancel_at_period_end === true || purchase.scheduled_for_removal === true) return null
      const lastSeen = typeof profile.last_seen === 'string' ? new Date(profile.last_seen).getTime() : 0
      return {
        full_name: profile.full_name,
        email: profile.email,
        current_level: profile.current_level,
        total_points: profile.total_points,
        tier: profile.tier,
        has_community_access: profile.has_community_access,
        days_inactive: lastSeen > 0 ? (now - lastSeen) / dayMs : 999,
        locked_billing_interval: purchase.locked_billing_interval,
        locked_price_cents: purchase.locked_price_cents,
      }
    })
    .filter(row => row !== null)
    .sort((a, b) => {
      const pointDiff = toNumber(a.total_points) - toNumber(b.total_points)
      return pointDiff || toNumber(a.current_level) - toNumber(b.current_level)
    })
    .slice(0, 10)

  return riskRows as Row[]
}

async function postgrestVideoConversion(sf: SFClient): Promise<Row[]> {
  const [attributionBySlug, videoRows] = await Promise.all([
    postgrestVideoAttributionMetrics(sf),
    fetchAll(
      sf,
      'youtube_videos',
      'video_id,title,link_slug,views,avg_view_percentage,subscribers_gained,ml_features',
      query => query.not('ml_features', 'is', null),
      1000,
      1000
    ),
  ])

  return videoRows
    .map(video => {
      const attr = attributionBySlug.get(String(video.link_slug ?? '')) ?? { total_visits: 0, total_payments: 0, total_revenue_cents: 0 }
      const features = asRecord(video.ml_features)
      return {
        video_id: video.video_id,
        title: video.title,
        views: toNumber(video.views),
        avg_view_percentage: toNumber(video.avg_view_percentage),
        subscribers_gained: toNumber(video.subscribers_gained),
        category: features.category,
        cta_strength: toNumber(features.cta_strength),
        avatar_alignment: toNumber(features.avatar_alignment),
        hook_quality: toNumber(features.hook_quality),
        value_density: toNumber(features.value_density),
        emotional_arc: features.emotional_arc,
        tools_demonstrated: features.tools_demonstrated,
        transformation_promise: features.transformation_promise,
        ...attr,
        conversion_rate: attr.total_visits >= 5
          ? Math.round((attr.total_payments / attr.total_visits) * 10_000) / 100
          : null,
      }
    })
    .sort((a, b) => b.total_revenue_cents - a.total_revenue_cents)
    .slice(0, 20)
}

async function postgrestCohortRetention(sf: SFClient): Promise<Row[]> {
  const [purchases, profiles] = await Promise.all([
    fetchAll(
      sf,
      'community_purchases',
      'user_id,status,created_at',
      query => query.in('status', ['completed', 'cancelled']),
      1000,
      5000
    ),
    fetchAll(sf, 'profiles', 'id,last_seen', undefined, 1000, 5000),
  ])

  const lastSeenByUser = new Map(profiles.map(profile => [String(profile.id), String(profile.last_seen ?? '')]))
  const cohorts = new Map<string, Set<string>>()
  for (const purchase of purchases) {
    const cohort = monthStartKey(purchase.created_at)
    const userId = String(purchase.user_id ?? '')
    if (!userId || cohort === 'unknown') continue
    if (!cohorts.has(cohort)) cohorts.set(cohort, new Set())
    cohorts.get(cohort)?.add(userId)
  }

  return Array.from(cohorts.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6)
    .map(([cohort_month, users]) => {
      const start = new Date(`${cohort_month}T00:00:00.000Z`)
      const counts = [0, 0, 0, 0]
      for (const userId of users) {
        const lastSeen = new Date(lastSeenByUser.get(userId) ?? '')
        if (Number.isNaN(lastSeen.getTime())) continue
        for (let month = 0; month < 4; month += 1) {
          const from = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month, 1))
          const to = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month + 1, 1))
          if (lastSeen >= from && lastSeen < to) counts[month] += 1
        }
      }
      return { cohort_month, cohort_size: users.size, m0: counts[0], m1: counts[1], m2: counts[2], m3: counts[3] }
    })
}

async function postgrestMemberGrowth(sf: SFClient, sixMonthsAgo: Date): Promise<Row[]> {
  const purchases = await fetchAll(
    sf,
    'community_purchases',
    'created_at,status',
    query => query.gte('created_at', sixMonthsAgo.toISOString()),
    1000,
    5000
  )

  const byMonth = new Map<string, { month: string; new_members: number; churned_members: number }>()
  for (const purchase of purchases) {
    const month = monthStartKey(purchase.created_at)
    if (month === 'unknown') continue
    const current = byMonth.get(month) ?? { month, new_members: 0, churned_members: 0 }
    if (purchase.status === 'completed') current.new_members += 1
    if (purchase.status === 'cancelled') current.churned_members += 1
    byMonth.set(month, current)
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month))
}

async function postgrestInterventionQueue(sf: SFClient, since: Date): Promise<Row[]> {
  const sessions = await fetchAll(
    sf,
    'conversation_sessions',
    'id,user_id,agent_id,first_message_at,message_count,user_message_count,classification',
    query => query
      .gte('first_message_at', since.toISOString())
      .gt('user_message_count', 0)
      .not('classification', 'is', null)
      .order('first_message_at', { ascending: false }),
    1000,
    2000
  )

  const flagged = sessions
    .map(session => {
      const classification = asRecord(session.classification)
      const flags = asRecord(classification.flags)
      const frustration = flags.frustration_detected === true
      const escalation = flags.escalation_needed === true
      const bug = flags.bug_reported === true
      if (!frustration && !escalation && !bug) return null
      return {
        id: session.id,
        user_id: session.user_id,
        agent_id: session.agent_id,
        first_message_at: session.first_message_at,
        message_count: session.message_count,
        summary: classification.summary,
        frustration,
        escalation,
        bug,
      }
    })
    .filter(row => row !== null)
    .slice(0, 20)

  const profileIds = Array.from(new Set(flagged.map(row => String(row.user_id)).filter(Boolean)))
  const profiles = profileIds.length > 0
    ? await fetchAll(
        sf,
        'profiles',
        'id,full_name',
        query => query.in('id', profileIds),
        1000,
        1000
      )
    : []
  const profileById = new Map(profiles.map(profile => [String(profile.id), String(profile.full_name ?? '')]))

  return flagged.map(row => ({ ...row, user_name: profileById.get(String(row.user_id)) ?? 'Usuario' }))
}

async function postgrestFunnelData(sf: SFClient, windowStart: Date): Promise<Row[]> {
  const eventNames = ['about_page_view', 'about_cta_click', 'signup_completed', 'checkout_page_view', 'plan_selected']
  const eventCounts = await Promise.all(eventNames.map(eventName =>
    countRows(
      sf,
      'funnel_events',
      query => query.gte('created_at', windowStart.toISOString()).eq('event_name', eventName)
    )
  ))
  const paymentCount = await countRows(
    sf,
    'community_purchases',
    query => query.gte('created_at', windowStart.toISOString()).in('status', ['completed', 'cancelled'])
  )

  return [
    ...eventNames.map((eventName, index) => ({ event_name: eventName, cnt: eventCounts[index] })),
    { event_name: 'payment_verified', cnt: paymentCount },
  ]
}

async function postgrestAttributionData(sf: SFClient, windowStart: Date): Promise<Row[]> {
  const [attributionBySlug, videoRows] = await Promise.all([
    postgrestVideoAttributionMetrics(sf, windowStart),
    fetchAll(
      sf,
      'youtube_videos',
      'video_id,title,link_slug',
      query => query.not('link_slug', 'is', null),
      1000,
      1000
    ),
  ])

  const videoBySlug = new Map(videoRows.map(video => [String(video.link_slug ?? ''), video]))

  const rows: Row[] = []
  for (const [linkSlug, attr] of attributionBySlug.entries()) {
    const video = videoBySlug.get(linkSlug)
    if (!video || attr.total_payments <= 0) continue
    rows.push({
      source: String(video.video_id ?? linkSlug),
      source_label: String(video.title ?? linkSlug),
      conversions: attr.total_payments,
      revenue_cents: attr.total_revenue_cents,
      clicks: attr.total_visits,
    })
  }

  return rows
    .sort((a, b) => toNumber(b.revenue_cents) - toNumber(a.revenue_cents))
    .slice(0, 15)
}

async function postgrestRevenueHistory(sf: SFClient, sixMonthsAgo: Date): Promise<Row[]> {
  const purchases = await fetchAll(
    sf,
    'community_purchases',
    'purchased_at,locked_billing_interval,locked_price_cents,status',
    query => query.eq('status', 'completed').gte('purchased_at', sixMonthsAgo.toISOString()),
    1000,
    5000
  )

  const byMonth = new Map<string, {
    month: string
    monthly_revenue_cents: number
    annual_revenue_cents: number
    monthly_count: number
    annual_count: number
  }>()

  for (const purchase of purchases) {
    const month = monthKey(purchase.purchased_at)
    if (month === 'unknown') continue
    const interval = purchase.locked_billing_interval === 'year' ? 'year' : 'month'
    const price = toNumber(purchase.locked_price_cents) || (interval === 'year' ? 19_900 : 1_900)
    const current = byMonth.get(month) ?? { month, monthly_revenue_cents: 0, annual_revenue_cents: 0, monthly_count: 0, annual_count: 0 }
    if (interval === 'year') {
      current.annual_revenue_cents += price
      current.annual_count += 1
    } else {
      current.monthly_revenue_cents += price
      current.monthly_count += 1
    }
    byMonth.set(month, current)
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month))
}

async function postgrestSubscriptionMix(sf: SFClient): Promise<Row[]> {
  const purchases = await fetchAll(
    sf,
    'community_purchases',
    'locked_billing_interval,locked_price_cents,status,cancel_at_period_end,scheduled_for_removal',
    query => query.eq('status', 'completed').eq('cancel_at_period_end', false),
    1000,
    5000
  )

  const byInterval = new Map<string, { interval: string; count: number; total_cents: number }>()
  for (const purchase of purchases) {
    if (purchase.scheduled_for_removal === true) continue
    const interval = purchase.locked_billing_interval === 'year' ? 'year' : 'month'
    const price = toNumber(purchase.locked_price_cents) || (interval === 'year' ? 19_900 : 1_900)
    const current = byInterval.get(interval) ?? { interval, count: 0, total_cents: 0 }
    current.count += 1
    current.total_cents += price
    byInterval.set(interval, current)
  }

  return Array.from(byInterval.values())
}

async function postgrestEngagement30d(sf: SFClient, windowStart: Date): Promise<Row> {
  const [posts30d, comments30d, lessons30d] = await Promise.all([
    countRows(sf, 'posts', query => query.gte('created_at', windowStart.toISOString())),
    countRows(sf, 'comments', query => query.gte('created_at', windowStart.toISOString())),
    countRows(sf, 'lesson_progress', query => query.eq('completed', true).gte('completed_at', windowStart.toISOString())),
  ])

  return { posts_30d: posts30d, comments_30d: comments30d, lessons_30d: lessons30d }
}

async function postgrestReferralStats(sf: SFClient): Promise<{
  referralStats: Row[]
  topReferrers: Row[]
  referralTrend: Row[]
}> {
  const [referrals, commissions, profilesWithAccess] = await Promise.all([
    fetchAll(sf, 'referrals', 'referrer_id,status,created_at', undefined, 1000, 5000),
    fetchAll(sf, 'referral_commissions', 'referrer_id,commission_cents,purchase_amount_cents', undefined, 1000, 5000),
    countRows(sf, 'profiles', query => query.eq('has_community_access', true)),
  ])

  const totalReferrals = referrals.filter(row => row.status === 'active').length
  const uniqueReferrers = new Set(referrals.map(row => String(row.referrer_id ?? '')).filter(Boolean)).size
  const totalCommissionCents = commissions.reduce((sum, row) => sum + toNumber(row.commission_cents), 0)
  const totalPurchaseCents = commissions.reduce((sum, row) => sum + toNumber(row.purchase_amount_cents), 0)

  const referralCounts = new Map<string, { referrer_id: string; referrals: number; active: number; earned_cents: number }>()
  for (const referral of referrals) {
    const referrerId = String(referral.referrer_id ?? '')
    if (!referrerId) continue
    const current = referralCounts.get(referrerId) ?? { referrer_id: referrerId, referrals: 0, active: 0, earned_cents: 0 }
    current.referrals += 1
    if (referral.status === 'active') current.active += 1
    referralCounts.set(referrerId, current)
  }
  for (const commission of commissions) {
    const referrerId = String(commission.referrer_id ?? '')
    if (!referrerId) continue
    const current = referralCounts.get(referrerId) ?? { referrer_id: referrerId, referrals: 0, active: 0, earned_cents: 0 }
    current.earned_cents += toNumber(commission.commission_cents)
    referralCounts.set(referrerId, current)
  }

  const topIds = Array.from(referralCounts.values())
    .sort((a, b) => b.referrals - a.referrals)
    .slice(0, 10)
    .map(row => row.referrer_id)

  const profileRows = topIds.length > 0
    ? await fetchAll(sf, 'profiles', 'id,full_name', query => query.in('id', topIds), 1000, 1000)
    : []
  const names = new Map(profileRows.map(row => [String(row.id), String(row.full_name ?? '')]))

  const topReferrers = Array.from(referralCounts.values())
    .sort((a, b) => b.referrals - a.referrals)
    .slice(0, 10)
    .map(row => ({ ...row, full_name: names.get(row.referrer_id) ?? 'Unknown' }))

  const trendMap = new Map<string, { month: string; new_referrals: number }>()
  for (const referral of referrals) {
    const month = monthKey(referral.created_at)
    if (month === 'unknown') continue
    const current = trendMap.get(month) ?? { month, new_referrals: 0 }
    current.new_referrals += 1
    trendMap.set(month, current)
  }

  return {
    referralStats: [{
      total_referrals: totalReferrals,
      unique_referrers: uniqueReferrers,
      total_commission_cents: totalCommissionCents,
      total_purchase_cents: totalPurchaseCents,
      k_factor: profilesWithAccess > 0 ? totalReferrals / profilesWithAccess : 0,
    }],
    topReferrers,
    referralTrend: Array.from(trendMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
  }
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function pickFirst(rows: Record<string, unknown>[] | null | undefined): Record<string, unknown> | null {
  return rows?.[0] ?? null
}

export async function GET(request: Request) {
  try { await planningOwner() } catch(error) { return planningError(error) }

  try {
    const sf = createSFClient()
    const now = new Date()
    const dayMs = 86_400_000
    // Ventana seleccionable desde el dashboard (?days=7|30|90). Whitelist dura:
    // el valor se interpola en SQL, asi que solo pasan los 3 valores conocidos.
    const requestedDays = Number(new URL(request.url).searchParams.get('days'))
    const windowDays = requestedDays === 7 || requestedDays === 90 ? requestedDays : 30
    const windowStart = new Date(now.getTime() - windowDays * dayMs)
    const sevenDaysAgo = new Date(now.getTime() - 7 * dayMs)
    const fortyEightHoursAgo = new Date(now.getTime() - 2 * dayMs)
    const sixMonthsAgo = new Date(now.getTime() - 183 * dayMs)
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    // Las ventas del owner snapshot necesitan cubrir la ventana seleccionada,
    // el MTD (hasta 31 dias) y los 7d fijos del radar.
    const ownerSalesStart = new Date(Math.min(windowStart.getTime(), now.getTime() - 31 * dayMs))

    const [
      tierData,
      agentMetricsRes,
      topTopicsData,
      mrrRes,
      churnRiskData,
      videoConversionData,
      cohortRetentionData,
      memberGrowthData,
      activeMembersData,
      interventionQueueData,
      funnelData,
      attributionData,
      revenueHistory,
      subscriptionMix,
      engagement30d,
      referralStats,
      topReferrers,
      referralTrend,
      ownerPurchasesRes,
      salesLeadRowsRes,
    ] = await Promise.all([
      // Tier distribution via raw SQL (needs GROUP BY)
      rawSQL(`SELECT tier, has_community_access, COUNT(*) as cnt
              FROM profiles
              GROUP BY tier, has_community_access
              ORDER BY cnt DESC`),

      // Agent metrics (last 7 days) — PostgREST works fine
      sf
        .from('daily_agent_metrics')
        .select('date, agent_name, total_sessions, frustration_count, resolved_count, frustration_rate, resolution_rate, unique_users')
        .order('date', { ascending: false })
        .limit(120),

      // Top topics via raw SQL (needs LATERAL + jsonb_array_elements)
      rawSQL(`SELECT t.topic, COUNT(*) as total,
              COUNT(*) FILTER (WHERE (cs.classification->'flags'->>'frustration_detected')::boolean = true) as frustrated,
              COUNT(*) FILTER (WHERE (cs.classification->'flags'->>'resolved')::boolean = true) as resolved
              FROM conversation_sessions cs, jsonb_array_elements_text(cs.classification->'topics') as t(topic)
              WHERE cs.user_message_count > 0 AND cs.classification IS NOT NULL
              GROUP BY t.topic HAVING COUNT(*) >= 20
              ORDER BY total DESC LIMIT 15`),

      // MRR trend (last 90 days) — PostgREST works fine
      sf
        .from('daily_business_metrics')
        .select('date, mrr_cents, active_subs, cancel_at_period_end, polar_reconciled_at')
        .order('date', { ascending: false })
        .limit(90),

      // Churn risk users via raw SQL (needs CTE + DISTINCT ON)
      rawSQL(`WITH latest_purchase AS (
                SELECT DISTINCT ON (user_id) user_id, status, scheduled_for_removal,
                       cancel_at_period_end, locked_price_cents, locked_billing_interval
                FROM community_purchases
                WHERE status IN ('completed', 'cancelled')
                ORDER BY user_id, created_at DESC
              )
              SELECT p.full_name, p.email, p.current_level, p.total_points, p.tier,
                     p.has_community_access,
                     EXTRACT(EPOCH FROM (NOW() - p.last_seen)) / 86400 AS days_inactive,
                     lp.locked_billing_interval, lp.locked_price_cents
              FROM latest_purchase lp
              JOIN profiles p ON p.id = lp.user_id
              WHERE lp.status = 'completed'
                AND lp.cancel_at_period_end = false
                AND lp.scheduled_for_removal IS NOT true
                AND p.has_community_access = true
              ORDER BY p.total_points ASC, p.current_level ASC
              LIMIT 10`),

      // Video conversion: top videos by attribution + ml_features
      rawSQL(`SELECT
                yv.video_id, yv.title, yv.views,
                yv.avg_view_percentage, yv.subscribers_gained,
                yv.ml_features->>'category' as category,
                (yv.ml_features->>'cta_strength')::int as cta_strength,
                (yv.ml_features->>'avatar_alignment')::int as avatar_alignment,
                (yv.ml_features->>'hook_quality')::int as hook_quality,
                (yv.ml_features->>'value_density')::int as value_density,
                yv.ml_features->>'emotional_arc' as emotional_arc,
                yv.ml_features->'tools_demonstrated' as tools_demonstrated,
                yv.ml_features->>'transformation_promise' as transformation_promise,
                COALESCE(attr.total_visits, 0) as total_visits,
                COALESCE(attr.total_payments, 0) as total_payments,
                COALESCE(attr.total_revenue_cents, 0) as total_revenue_cents,
                CASE WHEN COALESCE(attr.total_visits, 0) >= 5
                     THEN ROUND(COALESCE(attr.total_payments, 0)::numeric / attr.total_visits * 100, 2)
                     ELSE NULL END as conversion_rate
              FROM youtube_videos yv
              LEFT JOIN LATERAL (
                SELECT SUM(funnel_visits) as total_visits,
                       SUM(funnel_payments) as total_payments,
                       SUM(funnel_revenue_cents) as total_revenue_cents
                FROM daily_video_attribution dva WHERE dva.video_id = yv.video_id
              ) attr ON true
              WHERE yv.ml_features IS NOT NULL
              ORDER BY COALESCE(attr.total_revenue_cents, 0) DESC
              LIMIT 20`),

      // Cohort retention (last 6 months)
      rawSQL(`WITH cohorts AS (
                SELECT
                  date_trunc('month', cp.created_at)::date as cohort_month,
                  cp.user_id
                FROM community_purchases cp
                WHERE cp.status IN ('completed', 'cancelled')
                GROUP BY 1, 2
              ),
              retention AS (
                SELECT
                  c.cohort_month,
                  COUNT(DISTINCT c.user_id) as cohort_size,
                  COUNT(DISTINCT CASE WHEN p.last_seen >= c.cohort_month + interval '0 months' AND p.last_seen < c.cohort_month + interval '1 month' THEN c.user_id END) as m0,
                  COUNT(DISTINCT CASE WHEN p.last_seen >= c.cohort_month + interval '1 month' AND p.last_seen < c.cohort_month + interval '2 months' THEN c.user_id END) as m1,
                  COUNT(DISTINCT CASE WHEN p.last_seen >= c.cohort_month + interval '2 months' AND p.last_seen < c.cohort_month + interval '3 months' THEN c.user_id END) as m2,
                  COUNT(DISTINCT CASE WHEN p.last_seen >= c.cohort_month + interval '3 months' AND p.last_seen < c.cohort_month + interval '4 months' THEN c.user_id END) as m3
                FROM cohorts c
                JOIN profiles p ON p.id = c.user_id
                GROUP BY c.cohort_month
                ORDER BY c.cohort_month DESC
                LIMIT 6
              )
              SELECT * FROM retention`),

      // Member growth (monthly new vs churned, last 6 months)
      rawSQL(`SELECT
                date_trunc('month', created_at)::date as month,
                COUNT(*) FILTER (WHERE status = 'completed') as new_members,
                COUNT(*) FILTER (WHERE status = 'cancelled') as churned_members
              FROM community_purchases
              WHERE created_at >= NOW() - interval '6 months'
              GROUP BY 1
              ORDER BY 1`),

      // Active members (30d, 7d, 1d)
      rawSQL(`SELECT
                COUNT(*) FILTER (WHERE last_seen >= NOW() - interval '30 days') as active_30d,
                COUNT(*) FILTER (WHERE last_seen >= NOW() - interval '7 days') as active_7d,
                COUNT(*) FILTER (WHERE last_seen >= NOW() - interval '1 day') as active_1d,
                COUNT(*) as total
              FROM profiles
              WHERE has_community_access = true`),

      // Intervention queue (last 48h flagged sessions)
      rawSQL(`SELECT cs.id, cs.user_id, cs.agent_id, cs.first_message_at, cs.message_count,
                cs.classification->>'summary' as summary,
                (cs.classification->'flags'->>'frustration_detected')::boolean as frustration,
                (cs.classification->'flags'->>'escalation_needed')::boolean as escalation,
                (cs.classification->'flags'->>'bug_reported')::boolean as bug,
                p.full_name as user_name
              FROM conversation_sessions cs
              JOIN profiles p ON p.id = cs.user_id
              WHERE cs.first_message_at >= NOW() - interval '48 hours'
                AND cs.user_message_count > 0
                AND cs.classification IS NOT NULL
                AND (
                  (cs.classification->'flags'->>'frustration_detected')::boolean = true
                  OR (cs.classification->'flags'->>'escalation_needed')::boolean = true
                  OR (cs.classification->'flags'->>'bug_reported')::boolean = true
                )
              ORDER BY cs.first_message_at DESC
              LIMIT 20`),

      // Funnel data (ventana seleccionada)
      // payment_verified: count NEW purchases from community_purchases (NOT funnel_events).
      // funnel_events.payment_verified is inflated by (a) webhook duplicates from Polar
      // (checkout.confirmed + checkout.succeeded + order.created all fire events) and
      // (b) monthly renewals which are not "conversions" for this funnel.
      // Source of truth = community_purchases.created_at in window.
      rawSQL(`SELECT event_name, cnt FROM (
                SELECT event_name, COUNT(*) as cnt,
                  CASE event_name
                    WHEN 'about_page_view' THEN 1
                    WHEN 'about_cta_click' THEN 2
                    WHEN 'signup_completed' THEN 3
                    WHEN 'checkout_page_view' THEN 4
                    WHEN 'plan_selected' THEN 5
                  END as ord
                FROM funnel_events
                WHERE created_at >= NOW() - interval '${windowDays} days'
                  AND event_name IN ('about_page_view','about_cta_click','signup_completed','checkout_page_view','plan_selected')
                GROUP BY event_name
                UNION ALL
                SELECT 'payment_verified' as event_name, COUNT(*) as cnt, 6 as ord
                FROM community_purchases
                WHERE created_at >= NOW() - interval '${windowDays} days'
                  AND status IN ('completed','cancelled')
              ) t ORDER BY ord`),

      // Attribution data (ventana seleccionada) — from daily_video_attribution which has real revenue
      rawSQL(`SELECT
                dva.video_id as source,
                yv.title as source_label,
                SUM(dva.funnel_payments) as conversions,
                SUM(dva.funnel_revenue_cents) as revenue_cents,
                SUM(dva.link_clicks) as clicks
              FROM daily_video_attribution dva
              JOIN youtube_videos yv ON yv.video_id = dva.video_id
              WHERE dva.date >= (NOW() - interval '${windowDays} days')::date
                AND dva.funnel_payments > 0
              GROUP BY dva.video_id, yv.title
              ORDER BY revenue_cents DESC
              LIMIT 15`),

      // Revenue history (6 months, monthly breakdown)
      rawSQL(`SELECT
                TO_CHAR(purchased_at, 'YYYY-MM') as month,
                SUM(CASE WHEN locked_billing_interval = 'month' THEN COALESCE(locked_price_cents, 1900) ELSE 0 END) as monthly_revenue_cents,
                SUM(CASE WHEN locked_billing_interval = 'year' THEN COALESCE(locked_price_cents, 19900) ELSE 0 END) as annual_revenue_cents,
                COUNT(*) FILTER (WHERE locked_billing_interval = 'month') as monthly_count,
                COUNT(*) FILTER (WHERE locked_billing_interval = 'year') as annual_count
              FROM community_purchases
              WHERE status = 'completed'
                AND purchased_at >= NOW() - interval '6 months'
              GROUP BY 1
              ORDER BY 1`),

      // Subscription mix (current active)
      rawSQL(`SELECT
                locked_billing_interval as interval,
                COUNT(*) as count,
                SUM(COALESCE(locked_price_cents, CASE WHEN locked_billing_interval = 'year' THEN 19900 ELSE 1900 END)) as total_cents
              FROM community_purchases
              WHERE status = 'completed'
                AND cancel_at_period_end = false
                AND scheduled_for_removal IS NOT true
              GROUP BY locked_billing_interval`),

      // Engagement summary (ventana seleccionada; los alias _30d son legacy del shape)
      rawSQL(`SELECT
                (SELECT COUNT(*) FROM posts WHERE created_at >= NOW() - interval '${windowDays} days') as posts_30d,
                (SELECT COUNT(*) FROM comments WHERE created_at >= NOW() - interval '${windowDays} days') as comments_30d,
                (SELECT COUNT(*) FROM lesson_progress WHERE completed = true AND completed_at >= NOW() - interval '${windowDays} days') as lessons_30d`),

      // Referral data
      rawSQL(`SELECT
                (SELECT COUNT(*) FROM referrals WHERE status = 'active') as total_referrals,
                (SELECT COUNT(DISTINCT referrer_id) FROM referrals) as unique_referrers,
                (SELECT COALESCE(SUM(commission_cents), 0) FROM referral_commissions) as total_commission_cents,
                (SELECT COALESCE(SUM(purchase_amount_cents), 0) FROM referral_commissions) as total_purchase_cents,
                (SELECT COUNT(*) FROM referrals WHERE status = 'active')::float / NULLIF((SELECT COUNT(*) FROM profiles WHERE has_community_access = true), 0) as k_factor`),

      // Top referrers
      rawSQL(`SELECT r.referrer_id, p.full_name, COUNT(*) as referrals,
                COUNT(*) FILTER (WHERE r.status = 'active') as active,
                COALESCE(SUM(rc.commission_cents), 0) as earned_cents
              FROM referrals r
              JOIN profiles p ON p.id = r.referrer_id
              LEFT JOIN referral_commissions rc ON rc.referrer_id = r.referrer_id
              GROUP BY r.referrer_id, p.full_name
              ORDER BY referrals DESC
              LIMIT 10`),

      // Referral monthly trend
      rawSQL(`SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as new_referrals
              FROM referrals
              GROUP BY 1 ORDER BY 1`),

      // Owner snapshot sales source. Keep this on PostgREST so the first screen
      // does not depend on Supabase Management API rate limits.
      sf
        .from('community_purchases')
        .select('created_at, status, locked_price_cents, locked_billing_interval')
        .gte('created_at', ownerSalesStart.toISOString())
        .in('status', ['completed', 'cancelled'])
        .limit(1000),

      sf
        .from('youtube_comment_classifications')
        .select('lead_score, lead_urgency')
        .eq('category', 'sales-opportunity')
        .not('lead_score', 'is', null)
        .gte('lead_score', 60)
        .limit(5000),
    ])

    // Fallbacks + counts en UNA sola ola paralela. Antes esto eran 3 olas
    // secuenciales (tiers → 12 fallbacks → 4 counts de funnel) cuando ninguna
    // depende de otra — puro round-trip serial regalado en cada carga.
    let finalTiers = tierData
    let finalActiveMembers = activeMembersData?.[0] || null
    const needsTierFallback = finalTiers.length === 0 || !finalActiveMembers
    if (needsTierFallback) {
      console.warn('[ml-dashboard] rawSQL returned empty for tiers/activeMembers, using PostgREST fallback')
    }

    const needsReferralFallback = referralStats.length === 0 || topReferrers.length === 0 || referralTrend.length === 0
    const funnelCountQuery = (eventName: string) =>
      sf.from('funnel_events').select('*', { count: 'exact', head: true }).gte('created_at', windowStart.toISOString()).eq('event_name', eventName)
    const [
      finalTopTopicsData,
      finalChurnRiskData,
      finalVideoConversionData,
      finalCohortRetentionData,
      finalMemberGrowthData,
      finalInterventionQueueData,
      finalFunnelData,
      finalAttributionData,
      finalRevenueHistory,
      finalSubscriptionMix,
      finalEngagement30d,
      referralFallback,
      tierFallback,
      ownerPageViewCount,
      ownerCtaClickCount,
      ownerCheckoutCount,
      ownerPlanCount,
    ] = await Promise.all([
      topTopicsData.length > 0 ? Promise.resolve(topTopicsData) : postgrestTopTopics(sf),
      churnRiskData.length > 0 ? Promise.resolve(churnRiskData) : postgrestChurnRisk(sf),
      postgrestVideoConversion(sf),
      cohortRetentionData.length > 0 ? Promise.resolve(cohortRetentionData) : postgrestCohortRetention(sf),
      memberGrowthData.length > 0 ? Promise.resolve(memberGrowthData) : postgrestMemberGrowth(sf, sixMonthsAgo),
      interventionQueueData.length > 0 ? Promise.resolve(interventionQueueData) : postgrestInterventionQueue(sf, fortyEightHoursAgo),
      funnelData.length > 0 ? Promise.resolve(funnelData) : postgrestFunnelData(sf, windowStart),
      postgrestAttributionData(sf, windowStart),
      revenueHistory.length > 0 ? Promise.resolve(revenueHistory) : postgrestRevenueHistory(sf, sixMonthsAgo),
      subscriptionMix.length > 0 ? Promise.resolve(subscriptionMix) : postgrestSubscriptionMix(sf),
      engagement30d.length > 0 ? Promise.resolve(engagement30d) : postgrestEngagement30d(sf, windowStart).then(row => [row]),
      needsReferralFallback ? postgrestReferralStats(sf) : Promise.resolve(null),
      needsTierFallback ? fallbackTiersAndActive(sf) : Promise.resolve(null),
      funnelCountQuery('about_page_view'),
      funnelCountQuery('about_cta_click'),
      funnelCountQuery('checkout_page_view'),
      funnelCountQuery('plan_selected'),
    ])

    if (tierFallback) {
      if (finalTiers.length === 0) finalTiers = tierFallback.tiers
      if (!finalActiveMembers) finalActiveMembers = tierFallback.activeMembers
    }

    const finalReferralStats = referralStats.length > 0 ? referralStats : referralFallback?.referralStats ?? []
    const finalTopReferrers = topReferrers.length > 0 ? topReferrers : referralFallback?.topReferrers ?? []
    const finalReferralTrend = referralTrend.length > 0 ? referralTrend : referralFallback?.referralTrend ?? []

    if (ownerPurchasesRes.error) {
      console.error('[ml-dashboard] owner purchases error:', ownerPurchasesRes.error.message)
    }
    if (salesLeadRowsRes.error) {
      console.error('[ml-dashboard] sales leads error:', salesLeadRowsRes.error.message)
    }

    const ownerPurchases = ownerPurchasesRes.data ?? []
    const purchaseStats = ownerPurchases.reduce((acc, row) => {
      const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0
      const interval = row.locked_billing_interval === 'year' ? 'year' : 'month'
      const price = Number(row.locked_price_cents ?? (interval === 'year' ? 19_900 : 1_900))

      if (createdAt >= sevenDaysAgo.getTime()) {
        acc.purchases_7d += 1
        acc.booked_cents_7d += price
      }

      if (createdAt >= windowStart.getTime()) {
        acc.purchases_window += 1
        acc.booked_cents_window += price
        if (interval === 'year') acc.annual_window += 1
        else acc.monthly_window += 1
        acc.new_mrr_cents_window += interval === 'year' ? Math.floor(price / 12) : price
      }

      if (createdAt >= monthStart.getTime()) {
        acc.purchases_mtd += 1
        acc.booked_cents_mtd += price
        if (interval === 'year') acc.annual_mtd += 1
        else acc.monthly_mtd += 1
      }

      return acc
    }, {
      purchases_7d: 0,
      booked_cents_7d: 0,
      purchases_window: 0,
      booked_cents_window: 0,
      purchases_mtd: 0,
      booked_cents_mtd: 0,
      monthly_mtd: 0,
      annual_mtd: 0,
      monthly_window: 0,
      annual_window: 0,
      new_mrr_cents_window: 0,
    })

    const rawFunnelCounts = new Map((finalFunnelData ?? []).map(row => [String(row.event_name), toNumber(row.cnt)]))
    const ownerFunnelCounts = new Map<string, number>([
      ['about_page_view', ownerPageViewCount.count ?? 0],
      ['about_cta_click', ownerCtaClickCount.count ?? 0],
      ['checkout_page_view', ownerCheckoutCount.count ?? 0],
      ['plan_selected', ownerPlanCount.count ?? 0],
    ])
    const hasOwnerFunnelCounts = [ownerPageViewCount, ownerCtaClickCount, ownerCheckoutCount, ownerPlanCount]
      .every(res => !res.error)
    if (!hasOwnerFunnelCounts) {
      console.error('[ml-dashboard] owner funnel count error:', [ownerPageViewCount, ownerCtaClickCount, ownerCheckoutCount, ownerPlanCount]
        .map(res => res.error?.message)
        .filter(Boolean)
        .join(' | '))
    }
    const getFunnelCount = (eventName: string) => hasOwnerFunnelCounts
      ? ownerFunnelCounts.get(eventName) ?? 0
      : rawFunnelCounts.get(eventName) ?? 0

    const salesLeadRows = salesLeadRowsRes.data ?? []
    const salesLeadStats = salesLeadRows.reduce((acc, row) => {
      acc.sales_leads_total += 1
      if (row.lead_urgency === 'critical') acc.sales_leads_critical += 1
      if (row.lead_urgency === 'high') acc.sales_leads_high += 1
      return acc
    }, {
      sales_leads_total: 0,
      sales_leads_critical: 0,
      sales_leads_high: 0,
    })

    const latestMetric = mrrRes.data?.[0] ?? null
    const topAttribution = pickFirst(finalAttributionData)
    const funnelVisitsWindow = getFunnelCount('about_page_view')
    const ownerSnapshot = {
      metric_date: toStringOrNull(latestMetric?.date),
      mrr_cents: toNumber(latestMetric?.mrr_cents),
      active_subs: toNumber(latestMetric?.active_subs),
      cancel_at_period_end: toNumber(latestMetric?.cancel_at_period_end),
      polar_reconciled_at: toStringOrNull(latestMetric?.polar_reconciled_at),
      window_days: windowDays,
      ...purchaseStats,
      avg_ticket_cents_window: purchaseStats.purchases_window > 0
        ? Math.round(purchaseStats.booked_cents_window / purchaseStats.purchases_window)
        : 0,
      funnel_visits_window: funnelVisitsWindow,
      funnel_clicks_window: getFunnelCount('about_cta_click'),
      funnel_checkouts_window: getFunnelCount('checkout_page_view'),
      funnel_plans_window: getFunnelCount('plan_selected'),
      funnel_payments_window: purchaseStats.purchases_window,
      funnel_conversion_pct_window: funnelVisitsWindow > 0
        ? Math.round((purchaseStats.purchases_window / funnelVisitsWindow) * 10_000) / 100
        : 0,
      active_7d: toNumber(finalActiveMembers?.active_7d),
      active_30d: toNumber(finalActiveMembers?.active_30d),
      flagged_interventions_48h: finalInterventionQueueData.length,
      ...salesLeadStats,
      top_video_title_window: toStringOrNull(topAttribution?.source_label),
      top_video_payments_window: toNumber(topAttribution?.conversions),
      top_video_revenue_cents_window: toNumber(topAttribution?.revenue_cents),
    }

    return NextResponse.json({
      tiers: finalTiers,
      agentMetrics: agentMetricsRes.data,
      topTopics: finalTopTopicsData,
      mrr: mrrRes.data,
      churnRisk: finalChurnRiskData,
      videoConversion: finalVideoConversionData,
      cohortRetention: finalCohortRetentionData,
      memberGrowth: finalMemberGrowthData,
      activeMembers: finalActiveMembers || { active_30d: 0, active_7d: 0, active_1d: 0, total: 0 },
      interventionQueue: finalInterventionQueueData,
      funnelData: finalFunnelData,
      attributionData: finalAttributionData,
      revenueHistory: finalRevenueHistory,
      subscriptionMix: finalSubscriptionMix,
      engagement30d: finalEngagement30d?.[0] || { posts_30d: 0, comments_30d: 0, lessons_30d: 0 },
      referralStats: finalReferralStats?.[0] || { total_referrals: 0, unique_referrers: 0, total_commission_cents: 0, total_purchase_cents: 0, k_factor: 0 },
      topReferrers: finalTopReferrers,
      referralTrend: finalReferralTrend,
      ownerSnapshot,
      windowDays,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('ML Analytics error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
