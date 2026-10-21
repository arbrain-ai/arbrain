/**
 * Freedraw rendering — variable-width outline fill (perfect-freehand).
 *
 * El trazo se rellena como un poligono de contorno continuo (sin banding de
 * segmentos). El Path2D se cachea por identidad del array de puntos: mover el
 * elemento (x/y) no invalida el cache; editar los puntos si.
 */
import type { FreedrawElement, HighlighterElement } from '../../elements/types'
import {
  FREEDRAW_SIZE_FACTOR,
  FREEDRAW_STREAMLINE,
  FREEDRAW_THINNING,
  HIGHLIGHTER_STREAMLINE,
  HIGHLIGHTER_THINNING,
  freehandOutlinePath,
  type FreehandOutlinePoint,
} from './freehand-outline'

export interface RenderFreedrawOpts {
  ctx: CanvasRenderingContext2D
}

export {
  FREEDRAW_SIZE_FACTOR,
  FREEDRAW_STREAMLINE,
  FREEDRAW_THINNING,
  HIGHLIGHTER_STREAMLINE,
  HIGHLIGHTER_THINNING,
}

interface CachedOutline {
  size: number
  thinning: number
  smoothing: number
  streamline: number
  path: Path2D | null
}

const outlineCache = new WeakMap<object, CachedOutline>()

export function freehandElementPath(
  points: ReadonlyArray<FreehandOutlinePoint>,
  opts: { size: number; thinning: number; smoothing: number; streamline: number },
): Path2D | null {
  const cached = outlineCache.get(points as object)
  if (
    cached &&
    cached.size === opts.size &&
    cached.thinning === opts.thinning &&
    cached.smoothing === opts.smoothing &&
    cached.streamline === opts.streamline
  ) {
    return cached.path
  }
  const path = freehandOutlinePath(points, {
    size: opts.size,
    thinning: opts.thinning,
    smoothing: opts.smoothing,
    streamline: opts.streamline,
  })
  outlineCache.set(points as object, { size: opts.size, thinning: opts.thinning, smoothing: opts.smoothing, streamline: opts.streamline, path })
  return path
}

export function renderFreedraw(el: FreedrawElement, opts: RenderFreedrawOpts): void {
  const { ctx } = opts
  if (el.points.length < 2) return
  const path = freehandElementPath(el.points, {
    size: Math.max(0.5, el.strokeWidth) * FREEDRAW_SIZE_FACTOR,
    thinning: el.thinning ?? FREEDRAW_THINNING,
    smoothing: el.smoothing ?? 0.5,
    streamline: FREEDRAW_STREAMLINE,
  })
  if (!path) return
  ctx.save()
  ctx.translate(el.x, el.y)
  ctx.fillStyle = el.strokeColor
  ctx.globalAlpha = alphaValue(el.strokeOpacity ?? el.opacity ?? 1)
  ctx.fill(path)
  ctx.restore()
}

export function renderHighlighter(el: HighlighterElement, opts: { ctx: CanvasRenderingContext2D }): void {
  const { ctx } = opts
  if (el.points.length < 2) return
  const path = freehandElementPath(el.points, {
    size: Math.max(0.5, el.strokeWidth),
    thinning: el.thinning ?? HIGHLIGHTER_THINNING,
    smoothing: el.smoothing ?? 0.5,
    streamline: HIGHLIGHTER_STREAMLINE,
  })
  if (!path) return
  ctx.save()
  ctx.translate(el.x, el.y)
  ctx.fillStyle = el.color
  ctx.globalAlpha = alphaValue(el.strokeOpacity ?? 0.3)
  ctx.fill(path)
  ctx.restore()
}

function alphaValue(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1))
}
