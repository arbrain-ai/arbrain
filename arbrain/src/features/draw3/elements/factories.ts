/**
 * Element factory functions — create new elements with defaults
 */
import { ulid } from 'ulid'
import { FREEDRAW_THINNING, HIGHLIGHTER_THINNING } from '../canvas/renderer/freehand-outline'
import type {
  CanvasElement,
  RectangleElement,
  EllipseElement,
  DiamondElement,
  TriangleElement,
  ChevronElement,
  StarElement,
  PolygonElement,
  LineElement,
  ArrowElement,
  ConnectorElement,
  TextElement,
  StickyElement,
  FreedrawElement,
  HighlighterElement,
  ImageElement,
  CommentElement,
  MermaidElement,
  CodeElement,
  TableElement,
  FrameElement,
  GroupElement,
  StickyColor,
  FrameColor,
  ArrowHead,
  ConnectorRouting,
  BindingPoint,
  FontFamily,
} from './types'

let zIndexCounter = 1
export function nextZIndex(): number {
  zIndexCounter += 1
  return zIndexCounter
}

export function syncZIndexFromElements(elements: CanvasElement[]) {
  for (const el of elements) {
    if (el.zIndex > zIndexCounter) zIndexCounter = el.zIndex
  }
}

function baseDefaults(opts: { x: number; y: number; width: number; height: number; createdBy?: 'human' | 'agent' }) {
  const now = Date.now()
  return {
    id: ulid(),
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    rotation: 0,
    zIndex: nextZIndex(),
    opacity: 1,
    locked: false,
    hidden: false,
    groupId: null,
    frameId: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: opts.createdBy ?? 'human',
  } as const
}

const DEFAULT_STROKE_DARK = '#ffffff'
const DEFAULT_STROKE_LIGHT = '#0f172a'

const TEXT_BOX_MIN_WIDTH = 48
const TEXT_BOX_MAX_WIDTH = 520
const TEXT_BOX_LINE_HEIGHT = 1.4

// Tamano natural de una caja de texto a partir del contenido — SIN dependencia
// de DOM (measureText de canvas/renderer/text.ts requiere `document`, que no
// existe cuando esto corre server-side via POST /api/draw3/[id]/ops). Da un
// resultado ajustado al contenido de entrada en vez del bloque fijo 220x52 que
// antes ignoraba el texto real. El cliente puede afinarlo despues con medicion
// real de canvas, pero ya nace correcto.
function naturalTextBoxSize(text: string, fontSize: number): { width: number; height: number } {
  const lines = (text || ' ').split('\n')
  const longestLine = Math.max(1, ...lines.map(line => line.length || 1))
  // 0.62em/char + un respiro fijo: sin esto, palabras cortas en mayusculas
  // (ej. "LEVY" a fontSize 60) miden mas angosto que su ancho real renderizado
  // y el wrap greedy de wrapText() las corta a la mitad ("LE" / "VY").
  const charWidth = Math.max(8, fontSize * 0.62)
  const width = Math.max(TEXT_BOX_MIN_WIDTH, Math.min(TEXT_BOX_MAX_WIDTH, longestLine * charWidth + fontSize * 0.3))
  const height = Math.max(
    fontSize * TEXT_BOX_LINE_HEIGHT,
    lines.length * fontSize * TEXT_BOX_LINE_HEIGHT + fontSize * 0.2,
  )
  return { width, height }
}

export function createRectangle(opts: {
  x: number; y: number; width: number; height: number
  strokeColor?: string
  fillColor?: string | null
  cornerRadius?: number
  createdBy?: 'human' | 'agent'
}): RectangleElement {
  return {
    type: 'rectangle',
    ...baseDefaults(opts),
    strokeColor: opts.strokeColor ?? DEFAULT_STROKE_DARK,
    strokeWidth: 2,
    strokeStyle: 'solid',
    fillColor: opts.fillColor ?? null,
    fillStyle: 'solid',
    cornerRadius: opts.cornerRadius ?? 8,
  }
}

export function createEllipse(opts: {
  x: number; y: number; width: number; height: number
  strokeColor?: string
  fillColor?: string | null
  createdBy?: 'human' | 'agent'
}): EllipseElement {
  return {
    type: 'ellipse',
    ...baseDefaults(opts),
    strokeColor: opts.strokeColor ?? DEFAULT_STROKE_DARK,
    strokeWidth: 2,
    strokeStyle: 'solid',
    fillColor: opts.fillColor ?? null,
    fillStyle: 'solid',
  }
}

export function createDiamond(opts: {
  x: number; y: number; width: number; height: number
  strokeColor?: string
  fillColor?: string | null
  createdBy?: 'human' | 'agent'
}): DiamondElement {
  return {
    type: 'diamond',
    ...baseDefaults(opts),
    strokeColor: opts.strokeColor ?? DEFAULT_STROKE_DARK,
    strokeWidth: 2,
    strokeStyle: 'solid',
    fillColor: opts.fillColor ?? null,
    fillStyle: 'solid',
  }
}

export function createTriangle(opts: {
  x: number; y: number; width: number; height: number
  strokeColor?: string
  fillColor?: string | null
  createdBy?: 'human' | 'agent'
}): TriangleElement {
  return {
    type: 'triangle',
    ...baseDefaults(opts),
    strokeColor: opts.strokeColor ?? DEFAULT_STROKE_DARK,
    strokeWidth: 2,
    strokeStyle: 'solid',
    fillColor: opts.fillColor ?? null,
    fillStyle: 'solid',
  }
}

export function createChevron(opts: {
  x: number; y: number; width: number; height: number
  strokeColor?: string
  fillColor?: string | null
  notchRatio?: number
  pointRatio?: number
  createdBy?: 'human' | 'agent'
}): ChevronElement {
  return {
    type: 'chevron',
    ...baseDefaults(opts),
    notchRatio: opts.notchRatio ?? 0.16,
    pointRatio: opts.pointRatio ?? 0.84,
    strokeColor: opts.strokeColor ?? DEFAULT_STROKE_DARK,
    strokeWidth: 2,
    strokeStyle: 'solid',
    fillColor: opts.fillColor ?? null,
    fillStyle: 'solid',
  }
}

export function createStar(opts: {
  x: number; y: number; width: number; height: number
  points?: number
  innerRadius?: number
  strokeColor?: string
  fillColor?: string | null
  createdBy?: 'human' | 'agent'
}): StarElement {
  return {
    type: 'star',
    ...baseDefaults(opts),
    points: opts.points ?? 5,
    innerRadius: opts.innerRadius ?? 0.5,
    strokeColor: opts.strokeColor ?? DEFAULT_STROKE_DARK,
    strokeWidth: 2,
    strokeStyle: 'solid',
    fillColor: opts.fillColor ?? null,
    fillStyle: 'solid',
  }
}

export function createPolygon(opts: {
  x: number; y: number; width: number; height: number
  sides?: number
  strokeColor?: string
  fillColor?: string | null
  createdBy?: 'human' | 'agent'
}): PolygonElement {
  return {
    type: 'polygon',
    ...baseDefaults(opts),
    sides: opts.sides ?? 6,
    strokeColor: opts.strokeColor ?? DEFAULT_STROKE_DARK,
    strokeWidth: 2,
    strokeStyle: 'solid',
    fillColor: opts.fillColor ?? null,
    fillStyle: 'solid',
  }
}

export function createLine(opts: {
  x: number; y: number
  points: Array<{ x: number; y: number }>
  strokeColor?: string
  createdBy?: 'human' | 'agent'
}): LineElement {
  const xs = opts.points.map(p => p.x)
  const ys = opts.points.map(p => p.y)
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...ys) - Math.min(...ys)
  return {
    type: 'line',
    ...baseDefaults({ x: opts.x, y: opts.y, width, height, createdBy: opts.createdBy }),
    strokeColor: opts.strokeColor ?? DEFAULT_STROKE_DARK,
    strokeWidth: 2,
    strokeStyle: 'solid',
    points: opts.points,
  }
}

export function createArrow(opts: {
  x: number; y: number
  points: Array<{ x: number; y: number }>
  strokeColor?: string
  startArrowhead?: ArrowHead
  endArrowhead?: ArrowHead
  createdBy?: 'human' | 'agent'
}): ArrowElement {
  const xs = opts.points.map(p => p.x)
  const ys = opts.points.map(p => p.y)
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...ys) - Math.min(...ys)
  return {
    type: 'arrow',
    ...baseDefaults({ x: opts.x, y: opts.y, width, height, createdBy: opts.createdBy }),
    strokeColor: opts.strokeColor ?? DEFAULT_STROKE_DARK,
    strokeWidth: 2,
    strokeStyle: 'solid',
    points: opts.points,
    startArrowhead: opts.startArrowhead ?? 'none',
    endArrowhead: opts.endArrowhead ?? 'arrow',
  }
}

export function createConnector(opts: {
  fromElementId: string
  toElementId: string
  routing?: ConnectorRouting
  strokeColor?: string
  label?: string
  startArrowhead?: ArrowHead
  endArrowhead?: ArrowHead
  createdBy?: 'human' | 'agent'
  // Initial position (overwritten by binding resolution)
  x?: number; y?: number; width?: number; height?: number
}): ConnectorElement {
  return {
    type: 'connector',
    ...baseDefaults({
      x: opts.x ?? 0, y: opts.y ?? 0,
      width: opts.width ?? 100, height: opts.height ?? 100,
      createdBy: opts.createdBy,
    }),
    strokeColor: opts.strokeColor ?? DEFAULT_STROKE_DARK,
    strokeWidth: 2,
    strokeStyle: 'solid',
    routing: opts.routing ?? 'orthogonal',
    startBinding: { elementId: opts.fromElementId, anchor: 'auto', gap: 8 },
    endBinding: { elementId: opts.toElementId, anchor: 'auto', gap: 8 },
    startArrowhead: opts.startArrowhead ?? 'none',
    endArrowhead: opts.endArrowhead ?? 'arrow',
    label: opts.label,
  }
}

export function createText(opts: {
  x: number; y: number; width?: number; height?: number
  text: string
  fontFamily?: FontFamily
  fontSize?: number
  textColor?: string
  containerId?: string
  createdBy?: 'human' | 'agent'
}): TextElement {
  const fontSize = opts.fontSize ?? 36
  const natural = naturalTextBoxSize(opts.text, fontSize)
  return {
    type: 'text',
    ...baseDefaults({
      x: opts.x, y: opts.y,
      width: opts.width ?? natural.width,
      height: opts.height ?? natural.height,
      createdBy: opts.createdBy,
    }),
    doc: opts.text,
    fontFamily: opts.fontFamily ?? 'sans',
    fontSize,
    fontWeight: 400,
    fontStyle: 'normal',
    textDecoration: 'none',
    textColor: opts.textColor ?? DEFAULT_STROKE_DARK,
    textAlign: 'center',
    verticalAlign: 'middle',
    lineHeight: 1.4,
    containerId: opts.containerId,
    autoSize: true,
  }
}

export function createSticky(opts: {
  x: number; y: number; width?: number; height?: number
  text?: string
  color?: StickyColor
  createdBy?: 'human' | 'agent'
}): StickyElement {
  return {
    type: 'sticky',
    ...baseDefaults({
      x: opts.x, y: opts.y,
      width: opts.width ?? 240,
      height: opts.height ?? 240,
      createdBy: opts.createdBy,
    }),
    doc: opts.text ?? '',
    color: opts.color ?? 'yellow',
    fontFamily: 'sans',
    fontSize: 24,
    fontWeight: 400,
    fontStyle: 'normal',
    textDecoration: 'none',
    textColor: '#1a1a1a',
    textAlign: 'center',
    verticalAlign: 'middle',
    autoGrow: true,
  }
}

export function createFreedraw(opts: {
  x: number; y: number
  points: Array<{ x: number; y: number; pressure?: number }>
  strokeColor?: string
  strokeWidth?: number
  createdBy?: 'human' | 'agent'
}): FreedrawElement {
  const xs = opts.points.map(p => p.x)
  const ys = opts.points.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const strokeWidth = opts.strokeWidth ?? 2
  const pad = Math.max(4, strokeWidth / 2 + 3)
  const normalizedPoints = opts.points.map(point => ({
    x: point.x - minX + pad,
    y: point.y - minY + pad,
    pressure: point.pressure,
  }))
  return {
    type: 'freedraw',
    ...baseDefaults({
      x: opts.x + minX - pad,
      y: opts.y + minY - pad,
      width: Math.max(1, maxX - minX + pad * 2),
      height: Math.max(1, maxY - minY + pad * 2),
      createdBy: opts.createdBy,
    }),
    strokeColor: opts.strokeColor ?? DEFAULT_STROKE_DARK,
    strokeWidth,
    points: normalizedPoints,
    smoothing: 0.5,
    thinning: FREEDRAW_THINNING,
  }
}

export function createHighlighter(opts: {
  x: number; y: number
  points: Array<{ x: number; y: number; pressure?: number }>
  color?: string
  strokeWidth?: number
  createdBy?: 'human' | 'agent'
}): HighlighterElement {
  const xs = opts.points.map(p => p.x)
  const ys = opts.points.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const strokeWidth = opts.strokeWidth ?? 18
  const pad = Math.max(8, strokeWidth / 2 + 4)
  const normalizedPoints = opts.points.map(point => ({
    x: point.x - minX + pad,
    y: point.y - minY + pad,
    pressure: point.pressure,
  }))
  return {
    type: 'highlighter',
    ...baseDefaults({
      x: opts.x + minX - pad,
      y: opts.y + minY - pad,
      width: Math.max(1, maxX - minX + pad * 2),
      height: Math.max(1, maxY - minY + pad * 2),
      createdBy: opts.createdBy,
    }),
    color: opts.color ?? '#facc15',
    strokeWidth,
    strokeOpacity: 0.3,
    points: normalizedPoints,
    smoothing: 0.45,
    thinning: HIGHLIGHTER_THINNING,
  }
}

export function createImage(opts: {
  x: number; y: number; width: number; height: number
  url: string
  assetId?: string | null
  naturalWidth?: number
  naturalHeight?: number
  alt?: string
  createdBy?: 'human' | 'agent'
}): ImageElement {
  return {
    type: 'image',
    ...baseDefaults({ x: opts.x, y: opts.y, width: opts.width, height: opts.height, createdBy: opts.createdBy }),
    assetId: opts.assetId ?? null,
    url: opts.url,
    naturalWidth: opts.naturalWidth ?? opts.width,
    naturalHeight: opts.naturalHeight ?? opts.height,
    alt: opts.alt,
  }
}

export function createComment(opts: {
  x: number; y: number; body?: string; authorName?: string; createdBy?: 'human' | 'agent'
}): CommentElement {
  return {
    type: 'comment',
    ...baseDefaults({ x: opts.x, y: opts.y, width: 220, height: 92, createdBy: opts.createdBy }),
    body: opts.body ?? '',
    resolved: false,
    authorName: opts.authorName,
  }
}

export function createMermaid(opts: {
  x: number; y: number; width?: number; height?: number
  code: string
  createdBy?: 'human' | 'agent'
}): MermaidElement {
  return {
    type: 'mermaid',
    ...baseDefaults({
      x: opts.x, y: opts.y,
      width: opts.width ?? 400, height: opts.height ?? 300,
      createdBy: opts.createdBy,
    }),
    code: opts.code,
  }
}

export function createCode(opts: {
  x: number; y: number; width?: number; height?: number
  code: string
  language?: string
  createdBy?: 'human' | 'agent'
}): CodeElement {
  return {
    type: 'code',
    ...baseDefaults({
      x: opts.x, y: opts.y,
      width: opts.width ?? 400, height: opts.height ?? 200,
      createdBy: opts.createdBy,
    }),
    code: opts.code,
    language: opts.language ?? 'typescript',
    showLineNumbers: true,
  }
}

export function createTable(opts: {
  x: number; y: number; width?: number; height?: number
  rows?: number; cols?: number
  createdBy?: 'human' | 'agent'
}): TableElement {
  const rows = opts.rows ?? 3
  const cols = opts.cols ?? 3
  const cells = Array(rows).fill(0).map(() => Array(cols).fill(''))
  return {
    type: 'table',
    ...baseDefaults({
      x: opts.x, y: opts.y,
      width: opts.width ?? cols * 120, height: opts.height ?? rows * 40,
      createdBy: opts.createdBy,
    }),
    cells,
    rowHeights: Array(rows).fill(40),
    colWidths: Array(cols).fill(120),
    headerRow: true,
    headerCol: false,
  }
}

export function createFrame(opts: {
  x: number; y: number; width: number; height: number
  title: string
  color?: FrameColor
  childIds?: string[]
  createdBy?: 'human' | 'agent'
}): FrameElement {
  return {
    type: 'frame',
    ...baseDefaults({ x: opts.x, y: opts.y, width: opts.width, height: opts.height, createdBy: opts.createdBy }),
    title: opts.title,
    color: opts.color ?? 'slate',
    childIds: opts.childIds ?? [],
    clipChildren: true,
  }
}

export function createGroup(opts: {
  childIds: string[]
  bbox: { x: number; y: number; width: number; height: number }
  createdBy?: 'human' | 'agent'
}): GroupElement {
  return {
    type: 'group',
    ...baseDefaults({ ...opts.bbox, createdBy: opts.createdBy }),
    childIds: opts.childIds,
  }
}
