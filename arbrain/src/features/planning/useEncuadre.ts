'use client'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { destinoScroll, type Encuadre } from './encuadre'

/**
 * El encuadre vertical en el DOM (22 oct 2026). Una vista (el Día, la Semana) dice qué elemento es su minuto `origen`, cuántos
 * px mide un minuto y qué encuadrar (encuadre.ts); el hook desplaza el contenedor que de verdad scrollea (la sección, el panel,
 * la página del teléfono). No pelea con Daniel: solo encuadra cuando cambia `clave` (abrir, otro día) o el pulso de «Hoy»; los
 * datos que llegan y el reloj nunca lo mueven. Si al abrir aún no hay lectura, espera a tenerla (lo de arriba ya ocupa su
 * lugar) salvo que él haga scroll antes: entonces se queda donde él lo dejó.
 */

/** El pulso de «Hoy»: el botón, la T y la medianoche lo suben y la vista vuelve a su encuadre con desplazamiento suave. */
export const PulsoHoy = createContext(0)

/** Si la lectura no llega, se encuadra con lo que haya pasado este tiempo. */
const ESPERA_MAX = 4000
/** Tras encuadrar al abrir, cuánto se sostiene mientras termina de llegar lo demás (hábitos, tareas): lo que dura una lectura lenta. */
const AFINAR_MS = 2500
const TECLAS_SCROLL = new Set(['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '])

/** El contenedor que desplaza en vertical: el primer ancestro con scroll o, si no hay, el documento. */
export function desplazador(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll' || o === 'overlay') && p.scrollHeight > p.clientHeight + 1) return p
  }
  return (document.scrollingElement as HTMLElement | null) ?? null
}

export const movimientoReducido = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export interface OpcionesEncuadre {
  /** El elemento cuyo borde de arriba es el minuto `origen` (el canal de horas, la columna de la agenda). */
  ancla: RefObject<HTMLElement | null>
  origen: number
  pxPorMinuto: number
  /** Qué abrir: un día, «hoy»… Cambia → se encuadra de nuevo. null = esta vista no encuadra (una hoja vecina del carril). */
  clave: string | null
  /** Ya hay lectura (y medidas): lo de arriba está en su lugar. */
  listo: boolean
  /** Qué encuadrar, leído en el momento de desplazar. */
  encuadre: () => Encuadre
  /** Lo pegajoso que tapa arriba dentro del contenedor (la barra, la cabecera de días), en px. */
  tapa?: () => number
}

export function useEncuadre(o: OpcionesEncuadre) {
  const pulso = useContext(PulsoHoy)
  const ultimo = useRef(o); ultimo.current = o
  const pendiente = useRef<{ suave: boolean; desde: number } | null>(null)
  const visto = useRef<{ clave: string | null | undefined; pulso: number }>({ clave: undefined, pulso })
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const afinando = useRef(0)

  /** El contenedor y el `scrollTop` que deja el minuto donde va, con el diseño de este momento. */
  const medir = () => {
    const { ancla, origen, pxPorMinuto, encuadre, tapa } = ultimo.current
    const el = ancla.current, s = el && desplazador(el)
    if (!el || !s) return null
    const caja = s === document.scrollingElement ? { top: 0, height: window.innerHeight } : s.getBoundingClientRect()
    const t = Math.max(0, tapa?.() ?? 0), e = encuadre()
    return { s, destino: destinoScroll({
      actual: s.scrollTop, marca: el.getBoundingClientRect().top + (e.minuto - origen) * pxPorMinuto,
      arriba: caja.top + t, alto: caja.height - t, maximo: s.scrollHeight - s.clientHeight, fraccion: e.fraccion, aire: e.aire,
    }) }
  }
  /** Al abrir, lo que llega después (hábitos, tareas, objetivo) cambia el alto: el encuadre se sostiene un momento, sin animar. */
  const sostener = () => {
    cancelAnimationFrame(afinando.current)
    const hasta = performance.now() + AFINAR_MS
    const cuadro = () => {
      const m = medir()
      if (m && Math.abs(m.destino - m.s.scrollTop) >= 1) m.s.scrollTop = m.destino
      if (performance.now() < hasta) afinando.current = requestAnimationFrame(cuadro)
      else afinando.current = 0
    }
    afinando.current = requestAnimationFrame(cuadro)
  }

  const aplicar = useRef(() => {})
  aplicar.current = () => {
    const p = pendiente.current
    if (!p || !ultimo.current.ancla.current) return
    clearTimeout(espera.current)
    const falta = ESPERA_MAX - (Date.now() - p.desde)
    if (!ultimo.current.listo && falta > 0) { espera.current = setTimeout(() => aplicar.current(), falta); return }
    pendiente.current = null
    const m = medir()
    if (!m) return
    const { s, destino } = m
    if (p.suave && !movimientoReducido()) { cancelAnimationFrame(afinando.current); if (Math.abs(destino - s.scrollTop) >= 1) s.scrollTo({ top: destino, behavior: 'smooth' }); return }
    if (Math.abs(destino - s.scrollTop) >= 1) s.scrollTop = destino
    sostener()
  }

  useLayoutEffect(() => {
    const v = visto.current
    if (o.clave !== v.clave) { v.clave = o.clave; pendiente.current = o.clave == null ? null : { suave: false, desde: Date.now() } }
    if (pulso !== v.pulso) { v.pulso = pulso; if (o.clave != null) pendiente.current = { suave: true, desde: Date.now() } }
    if (pendiente.current) aplicar.current()
  })

  // Daniel se movió antes de que llegara la lectura o mientras se sostiene: su scroll manda y el encuadre se suelta.
  useEffect(() => {
    const soltar = () => { pendiente.current = null; clearTimeout(espera.current); cancelAnimationFrame(afinando.current) }
    const tecla = (e: KeyboardEvent) => { if (TECLAS_SCROLL.has(e.key)) soltar() }
    window.addEventListener('wheel', soltar, { passive: true, capture: true })
    window.addEventListener('touchmove', soltar, { passive: true, capture: true })
    // La barra de scroll agarrada con el ratón no manda `wheel`: cualquier toque mientras espera cuenta como suyo.
    window.addEventListener('pointerdown', soltar, true)
    window.addEventListener('keydown', tecla, true)
    return () => {
      clearTimeout(espera.current); cancelAnimationFrame(afinando.current)
      window.removeEventListener('wheel', soltar, { capture: true }); window.removeEventListener('touchmove', soltar, { capture: true })
      window.removeEventListener('pointerdown', soltar, true); window.removeEventListener('keydown', tecla, true)
    }
  }, [])
}
