/**
 * Frame rendering — Miro-style sections with title bar + clip rect for children.
 *
 * Frames are drawn FIRST (low zIndex). Children are drawn after, clipped to frame
 * if clipChildren=true.
 */
import type { FrameElement, GroupElement } from '../../elements/types'
import type { CanvasPalette } from '../../theme/tokens'

export interface RenderFrameOpts {
  ctx: CanvasRenderingContext2D
  palette: CanvasPalette
  selected: boolean
}

const TITLE_HEIGHT = 28
const TITLE_FONT = 'bold 13px system-ui, sans-serif'

export function renderFrame(el: FrameElement, opts: RenderFrameOpts): void {
  const { ctx, palette } = opts
  // "Ocultar marco" — skip chrome but keep children visible (children render
  // separately in the engine loop). When selected, show a faint dashed outline
  // so the user can still find it.
  if (el.invisible) {
    if (opts.selected) {
      ctx.save()
      ctx.strokeStyle = palette.selectionStroke
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.globalAlpha = 0.6
      ctx.strokeRect(el.x, el.y, el.width, el.height)
      ctx.restore()
    }
    return
  }
  const colors = palette.frameColors[el.color] ?? palette.frameColors.violet
  ctx.save()
  ctx.globalAlpha = el.opacity ?? 1

  // Title bar
  ctx.fillStyle = colors.border
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(el.x, el.y - TITLE_HEIGHT, el.width, TITLE_HEIGHT, [6, 6, 0, 0])
    ctx.fill()
  } else {
    ctx.fillRect(el.x, el.y - TITLE_HEIGHT, el.width, TITLE_HEIGHT)
  }

  // Title text
  ctx.fillStyle = '#ffffff'
  ctx.font = TITLE_FONT
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(el.title, el.x + 12, el.y - TITLE_HEIGHT / 2, el.width - 24)

  // Body fill + border
  ctx.fillStyle = colors.bg
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1.5
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(el.x, el.y, el.width, el.height, [0, 0, 6, 6])
  } else {
    ctx.rect(el.x, el.y, el.width, el.height)
  }
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

export function renderGroup(_el: GroupElement, _opts: RenderFrameOpts): void {
  // Los groups son contenedores logicos invisibles (estilo Miro). Su chrome de
  // seleccion (union box + corner handles) lo pinta renderSelection; dibujar
  // algo aqui duplicaba el overlay y parecia un "elemento fantasma" borrable.
}

function clipToFrame(
  ctx: CanvasRenderingContext2D,
  frame: FrameElement,
  draw: () => void,
): void {
  if (!frame.clipChildren) {
    draw()
    return
  }
  ctx.save()
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(frame.x, frame.y, frame.width, frame.height, [0, 0, 6, 6])
  } else {
    ctx.rect(frame.x, frame.y, frame.width, frame.height)
  }
  ctx.clip()
  draw()
  ctx.restore()
}
