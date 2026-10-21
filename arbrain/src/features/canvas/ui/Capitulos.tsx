'use client'

/**
 * Canvas v4 — el lienzo leído por capítulos (6 oct 2026). Lo puro vive en `layout/capitulos.ts`.
 *
 * Dos piezas y nada más:
 *   · EL VELO. Con un capítulo abierto, lo demás se aquieta bajo el color del lienzo y el capítulo queda en una
 *     ventana con un filo de luz que aparece una vez. Es del MUNDO, no de la pantalla: sigue a la cámara cuadro a
 *     cuadro, y al cambiar de capítulo la ventana viaja con el vuelo, así que la luz llega junto con la mirada.
 *     No recibe el puntero: debajo, el lienzo sigue siendo el lienzo.
 *   · EL ÍNDICE. Una tira encima de la barra de estado: un botón para la vista completa y un número por capítulo.
 *     El activo se abre y dice su nombre; un punto de oro marca dónde estás (oro para el ahora). Con el ratón
 *     encima, cada número dice el suyo.
 *
 * Teclado (en la Pizarra): ← → el capítulo vecino, 1–9 uno directo, ↓ ↑ bajar y subir dentro del capítulo,
 * Esc la vista completa.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Camera } from '../model/element'
import type { Theme } from '../theme/tokens'
import type { Viewport } from '../render/viewport'
import { worldToScreen } from '../render/viewport'
import type { CamaraViva } from './CamaraViva'
import type { Caja, Capitulo } from '../layout/capitulos'
import { suaveDoble } from '../input/navegacion'
import { mov, prefiereQuieto } from '@/shared/movimiento'

/** Cuánto aire de mundo rodea al capítulo dentro de la ventana del velo. */
const AIRE = 28
const ORO = '#ff9101'

interface Props {
  capitulos: Capitulo[]
  /** El capítulo abierto; null = vista completa (sin velo). */
  activo: number | null
  /** Lo que dura el vuelo en curso: la ventana del velo viaja en el mismo tiempo. */
  vueloMs: number
  theme: Theme
  camara: CamaraViva
  viewport: Viewport
  /** Angosto (la pestaña del panel): el índice solo con números. */
  angosto: boolean
  /** Pintar el índice «Todo 1 2 3 4». Sin él queda el velo del capítulo abierto (las teclas siguen moviéndolo). */
  indice?: boolean
  /** La barra inferior está visible: el índice se sube sobre ella. */
  sobreBarra?: boolean
  onIr: (i: number) => void
  onTodo: () => void
}

const lerp = (a: Caja, b: Caja, t: number): Caja => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
  width: a.width + (b.width - a.width) * t, height: a.height + (b.height - a.height) * t,
})

export function Capitulos(p: Props) {
  return (
    <>
      <Velo {...p} />
      {p.indice !== false && <Indice {...p} />}
    </>
  )
}

/**
 * La ventana se pinta con una sombra enorme alrededor de un div del tamaño del capítulo: un solo elemento, sin
 * máscaras, y el navegador lo compone en GPU. Se mueve tocando su estilo directo en cada cuadro de la cámara
 * (useCamara volvería a renderizar React 60 veces por segundo durante el vuelo).
 */
function Velo({ capitulos, activo, vueloMs, theme: t, camara, viewport }: Props) {
  const ventanaRef = useRef<HTMLDivElement>(null)
  const cajaRef = useRef<Caja | null>(null)
  const animRef = useRef<{ de: Caja; a: Caja; t0: number; ms: number } | null>(null)
  const vpRef = useRef(viewport); vpRef.current = viewport
  const visible = activo != null && !!capitulos[activo]

  const pintar = () => {
    const el = ventanaRef.current
    const anim = animRef.current
    if (anim) {
      const k = Math.min(1, (performance.now() - anim.t0) / anim.ms)
      cajaRef.current = lerp(anim.de, anim.a, suaveDoble(k))
      if (k >= 1) animRef.current = null
    }
    const c = cajaRef.current
    if (!el || !c) return
    const cam: Camera = camara.ref.current
    const tl = worldToScreen({ x: c.x - AIRE, y: c.y - AIRE }, cam, vpRef.current)
    const w = (c.width + AIRE * 2) * cam.zoom, h = (c.height + AIRE * 2) * cam.zoom
    el.style.transform = `translate(${tl.x}px, ${tl.y}px)`
    el.style.width = `${w}px`
    el.style.height = `${h}px`
    el.style.borderRadius = `${Math.max(6, Math.min(28, 36 * cam.zoom))}px`
  }

  // A dónde va la ventana. La primera vez aparece en su lugar; después viaja.
  useLayoutEffect(() => {
    const destino = activo != null ? capitulos[activo]?.caja : undefined
    if (!destino) return
    const ahora = cajaRef.current
    if (!ahora || prefiereQuieto() || vueloMs <= 0) { cajaRef.current = destino; animRef.current = null }
    else animRef.current = { de: ahora, a: destino, t0: performance.now(), ms: vueloMs }
    pintar()
    let raf = 0
    const paso = () => { pintar(); if (animRef.current) raf = requestAnimationFrame(paso) }
    if (animRef.current) raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, capitulos])

  useEffect(() => camara.suscribir(pintar))   // cada cuadro de cámara
  useLayoutEffect(pintar, [viewport])
  // Al cerrar, la ventana se queda donde estaba mientras el velo se desvanece; la próxima vez nace en su lugar.
  useEffect(() => { if (!visible) { const r = setTimeout(() => { cajaRef.current = null }, 600); return () => clearTimeout(r) } }, [visible])

  const oscuro = t.name === 'oscuro'
  const velo = `color-mix(in srgb, ${t.canvas} ${oscuro ? 74 : 80}%, transparent)`
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 5,
      opacity: visible ? 1 : 0,
      transition: prefiereQuieto() ? 'none' : `opacity ${visible ? 520 : 360}ms var(--mov-curva, cubic-bezier(.16,1,.3,1))`,
    }}>
      <div ref={ventanaRef} data-capitulo-ventana style={{
        position: 'absolute', left: 0, top: 0, width: 0, height: 0, willChange: 'transform',
        // De arriba abajo: el filo de luz, su halo y el velo que cubre todo lo demás.
        boxShadow: [
          `0 0 0 1.5px color-mix(in srgb, ${t.accent} ${oscuro ? 45 : 30}%, transparent)`,
          `0 18px 70px 6px color-mix(in srgb, ${t.accent} ${oscuro ? 22 : 12}%, transparent)`,
          `0 0 0 400vmax ${velo}`,
        ].join(', '),
      }} />
    </div>
  )
}

/** Distancia de las barras flotantes al borde inferior: la zona segura del iPhone y, encima, un respiro mínimo. */
export const bordeInferior = (angosto: boolean) => angosto
  ? 'max(8px, calc(env(safe-area-inset-bottom, 0px) + 2px))'
  : 'calc(14px + env(safe-area-inset-bottom, 0px))'

function Indice({ capitulos, activo, theme: t, angosto, sobreBarra, onIr, onTodo }: Props) {
  const [encima, setEncima] = useState<number | null>(null)
  const oscuro = t.name === 'oscuro'
  const curva = 'var(--mov-curva, cubic-bezier(.16,1,.3,1))'
  const boton = (sel: boolean) => ({
    display: 'flex', alignItems: 'center', gap: 7, height: angosto ? 28 : 30, padding: '0 10px', borderRadius: 9,
    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' as const,
    background: sel ? (oscuro ? 'rgba(255,255,255,.07)' : 'rgba(15,15,25,.05)') : 'transparent',
    color: sel ? t.text.title : t.text.caption,
    font: `${sel ? 700 : 600} 12.5px CanvasSans, system-ui`,
    transition: `background 240ms ${curva}, color 240ms ${curva}`,
  })
  const nombre = activo != null ? capitulos[activo]?.titulo : null
  return (
    <div style={{
      position: 'absolute', left: angosto ? 8 : 14, right: angosto ? 8 : 14, zIndex: 30, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      // Angosto (9 oct 2026, Daniel: «lo más abajo posible, optimizar la pantalla al máximo»): pegada al borde, justo
      // encima del indicador de inicio del iPhone; la pestaña del teléfono ya no reserva la zona segura bajo el lienzo.
      bottom: sobreBarra ? `calc(${angosto ? 50 : 46}px + ${bordeInferior(angosto)})` : bordeInferior(angosto),
    }}>
    <nav aria-label="Capítulos" data-capitulos className={mov.entra} style={{
      // Centrado abajo: la burbuja de Levy (pantalla completa) vive en la esquina derecha y la zona segura del iPhone
      // (indicador de inicio) manda el borde inferior. Con la barra inferior visible, se sube sobre ella.
      pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 2, padding: angosto ? 3 : 4, maxWidth: '100%', overflowX: 'auto',
      borderRadius: 12, background: t.roles.card.fill, border: `1px solid ${t.roles.card.stroke.color}`,
      boxShadow: oscuro ? '0 6px 20px rgba(0,0,0,.45)' : '0 6px 20px rgba(15,15,25,.08)',
    }}>
      <button onClick={onTodo} aria-pressed={activo == null}
        title="Vista completa (Esc)" style={boton(activo == null)}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          {[[1, 1], [8, 1], [1, 8], [8, 8]].map(([x, y]) =>
            <rect key={`${x}${y}`} x={x} y={y} width="5" height="5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />)}
        </svg>
        {!angosto && activo == null && <span>Todo</span>}
      </button>
      <span aria-hidden style={{ width: 1, height: 16, background: t.roles.card.stroke.color, margin: '0 3px' }} />
      {capitulos.map((c, i) => {
        const sel = i === activo
        return (
          <button key={c.id} onClick={() => onIr(i)} aria-current={sel ? 'step' : undefined}
            title={`${i + 1} · ${c.titulo}`}
            onPointerEnter={() => setEncima(i)} onPointerLeave={() => setEncima(v => (v === i ? null : v))}
            style={{ ...boton(sel), minWidth: 30, justifyContent: 'center', padding: sel ? '0 12px 0 10px' : '0 8px' }}>
            <span style={{
              width: 6, height: 6, borderRadius: 3, flexShrink: 0,
              background: sel ? ORO : 'transparent', marginRight: sel ? 0 : -13,
              transform: sel ? 'scale(1)' : 'scale(0)', transition: `transform 380ms ${curva}, margin 380ms ${curva}`,
            }} />
            <span style={{ fontVariantNumeric: 'tabular-nums', opacity: sel || encima === i ? 1 : .8 }}>{i + 1}</span>
            {/* El nombre del activo se abre; con espacio, también el del que está bajo el ratón. */}
            <span style={{
              display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: sel ? (angosto ? 150 : 220) : (!angosto && encima === i ? 180 : 0),
              opacity: sel || (!angosto && encima === i) ? 1 : 0,
              marginLeft: sel || (!angosto && encima === i) ? 0 : -7,
              transition: `max-width 420ms ${curva}, opacity 260ms ${curva}, margin 420ms ${curva}`,
            }}>{c.titulo}</span>
          </button>
        )
      })}
      {/* Para un lector de pantalla, el capítulo abierto se anuncia al cambiar. */}
      <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {nombre ? `Capítulo ${(activo ?? 0) + 1} de ${capitulos.length}: ${nombre}` : 'Vista completa'}
      </span>
    </nav>
    </div>
  )
}
