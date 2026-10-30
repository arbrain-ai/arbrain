/**
 * Viewport culling: given camera + canvas size, compute which elements
 * fall inside the visible world rect (with margin) for render.
 *
 * The footprint of an element is its TRUE render footprint, not just the
 * stored x/y/w/h:
 *  - Bound connectors: the stored box lies once a bound shape moves; the
 *    footprint is the bbox of the actual route points.
 *  - Rotated elements: the axis-aligned stored box does not contain the
 *    rotated figure; we inflate to the circumscribed circle (cheap, safe).
 * False positives are acceptable (slightly more draw calls); false negatives
 * are not (an element would vanish from screen).
 */
import type { CanvasElement, ConnectorElement, BBox, Camera } from '../elements/types'
import { bboxIntersects } from '../elements/types'
import { viewportInWorld } from './camera'
import { getConnectorRoute } from './renderer/connectors'
import { bboxOf, getSortedByZ } from './perf-cache'

export interface ViewportSize { width: number; height: number; dpr: number }

/** strokeWidth + arrowhead margin around a connector route. */
const CONNECTOR_FOOTPRINT_PAD = 24

function bboxOfPoints(points: Array<{ x: number; y: number }>, pad: number): BBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  minX -= pad
  minY -= pad
  maxX += pad
  maxY += pad
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

function inflateForRotation(box: BBox): BBox {
  const halfDiag = Math.hypot(box.width, box.height) / 2
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  return {
    minX: cx - halfDiag,
    minY: cy - halfDiag,
    maxX: cx + halfDiag,
    maxY: cy + halfDiag,
    width: halfDiag * 2,
    height: halfDiag * 2,
  }
}

function elementFootprint(
  el: CanvasElement,
  elements: CanvasElement[],
  routeOf?: (connector: ConnectorElement, elements: CanvasElement[]) => Array<{ x: number; y: number }>,
): BBox {
  if (el.type === 'connector') {
    const route = (routeOf ?? getConnectorRoute)(el, elements)
    if (route.length > 0) return bboxOfPoints(route, CONNECTOR_FOOTPRINT_PAD)
  }
  let box = bboxOf(el)
  if ('rotation' in el && typeof el.rotation === 'number' && el.rotation % 360 !== 0) {
    box = inflateForRotation(box)
  }
  return box
}

export function visibleElements(
  elements: CanvasElement[],
  camera: Camera,
  size: ViewportSize,
  margin = 200,
  routeOf?: (connector: ConnectorElement, elements: CanvasElement[]) => Array<{ x: number; y: number }>,
): CanvasElement[] {
  const view = viewportInWorld(camera, size)
  const padded: BBox = {
    minX: view.minX - margin,
    minY: view.minY - margin,
    maxX: view.maxX + margin,
    maxY: view.maxY + margin,
    width: view.width + margin * 2,
    height: view.height + margin * 2,
  }

  return elements.filter(el => {
    if (el.hidden) return false
    return bboxIntersects(elementFootprint(el, elements, routeOf), padded)
  })
}

export function sortByZIndex(elements: CanvasElement[]): CanvasElement[] {
  // Stable sort by zIndex; preserve insertion order for ties (cacheado —
  // NO mutar el array retornado)
  return getSortedByZ(elements)
}
