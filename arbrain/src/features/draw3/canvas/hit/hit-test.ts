/**
 * Hit detection — element + handle detection at a world point.
 */
import { getBoxToBoxArrow } from 'perfect-arrows'
import type { CanvasElement, BBox, ConnectorElement } from '../../elements/types'
import { bboxFromElement, isLinear, resizeConfigForElement } from '../../elements/types'
import { getConnectorRoute } from '../renderer/connectors'
import { getSortedByZDesc } from '../perf-cache'

export interface WorldPoint { x: number; y: number }

export type HandleKind =
  | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotation'

const HANDLE_SIZE = 10
const ROTATION_HANDLE_OFFSET_PX = 28
const ROTATION_HANDLE_HIT_PX = 26
const RESIZE_EDGE_HIT_PX = 13
const LINE_HIT_TARGET_PX = 12
const CONNECTOR_HIT_TARGET_PX = 14
const SHAPE_HIT_TARGET_PX = 10
const MAX_HIT_THRESHOLD_WORLD = 160

// Touch targets: cuando el último gesto vino de un dedo, agrandamos los blancos de
// handles/edges para alcanzar ~40-50px en pantalla (Apple HIG ~44px). Lo setea el
// pointer machine con setCoarsePointer(event.pointerType === 'touch') en cada down.
let coarsePointer = false
export function setCoarsePointer(value: boolean): void { coarsePointer = value }
const TOUCH_HANDLE_FACTOR = 4
const handlePx = (base: number): number => (coarsePointer ? base * TOUCH_HANDLE_FACTOR : base)

export function canRotateElement(el: CanvasElement): boolean {
  return resizeConfigForElement(el).rotatable
}

export function getHandles(el: CanvasElement, zoom = 1): Record<HandleKind, WorldPoint> {
  const safeZoom = Math.max(zoom || 1, 0.01)
  const offset = ROTATION_HANDLE_OFFSET_PX / safeZoom
  const box = bboxFromElement(el)
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const rotate = (point: WorldPoint): WorldPoint => rotatePoint(point, { x: cx, y: cy }, el.rotation || 0)

  return {
    nw: rotate({ x: box.minX, y: box.minY }),
    n:  rotate({ x: cx, y: box.minY }),
    ne: rotate({ x: box.maxX, y: box.minY }),
    e:  rotate({ x: box.maxX, y: cy }),
    se: rotate({ x: box.maxX, y: box.maxY }),
    s:  rotate({ x: cx, y: box.maxY }),
    sw: rotate({ x: box.minX, y: box.maxY }),
    w:  rotate({ x: box.minX, y: cy }),
    rotation: rotate({ x: box.minX - offset, y: box.maxY + offset }),
  }
}

export function hitTestHandles(
  el: CanvasElement,
  p: WorldPoint,
  zoom: number,
): HandleKind | null {
  const handles = getHandles(el, zoom)
  const radius = (handlePx(HANDLE_SIZE) / 2) / zoom + 2
  const rotationRadius = handlePx(ROTATION_HANDLE_HIT_PX) / Math.max(zoom || 1, 0.01)
  for (const [kind, hp] of Object.entries(handles)) {
    const pt = hp as WorldPoint
    if (kind === 'rotation' && !canRotateElement(el)) continue
    const hitRadius = kind === 'rotation' ? rotationRadius : radius
    if (Math.hypot(p.x - pt.x, p.y - pt.y) <= hitRadius) {
      return kind as HandleKind
    }
  }
  return null
}

export function hitTestResizeEdge(
  el: CanvasElement,
  p: WorldPoint,
  zoom: number,
): Exclude<HandleKind, 'rotation'> | null {
  if (!canResizeElement(el)) return null
  const safeZoom = Math.max(zoom || 1, 0.01)
  const threshold = handlePx(RESIZE_EDGE_HIT_PX) / safeZoom
  const { lx, ly } = localPoint(el, p)
  const halfW = Math.abs(el.width) / 2
  const halfH = Math.abs(el.height) / 2
  if (halfW <= 0 || halfH <= 0) return null

  const withinHorizontalBand = lx >= -halfW - threshold && lx <= halfW + threshold
  const withinVerticalBand = ly >= -halfH - threshold && ly <= halfH + threshold
  const nearTop = withinHorizontalBand && Math.abs(ly + halfH) <= threshold
  const nearRight = withinVerticalBand && Math.abs(lx - halfW) <= threshold
  const nearBottom = withinHorizontalBand && Math.abs(ly - halfH) <= threshold
  const nearLeft = withinVerticalBand && Math.abs(lx + halfW) <= threshold

  if (nearTop && nearLeft) return 'nw'
  if (nearTop && nearRight) return 'ne'
  if (nearBottom && nearRight) return 'se'
  if (nearBottom && nearLeft) return 'sw'
  if (nearTop) return 'n'
  if (nearRight) return 'e'
  if (nearBottom) return 's'
  if (nearLeft) return 'w'
  return null
}

function canResizeElement(el: CanvasElement): boolean {
  return resizeConfigForElement(el).resizable
}

function rotatePoint(point: WorldPoint, center: WorldPoint, angle: number): WorldPoint {
  if (!angle) return point
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

function pointInShape(el: CanvasElement, p: WorldPoint, zoom = 1): boolean {
  if (el.type === 'line' || el.type === 'arrow') return pointNearLinear(el, p, lineHitThreshold(el, zoom, LINE_HIT_TARGET_PX))

  const { lx, ly } = localPoint(el, p)

  const halfW = Math.abs(el.width) / 2
  const halfH = Math.abs(el.height) / 2
  const threshold = shapeHitThreshold(el, zoom)

  switch (el.type) {
    case 'ellipse':
      return pointInEllipse(lx, ly, halfW, halfH)
        || pointNearPolyline({ x: lx, y: ly }, ellipseVertices(halfW, halfH), threshold, true)
    case 'diamond':
      return pointInOrNearPolygon({ x: lx, y: ly }, [
        { x: 0, y: -halfH },
        { x: halfW, y: 0 },
        { x: 0, y: halfH },
        { x: -halfW, y: 0 },
      ], threshold)
    case 'triangle':
      return pointInOrNearPolygon({ x: lx, y: ly }, [
        { x: 0, y: -halfH },
        { x: halfW, y: halfH },
        { x: -halfW, y: halfH },
      ], threshold)
    case 'chevron':
      return pointInOrNearPolygon({ x: lx, y: ly }, chevronVertices(el, halfW, halfH), threshold)
    case 'polygon':
      return pointInOrNearPolygon(
        { x: lx, y: ly },
        regularPolygonVertices(Math.max(3, el.sides || 3), Math.min(halfW, halfH)),
        threshold,
      )
    case 'star':
      return pointInOrNearPolygon(
        { x: lx, y: ly },
        starVertices(Math.max(3, el.points || 5), Math.min(halfW, halfH), el.innerRadius || 0.5),
        threshold,
      )
    case 'frame': {
      const insideX = lx >= -halfW && lx <= halfW
      const insideY = ly >= -halfH && ly <= halfH
      const nearBorder = insideX && insideY && (
        Math.abs(Math.abs(lx) - halfW) <= threshold ||
        Math.abs(Math.abs(ly) - halfH) <= threshold
      )
      const titleHeight = 28
      const inTitle = insideX && ly >= -halfH - titleHeight && ly <= -halfH
      return nearBorder || inTitle
    }
    case 'rectangle':
      return pointInOrNearPolygon({ x: lx, y: ly }, [
        { x: -halfW, y: -halfH },
        { x: halfW, y: -halfH },
        { x: halfW, y: halfH },
        { x: -halfW, y: halfH },
      ], threshold)
    default:
      // bbox hit for text/sticky/image/widgets
      return lx >= -halfW && lx <= halfW && ly >= -halfH && ly <= halfH
  }
}

function localPoint(el: CanvasElement, p: WorldPoint): { lx: number; ly: number } {
  const cx = el.x + el.width / 2
  const cy = el.y + el.height / 2
  let lx = p.x - cx
  let ly = p.y - cy
  if (el.rotation !== 0) {
    const cos = Math.cos(-el.rotation)
    const sin = Math.sin(-el.rotation)
    const rx = lx * cos - ly * sin
    const ry = lx * sin + ly * cos
    lx = rx
    ly = ry
  }
  return { lx, ly }
}

function shapeHitThreshold(el: CanvasElement, zoom: number): number {
  return lineHitThreshold(el, zoom, SHAPE_HIT_TARGET_PX)
}

function pointInOrNearPolygon(point: WorldPoint, vertices: WorldPoint[], threshold: number): boolean {
  return pointInPolygon(point, vertices) || pointNearPolyline(point, vertices, threshold, true)
}

function pointInPolygon(point: WorldPoint, vertices: WorldPoint[]): boolean {
  if (vertices.length < 3) return false
  let inside = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]
    const b = vertices[j]
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && (point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x)
    if (intersects) inside = !inside
  }
  return inside
}

function pointNearPolyline(point: WorldPoint, vertices: WorldPoint[], threshold: number, closed: boolean): boolean {
  if (vertices.length < 2) return false
  for (let i = 0; i < vertices.length - 1; i++) {
    if (distanceToSegment(point, vertices[i], vertices[i + 1]) <= threshold) return true
  }
  if (closed && distanceToSegment(point, vertices[vertices.length - 1], vertices[0]) <= threshold) return true
  return false
}

function pointInEllipse(lx: number, ly: number, halfW: number, halfH: number): boolean {
  if (halfW <= 0 || halfH <= 0) return false
  return (lx * lx) / (halfW * halfW) + (ly * ly) / (halfH * halfH) <= 1
}

function ellipseVertices(halfW: number, halfH: number): WorldPoint[] {
  const steps = 48
  const vertices: WorldPoint[] = []
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    vertices.push({ x: Math.cos(angle) * halfW, y: Math.sin(angle) * halfH })
  }
  return vertices
}

function regularPolygonVertices(sides: number, radius: number): WorldPoint[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
}

function starVertices(points: number, outerRadius: number, innerRatio: number): WorldPoint[] {
  const count = points * 2
  const innerRadius = outerRadius * innerRatio
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
}

function chevronVertices(el: CanvasElement, halfW: number, halfH: number): WorldPoint[] {
  const notchRatio = 'notchRatio' in el && typeof el.notchRatio === 'number' ? el.notchRatio : 0.16
  const pointRatio = 'pointRatio' in el && typeof el.pointRatio === 'number' ? el.pointRatio : 0.84
  const notch = Math.max(0, Math.min(0.45, notchRatio)) * halfW * 2
  const pointStart = -halfW + Math.max(0.45, Math.min(0.96, pointRatio)) * halfW * 2
  return [
    { x: -halfW, y: -halfH },
    { x: pointStart, y: -halfH },
    { x: halfW, y: 0 },
    { x: pointStart, y: halfH },
    { x: -halfW, y: halfH },
    { x: -halfW + notch, y: 0 },
  ]
}

function pointNearLinear(
  el: CanvasElement,
  p: WorldPoint,
  threshold: number,
): boolean {
  if (!isLinear(el)) return false
  if (el.type === 'connector') return false
  const pts = el.points
  for (let i = 0; i < pts.length - 1; i++) {
    const a = { x: el.x + pts[i].x, y: el.y + pts[i].y }
    const b = { x: el.x + pts[i + 1].x, y: el.y + pts[i + 1].y }
    if (distanceToSegment(p, a, b) <= threshold) return true
  }
  return false
}

function distanceToSegment(p: WorldPoint, a: WorldPoint, b: WorldPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return Math.hypot(p.x - cx, p.y - cy)
}

// Los groups NO se hit-testean por su bbox: son contenedores logicos invisibles
// (estilo Miro). Click sobre un HIJO selecciona el grupo via selectableIdForHit;
// click en area vacia dentro del bbox del grupo deselecciona/marquee.
export function pickElement(elements: CanvasElement[], p: WorldPoint, zoom = 1): CanvasElement | null {
  const sorted = getSortedByZDesc(elements)
  for (const el of sorted) {
    if (el.hidden || el.type === 'group') continue
    if (el.type === 'text' && el.containerId) continue
    if (el.type === 'connector') {
      if (pointNearConnector(el, p, elements, connectorHitThreshold(el, zoom))) return el
      continue
    }
    if ((el.type === 'line' || el.type === 'arrow') && pointInShape(el, p, zoom)) return el
  }
  for (const el of sorted) {
    if (el.hidden || el.type === 'group') continue
    if (el.type === 'text' && el.containerId) continue
    if (el.type === 'connector' || el.type === 'line' || el.type === 'arrow') continue
    if (pointInShape(el, p, zoom)) return el
  }
  return null
}

export function pickElementForContext(elements: CanvasElement[], p: WorldPoint, zoom = 1): CanvasElement | null {
  const sorted = getSortedByZDesc(elements)
  for (const el of sorted) {
    if (el.hidden || el.type === 'connector' || el.type === 'group') continue
    if (el.type === 'text' && el.containerId) continue
    if (pointInShape(el, p, zoom)) return el
  }
  for (const el of sorted) {
    if (el.hidden || el.type !== 'connector') continue
    if (pointNearConnector(el, p, elements, connectorHitThreshold(el, zoom))) return el
  }
  return null
}

export type SelectionCorner = 'nw' | 'ne' | 'se' | 'sw'

export const OPPOSITE_SELECTION_CORNER: Record<SelectionCorner, SelectionCorner> = {
  nw: 'se',
  ne: 'sw',
  se: 'nw',
  sw: 'ne',
}

export function selectionCornerPoints(box: BBox): Record<SelectionCorner, WorldPoint> {
  return {
    nw: { x: box.minX, y: box.minY },
    ne: { x: box.maxX, y: box.minY },
    se: { x: box.maxX, y: box.maxY },
    sw: { x: box.minX, y: box.maxY },
  }
}

export function hitTestSelectionCorner(box: BBox, p: WorldPoint, zoom: number): SelectionCorner | null {
  // Radio generoso (handle completo + margen) para que agarrar la esquina sea facil
  // y tolerante al pequeno offset clientY del WKWebview de Tauri.
  const radius = handlePx(HANDLE_SIZE) / Math.max(zoom || 1, 0.01) + 4
  for (const [corner, point] of Object.entries(selectionCornerPoints(box))) {
    if (Math.hypot(p.x - point.x, p.y - point.y) <= radius) return corner as SelectionCorner
  }
  return null
}

export function hitTestSelectionEdge(box: BBox, p: WorldPoint, zoom: number): 'n' | 's' | 'e' | 'w' | null {
  const safeZoom = Math.max(zoom || 1, 0.01)
  const threshold = handlePx(RESIZE_EDGE_HIT_PX) / safeZoom
  // Las esquinas ganan: si el punto cae dentro del radio de cualquier esquina,
  // no es un hit de edge (mid-edge only). Mismo radio que hitTestSelectionCorner.
  const cornerRadius = handlePx(HANDLE_SIZE) / safeZoom + 4
  for (const point of Object.values(selectionCornerPoints(box))) {
    if (Math.hypot(p.x - point.x, p.y - point.y) <= cornerRadius) return null
  }
  const withinHorizontalSpan = p.x >= box.minX - threshold && p.x <= box.maxX + threshold
  const withinVerticalSpan = p.y >= box.minY - threshold && p.y <= box.maxY + threshold
  const nearTop = withinHorizontalSpan && Math.abs(p.y - box.minY) <= threshold
  const nearBottom = withinHorizontalSpan && Math.abs(p.y - box.maxY) <= threshold
  const nearLeft = withinVerticalSpan && Math.abs(p.x - box.minX) <= threshold
  const nearRight = withinVerticalSpan && Math.abs(p.x - box.maxX) <= threshold
  if (nearTop) return 'n'
  if (nearBottom) return 's'
  if (nearLeft) return 'w'
  if (nearRight) return 'e'
  return null
}

function elementsInBox(elements: CanvasElement[], box: BBox): CanvasElement[] {
  return elements.filter(el => {
    if (el.hidden) return false
    const eb = bboxFromElement(el)
    return eb.minX >= box.minX && eb.maxX <= box.maxX && eb.minY >= box.minY && eb.maxY <= box.maxY
  })
}

function pointNearConnector(connector: ConnectorElement, p: WorldPoint, elements: CanvasElement[], threshold: number): boolean {
  const resolved = resolveConnectorRenderPoints(connector, elements)
  if (!resolved) return false
  const { start, end, from, to } = resolved

  if (connector.routing === 'orthogonal') {
    const route = getConnectorRoute(connector, elements)
    return route.some((point, index) => index > 0 && distanceToSegment(p, route[index - 1], point) <= threshold)
  }

  if (connector.routing === 'curved') {
    const curve = connectorCurvePoints(connector, start, end, from, to)
    let prev = start
    for (let i = 1; i <= 18; i++) {
      const t = i / 18
      const point = quadraticPoint(curve.start, curve.control, curve.end, t)
      if (distanceToSegment(p, prev, point) <= threshold) return true
      prev = point
    }
    return false
  }

  return distanceToSegment(p, start, end) <= threshold
}

function lineHitThreshold(
  el: CanvasElement,
  zoom: number,
  minScreenPx: number,
): number {
  const strokeWidth = 'strokeWidth' in el ? Number(el.strokeWidth) || 1 : 1
  const safeZoom = Math.max(zoom || 1, 0.01)
  return Math.min(MAX_HIT_THRESHOLD_WORLD, Math.max(strokeWidth / 2 + minScreenPx / safeZoom, 8))
}

function connectorHitThreshold(connector: ConnectorElement, zoom: number): number {
  return lineHitThreshold(connector, zoom, CONNECTOR_HIT_TARGET_PX)
}

function resolveConnectorRenderPoints(connector: ConnectorElement, elements: CanvasElement[]) {
  const from = connector.startBinding ? elements.find(e => e.id === connector.startBinding!.elementId) ?? null : null
  const to = connector.endBinding ? elements.find(e => e.id === connector.endBinding!.elementId) ?? null : null

  if (from && to) {
    if (connector.startBinding!.anchor === 'auto' && connector.endBinding!.anchor === 'auto') {
      const auto = bestAuto(from, to)
      return { start: auto.start, end: auto.end, from, to }
    }
    return {
      start: anchorPoint(from, connector.startBinding!.anchor),
      end: anchorPoint(to, connector.endBinding!.anchor),
      from,
      to,
    }
  }

  return {
    start: { x: connector.x, y: connector.y },
    end: { x: connector.x + connector.width, y: connector.y + connector.height },
    from,
    to,
  }
}

function connectorCurvePoints(
  connector: ConnectorElement,
  start: WorldPoint,
  end: WorldPoint,
  from: CanvasElement | null,
  to: CanvasElement | null,
) {
  const manual = Array.isArray(connector.waypoints)
    ? connector.waypoints.find(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    : null
  if (manual) {
    return {
      start,
      control: manual,
      end,
    }
  }

  if (from && to) {
    const fromBox = bboxFromElement(from)
    const toBox = bboxFromElement(to)
    const [sx, sy, cx, cy, ex, ey] = getBoxToBoxArrow(
      fromBox.minX,
      fromBox.minY,
      fromBox.width,
      fromBox.height,
      toBox.minX,
      toBox.minY,
      toBox.width,
      toBox.height,
      { padStart: 0, padEnd: connector.endArrowhead === 'none' ? 0 : 8 },
    )
    return {
      start: { x: sx, y: sy },
      control: { x: cx, y: cy },
      end: { x: ex, y: ey },
    }
  }

  return {
    start,
    control: { x: (start.x + end.x) / 2, y: start.y },
    end,
  }
}

function anchorPoint(el: CanvasElement, anchor: NonNullable<ConnectorElement['startBinding']>['anchor']): WorldPoint {
  const b = bboxFromElement(el)
  const cx = b.minX + b.width / 2
  const cy = b.minY + b.height / 2
  if (anchor === 'top') return { x: cx, y: b.minY }
  if (anchor === 'right') return { x: b.maxX, y: cy }
  if (anchor === 'bottom') return { x: cx, y: b.maxY }
  if (anchor === 'left') return { x: b.minX, y: cy }
  if (anchor === 'top-left') return { x: b.minX, y: b.minY }
  if (anchor === 'top-right') return { x: b.maxX, y: b.minY }
  if (anchor === 'bottom-left') return { x: b.minX, y: b.maxY }
  if (anchor === 'bottom-right') return { x: b.maxX, y: b.maxY }
  return { x: cx, y: cy }
}

function bestAuto(from: CanvasElement, to: CanvasElement): { start: WorldPoint; end: WorldPoint } {
  const a = bboxFromElement(from)
  const b = bboxFromElement(to)
  return nearestAutoEndpoints(a, b)
}

function nearestAutoEndpoints(a: BBox, b: BBox): { start: WorldPoint; end: WorldPoint } {
  const ac = { x: (a.minX + a.maxX) / 2, y: (a.minY + a.maxY) / 2 }
  const bc = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  const horizontalGap = b.minX >= a.maxX ? b.minX - a.maxX : a.minX >= b.maxX ? a.minX - b.maxX : 0
  const verticalGap = b.minY >= a.maxY ? b.minY - a.maxY : a.minY >= b.maxY ? a.minY - b.maxY : 0

  if (horizontalGap > 0 && (verticalGap === 0 || horizontalGap <= verticalGap * 1.2)) {
    return bc.x >= ac.x
      ? { start: { x: a.maxX, y: ac.y }, end: { x: b.minX, y: bc.y } }
      : { start: { x: a.minX, y: ac.y }, end: { x: b.maxX, y: bc.y } }
  }

  if (verticalGap > 0) {
    return bc.y >= ac.y
      ? { start: { x: ac.x, y: a.maxY }, end: { x: bc.x, y: b.minY } }
      : { start: { x: ac.x, y: a.minY }, end: { x: bc.x, y: b.maxY } }
  }

  const dx = bc.x - ac.x
  const dy = bc.y - ac.y
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0
      ? { start: { x: a.maxX, y: ac.y }, end: { x: b.minX, y: bc.y } }
      : { start: { x: a.minX, y: ac.y }, end: { x: b.maxX, y: bc.y } }
  }

  return dy >= 0
    ? { start: { x: ac.x, y: a.maxY }, end: { x: bc.x, y: b.minY } }
    : { start: { x: ac.x, y: a.minY }, end: { x: bc.x, y: b.maxY } }
}

function quadraticPoint(a: WorldPoint, c: WorldPoint, b: WorldPoint, t: number): WorldPoint {
  const mt = 1 - t
  return {
    x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
    y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y,
  }
}
