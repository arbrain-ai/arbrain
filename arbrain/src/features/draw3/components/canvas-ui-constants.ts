/**
 * Constantes y helpers de UI del canvas (opciones de estilos, fuentes,
 * arrowheads, anclas) — extraido verbatim de DrawEditor3.tsx (fase 3, B5).
 * Compartido entre DrawEditor3 y CanvasChrome.
 */
import { elementCenter, outlineCardinalPoint } from '../canvas/shape-geometry'
import { isShape, bboxFromElement, type ArrowHead, type CanvasElement, type ConnectorElement, type FontFamily, type FrameColor, type ShapeBase, type ShapeElementType, type StickyColor, type TextDecoration } from '../elements/types'
import type { QuickCreateAnchor, BindingHit } from './DrawEditor3'

export const MAGNET_ANCHORS: QuickCreateAnchor[] = ['top', 'right', 'bottom', 'left']
export const ARROWHEAD_OPTIONS: ArrowHead[] = ['none', 'arrow', 'triangle', 'diamond', 'circle', 'bar']
export const FRAME_COLOR_OPTIONS: FrameColor[] = ['slate', 'zinc', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink']
export type StrokeStyle = ShapeBase['strokeStyle']
export const STROKE_STYLE_OPTIONS: Array<{ value: StrokeStyle; label: string }> = [
  { value: 'solid', label: 'Solida' },
  { value: 'dashed', label: 'Punteada' },
  { value: 'dotted', label: 'Puntos' },
]
export const CONNECTOR_ROUTING_OPTIONS: Array<{ value: ConnectorElement['routing']; label: string }> = [
  { value: 'straight', label: 'Straight' },
  { value: 'orthogonal', label: 'Elbow' },
  { value: 'curved', label: 'Curved' },
]
export const ARROWHEAD_LABELS: Record<ArrowHead, string> = {
  none: 'Ninguna',
  arrow: 'Flecha',
  triangle: 'Triangulo',
  diamond: 'Diamante',
  circle: 'Circulo',
  bar: 'Barra',
}
export const FONT_OPTIONS: Array<{ value: FontFamily; label: string; stack: string }> = [
  { value: 'Inter', label: 'Inter', stack: 'Inter, system-ui, sans-serif' },
  { value: 'Montserrat', label: 'Montserrat', stack: 'Montserrat, system-ui, sans-serif' },
  { value: 'Roboto Slab Black', label: 'Roboto Slab Black', stack: '"Roboto Slab", Georgia, serif' },
  { value: 'Roboto Slab', label: 'Roboto Slab', stack: '"Roboto Slab", Georgia, serif' },
  { value: 'Noto Sans', label: 'Noto Sans', stack: '"Noto Sans", system-ui, sans-serif' },
  { value: 'Arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { value: 'Georgia', label: 'Georgia', stack: 'Georgia, serif' },
  { value: 'EB Garamond', label: 'EB Garamond', stack: '"EB Garamond", Georgia, serif' },
  { value: 'Abril Fatface', label: 'Abril Fatface', stack: '"Abril Fatface", Georgia, serif' },
  { value: 'Bangers', label: 'Bangers', stack: '"Bangers", Impact, sans-serif' },
  { value: 'Caveat', label: 'Caveat', stack: '"Caveat", cursive' },
  { value: 'Fredoka One', label: 'Fredoka One', stack: '"Fredoka One", system-ui, sans-serif' },
  { value: 'Graduate', label: 'Graduate', stack: '"Graduate", Georgia, serif' },
  { value: 'Gravitas One', label: 'Gravitas One', stack: '"Gravitas One", Georgia, serif' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono', stack: '"JetBrains Mono", monospace' },
]
export const FONT_SIZE_PRESETS = [
  { label: 'Micro', value: 12 },
  { label: 'Pequeno', value: 16 },
  { label: 'Normal', value: 18 },
  { label: 'Nota', value: 24 },
  { label: 'Mediano', value: 32 },
  { label: 'Default', value: 36 },
  { label: 'Grande', value: 48 },
  { label: 'Muy grande', value: 64 },
  { label: 'Display', value: 72 },
  { label: 'Hero', value: 80 },
  { label: 'Poster', value: 96 },
  { label: 'Titulo', value: 120 },
  { label: 'Gigante', value: 160 },
]
export const STICKY_COLOR_OPTIONS: StickyColor[] = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple', 'red', 'gray']
export const SHAPE_TYPE_OPTIONS: Array<{ type: ShapeElementType; label: string }> = [
  { type: 'rectangle', label: 'Rectangulo' },
  { type: 'ellipse', label: 'Ovalo' },
  { type: 'diamond', label: 'Rombo' },
  { type: 'triangle', label: 'Triangulo' },
  { type: 'chevron', label: 'Chevron' },
  { type: 'star', label: 'Estrella' },
  { type: 'polygon', label: 'Hexagono' },
]

export function fontLabel(value: FontFamily) {
  if (value === 'sans') return 'Sans'
  if (value === 'serif') return 'Serif'
  if (value === 'mono') return 'Mono'
  if (value === 'handwriting') return 'Hand'
  return FONT_OPTIONS.find(font => font.value === value)?.label ?? String(value)
}

export function textFontStyleValue(element: CanvasElement | null): 'normal' | 'italic' {
  if (element && 'fontStyle' in element && element.fontStyle === 'italic') return 'italic'
  return 'normal'
}

export function textDecorationValue(element: CanvasElement | null): TextDecoration {
  if (!element || !('textDecoration' in element)) return 'none'
  const value = element.textDecoration
  if (value === 'underline' || value === 'line-through' || value === 'underline line-through') return value
  return 'none'
}

export function toggleTextDecoration(current: TextDecoration, target: 'underline' | 'line-through'): TextDecoration {
  const values = new Set(current === 'none' ? [] : current.split(' '))
  if (values.has(target)) values.delete(target)
  else values.add(target)
  const underline = values.has('underline')
  const strike = values.has('line-through')
  if (underline && strike) return 'underline line-through'
  if (underline) return 'underline'
  if (strike) return 'line-through'
  return 'none'
}

export function strokeColorValue(element: CanvasElement, fallback: string): string {
  if ('strokeColor' in element) return element.strokeColor
  if (element.type === 'highlighter') return element.color
  return fallback
}

export function strokeOpacityValue(element: CanvasElement): number {
  if ('strokeOpacity' in element && typeof element.strokeOpacity === 'number') return clampOpacity(element.strokeOpacity)
  if (element.type === 'highlighter') return 0.3
  return clampOpacity(element.opacity ?? 1)
}

export function fillOpacityValue(element: ShapeBase): number {
  if (typeof element.fillOpacity === 'number') return clampOpacity(element.fillOpacity)
  return clampOpacity(element.opacity ?? 1)
}

export function strokeColorPatch(element: CanvasElement, color: string): Partial<CanvasElement> {
  if (element.type === 'highlighter') return { color } as Partial<CanvasElement>
  return { strokeColor: color } as Partial<CanvasElement>
}

export function quickCreateAnchorLabel(anchor: QuickCreateAnchor) {
  if (anchor === 'top') return 'arriba'
  if (anchor === 'right') return 'la derecha'
  if (anchor === 'bottom') return 'abajo'
  return 'la izquierda'
}

export function isBindable(el: CanvasElement) {
  return ['rectangle', 'ellipse', 'diamond', 'triangle', 'chevron', 'text', 'sticky', 'image', 'frame'].includes(el.type)
}

export function anchorPoint(el: CanvasElement, anchor: BindingHit['anchor']) {
  const b = bboxFromElement(el)
  const cx = b.minX + b.width / 2
  const cy = b.minY + b.height / 2
  // Cardinales sobre el CONTORNO REAL (aristas del triangulo, circunferencia del
  // ovalo, etc.) estilo Miro — no el bounding box cuadrado.
  if (anchor === 'top' || anchor === 'right' || anchor === 'bottom' || anchor === 'left') {
    return outlineCardinalPoint(el, anchor)
  }
  if (anchor === 'top-left') return { x: b.minX, y: b.minY }
  if (anchor === 'top-right') return { x: b.maxX, y: b.minY }
  if (anchor === 'bottom-left') return { x: b.minX, y: b.maxY }
  if (anchor === 'bottom-right') return { x: b.maxX, y: b.maxY }
  return { x: cx, y: cy }
}

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(1, value))
}

export function openCanvasUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return
  const normalized = /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')
    ? trimmed
    : `https://${trimmed}`
  window.open(normalized, '_blank', 'noopener,noreferrer')
}

/**
 * Navegacion del "sistema nervioso navegable": el `href` de un elemento del
 * canvas puede ser una ruta interna de Mission Control ("/ml-dashboard") o
 * una URL externa. Rutas internas usan el router de Next (navegacion SPA sin
 * reload); http(s)/dominios sueltos abren en tab nueva via openCanvasUrl
 * (mismo comportamiento que los elementos `embed`).
 */
export function navigateElementHref(href: string, router?: { push: (path: string) => void }): void {
  const trimmed = href.trim()
  if (!trimmed) return
  if (trimmed.startsWith('/')) {
    if (router) router.push(trimmed)
    else window.location.assign(trimmed)
    return
  }
  openCanvasUrl(trimmed)
}

export function canFlipElement(el: CanvasElement): boolean {
  return isShape(el) || el.type === 'image'
}

// Atajos de una sola tecla (sin modificadores) -> herramienta. Espejan los
// shortcuts del PrimaryToolbar / la tabla en /settings. En conflictos T y C
// gana la FORMA (triangulo / connector) sobre texto / comentario, que siguen
// accesibles desde el rail.
