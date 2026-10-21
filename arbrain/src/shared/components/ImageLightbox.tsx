'use client'
/**
 * ImageLightbox — visor de imagen a pantalla completa.
 *
 * Al abrir, la imagen se ve COMPLETA y encajada (contain) dentro de la pantalla, sea muy ancha, muy alta
 * o pequeña; una imagen pequeña no se estira más allá de su tamaño real (100 %). Desde ahí se acerca con
 * scroll, pellizco (trackpad y teléfono) y se aleja como mínimo hasta volver a verla completa.
 *
 *   · Doble clic / doble toque: alterna entre encajar y 100 % (si ya encaja a ~100 %, entre encajar y 200 %).
 *   · Tecla 0: vuelve a encajar. Esc o X: cierra. Con zoom se arrastra para moverse.
 *
 * Por qué es un portal a <body> (2 oct 2026): el visor es `position: fixed`, pero un ancestro con `transform`
 * (la animación `.page-enter` del shell conserva uno) o con `overflow: hidden` lo convierte en «fijo al ancestro»:
 * el overlay quedaba del tamaño del área de la página (sin cubrir la barra lateral) y la imagen, dimensionada
 * en vw/vh, se salía de ese recuadro y se veía recortada y «ya ampliada», sin forma de alejarse porque el
 * zoom mínimo era 1. Montado en el body el overlay ocupa siempre el viewport y el encaje se calcula contra
 * el recuadro REAL del visor, no contra vw/vh.
 *
 * Extraído de features/chat/MarkdownMessage.tsx (13 jul 2026) a shared para reutilizarlo desde el canvas
 * draw3 (doble clic/tap en un elemento imagen) sin crear una dependencia cruzada draw3 → chat.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X, ZoomIn } from 'lucide-react'

type Size = { w: number; h: number }
/** Zoom absoluto (1 = 1 px de imagen por px de pantalla) y posición de la esquina superior izquierda. */
type View = { s: number; tx: number; ty: number }

const PAD_X = 16 // aire lateral del encaje
const PAD_Y = 56 // arriba la X, abajo la pastilla de zoom: el encaje no pasa por debajo de ellas
const MAX_SCALE = 4
const TAP_MS = 320
const TAP_DIST = 30
const MOVE_PX = 6

function fitScaleOf(nat: Size | null, box: Size): number {
  if (!nat || nat.w <= 0 || nat.h <= 0 || box.w <= 0 || box.h <= 0) return 1
  const aw = Math.max(box.w - PAD_X * 2, 40)
  const ah = Math.max(box.h - PAD_Y * 2, 40)
  return Math.min(aw / nat.w, ah / nat.h, 1)
}

/** Centra si cabe en el eje; si no, impide que el borde de la imagen se despegue del borde de la pantalla. */
function clampAxis(t: number, content: number, viewport: number): number {
  return content <= viewport ? (viewport - content) / 2 : Math.min(0, Math.max(viewport - content, t))
}

function resolveView(v: View | null, nat: Size, box: Size, fit: number): View {
  const s = v ? Math.min(Math.max(v.s, fit), MAX_SCALE) : fit
  return { s, tx: clampAxis(v?.tx ?? 0, nat.w * s, box.w), ty: clampAxis(v?.ty ?? 0, nat.h * s, box.h) }
}

type Gesture =
  | { kind: 'pan'; x: number; y: number; tx: number; ty: number }
  | { kind: 'pinch'; dist: number; ix: number; iy: number; s: number }

type SafariGestureEvent = Event & { scale: number; clientX: number; clientY: number }

export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<Size>({ w: 0, h: 0 })
  const [nat, setNat] = useState<Size | null>(null)
  /** null = encajada (se recalcula sola al redimensionar). */
  const [view, setView] = useState<View | null>(null)
  const [smooth, setSmooth] = useState(false)
  const [prevSrc, setPrevSrc] = useState(src)
  if (prevSrc !== src) {
    setPrevSrc(src)
    setNat(null)
    setView(null)
  }

  const fit = fitScaleOf(nat, box)
  const cur = nat && box.w > 0 && box.h > 0 ? resolveView(view, nat, box, fit) : null
  // Lo último que se pintó/decidió, para que los manejadores nativos (rueda, gestos) no lean estado viejo
  // cuando llegan varios eventos antes del siguiente render.
  const geo = useRef<{ nat: Size | null; box: Size; fit: number; cur: View | null }>({ nat, box, fit, cur })
  useLayoutEffect(() => {
    geo.current = { nat, box, fit, cur }
  })

  const pts = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)
  const down = useRef({ t: 0, x: 0, y: 0, moved: false, onImage: false })
  const lastTap = useRef({ t: 0, x: 0, y: 0 })

  const local = useCallback((e: { clientX: number; clientY: number }) => {
    const r = rootRef.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }, [])

  const commit = useCallback((next: View) => {
    const g = geo.current
    if (!g.nat || g.box.w <= 0 || g.box.h <= 0) return
    const r = resolveView(next, g.nat, g.box, g.fit)
    const stored = r.s <= g.fit * 1.001 ? null : r
    g.cur = resolveView(stored, g.nat, g.box, g.fit)
    setView(stored)
  }, [])

  const zoomAt = useCallback((targetScale: number, cx: number, cy: number) => {
    const g = geo.current
    if (!g.cur) return
    const s = Math.min(Math.max(targetScale, g.fit), MAX_SCALE)
    const k = s / g.cur.s
    commit({ s, tx: cx - (cx - g.cur.tx) * k, ty: cy - (cy - g.cur.ty) * k })
  }, [commit])

  const fitView = useCallback(() => {
    const g = geo.current
    setSmooth(true)
    setView(null)
    if (g.nat && g.box.w > 0) g.cur = resolveView(null, g.nat, g.box, g.fit)
  }, [])

  const toggleZoom = useCallback((cx: number, cy: number) => {
    const g = geo.current
    if (!g.cur) return
    if (g.cur.s > g.fit * 1.01) {
      fitView()
    } else {
      setSmooth(true)
      zoomAt(g.fit < 0.95 ? 1 : 2, cx, cy)
    }
  }, [fitView, zoomAt])

  // Prevent body scroll while lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Escape cierra y 0 encaja (capture: gana antes que los shortcuts globales del canvas).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === '0' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        e.stopPropagation()
        e.preventDefault()
        fitView()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onClose, fitView])

  // El recuadro REAL del visor (viewport; se actualiza al girar el teléfono o redimensionar la ventana).
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Rueda y pellizco de trackpad. Nativos y no pasivos: el onWheel de React es pasivo y no podría impedir
  // el zoom de página del navegador (Ctrl+rueda). Safari/WebKit (app de escritorio) manda el pellizco del
  // trackpad como eventos gesture*, no como rueda.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const g = geo.current
      if (!g.cur) return
      setSmooth(false)
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? g.box.h : 1
      const dy = Math.max(-300, Math.min(300, e.deltaY * unit))
      const p = local(e)
      zoomAt(g.cur.s * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y)
    }
    let startScale = 1
    const onGestureStart = (e: Event) => {
      e.preventDefault()
      startScale = geo.current.cur?.s ?? 1
      setSmooth(false)
    }
    const onGestureChange = (e: Event) => {
      e.preventDefault()
      if (pts.current.size >= 2) return // en el teléfono el pellizco ya lo resuelven los punteros
      const ev = e as SafariGestureEvent
      const p = local(ev)
      zoomAt(startScale * ev.scale, p.x, p.y)
    }
    const onGestureEnd = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', onGestureStart, { passive: false })
    el.addEventListener('gesturechange', onGestureChange, { passive: false })
    el.addEventListener('gestureend', onGestureEnd, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', onGestureStart)
      el.removeEventListener('gesturechange', onGestureChange)
      el.removeEventListener('gestureend', onGestureEnd)
    }
  }, [local, zoomAt])

  const startPan = (id: number) => {
    const p = pts.current.get(id)
    const c = geo.current.cur
    if (p && c) gesture.current = { kind: 'pan', x: p.x, y: p.y, tx: c.tx, ty: c.ty }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if ((e.target as Element).closest('button')) return
    const c = geo.current.cur
    if (!c || pts.current.size >= 2) return
    setSmooth(false)
    const p = local(e)
    pts.current.set(e.pointerId, p)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (pts.current.size === 1) {
      // Con el puntero capturado, el `click` llega al overlay aunque se haya tocado la imagen: se recuerda dónde empezó.
      down.current = { t: Date.now(), x: p.x, y: p.y, moved: false, onImage: (e.target as Element).tagName === 'IMG' }
      startPan(e.pointerId)
    } else {
      const [a, b] = [...pts.current.values()]
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      gesture.current = {
        kind: 'pinch',
        dist: Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1),
        ix: (cx - c.tx) / c.s,
        iy: (cy - c.ty) / c.s,
        s: c.s,
      }
      down.current.moved = true
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return
    const p = local(e)
    pts.current.set(e.pointerId, p)
    const g = gesture.current
    const c = geo.current.cur
    if (!g || !c) return
    if (g.kind === 'pan' && pts.current.size === 1) {
      if (Math.hypot(p.x - down.current.x, p.y - down.current.y) > MOVE_PX) down.current.moved = true
      commit({ s: c.s, tx: g.tx + (p.x - g.x), ty: g.ty + (p.y - g.y) })
    } else if (g.kind === 'pinch' && pts.current.size === 2) {
      const [a, b] = [...pts.current.values()]
      const s = Math.min(Math.max(g.s * (Math.hypot(b.x - a.x, b.y - a.y) / g.dist), geo.current.fit), MAX_SCALE)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      commit({ s, tx: cx - g.ix * s, ty: cy - g.iy * s })
    }
  }

  const handlePointerEnd = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return
    const p = local(e)
    pts.current.delete(e.pointerId)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (pts.current.size === 1) {
      // Se soltó un dedo del pellizco: el que queda sigue moviendo, sin disparar toque.
      startPan([...pts.current.keys()][0])
      return
    }
    if (pts.current.size > 0) return
    gesture.current = null
    const now = Date.now()
    const isTap = e.type === 'pointerup' && !down.current.moved && now - down.current.t < TAP_MS
    if (!isTap) return
    const prev = lastTap.current
    if (now - prev.t < TAP_MS && Math.hypot(p.x - prev.x, p.y - prev.y) < TAP_DIST) {
      lastTap.current = { t: 0, x: 0, y: 0 }
      toggleZoom(p.x, p.y)
    } else {
      lastTap.current = { t: now, x: p.x, y: p.y }
    }
  }

  const handleRootClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const t = e.target as Element
    if (t.closest('button') || down.current.onImage || down.current.moved) return
    const g = geo.current
    if (!g.cur || g.cur.s <= g.fit * 1.05) onClose()
  }

  if (typeof document === 'undefined') return null

  const isZoomed = !!cur && cur.s > fit * 1.05
  const imgStyle: React.CSSProperties = nat && cur
    ? {
        position: 'absolute',
        left: 0,
        top: 0,
        width: nat.w * cur.s,
        height: nat.h * cur.s,
        maxWidth: 'none',
        maxHeight: 'none',
        transform: `translate3d(${cur.tx}px, ${cur.ty}px, 0)`,
        transition: smooth ? 'transform 0.2s ease-out, width 0.2s ease-out, height 0.2s ease-out' : 'none',
        borderRadius: 8,
        cursor: isZoomed ? 'grab' : 'zoom-in',
      }
    : { position: 'absolute', opacity: 0, pointerEvents: 'none', maxWidth: 'none' }

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[9999] overflow-hidden bg-black/85 backdrop-blur-md select-none animate-in fade-in duration-200"
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClick={handleRootClick}
    >
      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label="Cerrar"
        className="absolute z-10 p-2.5 rounded-full bg-card border border-border-subtle text-foreground/75 hover:text-foreground hover:bg-card-active transition-all active:scale-90"
        style={{ top: 'max(1rem, env(safe-area-inset-top))', right: 'max(1rem, env(safe-area-inset-right))' }}
      >
        <X size={18} />
      </button>

      <img
        src={src}
        alt={alt}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth || 1024, h: e.currentTarget.naturalHeight || 768 })}
        style={imgStyle}
      />

      {/* Zoom hint / estado de zoom */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border-subtle text-muted text-[10px] select-none"
        style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))', pointerEvents: isZoomed ? 'auto' : 'none' }}
      >
        {isZoomed && cur ? (
          <>
            <span className="tabular-nums">{Math.round(cur.s * 100)} %</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fitView() }}
              className="flex items-center gap-1 pl-1.5 ml-0.5 border-l border-border-subtle text-foreground/75 hover:text-foreground"
            >
              <Maximize2 size={11} />
              Encajar
            </button>
          </>
        ) : (
          <>
            <ZoomIn size={12} />
            <span className="hidden md:inline">Scroll para zoom</span>
            <span className="md:hidden">Pellizca para zoom</span>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
