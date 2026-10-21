/**
 * Shape rendering onto Canvas 2D context. Coords are in WORLD space.
 */
import type {
  ShapeBase,
  RectangleElement,
  EllipseElement,
  DiamondElement,
  TriangleElement,
  ChevronElement,
  StarElement,
  PolygonElement,
  CanvasElement,
} from '../../elements/types'

export interface RenderShapeOpts {
  ctx: CanvasRenderingContext2D
}

function setShapeStyle(ctx: CanvasRenderingContext2D, el: ShapeBase): void {
  ctx.strokeStyle = el.strokeColor
  ctx.lineWidth = el.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  switch (el.strokeStyle) {
    case 'dashed': ctx.setLineDash([el.strokeWidth * 4, el.strokeWidth * 3]); break
    case 'dotted': ctx.setLineDash([el.strokeWidth, el.strokeWidth * 2]); break
    default: ctx.setLineDash([])
  }
}

function fillIfNeeded(ctx: CanvasRenderingContext2D, el: ShapeBase): void {
  if (!el.fillColor || el.fillColor === 'transparent') return
  ctx.globalAlpha = alphaValue(el.fillOpacity ?? el.opacity ?? 1)
  ctx.fillStyle = el.fillColor
  ctx.fill()
}

function strokeShape(ctx: CanvasRenderingContext2D, el: ShapeBase): void {
  ctx.globalAlpha = alphaValue(el.strokeOpacity ?? el.opacity ?? 1)
  ctx.stroke()
}

function alphaValue(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1))
}

function applyTransform(ctx: CanvasRenderingContext2D, el: CanvasElement, fn: () => void) {
  ctx.save()
  const sx = el.flipX ? -1 : 1
  const sy = el.flipY ? -1 : 1
  if (!el.rotation && sx === 1 && sy === 1) {
    fn()
    ctx.restore()
    return
  }
  const cx = el.x + el.width / 2
  const cy = el.y + el.height / 2
  ctx.translate(cx, cy)
  if (el.rotation) ctx.rotate(el.rotation)
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy)
  ctx.translate(-cx, -cy)
  fn()
  ctx.restore()
}

export function renderRectangle(el: RectangleElement, opts: RenderShapeOpts): void {
  const { ctx } = opts
  applyTransform(ctx, el, () => {
    setShapeStyle(ctx, el)
    const r = Math.min(el.cornerRadius, el.width / 2, el.height / 2)
    ctx.beginPath()
    if (r > 0 && typeof ctx.roundRect === 'function') {
      ctx.roundRect(el.x, el.y, el.width, el.height, r)
    } else {
      ctx.rect(el.x, el.y, el.width, el.height)
    }
    fillIfNeeded(ctx, el)
    strokeShape(ctx, el)
  })
}

export function renderEllipse(el: EllipseElement, opts: RenderShapeOpts): void {
  const { ctx } = opts
  applyTransform(ctx, el, () => {
    setShapeStyle(ctx, el)
    const cx = el.x + el.width / 2
    const cy = el.y + el.height / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, el.width / 2, el.height / 2, 0, 0, Math.PI * 2)
    fillIfNeeded(ctx, el)
    strokeShape(ctx, el)
  })
}

export function renderDiamond(el: DiamondElement, opts: RenderShapeOpts): void {
  const { ctx } = opts
  applyTransform(ctx, el, () => {
    setShapeStyle(ctx, el)
    const cx = el.x + el.width / 2
    const cy = el.y + el.height / 2
    ctx.beginPath()
    ctx.moveTo(cx, el.y)
    ctx.lineTo(el.x + el.width, cy)
    ctx.lineTo(cx, el.y + el.height)
    ctx.lineTo(el.x, cy)
    ctx.closePath()
    fillIfNeeded(ctx, el)
    strokeShape(ctx, el)
  })
}

export function renderTriangle(el: TriangleElement, opts: RenderShapeOpts): void {
  const { ctx } = opts
  applyTransform(ctx, el, () => {
    setShapeStyle(ctx, el)
    const cx = el.x + el.width / 2
    ctx.beginPath()
    ctx.moveTo(cx, el.y)
    ctx.lineTo(el.x + el.width, el.y + el.height)
    ctx.lineTo(el.x, el.y + el.height)
    ctx.closePath()
    fillIfNeeded(ctx, el)
    strokeShape(ctx, el)
  })
}

export function renderChevron(el: ChevronElement, opts: RenderShapeOpts): void {
  const { ctx } = opts
  applyTransform(ctx, el, () => {
    setShapeStyle(ctx, el)
    const notch = Math.max(0, Math.min(0.45, el.notchRatio ?? 0.16)) * el.width
    const pointStart = Math.max(0.45, Math.min(0.96, el.pointRatio ?? 0.84)) * el.width
    const midY = el.y + el.height / 2
    ctx.beginPath()
    ctx.moveTo(el.x, el.y)
    ctx.lineTo(el.x + pointStart, el.y)
    ctx.lineTo(el.x + el.width, midY)
    ctx.lineTo(el.x + pointStart, el.y + el.height)
    ctx.lineTo(el.x, el.y + el.height)
    ctx.lineTo(el.x + notch, midY)
    ctx.closePath()
    fillIfNeeded(ctx, el)
    strokeShape(ctx, el)
  })
}

export function renderStar(el: StarElement, opts: RenderShapeOpts): void {
  const { ctx } = opts
  applyTransform(ctx, el, () => {
    setShapeStyle(ctx, el)
    const cx = el.x + el.width / 2
    const cy = el.y + el.height / 2
    const ro = Math.min(el.width, el.height) / 2
    const ri = ro * el.innerRadius
    const n = el.points * 2
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      const r = i % 2 === 0 ? ro : ri
      const px = cx + Math.cos(angle) * r
      const py = cy + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    fillIfNeeded(ctx, el)
    strokeShape(ctx, el)
  })
}

export function renderPolygon(el: PolygonElement, opts: RenderShapeOpts): void {
  const { ctx } = opts
  applyTransform(ctx, el, () => {
    setShapeStyle(ctx, el)
    const cx = el.x + el.width / 2
    const cy = el.y + el.height / 2
    const r = Math.min(el.width, el.height) / 2
    ctx.beginPath()
    for (let i = 0; i < el.sides; i++) {
      const angle = (i / el.sides) * Math.PI * 2 - Math.PI / 2
      const px = cx + Math.cos(angle) * r
      const py = cy + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    fillIfNeeded(ctx, el)
    strokeShape(ctx, el)
  })
}
