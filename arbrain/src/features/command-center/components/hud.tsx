'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Primitivos visuales del Command Center HUD (Titaniumorphism dark).
 * Solo presentación — cero lógica de voz/datos. Las clases cc-* viven en globals.css.
 */

/** Panel con bezel HUD + sello de esquina. `accentRgb` fija el acento; sin él hereda el color del estado. */
export function HudPanel({ children, className = '', accentRgb, accent = false, delay = 0, pulseKey }: {
  children: ReactNode
  className?: string
  /** "255, 145, 1" — acento fijo del panel (gold para objective, etc.) */
  accentRgb?: string
  /** borde vivo teñido por el acento */
  accent?: boolean
  /** stagger de entrada en ms */
  delay?: number
  /** cambia este valor para disparar un pulso del borde (coreografía) */
  pulseKey?: string | number
}) {
  const [pulse, setPulse] = useState(false)
  const firstRef = useRef(true)
  useEffect(() => {
    if (pulseKey === undefined) return
    if (firstRef.current) { firstRef.current = false; return }
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 1150)
    return () => clearTimeout(t)
  }, [pulseKey])

  return (
    <div
      className={`cc-panel cc-enter ${accent ? 'cc-panel--accent' : ''} ${pulse ? 'cc-pulse' : ''} ${className}`}
      style={{
        ...(accentRgb ? ({ '--cc-accent-rgb': accentRgb } as React.CSSProperties) : {}),
        ...(delay ? ({ '--cc-delay': `${delay}ms` } as React.CSSProperties) : {}),
      }}
    >
      <span className="cc-dot" aria-hidden />
      {children}
    </div>
  )
}

/** Header estándar de sección: label mono + meta opcional a la derecha. */
export function PanelHeader({ label, meta, accentRgb }: { label: string; meta?: ReactNode; accentRgb?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <span className="cc-label" style={accentRgb ? { color: `rgba(${accentRgb}, 0.85)` } : undefined}>{label}</span>
      {meta != null && <span className="text-[10px] font-mono text-white/35 truncate">{meta}</span>}
    </div>
  )
}

/** Número que transiciona suavemente entre valores (conteo con easing, tabular-nums). */
export function AnimatedNumber({ value, format, duration = 800, className = '', style }: {
  value: number
  format: (v: number) => string
  duration?: number
  className?: string
  style?: React.CSSProperties
}) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef(0)

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const from = fromRef.current
    if (reduced || from === value) { fromRef.current = value; setShown(value); return }
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = from + (value - from) * eased
      setShown(v)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return <span className={`tabular-nums ${className}`} style={style}>{format(shown)}</span>
}
