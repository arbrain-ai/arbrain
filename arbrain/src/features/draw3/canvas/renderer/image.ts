/**
 * Image rendering — async load with cache.
 *
 * Returns a "ready" flag; if false, caller should draw a placeholder and trigger a re-render
 * when the image loads.
 */
import type { ImageElement } from '../../elements/types'

const imageCache = new Map<string, HTMLImageElement>()
const inflight = new Set<string>()

export interface RenderImageOpts {
  ctx: CanvasRenderingContext2D
  onLoad?: () => void
}

export function renderImage(el: ImageElement, opts: RenderImageOpts): boolean {
  const { ctx } = opts
  const url = el.url
  if (!url) {
    drawPlaceholder(ctx, el, 'missing url')
    return false
  }

  let img = imageCache.get(url)
  if (!img) {
    img = new Image()
    img.crossOrigin = 'anonymous'
    if (!inflight.has(url)) {
      inflight.add(url)
      img.onload = () => {
        inflight.delete(url)
        imageCache.set(url, img!)
        opts.onLoad?.()
      }
      img.onerror = () => {
        inflight.delete(url)
      }
      img.src = url
    }
    drawPlaceholder(ctx, el, 'loading…')
    return false
  }
  if (!img.complete || img.naturalWidth === 0) {
    drawPlaceholder(ctx, el, 'loading…')
    return false
  }

  ctx.save()
  applyRotation(ctx, el)
  ctx.globalAlpha = el.opacity ?? 1
  if (el.filter === 'grayscale') ctx.filter = 'grayscale(1)'
  else if (el.filter === 'blur') ctx.filter = 'blur(4px)'
  else if (el.filter === 'sepia') ctx.filter = 'sepia(1)'

  ctx.drawImage(img, el.x, el.y, el.width, el.height)
  ctx.restore()
  return true
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, el: ImageElement, label: string) {
  ctx.save()
  applyRotation(ctx, el)
  ctx.strokeStyle = '#888'
  ctx.setLineDash([4, 4])
  ctx.lineWidth = 1
  ctx.strokeRect(el.x, el.y, el.width, el.height)
  ctx.setLineDash([])
  ctx.fillStyle = '#888'
  ctx.font = '12px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, el.x + el.width / 2, el.y + el.height / 2)
  ctx.restore()
}

function applyRotation(ctx: CanvasRenderingContext2D, el: ImageElement): void {
  const sx = el.flipX ? -1 : 1
  const sy = el.flipY ? -1 : 1
  if (!el.rotation && sx === 1 && sy === 1) return
  const cx = el.x + el.width / 2
  const cy = el.y + el.height / 2
  ctx.translate(cx, cy)
  if (el.rotation) ctx.rotate(el.rotation)
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy)
  ctx.translate(-cx, -cy)
}
