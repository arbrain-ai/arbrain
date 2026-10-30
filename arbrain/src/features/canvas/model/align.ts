/**
 * Canvas v4 — alinear y distribuir.
 *
 * Lo que separa un lienzo ordenado de uno que parece hecho a ojo. El v3 lo
 * tenia en el contrato y reportaba exito INCONDICIONALMENTE, incluso cuando no
 * movia nada por falta de elementos — un actuador que dice que hizo algo sin
 * comprobarlo.
 *
 * Aqui cada funcion devuelve `null` cuando no hay nada que hacer, y quien llama
 * decide. Nunca "se hizo" cuando no se hizo.
 */

import type { CanvasElement } from './element'
import { bounds } from './element'

export type AlignAxis = 'izquierda' | 'centro-h' | 'derecha' | 'arriba' | 'centro-v' | 'abajo'
export type DistributeAxis = 'horizontal' | 'vertical'

interface Caja { id: string; x: number; y: number; w: number; h: number }

const cajas = (elements: CanvasElement[], ids: ReadonlySet<string>): Caja[] =>
  elements.filter(e => ids.has(e.id)).map(e => {
    const b = bounds(e)
    return { id: e.id, x: b.x, y: b.y, w: b.width, h: b.height }
  })

const mover = (elements: CanvasElement[], deltas: Map<string, { dx: number; dy: number }>): CanvasElement[] =>
  elements.map(e => {
    const d = deltas.get(e.id)
    if (!d || (d.dx === 0 && d.dy === 0)) return e
    return { ...e, x: e.x + d.dx, y: e.y + d.dy, updatedAt: Date.now() }
  })

/**
 * Alinea. Devuelve null con menos de dos elementos: alinear uno solo contra
 * si mismo no significa nada, y fingir que se hizo algo es peor que no hacerlo.
 */
export function align(
  elements: CanvasElement[], ids: ReadonlySet<string>, axis: AlignAxis,
): CanvasElement[] | null {
  const cs = cajas(elements, ids)
  if (cs.length < 2) return null

  const deltas = new Map<string, { dx: number; dy: number }>()
  const minX = Math.min(...cs.map(c => c.x))
  const maxX = Math.max(...cs.map(c => c.x + c.w))
  const minY = Math.min(...cs.map(c => c.y))
  const maxY = Math.max(...cs.map(c => c.y + c.h))
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  for (const c of cs) {
    let dx = 0, dy = 0
    switch (axis) {
      case 'izquierda': dx = minX - c.x; break
      case 'derecha': dx = maxX - (c.x + c.w); break
      case 'centro-h': dx = cx - (c.x + c.w / 2); break
      case 'arriba': dy = minY - c.y; break
      case 'abajo': dy = maxY - (c.y + c.h); break
      case 'centro-v': dy = cy - (c.y + c.h / 2); break
    }
    deltas.set(c.id, { dx, dy })
  }
  return mover(elements, deltas)
}

/**
 * Distribuye dejando el MISMO HUECO entre elementos, no el mismo paso entre
 * centros.
 *
 * Con tamaños distintos, repartir centros deja huecos visualmente desiguales:
 * una tarjeta ancha y una angosta con el mismo paso entre centros se ven mal
 * espaciadas aunque el numero diga lo contrario. El ojo mide el AIRE.
 */
export function distribute(
  elements: CanvasElement[], ids: ReadonlySet<string>, axis: DistributeAxis,
): CanvasElement[] | null {
  const cs = cajas(elements, ids)
  if (cs.length < 3) return null   // con dos no hay nada que repartir

  const horizontal = axis === 'horizontal'
  const orden = [...cs].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))
  const inicio = horizontal ? orden[0].x : orden[0].y
  const ultimo = orden[orden.length - 1]
  const fin = horizontal ? ultimo.x + ultimo.w : ultimo.y + ultimo.h
  const ocupado = orden.reduce((s, c) => s + (horizontal ? c.w : c.h), 0)
  const hueco = (fin - inicio - ocupado) / (orden.length - 1)

  const deltas = new Map<string, { dx: number; dy: number }>()
  let cursor = inicio
  for (const c of orden) {
    const actual = horizontal ? c.x : c.y
    const d = cursor - actual
    deltas.set(c.id, horizontal ? { dx: d, dy: 0 } : { dx: 0, dy: d })
    cursor += (horizontal ? c.w : c.h) + hueco
  }
  return mover(elements, deltas)
}
