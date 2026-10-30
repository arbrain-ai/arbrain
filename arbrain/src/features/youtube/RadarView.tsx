'use client'

// RADAR — el espejo del contenido (rediseño 11 jul 2026, doctrina AI-first).
// Responde DOS preguntas del dueño: ¿cómo rinde mi contenido (en SQL, no views)?
// y ¿qué se mueve afuera (competencia)? Cero botones de acción: las acciones
// se piden hablando con Levy. Sin señal = "sin dato", nunca un placeholder.

import { useCallback, useEffect, useState } from 'react'
import {
  Target, Eye, MousePointerClick, ShoppingCart, RefreshCw, Loader2,
  TrendingUp, Lightbulb, Radar as RadarIcon,
} from 'lucide-react'
import { cacheSnapshot, getCachedSnapshot } from '@/lib/local-first'
import { IntelFeed, VideoCard, OpportunityCard, type IntelData } from './intel-cards'

// ─── Types ──────────────────────────────────────────────────────────────────

interface VideoRow {
  video_id: string
  video_title: string
  yt_views: number
  retention_pct: number | null
  link_clicks: number
  funnel_payments: number
  funnel_revenue_cents: number
}

interface BusinessResp {
  latestBilling?: { mrr_cents?: number; active_subs?: number; date?: string } | null
  topVideos?: VideoRow[]
  videosUpdatedAt?: string | null
  northStarCents?: number | null
  error?: string
}

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const num = (n: number) => n.toLocaleString('en-US')

function relDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days}d`
}

// ─── View ───────────────────────────────────────────────────────────────────

export function RadarView() {
  const [biz, setBiz] = useState<BusinessResp | null>(null)
  const [intel, setIntel] = useState<IntelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTrending, setShowTrending] = useState(true)
  const [showOpps, setShowOpps] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [bizResult, intelResult] = await Promise.allSettled([
      fetch('/api/analytics/business', { cache: 'no-store' }).then(async res => {
        const json = (await res.json()) as BusinessResp
        if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
        return json
      }),
      fetch('/api/analytics/intel', { cache: 'no-store' }).then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as IntelData
      }),
    ])

    if (bizResult.status === 'fulfilled') {
      setBiz(bizResult.value)
      cacheSnapshot('dashboard', 'radar:business', bizResult.value).catch(() => {})
    } else {
      const cached = await getCachedSnapshot<BusinessResp>('radar:business').catch(() => null)
      if (cached) setBiz(cached)
      else setError(String(bizResult.reason?.message ?? bizResult.reason))
    }

    if (intelResult.status === 'fulfilled') {
      setIntel(intelResult.value)
      cacheSnapshot('intel', 'radar:intel', intelResult.value).catch(() => {})
    } else {
      const cached = await getCachedSnapshot<IntelData>('radar:intel').catch(() => null)
      if (cached) setIntel(cached)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    // Stale-while-revalidate: pinta snapshots cacheados al instante, refresca en background.
    Promise.all([
      getCachedSnapshot<BusinessResp>('radar:business').catch(() => null),
      getCachedSnapshot<IntelData>('radar:intel').catch(() => null),
    ]).then(([b, i]) => {
      if (!active) return
      if (b) setBiz(b)
      if (i) setIntel(i)
      if (b || i) setLoading(false)
    }).finally(() => { if (active) load() })
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => { active = false; clearInterval(interval) }
  }, [load])

  const billing = biz?.latestBilling ?? null
  const mrr = billing ? (billing.mrr_cents ?? 0) / 100 : null
  const arr = mrr != null ? mrr * 12 : null
  const billingFreshness = relDate(billing?.date)
  const northStar = biz?.northStarCents != null ? biz.northStarCents / 100 : null
  const progress = northStar && mrr != null ? Math.min(1, mrr / northStar) : null
  const videos = [...(biz?.topVideos ?? [])].sort((a, b) => b.funnel_payments - a.funnel_payments)
  const totalSql = videos.reduce((s, v) => s + v.funnel_payments, 0)
  const videosFreshness = relDate(biz?.videosUpdatedAt)

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-28 md:px-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Radar</h1>
            <p className="mt-1 text-sm text-muted">
              Cómo rinde tu contenido (<span className="text-foreground/80">en SQL, no en views</span>) y qué se mueve afuera.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border-subtle bg-card px-3 py-2 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Actualizar
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {/* North Star */}
        <div className="mb-6 rounded-2xl border border-border-subtle bg-card p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted">
            <Target size={14} /> North Star · MRR
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {mrr != null ? (
              <span className="text-4xl font-bold text-foreground">{usd(mrr)}</span>
            ) : (
              <span className="text-2xl font-bold text-muted">sin dato de billing</span>
            )}
            {mrr != null && northStar != null && progress != null ? (
              <span className="text-sm text-muted">/ meta {usd(northStar)} ({pct(progress)})</span>
            ) : mrr != null ? (
              <span className="text-sm text-muted">meta sin configurar — pídesela a Levy</span>
            ) : null}
            {mrr != null && (
              <span className="ml-auto text-sm text-muted">
                ARR {usd(arr ?? 0)} · {num(billing?.active_subs ?? 0)} subs
                {billingFreshness && billingFreshness !== 'hoy' && <span className="text-muted/70" title="Fecha del último snapshot de billing (polar-sync)"> · snapshot {billingFreshness}</span>}
              </span>
            )}
          </div>
          {progress != null && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-card-hover">
              <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>

        {/* Top videos por SQL */}
        <div className="rounded-2xl border border-border-subtle bg-card">
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Top videos por SQL</h2>
            <span className="text-xs text-muted">
              {totalSql} SQL en el top {videos.length}
              {videosFreshness && <span className="ml-2 text-muted/70" title="Última actualización de datos YouTube">· datos {videosFreshness}</span>}
            </span>
          </div>

          {loading && !biz ? (
            <div className="flex items-center justify-center py-16 text-muted">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              <div className="hidden grid-cols-[1fr_repeat(5,5rem)] gap-2 px-5 py-2 text-[10px] uppercase tracking-wider text-muted md:grid">
                <span>Video</span>
                <span className="text-right">Views</span>
                <span className="text-right">Retención</span>
                <span className="text-right">Clicks</span>
                <span className="text-right">SQL</span>
                <span className="text-right">$ Rev</span>
              </div>
              {videos.map((v, i) => {
                const conv = v.link_clicks > 0 ? v.funnel_payments / v.link_clicks : 0
                const sqlPer1k = v.yt_views > 0 ? (v.funnel_payments / v.yt_views) * 1000 : 0
                return (
                  <div
                    key={v.video_id}
                    className="grid grid-cols-2 gap-2 px-5 py-3 md:grid-cols-[1fr_repeat(5,5rem)] md:items-center"
                  >
                    <div className="col-span-2 md:col-span-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">{i + 1}</span>
                        <span className="truncate text-sm text-foreground">{v.video_title}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted">
                        {sqlPer1k.toFixed(2)} SQL / 1k views · conv {pct(conv)}
                      </div>
                    </div>
                    <span className="text-right text-sm text-muted" title="YouTube views">
                      <Eye size={11} className="mr-1 inline opacity-50" />{num(v.yt_views)}
                    </span>
                    <span className="text-right text-sm text-muted" title="Retención promedio (avg view %)">
                      {v.retention_pct != null ? `${v.retention_pct.toFixed(0)}%` : <span className="text-muted/50">sin dato</span>}
                    </span>
                    <span className="text-right text-sm text-muted" title="Clicks al link del video">
                      <MousePointerClick size={11} className="mr-1 inline opacity-50" />{num(v.link_clicks)}
                    </span>
                    <span className="text-right text-sm font-semibold text-foreground" title="Sales Qualified Leads (compras)">
                      <ShoppingCart size={11} className="mr-1 inline opacity-50" />{v.funnel_payments}
                    </span>
                    <span className="text-right text-sm text-foreground/80">{usd(v.funnel_revenue_cents / 100)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <p className="mt-4 mb-8 text-xs text-muted">
          El video con más views no siempre trae más SQL. Mira <span className="text-foreground/70">SQL / 1k views</span>:
          ese es el contenido a reexplotar. Para profundizar: pídele a Levy &ldquo;analiza el rendimiento de mis videos&rdquo;.
        </p>

        {/* ── Afuera: intel de competencia ── */}
        <div className="mb-4 flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/12 border border-primary/30">
            <RadarIcon size={15} className="text-primary" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground leading-none">Afuera</h2>
            <p className="text-[11px] text-muted mt-0.5">competencia en tiempo real · scan cada ~12h, enrich diario</p>
          </div>
          {intel?.summary && (
            <div className="ml-auto flex items-center gap-4 text-[10px] text-muted/80 font-medium tabular-nums">
              <span><span className="text-foreground/85 font-bold">{intel.summary.total_videos}</span> videos</span>
              <span><span className="text-foreground/85 font-bold">{intel.summary.total_channels}</span> canales</span>
              <span className={intel.summary.new_last_24h > 0 ? 'text-success font-semibold' : ''}><span className="font-bold">{intel.summary.new_last_24h}</span> nuevos 24h</span>
              {intel.summary.high_velocity > 0 && <span className="text-gold font-semibold"><span className="font-bold">{intel.summary.high_velocity}</span> alta velocidad</span>}
            </div>
          )}
        </div>

        {!intel ? (
          <div className="rounded-xl border border-border-subtle bg-card p-8 text-center text-muted text-sm">
            {loading ? <Loader2 size={18} className="animate-spin inline" /> : 'Sin datos de intel.'}
          </div>
        ) : (
          <div className="space-y-5">
            {intel.trending.length > 0 && (
              <div>
                <button
                  onClick={() => setShowTrending(!showTrending)}
                  className="flex w-full items-center gap-2 mb-2"
                >
                  <TrendingUp size={13} className="text-gold" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gold">Trending ahora</span>
                  <span className="text-[10px] text-muted/80 tabular-nums">{intel.trending.length}</span>
                  <div className="flex-1 h-px bg-card-hover" />
                  <span className="text-[10px] text-muted/60">{showTrending ? 'ocultar' : 'ver'}</span>
                </button>
                {showTrending && (
                  <div className="space-y-2">
                    {intel.trending.slice(0, 3).map(video => <VideoCard key={video.id} video={video} />)}
                  </div>
                )}
              </div>
            )}

            <IntelFeed data={intel} />

            {intel.opportunities.length > 0 && (
              <div>
                <button
                  onClick={() => setShowOpps(!showOpps)}
                  className="flex w-full items-center gap-2 mb-2"
                >
                  <Lightbulb size={13} className="text-primary" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Oportunidades ML</span>
                  <span className="text-[10px] text-muted/80 tabular-nums">{intel.opportunities.length}</span>
                  <div className="flex-1 h-px bg-card-hover" />
                  <span className="text-[10px] text-muted/60">{showOpps ? 'ocultar' : 'ver'}</span>
                </button>
                {showOpps && (
                  <div className="space-y-2">
                    {intel.opportunities.slice(0, 12).map(video => <OpportunityCard key={video.id} video={video} />)}
                    <p className="text-[11px] text-muted px-1">
                      Para convertir una oportunidad en idea o guión: dile a Levy &ldquo;conviérteme la oportunidad de [tema] en idea de video&rdquo;.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
