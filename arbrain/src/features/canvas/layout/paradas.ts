/**
 * Canvas v4 — las PARADAS INTERIORES del recorrido (17 nov 2026, lienzo v19; decisión de Levy: «paradas interiores
 * invisibles y en orden»).
 *
 * Un capítulo se recorre entrando por su parada de siempre (`camaraDeCapitulo`: entero si cabe, su cabeza si es alto).
 * Si sus elementos declaran `paradas`, `→` sigue después por ellas, en su orden, antes de pasar al siguiente capítulo;
 * el índice de capítulos no cambia (una parada interior no es un capítulo y no se anuncia en la lista).
 *
 * Cada parada está ANCLADA a un elemento: vive en el propio elemento (`paradas`) y, si hace falta, nombra una zona en
 * FRACCIONES de su caja. Si alguien mueve o agranda el elemento con la mano, la parada lo sigue; si lo borra, la parada
 * se va con él. Sin `paradas` en la página, nada de esto existe: `capitulosDe` y el recorrido dan lo mismo que antes.
 *
 * Llega de la nube sin validar (la escribe un generador o un agente): leer SIEMPRE con `leerParadas`.
 *
 * Puro (tests/canvas/paradas.test.ts).
 */

import type { Camera, CanvasElement, ParadaInterior } from '../model/element'
import { visualBounds } from '../model/element'
import { fitBounds, type ChromeInsets, type Viewport } from '../render/viewport'
import type { Caja, Capitulo } from './capitulos'

/** Una parada interior ya resuelta: a qué elemento se ancla, su caja en el mundo, su orden y su nombre corto. */
export interface Parada {
  elId: string
  caja: Caja
  orden: number
  titulo?: string
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const frac = (v: unknown): number | null => { const n = num(v); return n == null ? null : Math.min(1, Math.max(0, n)) }

/**
 * Las paradas declaradas de un elemento, saneadas: `orden` finito; `zona` en fracciones (0..1) con ancho y alto
 * positivos (si no, la zona se ignora y la parada es el elemento entero); `titulo` texto corto. Lo inválido se descarta.
 */
export function leerParadas(v: unknown): ParadaInterior[] {
  if (!Array.isArray(v)) return []
  const out: ParadaInterior[] = []
  for (const p of v) {
    if (!p || typeof p !== 'object') continue
    const o = p as Record<string, unknown>
    const orden = num(o.orden)
    if (orden == null) continue
    const parada: ParadaInterior = { orden }
    const z = o.zona as Record<string, unknown> | undefined
    if (z && typeof z === 'object') {
      const x = frac(z.x), y = frac(z.y), w = frac(z.w), h = frac(z.h)
      if (x != null && y != null && w != null && h != null && w > 0 && h > 0) {
        parada.zona = { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) }
        if (parada.zona.w <= 0 || parada.zona.h <= 0) delete parada.zona
      }
    }
    if (typeof o.titulo === 'string' && o.titulo.trim()) parada.titulo = o.titulo.trim().slice(0, 80)
    out.push(parada)
  }
  return out
}

/** La caja en el mundo de una parada: la del elemento o, con zona, la fracción de ella. */
export function cajaDeParada(el: CanvasElement, p: ParadaInterior): Caja {
  const b = visualBounds(el)
  if (!p.zona) return { x: b.x, y: b.y, width: b.width, height: b.height }
  return { x: b.x + b.width * p.zona.x, y: b.y + b.height * p.zona.y, width: b.width * p.zona.w, height: b.height * p.zona.h }
}

const dentro = (cx: number, cy: number, c: Caja) => cx >= c.x && cx <= c.x + c.width && cy >= c.y && cy <= c.y + c.height

/**
 * Las paradas interiores de cada capítulo, en orden (`[i]` = las del capítulo `i`). Una parada pertenece al capítulo
 * que contiene el centro de su caja (el más chico, si dos se enciman). Orden: su `orden`; a igual orden, de arriba abajo
 * y de izquierda a derecha. Sin paradas declaradas: un arreglo de listas vacías.
 */
export function paradasDe(els: readonly CanvasElement[], caps: readonly Capitulo[]): Parada[][] {
  const res: Parada[][] = caps.map(() => [])
  if (!caps.length) return res
  for (const el of els) {
    if (el.paradas === undefined) continue
    for (const p of leerParadas(el.paradas)) {
      const caja = cajaDeParada(el, p)
      const cx = caja.x + caja.width / 2, cy = caja.y + caja.height / 2
      let mejor = -1
      caps.forEach((c, i) => {
        if (!dentro(cx, cy, c.caja)) return
        if (mejor < 0 || c.caja.width * c.caja.height < caps[mejor].caja.width * caps[mejor].caja.height) mejor = i
      })
      if (mejor >= 0) res[mejor].push({ elId: el.id, caja, orden: p.orden, ...(p.titulo ? { titulo: p.titulo } : {}) })
    }
  }
  for (const l of res) l.sort((a, b) => a.orden - b.orden || a.caja.y - b.caja.y || a.caja.x - b.caja.x)
  return res
}

/**
 * El chrome de una parada interior: solo existen en el recorrido, donde no se pintan la barra de herramientas, el índice
 * ni la barra inferior; arriba queda el nombre de la página y abajo el pie del recorrido. Una parada es un acercamiento:
 * no les reserva espacio (la entrada del capítulo conserva el suyo de siempre).
 */
export const CHROME_PARADA: ChromeInsets = { left: 16, top: 76, bottom: 64, right: 16 }

/** Dónde se para la cámara en una parada interior: la zona entera, con poco aire, en el área útil. */
export function camaraDeParada(c: Caja, vp: Viewport, chrome: ChromeInsets = CHROME_PARADA, aire = 12): Camera {
  return fitBounds(c, vp, aire, chrome)
}
