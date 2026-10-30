/**
 * Render selection outlines + 8 resize handles + rotation handle.
 *
 * Fix for v2 bug: rotation handle was floating disconnected.
 * Here we render handles from the bbox computed at render time, in world coords,
 * so they always align with the element.
 */
import type { CanvasElement, ConnectorElement } from '../../elements/types'
import { bboxFromElement, bboxUnion, elementDisplayBBox } from '../../elements/types'
import { canRotateElement, getHandles, selectionCornerPoints } from '../hit/hit-test'
import { getConnectorRoute } from './connectors'
import type { CanvasPalette } from '../../theme/tokens'

interface RenderSelectionOpts {
  ctx: CanvasRenderingContext2D
  palette: CanvasPalette
  zoom: number
}

const HANDLE_SIZE = 10

export function renderSelection(
  ctx: CanvasRenderingContext2D,
  selected: CanvasElement[],
  palette: CanvasPalette,
  zoom: number,
  elements: CanvasElement[] = selected,
): void {
  if (selected.length === 0) return

  ctx.save()
  ctx.setLineDash([])
  ctx.lineWidth = 1.5 / zoom
  ctx.strokeStyle = palette.selectionStroke
  ctx.fillStyle = palette.selectionFill

  const isSingleGroup = selected.length === 1 && selected[0].type === 'group'

  if (selected.length === 1 && !isSingleGroup) {
    const el = selected[0]
    if (el.type === 'connector') {
      renderConnectorSelection(ctx, el, elements, palette, zoom)
      ctx.restore()
      return
    }

    const handles = getHandles(el, zoom)
    const s = HANDLE_SIZE / zoom

    // Miro-style oriented selection box for a single element.
    ctx.beginPath()
    ctx.moveTo(handles.nw.x, handles.nw.y)
    ctx.lineTo(handles.ne.x, handles.ne.y)
    ctx.lineTo(handles.se.x, handles.se.y)
    ctx.lineTo(handles.sw.x, handles.sw.y)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = palette.handleFill
    ctx.strokeStyle = palette.handleStroke
    ctx.lineWidth = 1.5 / zoom

    for (const [name, hp] of Object.entries(handles)) {
      const pt = hp as { x: number; y: number }
      if (name === 'rotation') continue
      ctx.beginPath()
      ctx.rect(pt.x - s / 2, pt.y - s / 2, s, s)
      ctx.fill()
      ctx.stroke()
    }

    if (canRotateElement(el)) {
      // Thin leader line so the floating handle reads as attached to the shape.
      ctx.save()
      ctx.strokeStyle = palette.selectionStroke
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 1.25 / zoom
      ctx.beginPath()
      ctx.moveTo(handles.sw.x, handles.sw.y)
      ctx.lineTo(handles.rotation.x, handles.rotation.y)
      ctx.stroke()
      ctx.restore()
      drawRotationHandle(ctx, handles.rotation, palette, zoom)
    }
  } else {
    // Multi-seleccion y grupos: union box + 4 corner handles (estilo Miro)
    // para escalar toda la seleccion proporcionalmente desde una esquina.
    const boxes = selected.map(el => elementDisplayBBox(el, elements))
    const union = bboxUnion(boxes)
    if (!union) {
      ctx.restore()
      return
    }
    ctx.beginPath()
    ctx.rect(union.minX, union.minY, union.width, union.height)
    ctx.fill()
    ctx.stroke()

    const s = HANDLE_SIZE / zoom
    ctx.fillStyle = palette.handleFill
    ctx.strokeStyle = palette.handleStroke
    ctx.lineWidth = 1.5 / zoom
    for (const point of Object.values(selectionCornerPoints(union))) {
      ctx.beginPath()
      ctx.rect(point.x - s / 2, point.y - s / 2, s, s)
      ctx.fill()
      ctx.stroke()
    }

    // Edge handles (mid-side) para resize de un solo lado (accordion).
    const cx = (union.minX + union.maxX) / 2
    const cy = (union.minY + union.maxY) / 2
    const edgePoints = [
      { x: cx, y: union.minY },
      { x: cx, y: union.maxY },
      { x: union.minX, y: cy },
      { x: union.maxX, y: cy },
    ]
    for (const point of edgePoints) {
      ctx.beginPath()
      ctx.rect(point.x - s / 2, point.y - s / 2, s, s)
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.restore()
}

function renderConnectorSelection(
  ctx: CanvasRenderingContext2D,
  connector: ConnectorElement,
  elements: CanvasElement[],
  palette: CanvasPalette,
  zoom: number,
): void {
  const points = getConnectorRoute(connector, elements)
  if (points.length < 2) return

  ctx.save()
  ctx.setLineDash([])
  ctx.strokeStyle = palette.selectionStroke
  ctx.lineWidth = 2 / zoom
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
  ctx.stroke()

  const vertexSize = 6 / zoom
  const segmentSize = 9 / zoom

  for (let i = 1; i < points.length - 1; i++) {
    drawConnectorHandle(ctx, points[i], vertexSize, palette.handleFill, palette.handleStroke, zoom)
  }

  for (let i = 0; i < points.length - 1; i++) {
    const midpoint = {
      x: (points[i].x + points[i + 1].x) / 2,
      y: (points[i].y + points[i + 1].y) / 2,
    }
    drawConnectorHandle(ctx, midpoint, segmentSize, palette.uiBg, palette.selectionStroke, zoom)
  }

  ctx.restore()
}

function drawConnectorHandle(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  size: number,
  fill: string,
  stroke: string,
  zoom: number,
): void {
  ctx.beginPath()
  ctx.arc(point.x, point.y, size, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.5 / zoom
  ctx.fill()
  ctx.stroke()
}

function drawRotationHandle(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  palette: CanvasPalette,
  zoom: number,
): void {
  const badgeRadius = 13.5 / zoom
  const arcRadius = 6.4 / zoom
  const arrowSize = 4.1 / zoom
  const startAngle = Math.PI * 0.18
  const endAngle = Math.PI * 1.55

  ctx.save()
  ctx.translate(point.x, point.y)
  ctx.shadowColor = 'rgba(15, 23, 42, 0.18)'
  ctx.shadowBlur = 8 / zoom
  ctx.shadowOffsetY = 2 / zoom
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = 'rgba(17, 24, 39, 0.16)'
  ctx.lineWidth = 1 / zoom

  // White circular badge like Miro. The border keeps it visible on white boards.
  ctx.beginPath()
  ctx.arc(0, 0, badgeRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.stroke()

  ctx.strokeStyle = palette.selectionStroke
  ctx.lineWidth = 2.1 / zoom
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  ctx.arc(0, 0, arcRadius, startAngle, endAngle, false)
  ctx.stroke()

  const tipX = Math.cos(endAngle) * arcRadius
  const tipY = Math.sin(endAngle) * arcRadius
  const tangent = endAngle + Math.PI / 2
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(
    tipX - Math.cos(tangent - Math.PI * 0.72) * arrowSize,
    tipY - Math.sin(tangent - Math.PI * 0.72) * arrowSize,
  )
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(
    tipX - Math.cos(tangent + Math.PI * 0.72) * arrowSize,
    tipY - Math.sin(tangent + Math.PI * 0.72) * arrowSize,
  )
  ctx.stroke()
  ctx.restore()
}

/**
 * Render a remote user's selection box (semi-transparent with their color).
 */
function renderRemoteSelection(
  ctx: CanvasRenderingContext2D,
  selectedBox: { minX: number; minY: number; maxX: number; maxY: number },
  color: string,
  zoom: number,
): void {
  ctx.save()
  ctx.setLineDash([])
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5 / zoom
  ctx.fillStyle = color + '20' // 12% alpha
  ctx.beginPath()
  ctx.rect(selectedBox.minX, selectedBox.minY, selectedBox.maxX - selectedBox.minX, selectedBox.maxY - selectedBox.minY)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/**
 * Box select preview while dragging.
 */
export function renderSelectionBox(
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  current: { x: number; y: number },
  palette: CanvasPalette,
  zoom: number,
): void {
  ctx.save()
  ctx.setLineDash([4 / zoom, 4 / zoom])
  ctx.strokeStyle = palette.selectionStroke
  ctx.fillStyle = palette.selectionFill
  ctx.lineWidth = 1 / zoom
  const x = Math.min(start.x, current.x)
  const y = Math.min(start.y, current.y)
  const w = Math.abs(current.x - start.x)
  const h = Math.abs(current.y - start.y)
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
