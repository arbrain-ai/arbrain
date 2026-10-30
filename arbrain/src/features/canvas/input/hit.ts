/**
 * Canvas v4 — deteccion de que hay bajo el puntero.
 *
 * REGLA ESTRUCTURAL: la geometria vive en UN solo lugar. En el v3 estaba
 * escrita TRES veces (el renderer que dibuja, el hit-test que clickea, y el
 * modulo que ancla conectores) y ya habian divergido: el hit-test ignoraba por
 * completo el espejado, asi que una figura volteada tenia su zona de clic al
 * reves de como se veia; una estrella se anclaba con un radio interno
 * hardcodeado distinto al que dibujaba.
 *
 * Aqui el hit-test consume `bounds()` del modelo — la MISMA funcion que usa el
 * renderer para culling y el juez para auditar. Si algun dia divergen, divergen
 * los tres juntos, que es la unica forma honesta de fallar.
 */

import { bounds, type CanvasElement } from '../model/element'
import { dentroDeFigura } from '../render/shapes'
import { aLocal } from '../model/rotate'
import { ordenPorZDesc } from '../model/orden'
import { cartuchoDeMarco, medirAproximado, type MedirTitulo } from '../render/titulo-marco'

/** Radio de agarre. HECHO B8 — los blancos tactiles necesitan ~4x los de mouse
 *  para acercarse al minimo de 44px del HIG de Apple. */
const GRAB_MOUSE = 6
const GRAB_TOUCH = 24

export interface HitOptions {
  /** true si el ultimo puntero fue un dedo. Cambia el radio de agarre. */
  coarse?: boolean
  zoom: number
  /** Mide el titulo de una seccion con la fuente real. Sin esto se estima (pruebas). */
  medirTitulo?: MedirTitulo
}

function distanceToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** El elemento de mas arriba bajo el punto, o null. */
export function pick(
  elements: CanvasElement[], punto: { x: number; y: number }, options: HitOptions,
): CanvasElement | null {
  // El radio se mide en pixeles de PANTALLA: agarrar debe costar lo mismo con
  // el lienzo alejado que con el acercado.
  const grab = (options.coarse ? GRAB_TOUCH : GRAB_MOUSE) / options.zoom
  const ordered = ordenPorZDesc(elements)

  for (const el of ordered) {
    // BLOQUEADO SE PUEDE SELECCIONAR, pero no mover.
    //
    // Saltarlo aqui —como hacia la primera version— convierte el candado en una
    // trampa: sin panel de capas, un elemento que no se puede seleccionar no se
    // puede desbloquear NUNCA. Medido el 19 ago: tras bloquear `demo:yt` no
    // hubo forma de recuperarlo desde la interfaz. Lo que impide el movimiento
    // es el arrastre, que es donde pertenece la regla.
    // Se pregunta en el marco PROPIO del elemento. El v3 tenia el giro en el
    // renderer y no en el hit-test, asi que una figura volteada tenia su zona
    // de clic donde estaba ANTES de girar — se veia en un lado y se agarraba
    // en otro.
    const point = aLocal(el, punto)

    if (el.type === 'connector') {
      for (let i = 0; i + 1 < el.points.length; i++) {
        if (distanceToSegment(point, el.points[i], el.points[i + 1]) <= grab) return el
      }
      continue
    }

    if (el.type === 'ink') {
      // Un trazo se agarra por su TINTA, no por su caja: la caja de una firma
      // diagonal es enorme y casi toda vacia.
      for (let i = 0; i + 1 < el.points.length; i++) {
        const a = { x: el.x + el.points[i].x, y: el.y + el.points[i].y }
        const b = { x: el.x + el.points[i + 1].x, y: el.y + el.points[i + 1].y }
        if (distanceToSegment(point, a, b) <= grab + el.size / 2) return el
      }
      continue
    }

    const b = bounds(el)

    if (el.type === 'frame') {
      // UNA SECCION NO SE AGARRA POR SU CUERPO (6 oct 2026). Es un territorio de fondo: un clic en su interior es un
      // clic en vacio (deselecciona o arranca la marquesina). Se agarra por su titulo o por su borde.
      const cart = cartuchoDeMarco(el, options.zoom, options.medirTitulo ?? medirAproximado)
      if (cart) {
        const c = cart.caja
        if (point.x >= c.x && point.x <= c.x + c.width && point.y >= c.y && point.y <= c.y + c.height) return el
      }
      const dentro = point.x >= b.x - grab && point.x <= b.x + b.width + grab && point.y >= b.y - grab && point.y <= b.y + b.height + grab
      const interior = point.x > b.x + grab && point.x < b.x + b.width - grab && point.y > b.y + grab && point.y < b.y + b.height - grab
      if (dentro && !interior) return el
      continue
    }

    const enCaja = point.x >= b.x - grab && point.x <= b.x + b.width + grab
                && point.y >= b.y - grab && point.y <= b.y + b.height + grab
    if (!enCaja) continue

    if (el.type === 'shape') {
      // La figura se agarra por su CONTORNO REAL, no por su caja. Una estrella
      // tiene huecos entre las puntas y un triangulo deja media caja vacia:
      // tratarlos como rectangulos hace que se puedan agarrar por el aire, y
      // que tapen a lo que tienen detras en esos huecos.
      if (dentroDeFigura(el.shape, b, point)) return el
      // Cerca del borde tambien cuenta: si no, el trazo del contorno queda
      // fuera de su propia zona de clic.
      const holgura = { x: b.x - grab, y: b.y - grab, width: b.width + grab * 2, height: b.height + grab * 2 }
      if (dentroDeFigura(el.shape, holgura, point)) return el
      continue
    }
    return el
  }
  return null
}
