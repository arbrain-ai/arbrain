/**
 * Canvas v3 — Element type system
 *
 * Discriminated union covering 18 element kinds. Each element extends BaseElement
 * with type-specific properties. All coordinates are in world space (not screen).
 */

export type ElementId = string  // ULID

export type FrameColor =
  | 'slate' | 'zinc' | 'red' | 'orange' | 'amber'
  | 'green' | 'teal' | 'blue' | 'violet' | 'pink'

export type StickyColor =
  | 'yellow' | 'pink' | 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'gray'

export type ConnectorRouting = 'straight' | 'orthogonal' | 'curved'

export type ArrowHead = 'none' | 'arrow' | 'triangle' | 'diamond' | 'circle' | 'bar'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'
type VerticalAlign = 'top' | 'middle' | 'bottom'
export type TextDecoration = 'none' | 'underline' | 'line-through' | 'underline line-through'

type FillStyle = 'solid' | 'hatched' | 'cross-hatch' | 'transparent'
export type FontWeight = 400 | 500 | 600 | 700 | 800 | 900

// Semantic color roles (Business OS visual standard). When set on a shape/text,
// the renderer resolves fill/stroke/text from the active theme palette instead of
// the baked colors — so cards adapt fully when the theme flips.
export type FunctionColorName =
  | 'identity' | 'acquisition' | 'community' | 'conversion' | 'revenue'
  | 'delivery' | 'intelligence' | 'risk' | 'neutral'

// Built-in aliases remain supported, but Canvas v3 stores custom font names too
// so the UI can offer Miro-like font previews without schema churn.
export type FontFamily = 'sans' | 'serif' | 'mono' | 'handwriting' | (string & {})

interface BaseElement {
  id: ElementId
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number      // radians
  flipX?: boolean       // mirror horizontally (espejo eje vertical)
  flipY?: boolean       // mirror vertically (espejo eje horizontal)
  zIndex: number
  opacity: number       // 0..1
  locked: boolean
  hidden: boolean
  groupId: string | null
  frameId: string | null
  version: number       // optimistic concurrency per element
  createdAt: number
  updatedAt: number
  createdBy: 'human' | 'agent'
  // Sistema nervioso navegable: link opcional a una superficie de la app
  // ("/ml-dashboard", "/youtube") o URL externa (https://...). Cualquier
  // elemento (shape/card/text/imagen/etc) puede llevarlo. Ver canvas-ui-constants
  // (navigateElementHref) para la logica de navegacion interna vs externa.
  href?: string
}

export interface ShapeBase extends BaseElement {
  strokeColor: string
  strokeWidth: number
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  strokeOpacity?: number  // 0..1, falls back to opacity
  fillColor: string | null  // null = transparent
  fillOpacity?: number     // 0..1, falls back to opacity
  fillStyle: FillStyle
  cornerRadius?: number     // rectangle only
  shadow?: boolean
  semantic?: FunctionColorName  // theme-aware color role; overrides baked fill/stroke
}

export interface RectangleElement extends ShapeBase {
  type: 'rectangle'
  cornerRadius: number
}

export interface EllipseElement extends ShapeBase {
  type: 'ellipse'
}

export interface DiamondElement extends ShapeBase {
  type: 'diamond'
}

export interface TriangleElement extends ShapeBase {
  type: 'triangle'
}

export interface ChevronElement extends ShapeBase {
  type: 'chevron'
  notchRatio: number  // 0..0.45, left cut depth
  pointRatio: number  // 0.45..1, right point start
}

export interface StarElement extends ShapeBase {
  type: 'star'
  points: number   // 5 default
  innerRadius: number  // ratio 0..1
}

export interface PolygonElement extends ShapeBase {
  type: 'polygon'
  sides: number
}

export interface LineElement extends BaseElement {
  type: 'line'
  strokeColor: string
  strokeWidth: number
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  strokeOpacity?: number
  points: Array<{ x: number; y: number }>   // relative to (x,y); first is (0,0)
}

export interface ArrowElement extends BaseElement {
  type: 'arrow'
  strokeColor: string
  strokeWidth: number
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  strokeOpacity?: number
  points: Array<{ x: number; y: number }>
  startArrowhead: ArrowHead
  endArrowhead: ArrowHead
}

export interface ConnectorElement extends BaseElement {
  type: 'connector'
  strokeColor: string
  strokeWidth: number
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  strokeOpacity?: number
  routing: ConnectorRouting
  startBinding: BindingPoint | null
  endBinding: BindingPoint | null
  // Optional world-space route controls. Existing connectors omit this and keep
  // auto-routing; dragging a connector segment materializes editable waypoints.
  waypoints?: Array<{ x: number; y: number }>
  startArrowhead: ArrowHead
  endArrowhead: ArrowHead
  label?: string
}

export interface BindingPoint {
  elementId: ElementId
  anchor: 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'auto'
  gap: number  // visual gap from element edge
}

// Rich text content stored as Tiptap JSON serialized; render canvas via measurement
interface TextDoc {
  // Minimal Tiptap doc structure; we keep it loose to avoid coupling
  type: 'doc'
  content: Array<TextBlock>
}

interface TextBlock {
  type: 'paragraph' | 'bulletList' | 'orderedList' | 'listItem' | 'taskList' | 'taskItem' | 'heading'
  attrs?: Record<string, unknown>
  content?: Array<TextInline | TextBlock>
}

interface TextInline {
  type: 'text'
  text: string
  marks?: Array<{
    type: 'bold' | 'italic' | 'underline' | 'strike' | 'link' | 'code' | 'textStyle'
    attrs?: { color?: string; href?: string }
  }>
}

export interface TextElement extends BaseElement {
  type: 'text'
  doc: TextDoc | string    // string for plain text, TextDoc for rich
  fontFamily: FontFamily
  fontSize: number
  fontWeight: FontWeight
  fontStyle?: 'normal' | 'italic'
  textDecoration?: TextDecoration
  textColor: string
  textAlign: TextAlign
  verticalAlign: VerticalAlign
  lineHeight: number
  containerId?: ElementId  // if bound to a shape
  autoSize: boolean        // shrink-to-fit
  semantic?: FunctionColorName  // theme-aware text color role; overrides baked textColor
}

export interface StickyElement extends BaseElement {
  type: 'sticky'
  doc: TextDoc | string
  color: StickyColor
  fontFamily: FontFamily
  fontSize: number
  fontWeight?: FontWeight
  fontStyle?: 'normal' | 'italic'
  textDecoration?: TextDecoration
  textColor: string
  textAlign: TextAlign
  verticalAlign?: VerticalAlign
  autoGrow: boolean
}

export interface FreedrawElement extends BaseElement {
  type: 'freedraw'
  strokeColor: string
  strokeWidth: number
  strokeOpacity?: number
  points: Array<{ x: number; y: number; pressure?: number }>
  smoothing: number   // 0..1
  thinning: number    // 0..1, how much pressure affects width
}

export interface HighlighterElement extends BaseElement {
  type: 'highlighter'
  color: string
  strokeWidth: number
  strokeOpacity?: number
  points: Array<{ x: number; y: number; pressure?: number }>
  smoothing?: number
  thinning?: number
}

export interface ImageElement extends BaseElement {
  type: 'image'
  assetId: string | null   // ref to draw_assets.id
  url: string              // direct URL fallback
  naturalWidth: number
  naturalHeight: number
  alt?: string
  filter?: 'none' | 'grayscale' | 'blur' | 'sepia'
}

export interface EmbedElement extends BaseElement {
  type: 'embed'
  url: string
  embedKind: 'youtube' | 'twitter' | 'loom' | 'generic'
  // For sandboxing
  sandbox?: string
}

export interface CommentElement extends BaseElement {
  type: 'comment'
  body: string
  resolved: boolean
  authorName?: string
}

export interface MermaidElement extends BaseElement {
  type: 'mermaid'
  code: string
  rendered?: string  // cached SVG
  renderedAt?: number
}

export interface CodeElement extends BaseElement {
  type: 'code'
  language: string
  code: string
  showLineNumbers: boolean
}

export interface TableElement extends BaseElement {
  type: 'table'
  cells: string[][]
  rowHeights: number[]
  colWidths: number[]
  headerRow: boolean
  headerCol: boolean
}

export interface FrameElement extends BaseElement {
  type: 'frame'
  title: string
  color: FrameColor
  childIds: ElementId[]
  clipChildren: boolean
  // When true, frame chrome (border + title bar) is not rendered, but the
  // frame stays selectable and children remain visible. Miro "Ocultar marco".
  invisible?: boolean
}

export interface GroupElement extends BaseElement {
  type: 'group'
  childIds: ElementId[]
}

type ElementType =
  | 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'chevron' | 'star' | 'polygon'
  | 'line' | 'arrow' | 'connector'
  | 'text' | 'sticky'
  | 'freedraw' | 'highlighter'
  | 'image' | 'embed' | 'comment' | 'mermaid' | 'code' | 'table'
  | 'frame' | 'group'

export type ShapeElementType =
  | 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'chevron' | 'star' | 'polygon'

export type CanvasElement =
  | RectangleElement | EllipseElement | DiamondElement
  | TriangleElement | ChevronElement | StarElement | PolygonElement
  | LineElement | ArrowElement | ConnectorElement
  | TextElement | StickyElement
  | FreedrawElement | HighlighterElement
  | ImageElement | EmbedElement | CommentElement | MermaidElement
  | CodeElement | TableElement
  | FrameElement | GroupElement

/**
 * Type guards
 */
export const isShape = (el: CanvasElement): el is ShapeBase & CanvasElement =>
  ['rectangle', 'ellipse', 'diamond', 'triangle', 'chevron', 'star', 'polygon'].includes(el.type)

export const isLinear = (el: CanvasElement): el is LineElement | ArrowElement | ConnectorElement =>
  ['line', 'arrow', 'connector'].includes(el.type)

const isTextual = (el: CanvasElement): el is TextElement | StickyElement =>
  el.type === 'text' || el.type === 'sticky'

export const isContainer = (el: CanvasElement): el is FrameElement | GroupElement =>
  el.type === 'frame' || el.type === 'group'

const isWidget = (el: CanvasElement): boolean =>
  ['mermaid', 'code', 'table', 'embed', 'comment'].includes(el.type)

/**
 * Fuente unica de comportamiento de resize/rotate por tipo. Antes esta logica
 * vivia repartida (y podia divergir) en 3 sitios: canRotateElement/canResizeElement
 * en hit-test.ts y minSizeForElement en canvas-editor-helpers.ts. Ahora esos 3
 * leen de aqui.
 */
export interface ElementResizeConfig {
  resizable: boolean
  rotatable: boolean
  minWidth: number
  minHeight: number
}

const LINEAR_RESIZE_CONFIG: ElementResizeConfig = { resizable: false, rotatable: false, minWidth: 8, minHeight: 8 }
const SHAPE_RESIZE_CONFIG: ElementResizeConfig = { resizable: true, rotatable: true, minWidth: 24, minHeight: 24 }
const WIDGET_RESIZE_CONFIG: ElementResizeConfig = { resizable: true, rotatable: false, minWidth: 160, minHeight: 90 }

const ELEMENT_RESIZE_CONFIG: Record<ElementType, ElementResizeConfig> = {
  rectangle: SHAPE_RESIZE_CONFIG,
  ellipse: SHAPE_RESIZE_CONFIG,
  diamond: SHAPE_RESIZE_CONFIG,
  triangle: SHAPE_RESIZE_CONFIG,
  chevron: SHAPE_RESIZE_CONFIG,
  star: SHAPE_RESIZE_CONFIG,
  polygon: SHAPE_RESIZE_CONFIG,
  line: LINEAR_RESIZE_CONFIG,
  arrow: LINEAR_RESIZE_CONFIG,
  connector: LINEAR_RESIZE_CONFIG,
  text: { resizable: true, rotatable: true, minWidth: 80, minHeight: 40 },
  sticky: { resizable: true, rotatable: true, minWidth: 120, minHeight: 90 },
  freedraw: LINEAR_RESIZE_CONFIG,
  highlighter: LINEAR_RESIZE_CONFIG,
  image: { resizable: true, rotatable: true, minWidth: 24, minHeight: 24 },
  embed: WIDGET_RESIZE_CONFIG,
  comment: { resizable: true, rotatable: false, minWidth: 24, minHeight: 24 },
  mermaid: WIDGET_RESIZE_CONFIG,
  code: WIDGET_RESIZE_CONFIG,
  table: WIDGET_RESIZE_CONFIG,
  frame: { resizable: true, rotatable: false, minWidth: 160, minHeight: 120 },
  group: { resizable: false, rotatable: false, minWidth: 24, minHeight: 24 },
}

export function resizeConfigForElement(el: CanvasElement): ElementResizeConfig {
  return ELEMENT_RESIZE_CONFIG[el.type]
}

/**
 * Camera state (viewport)
 */
export interface Camera {
  x: number       // world-space center
  y: number
  zoom: number    // 0.1 .. 8
}

/**
 * Bounding box utilities
 */
export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

export function bboxFromElement(el: CanvasElement): BBox {
  // Linear elements may have negative width if drawn backward
  if (el.type === 'line' || el.type === 'arrow') {
    const xs = el.points.map(p => p.x + el.x)
    const ys = el.points.map(p => p.y + el.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
  }
  return {
    minX: el.x,
    minY: el.y,
    maxX: el.x + el.width,
    maxY: el.y + el.height,
    width: el.width,
    height: el.height,
  }
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY)
}

/**
 * BBox "visual" de un elemento: para groups se deriva de los HIJOS reales,
 * porque el x/y/w/h propio del group se desfasa cuando un hijo se edita
 * individualmente (drill-in resize, delete de un hijo, etc).
 */
export function elementDisplayBBox(el: CanvasElement, elements: CanvasElement[]): BBox {
  if (el.type === 'group') {
    const children = el.childIds
      .map(id => elements.find(item => item.id === id))
      .filter((item): item is CanvasElement => Boolean(item && !item.hidden))
    const boxes = children.map(child => elementDisplayBBox(child, elements))
    if (boxes.length > 0) {
      const union = bboxUnion(boxes)
      if (union) return union
    }
  }
  return bboxFromElement(el)
}

export function bboxUnion(boxes: BBox[]): BBox | null {
  if (!boxes.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.minX)
    minY = Math.min(minY, b.minY)
    maxX = Math.max(maxX, b.maxX)
    maxY = Math.max(maxY, b.maxY)
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}
