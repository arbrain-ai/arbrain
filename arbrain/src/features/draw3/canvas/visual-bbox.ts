/**
 * Visual bbox helpers — el bbox VISUAL de un elemento es su footprint real
 * dibujado: para connectors bindeados es la ruta (el x/y/w/h almacenado
 * miente cuando un endpoint se movio). Usado por selection toolbar y export.
 *
 * Extraido verbatim de DrawEditor3.tsx (refactor fase 3).
 */
import type { CanvasElement, ConnectorElement, BBox } from '../elements/types'
import { bboxFromElement, bboxUnion } from '../elements/types'
import { getConnectorRoute } from './renderer/connectors'

function visualBBoxForElement(el: CanvasElement, elements: CanvasElement[]): BBox {
  if (el.type !== 'connector') return bboxFromElement(el)

  const points = connectorVisualPoints(el, elements)
  if (points.length === 0) return bboxFromElement(el)
  return bboxFromPoints(points, Math.max(12, el.strokeWidth * 2))
}

export function visualBBoxUnion(elements: CanvasElement[], allElements = elements): BBox | null {
  return bboxUnion(elements.map(el => visualBBoxForElement(el, allElements)))
}

export function bboxFromPoints(points: Array<{ x: number; y: number }>, padding = 0): BBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}

function connectorVisualPoints(connector: ConnectorElement, elements: CanvasElement[]) {
  return getConnectorRoute(connector, elements)
}
