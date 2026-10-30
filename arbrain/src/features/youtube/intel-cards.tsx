'use client'

// Tarjetas y helpers de Intel — usados por RadarView (sección "afuera").
// Extraído del viejo IntelView en el rediseño Bandeja/Radar (11 jul 2026).

import { useState } from 'react'
import {
  TrendingUp, Lightbulb, ExternalLink, Eye, ThumbsUp, Clock,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IntelVideo {
  id: string
  video_id: string
  channel_id: string | null
  channel_name: string
  title: string
  thumbnail_url: string
  views: number
  likes: number
  duration_seconds: number
  published_at: string
  language: 'es' | 'en'
  keywords_matched: string[]
  velocity: number
  relevance_score: number
  relevance_reason: string
  opportunity_flag: boolean
  opportunity_topic: string
  predicted_conversion: number | null
  ml_features: Record<string, unknown> | null
}

export interface FeedVideo extends IntelVideo {
  channel_thumbnail_url: string | null
  channel_url: string | null
  channel_category: string | null
  channel_language: string | null
}

export interface IntelSummary {
  total_videos: number
  total_channels: number
  new_last_24h: number
  high_velocity: number
  with_predictions: number
}

export interface IntelData {
  trending: IntelVideo[]
  opportunities: IntelVideo[]
  feed: FeedVideo[]
  summary: IntelSummary
  timestamp: string
}

export type LangFilter = 'all' | 'es' | 'en'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Streams terminados devuelven 404 en *_live.jpg → caer al thumbnail estándar; si no, ocultar. */
export function handleThumbError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget
  if (img.src.includes('_live.')) img.src = img.src.replace('_live.', '.')
  else img.style.visibility = 'hidden'
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

export function velocityColor(v: number): string {
  if (v >= 5000) return 'text-red-400'
  if (v >= 1000) return 'text-orange-400'
  if (v >= 100) return 'text-yellow-400'
  return 'text-muted'
}

function relevanceBadge(score: number): { text: string; cls: string } {
  if (score >= 0.8) return { text: 'High', cls: 'bg-emerald-500/15 text-emerald-400' }
  if (score >= 0.5) return { text: 'Medium', cls: 'bg-yellow-500/15 text-yellow-400' }
  if (score >= 0.2) return { text: 'Low', cls: 'bg-card-hover text-muted' }
  return { text: 'None', cls: 'bg-card text-muted/60' }
}

// ─── Cards ──────────────────────────────────────────────────────────────────

export function VideoCard({ video }: { video: IntelVideo }) {
  return (
    <div className="bg-card/60 border border-border-subtle rounded-xl p-3 hover:bg-card-hover transition-colors">
      <div className="flex gap-3">
        {video.thumbnail_url && (
          <a
            href={`https://youtube.com/watch?v=${video.video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={video.thumbnail_url} alt="" onError={handleThumbError} className="w-36 h-20 rounded-lg object-cover bg-card-active" />
          </a>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <a
              href={`https://youtube.com/watch?v=${video.video_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground hover:text-violet-300 transition-colors line-clamp-2"
            >
              {video.title}
            </a>
            <ExternalLink size={12} className="text-muted/60 flex-shrink-0 mt-1" />
          </div>

          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
            <span className="font-medium text-foreground/75">{video.channel_name}</span>
            <span>·</span>
            <span>{timeAgo(video.published_at)}</span>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-[11px]">
            <span className="flex items-center gap-1 text-muted">
              <Eye size={11} /> {formatViews(video.views)}
            </span>
            <span className="flex items-center gap-1 text-muted">
              <ThumbsUp size={11} /> {formatViews(video.likes)}
            </span>
            <span className="flex items-center gap-1 text-muted">
              <Clock size={11} /> {formatDuration(video.duration_seconds)}
            </span>
            <span className={`flex items-center gap-1 font-semibold ${velocityColor(video.velocity)}`}>
              <TrendingUp size={11} /> {formatViews(video.velocity)}/h
            </span>
            {video.relevance_score > 0 && (() => {
              const badge = relevanceBadge(video.relevance_score)
              return <span className={`px-1.5 py-0.5 rounded text-[10px] ${badge.cls}`}>{badge.text}</span>
            })()}
          </div>

          {video.keywords_matched?.length > 0 && (
            <div className="flex gap-1 mt-1.5">
              {[...new Set(video.keywords_matched)].map((kw, i) => (
                <span key={`${kw}-${i}`} className="px-1.5 py-0.5 bg-violet-500/10 text-violet-300 rounded text-[10px]">{kw}</span>
              ))}
            </div>
          )}

          {video.relevance_reason && (
            <p className="text-[11px] text-muted mt-1 line-clamp-1">{video.relevance_reason}</p>
          )}
        </div>
      </div>

      {video.opportunity_flag && video.opportunity_topic && (
        <div className="mt-2 px-2 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
          <Lightbulb size={12} className="text-emerald-400 flex-shrink-0" />
          <span className="text-[11px] text-emerald-300">{video.opportunity_topic}</span>
        </div>
      )}
    </div>
  )
}

export function FeedItem({ video }: { video: FeedVideo }) {
  const catColor = video.channel_category === 'competitor'
    ? 'bg-red-500/15 text-red-400'
    : 'bg-blue-500/15 text-blue-400'

  return (
    <div className="bg-card/60 border border-border-subtle rounded-xl p-3 hover:bg-card-hover transition-colors">
      <div className="flex gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {video.channel_thumbnail_url ? (
            <a href={video.channel_url || '#'} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={video.channel_thumbnail_url}
                alt=""
                className="w-9 h-9 rounded-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            </a>
          ) : (
            <div className="w-9 h-9 rounded-full bg-card-active flex items-center justify-center text-xs text-foreground/70 font-medium">
              {video.channel_name[0]}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px]">
            <a
              href={video.channel_url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-foreground/85 hover:text-violet-300 transition-colors"
            >
              {video.channel_name}
            </a>
            <span className="text-muted/70">·</span>
            <span className="text-muted">{timeAgo(video.published_at)}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${catColor}`}>
              {video.channel_category}
            </span>
          </div>

          <a
            href={`https://youtube.com/watch?v=${video.video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-foreground hover:text-violet-300 transition-colors mt-1 block line-clamp-2"
          >
            {video.title}
          </a>

          <div className="flex gap-3 mt-2">
            {video.thumbnail_url && (
              <a
                href={`https://youtube.com/watch?v=${video.video_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={video.thumbnail_url} alt="" onError={handleThumbError} className="w-28 h-16 rounded-lg object-cover bg-card-active" />
              </a>
            )}
            <div className="flex flex-col justify-between py-0.5">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-muted">
                  <Eye size={11} /> {formatViews(video.views)}
                </span>
                <span className="flex items-center gap-1 text-muted">
                  <ThumbsUp size={11} /> {formatViews(video.likes)}
                </span>
                <span className="flex items-center gap-1 text-muted">
                  <Clock size={11} /> {formatDuration(video.duration_seconds)}
                </span>
                <span className={`flex items-center gap-1 font-semibold ${velocityColor(video.velocity)}`}>
                  <TrendingUp size={11} /> {formatViews(video.velocity)}/h
                </span>
              </div>
              {video.relevance_reason && (
                <p className="text-[10px] text-muted line-clamp-2 mt-1">{video.relevance_reason}</p>
              )}
            </div>
          </div>

          {video.opportunity_flag && video.opportunity_topic && (
            <div className="mt-2 px-2 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
              <Lightbulb size={12} className="text-emerald-400 flex-shrink-0" />
              <span className="text-[11px] text-emerald-300">{video.opportunity_topic}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function OpportunityCard({ video }: { video: IntelVideo }) {
  const pred = video.predicted_conversion
  const hasPrediction = pred !== null && pred !== undefined && pred > 0
  const ml = video.ml_features as Record<string, number> | null

  return (
    <div className="bg-card/60 border border-border-subtle rounded-xl p-3 hover:bg-card-hover transition-colors">
      <div className="flex gap-3">
        {video.thumbnail_url && (
          <a href={`https://youtube.com/watch?v=${video.video_id}`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={video.thumbnail_url} alt="" onError={handleThumbError} className="w-36 h-20 rounded-lg object-cover bg-card-active" />
          </a>
        )}

        <div className="flex-1 min-w-0">
          <a href={`https://youtube.com/watch?v=${video.video_id}`} target="_blank" rel="noopener noreferrer"
            className="text-sm font-medium text-foreground hover:text-violet-300 transition-colors line-clamp-2">
            {video.title}
          </a>

          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
            <span className="font-medium text-foreground/75">{video.channel_name}</span>
            <span>·</span>
            <span>{timeAgo(video.published_at)}</span>
            <span className="flex items-center gap-1 text-muted">
              <Eye size={11} /> {formatViews(video.views)}
            </span>
            <span className={`flex items-center gap-1 font-semibold ${velocityColor(video.velocity)}`}>
              <TrendingUp size={11} /> {formatViews(video.velocity)}/h
            </span>
          </div>

          {hasPrediction && ml && (
            <div className="mt-2 bg-emerald-500/[0.06] rounded-lg p-2 border border-emerald-500/15">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <TrendingUp size={12} className="text-emerald-400" />
                  <span className="text-lg font-bold text-emerald-400">{(pred * 100).toFixed(1)}%</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-muted mb-1">Predicted conversion</div>
                  <div className="flex gap-1.5">
                    {[
                      { label: 'Avatar', value: ml.avatar_alignment, max: 5 },
                      { label: 'Hook', value: ml.hook_quality, max: 5 },
                      { label: 'CTA', value: ml.cta_strength, max: 5 },
                      { label: 'Value', value: ml.value_density, max: 5 },
                    ].map(({ label, value, max }) => (
                      <div key={label} className="flex items-center gap-1 text-[9px]">
                        <span className="text-muted/80">{label}</span>
                        <span className="text-foreground/70 font-medium">{value || 0}/{max}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {video.relevance_reason && (
            <p className="text-[11px] text-muted mt-1.5 line-clamp-1">{video.relevance_reason}</p>
          )}
        </div>
      </div>

      {video.opportunity_topic && (
        <div className="mt-2 px-2 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
          <Lightbulb size={12} className="text-emerald-400 flex-shrink-0" />
          <span className="text-[11px] text-emerald-300">{video.opportunity_topic}</span>
        </div>
      )}
    </div>
  )
}

// ─── Feed con filtros (agrupado por día) ────────────────────────────────────

export function IntelFeed({ data }: { data: IntelData }) {
  const [langFilter, setLangFilter] = useState<LangFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'competitor' | 'reference'>('all')
  const [sortBy, setSortBy] = useState('recent')

  const filtered = data.feed
    .filter(v => {
      const lang = v.channel_language || v.language
      if (langFilter !== 'all' && lang !== langFilter) return false
      if (categoryFilter !== 'all' && v.channel_category !== categoryFilter) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'velocity') return (b.velocity || 0) - (a.velocity || 0)
      if (sortBy === 'views') return (b.views || 0) - (a.views || 0)
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    })

  const groups: { label: string; videos: FeedVideo[] }[] = []
  const now = Date.now()
  const DAY = 86400000

  const today: FeedVideo[] = []
  const yesterday: FeedVideo[] = []
  const thisWeek: FeedVideo[] = []
  const older: FeedVideo[] = []

  for (const v of filtered) {
    const age = now - new Date(v.published_at).getTime()
    if (age < DAY) today.push(v)
    else if (age < 2 * DAY) yesterday.push(v)
    else if (age < 7 * DAY) thisWeek.push(v)
    else older.push(v)
  }

  if (today.length) groups.push({ label: 'Today', videos: today })
  if (yesterday.length) groups.push({ label: 'Yesterday', videos: yesterday })
  if (thisWeek.length) groups.push({ label: 'This week', videos: thisWeek })
  if (older.length) groups.push({ label: 'Older', videos: older })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['all', 'competitor', 'reference'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  categoryFilter === cat
                    ? cat === 'competitor' ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : cat === 'reference' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                    : 'text-muted hover:text-foreground/70 hover:bg-card'
                }`}
              >
                {cat === 'all' ? 'All' : cat === 'competitor' ? 'Competitors' : 'References'}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {[
              { key: 'recent', label: 'Recent' },
              { key: 'velocity', label: 'Velocity' },
              { key: 'views', label: 'Views' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  sortBy === key
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                    : 'text-muted/80 hover:text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          {([
            { key: 'all' as const, label: 'All' },
            { key: 'es' as const, label: 'Hispano' },
            { key: 'en' as const, label: 'English' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setLangFilter(key)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                langFilter === key
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'text-muted hover:text-foreground/70 hover:bg-card'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-12 text-muted/80 text-sm">
          No recent activity from monitored channels.
        </div>
      ) : (
        groups.map(group => (
          <div key={group.label}>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{group.label}</div>
              <div className="flex-1 h-px bg-card-hover" />
              <div className="text-[10px] text-muted/80">{group.videos.length}</div>
            </div>
            <div className="space-y-2">
              {group.videos.map(video => (
                <FeedItem key={video.id} video={video} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
