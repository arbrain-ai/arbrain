/**
 * Canvas v4 — leer un lienzo por capítulos (6 oct 2026).
 *
 * Daniel, sobre «Acompañamiento Cerebro Artificial»: *"de izquierda a derecha entiendo cómo funciona, pero no me
 * encanta la experiencia de usuario"*. Un lienzo con marcos ya ES un relato: cada marco es un capítulo y el orden de
 * lectura es el de la página. Aquí vive lo PURO (se prueba sin navegador): qué es un capítulo, en qué orden se lee,
 * cómo se llama, dónde se para la cámara y por qué camino llega.
 *
 * Un capítulo es:
 *   · una SECCIÓN (`frame`) que no está dentro de otra, o
 *   · una ISLA: contenido suelto, fuera de toda sección, del tamaño de un capítulo. Existe porque los lienzos se
 *     arman por partes y no todas nacen con marco (en este, el Customer Journey firmado vive suelto entre dos
 *     secciones). Una isla chica (una nota, una flecha a medio camino) no es capítulo: no se anuncia en el índice.
 *
 * Sin secciones no hay capítulos: un lienzo sin marcos no declaró partes y adivinarlas sería inventar.
 */

import type { Camera, CanvasElement } from '../model/element'
import { visualBounds } from '../model/element'
import { fitBounds, type ChromeInsets, type Viewport } from '../render/viewport'
import { camaraEntre } from '../input/navegacion'

export interface Caja { x: number; y: number; width: number; height: number }

export interface Capitulo {
  /** Estable mientras la página no cambie de forma: el id del marco o `isla:<id del primer elemento>`. */
  id: string
  titulo: string
  caja: Caja
}

const CIRCULADOS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

const union = (cs: Caja[]): Caja => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const c of cs) {
    x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y)
    x1 = Math.max(x1, c.x + c.width); y1 = Math.max(y1, c.y + c.height)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

const centroDentro = (c: Caja, de: Caja) => {
  const cx = c.x + c.width / 2, cy = c.y + c.height / 2
  return cx >= de.x && cx <= de.x + de.width && cy >= de.y && cy <= de.y + de.height
}

const cerca = (a: Caja, b: Caja, g: number) =>
  a.x - g <= b.x + b.width && b.x - g <= a.x + a.width && a.y - g <= b.y + b.height && b.y - g <= a.y + a.height

/** Cuenta para el relato lo que ocupa lugar: no los conectores (van entre partes) ni la tinta suelta. */
const ocupa = (e: CanvasElement) => e.type !== 'frame' && e.type !== 'connector' && e.type !== 'ink'

/** Los textos de un elemento con su tamaño, en coordenadas de mundo. */
function textos(e: CanvasElement): Array<{ texto: string; size: number; caja: Caja }> {
  if (e.type === 'text') return [{ texto: e.text, size: e.style.size, caja: { x: e.x, y: e.y, width: e.width, height: e.height } }]
  if (e.type === 'shape' && e.text?.length) {
    return e.text.map(t => ({ texto: t.text, size: t.style.size, caja: { x: e.x + t.x, y: e.y + t.y, width: t.width, height: t.height } }))
  }
  return []
}

/** «EL ACOMPAÑAMIENTO» se lee como «El acompañamiento»; lo que ya trae minúsculas se respeta. */
function frase(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ')
  if (t !== t.toUpperCase()) return t
  const bajo = t.toLocaleLowerCase('es')
  return bajo.charAt(0).toLocaleUpperCase('es') + bajo.slice(1)
}

/**
 * El nombre de un capítulo. Por orden de autoridad:
 *   1. el título que la sección declara;
 *   2. lo que sigue a un número circulado («· ③ EL ACOMPAÑAMIENTO»): el autor ya nombró la parte;
 *   3. el texto más grande de la franja de arriba (el titular de la parte).
 */
export function tituloDe(caja: Caja, els: CanvasElement[], declarado?: string): string {
  if (declarado?.trim()) return declarado.trim()
  const franja = { x: caja.x, y: caja.y - 200, width: caja.width, height: 200 + caja.height * 0.3 }
  const cand = els.flatMap(textos).filter(t => t.texto.trim() && centroDentro(t.caja, franja))
  for (const t of [...cand].sort((a, b) => a.caja.y - b.caja.y)) {
    const m = new RegExp(`[${CIRCULADOS}]\\s+(\\p{L}[^·•|${CIRCULADOS}]{2,59})$`, 'u').exec(t.texto.trim())
    if (m) return frase(m[1])
  }
  const mayor = cand.sort((a, b) => b.size - a.size || a.caja.y - b.caja.y)[0]
  return mayor ? frase(mayor.texto).slice(0, 60) : 'Sin título'
}

/**
 * El orden de lectura: por renglones de arriba abajo y, dentro de cada renglón, de izquierda a derecha. Dos partes
 * van en el mismo renglón si se traslapan en alto al menos 40 % de la más baja; si no, la de arriba va primero.
 */
export function ordenDeLectura<T extends { caja: Caja }>(cs: T[]): T[] {
  const porArriba = [...cs].sort((a, b) => a.caja.y - b.caja.y)
  const renglones: T[][] = []
  for (const c of porArriba) {
    const r = renglones.find(rr => rr.some(o => {
      const traslape = Math.min(o.caja.y + o.caja.height, c.caja.y + c.caja.height) - Math.max(o.caja.y, c.caja.y)
      return traslape >= 0.4 * Math.min(o.caja.height, c.caja.height)
    }))
    if (r) r.push(c); else renglones.push([c])
  }
  return renglones.flatMap(r => r.sort((a, b) => a.caja.x - b.caja.x))
}

export function capitulosDe(els: CanvasElement[]): Capitulo[] {
  const marcos = els.filter((e): e is Extract<CanvasElement, { type: 'frame' }> => e.type === 'frame')
  if (marcos.length === 0) return []
  const cajaDe = (e: CanvasElement): Caja => visualBounds(e)
  // Solo los de primer nivel: una sección dentro de otra es un apartado, no un capítulo.
  const raiz = marcos.filter(m => !marcos.some(o => o !== m && o.width * o.height > m.width * m.height && centroDentro(cajaDe(m), cajaDe(o))))
  const caps: Capitulo[] = raiz.map(m => ({ id: m.id, titulo: '', caja: cajaDe(m) }))

  // Las islas: lo que queda fuera de toda sección, agrupado por cercanía. La distancia que une crece con el tamaño
  // de los capítulos (un hueco de 200 en un lienzo de marcos de 1300 es interlineado; en uno de 300, es otra parte).
  const tamTipico = [...raiz.map(m => Math.min(m.width, m.height))].sort((a, b) => a - b)[Math.floor(raiz.length / 2)]
  const hueco = Math.max(60, tamTipico * 0.2)
  const sueltos = els.filter(e => ocupa(e) && !raiz.some(m => centroDentro(cajaDe(e), cajaDe(m))))
  let islas = sueltos.map(e => ({ ids: [e.id], caja: cajaDe(e) }))
  for (let cambio = true; cambio;) {
    cambio = false
    const fuera: typeof islas = []
    for (const i of islas) {
      const j = fuera.find(o => cerca(o.caja, i.caja, hueco))
      if (j) { j.caja = union([j.caja, i.caja]); j.ids.push(...i.ids); cambio = true } else fuera.push(i)
    }
    islas = fuera
  }
  const areaTipica = [...raiz.map(m => m.width * m.height)].sort((a, b) => a - b)[Math.floor(raiz.length / 2)]
  for (const i of islas) {
    if (i.caja.width * i.caja.height < areaTipica * 0.15 || i.ids.length < 6) continue
    caps.push({ id: 'isla:' + [...i.ids].sort()[0], titulo: '', caja: i.caja })
  }
  if (caps.length < 2) return []
  const porId = new Map(marcos.map(m => [m.id, m]))
  return ordenDeLectura(caps).map(c => ({ ...c, titulo: tituloDe(c.caja, els, porId.get(c.id)?.title) }))
}

/** Lo que se ve de una vista completa: todos los capítulos (no lo que haya perdido en las orillas). */
export const cajaDeTodo = (caps: Capitulo[]): Caja => union(caps.map(c => c.caja))

/**
 * Dónde se para la cámara en un capítulo. Se LEE: a lo ancho del capítulo (sin pasar de mostrar 40 % de su alto), desde su cabeza. Encuadrarlo entero
 * hacía que un marco alto (1320 × 4500) quedara al 17 %, ilegible, con la pantalla vacía a los lados. Si el
 * capítulo cabe completo a ese zoom, se centra; si no, la cámara se queda en la cabeza y lo demás se baja con la
 * rueda o con ↓.
 */
export function camaraDeCapitulo(c: Caja, vp: Viewport, chrome: ChromeInsets, aire = 40): Camera {
  const top = chrome.top ?? 0, bottom = chrome.bottom ?? 0
  const altoUtil = Math.max(1, vp.height - top - bottom - aire * 2)
  // En pantalla completa, a lo ancho dejaba un marco de 1320 al 88 %: solo se veía la cabeza. Se muestra siempre
  // al menos el 40 % de su alto; el ancho manda en pantallas angostas.
  const anchoFit = fitBounds({ ...c, height: 1 }, vp, aire, chrome)
  const zoom = Math.min(anchoFit.zoom, (altoUtil / c.height) * 2.5)
  const base = { ...anchoFit, zoom, x: c.x + c.width / 2 - ((chrome.left ?? 0) - (chrome.right ?? 0)) / 2 / zoom }
  const altoVisible = altoUtil / zoom
  if (c.height <= altoVisible) return fitBounds(c, vp, aire, chrome)
  // La cabeza del capítulo, `aire` debajo del chrome de arriba.
  const y = c.y - aire / base.zoom + (vp.height / 2 - top) / base.zoom
  return { ...base, y }
}

/** Un paso de lectura dentro del capítulo (↓ / ↑): 80 % de la pantalla, sin salirse de él. */
export function bajarEnCapitulo(cam: Camera, c: Caja, vp: Viewport, dir: 1 | -1, chrome: ChromeInsets, aire = 40): Camera {
  const medio = vp.height / 2 / cam.zoom
  const minY = c.y - aire / cam.zoom + medio - (chrome.top ?? 0) / cam.zoom
  const maxY = Math.max(minY, c.y + c.height + aire / cam.zoom - medio + (chrome.bottom ?? 0) / cam.zoom)
  const y = Math.min(maxY, Math.max(minY, cam.y + dir * 0.8 * vp.height / cam.zoom))
  return { ...cam, y }
}

/** ¿En qué capítulo está mirando la cámara? El que contiene el centro; si ninguno, null. */
export function capituloBajo(cam: Camera, caps: Capitulo[]): number | null {
  const i = caps.findIndex(c => cam.x >= c.caja.x && cam.x <= c.caja.x + c.caja.width && cam.y >= c.caja.y && cam.y <= c.caja.y + c.caja.height)
  return i < 0 ? null : i
}

/**
 * El vuelo entre dos capítulos. Un paneo recto a zoom de lectura barre el contenido de lado a toda velocidad y
 * el ojo se pierde. Aquí la cámara se ALEJA un poco a medio camino, lo justo para que salir y llegar se vean en
 * el mismo cuadro, y vuelve a acercarse al destino: se entiende de dónde viene y a dónde va. Si el destino está a
 * menos de media pantalla, es el camino de siempre (`camaraEntre`).
 */
export function vuelo(a: Camera, b: Camera, t: number, anchoPantalla: number): Camera {
  if (t <= 0) return a
  if (t >= 1) return b
  const zMin = Math.min(a.zoom, b.zoom)
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  const enPantallas = (d * zMin) / Math.max(1, anchoPantalla)
  if (enPantallas < 0.5) return camaraEntre(a, b, t)
  // Al punto más alto, salida y llegada caben en ~1.4 pantallas.
  const zAlto = Math.min(zMin, (anchoPantalla * 1.4) / (d + anchoPantalla / zMin))
  const la = Math.log(a.zoom), lb = Math.log(b.zoom)
  const hondo = Math.max(0, (la + lb) / 2 - Math.log(zAlto))
  const zoom = Math.exp(la + (lb - la) * t - hondo * Math.sin(Math.PI * t))
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, zoom }
}

/** Cuánto dura un vuelo: con calma, y más mientras más lejos (con techo: nadie espera un segundo y medio). */
export function duracionDeVuelo(a: Camera, b: Camera, anchoPantalla: number): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y) * Math.min(a.zoom, b.zoom) / Math.max(1, anchoPantalla)
  return Math.round(Math.min(1100, 560 + d * 160))
}
