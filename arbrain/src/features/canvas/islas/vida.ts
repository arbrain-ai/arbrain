/**
 * Mapa v16 · FOTO O VIDA según el zoom (14 nov 2026). Daniel: «el lienzo ya mete HTML, solo que creo ralentizaba la UI,
 * ¿podemos optimizar esto con la mejor latencia posible?».
 *
 * Un iframe vivo cuesta en cada cuadro (su JS, su pintura, su capa) y comparte el hilo con el lienzo. Por eso:
 *
 *   · cámara en movimiento      → TODAS duermen: el lienzo pinta su foto (un bitmap, barato a 60 fps)
 *   · cámara en reposo          → despiertan las que ocupan una parte significativa de la vista (≥ UMBRAL de la pantalla
 *                                 y al menos ANCHO_MIN px de ancho en pantalla), como mucho MAX_VIVAS, las más grandes
 *   · montadas (LRU)            → hasta MAX_VIVAS iframes vivos en memoria, despiertos o dormidos (pausados y ocultos).
 *                                 Volver a una isla reciente es instantáneo; la más vieja se desmonta (queda su foto).
 *                                 Las que asoman en reposo (≥ UMBRAL_CERCA) se precargan dormidas si hay lugar.
 *
 * Puro (tests/canvas/islas-vida.test.ts).
 */

export const MAX_VIVAS = 4
/** Fracción de la pantalla que debe cubrir la parte visible de una isla para despertarla. */
export const UMBRAL = 0.12
/** Ancho mínimo en pantalla (px CSS) para despertar: más chica, su texto no se lee y la foto basta. */
export const ANCHO_MIN = 360
/** Fracción de pantalla a partir de la cual una isla en reposo se precarga dormida. */
export const UMBRAL_CERCA = 0.01

export interface Caja { x: number; y: number; width: number; height: number }
export interface Camara { x: number; y: number; zoom: number }
export interface Pantalla { width: number; height: number }

/** La caja de la isla en pantalla y cuánto de la pantalla cubre su parte visible (0 = fuera). */
export function enPantalla(c: Caja, cam: Camara, vp: Pantalla): { x: number; y: number; ancho: number; alto: number; cubre: number } {
  const x = (c.x - cam.x) * cam.zoom + vp.width / 2
  const y = (c.y - cam.y) * cam.zoom + vp.height / 2
  const ancho = c.width * cam.zoom, alto = c.height * cam.zoom
  const vx = Math.max(0, Math.min(vp.width, x + ancho) - Math.max(0, x))
  const vy = Math.max(0, Math.min(vp.height, y + alto) - Math.max(0, y))
  const area = vp.width * vp.height
  return { x, y, ancho, alto, cubre: area > 0 ? (vx * vy) / area : 0 }
}

export interface Decision {
  /** Iframes montados, del menos al más reciente. */
  lru: string[]
  /** Las que están despiertas (visibles, animando, tocables). Siempre ⊆ lru. */
  despiertas: string[]
}

/**
 * La vida de cada isla para esta cámara. `moviendo` = la cámara cambió hace menos de ASENTAR_MS (o vuela): todas duermen
 * y nadie se monta ni se desmonta (montar a media ráfaga es justo el tirón que se quiere evitar).
 */
export function decidirVida(prevLru: readonly string[], islas: ReadonlyArray<{ id: string; caja: Caja }>, cam: Camara, vp: Pantalla, moviendo: boolean, max = MAX_VIVAS): Decision {
  const existen = new Set(islas.map(i => i.id))
  let lru = prevLru.filter(id => existen.has(id))
  if (moviendo) return { lru, despiertas: [] }
  const medidas = islas.map(i => ({ id: i.id, p: enPantalla(i.caja, cam, vp) }))
  const despiertas = medidas
    .filter(m => m.p.cubre >= UMBRAL && Math.min(m.p.ancho, vp.width) >= Math.min(ANCHO_MIN, vp.width * 0.5))
    .sort((a, b) => b.p.cubre - a.p.cubre)
    .slice(0, max)
    .map(m => m.id)
  const cerca = medidas
    .filter(m => m.p.cubre >= UMBRAL_CERCA && !despiertas.includes(m.id))
    .sort((a, b) => a.p.cubre - b.p.cubre)   // la más grande queda más reciente
    .map(m => m.id)
  const alFinal = (id: string) => { lru = lru.filter(x => x !== id); lru.push(id) }
  for (const id of cerca) if (lru.includes(id) || lru.length < max) alFinal(id)
  for (const id of [...despiertas].reverse()) alFinal(id)   // la que más cubre, la más reciente
  if (lru.length > max) lru = lru.slice(lru.length - max)
  return { lru, despiertas }
}
