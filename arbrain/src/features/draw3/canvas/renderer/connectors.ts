/**
 * Connector rendering: smart arrows that re-route as their endpoints move.
 *
 * Three routing styles:
 *  - straight: direct line between anchors
 *  - orthogonal: Manhattan routing with 1-2 elbows
 *  - curved: cubic bezier via perfect-arrows
 */
import { getBoxToBoxArrow } from 'perfect-arrows'
import type {
  CanvasElement,
  ConnectorElement,
  ArrowElement,
  LineElement,
  ArrowHead,
} from '../../elements/types'
import { bboxFromElement } from '../../elements/types'
import { perimeterPointToward, outlineCardinalPoint, elementCenter } from '../shape-geometry'
import type { CanvasPalette } from '../../theme/tokens'

export interface RenderConnectorOpts {
  ctx: CanvasRenderingContext2D
  elements: CanvasElement[]
  palette?: CanvasPalette
}

export type Point = { x: number; y: number }
type Box = { minX: number; minY: number; maxX: number; maxY: number }

type ConnectorAnchor = 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'auto'

/**
 * Endpoint sobre el CONTORNO REAL de la figura (aristas del triangulo,
 * circunferencia del ovalo, etc.) — estilo Miro, no el bounding box cuadrado.
 * - 'auto' / diagonales: punto del contorno sobre el rayo centro -> otro centro.
 * - cardinales: punto del contorno en esa direccion (queda fijo a ese lado).
 */
function endpointFor(el: CanvasElement, anchor: ConnectorAnchor, otherCenter: { x: number; y: number }): { x: number; y: number } {
  if (anchor === 'top' || anchor === 'right' || anchor === 'bottom' || anchor === 'left') {
    return outlineCardinalPoint(el, anchor)
  }
  return perimeterPointToward(el, otherCenter)
}

function resolveConnectorEndpoints(connector: ConnectorElement, elements: CanvasElement[]) {
  const from = connector.startBinding ? elements.find(e => e.id === connector.startBinding!.elementId) ?? null : null
  const to = connector.endBinding ? elements.find(e => e.id === connector.endBinding!.elementId) ?? null : null

  if (from && to) {
    const fc = elementCenter(from)
    const tc = elementCenter(to)
    return {
      start: endpointFor(from, connector.startBinding!.anchor, tc),
      end: endpointFor(to, connector.endBinding!.anchor, fc),
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

/**
 * connectorRoutePoints con cache. Doble key: identidad del ARRAY de elementos
 * (la ruta orthogonal depende de TODOS los obstaculos, no solo los endpoints)
 * + id del connector (NO identidad de objeto: el theme-resolve clona el
 * elemento por frame, el id es estable). Cualquier edicion produce array
 * nuevo via immer → invalida. Pan/zoom/hover no lo cambian → hit.
 */
const routeCacheByElements = new WeakMap<CanvasElement[], Map<string, Point[]>>()

export function getConnectorRoute(connector: ConnectorElement, elements: CanvasElement[]): Point[] {
  let byId = routeCacheByElements.get(elements)
  if (!byId) {
    byId = new Map()
    routeCacheByElements.set(elements, byId)
  }
  const hit = byId.get(connector.id)
  if (hit) return hit
  const route = connectorRoutePoints(connector, elements)
  byId.set(connector.id, route)
  return route
}

export function connectorRoutePoints(connector: ConnectorElement, elements: CanvasElement[]): Point[] {
  const resolved = resolveConnectorEndpoints(connector, elements)
  const manual = cleanWaypoints(connector.waypoints)

  if (connector.routing === 'orthogonal') {
    if (manual.length > 0) {
      return compactPath([resolved.start, ...manual, resolved.end])
    }
    return routeOrthogonalConnector(resolved.start, resolved.end, elements, resolved.from?.id, resolved.to?.id)
  }

  if (connector.routing === 'curved' && manual.length > 0) {
    return [resolved.start, manual[0], resolved.end]
  }

  return [resolved.start, resolved.end]
}

function cleanWaypoints(points: ConnectorElement['waypoints']): Point[] {
  if (!Array.isArray(points)) return []
  return points.filter((point): point is Point =>
    point != null &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y),
  )
}

function setStyle(ctx: CanvasRenderingContext2D, el: ConnectorElement | ArrowElement | LineElement): void {
  ctx.strokeStyle = el.strokeColor
  ctx.lineWidth = el.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.fillStyle = el.strokeColor
  switch (el.strokeStyle) {
    case 'dashed': ctx.setLineDash([el.strokeWidth * 4, el.strokeWidth * 3]); break
    case 'dotted': ctx.setLineDash([el.strokeWidth, el.strokeWidth * 2]); break
    default: ctx.setLineDash([])
  }
  ctx.globalAlpha = alphaValue(el.strokeOpacity ?? el.opacity ?? 1)
}

function alphaValue(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1))
}


export function renderConnector(el: ConnectorElement, opts: RenderConnectorOpts): void {
  const { ctx, elements, palette } = opts
  ctx.save()
  try {
  const resolved = resolveConnectorEndpoints(el, elements)
  const from = resolved.from
  const to = resolved.to
  const p1 = resolved.start
  const p2 = resolved.end
  const manual = cleanWaypoints(el.waypoints)

  setStyle(ctx, el)

  if (el.routing === 'curved') {
    if (manual.length > 0) {
      const control = manual[0]
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.quadraticCurveTo(control.x, control.y, p2.x, p2.y)
      ctx.stroke()
      if (el.endArrowhead !== 'none') {
        const angleEnd = Math.atan2(p2.y - control.y, p2.x - control.x) * 180 / Math.PI
        drawArrowhead(ctx, p2.x, p2.y, angleEnd, el.endArrowhead, el.strokeWidth)
      }
      if (el.startArrowhead && el.startArrowhead !== 'none') {
        const angleStart = Math.atan2(p1.y - control.y, p1.x - control.x) * 180 / Math.PI
        drawArrowhead(ctx, p1.x, p1.y, angleStart, el.startArrowhead, el.strokeWidth)
      }
      if (el.label) {
        const labelPoint = quadraticPoint(p1, control, p2, 0.5)
        drawConnectorLabel(ctx, el.label, labelPoint.x, labelPoint.y, palette)
      }
      return
    }

    if (from && to) {
      const fa = bboxFromElement(from)
      const ta = bboxFromElement(to)
      // Usamos perfect-arrows solo para el punto de control (la curvatura), pero
      // los endpoints son los del CONTORNO REAL (p1/p2), no las cajas.
      const arrow = getBoxToBoxArrow(
        fa.minX, fa.minY, fa.width, fa.height,
        ta.minX, ta.minY, ta.width, ta.height,
        { padStart: 0, padEnd: el.endArrowhead === 'none' ? 0 : 8 },
      )
      const cx = arrow[2]
      const cy = arrow[3]
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.quadraticCurveTo(cx, cy, p2.x, p2.y)
      ctx.stroke()
      if (el.endArrowhead !== 'none') {
        const angleEnd = Math.atan2(p2.y - cy, p2.x - cx) * 180 / Math.PI
        drawArrowhead(ctx, p2.x, p2.y, angleEnd, el.endArrowhead, el.strokeWidth)
      }
      if (el.startArrowhead && el.startArrowhead !== 'none') {
        const angleStart = Math.atan2(p1.y - cy, p1.x - cx) * 180 / Math.PI
        drawArrowhead(ctx, p1.x, p1.y, angleStart, el.startArrowhead, el.strokeWidth)
      }
      if (el.label) {
        const labelPoint = quadraticPoint(p1, { x: cx, y: cy }, p2, 0.5)
        drawConnectorLabel(ctx, el.label, labelPoint.x, labelPoint.y, palette)
      }
      return
    }
    // fallback curve
    const control = { x: (p1.x + p2.x) / 2, y: p1.y }
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.quadraticCurveTo(control.x, control.y, p2.x, p2.y)
    ctx.stroke()
    if (el.endArrowhead !== 'none') {
      const angleEnd = Math.atan2(p2.y - control.y, p2.x - control.x) * 180 / Math.PI
      drawArrowhead(ctx, p2.x, p2.y, angleEnd, el.endArrowhead, el.strokeWidth)
    }
    if (el.startArrowhead && el.startArrowhead !== 'none') {
      const angleStart = Math.atan2(p1.y - control.y, p1.x - control.x) * 180 / Math.PI
      drawArrowhead(ctx, p1.x, p1.y, angleStart, el.startArrowhead, el.strokeWidth)
    }
    if (el.label) {
      const labelPoint = quadraticPoint(p1, control, p2, 0.5)
      drawConnectorLabel(ctx, el.label, labelPoint.x, labelPoint.y, palette)
    }
    return
  }

  if (el.routing === 'orthogonal') {
    const path = getConnectorRoute(el, elements)
    ctx.beginPath()
    ctx.moveTo(path[0].x, path[0].y)
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
    ctx.stroke()
    if (path.length > 1 && el.endArrowhead !== 'none') {
      const a = path[path.length - 2]
      const b = path[path.length - 1]
      const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
      drawArrowhead(ctx, b.x, b.y, angle, el.endArrowhead, el.strokeWidth)
    }
    if (path.length > 1 && el.startArrowhead && el.startArrowhead !== 'none') {
      const a = path[1]
      const b = path[0]
      const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
      drawArrowhead(ctx, b.x, b.y, angle, el.startArrowhead, el.strokeWidth)
    }
    if (el.label) {
      const labelPoint = polylineMidpoint(path)
      drawConnectorLabel(ctx, el.label, labelPoint.x, labelPoint.y, palette)
    }
    return
  }

  // straight
  ctx.beginPath()
  ctx.moveTo(p1.x, p1.y)
  ctx.lineTo(p2.x, p2.y)
  ctx.stroke()
  if (el.endArrowhead !== 'none') {
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI
    drawArrowhead(ctx, p2.x, p2.y, angle, el.endArrowhead, el.strokeWidth)
  }
  if (el.startArrowhead && el.startArrowhead !== 'none') {
    const angle = Math.atan2(p1.y - p2.y, p1.x - p2.x) * 180 / Math.PI
    drawArrowhead(ctx, p1.x, p1.y, angle, el.startArrowhead, el.strokeWidth)
  }
  if (el.label) drawConnectorLabel(ctx, el.label, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, palette)
  } finally {
    ctx.restore()
  }
}

export function renderArrow(el: ArrowElement, opts: { ctx: CanvasRenderingContext2D }): void {
  const { ctx } = opts
  if (el.points.length < 2) return
  ctx.save()
  try {
  setStyle(ctx, el)
  ctx.beginPath()
  ctx.moveTo(el.x + el.points[0].x, el.y + el.points[0].y)
  for (let i = 1; i < el.points.length; i++) {
    ctx.lineTo(el.x + el.points[i].x, el.y + el.points[i].y)
  }
  ctx.stroke()
  const lastIdx = el.points.length - 1
  if (el.endArrowhead !== 'none') {
    const a = el.points[lastIdx - 1]
    const b = el.points[lastIdx]
    const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
    drawArrowhead(ctx, el.x + b.x, el.y + b.y, angle, el.endArrowhead, el.strokeWidth)
  }
  if (el.startArrowhead !== 'none') {
    const a = el.points[1]
    const b = el.points[0]
    const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
    drawArrowhead(ctx, el.x + b.x, el.y + b.y, angle, el.startArrowhead, el.strokeWidth)
  }
  } finally {
    ctx.restore()
  }
}

export function renderLine(el: LineElement, opts: { ctx: CanvasRenderingContext2D }): void {
  const { ctx } = opts
  if (el.points.length < 2) return
  ctx.save()
  try {
  setStyle(ctx, el)
  ctx.beginPath()
  ctx.moveTo(el.x + el.points[0].x, el.y + el.points[0].y)
  for (let i = 1; i < el.points.length; i++) {
    ctx.lineTo(el.x + el.points[i].x, el.y + el.points[i].y)
  }
  ctx.stroke()
  } finally {
    ctx.restore()
  }
}

export function routeOrthogonalConnector(
  p1: Point,
  p2: Point,
  elements: CanvasElement[],
  fromId?: string,
  toId?: string,
): Point[] {
  const obstacles = obstacleBoxes(elements, fromId, toId)
  const candidates = orthogonalRouteCandidates(p1, p2, obstacles)
  let best = candidates[0]
  let bestScore = routeScore(best, obstacles)

  for (let i = 1; i < candidates.length; i++) {
    const score = routeScore(candidates[i], obstacles)
    if (score < bestScore) {
      best = candidates[i]
      bestScore = score
    }
  }

  return compactPath(best)
}

function orthogonalRouteCandidates(p1: Point, p2: Point, obstacles: Box[]): Point[][] {
  // Simple L-shape: prefer vertical-then-horizontal if dy > dx
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const candidates: Point[][] = []

  if (almostEqual(p1.x, p2.x) || almostEqual(p1.y, p2.y)) {
    candidates.push([p1, p2])
  }

  if (Math.abs(dx) > Math.abs(dy)) {
    const mid = { x: p1.x + dx / 2, y: p1.y }
    const mid2 = { x: mid.x, y: p2.y }
    candidates.push([p1, mid, mid2, p2])
  } else {
    const mid = { x: p1.x, y: p1.y + dy / 2 }
    const mid2 = { x: p2.x, y: mid.y }
    candidates.push([p1, mid, mid2, p2])
  }

  const pad = 24
  const xs = new Set<number>([p1.x + dx / 2, p1.x, p2.x])
  const ys = new Set<number>([p1.y + dy / 2, p1.y, p2.y])
  for (const box of obstacles) {
    xs.add(box.minX - pad)
    xs.add(box.maxX + pad)
    ys.add(box.minY - pad)
    ys.add(box.maxY + pad)
  }

  for (const x of xs) {
    candidates.push([p1, { x, y: p1.y }, { x, y: p2.y }, p2])
  }
  for (const y of ys) {
    candidates.push([p1, { x: p1.x, y }, { x: p2.x, y }, p2])
  }

  return candidates
}

function obstacleBoxes(elements: CanvasElement[], fromId?: string, toId?: string): Box[] {
  const from = fromId ? elements.find(el => el.id === fromId) : null
  const to = toId ? elements.find(el => el.id === toId) : null
  const ignoredGroupIds = new Set(
    [from?.groupId, to?.groupId].filter((id): id is string => typeof id === 'string' && id.length > 0),
  )

  return elements
    .filter((el) => isConnectorObstacle(el, fromId, toId, ignoredGroupIds))
    .map((el) => {
      const box = bboxFromElement(el)
      const pad = 12
      return {
        minX: box.minX - pad,
        minY: box.minY - pad,
        maxX: box.maxX + pad,
        maxY: box.maxY + pad,
      }
    })
}

function isConnectorObstacle(el: CanvasElement, fromId?: string, toId?: string, ignoredGroupIds = new Set<string>()): boolean {
  if (el.hidden || el.id === fromId || el.id === toId) return false
  if (el.groupId && ignoredGroupIds.has(el.groupId)) return false
  if (isDecorativeConnectorObstacle(el)) return false
  switch (el.type) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'triangle':
    case 'chevron':
    case 'star':
    case 'polygon':
    case 'sticky':
    case 'image':
    case 'embed':
    case 'mermaid':
    case 'code':
    case 'table':
    case 'comment':
      return true
    default:
      return false
  }
}

function isDecorativeConnectorObstacle(el: CanvasElement): boolean {
  const box = bboxFromElement(el)
  const area = box.width * box.height
  if (box.width <= 16 || box.height <= 16) return true
  if (area >= 250_000) return true

  const opacity = alphaValue(el.opacity ?? 1)
  if (opacity <= 0.2) return true

  const strokeOpacity = 'strokeOpacity' in el && typeof el.strokeOpacity === 'number'
    ? alphaValue(el.strokeOpacity)
    : 1
  const fillOpacity = 'fillOpacity' in el && typeof el.fillOpacity === 'number'
    ? alphaValue(el.fillOpacity)
    : 1
  const strokeWidth = 'strokeWidth' in el ? Number(el.strokeWidth) || 0 : 0

  if (strokeOpacity <= 0.05 && strokeWidth <= 1) return true
  if (fillOpacity <= 0.12 && strokeOpacity <= 0.12) return true

  return false
}

function routeScore(path: Point[], obstacles: Box[]): number {
  let length = 0
  let hits = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    length += Math.hypot(b.x - a.x, b.y - a.y)
    for (const box of obstacles) {
      if (segmentIntersectsBox(a, b, box)) hits += 1
    }
  }

  const turns = Math.max(0, compactPath(path).length - 2)
  return hits * 1_000_000 + length + turns * 20
}

function segmentIntersectsBox(a: Point, b: Point, box: Box): boolean {
  if (a.x === b.x) {
    const x = a.x
    if (x < box.minX || x > box.maxX) return false
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)
    return maxY >= box.minY && minY <= box.maxY
  }

  if (a.y === b.y) {
    const y = a.y
    if (y < box.minY || y > box.maxY) return false
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    return maxX >= box.minX && minX <= box.maxX
  }

  return segmentIntersectsBox({ x: a.x, y: a.y }, { x: b.x, y: a.y }, box)
    || segmentIntersectsBox({ x: b.x, y: a.y }, { x: b.x, y: b.y }, box)
}

function compactPath(path: Point[]): Point[] {
  const deduped: Point[] = []
  for (const point of path) {
    const prev = deduped[deduped.length - 1]
    if (!prev || prev.x !== point.x || prev.y !== point.y) deduped.push(point)
  }

  const compacted: Point[] = []
  for (const point of deduped) {
    const a = compacted[compacted.length - 2]
    const b = compacted[compacted.length - 1]
    if (a && b && ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) {
      compacted[compacted.length - 1] = point
    } else {
      compacted.push(point)
    }
  }

  return compacted
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.5
}

function quadraticPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const inv = 1 - t
  return {
    x: inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
    y: inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y,
  }
}

function polylineMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]

  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }

  if (total === 0) return points[0]

  const target = total / 2
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]
    const to = points[i]
    const segment = Math.hypot(to.x - from.x, to.y - from.y)
    if (walked + segment >= target) {
      const t = (target - walked) / segment
      return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      }
    }
    walked += segment
  }

  return points[points.length - 1]
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  angleDeg: number,
  kind: ArrowHead,
  strokeWidth: number,
): void {
  if (kind === 'none') return
  const size = 6 + strokeWidth * 2
  const angle = (angleDeg * Math.PI) / 180
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.setLineDash([])
  ctx.beginPath()
  switch (kind) {
    case 'arrow':
      ctx.moveTo(0, 0)
      ctx.lineTo(-size, -size * 0.5)
      ctx.moveTo(0, 0)
      ctx.lineTo(-size, size * 0.5)
      ctx.stroke()
      break
    case 'triangle':
      ctx.moveTo(0, 0)
      ctx.lineTo(-size, -size * 0.5)
      ctx.lineTo(-size, size * 0.5)
      ctx.closePath()
      ctx.fill()
      break
    case 'diamond':
      ctx.moveTo(0, 0)
      ctx.lineTo(-size * 0.6, -size * 0.5)
      ctx.lineTo(-size * 1.2, 0)
      ctx.lineTo(-size * 0.6, size * 0.5)
      ctx.closePath()
      ctx.fill()
      break
    case 'circle':
      ctx.arc(-size * 0.5, 0, size * 0.4, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'bar':
      ctx.moveTo(0, -size * 0.5)
      ctx.lineTo(0, size * 0.5)
      ctx.stroke()
      break
  }
  ctx.restore()
}

function drawConnectorLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, palette?: CanvasPalette): void {
  ctx.save()
  ctx.setLineDash([])
  ctx.font = '500 11px Inter, system-ui, sans-serif'
  const metrics = ctx.measureText(text)
  const w = metrics.width + 12
  const h = 17
  const darkCanvas = palette?.canvasBg ? isDarkColor(palette.canvasBg) : true
  ctx.fillStyle = darkCanvas ? 'rgba(9, 9, 11, 0.72)' : 'rgba(255, 255, 255, 0.88)'
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 5)
    ctx.fill()
  } else {
    ctx.fillRect(x - w / 2, y - h / 2, w, h)
  }
  ctx.strokeStyle = darkCanvas ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.10)'
  ctx.lineWidth = 0.75
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 5)
    ctx.stroke()
  } else {
    ctx.strokeRect(x - w / 2, y - h / 2, w, h)
  }
  ctx.fillStyle = darkCanvas ? 'rgba(255, 255, 255, 0.86)' : '#3f3f46'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
  ctx.restore()
}

function isDarkColor(value: string): boolean {
  const hex = value.trim()
  if (!hex.startsWith('#')) return true
  const normalized = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex
  const numeric = Number.parseInt(normalized.slice(1, 7), 16)
  if (!Number.isFinite(numeric)) return true
  const r = (numeric >> 16) & 255
  const g = (numeric >> 8) & 255
  const b = numeric & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128
}
