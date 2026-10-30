'use client'

// BANDEJA — lo que necesita la decisión de Daniel HOY (rediseño 11 jul 2026).
// Dos señales accionables: leads frescos (≤14 días, score ≥60) y la cola HITL
// de comments por aprobar. Los leads NO tienen botones: se atienden hablando
// con Levy ("respóndele a X"); los CRITICAL llegan por push al instante.

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2, Flame, AlertTriangle, Sparkles, MessageSquare } from 'lucide-react'
import { useReading } from '@/features/clarity/useReading'
import { CommentsQueue } from '@/features/comments/components/CommentsQueue'

// ─── Leads frescos ──────────────────────────────────────────────────────────

type LeadItem = {
  comment_id: string
  score: number | null
  urgency: 'critical' | 'high' | 'medium' | 'low' | null
  intent: string | null
  signals: string[]
  author_name: string | null
  author_avatar: string | null
  comment_text: string
  published_at: string
  video_id: string
  video_title: string | null
}

type LeadsResponse = {
  items: LeadItem[]
  counts: { critical: number; high: number; medium: number; low: number; total: number }
}

const URGENCY_STYLE: Record<string, { label: string; ring: string; pill: string; icon: 'flame' | 'alert' | null }> = {
  critical: { label: 'CRITICAL', ring: 'border-red-500/60 ring-1 ring-red-500/30', pill: 'bg-red-500/15 text-red-700 dark:text-red-300', icon: 'flame' },
  high: { label: 'HIGH', ring: 'border-orange-500/40', pill: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', icon: 'alert' },
  medium: { label: 'MEDIUM', ring: 'border-amber-500/30', pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-200', icon: null },
  low: { label: 'LOW', ring: 'border-border', pill: 'bg-card-active text-muted', icon: null },
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 3600) return `hace ${Math.max(1, Math.floor(diff / 60))}min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

function LeadRow({ item }: { item: LeadItem }) {
  const u = item.urgency ? URGENCY_STYLE[item.urgency] : URGENCY_STYLE.low
  return (
    <article className={`rounded-xl border bg-card overflow-hidden ${u.ring}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        {item.author_avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.author_avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="font-medium text-foreground truncate">{item.author_name ?? 'Anon'}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${u.pill}`}>
              {u.icon === 'flame' && <Flame className="w-3 h-3" />}
              {u.icon === 'alert' && <AlertTriangle className="w-3 h-3" />}
              {u.label}
            </span>
            <span className="text-[11px] text-muted font-mono">score {item.score ?? '?'}</span>
            <span className="text-[11px] text-muted">{timeAgo(item.published_at)}</span>
            <a
              href={`https://www.youtube.com/watch?v=${item.video_id}&lc=${item.comment_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-[11px] text-muted hover:text-foreground inline-flex items-center gap-1"
            >
              ver en YouTube <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="mt-1.5 text-sm text-foreground whitespace-pre-wrap">{item.comment_text}</p>
          {item.intent && (
            <p className="mt-1 text-xs text-muted italic">{item.intent}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {(item.signals ?? []).map(s => (
              <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-card-active text-muted">{s}</span>
            ))}
            {item.video_title && (
              <span className="text-[10px] text-muted/70 truncate ml-auto max-w-[50%]">{item.video_title}</span>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function LeadsSection() {
  const {data,loading,error}=useReading<LeadsResponse>('/api/comments/leads')

  const items = data?.items ?? []
  const counts = data?.counts

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Leads frescos</h2>
        <span className="text-[11px] text-muted">Clasificación guardada · revisar contexto antes de responder</span>
        {counts && counts.total > 0 && (
          <span className="ml-auto flex items-center gap-2 text-[11px] font-semibold tabular-nums">
            {counts.critical > 0 && <span className="text-red-500 dark:text-red-400">{counts.critical} critical</span>}
            {counts.high > 0 && <span className="text-orange-600 dark:text-orange-400">{counts.high} high</span>}
            {(counts.medium > 0 || counts.low > 0) && <span className="text-muted">{counts.medium + counts.low} más</span>}
          </span>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-amber-500 py-3">{error}</p>}
      {loading && !data ? (
        <div className="flex items-center justify-center py-8 text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-card px-4 py-5 text-sm text-muted">
          {error ? 'La lectura no está disponible.' : 'No hay comentarios destacados en esta lectura.'}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => <LeadRow key={item.comment_id} item={item} />)}
        </div>
      )}
    </section>
  )
}

// ─── Bandeja ────────────────────────────────────────────────────────────────

export function BandejaView() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-28 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Bandeja</h1>
          <p className="mt-1 text-sm text-muted">Lo que necesita tu decisión. Todo lo demás viaja solo en los briefings.</p>
        </div>

        <LeadsSection />

        <section>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={14} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Comments por aprobar</h2>
            <span className="text-[11px] text-muted">Levy clasifica y redacta, tú apruebas</span>
          </div>
          <CommentsQueue />
        </section>

        <p className="text-[11px] text-muted/80 border-t border-border-subtle pt-4">
          Esta bandeja también se opera hablando: &ldquo;dame los leads&rdquo;, &ldquo;respóndele a [autor]&rdquo;,
          &ldquo;destraba los auto-publish&rdquo;, &ldquo;aprueba los drafts de agradecimiento&rdquo;.
        </p>
      </div>
    </div>
  )
}
