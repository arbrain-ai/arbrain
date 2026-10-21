import type { CanvasElement } from './types'

type ShapeLike = Pick<CanvasElement, 'type' | 'x' | 'y' | 'width' | 'height'> & {
  notchRatio?: number
  pointRatio?: number
}

export function shapeTextBox(shape: ShapeLike) {
  const basePadX = Math.min(18, Math.max(8, shape.width * 0.08))
  const basePadY = Math.min(14, Math.max(8, shape.height * 0.12))
  let left = basePadX
  let right = basePadX
  let top = basePadY
  let bottom = basePadY

  if (shape.type === 'chevron') {
    const notch = clamp(shape.notchRatio ?? 0.16, 0, 0.45) * shape.width
    const pointTail = (1 - clamp(shape.pointRatio ?? 0.84, 0.45, 0.96)) * shape.width
    const sideSafety = Math.min(28, Math.max(10, shape.width * 0.045))
    left = Math.max(basePadX, notch + sideSafety)
    right = Math.max(basePadX, pointTail + sideSafety)
    top = Math.max(basePadY, Math.min(24, shape.height * 0.1))
    bottom = top
  } else if (shape.type === 'diamond') {
    left = right = Math.max(basePadX, shape.width * 0.24)
    top = bottom = Math.max(basePadY, shape.height * 0.2)
  } else if (shape.type === 'triangle') {
    left = right = Math.max(basePadX, shape.width * 0.18)
    top = Math.max(basePadY, shape.height * 0.22)
    bottom = Math.max(basePadY, shape.height * 0.1)
  } else if (shape.type === 'star' || shape.type === 'polygon') {
    left = right = Math.max(basePadX, shape.width * 0.16)
    top = bottom = Math.max(basePadY, shape.height * 0.16)
  }

  const horizontal = capInsets(left, right, shape.width, Math.min(40, Math.max(12, shape.width * 0.5)))
  const vertical = capInsets(top, bottom, shape.height, Math.min(24, Math.max(10, shape.height * 0.45)))

  return {
    x: shape.x + horizontal.start,
    y: shape.y + vertical.start,
    width: Math.max(8, shape.width - horizontal.start - horizontal.end),
    height: Math.max(8, shape.height - vertical.start - vertical.end),
  }
}

function capInsets(start: number, end: number, size: number, minInner: number) {
  const maxInset = Math.max(0, size - minInner)
  const total = start + end
  if (total <= maxInset || total === 0) return { start, end }
  const scale = maxInset / total
  return { start: start * scale, end: end * scale }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}
