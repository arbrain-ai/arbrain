/**
 * Canvas v4 — el orden de la pila, calculado una vez por documento (5 oct 2026).
 *
 * El motor ordenaba los 532 elementos por `zIndex` en CADA cuadro, y el cursor y el hit-test otra vez en cada
 * `pointermove`. El arreglo de elementos es inmutable (cada edicion produce uno nuevo), asi que su orden se puede
 * recordar por identidad: mientras nadie edite, panear o pasar el puntero no vuelve a ordenar nada.
 *
 * Dos caches y no un `reverse()`: `sort` es estable, y los empates deben quedar en el orden del arreglo en los dos
 * sentidos, igual que antes.
 */
import type { CanvasElement } from './element'

const asc = new WeakMap<readonly CanvasElement[], CanvasElement[]>()
const desc = new WeakMap<readonly CanvasElement[], CanvasElement[]>()

/** De abajo hacia arriba: el orden en que se pinta. */
export function ordenPorZ(els: readonly CanvasElement[]): CanvasElement[] {
  let o = asc.get(els)
  if (!o) { o = [...els].sort((a, b) => a.zIndex - b.zIndex); asc.set(els, o) }
  return o
}

/** De arriba hacia abajo: el orden en que se busca bajo el puntero (gana lo que el ojo ve encima). */
export function ordenPorZDesc(els: readonly CanvasElement[]): CanvasElement[] {
  let o = desc.get(els)
  if (!o) { o = [...els].sort((a, b) => b.zIndex - a.zIndex); desc.set(els, o) }
  return o
}
