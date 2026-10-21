/**
 * Encuadrar una zona del lienzo (2 oct 2026, pedido de Daniel: que Levy lleve la cámara a donde
 * quiere que mire y que se LEA a ancho de panel). Antes la vista metía el lienzo entero al ancho:
 * Claridad mide ~14,400 px y en un panel de 640 px quedaba a zoom 0.044, texto de 0.9 px.
 *
 * Lógica pura (sin React ni DOM) para probarla sola: tests/cabina/zona.test.ts.
 *
 * Qué entiende `zona`, en este orden:
 *   1. «x,y,ancho,alto»            un rectángulo en coordenadas de mundo
 *   2. el id exacto de un elemento  (un marco `tb:whole`, una tarjeta)
 *   3. el id de un grupo            (todos sus miembros)
 *   4. un prefijo de ids            `ht:op` → `ht:op:*` (los generadores de sfmap nombran así cada zona)
 *   5. una frase del lienzo         «lo firmado» → el marco más chico que contiene ese texto
 */
import type { CanvasElement } from '@/features/canvas/model/element'
import { visualBounds } from '@/features/canvas/model/element'

export interface Rect { x: number; y: number; width: number; height: number }
export interface Zona { rect: Rect; como: 'rect' | 'id' | 'grupo' | 'prefijo' | 'frase' }

const NUM = '(-?\\d+(?:\\.\\d+)?)'
const RECT = new RegExp(`^\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*$`)

export function unir(cajas: Rect[]): Rect | null {
  if (!cajas.length) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of cajas) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height) }
  return Number.isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null
}

/** Los límites de todo lo que hay (lo que el ojo ve: el pie de una tarjeta cuelga fuera de su caja). */
export const limites = (els: CanvasElement[]) => unir(els.map(visualBounds))

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** El texto que se lee en un elemento: texto suelto, el de una figura o el título de un marco. */
export function textoDe(e: CanvasElement): string {
  const o = e as unknown as { text?: unknown; title?: unknown }
  if (typeof o.text === 'string') return o.text
  if (Array.isArray(o.text)) return o.text.map(t => (t && typeof t === 'object' && 'text' in t ? String((t as { text: unknown }).text ?? '') : '')).join(' ')
  return typeof o.title === 'string' ? o.title : ''
}

const dentro = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
const area = (r: Rect) => r.width * r.height

export function resolverZona(els: CanvasElement[], zona: string | undefined | null): Zona | null {
  const z = zona?.trim()
  if (!z || !els.length) return null
  const m = RECT.exec(z)
  if (m) {
    const [x, y, width, height] = m.slice(1).map(Number)
    return width > 0 && height > 0 ? { rect: { x, y, width, height }, como: 'rect' } : null
  }
  const exacto = els.find(e => e.id === z)
  if (exacto) return { rect: visualBounds(exacto), como: 'id' }
  const grupo = unir(els.filter(e => e.groupId === z).map(visualBounds))
  if (grupo) return { rect: grupo, como: 'grupo' }
  // Sin los que no tienen caja propia (los conectores de sfmap guardan 0,0,0,0): no dicen dónde está la zona.
  const prefijo = unir(els.filter(e => (e.id.startsWith(z + ':') || e.id.startsWith(z + '-')) && e.type !== 'connector' && (e.width > 0 || e.height > 0)).map(visualBounds))
  if (prefijo) return { rect: prefijo, como: 'prefijo' }

  const buscado = normal(z)
  if (buscado.length < 3) return null
  const conTexto = els.filter(e => e.type !== 'frame' && normal(textoDe(e)).includes(buscado))
  if (!conTexto.length) return null
  // Lo más corto que lo dice es lo más específico (un título antes que un párrafo que lo menciona).
  const elegido = conTexto.sort((a, b) => textoDe(a).length - textoDe(b).length)[0]
  const caja = visualBounds(elegido)
  const centro = { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 }
  // El contexto es la zona MÁS CHICA que lo contiene (un marco o un prefijo de ids), siempre que se
  // pueda leer a ancho de panel; si todas son medio lienzo, un margen alrededor del texto.
  const prefijos = new Map<string, Rect[]>()
  for (const e of els) {
    const partes = e.id.split(':')
    if (partes.length < 3 || e.type === 'connector' || !(e.width > 0 || e.height > 0)) continue
    const k = partes.slice(0, 2).join(':'); const l = prefijos.get(k) ?? []; l.push(visualBounds(e)); prefijos.set(k, l)
  }
  const candidatas = [...els.filter(e => e.type === 'frame').map(visualBounds), ...[...prefijos.values()].map(l => unir(l)!)]
    .filter(r => dentro(centro, r) && r.width <= ANCHO_LEGIBLE).sort((a, b) => area(a) - area(b))
  if (candidatas[0]) return { rect: candidatas[0], como: 'frase' }
  const pad = Math.max(240, caja.width * 0.4)
  return { rect: { x: caja.x - pad, y: caja.y - pad, width: caja.width + pad * 2, height: caja.height + pad * 2 }, como: 'frase' }
}

/** Más ancho que esto (en unidades de mundo) ya no se lee a ancho de panel (~0.4 de zoom en 900 px). */
const ANCHO_LEGIBLE = 2400

export interface Camara { x: number; y: number; zoom: number }

/**
 * La cámara que deja `r` legible en un visor de `ancho × alto` px. Legible antes que completo: se
 * ajusta al ancho y, si la zona es más alta que el visor, arranca arriba (se baja con la rueda o el
 * dedo). `todo` = que quepa entera, para el botón «Encuadrar todo».
 */
export function camaraPara(r: Rect, ancho: number, alto: number, { margen = 24, maxZoom = 1.6, todo = false } = {}): Camara {
  const w = r.width + margen * 2, h = r.height + margen * 2
  const porAncho = ancho / w, porAlto = alto / h
  const zoom = Math.max(0.01, Math.min(todo ? Math.min(porAncho, porAlto) : porAncho, maxZoom))
  const x = r.x - margen + w / 2
  const altoVisible = alto / zoom
  // `todo`: centrado. Una zona: arriba del visor, que es donde se empieza a leer.
  const y = todo && h <= altoVisible ? r.y - margen + h / 2 : r.y - margen + altoVisible / 2
  return { x, y, zoom }
}

/** Zoom alrededor de un punto de pantalla (el cursor o el centro de los dedos), sin que ese punto se mueva. */
export function zoomEn(c: Camara, factor: number, punto: { x: number; y: number }, vista: { width: number; height: number }, lim = { min: 0.01, max: 8 }): Camara {
  const zoom = Math.min(lim.max, Math.max(lim.min, c.zoom * factor))
  const mx = (punto.x - vista.width / 2) / c.zoom + c.x, my = (punto.y - vista.height / 2) / c.zoom + c.y
  return { zoom, x: mx - (punto.x - vista.width / 2) / zoom, y: my - (punto.y - vista.height / 2) / zoom }
}
