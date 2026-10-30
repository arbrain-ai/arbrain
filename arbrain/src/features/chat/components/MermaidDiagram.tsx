'use client'
import { esEdicionCliente } from '@/lib/edicion'
import { memo, useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2,
  Copy, Check, GitBranch, Loader2, AlertTriangle,
} from 'lucide-react'
import { sonda } from '../lib/tts-probe'

// ─── Touch detection ──────────────────────────────────────────────────────────

export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false)
  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])
  return isTouch
}

// ─── Mermaid render hook ──────────────────────────────────────────────────────

function useMermaidRender(code: string) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const lastCode = useRef('')

  useEffect(() => {
    const trimmed = code.trim()
    if (!trimmed || lastCode.current === trimmed) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const timer = setTimeout(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          // Edición cliente (AUDITORIA A6): 'strict' sanea etiquetas y quita callbacks de clic; un diagrama escrito por
          // el modelo no puede inyectar HTML en el origen de la app. Daniel conserva 'loose'.
          securityLevel: esEdicionCliente() ? 'strict' : 'loose',
          logLevel: 'fatal',
          suppressErrorRendering: true,
          themeVariables: {
            primaryColor: '#7c3aed',
            primaryTextColor: '#f1f5f9',
            primaryBorderColor: '#6d28d9',
            lineColor: '#8b5cf6',
            secondaryColor: '#1e1b4b',
            tertiaryColor: '#0f0f14',
            background: 'transparent',
            mainBkg: '#18181f',
            nodeBorder: '#6d28d9',
            clusterBkg: '#1a1a2e',
            titleColor: '#e2e8f0',
            edgeLabelBackground: '#1e1b4b',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          },
        })

        const clean = trimmed
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<\/?b>/gi, '')

        const id = `mc-mermaid-${Math.random().toString(36).slice(2, 9)}`
        // Sospechoso: mermaid.render() hace layout completo del grafo, síncrono y pesado.
        sonda.mark(`mermaid-render(${clean.length}c)`)
        const { svg: rendered } = await mermaid.render(id, clean)

        setSvg(rendered)
        lastCode.current = trimmed
      } catch (e) {
        setError(e instanceof Error ? e.message.slice(0, 120) : 'Syntax error')
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [code])

  return { svg, error, loading }
}

// ─── Zoom / pan hook (GPU-accelerated, native listeners, ref-based) ─────────
//
// Key differences from previous version:
// 1. All transform values in refs — zero React renders during gestures
// 2. Native event listeners — bypass React synthetic event overhead
// 3. Direct DOM manipulation via targetRef — no state-driven transforms
// 4. Transform: translate(x,y) scale(s) — 1:1 pixel mapping with finger
// 5. Momentum with friction after finger lift
// 6. Boundary clamping — can't lose diagram off-screen
// 7. Simultaneous pinch-zoom + pan (like Google Maps)

export function useZoom(containerRef: React.RefObject<HTMLDivElement | null>) {
  // React state ONLY for UI display (zoom %, button states)
  const [displayScale, setDisplayScale] = useState(1)

  // All transform values in refs — zero React renders during gestures
  const scaleRef = useRef(1)
  const posRef = useRef({ x: 0, y: 0 })
  const targetRef = useRef<HTMLDivElement | null>(null)

  // Mouse drag state
  const dragging = useRef(false)
  const mouseOrigin = useRef({ x: 0, y: 0 })

  // Touch gesture state
  const pinchRef = useRef<{ dist: number; initScale: number; cx: number; cy: number } | null>(null)
  const touchPanRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const lastTapRef = useRef(0)

  // Momentum tracking
  const velocityRef = useRef({ x: 0, y: 0 })
  const prevTouchRef = useRef({ x: 0, y: 0, t: 0 })
  const momentumRaf = useRef(0)

  // ── Core helpers ──────────────────────────────────────────────────────────

  const applyTransform = useCallback((animate = false) => {
    const el = targetRef.current
    if (!el) return
    const { x, y } = posRef.current
    const s = scaleRef.current
    el.style.transition = animate ? 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
    // translate FIRST, then scale = 1:1 pixel mapping with finger movement
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`
  }, [])

  const syncDisplay = useCallback(() => {
    setDisplayScale(scaleRef.current)
  }, [])

  const clampPos = useCallback((x: number, y: number, s: number) => {
    if (s <= 1) return { x: 0, y: 0 }
    const el = targetRef.current?.parentElement
    if (!el) return { x, y }
    const rect = el.getBoundingClientRect()
    const maxX = rect.width * (s - 1) * 0.6
    const maxY = rect.height * (s - 1) * 0.6
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    }
  }, [])

  const stopMomentum = useCallback(() => {
    if (momentumRaf.current) {
      cancelAnimationFrame(momentumRaf.current)
      momentumRaf.current = 0
    }
  }, [])

  const startMomentum = useCallback(() => {
    const friction = 0.94
    const minSpeed = 0.5

    const tick = () => {
      velocityRef.current.x *= friction
      velocityRef.current.y *= friction

      if (Math.abs(velocityRef.current.x) < minSpeed && Math.abs(velocityRef.current.y) < minSpeed) {
        syncDisplay()
        return
      }

      posRef.current = clampPos(
        posRef.current.x + velocityRef.current.x,
        posRef.current.y + velocityRef.current.y,
        scaleRef.current,
      )
      applyTransform()
      momentumRaf.current = requestAnimationFrame(tick)
    }

    const speed = Math.hypot(velocityRef.current.x, velocityRef.current.y)
    if (speed > 1.5) {
      momentumRaf.current = requestAnimationFrame(tick)
    }
  }, [applyTransform, clampPos, syncDisplay])

  // ── Native event listeners (all attached in one useEffect) ────────────────

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Wheel (desktop)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      stopMomentum()
      const factor = e.deltaY > 0 ? 0.85 : 1.18
      scaleRef.current = Math.min(Math.max(scaleRef.current * factor, 0.25), 6)
      if (scaleRef.current <= 1) posRef.current = { x: 0, y: 0 }
      applyTransform()
      syncDisplay()
    }

    // Mouse drag
    const onMouseDown = (e: MouseEvent) => {
      if (scaleRef.current <= 1) return
      e.preventDefault()
      stopMomentum()
      dragging.current = true
      mouseOrigin.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y }
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      posRef.current = clampPos(e.clientX - mouseOrigin.current.x, e.clientY - mouseOrigin.current.y, scaleRef.current)
      applyTransform()
    }
    const onMouseUp = () => { dragging.current = false; syncDisplay() }

    // Touch: pinch + pan + double-tap + momentum
    const onTouchStart = (e: TouchEvent) => {
      stopMomentum()
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
        pinchRef.current = { dist: Math.hypot(dx, dy), initScale: scaleRef.current, cx, cy }
        touchPanRef.current = null
      } else if (e.touches.length === 1) {
        const cx = e.touches[0].clientX
        const cy = e.touches[0].clientY
        touchPanRef.current = { sx: cx, sy: cy, px: posRef.current.x, py: posRef.current.y }
        prevTouchRef.current = { x: cx, y: cy, t: performance.now() }
        velocityRef.current = { x: 0, y: 0 }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.hypot(dx, dy)
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2

        scaleRef.current = Math.min(Math.max(pinchRef.current.initScale * (dist / pinchRef.current.dist), 0.5), 6)

        // Simultaneous pan while pinching (like Google Maps)
        const panDx = cx - pinchRef.current.cx
        const panDy = cy - pinchRef.current.cy
        posRef.current = clampPos(posRef.current.x + panDx, posRef.current.y + panDy, scaleRef.current)
        pinchRef.current.cx = cx
        pinchRef.current.cy = cy

        applyTransform()
      } else if (e.touches.length === 1 && touchPanRef.current && scaleRef.current > 1) {
        e.preventDefault()
        const cx = e.touches[0].clientX
        const cy = e.touches[0].clientY
        const now = performance.now()

        // Weighted moving average for smooth velocity tracking
        const dt = now - prevTouchRef.current.t
        if (dt > 0 && dt < 100) {
          const vx = (cx - prevTouchRef.current.x) / dt * 16
          const vy = (cy - prevTouchRef.current.y) / dt * 16
          velocityRef.current = {
            x: velocityRef.current.x * 0.3 + vx * 0.7,
            y: velocityRef.current.y * 0.3 + vy * 0.7,
          }
        }
        prevTouchRef.current = { x: cx, y: cy, t: now }

        posRef.current = clampPos(
          touchPanRef.current.px + (cx - touchPanRef.current.sx),
          touchPanRef.current.py + (cy - touchPanRef.current.sy),
          scaleRef.current,
        )
        applyTransform()
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      pinchRef.current = null

      // Snap back if scale near 1
      if (scaleRef.current <= 1.05 && e.touches.length === 0) {
        scaleRef.current = 1
        posRef.current = { x: 0, y: 0 }
        applyTransform(true)
        syncDisplay()
      }

      // Double-tap detection
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const now = Date.now()
        if (now - lastTapRef.current < 300) {
          stopMomentum()
          if (scaleRef.current > 1.1) {
            scaleRef.current = 1
            posRef.current = { x: 0, y: 0 }
          } else {
            scaleRef.current = 2.5
          }
          applyTransform(true)
          syncDisplay()
        } else if (touchPanRef.current && scaleRef.current > 1) {
          // Start momentum after pan
          startMomentum()
          syncDisplay()
        } else {
          syncDisplay()
        }
        lastTapRef.current = now
      }

      touchPanRef.current = null
    }

    // Double-click toggle zoom (desktop)
    const onDblClick = () => {
      stopMomentum()
      if (scaleRef.current > 1) {
        scaleRef.current = 1
        posRef.current = { x: 0, y: 0 }
      } else {
        scaleRef.current = 2.5
      }
      applyTransform(true)
      syncDisplay()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mouseup', onMouseUp)
    el.addEventListener('mouseleave', onMouseUp)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('dblclick', onDblClick)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('mouseleave', onMouseUp)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('dblclick', onDblClick)
    }
  }, [containerRef, applyTransform, syncDisplay, clampPos, stopMomentum, startMomentum])

  // ── Button controls ───────────────────────────────────────────────────────

  const reset = useCallback(() => {
    stopMomentum()
    scaleRef.current = 1
    posRef.current = { x: 0, y: 0 }
    applyTransform(true)
    syncDisplay()
  }, [applyTransform, stopMomentum, syncDisplay])

  const zoomIn = useCallback(() => {
    scaleRef.current = Math.min(scaleRef.current * 1.25, 6)
    applyTransform(true)
    syncDisplay()
  }, [applyTransform, syncDisplay])

  const zoomOut = useCallback(() => {
    scaleRef.current = Math.max(scaleRef.current * 0.8, 0.25)
    if (scaleRef.current <= 1) posRef.current = { x: 0, y: 0 }
    applyTransform(true)
    syncDisplay()
  }, [applyTransform, syncDisplay])

  const setScaleTo = useCallback((v: number) => {
    scaleRef.current = Math.min(Math.max(v, 0.25), 6)
    applyTransform(true)
    syncDisplay()
  }, [applyTransform, syncDisplay])

  // Cleanup momentum on unmount
  useEffect(() => () => stopMomentum(), [stopMomentum])

  return {
    scale: displayScale, targetRef,
    reset, zoomIn, zoomOut, setScaleTo,
  }
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ code, className = '' }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const handle = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handle}
      className={`flex items-center gap-1 text-[10px] transition-colors ${className}`}
    >
      {copied
        ? <><Check size={11} className="text-gold-dark dark:text-gold-bright" /><span className="text-gold-dark dark:text-gold-bright">Copiado</span></>
        : <><Copy size={11} /><span>Copiar</span></>
      }
    </button>
  )
}



// ─── Fullscreen modal ─────────────────────────────────────────────────────────

interface FullscreenProps {
  code: string
  svg: string
  onClose: () => void
}

function FullscreenModal({ code, svg, onClose }: FullscreenProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const zoom = useZoom(wrapRef)
  const isTouch = useIsTouchDevice()

  // Prevent body scroll while fullscreen
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Header — safe-area top for notched phones */}
      <div
        className="shrink-0 flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-border bg-black/40"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2 text-muted">
          <GitBranch size={14} className="text-violet-400" />
          <span className="text-xs font-medium">Diagrama</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <CopyButton code={code} className="text-muted/80 hover:text-foreground/70 hidden sm:flex" />
          <div className="flex items-center gap-0.5 sm:mx-2">
            {/* 44px min touch targets on mobile (p-2.5), smaller on desktop */}
            <button onClick={zoom.zoomOut} className="p-2.5 sm:p-1.5 rounded-lg hover:bg-card-active text-muted hover:text-foreground/75 transition-colors active:scale-90"><ZoomOut size={16} /></button>
            <span className="text-[11px] sm:text-[10px] text-muted/70 w-10 text-center font-mono">{Math.round(zoom.scale * 100)}%</span>
            <button onClick={zoom.zoomIn} className="p-2.5 sm:p-1.5 rounded-lg hover:bg-card-active text-muted hover:text-foreground/75 transition-colors active:scale-90"><ZoomIn size={16} /></button>
            <button onClick={zoom.reset} className="p-2.5 sm:p-1.5 rounded-lg hover:bg-card-active text-muted hover:text-foreground/75 transition-colors active:scale-90" title="Reset zoom"><RotateCcw size={14} /></button>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 sm:p-1.5 rounded-lg bg-card-active hover:bg-card-active text-foreground/70 hover:text-foreground transition-colors active:scale-90"
          >
            <Minimize2 size={16} />
          </button>
        </div>
      </div>

      {/* Canvas — all gestures handled by native listeners via useZoom */}
      <div
        ref={wrapRef}
        className="flex-1 overflow-hidden flex items-center justify-center"
        style={{
          cursor: zoom.scale > 1 ? 'grab' : 'default',
          touchAction: 'none',
        }}
      >
        <div
          ref={zoom.targetRef}
          className="[&_svg]:max-w-[95vw] [&_svg]:max-h-[80vh] [&_svg]:h-auto"
          style={{
            willChange: 'transform',
            transformOrigin: 'center center',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {/* Footer hint — safe-area bottom, context-aware */}
      <div
        className="shrink-0 py-2 text-center text-[10px] text-muted/60 bg-black/40"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {isTouch
          ? 'Pellizca para zoom \u00b7 Arrastra para mover \u00b7 Doble tap = reset'
          : 'Scroll = zoom \u00b7 Arrastra para mover \u00b7 ESC para cerrar'
        }
      </div>
    </div>,
    document.body,
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export const MermaidDiagram = memo(function MermaidDiagram({ code }: { code: string }) {
  const { svg, error, loading } = useMermaidRender(code)
  const wrapRef = useRef<HTMLDivElement>(null)
  const zoom = useZoom(wrapRef)
  const [fullscreen, setFullscreen] = useState(false)
  const isTouch = useIsTouchDevice()

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-border bg-card/60">
      {/* Header bar — larger touch targets on mobile */}
      <div className="flex items-center justify-between px-3 sm:px-3.5 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 text-muted">
          <GitBranch size={12} className="text-violet-400/70" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted/80">Mermaid</span>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          {svg && (
            <>
              {/* Zoom controls — 44px touch targets on mobile (p-2.5), compact on desktop (p-1) */}
              <button onClick={zoom.zoomOut} disabled={zoom.scale <= 0.25} className="p-2.5 sm:p-1 rounded-lg hover:bg-card-active text-muted/70 hover:text-foreground/70 transition-colors disabled:opacity-30 active:scale-90"><ZoomOut size={13} /></button>
              <span className="text-[10px] text-muted/60 w-8 text-center font-mono">{Math.round(zoom.scale * 100)}%</span>
              <button onClick={zoom.zoomIn} disabled={zoom.scale >= 6} className="p-2.5 sm:p-1 rounded-lg hover:bg-card-active text-muted/70 hover:text-foreground/70 transition-colors disabled:opacity-30 active:scale-90"><ZoomIn size={13} /></button>
              {zoom.scale !== 1 && (
                <button onClick={zoom.reset} className="p-2.5 sm:p-1 rounded-lg hover:bg-card-active text-muted/70 hover:text-foreground/70 transition-colors active:scale-90" title="Reset"><RotateCcw size={12} /></button>
              )}
              <div className="w-px h-3 bg-card-active mx-0.5 sm:mx-1" />
              <CopyButton code={code} className="text-muted/70 hover:text-foreground/70 hidden sm:flex" />
              <div className="w-px h-3 bg-card-active mx-0.5 sm:mx-1 hidden sm:block" />
              <button onClick={() => setFullscreen(true)} className="p-2.5 sm:p-1 rounded-lg hover:bg-card-active text-muted/70 hover:text-foreground/70 transition-colors active:scale-90" title="Pantalla completa"><Maximize2 size={13} /></button>
            </>
          )}
        </div>
      </div>

      {/* Diagram area — all gestures handled by native listeners via useZoom */}
      <div
        ref={wrapRef}
        className="h-[200px] sm:h-[250px] md:h-[300px] lg:h-[350px] overflow-hidden flex items-center justify-center bg-card/20"
        style={{
          cursor: svg ? (zoom.scale > 1 ? 'grab' : 'default') : 'default',
          touchAction: 'none',
        }}
      >
        {loading && (
          <div className="flex items-center gap-2 text-muted/80">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Renderizando diagrama...</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <AlertTriangle size={16} className="text-amber-400/60" />
            <p className="text-[11px] text-muted/80">Error de sintaxis en el diagrama</p>
            <pre className="text-[10px] text-red-400/50 font-mono max-w-xs overflow-auto">{error}</pre>
          </div>
        )}

        {svg && !loading && (
          <div
            ref={zoom.targetRef}
            className="[&_svg]:max-w-full [&_svg]:h-auto"
            style={{
              willChange: 'transform',
              transformOrigin: 'center center',
              maxWidth: '100%',
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      {/* Hint — context-aware: touch vs mouse */}
      {svg && (
        <div className="px-3 sm:px-3.5 py-1.5 border-t border-border-subtle text-[9px] text-muted/40 flex items-center justify-center gap-2 sm:gap-3">
          {isTouch ? (
            <>
              <span>Pellizca = zoom</span>
              <span>&middot;</span>
              <span>Arrastra = mover</span>
              <span>&middot;</span>
              <span>Doble tap = reset</span>
            </>
          ) : (
            <>
              <span>Scroll = zoom</span>
              <span>&middot;</span>
              <span>Arrastra = mover</span>
              <span>&middot;</span>
              <span>Doble click = reset</span>
            </>
          )}
        </div>
      )}

      {fullscreen && svg && (
        <FullscreenModal code={code} svg={svg} onClose={() => setFullscreen(false)} />
      )}
    </div>
  )
})
