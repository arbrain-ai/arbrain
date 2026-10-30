/**
 * Canvas v4 — manijas de redimension.
 *
 * Las ocho manijas del rectangulo de seleccion. Su tamaño se mide en pixeles de
 * PANTALLA, no de mundo: una manija que encoge al alejarse se vuelve imposible
 * de agarrar justo cuando mas falta hace, y una que crece al acercarse tapa el
 * elemento que intenta editar.
 */

import type { CanvasElement } from '../model/element'
import { bounds } from '../model/element'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** La manija de GIRO. Se identifica aparte: no redimensiona, gira. */
export const ROTATE_HANDLE = 'rotate'
/** A que distancia del borde superior vive, en px de PANTALLA. */
export const ROTATE_OFFSET_PX = 26
/** Radio de agarre del tirador de giro, en px de PANTALLA. */
const ROTATE_GRAB_PX = 13
const ROTATE_GRAB_PX_TOUCH = 26

/** Donde cae el tirador de giro para una caja de seleccion. */
export function rotateCenter(r: Rect, zoom: number): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y - ROTATE_OFFSET_PX / zoom }
}

/** Lado en px de pantalla. HECHO B8: en tactil se necesita ~4x. */
export const HANDLE_PX = 9
const HANDLE_PX_TOUCH = 22

export interface Rect { x: number; y: number; width: number; height: number }

/** Caja que envuelve a TODA la seleccion. Con varios, es la union. */
export function selectionBounds(elements: CanvasElement[], ids: Set<string>): Rect | null {
  const sel = elements.filter(e => ids.has(e.id))
  if (sel.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const el of sel) {
    const b = bounds(el)
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function handleCenter(r: Rect, h: HandleId): { x: number; y: number } {
  const { x, y, width: w, height: hgt } = r
  const cx = x + w / 2, cy = y + hgt / 2
  switch (h) {
    case 'nw': return { x, y }
    case 'n': return { x: cx, y }
    case 'ne': return { x: x + w, y }
    case 'e': return { x: x + w, y: cy }
    case 'se': return { x: x + w, y: y + hgt }
    case 's': return { x: cx, y: y + hgt }
    case 'sw': return { x, y: y + hgt }
    case 'w': return { x, y: cy }
  }
}

/**
 * Que manija hay bajo el punto, si alguna. Incluye la de GIRO.
 *
 * El giro se prueba PRIMERO: vive fuera de la caja, asi que casi nunca compite,
 * pero cuando la seleccion es muy chica su radio de agarre puede rozar la
 * manija `n`. Ahi gana girar, porque redimensionar algo diminuto por su borde
 * superior no es un gesto que nadie intente.
 */
export function handleAt(
  r: Rect, p: { x: number; y: number }, zoom: number, coarse = false,
): string | null {
  const rot = rotateCenter(r, zoom)
  const rr = (coarse ? ROTATE_GRAB_PX_TOUCH : ROTATE_GRAB_PX) / zoom
  if (Math.hypot(p.x - rot.x, p.y - rot.y) <= rr) return ROTATE_HANDLE

  const radio = ((coarse ? HANDLE_PX_TOUCH : HANDLE_PX) / 2 + 3) / zoom
  for (const h of HANDLES) {
    const c = handleCenter(r, h)
    if (Math.abs(p.x - c.x) <= radio && Math.abs(p.y - c.y) <= radio) return h
  }
  return null
}

/** ¿Es la manija de giro? */
export const esGiro = (h: string | null): boolean => h === ROTATE_HANDLE

export const CURSOR: Record<HandleId, string> = {
  nw: 'nwse-resize', se: 'nwse-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
}

/**
 * La caja resultante de arrastrar una manija.
 *
 * `proporcional` (con Shift) conserva la relacion de aspecto. Y el resultado se
 * NORMALIZA: arrastrar la manija izquierda mas alla de la derecha da un ancho
 * negativo, y sin normalizar el elemento desaparece en vez de voltearse.
 */
export function resizeRect(
  original: Rect, h: HandleId, delta: { x: number; y: number }, proporcional = false,
): Rect {
  let { x, y, width: w, height: hh } = original
  const oeste = h === 'nw' || h === 'w' || h === 'sw'
  const este = h === 'ne' || h === 'e' || h === 'se'
  const norte = h === 'nw' || h === 'n' || h === 'ne'
  const sur = h === 'sw' || h === 's' || h === 'se'

  if (oeste) { x += delta.x; w -= delta.x }
  if (este) { w += delta.x }
  if (norte) { y += delta.y; hh -= delta.y }
  if (sur) { hh += delta.y }

  if (proporcional && original.width > 0 && original.height > 0) {
    const aspecto = original.width / original.height
    // Manda el eje que mas se movio, o el resultado se siente pegajoso.
    if (Math.abs(delta.x) > Math.abs(delta.y)) {
      const nuevoAlto = w / aspecto
      if (norte) y += hh - nuevoAlto
      hh = nuevoAlto
    } else {
      const nuevoAncho = hh * aspecto
      if (oeste) x += w - nuevoAncho
      w = nuevoAncho
    }
  }

  // Normalizar: sin esto, cruzar el lado opuesto da tamaño negativo y el
  // elemento desaparece en vez de voltearse.
  if (w < 0) { x += w; w = -w }
  if (hh < 0) { y += hh; hh = -hh }
  return { x, y, width: Math.max(8, w), height: Math.max(8, hh) }
}

/** Aplica a un elemento su parte proporcional de la nueva caja de seleccion. */
export function applyResize(el: CanvasElement, antes: Rect, despues: Rect): CanvasElement {
  if (antes.width <= 0 || antes.height <= 0) return el
  const sx = despues.width / antes.width
  const sy = despues.height / antes.height
  const b = bounds(el)
  const x = despues.x + (b.x - antes.x) * sx
  const y = despues.y + (b.y - antes.y) * sy
  const width = Math.max(8, b.width * sx)
  const height = Math.max(8, b.height * sy)

  if (el.type === 'ink') {
    // La tinta escala sus PUNTOS, no su caja: la caja de un trazo se deriva de
    // los puntos, asi que cambiarla sola no haria nada visible.
    return {
      ...el, x: el.x + (x - b.x), y: el.y + (y - b.y),
      points: el.points.map(p => ({ ...p, x: p.x * sx, y: p.y * sy })),
      size: el.size * Math.min(sx, sy),
      updatedAt: Date.now(),
    }
  }
  return { ...el, x, y, width, height, updatedAt: Date.now() } as CanvasElement
}
