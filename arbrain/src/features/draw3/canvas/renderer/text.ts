/**
 * Text rendering — single source of truth for both bound text and standalone text.
 *
 * Avoids the v2 bug of "two text editors" by:
 *  - During EDIT mode: hide canvas-rendered text, show Tiptap overlay (positioned over the element)
 *  - During IDLE: render text from the doc field via canvas measureText + fillText
 *
 * The overlay component (tiptap-overlay.tsx) reads editingId from the store and positions itself.
 */
import { isShape, type CanvasElement, type TextElement, type StickyElement, type FontFamily, type TextDecoration } from '../../elements/types'
import { shapeTextBox } from '../../elements/shape-text-box'
import type { CanvasPalette } from '../../theme/tokens'
import { getElementIndex } from '../perf-cache'

export interface RenderTextOpts {
  ctx: CanvasRenderingContext2D
  palette: CanvasPalette
  editingId: string | null
  elements?: CanvasElement[]
}

export type TextTaskCheckboxHit = {
  taskIndex: number
}

type RotatableBox = {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

type TiptapNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: readonly unknown[]
}

type TextMarker =
  | { kind: 'bullet' }
  | { kind: 'ordered'; label: string }
  | { kind: 'task'; checked: boolean }

export type TextRenderLine = {
  text: string
  level: number
  marker?: TextMarker
}

type WrappedRenderLine = TextRenderLine & {
  textIndent: number
  totalWidth: number
}

type TextLayout = {
  lines: WrappedRenderLine[]
  x: number
  y: number
  width: number
  lineHeight: number
  fontSize: number
  textAlign: 'left' | 'center' | 'right' | 'justify'
}

const FONT_STACKS: Record<string, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
  handwriting: '"Caveat", "Patrick Hand", cursive',
  'Noto Sans': '"Noto Sans", system-ui, -apple-system, sans-serif',
  Arial: 'Arial, Helvetica, sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  'EB Garamond': '"EB Garamond", Georgia, serif',
  'Abril Fatface': '"Abril Fatface", Georgia, serif',
  Bangers: 'Bangers, Impact, fantasy',
  Caveat: 'Caveat, "Comic Sans MS", cursive',
  'Fredoka One': '"Fredoka One", system-ui, sans-serif',
  Graduate: 'Graduate, Georgia, serif',
  'Gravitas One': '"Gravitas One", Georgia, serif',
  'JetBrains Mono': '"JetBrains Mono", ui-monospace, monospace',
  Inter: 'Inter, system-ui, -apple-system, sans-serif',
  Montserrat: 'Montserrat, system-ui, -apple-system, sans-serif',
  'Roboto Slab': '"Roboto Slab", Georgia, serif',
  'Roboto Slab Black': '"Roboto Slab", Georgia, serif',
}

function fontStack(family: FontFamily): string {
  return FONT_STACKS[family] ?? `"${String(family).replace(/"/g, '')}", ${FONT_STACKS.sans}`
}

function plainText(doc: string | { type: 'doc'; content: readonly unknown[] }): string {
  if (typeof doc === 'string') return doc
  if (!doc || typeof doc !== 'object') return ''
  return tiptapToPlainText(doc as { type: 'doc'; content: readonly unknown[] })
}

function tiptapToPlainText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { type?: string; text?: string; content?: readonly unknown[] }
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  if (n.type === 'hardBreak') return '\n'
  if (Array.isArray(n.content)) {
    return n.content.map(c => tiptapToPlainText(c)).join(n.type === 'paragraph' ? '' : '\n')
  }
  return ''
}

export function textDocToRenderLines(doc: string | { type: 'doc'; content: readonly unknown[] }): TextRenderLine[] {
  if (typeof doc === 'string') {
    return doc.split('\n').map(text => ({ text, level: 0 }))
  }
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) return []

  const lines: TextRenderLine[] = []
  appendRenderNodes(doc.content, lines, 0)
  return lines
}

function appendRenderNodes(nodes: readonly unknown[], lines: TextRenderLine[], level: number): void {
  for (const node of nodes) appendRenderNode(node, lines, level)
}

function appendRenderNode(node: unknown, lines: TextRenderLine[], level: number): void {
  const n = asTiptapNode(node)
  if (!n) return

  if (n.type === 'paragraph' || n.type === 'heading') {
    appendTextLines(extractInlineText(n), lines, level)
    return
  }

  if (n.type === 'bulletList') {
    appendListItems(n.content, lines, level, (index) => ({ kind: 'bullet' }), 1)
    return
  }

  if (n.type === 'orderedList') {
    const start = numericAttr(n.attrs?.start, 1)
    appendListItems(n.content, lines, level, (index) => ({ kind: 'ordered', label: `${start + index}.` }), start)
    return
  }

  if (n.type === 'taskList') {
    appendListItems(n.content, lines, level, (_index, item) => ({
      kind: 'task',
      checked: Boolean(asTiptapNode(item)?.attrs?.checked),
    }), 1)
    return
  }

  if (n.type === 'listItem') {
    appendListItem(n, lines, level, { kind: 'bullet' })
    return
  }

  if (n.type === 'taskItem') {
    appendListItem(n, lines, level, { kind: 'task', checked: Boolean(n.attrs?.checked) })
    return
  }

  if (Array.isArray(n.content)) appendRenderNodes(n.content, lines, level)
}

function appendListItems(
  nodes: readonly unknown[] | undefined,
  lines: TextRenderLine[],
  level: number,
  markerForItem: (index: number, item: unknown) => TextMarker,
  _start: number,
): void {
  if (!Array.isArray(nodes)) return
  nodes.forEach((item, index) => {
    const node = asTiptapNode(item)
    if (!node) return
    appendListItem(node, lines, level, markerForItem(index, item))
  })
}

function appendListItem(item: TiptapNode, lines: TextRenderLine[], level: number, marker: TextMarker): void {
  const children = Array.isArray(item.content) ? item.content : []
  let markerUsed = false

  for (const child of children) {
    const node = asTiptapNode(child)
    if (!node) continue

    if (node.type === 'paragraph' || node.type === 'heading') {
      appendTextLines(extractInlineText(node), lines, level, markerUsed ? undefined : marker)
      markerUsed = true
      continue
    }

    if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') {
      if (!markerUsed) {
        lines.push({ text: '', level, marker })
        markerUsed = true
      }
      appendRenderNode(node, lines, level + 1)
      continue
    }

    const text = extractInlineText(node)
    if (text) {
      appendTextLines(text, lines, level, markerUsed ? undefined : marker)
      markerUsed = true
    }
  }

  if (!markerUsed) lines.push({ text: '', level, marker })
}

function appendTextLines(text: string, lines: TextRenderLine[], level: number, marker?: TextMarker): void {
  const parts = text.split('\n')
  if (parts.length === 0) {
    lines.push({ text: '', level, marker })
    return
  }
  parts.forEach((part, index) => {
    lines.push({ text: part, level, marker: index === 0 ? marker : undefined })
  })
}

function extractInlineText(node: TiptapNode): string {
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : ''
  if (node.type === 'hardBreak') return '\n'
  if (Array.isArray(node.content)) return node.content.map(child => {
    const n = asTiptapNode(child)
    return n ? extractInlineText(n) : ''
  }).join('')
  return ''
}

function asTiptapNode(node: unknown): TiptapNode | null {
  return node && typeof node === 'object' ? node as TiptapNode : null
}

function numericAttr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function renderText(el: TextElement, opts: RenderTextOpts): void {
  if (opts.editingId === el.id) return  // overlay handles render

  const ctx = opts.ctx
  const layout = layoutTextElement(ctx, el, opts.elements)
  if (!layout) return

  ctx.save()
  const box = resolveTextRenderBox(el, opts.elements)
  applyRotation(ctx, box)
  ctx.fillStyle = el.textColor
  ctx.globalAlpha = el.opacity ?? 1

  ctx.beginPath()
  ctx.rect(box.x, box.y, box.width, box.height)
  ctx.clip()

  drawRenderLines(ctx, layout.lines, {
    x: layout.x,
    y: layout.y,
    width: layout.width,
    lineHeight: layout.lineHeight,
    fontSize: layout.fontSize,
    textAlign: layout.textAlign,
    decoration: el.textDecoration,
  })
  ctx.restore()
}

function resolveTextContainer(el: TextElement, elements?: CanvasElement[]): CanvasElement | null {
  if (!el.containerId || !elements) return null
  const container = getElementIndex(elements).get(el.containerId)
  return container && isShape(container) ? container : null
}

function resolveTextRenderBox(el: TextElement, elements?: CanvasElement[]): RotatableBox {
  const container = resolveTextContainer(el, elements)
  if (!container) return el
  return { ...el, ...shapeTextBox(container) }
}

export function renderSticky(el: StickyElement, opts: RenderTextOpts): void {
  const ctx = opts.ctx
  const palette = opts.palette
  const stickyColor = palette.stickyColors[el.color]

  ctx.save()
  applyRotation(ctx, el)
  ctx.globalAlpha = el.opacity ?? 1
  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 4
  ctx.fillStyle = stickyColor.bg
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(el.x, el.y, el.width, el.height, 6)
    ctx.fill()
  } else {
    ctx.fillRect(el.x, el.y, el.width, el.height)
  }
  ctx.shadowColor = 'transparent'

  // Text
  if (opts.editingId === el.id) {
    ctx.restore()
    return  // overlay handles edit
  }
  const layout = layoutStickyElement(ctx, el)
  if (!layout) { ctx.restore(); return }

  ctx.fillStyle = stickyColor.text

  drawRenderLines(ctx, layout.lines, {
    x: layout.x,
    y: layout.y,
    width: layout.width,
    lineHeight: layout.lineHeight,
    fontSize: layout.fontSize,
    textAlign: layout.textAlign,
    decoration: el.textDecoration,
  })
  ctx.restore()
}

export function findTextTaskCheckboxHit(
  ctx: CanvasRenderingContext2D,
  element: TextElement | StickyElement,
  point: { x: number; y: number },
  elements?: CanvasElement[],
): TextTaskCheckboxHit | null {
  const layout = element.type === 'sticky'
    ? layoutStickyElement(ctx, element)
    : layoutTextElement(ctx, element, elements)
  if (!layout) return null

  const box = element.type === 'sticky' ? element : resolveTextRenderBox(element, elements)
  const localPoint = inverseRotatePoint(point, box)
  let taskIndex = -1

  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i]
    if (line.marker?.kind !== 'task') continue
    taskIndex += 1

    const y = layout.y + i * layout.lineHeight
    const baseX = lineBaseX(layout.x, layout.width, line.totalWidth, layout.textAlign)
    const markerX = baseX + line.level * layout.fontSize * 1.15
    const size = checkboxSize(layout.fontSize)
    const boxY = y + layout.fontSize * 0.18
    const pad = Math.max(3, layout.fontSize * 0.12)

    if (
      localPoint.x >= markerX - pad &&
      localPoint.x <= markerX + size + pad &&
      localPoint.y >= boxY - pad &&
      localPoint.y <= boxY + size + pad
    ) {
      return { taskIndex }
    }
  }

  return null
}

export function toggleTaskItemInDoc(
  doc: TextElement['doc'] | StickyElement['doc'],
  taskIndex: number,
): TextElement['doc'] | StickyElement['doc'] | null {
  if (typeof doc === 'string' || taskIndex < 0) return null
  const nextDoc = cloneTiptapDoc(doc)
  let current = -1
  let toggled = false

  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false
    const typed = node as TiptapNode
    if (typed.type === 'taskItem') {
      current += 1
      if (current === taskIndex) {
        typed.attrs = { ...(typed.attrs ?? {}), checked: !Boolean(typed.attrs?.checked) }
        toggled = true
        return true
      }
    }
    if (!Array.isArray(typed.content)) return false
    for (const child of typed.content) {
      if (visit(child)) return true
    }
    return false
  }

  visit(nextDoc)
  return toggled ? nextDoc as TextElement['doc'] | StickyElement['doc'] : null
}

/**
 * Cache de layout: parsear el doc Tiptap + medir + wrappear corre por TEXTO
 * por FRAME sin esto. Key = identidad del elemento (immer crea objeto nuevo
 * en cada edicion → auto-invalida). Para texto bound, el layout tambien
 * depende del contenedor: se guarda su referencia y un miss de identidad
 * (movio/resize) recalcula. El ctx.font SIEMPRE se setea (drawRenderLines
 * y los hit-tests de checkbox dependen del estado del ctx).
 */
const textLayoutCache = new WeakMap<TextElement | StickyElement, { container: CanvasElement | null; layout: TextLayout | null }>()

function applyTextCtxStyle(ctx: CanvasRenderingContext2D, el: TextElement | StickyElement): void {
  const font = fontStack(el.fontFamily)
  ctx.font = `${el.fontStyle ?? 'normal'} ${el.fontWeight ?? 400} ${el.fontSize}px ${font}`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
}

function layoutTextElement(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  elements?: CanvasElement[],
): TextLayout | null {
  const container = resolveTextContainer(el, elements)
  const cached = textLayoutCache.get(el)
  if (cached && cached.container === container) {
    applyTextCtxStyle(ctx, el)
    return cached.layout
  }

  const richLines = textDocToRenderLines(el.doc)
  if (!hasRenderableText(richLines)) {
    textLayoutCache.set(el, { container, layout: null })
    return null
  }

  const box = container ? { ...el, ...shapeTextBox(container) } : el
  applyTextCtxStyle(ctx, el)

  const lineH = el.fontSize * (el.lineHeight ?? 1.4)
  const lines = wrapRenderLines(ctx, richLines, box.width, el.fontSize)
  const blockH = lines.length * lineH
  let yOffset = 0
  if (el.verticalAlign === 'middle') yOffset = (box.height - blockH) / 2
  else if (el.verticalAlign === 'bottom') yOffset = box.height - blockH

  const layout: TextLayout = {
    lines,
    x: box.x,
    y: box.y + yOffset,
    width: box.width,
    lineHeight: lineH,
    fontSize: el.fontSize,
    textAlign: el.textAlign,
  }
  textLayoutCache.set(el, { container, layout })
  return layout
}

function layoutStickyElement(ctx: CanvasRenderingContext2D, el: StickyElement): TextLayout | null {
  const cached = textLayoutCache.get(el)
  if (cached) {
    applyTextCtxStyle(ctx, el)
    return cached.layout
  }

  const richLines = textDocToRenderLines(el.doc)
  if (!hasRenderableText(richLines)) {
    textLayoutCache.set(el, { container: null, layout: null })
    return null
  }

  const pad = 16
  applyTextCtxStyle(ctx, el)

  const lineH = el.fontSize * 1.4
  const width = el.width - pad * 2
  const lines = wrapRenderLines(ctx, richLines, width, el.fontSize)
  const textHeight = lines.length * lineH
  const availableHeight = Math.max(0, el.height - pad * 2)
  let yOffset = 0
  if (el.verticalAlign === 'middle') yOffset = Math.max(0, (availableHeight - textHeight) / 2)
  else if (el.verticalAlign === 'bottom') yOffset = Math.max(0, availableHeight - textHeight)

  const layout: TextLayout = {
    lines,
    x: el.x + pad,
    y: el.y + pad + yOffset,
    width,
    lineHeight: lineH,
    fontSize: el.fontSize,
    textAlign: el.textAlign,
  }
  textLayoutCache.set(el, { container: null, layout })
  return layout
}

function hasRenderableText(lines: TextRenderLine[]): boolean {
  return lines.some(line => line.text.length > 0 || line.marker)
}

function wrapRenderLines(
  ctx: CanvasRenderingContext2D,
  lines: TextRenderLine[],
  maxWidth: number,
  fontSize: number,
): WrappedRenderLine[] {
  const wrapped: WrappedRenderLine[] = []
  for (const line of lines) {
    const levelIndent = line.level * fontSize * 1.15
    const markerFootprint = line.marker ? markerWidth(ctx, line.marker, fontSize) + fontSize * 0.42 : 0
    const textIndent = levelIndent + (line.marker ? markerFootprint : line.level > 0 ? fontSize * 1.05 : 0)
    const textWidth = Math.max(8, maxWidth - textIndent)
    const chunks = wrapText(ctx, line.text, textWidth, true)
    const safeChunks = chunks.length > 0 ? chunks : ['']

    safeChunks.forEach((chunk, index) => {
      const continuedIndent = index === 0 ? textIndent : levelIndent + markerFootprint
      wrapped.push({
        ...line,
        text: chunk,
        marker: index === 0 ? line.marker : undefined,
        textIndent: continuedIndent,
        totalWidth: continuedIndent + ctx.measureText(chunk).width,
      })
    })
  }
  return wrapped
}

function drawRenderLines(
  ctx: CanvasRenderingContext2D,
  lines: WrappedRenderLine[],
  options: {
    x: number
    y: number
    width: number
    lineHeight: number
    fontSize: number
    textAlign: 'left' | 'center' | 'right' | 'justify'
    decoration?: TextDecoration
  },
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const y = options.y + i * options.lineHeight
    const baseX = lineBaseX(options.x, options.width, line.totalWidth, options.textAlign)
    const textX = baseX + line.textIndent

    if (line.marker) drawMarker(ctx, line.marker, baseX + line.level * options.fontSize * 1.15, y, options.fontSize)
    ctx.fillText(line.text, textX, y)
    drawTextDecoration(ctx, line.text, textX, y, options.fontSize, options.decoration, 'left')
  }
}

function lineBaseX(x: number, width: number, lineWidth: number, align: 'left' | 'center' | 'right' | 'justify'): number {
  if (align === 'center') return x + Math.max(0, (width - lineWidth) / 2)
  if (align === 'right') return x + Math.max(0, width - lineWidth)
  return x
}

function markerWidth(ctx: CanvasRenderingContext2D, marker: TextMarker, fontSize: number): number {
  if (marker.kind === 'bullet') return fontSize * 0.55
  if (marker.kind === 'task') return checkboxSize(fontSize)
  return ctx.measureText(marker.label).width
}

function drawMarker(ctx: CanvasRenderingContext2D, marker: TextMarker, x: number, y: number, fontSize: number): void {
  if (marker.kind === 'bullet') {
    ctx.beginPath()
    ctx.arc(x + fontSize * 0.28, y + fontSize * 0.52, Math.max(2, fontSize * 0.11), 0, Math.PI * 2)
    ctx.fill()
    return
  }

  if (marker.kind === 'ordered') {
    ctx.fillText(marker.label, x, y)
    return
  }

  const size = checkboxSize(fontSize)
  const boxY = y + fontSize * 0.18
  ctx.save()
  ctx.lineWidth = Math.max(1.2, fontSize / 18)
  ctx.strokeStyle = String(ctx.fillStyle)
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, boxY, size, size, Math.max(2, size * 0.18))
  else ctx.rect(x, boxY, size, size)
  ctx.stroke()

  if (marker.checked) {
    ctx.beginPath()
    ctx.moveTo(x + size * 0.22, boxY + size * 0.54)
    ctx.lineTo(x + size * 0.42, boxY + size * 0.74)
    ctx.lineTo(x + size * 0.8, boxY + size * 0.28)
    ctx.stroke()
  }
  ctx.restore()
}

function checkboxSize(fontSize: number): number {
  return Math.max(8, fontSize * 0.66)
}

function drawTextDecoration(
  ctx: CanvasRenderingContext2D,
  line: string,
  anchorX: number,
  y: number,
  fontSize: number,
  decoration: TextDecoration | undefined,
  align: CanvasTextAlign,
): void {
  if (!decoration || decoration === 'none' || line.length === 0) return
  const width = ctx.measureText(line).width
  let x1 = anchorX
  if (align === 'center') x1 = anchorX - width / 2
  else if (align === 'right' || align === 'end') x1 = anchorX - width
  const x2 = x1 + width
  const drawLine = (lineY: number) => {
    ctx.beginPath()
    ctx.moveTo(x1, lineY)
    ctx.lineTo(x2, lineY)
    ctx.lineWidth = Math.max(1, fontSize / 18)
    ctx.strokeStyle = String(ctx.fillStyle)
    ctx.stroke()
  }
  if (decoration.includes('underline')) drawLine(y + fontSize * 1.08)
  if (decoration.includes('line-through')) drawLine(y + fontSize * 0.55)
}

function applyRotation(ctx: CanvasRenderingContext2D, el: RotatableBox): void {
  if (!el.rotation) return
  const cx = el.x + el.width / 2
  const cy = el.y + el.height / 2
  ctx.translate(cx, cy)
  ctx.rotate(el.rotation)
  ctx.translate(-cx, -cy)
}

function inverseRotatePoint(point: { x: number; y: number }, box: RotatableBox): { x: number; y: number } {
  if (!box.rotation) return point
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const cos = Math.cos(-box.rotation)
  const sin = Math.sin(-box.rotation)
  const dx = point.x - cx
  const dy = point.y - cy
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  }
}

function cloneTiptapDoc<T>(doc: T): T {
  if (typeof structuredClone === 'function') return structuredClone(doc)
  return JSON.parse(JSON.stringify(doc)) as T
}

/**
 * Greedy word wrap; if autoSize and no fit, reduce font size until it fits (single scale step).
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  autoShrink: boolean,
): string[] {
  const paragraphs = text.split('\n')
  const lines: string[] = []
  for (const para of paragraphs) {
    if (!para) { lines.push(''); continue }
    const words = para.split(/(\s+)/)
    let current = ''
    for (const word of words) {
      const test = current + word
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current.trimEnd())
        current = word.trimStart()
      } else {
        current = test
      }
      while (current && ctx.measureText(current).width > maxWidth) {
        const [head, tail] = splitTextToFit(ctx, current, maxWidth)
        if (!head || head === current) break
        lines.push(head.trimEnd())
        current = tail.trimStart()
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

function splitTextToFit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): [string, string] {
  if (text.length <= 1 || ctx.measureText(text).width <= maxWidth) return [text, '']
  let lo = 1
  let hi = text.length
  let fit = 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const candidate = text.slice(0, mid)
    if (ctx.measureText(candidate).width <= maxWidth) {
      fit = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return [text.slice(0, fit), text.slice(fit)]
}

export function measureText(
  text: string,
  fontFamily: FontFamily,
  fontSize: number,
  fontWeight: number,
  maxWidth: number,
): { width: number; height: number; lines: string[] } {
  if (typeof document === 'undefined') {
    return { width: maxWidth, height: fontSize * 1.4, lines: [text] }
  }
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  ctx.font = `${fontWeight} ${fontSize}px ${fontStack(fontFamily)}`
  const lines = wrapText(ctx, text, maxWidth, true)
  const maxW = Math.max(0, ...lines.map(l => ctx.measureText(l).width))
  return { width: maxW, height: lines.length * fontSize * 1.4, lines }
}
