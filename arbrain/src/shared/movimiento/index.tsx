'use client'
/**
 * Lenguaje de movimiento de Arbrain (5 oct 2026): las piezas JS que acompañan a movimiento.css.
 * Guía y ejemplos: docs/lenguaje-de-movimiento.md.
 *
 * Una cifra que llega CUENTA hasta su valor una sola vez; lo que entra sube escalonado; lo vivo late; lo
 * terminado se palomea. Nada se repite en cada relectura: animar dos veces el mismo dato es ruido.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'

/** Clases globales (movimiento.css), con nombre para no escribirlas a mano. */
export const mov = {
  entra: 'mov-entra', llena: 'mov-llena', late: 'mov-late', palomita: 'mov-palomita', pliega: 'mov-pliega', aparece: 'mov-aparece', hueco: 'dato-hueco',
} as const

export function prefiereQuieto() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Índice del escalonado (`mov-entra`, `mov-llena`, `mov-aparece`). Tope 14: lo de abajo no espera de más. */
export const escalon = (i: number): CSSProperties => ({ ['--i' as string]: Math.min(i, 14) })

const yaContadas = new Set<string>()

/** Cuenta de 0 al valor (ease-out expo, ~0.9 s) la PRIMERA vez que esta clave llega.
 *  Después muestra el valor directo: una relectura no vuelve a contar. */
export function useCuenta(valor: number | null | undefined, clave: string, ms = 900): number | null {
  const [v, setV] = useState<number | null>(() => (valor == null ? null : yaContadas.has(clave) || prefiereQuieto() ? valor : 0))
  const raf = useRef(0)
  useEffect(() => {
    if (valor == null) { setV(null); return }
    if (yaContadas.has(clave) || prefiereQuieto()) { setV(valor); yaContadas.add(clave); return }
    yaContadas.add(clave)
    const t0 = performance.now()
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / ms), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
      setV(valor * e)
      if (p < 1) raf.current = requestAnimationFrame(paso)
    }
    raf.current = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf.current)
  }, [valor, clave, ms])
  return v
}

/** Una cifra que cuenta. `formato` recibe el valor intermedio. null = «—» (nunca un cero inventado). */
export function Cifra({ valor, clave, formato, className }: { valor: number | null | undefined; clave: string; formato: (n: number) => string; className?: string }) {
  const v = useCuenta(valor, clave)
  return <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : formato(v)}</span>
}

/** La palomita que se dibuja: ponla dentro de un elemento que reciba [data-hecha]. */
export function Palomita({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" aria-hidden className={`${mov.palomita}${className ? ` ${className}` : ''}`}>
    <path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
