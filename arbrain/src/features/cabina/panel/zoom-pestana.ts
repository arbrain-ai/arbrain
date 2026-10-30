/**
 * Zoom por pestaña (4 oct 2026, Daniel): ⌘+rueda (o pellizco del trackpad) y ⌘+ / ⌘− / ⌘0 con el cursor sobre la
 * pestaña agrandan o achican SU contenido; el factor se recuerda por pestaña. No toca el zoom global de la app
 * (ZoomController): mientras el cursor está encima, esas teclas son de la pestaña (captura + stopImmediatePropagation).
 * En el teléfono (PWA/iPhone) el mismo zoom se hace pellizcando: dos dedos sobre la pestaña escalan su contenido sin tocar
 * el viewport global (que sigue con maximum-scale=1). Los lienzos ya llevan su propia cámara (⌘+rueda en Pizarra) y no pasan por aquí.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

const CLAVE = 'arbrain.zoomPestana'
export const ZOOM_MIN = 0.6, ZOOM_MAX = 2.5, PASO = 0.1

export const acotar = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
/** Un factor de rueda parejo para ratón (±100 por muesca) y trackpad (deltas chicos). */
export const factorRueda = (dy: number) => Math.exp(-Math.max(-50, Math.min(50, dy)) * 0.004)

const leer = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') } catch { return {} } }
const recordar = (clave: string, z: number) => {
  try { const m = leer(); if (z === 1) delete m[clave]; else m[clave] = z; localStorage.setItem(CLAVE, JSON.stringify(m)) } catch { /* sin almacenamiento */ }
}

type Tecla = '+' | '-' | '0'
let encima: ((t: Tecla) => void) | null = null

export function useZoomPestana(clave: string, ref: RefObject<HTMLElement | null>) {
  const [zoom, setZoomEstado] = useState(1)
  const actual = useRef(1)
  useEffect(() => { const z = acotar(leer()[clave] ?? 1); actual.current = z; setZoomEstado(z) }, [clave])
  const poner = useCallback((z: number) => { const v = acotar(z); actual.current = v; setZoomEstado(v); recordar(clave, v) }, [clave])
  // Pellizco: el factor se mide contra el zoom al empezar el gesto. Se guarda al soltar.
  const base = useRef(1)
  const pinza = useCallback((fase: 'ini' | 'mov' | 'fin', ratio = 1) => {
    if (fase === 'ini') { base.current = actual.current; return }
    if (fase === 'fin') { recordar(clave, actual.current); return } // al soltar se conserva lo alcanzado
    const v = acotar(base.current * ratio); actual.current = v; setZoomEstado(v)
  }, [clave])
  const rueda = useCallback((dy: number) => poner(actual.current * factorRueda(dy)), [poner])
  const tecla = useCallback((t: Tecla) => poner(t === '0' ? 1 : actual.current + (t === '+' ? PASO : -PASO)), [poner])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => { if (e.metaKey || e.ctrlKey) { e.preventDefault(); rueda(e.deltaY) } }
    const entra = () => { encima = tecla }
    const sale = () => { if (encima === tecla) encima = null }
    const onKey = (e: KeyboardEvent) => {
      if (encima !== tecla || !(e.metaKey || e.ctrlKey) || e.altKey) return
      const t: Tecla | null = e.key === '=' || e.key === '+' ? '+' : e.key === '-' || e.key === '_' ? '-' : e.key === '0' ? '0' : null
      if (!t) return
      e.preventDefault(); e.stopImmediatePropagation(); tecla(t)
    }
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
    let d0 = 0
    const tStart = (e: TouchEvent) => { if (e.touches.length === 2) { d0 = dist(e); pinza('ini') } }
    const tMove = (e: TouchEvent) => { if (e.touches.length === 2 && d0 > 0) { e.preventDefault(); pinza('mov', dist(e) / d0) } }
    const tEnd = (e: TouchEvent) => { if (d0 > 0 && e.touches.length < 2) { d0 = 0; pinza('fin', 1) } }
    el.addEventListener('touchstart', tStart, { passive: true }); el.addEventListener('touchmove', tMove, { passive: false })
    el.addEventListener('touchend', tEnd); el.addEventListener('touchcancel', tEnd)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerenter', entra); el.addEventListener('pointerleave', sale)
    window.addEventListener('keydown', onKey, true)
    return () => { el.removeEventListener('touchstart', tStart); el.removeEventListener('touchmove', tMove); el.removeEventListener('touchend', tEnd); el.removeEventListener('touchcancel', tEnd); el.removeEventListener('wheel', onWheel); el.removeEventListener('pointerenter', entra); el.removeEventListener('pointerleave', sale); window.removeEventListener('keydown', onKey, true); sale() }
  }, [ref, rueda, tecla, pinza])

  return { zoom, rueda, tecla, pinza }
}
