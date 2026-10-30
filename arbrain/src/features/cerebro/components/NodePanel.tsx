'use client'
// Segundo Cerebro — panel de detalle de un nodo: contenido completo (read-only),
// backlinks/outlinks como interfaz de navegación (patrón Andy Matuschak) y
// acciones hacia la síntesis. Los links .md dentro del markdown navegan el grafo.
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CornerDownLeft,
  FileText,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import type { CerebroNodeDetail } from '../types'
import { TYPE_META } from '../types'

interface NodePanelProps {
  nodeId: string
  chain: string[]
  onNavigate: (id: string) => void
  onBack: () => void
  onClose: () => void
  onAddToSlice: (id: string) => void
  onSynthesizeNeighborhood: (id: string) => void
  inSlice: boolean
}

export function NodePanel({
  nodeId,
  chain,
  onNavigate,
  onBack,
  onClose,
  onAddToSlice,
  onSynthesizeNeighborhood,
  inSlice,
}: NodePanelProps) {
  const [detail, setDetail] = useState<CerebroNodeDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/cerebro/node?id=${encodeURIComponent(nodeId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nodeId])

  const meta = detail ? TYPE_META[detail.type] : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-start gap-2 border-b border-border-subtle px-4 py-3">
        {chain.length > 1 && (
          <button onClick={onBack} className="icon-btn size-7 shrink-0 mt-0.5" title="Atrás en la cadena">
            <ArrowLeft className="size-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {meta && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </span>
          )}
          <h2 className="mt-1 text-sm font-bold leading-snug text-foreground">
            {detail?.title ?? nodeId.split('/').pop()}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3" />
              {detail?.sourcePath ?? nodeId}
            </span>
            {detail?.date && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" />
                {detail.date}
                {detail.daysOld != null && detail.daysOld > 60 && (
                  <span className="text-warning"> · {detail.daysOld}d sin tocar</span>
                )}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="icon-btn size-7 shrink-0" title="Cerrar">
          <X className="size-4" />
        </button>
      </div>

      {/* Acciones hacia síntesis */}
      <div className="flex gap-2 border-b border-border-subtle px-4 py-2">
        <button
          onClick={() => onAddToSlice(nodeId)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
            inSlice
              ? 'border-primary/60 bg-primary/15 text-accent-purple'
              : 'border-border text-muted hover:border-primary/40 hover:text-foreground'
          }`}
        >
          <Plus className="size-3.5" />
          {inSlice ? 'En el slice' : 'Al slice'}
        </button>
        <button
          onClick={() => onSynthesizeNeighborhood(nodeId)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gold/40 px-2 py-1.5 text-[11px] font-semibold text-gold hover:bg-gold/10 transition-colors"
          title="Sintetizar este nodo + sus vecinos"
        >
          <Sparkles className="size-3.5" />
          Sintetizar vecindario
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading && <div className="py-8 text-center text-xs text-muted">Leyendo el archivo…</div>}
        {error && <div className="py-8 text-center text-xs text-error">{error}</div>}
        {detail && (
          <>
            {/* Backlinks primero: son la interfaz (qué apunta AQUÍ) */}
            {detail.backlinks.length > 0 && (
              <LinkSection
                title={`Backlinks · ${detail.backlinks.length}`}
                icon={<CornerDownLeft className="size-3" />}
                links={detail.backlinks}
                onNavigate={onNavigate}
              />
            )}
            {detail.outlinks.length > 0 && (
              <LinkSection
                title={`Conecta con · ${detail.outlinks.length}`}
                icon={<ArrowUpRight className="size-3" />}
                links={detail.outlinks}
                onNavigate={onNavigate}
              />
            )}
            {detail.backlinks.length === 0 && detail.outlinks.length === 0 && (
              <div className="mb-3 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted">
                Nodo aislado: nada lo referencia todavía. Candidato a conectar o depurar.
              </div>
            )}
            {detail.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {detail.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-card-hover px-2 py-0.5 text-[10px] text-muted"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Contenido markdown (read-only) */}
            <div className="cerebro-md text-[12.5px] leading-relaxed text-foreground/90">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => {
                    const md = href && !/^https?:/.test(href) && href.endsWith('.md')
                    if (md) {
                      return (
                        <button
                          className="text-accent-purple underline decoration-dotted underline-offset-2 hover:text-primary-hover"
                          onClick={() => onNavigate(normalizeMdHref(href!, nodeId))}
                        >
                          {children}
                        </button>
                      )
                    }
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent-purple underline underline-offset-2"
                      >
                        {children}
                      </a>
                    )
                  },
                }}
              >
                {detail.content}
              </ReactMarkdown>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function LinkSection({
  title,
  icon,
  links,
  onNavigate,
}: {
  title: string
  icon: React.ReactNode
  links: { id: string; title: string; type: keyof typeof TYPE_META }[]
  onNavigate: (id: string) => void
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {icon}
        {title}
      </div>
      <div className="space-y-0.5">
        {links.map((l) => (
          <button
            key={l.id}
            onClick={() => onNavigate(l.id)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11.5px] text-foreground/85 hover:bg-card-hover transition-colors"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: TYPE_META[l.type].color }}
            />
            <span className="truncate">{l.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Los links dentro de la memoria son relativos al archivo o al índice; los
// normalizamos al id del grafo (memory/… | knowledge/… | skills/… | docs/business-os/…)
function normalizeMdHref(href: string, fromId: string): string {
  const clean = href.replace(/^\.\//, '').replace(/^\.claude\//, '')
  if (/^(memory|knowledge|skills|docs\/business-os)\//.test(clean)) return clean
  const fromDir = fromId.split('/').slice(0, -1)
  // Skills y documentos: la ruta es relativa a su carpeta (con `../` incluido)
  if (fromId.startsWith('skills/') || fromId.startsWith('docs/')) {
    const out = [...fromDir]
    for (const seg of clean.split('/')) {
      if (seg === '..') out.pop()
      else if (seg && seg !== '.') out.push(seg)
    }
    return out.join('/')
  }
  const layer = fromId.startsWith('memory/') ? 'memory' : 'knowledge'
  if (clean.includes('/')) return `${layer}/${clean}`
  return `${fromDir.join('/')}/${clean}`
}
