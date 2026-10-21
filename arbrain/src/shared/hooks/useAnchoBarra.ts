'use client'
import { useCallback, useLayoutEffect, useState } from 'react'

/**
 * Ancho de la barra lateral izquierda en escritorio (1 oct 2026, pedido de Daniel: «ya que tenemos un
 * resizer en el panel, damos un resizer también en el de conversaciones»). Mismo gesto que el panel
 * derecho: arrastrar el borde, flechas con el foco en el divisor, doble clic vuelve al tamaño inicial.
 * Se recuerda en este equipo (localStorage).
 */
export const BARRA_INICIAL = 240
export const BARRA_MIN = 200
export const BARRA_MAX = 440
const CLAVE = 'barra-lateral:ancho'

const acotar = (w: number) => Math.round(Math.min(Math.max(w, BARRA_MIN), BARRA_MAX))

function leer(): number {
  try {
    const v = Number(window.localStorage.getItem(CLAVE))
    return Number.isFinite(v) && v > 0 ? acotar(v) : BARRA_INICIAL
  } catch { return BARRA_INICIAL }
}

export function useAnchoBarra() {
  const [ancho, setAncho] = useState(BARRA_INICIAL)
  const [arrastrando, setArrastrando] = useState(false)
  // Antes del primer pintado: sin salto de 240 al ancho guardado.
  useLayoutEffect(() => { setAncho(leer()) }, [])

  const fijar = useCallback((w: number, persistir = true) => {
    const v = acotar(w)
    setAncho(v)
    if (persistir) { try { window.localStorage.setItem(CLAVE, String(v)) } catch { /* modo privado */ } }
  }, [])

  const empezar = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX
    const w0 = (e.currentTarget.parentElement as HTMLElement | null)?.offsetWidth ?? BARRA_INICIAL
    const barra = e.currentTarget
    barra.setPointerCapture(e.pointerId)
    setArrastrando(true)
    const raiz = document.documentElement.style
    const previo = { cursor: raiz.cursor, userSelect: raiz.userSelect }
    raiz.cursor = 'col-resize'
    raiz.userSelect = 'none'
    const mover = (ev: PointerEvent) => fijar(w0 + (ev.clientX - x0), false)
    const soltar = (ev: PointerEvent) => {
      barra.removeEventListener('pointermove', mover)
      barra.removeEventListener('pointerup', soltar)
      barra.removeEventListener('pointercancel', soltar)
      raiz.cursor = previo.cursor
      raiz.userSelect = previo.userSelect
      setArrastrando(false)
      fijar(w0 + (ev.clientX - x0))
    }
    barra.addEventListener('pointermove', mover)
    barra.addEventListener('pointerup', soltar)
    barra.addEventListener('pointercancel', soltar)
  }, [fijar])

  const teclas = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const paso = e.shiftKey ? 96 : 24
    if (e.key === 'ArrowRight') { e.preventDefault(); fijar(ancho + paso) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); fijar(ancho - paso) }
    else if (e.key === 'Home') { e.preventDefault(); fijar(BARRA_MIN) }
    else if (e.key === 'End') { e.preventDefault(); fijar(BARRA_MAX) }
  }, [ancho, fijar])

  const restablecer = useCallback(() => fijar(BARRA_INICIAL), [fijar])

  return { ancho, arrastrando, empezar, teclas, restablecer }
}
