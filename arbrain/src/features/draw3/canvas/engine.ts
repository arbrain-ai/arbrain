/**
 * Render engine — RAF loop with dirty flag.
 *
 * Renders the canvas state through the camera transform. Dispatches per-element
 * draw functions from the renderer/* modules.
 */
import type {
  CanvasElement,
  Camera,
  RectangleElement,
  EllipseElement,
  DiamondElement,
  TriangleElement,
  ChevronElement,
  StarElement,
  PolygonElement,
  TextElement,
  StickyElement,
  ImageElement,
  FreedrawElement,
  HighlighterElement,
  ConnectorElement,
  ArrowElement,
  LineElement,
  FrameElement,
  GroupElement,
  MermaidElement,
  CodeElement,
  TableElement,
  EmbedElement,
  CommentElement,
} from '../elements/types'
import { isContainer } from '../elements/types'
import {
  renderRectangle,
  renderEllipse,
  renderDiamond,
  renderTriangle,
  renderChevron,
  renderStar,
  renderPolygon,
} from './renderer/shapes'
import { renderText, renderSticky } from './renderer/text'
import { renderFrame, renderGroup } from './renderer/frames'
import { renderImage } from './renderer/image'
import { renderFreedraw, renderHighlighter } from './renderer/freedraw'
import { renderConnector, renderArrow, renderLine } from './renderer/connectors'
import { renderSelection, renderSelectionBox } from './renderer/selection'
import { renderGrid } from './renderer/grid'
import type { CanvasPalette } from '../theme/tokens'
import { getSortedByZ, resolveElementColorsCached } from './perf-cache'
import { visibleElements } from './viewport'

export interface EngineState {
  elements: CanvasElement[]
  camera: Camera
  selectedIds: Set<string>
  hoveredId: string | null
  editingId: string | null
  palette: CanvasPalette
  viewport: { width: number; height: number; dpr: number }
  gridStyle: 'none' | 'lines' | 'dots'
  gridSize: number
  onImageLoad?: () => void
  // Active drag/select preview
  selectionBox?: { start: { x: number; y: number }; current: { x: number; y: number } } | null
  // Embed VIVO actualmente en modo interacción (su ventana se marca en oro)
  activeEmbedId?: string | null
}

/**
 * Kill switch del viewport culling: `localStorage.setItem('draw3:no-cull','1')`
 * + reload apaga el culling en runtime sin deploy (por si un elemento
 * desapareciera de pantalla por un bbox mal derivado).
 */
const CULLING_ENABLED = (() => {
  try {
    return typeof window === 'undefined' || window.localStorage?.getItem('draw3:no-cull') !== '1'
  } catch {
    return true
  }
})()

export function render(canvas: HTMLCanvasElement, state: EngineState): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { camera, viewport, palette } = state
  const dpr = viewport.dpr

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)

  ctx.fillStyle = palette.canvasBg
  ctx.fillRect(0, 0, viewport.width, viewport.height)

  ctx.translate(viewport.width / 2, viewport.height / 2)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.translate(-camera.x, -camera.y)

  renderGrid({
    ctx,
    palette,
    viewport,
    camera,
    gridSize: state.gridSize,
    style: state.gridStyle,
  })

  const sorted = getSortedByZ(state.elements)
  // Margen en world units: 200 de base + componente de espacio de PANTALLA
  // (titulos de frame, sombras de sticky ~48px) convertido a world. A zoom
  // bajo el overhead de pantalla domina; sin este termino, los titulos
  // poparian al entrar al viewport.
  const margin = 200 + 64 / Math.max(camera.zoom, 0.01)
  const visible = CULLING_ENABLED
    ? visibleElements(sorted, camera, viewport, margin)
    : sorted
  for (const el of visible) {
    if (el.hidden) continue
    drawElementWithCtx(el, ctx, state)
    if (el.href) renderHrefBadge(el, ctx, camera.zoom)
  }

  // La seleccion NO se culea: un elemento seleccionado fuera de pantalla
  // sigue contribuyendo al selection box que si asoma en el viewport.
  const selected = sorted.filter(e => state.selectedIds.has(e.id))
  renderSelection(ctx, selected, palette, camera.zoom, state.elements)

  if (state.selectionBox) {
    renderSelectionBox(ctx, state.selectionBox.start, state.selectionBox.current, palette, camera.zoom)
  }
}

function drawElementWithCtx(rawEl: CanvasElement, ctx: CanvasRenderingContext2D, state: EngineState): void {
  // Resolve theme-aware colors (semantic roles + auto-default white) once, here.
  // Memoizado: mismo elemento + misma paleta → mismo objeto (estabiliza la
  // identidad para el cache de layout de texto y evita un clon por frame).
  const el = resolveElementColorsCached(rawEl, state.palette)
  switch (el.type) {
    case 'rectangle': renderRectangle(el as RectangleElement, { ctx }); break
    case 'ellipse':   renderEllipse(el as EllipseElement,   { ctx }); break
    case 'diamond':   renderDiamond(el as DiamondElement,   { ctx }); break
    case 'triangle':  renderTriangle(el as TriangleElement, { ctx }); break
    case 'chevron':   renderChevron(el as ChevronElement,   { ctx }); break
    case 'star':      renderStar(el as StarElement,         { ctx }); break
    case 'polygon':   renderPolygon(el as PolygonElement,   { ctx }); break

    case 'text':      renderText(el as TextElement, { ctx, palette: state.palette, editingId: state.editingId, elements: state.elements }); break
    case 'sticky':    renderSticky(el as StickyElement, { ctx, palette: state.palette, editingId: state.editingId }); break

    case 'freedraw':  renderFreedraw(el as FreedrawElement, { ctx }); break
    case 'highlighter': renderHighlighter(el as HighlighterElement, { ctx }); break

    case 'line':      renderLine(el as LineElement, { ctx }); break
    case 'arrow':     renderArrow(el as ArrowElement, { ctx }); break
    case 'connector': renderConnector(el as ConnectorElement, { ctx, elements: state.elements, palette: state.palette }); break

    case 'frame':     renderFrame(el as FrameElement, { ctx, palette: state.palette, selected: state.selectedIds.has(el.id) }); break
    case 'group':     renderGroup(el as GroupElement, { ctx, palette: state.palette, selected: state.selectedIds.has(el.id) }); break

    case 'image':     renderImage(el as ImageElement, { ctx, onLoad: state.onImageLoad }); break

    case 'mermaid':   renderMermaidPlaceholder(el as MermaidElement, ctx); break
    case 'code':      renderCodePlaceholder(el as CodeElement, ctx); break

    case 'table':     renderTablePlaceholder(el as TableElement, ctx, state.palette); break
    case 'embed':     renderEmbedPlaceholder(el as EmbedElement, ctx, state.palette, state.activeEmbedId === el.id); break
    case 'comment':   renderCommentPin(el as CommentElement, ctx, state.palette); break

    default:
      // Unknown — skip
      break
  }
}

/**
 * Affordance de "sistema nervioso navegable": badge sutil (circulo dark-glass
 * + flecha diagonal) en la esquina superior-derecha de cualquier elemento con
 * `href`. Tamano constante en pantalla (radio / zoom, mismo patron que los
 * handles de seleccion en renderer/selection.ts). No lee ni escribe ningun
 * cache — es puro dibujo derivado del bbox del elemento en cada frame.
 */
function renderHrefBadge(el: CanvasElement, ctx: CanvasRenderingContext2D, zoom: number): void {
  if (zoom < 0.15) return // ilegible a zoom muy alejado, no vale el costo de dibujo
  const r = 8 / zoom
  const cx = el.x + el.width - r * 1.1
  const cy = el.y + r * 1.1
  ctx.save()
  const sx = el.flipX ? -1 : 1
  const sy = el.flipY ? -1 : 1
  if (el.rotation || sx !== 1 || sy !== 1) {
    const centerX = el.x + el.width / 2
    const centerY = el.y + el.height / 2
    ctx.translate(centerX, centerY)
    if (el.rotation) ctx.rotate(el.rotation)
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy)
    ctx.translate(-centerX, -centerY)
  }
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(12,12,16,0.82)'
  ctx.fill()
  ctx.lineWidth = 1 / zoom
  ctx.strokeStyle = 'rgba(255,255,255,0.26)'
  ctx.stroke()
  // Glifo "external link": flecha diagonal + esquina, simple y legible a
  // tamano badge (evita depender de fuentes/iconos externos en canvas 2D).
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.3 / zoom
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const s = r * 0.44
  ctx.beginPath()
  ctx.moveTo(cx - s * 0.55, cy + s * 0.55)
  ctx.lineTo(cx + s * 0.55, cy - s * 0.55)
  ctx.moveTo(cx, cy - s * 0.6)
  ctx.lineTo(cx + s * 0.6, cy - s * 0.6)
  ctx.lineTo(cx + s * 0.6, cy)
  ctx.stroke()
  ctx.restore()
}

function renderMermaidPlaceholder(el: MermaidElement, ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.strokeStyle = '#888'
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.strokeRect(el.x, el.y, el.width, el.height)
  ctx.fillRect(el.x, el.y, el.width, el.height)
  ctx.setLineDash([])
  ctx.fillStyle = '#ccc'
  ctx.font = '12px system-ui'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('mermaid', el.x + 8, el.y + 8)
  ctx.restore()
}

function renderCodePlaceholder(el: CodeElement, ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(el.x, el.y, el.width, el.height)
  ctx.fillStyle = '#a3e635'
  ctx.font = '12px ui-monospace, Menlo, monospace'
  ctx.textBaseline = 'top'
  const lines = el.code.split('\n').slice(0, Math.floor(el.height / 16))
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i].slice(0, Math.floor(el.width / 7)), el.x + 8, el.y + 8 + i * 16)
  }
  ctx.restore()
}

function renderTablePlaceholder(el: TableElement, ctx: CanvasRenderingContext2D, palette: CanvasPalette): void {
  ctx.save()
  ctx.fillStyle = palette.uiBgElevated
  ctx.strokeStyle = palette.uiBorder
  ctx.lineWidth = 1
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(el.x, el.y, el.width, el.height, 10)
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.fillRect(el.x, el.y, el.width, el.height)
    ctx.strokeRect(el.x, el.y, el.width, el.height)
  }

  const rows = Math.max(1, el.cells.length)
  const cols = Math.max(1, ...el.cells.map(row => row.length))
  const rowH = el.height / rows
  const colW = el.width / cols
  ctx.strokeStyle = palette.uiBorder
  ctx.fillStyle = palette.uiText
  ctx.font = '12px ui-monospace, Menlo, monospace'
  ctx.textBaseline = 'middle'
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = el.x + col * colW
      const y = el.y + row * rowH
      if (row === 0 && el.headerRow) {
        ctx.fillStyle = palette.selectionFill
        ctx.fillRect(x, y, colW, rowH)
        ctx.fillStyle = palette.uiText
      }
      ctx.strokeRect(x, y, colW, rowH)
      const text = String(el.cells[row]?.[col] ?? '')
      ctx.fillText(text.slice(0, Math.max(4, Math.floor(colW / 8))), x + 8, y + rowH / 2)
    }
  }
  ctx.restore()
}

function renderEmbedPlaceholder(el: EmbedElement, ctx: CanvasRenderingContext2D, palette: CanvasPalette, active = false): void {
  // EMBED VIVO (11 ago 2026): con url, el iframe real vive en el LiveEmbedLayer
  // (DOM) DEBAJO del canvas. Aquí se PERFORA una ventana transparente para verlo
  // a través — los elementos con z mayor (trazos, texto, stickies) pintan ENCIMA
  // del embed, que es el punto: anotar con la mano sobre contenido vivo.
  if (el.url) {
    ctx.save()
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath()
      ctx.roundRect(el.x, el.y, el.width, el.height, 12)
      ctx.save()
      ctx.clip()
      ctx.clearRect(el.x - 1, el.y - 1, el.width + 2, el.height + 2)
      ctx.restore()
      ctx.strokeStyle = active ? '#ff9101' : palette.uiBorder
      ctx.lineWidth = active ? 2 : 1
      ctx.stroke()
    } else {
      ctx.clearRect(el.x, el.y, el.width, el.height)
      ctx.strokeStyle = active ? '#ff9101' : palette.uiBorder
      ctx.lineWidth = active ? 2 : 1
      ctx.strokeRect(el.x, el.y, el.width, el.height)
    }
    ctx.restore()
    return
  }
  ctx.save()
  ctx.fillStyle = palette.uiBgElevated
  ctx.strokeStyle = palette.accent
  ctx.lineWidth = 1.5
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(el.x, el.y, el.width, el.height, 12)
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.fillRect(el.x, el.y, el.width, el.height)
    ctx.strokeRect(el.x, el.y, el.width, el.height)
  }
  ctx.fillStyle = palette.uiText
  ctx.font = '13px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(el.embedKind, el.x + 12, el.y + 12)
  ctx.fillStyle = palette.uiTextMuted
  ctx.fillText(el.url.slice(0, Math.floor((el.width - 24) / 7)), el.x + 12, el.y + 34)
  ctx.restore()
}

function renderCommentPin(el: CommentElement, ctx: CanvasRenderingContext2D, palette: CanvasPalette): void {
  ctx.save()
  ctx.globalAlpha = el.resolved ? 0.55 : 1
  ctx.fillStyle = palette.accent
  ctx.beginPath()
  ctx.arc(el.x + 16, el.y + 16, 14, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('?', el.x + 16, el.y + 16)

  ctx.fillStyle = palette.uiBgElevated
  ctx.strokeStyle = palette.accent
  ctx.lineWidth = 1.5
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(el.x + 36, el.y, el.width - 36, el.height, 12)
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.fillRect(el.x + 36, el.y, el.width - 36, el.height)
    ctx.strokeRect(el.x + 36, el.y, el.width - 36, el.height)
  }
  ctx.fillStyle = palette.uiText
  ctx.font = '12px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const body = el.body || 'Comment'
  const lines = body.split('\n').slice(0, 3)
  lines.forEach((line, index) => {
    ctx.fillText(line.slice(0, 22), el.x + 48, el.y + 12 + index * 16)
  })
  ctx.restore()
}
