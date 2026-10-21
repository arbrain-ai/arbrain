'use client'
// Artificial Brain — la superficie donde el Arbrain se mira a sí mismo,
// organizada en SALAS (cada sala contesta una pregunta del dueño):
//   · Neuronas (SABE): atlas del conocimiento curado — constelación 3D + 2D.
//     El grafo TERMINA EN ACCIÓN: slice/pregunta → artefacto vía síntesis.
//   · Acciones (OPERA): qué hizo el cerebro hoy y qué cuesta (AccionesRoom).
//   · Plasticidad y Metabolismo llegan después — el switcher ya las acepta
//     agregándolas a SALAS (cero tabs vacías hoy).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, RefreshCw, Search, Sparkles, X } from 'lucide-react'
import type { CerebroGraph, CerebroNodeType } from '../types'
import { TYPE_META } from '../types'
import { GraphCanvas } from './GraphCanvas'
import { NodePanel } from './NodePanel'
import { SynthesisPanel } from './SynthesisPanel'
import { AccionesRoom } from './AccionesRoom'
import { PlasticidadRoom } from './PlasticidadRoom'
import { MetabolismoRoom } from './MetabolismoRoom'

// La 3D es canvas puro client-side (proyección por software, CERO WebGL desde
// el incidente ANGLE-Metal del 11 jul 2026): ssr:false para lazy-load limpio.
const Graph3D = dynamic(() => import('./Graph3D').then((m) => m.Graph3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Loader2 className="size-4 animate-spin text-accent-purple" />
        Encendiendo la constelación…
      </div>
    </div>
  ),
})

const ALL_TYPES = Object.keys(TYPE_META) as CerebroNodeType[]

type PanelMode = 'node' | 'synthesis' | null
type ViewMode = '3d' | '2d'

// Registro de salas del Artificial Brain. Las 4 salas = los 4 verbos: el loop
// está COMPLETO — no hay sala 5 (todo órgano nuevo pasa por el libro de rentas).
type SalaId = 'neuronas' | 'acciones' | 'plasticidad' | 'metabolismo'
const SALAS: Array<{ id: SalaId; label: string; hint: string }> = [
  { id: 'neuronas', label: 'Neuronas', hint: 'Qué sabe de ti (SABE)' },
  { id: 'acciones', label: 'Acciones', hint: 'Qué hace por ti y qué cuesta (OPERA)' },
  { id: 'plasticidad', label: 'Plasticidad', hint: 'Cómo te forma (LO FORMA)' },
  { id: 'metabolismo', label: 'Metabolismo', hint: 'Se regula solo (SELF-REGULATE)' },
]

export function CerebroPage() {
  const [sala, setSala] = useState<SalaId>('neuronas')
  const [graph, setGraph] = useState<CerebroGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleTypes, setVisibleTypes] = useState<CerebroNodeType[]>(ALL_TYPES)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [chain, setChain] = useState<string[]>([])
  const [slice, setSlice] = useState<string[]>([])
  const [panel, setPanel] = useState<PanelMode>(null)
  // Default 2D (decisión de Daniel, 11 jul 2026). La 3D ya es SEGURA: canvas
  // 2D puro con proyección por software (Graph3D) — el motor three.js/WebGL
  // que crasheaba ANGLE-Metal fue REEMPLAZADO y ya no hay path WebGL que pueda
  // congelar el webview. La 3D se abre con un click, sin gate ni miedo.
  const [view, setView] = useState<ViewMode>('2d')

  // La sala persiste (localStorage) y acepta deep-link ?sala=acciones.
  // La vista NO persiste (siempre abre en 2D); ?view=3d la fuerza (deep-link/tests).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('sala')
    const saved = window.localStorage.getItem('arbrain:sala')
    const target = fromUrl ?? saved
    if (target && SALAS.some((s) => s.id === target)) setSala(target as SalaId)
    const viewParam = params.get('view')
    if (viewParam === '2d' || viewParam === '3d') setView(viewParam)
  }, [])
  const switchSala = (s: SalaId) => {
    setSala(s)
    window.localStorage.setItem('arbrain:sala', s)
  }

  const switchView = (v: ViewMode) => setView(v)

  const load = useCallback(async (refresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/cerebro/graph${refresh ? '?refresh=1' : ''}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: CerebroGraph = await res.json()
      setGraph(data)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setLoading(false)
    }
  }, [])

  // El grafo se carga lazy: solo cuando Neuronas está (o entra) en pantalla
  const hasLoadedGraph = useRef(false)
  useEffect(() => {
    if (sala !== 'neuronas' || hasLoadedGraph.current) return
    hasLoadedGraph.current = true
    load()
  }, [sala, load])

  const nodesById = useMemo(
    () => new Map((graph?.nodes ?? []).map((n) => [n.id, n])),
    [graph],
  )

  const typeCounts = useMemo(() => {
    const counts = {} as Record<CerebroNodeType, number>
    for (const t of ALL_TYPES) counts[t] = 0
    for (const n of graph?.nodes ?? []) counts[n.type]++
    return counts
  }, [graph])

  const handleSelect = useCallback((id: string | null, additive: boolean) => {
    if (id && additive) {
      // shift/cmd+click: arma el slice para síntesis
      setSlice((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
      setPanel((p) => (p === null ? 'synthesis' : p))
      return
    }
    if (!id) {
      setSelectedId(null)
      setPanel((p) => (p === 'node' ? null : p))
      return
    }
    setSelectedId(id)
    setChain((prev) => (prev[prev.length - 1] === id ? prev : [...prev, id]))
    setPanel('node')
  }, [])

  const handleNavigate = useCallback((id: string) => {
    setSelectedId(id)
    setChain((prev) => (prev[prev.length - 1] === id ? prev : [...prev, id]))
    setPanel('node')
  }, [])

  const handleBack = useCallback(() => {
    setChain((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.slice(0, -1)
      setSelectedId(next[next.length - 1])
      return next
    })
  }, [])

  const handleAddToSlice = useCallback((id: string) => {
    setSlice((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }, [])

  const handleSynthesizeNeighborhood = useCallback(
    (id: string) => {
      const hood = new Set<string>([id])
      for (const e of graph?.edges ?? []) {
        if (e.kind === 'tag') continue
        if (e.source === id) hood.add(e.target)
        if (e.target === id) hood.add(e.source)
      }
      setSlice([...hood].slice(0, 15))
      setPanel('synthesis')
    },
    [graph],
  )

  const toggleType = (t: CerebroNodeType) => {
    setVisibleTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    )
  }

  const showPanel = panel !== null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-extrabold tracking-tight text-foreground">
            Artificial Brain
          </h1>
          {/* Switcher de salas */}
          <div className="flex overflow-hidden rounded-lg border border-border text-[10px] font-bold">
            {SALAS.map((s) => (
              <button
                key={s.id}
                onClick={() => switchSala(s.id)}
                title={s.hint}
                className={`px-2.5 py-1.5 transition-colors ${
                  sala === s.id
                    ? 'bg-primary/20 text-accent-purple'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {sala === 'neuronas' && graph?.ok && (
            <span className="hidden text-[10px] text-muted lg:inline">
              {graph.nodes.length} nodos · {graph.edges.length} conexiones ·{' '}
              {graph.meta.isolatedCount} aislados
            </span>
          )}
        </div>

        {sala === 'neuronas' && (
          <>
            {/* Búsqueda */}
            <div className="relative ml-auto w-44 sm:w-60">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en el cerebro…"
                className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-7 text-xs text-foreground placeholder:text-muted/60 focus:border-primary/50 focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => setPanel(panel === 'synthesis' ? null : 'synthesis')}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                panel === 'synthesis'
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-gold/40 text-gold hover:bg-gold/10'
              }`}
            >
              <Sparkles className="size-3.5" />
              Sintetizar
              {slice.length > 0 && (
                <span className="rounded-full bg-gold px-1.5 text-[9px] font-bold text-black">
                  {slice.length}
                </span>
              )}
            </button>
            <div className="flex overflow-hidden rounded-lg border border-border text-[10px] font-bold">
              {(['2d', '3d'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => switchView(v)}
                  className={`px-2 py-1.5 uppercase transition-colors ${
                    view === v
                      ? 'bg-primary/20 text-accent-purple'
                      : 'text-muted hover:text-foreground'
                  }`}
                  title={v === '3d' ? 'Constelación 3D' : 'Atlas 2D'}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={() => load(true)}
              className="icon-btn size-8"
              title="Re-escanear memoria"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>
        )}
      </div>

      {/* Sala Acciones (OPERA) — espejo de la actividad del cerebro */}
      {sala === 'acciones' && (
        <div className="min-h-0 flex-1 bg-background">
          <AccionesRoom />
        </div>
      )}

      {/* Sala Plasticidad (LO FORMA) — el cerebro que reescribe al dueño */}
      {sala === 'plasticidad' && (
        <div className="min-h-0 flex-1 bg-background">
          <PlasticidadRoom />
        </div>
      )}

      {/* Sala Metabolismo (SELF-REGULATE) — el cerebro que se poda a sí mismo */}
      {sala === 'metabolismo' && (
        <div className="min-h-0 flex-1 bg-background">
          <MetabolismoRoom />
        </div>
      )}

      {/* Sala Neuronas (SABE) — el grafo, intacto */}
      {sala === 'neuronas' && (
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-background">
          {loading && !graph && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="size-4 animate-spin text-accent-purple" />
                Escaneando el cerebro…
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="max-w-sm rounded-xl border border-error/40 bg-card px-4 py-3 text-center text-xs text-error">
                {error}
              </div>
            </div>
          )}
          {graph && !graph.ok && (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="glass-panel max-w-md rounded-2xl px-5 py-4 text-center">
                <p className="text-sm font-semibold text-foreground">
                  El cerebro vive en el filesystem del Mac
                </p>
                <p className="mt-1 text-xs text-muted">
                  Esta superficie lee <code>.claude/memory</code> y{' '}
                  <code>.claude/knowledge</code> server-side. Ábrela en la app de
                  escritorio o en dev local; en web (Vercel) el repo no está montado.
                </p>
              </div>
            </div>
          )}
          {graph?.ok &&
            (view === '3d' ? (
              <Graph3D
                nodes={graph.nodes}
                edges={graph.edges}
                visibleTypes={visibleTypes}
                query={query}
                selectedId={selectedId}
                multiSelection={slice}
                onSelect={handleSelect}
              />
            ) : (
              <GraphCanvas
                nodes={graph.nodes}
                edges={graph.edges}
                visibleTypes={visibleTypes}
                query={query}
                selectedId={selectedId}
                multiSelection={slice}
                onSelect={handleSelect}
              />
            ))}

          {/* Leyenda / filtros por tipo */}
          {graph?.ok && (
            <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
              {ALL_TYPES.map((t) => {
                const active = visibleTypes.includes(t)
                const meta = TYPE_META[t]
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold backdrop-blur transition-all ${
                      active
                        ? 'border-border bg-card/80 text-foreground'
                        : 'border-border-subtle bg-card/40 text-muted/50 line-through'
                    }`}
                    title={`${meta.label} (${typeCounts[t]}) — click para ${active ? 'ocultar' : 'mostrar'}`}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: meta.color, opacity: active ? 1 : 0.35 }}
                    />
                    {meta.label}
                    <span className="font-normal text-muted">{typeCounts[t]}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Hint de interacción */}
          {graph?.ok && !showPanel && (
            <div className="pointer-events-none absolute right-3 top-3 hidden rounded-lg bg-card/70 px-2.5 py-1.5 text-[10px] text-muted backdrop-blur md:block">
              {view === '3d'
                ? 'arrastra = orbitar · click = abrir nodo · shift+click = armar slice · doble click fondo = encuadrar'
                : 'click = abrir nodo · shift+click = armar slice · doble click = encuadrar'}
            </div>
          )}
        </div>

        {/* Panel lateral (overlay en móvil). Ambos paneles quedan MONTADOS
            mientras el aside está abierto y se alternan con CSS: así abrir un
            nodo NO desmonta la síntesis en curso (no la aborta). Solo se montan
            bajo demanda (SynthesisPanel siempre que el aside abre; NodePanel al
            haber un nodo elegido). */}
        {showPanel && (
          <aside className="absolute inset-y-0 right-0 z-10 w-full border-l border-border-subtle bg-surface md:static md:w-[420px] md:shrink-0">
            {selectedId && (
              <div className={`h-full ${panel === 'node' ? '' : 'hidden'}`}>
                <NodePanel
                  nodeId={selectedId}
                  chain={chain}
                  onNavigate={handleNavigate}
                  onBack={handleBack}
                  onClose={() => {
                    setPanel(null)
                    setSelectedId(null)
                  }}
                  onAddToSlice={handleAddToSlice}
                  onSynthesizeNeighborhood={handleSynthesizeNeighborhood}
                  inSlice={selectedId ? slice.includes(selectedId) : false}
                />
              </div>
            )}
            <div className={`h-full ${panel === 'synthesis' ? '' : 'hidden'}`}>
              <SynthesisPanel
                nodesById={nodesById}
                slice={slice}
                onRemoveFromSlice={handleAddToSlice}
                onClearSlice={() => setSlice([])}
                onClose={() => setPanel(null)}
              />
            </div>
          </aside>
        )}
      </div>
      )}
    </div>
  )
}
