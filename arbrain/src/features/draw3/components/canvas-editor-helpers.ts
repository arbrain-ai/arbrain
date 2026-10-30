/**
 * Helpers puros del editor: creacion de elementos desde drags/widgets,
 * geometria de resize/rotate/move, rutas de connector manuales, eraser,
 * draft rendering (preview de drag), normalizacion legacy v2→v3 y utilidades
 * de seleccion. Extraido VERBATIM de DrawEditor3.tsx (refactor fase 3, B6a).
 */
import { getConnectorRoute, type Point as ConnectorPoint } from '../canvas/renderer/connectors'
import { screenToWorld, worldToScreen, viewportInWorld } from '../canvas/camera'
import { hitTestHandles, hitTestResizeEdge, hitTestSelectionCorner, hitTestSelectionEdge, selectionCornerPoints, OPPOSITE_SELECTION_CORNER, type HandleKind, type SelectionCorner } from '../canvas/hit/hit-test'
import { measureText } from '../canvas/renderer/text'
import { outlineCardinalPoint } from '../canvas/shape-geometry'
import type { SnapGuide } from '../canvas/snap-guides'
import { bboxFromElement, bboxUnion, elementDisplayBBox, isContainer, isShape, resizeConfigForElement, type ArrowElement, type ArrowHead, type BBox, type CanvasElement, type Camera, type ConnectorElement, type ElementId, type FontFamily, type FontWeight, type FrameColor, type FrameElement, type GroupElement, type HighlighterElement, type ImageElement, type LineElement, type ShapeBase, type ShapeElementType, type StickyColor, type StickyElement, type TextDecoration, type TextElement } from '../elements/types'
import { createArrow, createChevron, createCode, createComment, createConnector, createDiamond, createEllipse, createFrame, createFreedraw, createGroup, createHighlighter, createImage, createLine, createMermaid, createPolygon, createRectangle, createStar, createSticky, createTable, createText, createTriangle } from '../elements/factories'
import { shapeTextBox } from '../elements/shape-text-box'
import { useCanvasStore, type ToolName } from '../stores/canvas-store'
import { getPalette } from '../theme/tokens'
import { cloneCanvasElement, createPastedElementId, remapConnectorBinding } from '../elements/clone-utils'
import { quickCreateAnchorLabel, isBindable, anchorPoint, MAGNET_ANCHORS } from './canvas-ui-constants'
import { pickElement } from '../canvas/hit/hit-test'
import {
  FREEDRAW_SIZE_FACTOR,
  FREEDRAW_STREAMLINE,
  FREEDRAW_THINNING,
  HIGHLIGHTER_STREAMLINE,
  HIGHLIGHTER_THINNING,
} from '../canvas/renderer/freedraw'
import { freehandOutlinePath } from '../canvas/renderer/freehand-outline'
import { plainTextFromDrawTextDoc } from './canvas-clipboard'
import type { Op } from '../ops/contract'

import type { Viewport, StyleDefaults, DragMode, QuickCreateAnchor, QuickCreatePreview, BindingHit, FreehandPoint, MovementSnapshot } from './DrawEditor3'
import { capital, NOMBRE_DUENO } from '@/config'

const ROTATION_SNAP_RADIANS = Math.PI / 36 // 5 degrees
const ERASER_RADIUS_SCREEN_PX = 18
const CONNECTOR_ROUTE_HANDLE_PX = 11
const CONNECTOR_ROUTE_SEGMENT_HIT_PX = 12
const SNAP_GUIDE_COLOR = '#3B82F6'
const QUICK_CREATE_GHOST_STROKE = '#64748B'
const QUICK_CREATE_GHOST_FILL = 'rgba(59, 130, 246, 0.06)'
const QUICK_CREATE_MIN_GAP = 96
const QUICK_CREATE_MAX_GAP = 180
const FREEHAND_PRESSURE_UPDATE_THRESHOLD = 0.08
const MIN_TEXT_FONT_SIZE = 6
const MAX_TEXT_FONT_SIZE = 240
const LONG_FORM_TEXT_THRESHOLD = 140
const LONG_FORM_TEXT_MIN_FONT = 20
const LONG_FORM_TEXT_MAX_FONT = 32
const LONG_FORM_TEXT_MIN_WIDTH = 420
const LONG_FORM_TEXT_MAX_WIDTH = 760
const SHORT_TEXT_MIN_WIDTH = 48
const SHORT_TEXT_MAX_WIDTH = 520

export function createStandaloneTextElement({
  text,
  point,
  anchor,
  viewport,
  camera,
  style,
}: {
  text: string
  point: { x: number; y: number }
  anchor: 'top-left' | 'center'
  viewport: Viewport
  camera: Camera
  style: StyleDefaults
}): TextElement {
  const longForm = isLongFormText(text)
  const fontSize = longForm
    ? clamp(style.fontSize, LONG_FORM_TEXT_MIN_FONT, LONG_FORM_TEXT_MAX_FONT)
    : style.fontSize
  const width = standaloneTextWidth(text, fontSize, viewport, camera, longForm)
  const measured = measureText(text || ' ', style.fontFamily, fontSize, 400, width)
  const lineHeight = 1.4
  const height = Math.max(fontSize * lineHeight, measured.height + fontSize * 0.2)
  const x = anchor === 'center' ? point.x - width / 2 : point.x
  const y = anchor === 'center' ? point.y - height / 2 : point.y
  const element = createText({
    x,
    y,
    width,
    height,
    text,
    textColor: style.textColor,
    fontFamily: style.fontFamily,
    fontSize,
  })
  element.textAlign = 'left'
  element.verticalAlign = 'top'
  element.lineHeight = lineHeight
  return element
}

export function standaloneTextNaturalHeight(element: TextElement): number {
  const text = plainTextFromDrawTextDoc(element.doc)
  const lineHeight = element.lineHeight ?? 1.4
  const measured = measureText(
    text || ' ',
    element.fontFamily,
    element.fontSize,
    element.fontWeight ?? 400,
    Math.max(8, element.width),
  )
  const lineCount = Math.max(1, measured.lines.length)
  return Math.max(element.fontSize * lineHeight, lineCount * element.fontSize * lineHeight + element.fontSize * 0.2)
}

function isLongFormText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return trimmed.length >= LONG_FORM_TEXT_THRESHOLD || trimmed.includes('\n')
}

function standaloneTextWidth(
  text: string,
  fontSize: number,
  viewport: Viewport,
  camera: Camera,
  longForm: boolean,
): number {
  const view = viewportInWorld(camera, viewport)
  if (longForm) {
    return clamp(view.width * 0.62, LONG_FORM_TEXT_MIN_WIDTH, LONG_FORM_TEXT_MAX_WIDTH)
  }

  const rough = Math.max(
    SHORT_TEXT_MIN_WIDTH,
    Math.min(SHORT_TEXT_MAX_WIDTH, Math.max(1, text.length) * Math.max(8, fontSize * 0.62) + fontSize * 0.3),
  )
  return clamp(rough, SHORT_TEXT_MIN_WIDTH, Math.min(SHORT_TEXT_MAX_WIDTH, Math.max(SHORT_TEXT_MIN_WIDTH, view.width * 0.7)))
}

export function createWidget(kind: 'sticky' | 'table' | 'timeline' | 'kanban' | 'doc' | 'mermaid' | 'code' | 'embed' | 'comment', center: { x: number; y: number }, palette: ReturnType<typeof getPalette>): CanvasElement {
  if (kind === 'sticky') return createSticky({ x: center.x - 120, y: center.y - 120, text: 'Nueva nota', color: 'yellow' })
  if (kind === 'comment') return createComment({ x: center.x - 110, y: center.y - 46, body: 'Comentario:', authorName: capital(NOMBRE_DUENO()) })
  if (kind === 'doc') {
    const doc = createText({
      x: center.x - 220,
      y: center.y - 130,
      width: 440,
      height: 260,
      text: 'Documento\n\nEscribe notas largas, decisiones o requisitos aqui.',
      fontSize: 30,
      textColor: palette.textColor,
    })
    doc.textAlign = 'left'
    doc.verticalAlign = 'top'
    return doc
  }
  if (kind === 'table') {
    const table = createTable({ x: center.x - 240, y: center.y - 95, width: 480, height: 190, rows: 3, cols: 3 })
    table.cells = [['Metrica', 'Valor', 'Owner'], ['Temp', '72 C', 'Ops'], ['Estado', 'OK', 'Equipo']]
    return table
  }
  if (kind === 'timeline') {
    const table = createTable({ x: center.x - 320, y: center.y - 90, width: 640, height: 180, rows: 3, cols: 4 })
    table.cells = [['Ahora', 'Siguiente', 'Luego', 'Entrega'], ['Kickoff', 'Diseno', 'Build', 'Review'], ['', '', '', '']]
    table.rowHeights = [44, 68, 68]
    table.colWidths = [160, 160, 160, 160]
    return table
  }
  if (kind === 'kanban') {
    const table = createTable({ x: center.x - 300, y: center.y - 120, width: 600, height: 240, rows: 4, cols: 3 })
    table.cells = [['Por hacer', 'En proceso', 'Hecho'], ['Tarea nueva', '', ''], ['', '', ''], ['', '', '']]
    table.rowHeights = [44, 64, 64, 64]
    table.colWidths = [200, 200, 200]
    return table
  }
  if (kind === 'mermaid') return createMermaid({ x: center.x - 260, y: center.y - 150, width: 520, height: 300, code: 'graph LR\n  A[Inicio] --> B[Proceso]\n  B --> C[Resultado]' })
  if (kind === 'embed') {
    return {
      id: `embed-${Date.now()}`,
      type: 'embed',
      x: center.x - 220,
      y: center.y - 110,
      width: 440,
      height: 220,
      rotation: 0,
      zIndex: Date.now(),
      opacity: 1,
      locked: false,
      hidden: false,
      groupId: null,
      frameId: null,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'human',
      url: 'https://example.com',
      embedKind: 'generic',
      sandbox: 'allow-scripts allow-same-origin',
    }
  }
  return createCode({ x: center.x - 240, y: center.y - 120, language: 'typescript', code: 'type Node = {\n  id: string\n  label: string\n}' })
}

export function nextWidgetPoint(viewport: Viewport, camera: Camera, elements: CanvasElement[], selected: CanvasElement[]) {
  const visible = visibleWorldBounds(viewport, camera)
  const clampPoint = (point: { x: number; y: number }) => ({
    x: clamp(point.x, visible.minX + 280, visible.maxX - 280),
    y: clamp(point.y, visible.minY + 170, visible.maxY - 170),
  })
  const selectedBounds = selected.length ? bboxUnion(selected.map(bboxFromElement)) : null
  if (selectedBounds) {
    return clampPoint({
      x: selectedBounds.maxX + 360,
      y: selectedBounds.minY + Math.max(120, selectedBounds.height / 2),
    })
  }
  const center = screenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, camera, viewport)
  const widgetCount = elements.filter(el => ['sticky', 'table', 'mermaid', 'code', 'embed', 'comment'].includes(el.type)).length
  return clampPoint({
    x: center.x + (widgetCount % 3) * 56,
    y: center.y + (widgetCount % 4) * 42,
  })
}

function visibleWorldBounds(viewport: Viewport, camera: Camera) {
  const min = screenToWorld({ x: 0, y: 0 }, camera, viewport)
  const max = screenToWorld({ x: viewport.width, y: viewport.height }, camera, viewport)
  return {
    minX: Math.min(min.x, max.x),
    minY: Math.min(min.y, max.y),
    maxX: Math.max(min.x, max.x),
    maxY: Math.max(min.y, max.y),
  }
}

export function clamp(value: number, min: number, max: number) {
  if (min > max) return value
  return Math.max(min, Math.min(max, value))
}

export function isDrawingTool(tool: ToolName) {
  return ['rectangle', 'ellipse', 'diamond', 'triangle', 'chevron', 'star', 'polygon', 'frame'].includes(tool)
}

export function sanitizeCanvasSettings(value: unknown): Partial<ReturnType<typeof useCanvasStore.getState>['settings']> {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const out: Partial<ReturnType<typeof useCanvasStore.getState>['settings']> = {}
  if (raw.gridStyle === 'none' || raw.gridStyle === 'lines' || raw.gridStyle === 'dots') out.gridStyle = raw.gridStyle
  if (typeof raw.gridSize === 'number' && Number.isFinite(raw.gridSize)) out.gridSize = clamp(raw.gridSize, 10, 80)
  if (typeof raw.snapToGrid === 'boolean') out.snapToGrid = raw.snapToGrid
  if (typeof raw.snapToObjects === 'boolean') out.snapToObjects = raw.snapToObjects
  if (typeof raw.snapThreshold === 'number' && Number.isFinite(raw.snapThreshold)) out.snapThreshold = clamp(raw.snapThreshold, 1, 32)
  if (typeof raw.showObjectDimensions === 'boolean') out.showObjectDimensions = raw.showObjectDimensions
  if (typeof raw.showMinimap === 'boolean') out.showMinimap = raw.showMinimap
  return out
}

export function coalescedPointerSamples(event: PointerEvent): PointerEvent[] {
  const samples = typeof event.getCoalescedEvents === 'function'
    ? event.getCoalescedEvents()
    : []
  if (samples.length === 0) return [event]
  const last = samples[samples.length - 1]
  if (!samePointerSample(last, event)) return [...samples, event]
  return samples
}

function samePointerSample(a: PointerEvent, b: PointerEvent) {
  return Math.abs(a.clientX - b.clientX) < 0.01 &&
    Math.abs(a.clientY - b.clientY) < 0.01 &&
    Math.abs(pointerPressure(a) - pointerPressure(b)) < 0.001
}

export function pointerPressure(event: Pick<PointerEvent, 'pressure' | 'buttons' | 'pointerType'>): number {
  const raw = event.pressure
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw === 0 && event.pointerType !== 'pen' && event.buttons > 0) return 0.5
    return clamp(raw, 0, 1)
  }
  return 0.5
}

export function appendFreehandPoints(current: FreehandPoint[], incoming: FreehandPoint[], minDistance: number): FreehandPoint[] {
  if (incoming.length === 0) return current
  let next = current
  for (const point of incoming) {
    const last = next[next.length - 1]
    if (!last) {
      if (next === current) next = [...current]
      next.push(point)
      continue
    }
    const distance = Math.hypot(point.x - last.x, point.y - last.y)
    const pressureDelta = Math.abs(pressureOrDefault(point.pressure) - pressureOrDefault(last.pressure))
    if (distance >= minDistance) {
      if (next === current) next = [...current]
      next.push(point)
    } else if (pressureDelta >= FREEHAND_PRESSURE_UPDATE_THRESHOLD) {
      if (next === current) next = [...current]
      next[next.length - 1] = point
    }
  }
  return next
}

function pressureOrDefault(value: number | undefined): number {
  return clamp(typeof value === 'number' && Number.isFinite(value) ? value : 0.5, 0, 1)
}

function highlighterStrokeWidth(style: StyleDefaults): number {
  return Math.max(12, style.strokeWidth * 3)
}

export function createFreedrawFromWorldPoints(points: FreehandPoint[], style: StyleDefaults): CanvasElement | null {
  if (points.length < 2) return null
  const minX = Math.min(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y))
  const relativePoints = points.map(point => ({
    x: point.x - minX,
    y: point.y - minY,
    pressure: point.pressure,
  }))
  return createFreedraw({
    x: minX,
    y: minY,
    points: relativePoints,
    strokeColor: style.strokeColor,
    strokeWidth: style.strokeWidth,
  })
}

export function createHighlighterFromWorldPoints(points: FreehandPoint[], style: StyleDefaults): CanvasElement | null {
  if (points.length < 2) return null
  const minX = Math.min(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y))
  const relativePoints = points.map(point => ({
    x: point.x - minX,
    y: point.y - minY,
    pressure: point.pressure,
  }))
  return createHighlighter({
    x: minX,
    y: minY,
    points: relativePoints,
    color: style.strokeColor,
    strokeWidth: highlighterStrokeWidth(style),
  })
}

function clampOpacity(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1))
}

function shapeFontFamily(style: StyleDefaults): FontFamily {
  return style.fontFamily === 'sans' ? 'Noto Sans' : style.fontFamily
}

export function shapeMorphPatch(shape: ShapeBase & CanvasElement, shapeType: ShapeElementType): Partial<CanvasElement> & { type?: never } {
  const source = shape as ShapeBase & {
    cornerRadius?: number
    notchRatio?: number
    pointRatio?: number
    points?: number
    innerRadius?: number
    sides?: number
  }

  if (shapeType === 'rectangle') {
    return { cornerRadius: numberOr(source.cornerRadius, 10) } as Partial<CanvasElement> & { type?: never }
  }
  if (shapeType === 'chevron') {
    return {
      notchRatio: numberOr(source.notchRatio, 0.16),
      pointRatio: numberOr(source.pointRatio, 0.84),
    } as Partial<CanvasElement> & { type?: never }
  }
  if (shapeType === 'star') {
    return {
      points: numberOr(source.points, 5),
      innerRadius: numberOr(source.innerRadius, 0.5),
    } as Partial<CanvasElement> & { type?: never }
  }
  if (shapeType === 'polygon') {
    return { sides: numberOr(source.sides, 6) } as Partial<CanvasElement> & { type?: never }
  }
  return {} as Partial<CanvasElement> & { type?: never }
}

export function pickTextBoxPatch(text: TextElement): Partial<CanvasElement> & { type?: never } {
  return {
    x: text.x,
    y: text.y,
    width: text.width,
    height: text.height,
  } as Partial<CanvasElement> & { type?: never }
}

export function createBoundTextForShape(
  shape: ShapeBase & CanvasElement,
  style: StyleDefaults,
  palette: ReturnType<typeof getPalette>,
) {
  const box = shapeTextBox(shape)
  const text = createText({
    ...box,
    text: '',
    containerId: shape.id,
    fontFamily: shapeFontFamily(style),
    fontSize: style.fontSize,
    textColor: getTextColorForElement(shape, palette),
  })
  text.textAlign = 'center'
  text.verticalAlign = 'middle'
  return text
}

export function createQuickCreateBundle(
  source: CanvasElement,
  anchor: QuickCreateAnchor,
  elements: CanvasElement[],
  style: StyleDefaults,
): { elements: CanvasElement[]; targetId: ElementId } | null {
  if (!isBindable(source)) return null

  const now = Date.now()
  const targetBox = quickCreateTargetBox(source, anchor)
  const maxZIndex = Math.max(0, ...elements.map(el => el.zIndex))
  const target = cloneQuickCreateElement(source, targetBox, now, 0, maxZIndex + 2)
  const connector = createConnector({
    fromElementId: source.id,
    toElementId: target.id,
    routing: 'orthogonal',
    strokeColor: style.strokeColor,
  })
  applyStrokeDefaults(connector, style)
  connector.zIndex = maxZIndex + 1
  connector.startBinding = { elementId: source.id, anchor, gap: 8 }
  connector.endBinding = { elementId: target.id, anchor: oppositeQuickCreateAnchor(anchor), gap: 8 }
  connector.createdAt = now
  connector.updatedAt = now
  connector.createdBy = 'human'
  connector.version = 1

  const created: CanvasElement[] = [connector, target]
  const boundText = elements.find((el): el is TextElement => (
    el.type === 'text' && el.containerId === source.id
  ))

  if (boundText && isShape(source)) {
    const label = cloneCanvasElement(boundText)
    const dx = target.x - source.x
    const dy = target.y - source.y
    label.id = createPastedElementId('text', now, 1)
    label.x = boundText.x + dx
    label.y = boundText.y + dy
    label.zIndex = maxZIndex + 3
    label.containerId = target.id
    label.groupId = null
    label.frameId = null
    label.createdAt = now
    label.updatedAt = now
    label.createdBy = 'human'
    label.version = 1
    label.locked = false
    label.hidden = false
    created.push(label)
  }

  return { elements: created, targetId: target.id }
}

function cloneQuickCreateElement(
  source: CanvasElement,
  targetBox: { x: number; y: number; width: number; height: number },
  now: number,
  index: number,
  zIndex: number,
): CanvasElement {
  const copy = cloneCanvasElement(source)
  copy.id = createPastedElementId(source.type, now, index)
  copy.x = targetBox.x
  copy.y = targetBox.y
  copy.width = targetBox.width
  copy.height = targetBox.height
  copy.zIndex = zIndex
  copy.groupId = null
  copy.frameId = null
  copy.createdAt = now
  copy.updatedAt = now
  copy.createdBy = 'human'
  copy.version = 1
  copy.locked = false
  copy.hidden = false

  if (copy.type === 'text') {
    delete copy.containerId
  }
  if (copy.type === 'frame') {
    copy.childIds = []
  }
  return copy
}

function quickCreateTargetBox(source: CanvasElement, anchor: QuickCreateAnchor) {
  const box = bboxFromElement(source)
  const gap = quickCreateGap(source)
  if (anchor === 'right') {
    return { x: box.maxX + gap, y: box.minY, width: box.width, height: box.height }
  }
  if (anchor === 'left') {
    return { x: box.minX - box.width - gap, y: box.minY, width: box.width, height: box.height }
  }
  if (anchor === 'top') {
    return { x: box.minX, y: box.minY - box.height - gap, width: box.width, height: box.height }
  }
  return { x: box.minX, y: box.maxY + gap, width: box.width, height: box.height }
}

function quickCreateGap(source: CanvasElement) {
  const largestSide = Math.max(source.width, source.height)
  return clamp(largestSide * 0.55, QUICK_CREATE_MIN_GAP, QUICK_CREATE_MAX_GAP)
}

function oppositeQuickCreateAnchor(anchor: QuickCreateAnchor): QuickCreateAnchor {
  if (anchor === 'top') return 'bottom'
  if (anchor === 'right') return 'left'
  if (anchor === 'bottom') return 'top'
  return 'right'
}

export function createFromDrag(drag: Extract<DragMode, { kind: 'draw' }>, style: StyleDefaults, palette: ReturnType<typeof getPalette>, elements: CanvasElement[]): CanvasElement[] {
  const box = normalizeBox(drag.start, drag.current)
  if (box.width < 6 || box.height < 6) return []
  const common = {
    x: box.minX,
    y: box.minY,
    width: box.width,
    height: box.height,
    strokeColor: style.strokeColor,
    fillColor: style.fillColor,
  }
  if (drag.tool === 'rectangle') return [applyStrokeDefaults(createRectangle({ ...common, cornerRadius: style.cornerRadius }), style)]
  if (drag.tool === 'ellipse') return [applyStrokeDefaults(createEllipse(common), style)]
  if (drag.tool === 'diamond') return [applyStrokeDefaults(createDiamond(common), style)]
  if (drag.tool === 'triangle') return [applyStrokeDefaults(createTriangle(common), style)]
  if (drag.tool === 'chevron') return [applyStrokeDefaults(createChevron(common), style)]
  if (drag.tool === 'star') return [applyStrokeDefaults(createStar(common), style)]
  if (drag.tool === 'polygon') return [applyStrokeDefaults(createPolygon(common), style)]
  if (drag.tool === 'frame') {
    const frame = createFrame({
      x: box.minX,
      y: box.minY,
      width: box.width,
      height: box.height,
      title: 'Section',
      color: colorNameForStroke(style.strokeColor),
      childIds: elements.filter(el => {
        const b = bboxFromElement(el)
        return b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY
      }).map(el => el.id),
    })
    frame.zIndex = -1
    return [applyStrokeDefaults(frame, style)]
  }
  if (drag.tool === 'line') {
    return [applyStrokeDefaults(createLine({
      x: drag.start.x,
      y: drag.start.y,
      points: [{ x: 0, y: 0 }, { x: drag.current.x - drag.start.x, y: drag.current.y - drag.start.y }],
      strokeColor: style.strokeColor,
    }), style)]
  }
  if (drag.tool === 'arrow' || drag.tool === 'connector') {
    const arrow = createArrow({
      x: drag.start.x,
      y: drag.start.y,
      points: [{ x: 0, y: 0 }, { x: drag.current.x - drag.start.x, y: drag.current.y - drag.start.y }],
      strokeColor: style.strokeColor,
    })
    return [applyStrokeDefaults(arrow, style)]
  }
  return []
}

export function applyStrokeDefaults<T extends CanvasElement>(element: T, style: StyleDefaults): T {
  if ('strokeWidth' in element) element.strokeWidth = style.strokeWidth
  if ('strokeStyle' in element) element.strokeStyle = style.strokeStyle
  return element
}

export function makeBoundConnector(start: BindingHit, end: BindingHit, style: StyleDefaults) {
  const connector = createConnector({
    fromElementId: start.elementId,
    toElementId: end.elementId,
    routing: 'orthogonal',
    strokeColor: style.strokeColor,
  })
  applyStrokeDefaults(connector, style)
  connector.startBinding = { elementId: start.elementId, anchor: start.anchor, gap: 8 }
  connector.endBinding = { elementId: end.elementId, anchor: end.anchor, gap: 8 }
  return connector
}

export function eraserHitIds(elements: CanvasElement[], point: { x: number; y: number }, zoom: number): ElementId[] {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex)
  const freehand = sorted.find(el => {
    if (el.hidden || el.locked) return false
    if (el.type !== 'freedraw' && el.type !== 'highlighter') return false
    return pointNearFreehand(el, point, eraserRadiusWorld(zoom))
  })
  if (freehand) return expandDeletionIds(elements, [freehand.id])

  const target = pickElement(sorted.filter(el => el.type !== 'freedraw' && el.type !== 'highlighter'), point, zoom)
  if (!target || target.locked) return []
  return expandDeletionIds(elements, [target.id])
}

export function eraserRadiusWorld(zoom: number) {
  return ERASER_RADIUS_SCREEN_PX / Math.max(zoom || 1, 0.01)
}

/**
 * Goma por ZONA: parte un trazo freehand quitando los puntos bajo la goma.
 * Devuelve null si la goma no toca el trazo; [] si el trazo desaparece entero;
 * o los fragmentos supervivientes (cada run contiguo de >=2 puntos se vuelve
 * un trazo nuevo con el MISMO estilo del original).
 */
export function splitFreehandByErase(
  el: CanvasElement,
  point: { x: number; y: number },
  radius: number,
): CanvasElement[] | null {
  if (el.type !== 'freedraw' && el.type !== 'highlighter') return null
  const strokeWidth = el.strokeWidth
  const threshold = Math.max(radius, strokeWidth / 2 + radius * 0.4)
  const survives = el.points.map(p => Math.hypot(el.x + p.x - point.x, el.y + p.y - point.y) > threshold)
  if (survives.every(Boolean)) return null

  const fragments: CanvasElement[] = []
  let run: Array<{ x: number; y: number; pressure?: number }> = []
  const flush = () => {
    if (run.length >= 2) {
      const fragment = el.type === 'highlighter'
        ? createHighlighter({ x: el.x, y: el.y, points: run, color: el.color, strokeWidth })
        : createFreedraw({ x: el.x, y: el.y, points: run, strokeColor: el.strokeColor, strokeWidth })
      // Preservar el caracter del trazo original en cada fragmento.
      fragment.smoothing = el.smoothing
      fragment.thinning = el.thinning
      if (el.strokeOpacity != null) fragment.strokeOpacity = el.strokeOpacity
      if (el.opacity != null) fragment.opacity = el.opacity
      fragments.push(fragment)
    }
    run = []
  }
  for (let i = 0; i < el.points.length; i++) {
    if (survives[i]) run.push(el.points[i])
    else flush()
  }
  flush()
  return fragments
}

/**
 * Primer trazo freehand (top-z) tocado por la goma en `point`, o null.
 */
export function topFreehandAtPoint(
  elements: CanvasElement[],
  point: { x: number; y: number },
  zoom: number,
): CanvasElement | null {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex)
  return sorted.find(el => {
    if (el.hidden || el.locked) return false
    if (el.type !== 'freedraw' && el.type !== 'highlighter') return false
    return pointNearFreehand(el, point, eraserRadiusWorld(zoom))
  }) ?? null
}

function pointNearFreehand(
  el: CanvasElement,
  point: { x: number; y: number },
  radius: number,
) {
  if (el.type !== 'freedraw' && el.type !== 'highlighter') return false
  const strokeWidth = 'strokeWidth' in el ? el.strokeWidth : 2
  const threshold = Math.max(radius, strokeWidth / 2 + radius * 0.4)
  for (let i = 1; i < el.points.length; i++) {
    const a = { x: el.x + el.points[i - 1].x, y: el.y + el.points[i - 1].y }
    const b = { x: el.x + el.points[i].x, y: el.y + el.points[i].y }
    if (distanceToSegment(point, a, b) <= threshold) return true
  }
  return false
}

function distanceToSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  if (len === 0) return Math.hypot(point.x - a.x, point.y - a.y)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

/**
 * Draft freedraw/highlighter en vivo: mismo outline perfect-freehand que el
 * render committeado, dibujado bajo la MISMA transform de camara (world-space)
 * para que el preview coincida 1:1 con el trazo final.
 */
function drawFreehandDraft(
  ctx: CanvasRenderingContext2D,
  points: FreehandPoint[],
  camera: Camera,
  viewport: Viewport,
  opts: { size: number; thinning: number; smoothing: number; streamline: number; color: string; alpha: number },
) {
  if (points.length < 2) return
  const path = freehandOutlinePath(points, {
    size: opts.size,
    thinning: opts.thinning,
    smoothing: opts.smoothing,
    streamline: opts.streamline,
    live: true,
  })
  if (!path) return
  ctx.save()
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0)
  ctx.translate(viewport.width / 2, viewport.height / 2)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.translate(-camera.x, -camera.y)
  ctx.fillStyle = opts.color
  ctx.globalAlpha = opts.alpha
  ctx.fill(path)
  ctx.restore()
}

export function drawDraft(canvas: HTMLCanvasElement, drag: DragMode, camera: Camera, viewport: Viewport, palette: ReturnType<typeof getPalette>, style: StyleDefaults) {
  if (drag.kind !== 'draw' && drag.kind !== 'connector' && drag.kind !== 'freedraw' && drag.kind !== 'highlighter' && drag.kind !== 'eraser') return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0)
  ctx.strokeStyle = palette.selectionStroke
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  if (drag.kind === 'eraser') {
    const screen = worldToScreen(drag.current, camera, viewport)
    ctx.setLineDash([])
    ctx.lineWidth = 1.5
    ctx.strokeStyle = palette.selectionStroke
    ctx.fillStyle = palette.selectionStroke + '12'
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, ERASER_RADIUS_SCREEN_PX, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    return
  }
  if (drag.kind === 'freedraw' || drag.kind === 'highlighter') {
    ctx.setLineDash([])
    drawFreehandDraft(ctx, drag.points, camera, viewport, drag.kind === 'highlighter'
      ? {
        size: highlighterStrokeWidth(style),
        thinning: HIGHLIGHTER_THINNING,
        smoothing: 0.5,
        streamline: HIGHLIGHTER_STREAMLINE,
        color: style.strokeColor,
        alpha: 0.3,
      }
      : {
        size: Math.max(0.5, style.strokeWidth) * FREEDRAW_SIZE_FACTOR,
        thinning: FREEDRAW_THINNING,
        smoothing: 0.5,
        streamline: FREEDRAW_STREAMLINE,
        color: style.strokeColor,
        alpha: 1,
      })
    ctx.restore()
    return
  }
  if (drag.kind !== 'draw' && drag.kind !== 'connector') {
    ctx.restore()
    return
  }
  const a = worldToScreen(drag.start, camera, viewport)
  const b = worldToScreen(drag.current, camera, viewport)
  if (drag.kind === 'draw' && isDrawingTool(drag.tool)) {
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
  } else {
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawSnapGuides(canvas: HTMLCanvasElement, guides: SnapGuide[], camera: Camera, viewport: Viewport) {
  if (guides.length === 0) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0)
  ctx.strokeStyle = SNAP_GUIDE_COLOR
  ctx.lineWidth = 1.25
  ctx.setLineDash([4, 4])
  ctx.globalAlpha = 0.92
  ctx.lineCap = 'butt'

  for (const guide of guides) {
    if (!Number.isFinite(guide.value) || !Number.isFinite(guide.from) || !Number.isFinite(guide.to)) continue
    const start = guide.axis === 'x'
      ? worldToScreen({ x: guide.value, y: guide.from }, camera, viewport)
      : worldToScreen({ x: guide.from, y: guide.value }, camera, viewport)
    const end = guide.axis === 'x'
      ? worldToScreen({ x: guide.value, y: guide.to }, camera, viewport)
      : worldToScreen({ x: guide.to, y: guide.value }, camera, viewport)

    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
  }

  ctx.restore()
}

export function drawQuickCreatePreview(
  canvas: HTMLCanvasElement,
  preview: QuickCreatePreview,
  elements: CanvasElement[],
  camera: Camera,
  viewport: Viewport,
) {
  if (!preview) return
  const source = elements.find(el => el.id === preview.sourceId)
  if (!source || !isBindable(source)) return
  const targetBox = quickCreateTargetBox(source, preview.anchor)
  const start = anchorPoint(source, preview.anchor)
  const targetAnchor = oppositeQuickCreateAnchor(preview.anchor)
  const targetProxy = { ...source, ...targetBox } as CanvasElement
  const end = anchorPoint(targetProxy, targetAnchor)
  const route = quickCreateRoute(start, end, preview.anchor).map(point => worldToScreen(point, camera, viewport))

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.strokeStyle = QUICK_CREATE_GHOST_STROKE
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.72
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(route[0].x, route[0].y)
  for (let i = 1; i < route.length; i++) ctx.lineTo(route[i].x, route[i].y)
  ctx.stroke()
  drawQuickCreateArrowhead(ctx, route[route.length - 2] ?? route[0], route[route.length - 1])

  drawQuickCreateGhostShape(ctx, source, targetBox, camera, viewport)
  ctx.restore()
}

function quickCreateRoute(
  start: { x: number; y: number },
  end: { x: number; y: number },
  anchor: QuickCreateAnchor,
) {
  if (anchor === 'left' || anchor === 'right') {
    const midX = (start.x + end.x) / 2
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
  }
  const midY = (start.y + end.y) / 2
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]
}

function drawQuickCreateArrowhead(
  ctx: CanvasRenderingContext2D,
  previous: { x: number; y: number },
  end: { x: number; y: number },
) {
  const angle = Math.atan2(end.y - previous.y, end.x - previous.x)
  const size = 9
  ctx.save()
  ctx.translate(end.x, end.y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, -size * 0.55)
  ctx.lineTo(-size, size * 0.55)
  ctx.closePath()
  ctx.fillStyle = QUICK_CREATE_GHOST_STROKE
  ctx.fill()
  ctx.restore()
}

function drawQuickCreateGhostShape(
  ctx: CanvasRenderingContext2D,
  source: CanvasElement,
  box: { x: number; y: number; width: number; height: number },
  camera: Camera,
  viewport: Viewport,
) {
  const topLeft = worldToScreen({ x: box.x, y: box.y }, camera, viewport)
  const bottomRight = worldToScreen({ x: box.x + box.width, y: box.y + box.height }, camera, viewport)
  const x = topLeft.x
  const y = topLeft.y
  const width = bottomRight.x - topLeft.x
  const height = bottomRight.y - topLeft.y
  if (Math.abs(width) < 1 || Math.abs(height) < 1) return

  ctx.save()
  ctx.globalAlpha = 0.9
  ctx.fillStyle = QUICK_CREATE_GHOST_FILL
  ctx.strokeStyle = QUICK_CREATE_GHOST_STROKE
  ctx.lineWidth = 1.5
  ctx.setLineDash([8, 6])

  // El preview debe reflejar la forma ACTUAL: copia rotacion + flip espejo del
  // source (el duplicado real ya los hereda via structuredClone).
  const sx = source.flipX ? -1 : 1
  const sy = source.flipY ? -1 : 1
  if (source.rotation || sx !== 1 || sy !== 1) {
    const cx = x + width / 2
    const cy = y + height / 2
    ctx.translate(cx, cy)
    if (source.rotation) ctx.rotate(source.rotation)
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy)
    ctx.translate(-cx, -cy)
  }

  ctx.beginPath()

  if (source.type === 'ellipse') {
    ctx.ellipse(x + width / 2, y + height / 2, Math.abs(width) / 2, Math.abs(height) / 2, 0, 0, Math.PI * 2)
  } else if (source.type === 'diamond') {
    ctx.moveTo(x + width / 2, y)
    ctx.lineTo(x + width, y + height / 2)
    ctx.lineTo(x + width / 2, y + height)
    ctx.lineTo(x, y + height / 2)
    ctx.closePath()
  } else if (source.type === 'triangle') {
    ctx.moveTo(x + width / 2, y)
    ctx.lineTo(x + width, y + height)
    ctx.lineTo(x, y + height)
    ctx.closePath()
  } else if (source.type === 'chevron') {
    const notch = width * clamp((source as Extract<CanvasElement, { type: 'chevron' }>).notchRatio ?? 0.16, 0, 0.45)
    const point = width * clamp((source as Extract<CanvasElement, { type: 'chevron' }>).pointRatio ?? 0.84, 0.45, 1)
    ctx.moveTo(x, y)
    ctx.lineTo(x + point, y)
    ctx.lineTo(x + width, y + height / 2)
    ctx.lineTo(x + point, y + height)
    ctx.lineTo(x, y + height)
    ctx.lineTo(x + notch, y + height / 2)
    ctx.closePath()
  } else {
    const radius = source.type === 'sticky'
      ? 8
      : source.type === 'rectangle'
        ? Math.min(18, Math.max(0, (source as Extract<CanvasElement, { type: 'rectangle' }>).cornerRadius ?? 0) * camera.zoom)
        : 2
    drawRoundedRectPath(ctx, x, y, width, height, radius)
  }

  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function drawRoundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(Math.abs(width) / 2, Math.abs(height) / 2, Math.max(0, radius))
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, r)
    return
  }
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function normalizeBox(a: { x: number; y: number }, b: { x: number; y: number }) {
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x, b.x)
  const maxY = Math.max(a.y, b.y)
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function createResizeDrag(
  element: CanvasElement,
  handle: HandleKind,
  start: { x: number; y: number },
  elements: CanvasElement[],
): Extract<DragMode, { kind: 'resize' }> {
  return {
    kind: 'resize',
    handle,
    original: { ...element },
    start,
    boundTextOriginal: boundTextForContainer(elements, element.id),
  }
}

export function resizeFromHandle(el: CanvasElement, handle: HandleKind, start: { x: number; y: number }, current: { x: number; y: number }): Partial<CanvasElement> {
  if (handle === 'rotation') {
    const cx = el.x + el.width / 2
    const cy = el.y + el.height / 2
    const startAngle = Math.atan2(start.y - cy, start.x - cx)
    const currentAngle = Math.atan2(current.y - cy, current.x - cx)
    return { rotation: snapRotation(normalizeRotation((el.rotation || 0) + currentAngle - startAngle)) } as Partial<CanvasElement>
  }
  const dx = current.x - start.x
  const dy = current.y - start.y
  let x = el.x, y = el.y, width = el.width, height = el.height
  if (handle.includes('w')) { x += dx; width -= dx }
  if (handle.includes('e')) width += dx
  if (handle.includes('n')) { y += dy; height -= dy }
  if (handle.includes('s')) height += dy
  const min = minSizeForElement(el)
  if (width < min.width) {
    if (handle.includes('w')) x = el.x + el.width - min.width
    width = min.width
  }
  if (height < min.height) {
    if (handle.includes('n')) y = el.y + el.height - min.height
    height = min.height
  }
  const patch = {
    x,
    y,
    width,
    height,
  } as Partial<CanvasElement>
  const scaledFontSize = scaledFontSizeForResize(el, handle, { width, height })
  if (scaledFontSize != null) {
    const textPatch = patch as Partial<TextElement | StickyElement>
    textPatch.fontSize = scaledFontSize
  }
  // Un resize manual (esquina o borde) es intencion explicita del usuario: apagar
  // autoSize para que el efecto de auto-fit (DrawEditor3.tsx) deje de pelear con
  // el tamano que acaba de elegir a mano.
  if (el.type === 'text') {
    (patch as Partial<TextElement>).autoSize = false
  }
  return patch
}

function scaledFontSizeForResize(
  el: CanvasElement,
  handle: HandleKind,
  next: { width: number; height: number },
): number | null {
  if (!isCornerResizeHandle(handle) || !isTextLikeElement(el)) return null
  const scale = resizeScaleFromSize(
    { width: el.width, height: el.height },
    next,
  )
  if (scale == null) return null
  return clampTextFontSize(el.fontSize * scale)
}

function isCornerResizeHandle(handle: HandleKind) {
  return handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw'
}

function isTextLikeElement(el: CanvasElement): el is TextElement | StickyElement {
  return el.type === 'text' || el.type === 'sticky'
}

function resizeScaleFromSize(
  original: { width: number; height: number },
  next: { width: number; height: number },
): number | null {
  const originalWidth = Math.max(1, Math.abs(original.width))
  const originalHeight = Math.max(1, Math.abs(original.height))
  const widthScale = Math.abs(next.width) / originalWidth
  const heightScale = Math.abs(next.height) / originalHeight
  const scale = Math.min(widthScale, heightScale)
  return Number.isFinite(scale) && scale > 0 ? scale : null
}

function clampTextFontSize(value: number) {
  const clamped = Math.max(MIN_TEXT_FONT_SIZE, Math.min(MAX_TEXT_FONT_SIZE, value))
  return Math.round(clamped * 10) / 10
}

export function resizeHistoryPatch(el: CanvasElement): Partial<CanvasElement> & { type?: never } {
  const patch = {
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
  } as Partial<CanvasElement> & { type?: never }
  if (isTextLikeElement(el)) {
    const textPatch = patch as Partial<TextElement | StickyElement>
    textPatch.fontSize = el.fontSize
  }
  return patch
}

export function normalizeRotation(angle: number): number {
  const full = Math.PI * 2
  let normalized = angle % full
  if (normalized > Math.PI) normalized -= full
  if (normalized < -Math.PI) normalized += full
  return normalized
}

export function snapRotation(angle: number): number {
  const quarterTurn = Math.PI / 2
  const snapped = Math.round(angle / quarterTurn) * quarterTurn
  if (Math.abs(normalizeRotation(angle - snapped)) <= ROTATION_SNAP_RADIANS) {
    return normalizeRotation(snapped)
  }
  return angle
}

function minSizeForElement(el: CanvasElement) {
  const config = resizeConfigForElement(el)
  return { width: config.minWidth, height: config.minHeight }
}

// Una seleccion es "groupy" cuando su chrome es union box + corner handles:
// multi-seleccion o un solo elemento de tipo group.
function groupySelectionBBox(elements: CanvasElement[], selectedIds: Set<ElementId>): BBox | null {
  if (selectedIds.size === 0) return null
  const selected = elements.filter(el => selectedIds.has(el.id) && !el.hidden)
  if (selected.length === 0) return null
  const isGroupy = selected.length > 1 || selected[0].type === 'group'
  if (!isGroupy) return null
  if (selected.every(el => el.locked)) return null
  return bboxUnion(selected.map(el => elementDisplayBBox(el, elements)))
}

export function hitGroupySelectionCorner(elements: CanvasElement[], selectedIds: Set<ElementId>, point: { x: number; y: number }, zoom: number): SelectionCorner | null {
  const box = groupySelectionBBox(elements, selectedIds)
  if (!box) return null
  return hitTestSelectionCorner(box, point, zoom)
}

export function hitGroupySelectionEdge(elements: CanvasElement[], selectedIds: Set<ElementId>, point: { x: number; y: number }, zoom: number): 'n' | 's' | 'e' | 'w' | null {
  const box = groupySelectionBBox(elements, selectedIds)
  if (!box) return null
  return hitTestSelectionEdge(box, point, zoom)
}

export function createSelectionResizeDrag(
  elements: CanvasElement[],
  selectedIds: Set<ElementId>,
  corner: SelectionCorner,
): Extract<DragMode, { kind: 'resize-selection' }> | null {
  const box = groupySelectionBBox(elements, selectedIds)
  if (!box || box.width < 1e-6 || box.height < 1e-6) return null
  const corners = selectionCornerPoints(box)
  const anchor = corners[OPPOSITE_SELECTION_CORNER[corner]]
  const ids = expandMoveHistoryIds(elements, expandDragSelectionIds(elements, Array.from(selectedIds)))
  const originals = new Map<ElementId, CanvasElement>()
  for (const id of ids) {
    const el = elements.find(item => item.id === id)
    if (el && !el.locked) originals.set(id, structuredClone(el))
  }
  if (originals.size === 0) return null
  return { kind: 'resize-selection', corner, anchor, start: corners[corner], originals }
}

// Resize de un solo lado (accordion): el anchor es el borde OPUESTO (fijo) y el
// start es el borde que se mueve. Escala en un solo eje (x para e/w, y para n/s).
export function createSelectionEdgeResizeDrag(
  elements: CanvasElement[],
  selectedIds: Set<ElementId>,
  edge: 'n' | 's' | 'e' | 'w',
): Extract<DragMode, { kind: 'resize-selection-edge' }> | null {
  const box = groupySelectionBBox(elements, selectedIds)
  if (!box || box.width < 1e-6 || box.height < 1e-6) return null
  const axis: 'x' | 'y' = (edge === 'n' || edge === 's') ? 'y' : 'x'
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  let anchor: { x: number; y: number }
  let start: { x: number; y: number }
  if (edge === 'e') {
    anchor = { x: box.minX, y: cy }
    start = { x: box.maxX, y: cy }
  } else if (edge === 'w') {
    anchor = { x: box.maxX, y: cy }
    start = { x: box.minX, y: cy }
  } else if (edge === 's') {
    anchor = { x: cx, y: box.minY }
    start = { x: cx, y: box.maxY }
  } else {
    anchor = { x: cx, y: box.maxY }
    start = { x: cx, y: box.minY }
  }
  const ids = expandMoveHistoryIds(elements, expandDragSelectionIds(elements, Array.from(selectedIds)))
  const originals = new Map<ElementId, CanvasElement>()
  for (const id of ids) {
    const el = elements.find(item => item.id === id)
    if (el && !el.locked) originals.set(id, structuredClone(el))
  }
  if (originals.size === 0) return null
  return { kind: 'resize-selection-edge', axis, anchor, start, originals }
}

// Escala uniforme de un elemento alrededor de un anchor (esquina opuesta de la
// seleccion). Cubre geometria derivada: fontSize, points relativos y waypoints.
// Con `axis` se restringe a un solo eje (resize de borde / accordion): en ese
// caso NO se toca fontSize ni el eje perpendicular.
export function scaleElementPatch(original: CanvasElement, anchor: { x: number; y: number }, scale: number, axis: 'both' | 'x' | 'y' = 'both'): Partial<CanvasElement> {
  const scaleX = axis === 'y' ? 1 : scale
  const scaleY = axis === 'x' ? 1 : scale
  const patch: Record<string, unknown> = {
    x: anchor.x + (original.x - anchor.x) * scaleX,
    y: anchor.y + (original.y - anchor.y) * scaleY,
    width: original.width * scaleX,
    height: original.height * scaleY,
  }
  if (axis === 'both' && isTextLikeElement(original)) {
    patch.fontSize = Math.max(4, original.fontSize * scale)
  }
  if (original.type === 'text') {
    patch.autoSize = false
  }
  if ((original.type === 'line' || original.type === 'arrow' || original.type === 'freedraw' || original.type === 'highlighter') && Array.isArray(original.points)) {
    patch.points = original.points.map(point => ({ ...point, x: point.x * scaleX, y: point.y * scaleY }))
  }
  if (original.type === 'connector' && Array.isArray(original.waypoints)) {
    patch.waypoints = original.waypoints.map(point => ({ x: anchor.x + (point.x - anchor.x) * scaleX, y: anchor.y + (point.y - anchor.y) * scaleY }))
  }
  return patch as Partial<CanvasElement>
}

export function scaleHistoryPatch(el: CanvasElement): Partial<CanvasElement> {
  const patch = resizeHistoryPatch(el) as Record<string, unknown>
  if ((el.type === 'line' || el.type === 'arrow' || el.type === 'freedraw' || el.type === 'highlighter') && Array.isArray(el.points)) {
    patch.points = el.points.map(point => ({ ...point }))
  }
  if (el.type === 'connector' && Array.isArray(el.waypoints)) {
    patch.waypoints = el.waypoints.map(point => ({ ...point }))
  }
  return patch as Partial<CanvasElement>
}

export function findSelectedHandleHit(elements: CanvasElement[], selectedIds: Set<ElementId>, point: { x: number; y: number }, zoom: number) {
  // Multi-seleccion no renderiza handles por elemento (solo union box), asi que
  // tampoco deben hit-testearse: a zoom bajo el radio del handle en coords de
  // mundo crece tanto que cualquier click colapsaba la seleccion a 1 elemento.
  if (selectedIds.size !== 1) return null
  const selected = elements
    .filter(el => selectedIds.has(el.id) && !el.hidden && !el.locked && el.type !== 'group')
    .sort((a, b) => b.zIndex - a.zIndex)

  for (const element of selected) {
    const handle = hitTestHandles(element, point, zoom)
    if (handle) return { element, handle }
  }

  return null
}

export function findSelectedEdgeHit(elements: CanvasElement[], selectedIds: Set<ElementId>, point: { x: number; y: number }, zoom: number) {
  if (selectedIds.size !== 1) return null
  const selected = elements
    .filter(el => selectedIds.has(el.id) && !el.hidden && !el.locked && el.type !== 'group')
    .sort((a, b) => b.zIndex - a.zIndex)

  for (const element of selected) {
    const handle = hitTestResizeEdge(element, point, zoom)
    if (handle) return { element, handle }
  }

  return null
}

export type ConnectorRouteHit = {
  connector: ConnectorElement
  route: ConnectorPoint[]
  segmentIndex: number
  axis: 'x' | 'y'
}

export function findSelectedConnectorRouteHit(
  elements: CanvasElement[],
  selectedIds: Set<ElementId>,
  point: { x: number; y: number },
  zoom: number,
): ConnectorRouteHit | null {
  // En multi-seleccion el drag debe mover toda la seleccion, no editar la ruta
  // de un connector individual.
  if (selectedIds.size !== 1) return null
  const selectedConnectors = elements
    .filter((el): el is ConnectorElement => selectedIds.has(el.id) && el.type === 'connector' && !el.hidden && !el.locked)
    .sort((a, b) => b.zIndex - a.zIndex)

  for (const connector of selectedConnectors) {
    const hit = hitConnectorRoute(connector, elements, point, zoom)
    if (hit) return hit
  }

  return null
}

export function hitConnectorRoute(
  connector: ConnectorElement,
  elements: CanvasElement[],
  point: { x: number; y: number },
  zoom: number,
): ConnectorRouteHit | null {
  const route = getConnectorRoute(connector, elements)
  if (route.length < 2) return null

  const handleRadius = CONNECTOR_ROUTE_HANDLE_PX / Math.max(zoom || 1, 0.01)
  const segmentThreshold = CONNECTOR_ROUTE_SEGMENT_HIT_PX / Math.max(zoom || 1, 0.01)
  let best: (ConnectorRouteHit & { distance: number }) | null = null

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]
    const b = route[i + 1]
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const midpointDistance = Math.hypot(point.x - midpoint.x, point.y - midpoint.y)
    const segmentDistance = distanceToSegment(point, a, b)
    const distance = Math.min(midpointDistance, segmentDistance)
    const threshold = midpointDistance <= handleRadius ? handleRadius : segmentThreshold

    if (distance <= threshold && (!best || distance < best.distance)) {
      best = {
        connector,
        route,
        segmentIndex: i,
        axis: connectorSegmentAxis(a, b),
        distance,
      }
    }
  }

  if (!best) return null
  return {
    connector: best.connector,
    route: best.route,
    segmentIndex: best.segmentIndex,
    axis: best.axis,
  }
}

function connectorSegmentAxis(a: ConnectorPoint, b: ConnectorPoint): 'x' | 'y' {
  return Math.abs(a.x - b.x) <= Math.abs(a.y - b.y) ? 'x' : 'y'
}

export function cursorForConnectorRouteAxis(axis: 'x' | 'y') {
  return axis === 'x' ? 'ew-resize' : 'ns-resize'
}

export function moveConnectorSegment(
  originalRoute: ConnectorPoint[],
  segmentIndex: number,
  axis: 'x' | 'y',
  value: number,
): ConnectorPoint[] {
  if (originalRoute.length < 2) return originalRoute
  const route = originalRoute.map(point => ({ ...point }))
  const lastIndex = route.length - 1
  const from = segmentIndex
  const to = segmentIndex + 1
  if (from < 0 || to > lastIndex) return route

  if (from === 0 && to === lastIndex) {
    const start = route[0]
    const end = route[lastIndex]
    return compactConnectorRoute(axis === 'x'
      ? [start, { x: value, y: start.y }, { x: value, y: end.y }, end]
      : [start, { x: start.x, y: value }, { x: end.x, y: value }, end])
  }

  if (axis === 'x') {
    if (from === 0) {
      route.splice(1, 0, { x: value, y: route[0].y })
      route[2].x = value
    } else if (to === lastIndex) {
      route[from].x = value
      route.splice(to, 0, { x: value, y: route[lastIndex].y })
    } else {
      route[from].x = value
      route[to].x = value
    }
  } else if (from === 0) {
    route.splice(1, 0, { x: route[0].x, y: value })
    route[2].y = value
  } else if (to === lastIndex) {
    route[from].y = value
    route.splice(to, 0, { x: route[lastIndex].x, y: value })
  } else {
    route[from].y = value
    route[to].y = value
  }

  return compactConnectorRoute(route)
}

export function connectorWaypointsFromRoute(route: ConnectorPoint[]): ConnectorPoint[] {
  return compactConnectorRoute(route)
    .slice(1, -1)
    .map(point => ({ x: point.x, y: point.y }))
}

export function cloneConnectorWaypoints(connector: ConnectorElement): ConnectorPoint[] {
  if (!Array.isArray(connector.waypoints)) return []
  return connector.waypoints
    .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    .map(point => ({ x: point.x, y: point.y }))
}

export function sameConnectorWaypoints(a: ConnectorPoint[], b: ConnectorPoint[]) {
  if (a.length !== b.length) return false
  return a.every((point, index) => Math.abs(point.x - b[index].x) < 0.5 && Math.abs(point.y - b[index].y) < 0.5)
}

function compactConnectorRoute(route: ConnectorPoint[]): ConnectorPoint[] {
  const deduped: ConnectorPoint[] = []
  for (const point of route) {
    const prev = deduped[deduped.length - 1]
    if (!prev || Math.abs(prev.x - point.x) > 0.5 || Math.abs(prev.y - point.y) > 0.5) {
      deduped.push({ x: point.x, y: point.y })
    }
  }

  const compacted: ConnectorPoint[] = []
  for (const point of deduped) {
    const a = compacted[compacted.length - 2]
    const b = compacted[compacted.length - 1]
    if (a && b && (
      (almostSame(a.x, b.x) && almostSame(b.x, point.x)) ||
      (almostSame(a.y, b.y) && almostSame(b.y, point.y))
    )) {
      compacted[compacted.length - 1] = { x: point.x, y: point.y }
    } else {
      compacted.push(point)
    }
  }

  return compacted
}

function almostSame(a: number, b: number) {
  return Math.abs(a - b) <= 0.5
}

export function cursorForTool(tool: ToolName) {
  if (tool === 'select') return 'default'
  if (tool === 'hand') return 'grab'
  if (tool === 'text') return 'text'
  if (tool === 'freedraw' || tool === 'highlighter') return 'crosshair'
  return 'crosshair'
}

export function cursorForHandle(handle: HandleKind) {
  if (handle === 'rotation') return 'grab'
  if (handle === 'n' || handle === 's') return 'ns-resize'
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  if (handle === 'nw' || handle === 'se') return 'nwse-resize'
  return 'nesw-resize'
}

export function movementSnapshot(el: CanvasElement): MovementSnapshot {
  if (el.type === 'connector') {
    return {
      type: el.type,
      x: el.x,
      y: el.y,
      hadWaypoints: Array.isArray(el.waypoints),
      waypoints: cloneConnectorWaypoints(el),
    }
  }
  return { type: el.type, x: el.x, y: el.y }
}

function movementPatchFromSnapshot(snapshot: MovementSnapshot): Partial<CanvasElement> {
  const patch = { x: snapshot.x, y: snapshot.y } as Partial<CanvasElement>
  if (snapshot.type === 'connector') {
    const connectorPatch = patch as Partial<ConnectorElement>
    connectorPatch.waypoints = snapshot.hadWaypoints
      ? (snapshot.waypoints ?? []).map(point => ({ x: point.x, y: point.y }))
      : undefined
  }
  return patch
}

export function sameMovementSnapshot(a: MovementSnapshot, b: MovementSnapshot) {
  if (Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5) return false
  if (a.type !== 'connector' && b.type !== 'connector') return true
  if (a.hadWaypoints !== b.hadWaypoints) return false
  return sameConnectorWaypoints(a.waypoints ?? [], b.waypoints ?? [])
}

export function movementHistoryOps(elements: CanvasElement[], originals: Map<ElementId, MovementSnapshot>) {
  const forward: Op[] = []
  const reverse: Op[] = []

  for (const [id, original] of originals) {
    const current = elements.find(el => el.id === id)
    if (!current) continue
    const currentSnapshot = movementSnapshot(current)
    if (sameMovementSnapshot(currentSnapshot, original)) continue
    forward.push({ kind: 'update', id, patch: movementPatchFromSnapshot(currentSnapshot) } as Op)
    reverse.push({ kind: 'update', id, patch: movementPatchFromSnapshot(original) } as Op)
  }

  return { forward, reverse }
}

export function moveBoundText(containerId: ElementId, x: number, y: number) {
  const s = useCanvasStore.getState()
  const container = s.elements.find(el => el.id === containerId)
  const text = boundTextForContainer(s.elements, containerId)
  if (!container || !text || !isShape(container)) return
  const box = shapeTextBox({ ...container, x, y })
  s.updateElement(text.id, { x: box.x, y: box.y } as Partial<CanvasElement>)
}

export function resizeBoundText(
  containerId: ElementId,
  patch: Partial<CanvasElement>,
  originalContainer: CanvasElement,
  originalText: TextElement | null,
  handle: HandleKind,
) {
  const s = useCanvasStore.getState()
  const container = s.elements.find(el => el.id === containerId)
  const text = boundTextForContainer(s.elements, containerId)
  if (!container || !text || !isShape(container)) return
  const box = shapeTextBox({
    ...container,
    x: patch.x ?? container.x,
    y: patch.y ?? container.y,
    width: patch.width ?? container.width,
    height: patch.height ?? container.height,
  })
  const textPatch = { ...box } as Partial<CanvasElement>
  if (originalText && isShape(originalContainer) && isCornerResizeHandle(handle)) {
    const originalBox = shapeTextBox(originalContainer)
    const scale = resizeScaleFromSize(originalBox, box)
    if (scale != null) {
      const scaledTextPatch = textPatch as Partial<TextElement>
      scaledTextPatch.fontSize = clampTextFontSize(originalText.fontSize * scale)
    }
  }
  s.updateElement(text.id, textPatch)
}

export function boundTextForContainer(elements: CanvasElement[], containerId: ElementId): TextElement | null {
  const text = elements.find(el => el.type === 'text' && (el as TextElement).containerId === containerId) as TextElement | undefined
  return text ?? null
}

export function nearestBinding(point: { x: number; y: number }, elements: CanvasElement[], zoom: number, exclude = new Set<ElementId>()): BindingHit | null {
  const threshold = 24 / zoom
  let best: (BindingHit & { distance: number }) | null = null
  for (const el of elements) {
    if (!isBindable(el) || exclude.has(el.id)) continue
    for (const anchor of MAGNET_ANCHORS) {
      const p = anchorPoint(el, anchor)
      const distance = Math.hypot(point.x - p.x, point.y - p.y)
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { elementId: el.id, anchor, point: p, distance }
      }
    }
  }
  return best ? { elementId: best.elementId, anchor: best.anchor, point: best.point } : null
}

export function hitMagnet(point: { x: number; y: number }, selected: CanvasElement[], zoom: number): BindingHit | null {
  if (selected.length !== 1 || !isBindable(selected[0])) return null
  return nearestBinding(point, selected, zoom)
}

export function normalizeElement(raw: Record<string, unknown>, files: Record<string, { dataURL?: string }>, index: number): CanvasElement | null {
  if (!raw || raw.isDeleted === true || raw.hidden === true) return null
  if ('rotation' in raw && 'createdBy' in raw && !('angle' in raw)) {
    return raw as unknown as CanvasElement
  }

  const type = String(raw.type ?? 'rectangle')
  const base = {
    id: String(raw.id ?? `legacy-${Date.now()}-${index}`),
    x: numberOr(raw.x, 0),
    y: numberOr(raw.y, 0),
    width: Math.max(1, numberOr(raw.width, 160)),
    height: Math.max(1, numberOr(raw.height, 80)),
    rotation: numberOr(raw.angle, 0),
    zIndex: numberOr(raw.zIndex, index + 1),
    opacity: numberOr(raw.opacity, 100) > 1 ? numberOr(raw.opacity, 100) / 100 : numberOr(raw.opacity, 1),
    locked: Boolean(raw.locked ?? false),
    hidden: false,
    groupId: Array.isArray(raw.groupIds) ? String(raw.groupIds[0] ?? '') || null : null,
    frameId: typeof raw.frameId === 'string' ? raw.frameId : null,
    version: numberOr(raw.version, 1),
    createdAt: numberOr(raw.createdAt, Date.now()),
    updatedAt: numberOr(raw.updatedAt, Date.now()),
    createdBy: 'human' as const,
  }

  if (type === 'text') {
    return {
      ...base,
      type: 'text',
      doc: String(raw.text ?? ''),
      fontFamily: mapFont(raw.fontFamily),
      fontSize: numberOr(raw.fontSize, 18),
      fontWeight: mapWeight(raw.fontWeight),
      fontStyle: mapFontStyle(raw.fontStyle),
      textDecoration: mapTextDecoration(raw.textDecoration),
      textColor: String(raw.strokeColor ?? '#ffffff'),
      textAlign: mapTextAlign(raw.textAlign),
      verticalAlign: raw.verticalAlign === 'top' ? 'top' : raw.verticalAlign === 'bottom' ? 'bottom' : 'middle',
      lineHeight: numberOr(raw.lineHeight, 1.35),
      containerId: typeof raw.containerId === 'string' ? raw.containerId : undefined,
      autoSize: Boolean(raw.autoResize ?? true),
    }
  }

  if (type === 'image') {
    const fileId = typeof raw.fileId === 'string' ? raw.fileId : null
    return {
      ...base,
      type: 'image',
      assetId: null,
      url: fileId ? files[fileId]?.dataURL ?? '' : String(raw.url ?? ''),
      naturalWidth: base.width,
      naturalHeight: base.height,
      alt: 'Image',
    }
  }

  if (type === 'frame') {
    return {
      ...base,
      type: 'frame',
      title: String(raw.name ?? raw.title ?? 'Section'),
      color: 'violet',
      childIds: [],
      clipChildren: false,
    }
  }

  if (type === 'arrow' || type === 'line') {
    return {
      ...base,
      type: type as 'arrow' | 'line',
      strokeColor: String(raw.strokeColor ?? '#ffffff'),
      strokeWidth: numberOr(raw.strokeWidth, 2),
      strokeStyle: mapStrokeStyle(raw.strokeStyle),
      strokeOpacity: numberOr(raw.strokeOpacity, base.opacity),
      points: Array.isArray(raw.points) ? raw.points as Array<{ x: number; y: number }> : [{ x: 0, y: 0 }, { x: base.width, y: base.height }],
      ...(type === 'arrow' ? { startArrowhead: 'none' as const, endArrowhead: 'arrow' as const } : {}),
    } as CanvasElement
  }

  if (type === 'sticky') return { ...createSticky({ x: base.x, y: base.y, text: String(raw.text ?? ''), color: 'yellow' }), id: base.id, zIndex: base.zIndex }
  if (type === 'mermaid') return { ...createMermaid({ x: base.x, y: base.y, code: String(raw.code ?? '') }), id: base.id, width: base.width, height: base.height, zIndex: base.zIndex }
  if (type === 'code') return { ...createCode({ x: base.x, y: base.y, code: String(raw.code ?? ''), language: String(raw.language ?? 'text') }), id: base.id, width: base.width, height: base.height, zIndex: base.zIndex }
  if (type === 'table') {
    const cells = Array.isArray(raw.cells) ? raw.cells as string[][] : [['']]
    const table = createTable({ x: base.x, y: base.y, rows: cells.length, cols: Math.max(1, ...cells.map(row => row.length)) })
    table.id = base.id
    table.width = base.width
    table.height = base.height
    table.zIndex = base.zIndex
    table.cells = cells
    return table
  }

  const shapeBase = {
    ...base,
    strokeColor: String(raw.strokeColor ?? '#ffffff'),
    strokeWidth: numberOr(raw.strokeWidth, 2),
    strokeStyle: mapStrokeStyle(raw.strokeStyle),
    strokeOpacity: numberOr(raw.strokeOpacity, base.opacity),
    fillColor: raw.backgroundColor && raw.backgroundColor !== 'transparent' ? String(raw.backgroundColor) : null,
    fillOpacity: numberOr(raw.fillOpacity, base.opacity),
    fillStyle: raw.fillStyle === 'hachure' ? 'hatched' as const : raw.fillStyle === 'cross-hatch' ? 'cross-hatch' as const : 'solid' as const,
  }
  if (type === 'ellipse') return { ...shapeBase, type: 'ellipse' }
  if (type === 'diamond') return { ...shapeBase, type: 'diamond' }
  if (type === 'triangle') return { ...shapeBase, type: 'triangle' }
  if (type === 'chevron') return { ...shapeBase, type: 'chevron', notchRatio: numberOr(raw.notchRatio, 0.16), pointRatio: numberOr(raw.pointRatio, 0.84) }
  return { ...shapeBase, type: 'rectangle', cornerRadius: numberOr(raw.roundness, 10) }
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function mapFont(value: unknown): FontFamily {
  const font = String(value ?? '').toLowerCase()
  if (font.includes('roboto slab')) return 'Roboto Slab'
  if (font.includes('inter')) return 'Inter'
  if (font.includes('mono') || font.includes('jetbrains')) return 'mono'
  if (font.includes('fraunces') || font.includes('serif') || font.includes('georgia')) return 'serif'
  if (font.includes('caveat') || font.includes('hand')) return 'handwriting'
  return 'sans'
}

function mapWeight(value: unknown): FontWeight {
  const weight = numberOr(value, 400)
  if (weight >= 900) return 900
  if (weight >= 800) return 800
  if (weight >= 700) return 700
  if (weight >= 600) return 600
  if (weight >= 500) return 500
  return 400
}

function mapFontStyle(value: unknown): TextElement['fontStyle'] {
  return value === 'italic' ? 'italic' : 'normal'
}

function mapTextDecoration(value: unknown): TextDecoration {
  if (value === 'underline' || value === 'line-through' || value === 'underline line-through') return value
  return 'none'
}

function mapTextAlign(value: unknown): 'left' | 'center' | 'right' | 'justify' {
  if (value === 'left' || value === 'right' || value === 'justify') return value
  return 'center'
}

function mapStrokeStyle(value: unknown): 'solid' | 'dashed' | 'dotted' {
  if (value === 'dashed' || value === 'dotted') return value
  return 'solid'
}

function colorNameForStroke(stroke: string): FrameColor {
  if (stroke.includes('ef') || stroke.includes('dc')) return 'red'
  if (stroke.includes('f5') || stroke.includes('f6')) return 'orange'
  if (stroke.includes('10') || stroke.includes('34')) return 'green'
  if (stroke.includes('3b') || stroke.includes('60')) return 'blue'
  if (stroke.includes('ec') || stroke.includes('f4')) return 'pink'
  return 'violet'
}

export function elementPatchSnapshot(el: CanvasElement): Partial<CanvasElement> {
  const patch = { ...el } as Partial<CanvasElement> & { id?: ElementId; type?: CanvasElement['type'] }
  delete patch.id
  delete patch.type
  return patch as Partial<CanvasElement>
}

// Click sobre un hijo de un grupo selecciona el GRUPO top-level (estilo Miro).
// El drill-in (doble click) selecciona el hijo individual; eso se respeta en el
// call site comprobando si el hijo crudo ya esta seleccionado.
export function selectableIdForHit(hit: CanvasElement, elements: CanvasElement[]): ElementId {
  const byId = new Map(elements.map(el => [el.id, el]))
  let current: CanvasElement = hit
  const visited = new Set<ElementId>([current.id])
  while (current.groupId) {
    const parent = byId.get(current.groupId)
    if (!parent || parent.type !== 'group' || visited.has(parent.id)) break
    visited.add(parent.id)
    current = parent
  }
  return current.id
}

export function normalizeGroupSelectionIds(elements: CanvasElement[], ids: ElementId[]): ElementId[] {
  const byId = new Map(elements.map(el => [el.id, el]))
  const out = new Set<ElementId>()

  for (const id of ids) {
    const el = byId.get(id)
    if (!el || el.hidden) continue

    if (el.type === 'text' && el.containerId != null) {
      const container = byId.get(el.containerId)
      if (!container) continue
      const group = container.groupId ? byId.get(container.groupId) : null
      out.add(group?.type === 'group' ? group.id : container.id)
      continue
    }

    const group = el.groupId ? byId.get(el.groupId) : null
    out.add(group?.type === 'group' ? group.id : el.id)
  }

  return Array.from(out)
}

export function selectedGroupElements(elements: CanvasElement[], ids: ElementId[]): GroupElement[] {
  const byId = new Map(elements.map(el => [el.id, el]))
  const groups = new Map<ElementId, GroupElement>()

  for (const id of ids) {
    const el = byId.get(id)
    if (!el) continue
    if (el.type === 'group') {
      groups.set(el.id, el)
      continue
    }
    if (el.groupId) {
      const group = byId.get(el.groupId)
      if (group?.type === 'group') groups.set(group.id, group)
    }
  }

  return Array.from(groups.values())
}

export function expandDragSelectionIds(elements: CanvasElement[], ids: ElementId[]): ElementId[] {
  const byId = new Map(elements.map(el => [el.id, el]))
  const out = new Set<ElementId>()

  const visit = (id: ElementId) => {
    if (out.has(id)) return
    const el = byId.get(id)
    if (!el || el.hidden || el.locked) return
    if (el.type === 'text' && el.containerId != null) return

    out.add(id)
    if (el.type === 'group') {
      for (const childId of el.childIds) visit(childId)
    }
  }

  for (const id of ids) visit(id)
  return Array.from(out)
}

export function expandMoveHistoryIds(elements: CanvasElement[], ids: ElementId[]): ElementId[] {
  const out = new Set<ElementId>(ids)

  let changed = true
  while (changed) {
    changed = false
    for (const el of elements) {
      if (el.type === 'text' && el.containerId != null && out.has(el.containerId) && !out.has(el.id)) {
        out.add(el.id)
        changed = true
      }
    }
  }

  return Array.from(out)
}

export function expandDeletionIds(elements: CanvasElement[], ids: ElementId[]): ElementId[] {
  const toDelete = new Set(ids)
  const byId = new Map(elements.map(el => [el.id, el]))
  const visitGroupChildren = (id: ElementId) => {
    const el = byId.get(id)
    if (el?.type !== 'group') return
    for (const childId of el.childIds) {
      if (!toDelete.has(childId)) {
        toDelete.add(childId)
        visitGroupChildren(childId)
      }
    }
  }
  for (const id of ids) visitGroupChildren(id)

  let changed = true
  while (changed) {
    changed = false
    for (const el of elements) {
      const shouldDelete =
        toDelete.has(el.id) ||
        (el.type === 'text' && el.containerId != null && toDelete.has(el.containerId)) ||
        (el.type === 'connector' && (
          (el.startBinding?.elementId != null && toDelete.has(el.startBinding.elementId)) ||
          (el.endBinding?.elementId != null && toDelete.has(el.endBinding.elementId))
        ))
      if (shouldDelete && !toDelete.has(el.id)) {
        toDelete.add(el.id)
        changed = true
      }
    }
  }
  return Array.from(toDelete)
}

const DUPLICATE_OFFSET = 28

// Un source de duplicado "arrastra" a sus dependientes logicos: hijos de un
// group/frame (para que el duplicado no comparta hijos con el original) y el
// texto bound a un shape/container.
function expandDuplicateSourceIds(elements: CanvasElement[], ids: ElementId[]): ElementId[] {
  const out = new Set<ElementId>(ids)
  const byId = new Map(elements.map(el => [el.id, el]))

  let changed = true
  while (changed) {
    changed = false
    for (const id of Array.from(out)) {
      const el = byId.get(id)
      if (!el || !isContainer(el)) continue
      for (const childId of el.childIds) {
        if (!out.has(childId)) { out.add(childId); changed = true }
      }
    }
    for (const el of elements) {
      if (el.type === 'text' && el.containerId != null && out.has(el.containerId) && !out.has(el.id)) {
        out.add(el.id)
        changed = true
      }
    }
  }

  return Array.from(out)
}

/**
 * Duplica una seleccion completa (Cmd+D): un elemento suelto, un group/frame
 * (con sus hijos reales, no compartidos con el original), o multiples
 * elementos sueltos a la vez (con sus conectores internos re-apuntando a las
 * copias nuevas, no a los originales). Offset fijo abajo-derecha para los 3
 * casos. `topLevelIds` devuelve, en el mismo orden que `sourceIds`, el id de
 * la copia de cada elemento que el usuario tenia seleccionado — para que el
 * caller pueda dejar seleccionado exactamente lo equivalente al duplicado
 * (el group nuevo, no sus hijos; los N elementos nuevos, no su texto bound).
 */
export function duplicateElements(
  sourceIds: ElementId[],
  elements: CanvasElement[],
  offset: number = DUPLICATE_OFFSET,
): { elements: CanvasElement[]; topLevelIds: ElementId[] } {
  const expandedIds = expandDuplicateSourceIds(elements, sourceIds)
  const byId = new Map(elements.map(el => [el.id, el]))
  const sourceElements = expandedIds
    .map(id => byId.get(id))
    .filter((el): el is CanvasElement => Boolean(el))
  if (sourceElements.length === 0) return { elements: [], topLevelIds: [] }

  const now = Date.now()
  const idMap = new Map<ElementId, ElementId>()
  sourceElements.forEach((el, index) => {
    idMap.set(el.id, createPastedElementId(el.type, now, index))
  })

  const copies = sourceElements.map((source, index) => {
    const copy = {
      ...structuredClone(source),
      id: idMap.get(source.id)!,
      x: source.x + offset,
      y: source.y + offset,
      zIndex: now + index,
      createdAt: now,
      updatedAt: now,
      version: 1,
      locked: false,
    } as CanvasElement

    copy.groupId = source.groupId ? idMap.get(source.groupId) ?? null : null
    copy.frameId = source.frameId ? idMap.get(source.frameId) ?? null : null

    if (copy.type === 'text' && copy.containerId != null) {
      const containerId = idMap.get(copy.containerId)
      if (containerId) copy.containerId = containerId
      else delete copy.containerId
    }

    if (isContainer(copy)) {
      copy.childIds = copy.childIds.map(id => idMap.get(id)).filter((id): id is ElementId => Boolean(id))
    }

    if (copy.type === 'connector') {
      copy.startBinding = copy.startBinding ? remapConnectorBinding(copy.startBinding, idMap) : null
      copy.endBinding = copy.endBinding ? remapConnectorBinding(copy.endBinding, idMap) : null
      if (Array.isArray(copy.waypoints)) {
        copy.waypoints = copy.waypoints.map(point => ({ x: point.x + offset, y: point.y + offset }))
      }
    }

    return copy
  })

  const topLevelIds = sourceIds
    .map(id => idMap.get(id))
    .filter((id): id is ElementId => Boolean(id))

  return { elements: copies, topLevelIds }
}

export function getTextColorForElement(el: CanvasElement, palette: ReturnType<typeof getPalette>): string {
  if (isShape(el)) {
    const fill = (el as ShapeBase).fillColor
    if (fill && fill !== 'transparent') return readableTextColor(fill)
  }
  return palette.textColor
}

function readableTextColor(color: string): string {
  const hex = color.trim().replace('#', '')
  const full = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex
  if (full.length !== 6) return '#0f172a'
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.56 ? '#0f172a' : '#ffffff'
}

