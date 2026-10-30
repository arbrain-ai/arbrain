/**
 * Canvas v4 — viewport, DPR y conversion pantalla↔mundo.
 *
 * Concentra tres hechos de plataforma que costaron caro en el v3. Los tres
 * estan en HECHOS-DE-PLATAFORMA.md con su evidencia.
 */

import type { Camera } from '../model/element'
import { MIN_ZOOM, MAX_ZOOM } from '../model/element'

/**
 * HECHO A1 — el DPR efectivo es `devicePixelRatio × zoom CSS`, y su techo sale
 * del presupuesto de pixeles de iOS Safari, NO de un cap fijo.
 *
 * Un cap plano de 3 truncaba resolucion con iPad DPR=2 y zoom de pagina >150%,
 * y Safari estiraba el bitmap interpolando: trazo borroso. Se calcula por AREA
 * y se recalcula en cada resize.
 */
const PIXEL_BUDGET = 16 * 1024 * 1024  // ~16.7M px, medido en iOS Safari
const MAX_SIDE = 4096

export function computeDpr(cssWidth: number, cssHeight: number, rawDpr: number): number {
  if (cssWidth <= 0 || cssHeight <= 0) return 1
  const byArea = Math.sqrt(PIXEL_BUDGET / (cssWidth * cssHeight))
  const bySide = MAX_SIDE / Math.max(cssWidth, cssHeight)
  return Math.max(1, Math.min(rawDpr, byArea, bySide))
}

export interface Viewport {
  /** Tamaño en px CSS. */
  width: number
  height: number
  dpr: number
}

/**
 * HECHO A4 — `getBoundingClientRect()` devuelve px VISUALES (post-zoom-CSS)
 * mientras `clientWidth`/`offsetWidth` devuelven px de LAYOUT. Mezclarlos bajo
 * zoom descalibra esta conversion y el trazo aterriza lejos del cursor.
 *
 * Toda la matematica de coordenadas del canvas vive en UN solo espacio de
 * pixeles. Estas dos funciones son la unica puerta entre mundo y pantalla; si
 * algo se descalibra, se arregla aqui y en ningun otro lado.
 */
export function screenToWorld(p: { x: number; y: number }, camera: Camera, vp: Viewport): { x: number; y: number } {
  return {
    x: (p.x - vp.width / 2) / camera.zoom + camera.x,
    y: (p.y - vp.height / 2) / camera.zoom + camera.y,
  }
}

export function worldToScreen(p: { x: number; y: number }, camera: Camera, vp: Viewport): { x: number; y: number } {
  return {
    x: (p.x - camera.x) * camera.zoom + vp.width / 2,
    y: (p.y - camera.y) * camera.zoom + vp.height / 2,
  }
}

/**
 * El punto del puntero en px de LAYOUT del lienzo (5 oct 2026). `clientX - rect.left` da px VISUALES; bajo el zoom
 * CSS global de la app (`--ui-zoom` en el panel) no coinciden con `clientWidth`/`viewport`, que son de layout, y el
 * ancla de la rueda, el puntero y el pellizco caian lejos del cursor (el mismo hecho A4 de arriba). Se reescala por
 * la proporcion real entre los dos anchos; sin zoom CSS la escala es 1 y no cambia nada.
 */
export function puntoLocal(
  clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  anchoLayout: number, altoLayout: number,
): { x: number; y: number } {
  const sx = rect.width > 0 && anchoLayout > 0 ? anchoLayout / rect.width : 1
  const sy = rect.height > 0 && altoLayout > 0 ? altoLayout / rect.height : 1
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy }
}

/**
 * HECHO G3 — un `setCamera` con valores no finitos o zoom ≤ 0 congela el zoom
 * en "NaN%" y bloquea el canvas. Silencioso y catastrofico.
 *
 * En el v3 el mismo bug era alcanzable por DOS caminos (la API de ops y el store
 * del cliente) y hubo que parchar los dos. Aqui hay una sola funcion y TODO
 * camino que escriba camara pasa por ella.
 */
export function sanitizeCamera(c: Partial<Camera> | null | undefined, fallback: Camera): Camera {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const zoom = num(c?.zoom, fallback.zoom)
  return {
    x: num(c?.x, fallback.x),
    y: num(c?.y, fallback.y),
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)),
  }
}

/** El rectangulo de mundo que se ve ahora. Base del culling. */
export function visibleWorldBounds(camera: Camera, vp: Viewport, margin = 0) {
  const halfW = vp.width / 2 / camera.zoom
  const halfH = vp.height / 2 / camera.zoom
  return {
    minX: camera.x - halfW - margin, maxX: camera.x + halfW + margin,
    minY: camera.y - halfH - margin, maxY: camera.y + halfH + margin,
  }
}

/** Zoom anclado a un punto de pantalla: ese punto no se mueve. */
export function zoomAt(
  camera: Camera, vp: Viewport, screenPoint: { x: number; y: number }, factor: number,
): Camera {
  const before = screenToWorld(screenPoint, camera, vp)
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor))
  const after = screenToWorld(screenPoint, { ...camera, zoom }, vp)
  return { x: camera.x + (before.x - after.x), y: camera.y + (before.y - after.y), zoom }
}

/**
 * Encuadra un rectangulo de mundo en el viewport.
 *
 * Centrar sin calcular el zoom deja el contenido saliendose por los lados —
 * parece un bug de layout y es un encuadre que nadie hizo.
 *
 * El zoom se CLAMPA a 1: un diagrama chico en una pantalla grande no debe
 * ampliarse hasta llenarla; el 100% es el tamaño de lectura y pasarse de ahi
 * se ve amateur.
 */
/**
 * Encuadra unos limites en la pantalla.
 *
 * `chrome` son los margenes que ocupa la interfaz FLOTANTE: la barra de
 * herramientas por la izquierda, el titulo arriba, la de estado abajo. Sin
 * ellos el encuadre usa la ventana COMPLETA y mete contenido debajo de los
 * botones — medido el 20 ago 2026 con los tres sistemas del negocio: el titulo
 * del diagrama quedaba tapado por la barra izquierda en cada encuadre.
 *
 * El centro se desplaza medio delta de cada eje: no basta con encoger el area
 * disponible, hay que MOVER el centro hacia donde queda el hueco libre, o el
 * contenido se centra en la ventana y vuelve a caer debajo del chrome.
 */
export interface ChromeInsets { top?: number; right?: number; bottom?: number; left?: number }

export function fitBounds(
  bounds: { width: number; height: number; x?: number; y?: number },
  vp: Viewport,
  padding = 48,
  chrome: ChromeInsets = {},
): Camera {
  const top = chrome.top ?? 0, right = chrome.right ?? 0
  const bottom = chrome.bottom ?? 0, left = chrome.left ?? 0
  const w = Math.max(1, bounds.width), h = Math.max(1, bounds.height)
  const availW = Math.max(1, vp.width - padding * 2 - left - right)
  const availH = Math.max(1, vp.height - padding * 2 - top - bottom)
  const zoom = Math.min(1, Math.min(availW / w, availH / h))
  return sanitizeCamera({
    // El centro se corre hacia el hueco libre, en coordenadas de MUNDO (por eso
    // se divide entre el zoom).
    x: (bounds.x ?? 0) + w / 2 - (left - right) / 2 / zoom,
    y: (bounds.y ?? 0) + h / 2 - (top - bottom) / 2 / zoom,
    zoom,
  }, { x: 0, y: 0, zoom: 1 })
}
