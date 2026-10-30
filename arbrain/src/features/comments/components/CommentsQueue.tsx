'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ExternalLink, Check, X, Edit3, Loader2, Bot } from 'lucide-react'
import { cacheSnapshot, getCachedSnapshot } from '@/lib/local-first'

type QueueItem = {
  comment_id: string
  video_id: string
  video_title: string | null
  video_thumbnail: string | null
  video_published_at: string | null
  comment_text: string
  author_display_name: string | null
  author_profile_image_url: string | null
  comment_published_at: string
  category: string | null
  confidence: number | null
  reasoning: string | null
  escalation_reason: string | null
  response_id: number | null
  draft_text: string | null
  final_text: string | null
  response_status: string | null
  generated_at: string | null
}

type QueueResponse = {
  items: QueueItem[]
  counts: {
    escalate_pending: number
    auto_publish_stuck: number
    approved_pending_post: number
    posted_today: number
  }
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  'simple-question': { label: 'Pregunta simple', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  substantive: { label: 'Sustantivo', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-300' },
  'detection-curiosity': { label: 'Deteccion', color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' },
  'thank-you-short': { label: 'Gracias', color: 'bg-green-500/15 text-green-700 dark:text-green-300' },
  complex: { label: 'Complejo', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  'sales-opportunity': { label: 'Sales op', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  criticism: { label: 'Critica', color: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  spam: { label: 'Spam', color: 'bg-card-active text-muted' },
  ignore: { label: 'Ignore', color: 'bg-card-active text-muted' },
  'viewer-to-viewer': { label: 'V2V', color: 'bg-card-active text-muted' },
}

function relTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'ahora'
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `hace ${hr}h`
  const d = Math.floor(hr / 24)
  if (d < 30) return `hace ${d}d`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `hace ${mo}mo`
  return `hace ${Math.floor(mo / 12)}a`
}

export function CommentsQueue() {
  const [data, setData] = useState<QueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/comments/queue', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as QueueResponse
      setData(json)
      cacheSnapshot('comments', 'comments:queue', json).catch(() => {})
      setError(null)
    } catch (e) {
      const cached = await getCachedSnapshot<QueueResponse>('comments:queue').catch(() => null)
      if (cached) {
        setData(cached)
        setError(null)
      } else {
        setError(String(e))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    // Stale-while-revalidate: pinta la cola cacheada al instante, refresca en background.
    getCachedSnapshot<QueueResponse>('comments:queue')
      .then((cached) => { if (active && cached) { setData(cached); setLoading(false) } })
      .catch(() => {})
      .finally(() => { if (active) load() })
    return () => { active = false }
  }, [load])

  async function action(responseId: number, kind: 'approve' | 'skip' | 'edit', body?: unknown) {
    try {
      setBusyId(responseId)
      const res = await fetch(`/api/comments/${responseId}/${kind}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
      setEditingId(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusyId(null)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-red-600 dark:text-red-300 text-sm">
        Error: {error}
      </div>
    )
  }

  const items = data?.items ?? []
  const counts = data?.counts ?? {
    escalate_pending: 0,
    auto_publish_stuck: 0,
    approved_pending_post: 0,
    posted_today: 0,
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2 text-xs">
        <Stat label="Escalates por revisar" value={counts.escalate_pending} accent="bg-amber-500/15 text-amber-700 dark:text-amber-200" />
        <Stat label="Auto-publish atascados" value={counts.auto_publish_stuck} accent="bg-orange-500/15 text-orange-700 dark:text-orange-200" hint='Para destrabarlos, dile a Levy: "destraba los auto-publish"' />
        <Stat label="Aprobados pendientes post" value={counts.approved_pending_post} accent="bg-blue-500/15 text-blue-700 dark:text-blue-200" />
        <Stat label="Posteados hoy" value={counts.posted_today} accent="bg-emerald-500/15 text-emerald-700 dark:text-emerald-200" />
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted text-sm">
          Cola vacia. Levy esta al dia.
        </div>
      ) : (
        items.map((item) => {
          const isEditing = editingId === item.response_id
          const cat = item.category ? CATEGORY_LABELS[item.category] : null
          return (
            <article
              key={item.comment_id}
              className="rounded-xl border border-border bg-card backdrop-blur-sm overflow-hidden"
            >
              <header className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                {item.video_thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.video_thumbnail}
                    alt={item.video_title ?? 'video'}
                    className="w-[72px] h-[40px] rounded-md object-cover bg-card-active flex-shrink-0"
                  />
                ) : (
                  <div className="w-[72px] h-[40px] rounded-md bg-card-active flex-shrink-0" />
                )}
                {item.author_profile_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.author_profile_image_url}
                    alt={item.author_display_name ?? ''}
                    className="w-8 h-8 rounded-full flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="font-medium text-foreground truncate">{item.author_display_name ?? 'Anon'}</span>
                    {cat && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${cat.color}`}>
                        {cat.label}
                      </span>
                    )}
                    {item.confidence !== null && (
                      <span className="text-[10px] text-muted">
                        {(item.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    {item.comment_published_at && (
                      <span className="text-[10px] text-muted" title={new Date(item.comment_published_at).toLocaleString()}>
                        · {relTime(item.comment_published_at)}
                      </span>
                    )}
                  </div>
                  {item.video_title && (
                    <Link
                      href={`https://www.youtube.com/watch?v=${item.video_id}&lc=${item.comment_id}`}
                      target="_blank"
                      className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1 truncate"
                    >
                      {item.video_title.slice(0, 60)}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      {item.video_published_at && (
                        <span
                          className="text-muted/70 ml-1"
                          title={new Date(item.video_published_at).toLocaleDateString()}
                        >
                          · video {relTime(item.video_published_at)}
                        </span>
                      )}
                    </Link>
                  )}
                </div>
              </header>

              <div className="px-4 py-3 space-y-3">
                <div>
                  <div className="text-xs text-muted mb-1">Comentario</div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{item.comment_text}</p>
                </div>

                {item.reasoning && (
                  <div className="text-xs text-muted italic">Razon: {item.reasoning}</div>
                )}

                {item.draft_text !== null && (
                  <div>
                    <div className="text-xs text-muted mb-1 flex items-center gap-1">
                      <Bot className="w-3 h-3" /> Draft de Levy
                    </div>
                    {isEditing ? (
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={4}
                        className="w-full rounded-lg bg-surface border border-border text-sm text-foreground p-2 font-mono"
                      />
                    ) : (
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap rounded-lg bg-surface border border-border p-2 font-mono">
                        {item.final_text ?? item.draft_text}
                      </p>
                    )}
                  </div>
                )}

                {item.escalation_reason && (
                  <div className="text-xs text-amber-600 dark:text-amber-400">⚠ {item.escalation_reason}</div>
                )}
              </div>

              {item.response_id !== null && item.response_status === 'queued' && (
                <footer className="flex gap-2 px-4 py-3 border-t border-border-subtle bg-surface">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => action(item.response_id!, 'edit', { final_text: editDraft })}
                        disabled={busyId === item.response_id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        Guardar y aprobar
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-2 rounded-lg bg-card-active hover:bg-card-hover border border-border-subtle text-sm text-foreground"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => action(item.response_id!, 'approve')}
                        disabled={busyId === item.response_id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        Aprobar
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(item.response_id!)
                          setEditDraft(item.final_text ?? item.draft_text ?? '')
                        }}
                        disabled={busyId === item.response_id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-card-active hover:bg-card-hover border border-border-subtle text-foreground text-sm px-3 py-2"
                      >
                        <Edit3 className="w-4 h-4" />
                        Editar
                      </button>
                      <button
                        onClick={() => action(item.response_id!, 'skip')}
                        disabled={busyId === item.response_id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-600 dark:text-red-300 text-sm px-3 py-2"
                      >
                        <X className="w-4 h-4" />
                        Skip
                      </button>
                    </>
                  )}
                </footer>
              )}

              {item.response_status && item.response_status !== 'queued' && (
                <footer className="px-4 py-2 border-t border-border-subtle bg-surface text-xs text-muted">
                  Estado: {item.response_status}
                </footer>
              )}
            </article>
          )
        })
      )}
    </div>
  )
}

function Stat({ label, value, accent, hint }: { label: string; value: number; accent: string; hint?: string }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${accent}`} title={hint}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}
