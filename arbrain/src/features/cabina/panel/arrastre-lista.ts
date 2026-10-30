'use client'
/**
 * Arrastrar una fila de una lista vertical con su manija (6 oct 2026, Daniel: «el sistema de drag… no funciona»).
 *
 * Por qué fallaba el de antes (Secciones.tsx, 5 oct): mientras se arrastraba, React reordenaba la lista VIVA y movía en el
 * DOM el nodo de la propia manija; al quitarlo y reinsertarlo el navegador suelta la captura del puntero y el arrastre se
 * congelaba a medio camino (hacia arriba lo salvaba que React movía a las vecinas; hacia abajo, no).
 *
 * Ahora el DOM no se toca durante el gesto: la fila tomada sigue al cursor con `transform`, las vecinas se deslizan con el
 * resorte de las pestañas (RESORTE_CSS) abriendo el hueco, y SOLO al soltar se cambia el orden (con flushSync, antes de
 * pintar, para que no haya salto). Escape o cancelar la regresan a su lugar. Sin movimiento reducido, todo animado.
 *
 * Geometría pura: menu-orden.ts (desplazamientosVerticales, indiceVertical). Prueba de navegador: tests/panel/e2e/menu.
 */
import type { PointerEvent as PunteroReact } from 'react'
import { flushSync } from 'react-dom'
import { RESORTE_CSS, RESORTE_MS } from './arrastre-geom'
import { desplazamientosVerticales, indiceVertical } from './menu-orden'

/** Píxeles que hay que mover antes de que el gesto cuente como arrastre. */
const UMBRAL = 3

export interface OpcionesFila {
  /** La lista: sus hijos con `selector` son las filas, en su orden visual. */
  lista: HTMLElement
  selector: string
  /** Posición actual de la fila tomada entre las filas con `selector`. */
  desde: number
  /** Soltó en `destino` (posición entre las filas, tras quitar la tomada). Solo si cambió. */
  alSoltar: (destino: number) => void
  /** Empezó / terminó el gesto (p. ej. para pintar el cursor de agarre). */
  alEmpezar?: () => void
  alTerminar?: () => void
  /** Eje del gesto (15 oct 2026, pestañas del Taller): 'y' (por defecto, listas verticales) o 'x' (una fila). */
  eje?: 'x' | 'y'
}

const reducido = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const resorte = () => `transform ${RESORTE_MS}ms ${typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', RESORTE_CSS) ? RESORTE_CSS : 'cubic-bezier(0.2, 0.8, 0.2, 1)'}`

export function arrastrarFila(e: PunteroReact<HTMLElement>, o: OpcionesFila) {
  if (e.button !== 0 || !e.isPrimary) return
  e.preventDefault(); e.stopPropagation()
  const x = o.eje === 'x'
  const pos = (ev: { clientX: number; clientY: number }) => x ? ev.clientX : ev.clientY
  const manija = e.currentTarget, id = e.pointerId, y0 = pos(e)
  const filas = Array.from(o.lista.querySelectorAll<HTMLElement>(o.selector))
  const tomada = filas[o.desde]
  if (!tomada) return
  const cajas = filas.map(f => { const r = f.getBoundingClientRect(); return x ? { top: r.left, height: r.width } : { top: r.top, height: r.height } })
  const centros = cajas.map(c => c.top + c.height / 2)
  // La fila tomada no sale de la lista: ni por arriba de la primera ni por debajo de la última.
  const minDy = cajas[0].top - cajas[o.desde].top, maxDy = cajas[cajas.length - 1].top + cajas[cajas.length - 1].height - (cajas[o.desde].top + cajas[o.desde].height)
  let empezo = false, destino = o.desde, dy = 0, cerrado = false
  const animar = !reducido()

  const poner = (el: HTMLElement, px: number, conResorte: boolean) => {
    el.style.transition = conResorte && animar ? resorte() : 'none'
    el.style.transform = px ? (x ? `translateX(${px}px)` : `translateY(${px}px)`) : ''
  }
  const limpiar = () => {
    for (const f of filas) { f.style.transform = ''; f.style.transition = ''; f.style.zIndex = ''; f.removeAttribute('data-arrastrada') }
    o.lista.removeAttribute('data-arrastrando')
    document.getElementById('arrastre-fila-manita')?.remove()
    o.alTerminar?.()
  }
  const quitar = () => {
    window.removeEventListener('pointermove', mover, true); window.removeEventListener('pointerup', soltar, true)
    window.removeEventListener('pointercancel', cancelar, true); window.removeEventListener('keydown', tecla, true)
    try { manija.releasePointerCapture(id) } catch { /* ya liberado */ }
  }
  // El clic que sigue a soltar no debe activar nada.
  const tapar = () => { const sin = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }; window.addEventListener('click', sin, true); setTimeout(() => window.removeEventListener('click', sin, true), 120) }

  function mover(ev: PointerEvent) {
    if (ev.pointerId !== id || cerrado) return
    if (!empezo) {
      if (Math.abs(pos(ev) - y0) < UMBRAL) return
      empezo = true
      o.alEmpezar?.()
      o.lista.setAttribute('data-arrastrando', '')
      tomada.setAttribute('data-arrastrada', ''); tomada.style.zIndex = '3'
      const manita = document.createElement('style'); manita.id = 'arrastre-fila-manita'; manita.textContent = '*, *::before, *::after { cursor: grabbing !important; }'; document.head.appendChild(manita)
    }
    dy = Math.max(minDy, Math.min(maxDy, pos(ev) - y0))
    // Dónde caería: por el centro de la fila tomada (como pasar la mitad de la pestaña vecina).
    // En los topes manda el tope: la tomada pegada al borde de arriba o de abajo es la primera o la última (con alturas iguales el centro empata con el de la vecina).
    destino = dy <= minDy + 0.5 ? 0 : dy >= maxDy - 0.5 ? filas.length - 1 : indiceVertical(centros, centros[o.desde] + dy, o.desde)
    const dx = desplazamientosVerticales(cajas, o.desde, destino)
    filas.forEach((f, i) => { if (i === o.desde) poner(f, dy, false); else poner(f, dx[i], true) })
  }
  // Termina el gesto: la tomada se asienta en su hueco (o vuelve) con el resorte y recién entonces cambia el orden.
  const terminar = (aplicar: boolean) => {
    if (cerrado) return
    cerrado = true
    quitar()
    if (!empezo) { limpiar(); return }
    tapar()
    const final = aplicar ? destino : o.desde
    const dx = desplazamientosVerticales(cajas, o.desde, final)
    filas.forEach((f, i) => poner(f, dx[i], true))
    const cerrar = () => {
      // Orden nuevo y transforms fuera en el mismo cuadro: sin salto.
      flushSync(() => { if (aplicar && final !== o.desde) o.alSoltar(final) })
      limpiar()
    }
    if (animar) setTimeout(cerrar, RESORTE_MS + 30); else cerrar()
  }
  function soltar(ev: PointerEvent) { if (ev.pointerId === id) terminar(true) }
  function cancelar(ev: PointerEvent) { if (ev.pointerId === id) terminar(false) }
  function tecla(ev: KeyboardEvent) { if (ev.key === 'Escape' && empezo) { ev.preventDefault(); ev.stopPropagation(); terminar(false) } }

  try { manija.setPointerCapture(id) } catch { /* sin captura: los eventos siguen por la ventana */ }
  window.addEventListener('pointermove', mover, true); window.addEventListener('pointerup', soltar, true)
  window.addEventListener('pointercancel', cancelar, true); window.addEventListener('keydown', tecla, true)
}
