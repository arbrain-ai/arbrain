/**
 * Canvas v4 — guias de alineacion e imantado.
 *
 * Lo que mas se SIENTE al mover cosas. Sin esto, alinear dos tarjetas es un
 * juego de puntería y el resultado siempre queda un pixel torcido; con esto, la
 * mano suelta donde quiere y el lienzo hace el ultimo tramo.
 *
 * Dos piezas que van juntas: la GUIA (la linea que aparece y dice "estas
 * alineado con esto") y el IMAN (el desplazamiento que corrige). Mostrar la guia
 * sin imantar es decorativo; imantar sin mostrar la guia se siente embrujado.
 */

import type { CanvasElement } from '../model/element'
import { bounds } from '../model/element'

/** Distancia en px de PANTALLA a la que el iman agarra. */
const RADIO_PX = 7

export interface Guia {
  /** Vertical: linea en x. Horizontal: linea en y. */
  eje: 'x' | 'y'
  valor: number
  /** Extremos de la linea, para dibujarla solo donde importa. */
  desde: number
  hasta: number
}

export interface ResultadoSnap {
  dx: number
  dy: number
  guias: Guia[]
}

interface Caja { x: number; y: number; w: number; h: number }

/** Las tres referencias de cada eje: los dos bordes y el centro. */
const refsX = (c: Caja) => [c.x, c.x + c.w / 2, c.x + c.w]
const refsY = (c: Caja) => [c.y, c.y + c.h / 2, c.y + c.h]

/**
 * Calcula el imantado de una caja contra las demas.
 *
 * Devuelve el desplazamiento a aplicar y las guias a pintar. Se queda con el
 * candidato MAS CERCANO por eje: imantar a varios a la vez produce saltos
 * contradictorios.
 */
export function snapToElements(
  movida: Caja,
  otros: CanvasElement[],
  zoom: number,
  ignorar: ReadonlySet<string>,
): ResultadoSnap {
  const radio = RADIO_PX / zoom
  const cajas: Caja[] = otros
    .filter(e => !ignorar.has(e.id) && e.type !== 'connector')
    .map(e => { const b = bounds(e); return { x: b.x, y: b.y, w: b.width, h: b.height } })

  let mejorX: { delta: number; valor: number; otra: Caja } | null = null
  let mejorY: { delta: number; valor: number; otra: Caja } | null = null

  const misX = refsX(movida), misY = refsY(movida)
  for (const otra of cajas) {
    for (const rx of refsX(otra)) {
      for (const mx of misX) {
        const d = rx - mx
        if (Math.abs(d) <= radio && (!mejorX || Math.abs(d) < Math.abs(mejorX.delta))) {
          mejorX = { delta: d, valor: rx, otra }
        }
      }
    }
    for (const ry of refsY(otra)) {
      for (const my of misY) {
        const d = ry - my
        if (Math.abs(d) <= radio && (!mejorY || Math.abs(d) < Math.abs(mejorY.delta))) {
          mejorY = { delta: d, valor: ry, otra }
        }
      }
    }
  }

  const guias: Guia[] = []
  if (mejorX) {
    // La guia se extiende solo entre las dos cajas implicadas, con un respiro.
    // Una linea de borde a borde de la pantalla es ruido: no dice CON QUE te
    // estas alineando.
    const a = movida, b = mejorX.otra
    guias.push({
      eje: 'x', valor: mejorX.valor,
      desde: Math.min(a.y, b.y) - 16,
      hasta: Math.max(a.y + a.h, b.y + b.h) + 16,
    })
  }
  if (mejorY) {
    const a = movida, b = mejorY.otra
    guias.push({
      eje: 'y', valor: mejorY.valor,
      desde: Math.min(a.x, b.x) - 16,
      hasta: Math.max(a.x + a.w, b.x + b.w) + 16,
    })
  }

  return { dx: mejorX?.delta ?? 0, dy: mejorY?.delta ?? 0, guias }
}

/** Imanta a la grilla. Se usa cuando el fondo la muestra: imantar a algo
 *  invisible es lo que hace sentir "embrujado" un lienzo. */
export function snapToGrid(c: Caja, paso: number): { dx: number; dy: number } {
  return {
    dx: Math.round(c.x / paso) * paso - c.x,
    dy: Math.round(c.y / paso) * paso - c.y,
  }
}
