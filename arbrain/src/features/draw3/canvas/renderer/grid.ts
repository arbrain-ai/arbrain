/**
 * Grid background rendering. Dots or lines, theme-aware.
 */
import type { Camera } from '../../elements/types'
import type { CanvasPalette } from '../../theme/tokens'

export interface RenderGridOpts {
  ctx: CanvasRenderingContext2D
  palette: CanvasPalette
  viewport: { width: number; height: number }
  camera: Camera
  gridSize: number
  style: 'none' | 'lines' | 'dots'
}

export function renderGrid(opts: RenderGridOpts): void {
  const { ctx, palette, viewport, camera, gridSize, style } = opts
  if (style === 'none' || gridSize <= 0) return

  ctx.save()

  // Compute world bounds visible
  const halfW = (viewport.width / 2) / camera.zoom
  const halfH = (viewport.height / 2) / camera.zoom
  const worldMinX = camera.x - halfW
  const worldMaxX = camera.x + halfW
  const worldMinY = camera.y - halfH
  const worldMaxY = camera.y + halfH

  // Pick a sensible step based on zoom
  let step = gridSize
  while (step * camera.zoom < 8) step *= 2
  while (step * camera.zoom > 60) step /= 2

  const startX = Math.floor(worldMinX / step) * step
  const startY = Math.floor(worldMinY / step) * step

  if (style === 'lines') {
    ctx.strokeStyle = palette.gridLine
    ctx.lineWidth = 1 / camera.zoom
    ctx.beginPath()
    for (let x = startX; x <= worldMaxX; x += step) {
      ctx.moveTo(x, worldMinY)
      ctx.lineTo(x, worldMaxY)
    }
    for (let y = startY; y <= worldMaxY; y += step) {
      ctx.moveTo(worldMinX, y)
      ctx.lineTo(worldMaxX, y)
    }
    ctx.stroke()
  } else {
    // dots
    ctx.fillStyle = palette.gridDot
    const r = 1 / camera.zoom
    for (let x = startX; x <= worldMaxX; x += step) {
      for (let y = startY; y <= worldMaxY; y += step) {
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
    }
  }
  ctx.restore()
}
