'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import type { ChatAccount } from '../stores/account-store'
import { DEFAULT_EFFORT, effortLabel, stopLabel } from '../lib/effort-labels'

/** Runtime strings remain extensible; Ultracode is a separate control. */
export type EffortStop = string
export { stopLabel }
interface Controls {
  efforts: Array<{ value: string; displayName: string }>
  /** Nivel que correrá el próximo turno de esta conversación (elección o medium). */
  current?: string | null
  defaultEffort?: string | null
  needsModelSelection?: boolean
  ultracode?: boolean
  supportsUltracode?: boolean
}
interface Props {
  effort: string | null
  ultracode: boolean
  sessionId?: string | null
  account?: ChatAccount | null
  model?: string | null
  /** Aplica el cambio y lanza Error si falla: el dial lo muestra y se queda abierto (2 oct 2026). */
  onSelect: (stop: EffortStop) => Promise<void>
  onClose: () => void
}

// The dial: a dense matrix of cells that lights up from "más rápido" to "más
// inteligente" up to the knob. Each cell carries its own delay so a change
// travels along the track instead of flipping at once.
const ROWS = 3
const COLS = 36

export function EffortSlider({ effort, ultracode, sessionId, account, model, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ key: string; controls?: Controls; error?: string } | null>(null)
  // Lo que se está aplicando (nivel o ultracode-on/off) y el último fallo, visibles en el dial.
  const [applying, setApplying] = useState<{ key: string; stop: string } | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [help, setHelp] = useState(false)
  const dragRef = useRef<{ pointerId: number; moved: boolean; from: number } | null>(null)
  const suppressClickRef = useRef(false)
  const key = JSON.stringify([sessionId, account, model])
  const current = state?.key === key ? state : null
  useEffect(() => {
    setApplying(null)
    setApplyError(null)
    const ac = new AbortController()
    const params = new URLSearchParams({ account: account ?? 'default' })
    if (sessionId) params.set('session', sessionId)
    void fetch(`/api/chat/efforts?${params}`, { signal: ac.signal }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los controles.')
      if (!Array.isArray(data.efforts)) throw new Error('No se recibieron los esfuerzos disponibles.')
      const seen = new Set<string>()
      const efforts = data.efforts.filter((item: { value?: unknown }) => {
        if (typeof item?.value !== 'string' || !item.value.trim() || item.value === 'ultracode' || seen.has(item.value)) return false
        seen.add(item.value); return true
      })
      if (!ac.signal.aborted) setState({ key, controls: { ...data, efforts } })
    }).catch(error => { if (!ac.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'No hubo respuesta.' }) })
    return () => ac.abort()
  }, [key, sessionId, account])
  useEffect(() => {
    const onDoc = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-effort-chip]') && ref.current && !ref.current.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', onDoc)
    ref.current?.focus()
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [onClose])
  const controls = current?.controls
  const confirmedUltracode = typeof controls?.ultracode === 'boolean' ? controls.ultracode : null
  const applyingStop = applying?.key === key ? applying.stop : null
  const flagPending = applyingStop === 'ultracode-on' || applyingStop === 'ultracode-off'
  // Mientras se aplica, el dial ya muestra el nivel pedido; si falla, vuelve al real.
  const shownEffort = (applyingStop && !flagPending ? applyingStop : null) ?? effort ?? controls?.current ?? null
  const apply = (stop: string) => {
    if (applyingStop) return
    setApplyError(null)
    setApplying({ key, stop })
    onSelect(stop).catch(error => setApplyError(error instanceof Error ? error.message : 'No se pudo aplicar el cambio.'))
      .finally(() => setApplying(current => current?.key === key && current.stop === stop ? null : current))
  }

  const stops = useMemo(() => {
    if (!controls) return []
    // Sin opción «Default» (2 oct 2026): el dial muestra siempre el nivel real, en español.
    return controls.efforts.map(item => ({
      value: item.value, label: effortLabel(item.value),
      disabled: confirmedUltracode === true && item.value !== 'xhigh',
    }))
  }, [controls, confirmedUltracode])
  const selectedIndex = stops.findIndex(stop => stop.value === shownEffort)
  const shownIndex = preview ?? selectedIndex
  const last = Math.max(stops.length - 1, 1)
  const progress = shownIndex < 0 ? 0 : shownIndex / last
  const shownLabel = shownIndex >= 0 && stops[shownIndex] ? stopLabel(stops[shownIndex].value, ultracode) : stopLabel(shownEffort, ultracode)

  const indexAt = (clientX: number) => {
    const track = trackRef.current
    if (!track || stops.length === 0) return -1
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)))
    return Math.round(ratio * last)
  }
  const commit = (index: number) => {
    const stop = stops[index]
    if (!stop || stop.disabled || index === selectedIndex) return
    apply(stop.value)
  }
  const step = (delta: number) => {
    if (stops.length === 0) return
    let index = (selectedIndex < 0 ? 0 : selectedIndex) + delta
    while (index >= 0 && index < stops.length && stops[index].disabled) index += delta
    if (index >= 0 && index < stops.length) commit(index)
  }

  return <div ref={ref} role="dialog" aria-label="Configurar razonamiento" tabIndex={-1}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); step(1) }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); step(-1) }
    }}
    className="effort-dial absolute bottom-full left-0 mb-2 w-full md:w-96 rounded-2xl border border-border bg-card p-4 shadow-xl z-50 outline-none max-h-[65dvh] overflow-y-auto">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold flex items-baseline gap-2 min-w-0">
        <span>Esfuerzo</span>
        <span key={shownLabel} className="effort-dial-label text-brand-ink truncate" aria-live="polite">{shownLabel}</span>
      </h2>
      <div className="flex items-center">
        <button type="button" aria-label="Ayuda del esfuerzo" aria-expanded={help} onClick={() => setHelp(value => !value)} className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-foreground/5"><HelpCircle size={18} /></button>
        <button type="button" aria-label="Cerrar controles de razonamiento" onClick={onClose} className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-foreground/5"><X size={18} /></button>
      </div>
    </div>
    {help && <p className="text-xs text-muted mt-1">Más esfuerzo piensa más y tarda más. Por defecto es {effortLabel(DEFAULT_EFFORT)}. ← → también mueven el dial.</p>}
    {!current && <p role="status" className="py-4 text-sm text-muted">Consultando opciones…</p>}
    {current?.error && <p role="alert" className="py-4 text-sm text-red-400">{current.error}</p>}
    {controls && <>
      {controls.needsModelSelection && <p role="status" className="mt-3 text-xs text-muted">Selecciona un modelo para consultar sus niveles de esfuerzo. El nivel por defecto ({effortLabel(DEFAULT_EFFORT)}) se confirma al ejecutar.</p>}
      {!controls.needsModelSelection && stops.length === 0 && <p role="status" className="mt-3 text-xs text-muted">Este modelo no ofrece niveles de esfuerzo.</p>}
      {applyError && <p role="alert" className="mt-3 text-xs text-red-400">{applyError}</p>}
      {stops.length > 0 && <>
      <div className="flex items-center justify-between mt-4 text-sm text-muted select-none">
        <span>Más rápido</span><span>Más inteligente</span>
      </div>
      <div ref={trackRef} role="group" aria-label="Esfuerzo disponible" data-effort-track data-effort-index={shownIndex}
        className={`effort-track relative mt-2 h-14 rounded-xl bg-foreground/[0.06] overflow-hidden touch-none select-none ${preview !== null ? 'is-dragging' : ''}`}
        style={{ ['--effort-progress' as string]: progress, ['--effort-cols' as string]: COLS }}
        onPointerDown={event => {
          if (event.button !== 0 || stops.length === 0) return
          const index = indexAt(event.clientX)
          dragRef.current = { pointerId: event.pointerId, moved: false, from: index }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          const index = indexAt(event.clientX)
          if (index !== drag.from) drag.moved = true
          if (drag.moved) setPreview(index)
        }}
        onPointerUp={event => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          dragRef.current = null
          if (drag.moved) { suppressClickRef.current = true; commit(indexAt(event.clientX)) }
          setPreview(null)
        }}
        onPointerCancel={() => { dragRef.current = null; setPreview(null) }}>
        <div aria-hidden className="effort-cells absolute inset-x-3 inset-y-2 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))` }}>
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const col = i % COLS
            const lit = stops.length > 0 && shownIndex >= 0 && col / (COLS - 1) <= progress + 1e-6
            return <span key={i} className={`effort-cell rounded-[2px] ${lit ? 'is-lit' : ''}`} style={{ ['--col' as string]: col / (COLS - 1), ['--delay' as string]: `${col * 9}ms` }} />
          })}
        </div>
        <div className="absolute inset-0 flex">
          {stops.map((stop, index) => <button key={stop.value} type="button" disabled={stop.disabled}
            aria-pressed={index === selectedIndex} aria-label={stop.label} title={stop.label}
            onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return } commit(index) }}
            className="effort-stop relative flex-1 min-w-0 h-full flex items-center justify-center bg-transparent disabled:cursor-not-allowed">
            <span aria-hidden className={`effort-stop-dot rounded-full ${index <= shownIndex ? 'is-lit' : ''} ${stop.disabled ? 'opacity-30' : ''}`} />
          </button>)}
        </div>
        {shownIndex >= 0 && <div aria-hidden className="effort-knob absolute top-1.5 bottom-1.5 w-8 rounded-lg bg-white shadow-[0_2px_10px_rgba(0,0,0,0.45)] pointer-events-none"
          style={{ left: `calc(12px + (100% - 24px - 2rem) * var(--effort-progress))` }} />}
      </div>
      <div className="flex justify-between mt-1.5 px-1 text-[10px] text-muted/80 select-none" aria-hidden>
        {stops.map(stop => <span key={stop.value} className={`flex-1 min-w-0 text-center truncate ${stop.value === shownEffort ? 'text-brand-ink font-semibold' : ''}`}>{stop.label}</span>)}
      </div>
      </>}
      {confirmedUltracode === true && <p role="status" className="mt-3 text-xs text-muted">Ultracode requiere {effortLabel('xhigh')}. Desactívalo para elegir otro esfuerzo.</p>}
      {effort && !controls.efforts.some(item => item.value === effort) && <p role="status" className="mt-3 text-xs text-amber-500">El esfuerzo guardado ({effortLabel(effort)}) no está disponible para este modelo. Elige otro.</p>}
      {controls.supportsUltracode && <div className="border-t border-border mt-4 pt-3">
        <button type="button" role={confirmedUltracode === null ? undefined : 'switch'} aria-checked={confirmedUltracode ?? undefined} disabled={confirmedUltracode === null || flagPending}
          aria-label={confirmedUltracode === null ? 'Ultracode: estado sin confirmar' : 'Ultracode'}
          onClick={() => {
            if (confirmedUltracode === null || flagPending) return
            apply(confirmedUltracode ? 'ultracode-off' : 'ultracode-on')
          }} className="min-h-11 w-full flex justify-between items-center gap-3 rounded-xl px-3 hover:bg-foreground/5 disabled:opacity-60">
          <span className="text-sm font-medium">Ultracode</span><span className="text-xs text-muted">{flagPending ? 'Cambio solicitado' : confirmedUltracode === null ? 'Sin confirmar' : confirmedUltracode ? 'Activado' : 'Desactivado'}</span>
        </button><p className="text-xs text-muted px-3 mt-1">Orquestación de trabajo con varios agentes y esfuerzo {effortLabel('xhigh')}.</p>
      </div>}
      {!controls.supportsUltracode && (ultracode || controls.ultracode) && <div className="border-t border-border mt-4 pt-3">
        <p className="text-xs text-amber-500 mb-2">Ultracode estaba activado, pero no está disponible en esta cuenta.</p>
        <button type="button" onClick={() => apply('ultracode-off')} className="min-h-11 w-full rounded-xl border border-border px-3 text-sm">Desactivar Ultracode</button>
      </div>}
    </>}
  </div>
}
