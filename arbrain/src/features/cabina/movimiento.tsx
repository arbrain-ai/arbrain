'use client'
/**
 * Movimiento de la Cabina (v2, 30 sep 2026 · «luz en el hilo»).
 *
 * Reglas: el movimiento explica, no decora. Una cifra que llega CUENTA hasta su
 * valor una sola vez; lo que entra sube 6 px con un escalonado corto; lo que está
 * vivo (ahora, la semana en curso) respira despacio. Nada se repite en cada
 * relectura: animar dos veces el mismo dato es ruido. Con «reducir movimiento»
 * todo llega quieto.
 */
import { useEffect, useRef, useState } from 'react'

// Las piezas comunes viven en el lenguaje de movimiento de Arbrain (5 oct 2026, shared/movimiento).
export { prefiereQuieto, useCuenta, Cifra, escalon } from '@/shared/movimiento'

/** Chispa: la serie como una línea que se dibuja una vez; el último punto en oro.
 *  Sin ejes ni rejilla: dice la forma, la cifra la dice el número de arriba.
 *  Se mide su ancho real (sin estirar el SVG) para que el trazo no se deforme. */
export function Chispa({ valores, className, trazoClase, etiqueta, alto = 40 }: { valores: number[]; className?: string; trazoClase?: string; etiqueta: string; alto?: number }) {
  const caja = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = caja.current; if (!el) return
    const medir = () => setW(Math.round(el.getBoundingClientRect().width))
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir); ro.observe(el); return () => ro.disconnect()
  }, [])
  if (valores.length < 2) return null
  const h = alto, min = Math.min(...valores), max = Math.max(...valores), r = max - min || 1, pad = 5
  const pts = w ? valores.map((v, i) => [pad + (i / (valores.length - 1)) * (w - pad * 2), h - pad - ((v - min) / r) * (h - pad * 2)] as const) : []
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const id = `chispa-${etiqueta.replace(/\W/g, '')}`
  const ultimo = pts[pts.length - 1]
  return <div ref={caja} className={className} role="img" aria-label={etiqueta}>
    {w > 0 && <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--brand)" stopOpacity="0.2" /><stop offset="1" stopColor="var(--brand)" stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${ultimo[0]} ${h} L${pts[0][0]} ${h} Z`} fill={`url(#${id})`} stroke="none" />
      <path d={d} data-linea pathLength={1} className={trazoClase} />
      <circle cx={ultimo[0]} cy={ultimo[1]} r="3.5" data-punto />
    </svg>}
  </div>
}
