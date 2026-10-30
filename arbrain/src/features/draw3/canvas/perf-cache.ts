/**
 * Caches memoizados del render/hit-test — cero estado React.
 *
 * Por que WeakMap por REFERENCIA funciona sin protocolo de invalidacion:
 * canvas-store usa zustand+immer, asi que cada edicion produce un objeto
 * NUEVO por elemento mutado y un array `elements` NUEVO. El objeto/array
 * viejo se GC-ea solo y se lleva su entrada de cache. Pan/zoom/hover NO
 * cambian el array → cache hit al 100% justo en los frames calientes.
 *
 * Durante un drag el array cambia cada frame: los caches por-array fallan
 * (correcto, el conjunto cambio) pero los bboxes de los cientos de elementos
 * NO movidos siguen cacheados por referencia de objeto. Ese es el trade.
 *
 * Regla dura: NUNCA mutar los arrays/objetos retornados — son compartidos
 * entre llamadas.
 */
import type { CanvasElement, ElementId, BBox } from '../elements/types'
import { bboxFromElement } from '../elements/types'
import type { CanvasPalette } from '../theme/tokens'
import { resolveElementColors } from '../theme/resolve'

// Re-export: el cache de rutas vive en connectors.ts (dueño de
// connectorRoutePoints) para evitar ciclos de import.


// ---------------------------------------------------------------------------
const bboxCache = new WeakMap<CanvasElement, BBox>()

/** bbox almacenado del elemento, cacheado por identidad de objeto. */
export function bboxOf(el: CanvasElement): BBox {
  const hit = bboxCache.get(el)
  if (hit) return hit
  const box = bboxFromElement(el)
  bboxCache.set(el, box)
  return box
}

// ---------------------------------------------------------------------------
const sortedAscCache = new WeakMap<CanvasElement[], CanvasElement[]>()
const sortedDescCache = new WeakMap<CanvasElement[], CanvasElement[]>()

/** z-sort ascendente (orden de render), cacheado por identidad del array. */
export function getSortedByZ(elements: CanvasElement[]): CanvasElement[] {
  const hit = sortedAscCache.get(elements)
  if (hit) return hit
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex)
  sortedAscCache.set(elements, sorted)
  return sorted
}

/** z-sort descendente (orden de hit-test), cacheado por identidad del array. */
export function getSortedByZDesc(elements: CanvasElement[]): CanvasElement[] {
  const hit = sortedDescCache.get(elements)
  if (hit) return hit
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex)
  sortedDescCache.set(elements, sorted)
  return sorted
}

// ---------------------------------------------------------------------------
const indexCache = new WeakMap<CanvasElement[], Map<ElementId, CanvasElement>>()

/** Indice id → elemento, cacheado por identidad del array. */
export function getElementIndex(elements: CanvasElement[]): Map<ElementId, CanvasElement> {
  const hit = indexCache.get(elements)
  if (hit) return hit
  const index = new Map<ElementId, CanvasElement>()
  for (const el of elements) index.set(el.id, el)
  indexCache.set(elements, index)
  return index
}

// ---------------------------------------------------------------------------
const colorCache = new WeakMap<CanvasElement, { palette: CanvasPalette; resolved: CanvasElement }>()

/**
 * resolveElementColors memoizado. Sin esto, cada elemento con color "auto"
 * (el default de las factories) se CLONA en cada frame — ademas de generar
 * garbage, rompe la identidad de objeto que usan los demas caches aguas
 * abajo (layout de texto). Mismo elemento + misma paleta → mismo objeto.
 */
export function resolveElementColorsCached<T extends CanvasElement>(el: T, palette: CanvasPalette): T {
  const hit = colorCache.get(el)
  if (hit && hit.palette === palette) return hit.resolved as T
  const resolved = resolveElementColors(el, palette)
  colorCache.set(el, { palette, resolved })
  return resolved
}
