'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Download as DownloadIcon,
  FileImage,
  FileJson,
  FileText,
  Grid3X3,
  Group as GroupIcon,
  Italic,
  Lock,
  LockOpen,
  MessageSquare,
  MoreHorizontal,
  Minus,
  Rows3,
  Hand,
  X as XIcon,
  Settings,
  Sparkles,
  Strikethrough,
  Type,
  Underline,
  Ungroup as UngroupIcon,
  type LucideIcon,
} from 'lucide-react'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import { ImageLightbox } from '@/shared/components/ImageLightbox'
import { useHistoryStore } from '../stores/history-store'
import { useUIStore } from '../stores/ui-store'
import { createClient } from '@/lib/supabase/client'
import { getDrawData, getLastCloudSaveAt, saveDrawData } from '@/features/draw/services/draw-service'
import { useDrawStore } from '@/features/draw/stores/draw-store'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { render } from '../canvas/engine'
import { screenToWorld, worldToScreen, zoomCamera, setZoomAtCenter, panCamera, fitToBBox, viewportInWorld } from '../canvas/camera'
import { pickElement, pickElementForContext, hitTestHandles, hitTestResizeEdge, hitTestSelectionCorner, selectionCornerPoints, OPPOSITE_SELECTION_CORNER, type HandleKind, type SelectionCorner } from '../canvas/hit/hit-test'
import { getConnectorRoute, type Point as ConnectorPoint } from '../canvas/renderer/connectors'
import { findTextTaskCheckboxHit, measureText, toggleTaskItemInDoc } from '../canvas/renderer/text'
import { outlineCardinalPoint } from '../canvas/shape-geometry'
import { snapConnectorSegment, snapMovingSelection, type SnapGuide } from '../canvas/snap-guides'
import { bboxFromElement, bboxUnion, elementDisplayBBox, isShape, type ArrowElement, type ArrowHead, type BBox, type CanvasElement, type Camera, type ConnectorElement, type ElementId, type EmbedElement, type FontFamily, type FontWeight, type FrameColor, type FrameElement, type GroupElement, type HighlighterElement, type ImageElement, type LineElement, type ShapeBase, type ShapeElementType, type StickyColor, type StickyElement, type TextDecoration, type TextElement } from '../elements/types'
import { createArrow, createChevron, createCode, createComment, createConnector, createDiamond, createEllipse, createFrame, createFreedraw, createGroup, createHighlighter, createImage, createLine, createMermaid, createPolygon, createRectangle, createStar, createSticky, createTable, createText, createTriangle } from '../elements/factories'
import { shapeTextBox } from '../elements/shape-text-box'
import { useCanvasStore, type ToolName, type ThemeMode } from '../stores/canvas-store'
import { getPalette, THEMES, type ThemeName } from '../theme/tokens'
import { useTheme } from '@/shared/contexts/theme-context'
import { TiptapOverlay } from '../editing/TiptapOverlay'
import { CanvasColorPalette } from './ColorPalette/CanvasColorPalette'
import { PrimaryToolbar } from './Toolbar/PrimaryToolbar'
import { UtilityBar } from './Toolbar/UtilityBar'
import { useCanvasExport, useCanvasThumbnail, type CanvasExportFormat } from './hooks/useCanvasExport'
import { useCanvasRealtime, mergeRemoteElements } from './hooks/useCanvasRealtime'
import { useCanvasPresence, useAgentFlash } from './hooks/useCanvasPresence'
import { RemoteCursorsOverlay, AgentFlashOverlay } from './PresenceOverlay'
import { useCanvasClipboard, fileToDataUrl } from './hooks/useCanvasClipboard'
import { useCanvasShortcuts } from './hooks/useCanvasShortcuts'
import { useCanvasPointerMachine } from './hooks/useCanvasPointerMachine'
import {
  DimensionsOverlay,
  MinimapOverlay,
  SelectionToolbar,
  SettingsPopover,
  SelectionActionsMenu,
  CanvasContextMenu,
  MagnetLayer,
  WidgetInspector,
} from './CanvasChrome'
import {
  MAGNET_ANCHORS,
  ARROWHEAD_OPTIONS,
  FRAME_COLOR_OPTIONS,
  STROKE_STYLE_OPTIONS,
  CONNECTOR_ROUTING_OPTIONS,
  ARROWHEAD_LABELS,
  FONT_OPTIONS,
  FONT_SIZE_PRESETS,
  STICKY_COLOR_OPTIONS,
  SHAPE_TYPE_OPTIONS,
  fontLabel,
  textFontStyleValue,
  textDecorationValue,
  toggleTextDecoration,
  strokeColorValue,
  strokeOpacityValue,
  fillOpacityValue,
  strokeColorPatch,
  quickCreateAnchorLabel,
  isBindable,
  anchorPoint,
  openCanvasUrl,
  navigateElementHref,
  canFlipElement,
  type StrokeStyle,
} from './canvas-ui-constants'
import {
  appendFreehandPoints,
  applyStrokeDefaults,
  boundTextForContainer,
  clamp,
  cloneConnectorWaypoints,
  coalescedPointerSamples,
  connectorWaypointsFromRoute,
  createBoundTextForShape,
  createFreedrawFromWorldPoints,
  createFromDrag,
  createHighlighterFromWorldPoints,
  createQuickCreateBundle,
  createResizeDrag,
  createSelectionResizeDrag,
  createStandaloneTextElement,
  createWidget,
  cursorForConnectorRouteAxis,
  cursorForHandle,
  cursorForTool,
  drawDraft,
  drawQuickCreatePreview,
  drawSnapGuides,
  duplicateElements,
  elementPatchSnapshot,
  eraserHitIds,
  eraserRadiusWorld,
  splitFreehandByErase,
  topFreehandAtPoint,
  expandDeletionIds,
  expandDragSelectionIds,
  expandMoveHistoryIds,
  findSelectedConnectorRouteHit,
  findSelectedEdgeHit,
  findSelectedHandleHit,
  getTextColorForElement,
  hitConnectorRoute,
  hitGroupySelectionCorner,
  hitMagnet,
  isDrawingTool,
  makeBoundConnector,
  moveBoundText,
  moveConnectorSegment,
  movementHistoryOps,
  movementSnapshot,
  nearestBinding,
  nextWidgetPoint,
  normalizeBox,
  normalizeElement,
  normalizeGroupSelectionIds,
  pickTextBoxPatch,
  pointerPressure,
  resizeBoundText,
  resizeFromHandle,
  resizeHistoryPatch,
  sameConnectorWaypoints,
  sanitizeCanvasSettings,
  scaleElementPatch,
  scaleHistoryPatch,
  selectableIdForHit,
  selectedGroupElements,
  shapeMorphPatch,
  standaloneTextNaturalHeight,
} from './canvas-editor-helpers'
import { isEditableTarget } from './dom-utils'
import { cloneCanvasElement, createPastedElementId } from '../elements/clone-utils'
import {
  type CanvasClipboardPayload,
  canvasPayloadForClipboardText,
  parseCanvasClipboardText,
  readStoredCanvasClipboardPayload,
  plainTextFromDrawTextDoc,
} from './canvas-clipboard'
import { visualBBoxUnion, bboxFromPoints } from '../canvas/visual-bbox'
import { applyOps } from '../ops/apply'
import type { Op } from '../ops/contract'
import { capital, NOMBRE_DUENO } from '@/config'

interface Props {
  pageId: string
}

export type Viewport = { width: number; height: number; dpr: number }
export type FreehandPoint = { x: number; y: number; pressure?: number }
export type MovementSnapshot = {
  type: CanvasElement['type']
  x: number
  y: number
  hadWaypoints?: boolean
  waypoints?: ConnectorPoint[]
}
export type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; last: { x: number; y: number } }
  // Móvil: con un dedo el gesto por defecto es PAN; un tap corto (sin movimiento)
  // selecciona el elemento bajo el dedo (estilo Figma/Miro). Se resuelve en pointerUp.
  | { kind: 'touch-pan-or-tap'; startScreen: { x: number; y: number }; last: { x: number; y: number }; world: { x: number; y: number }; moved: boolean }
  | { kind: 'select-box'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'drag'; start: { x: number; y: number }; moveIds: ElementId[]; originals: Map<ElementId, MovementSnapshot>; startedOnSelected: boolean }
  | { kind: 'resize'; handle: HandleKind; original: CanvasElement; start: { x: number; y: number }; boundTextOriginal?: TextElement | null }
  | { kind: 'resize-selection'; corner: SelectionCorner; anchor: { x: number; y: number }; start: { x: number; y: number }; originals: Map<ElementId, CanvasElement> }
  | { kind: 'resize-selection-edge'; axis: 'x' | 'y'; anchor: { x: number; y: number }; start: { x: number; y: number }; originals: Map<ElementId, CanvasElement> }
  | { kind: 'connector-route'; connectorId: ElementId; segmentIndex: number; axis: 'x' | 'y'; originalRoute: ConnectorPoint[]; originalWaypoints: ConnectorPoint[] }
  | { kind: 'draw'; tool: ToolName; start: { x: number; y: number }; current: { x: number; y: number }; startBinding?: BindingHit | null }
  | { kind: 'freedraw' | 'highlighter'; points: FreehandPoint[] }
  | {
      kind: 'eraser'
      current: { x: number; y: number }
      /** Elementos que existian ANTES del drag y fueron borrados (para undo). */
      erased: Map<ElementId, CanvasElement>
      /** Fragmentos creados por la goma de ZONA durante este drag y aun vivos. */
      addedByArea: Map<ElementId, CanvasElement>
    }
  | { kind: 'connector'; start: { x: number; y: number }; current: { x: number; y: number }; startBinding: BindingHit }

export type BindingHit = {
  elementId: ElementId
  anchor: 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'auto'
  point: { x: number; y: number }
}
export type QuickCreateAnchor = Extract<BindingHit['anchor'], 'top' | 'right' | 'bottom' | 'left'>
export type QuickCreatePreview = {
  sourceId: ElementId
  anchor: QuickCreateAnchor
} | null

export type ContextMenuState = {
  x: number
  y: number
  world: { x: number; y: number }
  targetId: ElementId | null
} | null

export type ZOrderDirection = 'forward' | 'backward' | 'front' | 'back'
type WheelMode = 'zoom' | 'pan' | null
type WheelFrameState = {
  mode: WheelMode
  raf: number | null
  zoomLogDelta: number
  panX: number
  panY: number
  cursor: { x: number; y: number }
}

export type StyleDefaults = {
  strokeColor: string
  fillColor: string | null
  strokeWidth: number
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  fontFamily: FontFamily
  fontSize: number
  textColor: string
  cornerRadius: number
}

const DEFAULT_VIEWPORT: Viewport = { width: 1, height: 1, dpr: 1 }

/**
 * DPR del backing store = devicePixelRatio nativo × escala visual (CSS zoom /
 * zoom de página de Safari). El techo NO es un flat 3: un iPad Retina ya trae
 * DPR nativo 2, así que con zoom de página >150% el cap viejo truncaba la
 * resolución y Safari estiraba el bitmap con interpolación → trazo BORROSO
 * (bug iPad 13 jul 2026). El cap real se deriva del presupuesto de píxeles del
 * canvas de iOS Safari (~16.7M px de área, ~4096px por lado), así solo actúa
 * cuando la memoria de verdad lo exige.
 */
const CANVAS_PIXEL_BUDGET = 16 * 1024 * 1024
const CANVAS_MAX_SIDE = 4096
function computeViewportDpr(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const cssZoom = el.clientWidth > 0 && rect.width > 0 ? rect.width / el.clientWidth : 1
  const width = Math.max(1, el.clientWidth)
  const height = Math.max(1, el.clientHeight)
  const rawDpr = (window.devicePixelRatio || 1) * cssZoom
  const areaCap = Math.sqrt(CANVAS_PIXEL_BUDGET / (width * height))
  const sideCap = CANVAS_MAX_SIDE / Math.max(width, height)
  return Math.max(1, Math.min(rawDpr, areaCap, sideCap))
}
const TRACKPAD_ZOOM_SENSITIVITY = 0.008
const WHEEL_ZOOM_SENSITIVITY = 0.0032
const WHEEL_ZOOM_DELTA_SOFT_ZONE = 24
const WHEEL_ZOOM_DELTA_COMPRESSION = 260
const WHEEL_MAX_ZOOM_FACTOR_PER_FRAME = 1.65
const ZOOM_LOG_EPSILON = 0.0001
const WHEEL_EPSILON = 0.01
const FREEHAND_MIN_DISTANCE_SCREEN_PX = 1.25
const DRAW3_FLOATING_UI_SELECTOR = '[data-draw3-ui]'
function normalizeWheelDelta(value: number, deltaMode: number) {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return value * 16
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return value * window.innerHeight
  return value
}

function compressWheelZoomDelta(delta: number) {
  const direction = Math.sign(delta)
  const magnitude = Math.abs(delta)
  if (magnitude <= WHEEL_ZOOM_DELTA_SOFT_ZONE) return delta
  const compressed = WHEEL_ZOOM_DELTA_SOFT_ZONE +
    Math.log1p((magnitude - WHEEL_ZOOM_DELTA_SOFT_ZONE) / WHEEL_ZOOM_DELTA_COMPRESSION) * WHEEL_ZOOM_DELTA_COMPRESSION
  return direction * compressed
}

function wheelZoomLogDelta(event: WheelEvent) {
  const delta = normalizeWheelDelta(event.deltaY, event.deltaMode)
  const highPrecision = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(delta) < 64
  const sensitivity = highPrecision ? TRACKPAD_ZOOM_SENSITIVITY : WHEEL_ZOOM_SENSITIVITY
  return -compressWheelZoomDelta(delta) * sensitivity
}

function zoomFactorFromLogDelta(logDelta: number) {
  const maxLogDelta = Math.log(WHEEL_MAX_ZOOM_FACTOR_PER_FRAME)
  return Math.exp(clamp(logDelta, -maxLogDelta, maxLogDelta))
}

function isDraw3FloatingUiTarget(target: EventTarget | null) {
  return typeof Element !== 'undefined' && target instanceof Element && Boolean(target.closest(DRAW3_FLOATING_UI_SELECTOR))
}

/**
 * "Hoja HTML": página del canvas cuyo `settings.htmlUrl` apunta a un archivo
 * HTML estático (same-origin, servido desde /public). En vez del editor de
 * canvas, se renderiza un iframe full-bleed con una barra mínima de vuelta.
 * Same-origin ⇒ sin `sandbox` (así los links `target="_top"` del HTML navegan
 * la app entera en vez de quedar atrapados dentro del iframe).
 */
function HtmlSheetView({ name, htmlUrl }: { name: string; htmlUrl: string }) {
  // MISMO affordance que el canvas (Rows3): colapsa/abre el panel de páginas
  // (DIBUJOS) para que la hoja HTML respire a todo lo ancho. Antes era una
  // flecha ← que leía como "atrás" y Daniel no la encontró como toggle
  // (feedback 2 jul 2026 + 11 ago 2026).
  const sidebarOpen = useLayoutStore((s) => s.drawSidebarOpen)
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border-subtle bg-surface/90 px-3 backdrop-blur-md">
        <button
          onClick={() => useLayoutStore.getState().toggleDrawSidebar()}
          className="icon-btn size-8"
          title={sidebarOpen ? 'Ocultar lista de dibujos' : 'Mostrar lista de dibujos'}
        >
          <Rows3 size={14} />
        </button>
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <iframe
          src={htmlUrl}
          title={name}
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    </div>
  )
}

/**
 * EMBED VIVO (11 ago 2026): capa DOM de iframes reales sincronizada a la cámara,
 * colocada DEBAJO del <canvas>. El engine PERFORA una ventana transparente por
 * cada embed con url (renderEmbedPlaceholder), así el iframe se ve a través y
 * los trazos/textos con z mayor pintan ENCIMA — anotar a mano sobre contenido
 * vivo (ej. un conectoma). Doble-click en el embed = modo interacción (el canvas
 * cede los pointer events); Escape, click fuera o cambiar de herramienta salen.
 */
function LiveEmbedLayer({ elements, camera, viewport, activeId }: {
  elements: CanvasElement[]
  camera: { x: number; y: number; zoom: number }
  viewport: { width: number; height: number }
  activeId: string | null
}) {
  const embeds = elements.filter(
    (el): el is EmbedElement => el.type === 'embed' && Boolean((el as EmbedElement).url)
  )
  if (embeds.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${viewport.width / 2}px, ${viewport.height / 2}px) scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`,
          transformOrigin: '0 0',
        }}
      >
        {embeds.map((el) => (
          <div
            key={el.id}
            className="absolute overflow-hidden rounded-xl"
            style={{
              left: el.x,
              top: el.y,
              width: el.width,
              height: el.height,
              opacity: el.opacity ?? 1,
              pointerEvents: activeId === el.id ? 'auto' : 'none',
            }}
          >
            <iframe
              src={el.url}
              title={el.url}
              className="h-full w-full border-0"
              {...(el.sandbox ? { sandbox: el.sandbox } : {})}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DrawEditor3({ pageId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingImagePointRef = useRef<{ x: number; y: number } | null>(null)
  const pasteFallbackTimerRef = useRef<number | null>(null)
  const lastNativePasteAtRef = useRef(0)
  const dragRef = useRef<DragMode>({ kind: 'none' })
  // Dirty por página + secuencia: pageId identifica de QUÉ página son los
  // cambios sin guardar (el componente no se remonta entre páginas), y seq
  // evita que un save in-flight limpie ediciones hechas durante el await.
  const dirtyRef = useRef<{ pageId: string | null; seq: number }>({ pageId: null, seq: 0 })
  const nameRef = useRef('New Page')
  const remoteVersionRef = useRef(0)
  const loadedPageIdRef = useRef<string | null>(null)
  const viewportRef = useRef<Viewport>(DEFAULT_VIEWPORT)
  const pendingInitialFitRef = useRef<CanvasElement[] | null>(null)
  const wheelFrameRef = useRef<WheelFrameState>({
    mode: null,
    raf: null,
    zoomLogDelta: 0,
    panX: 0,
    panY: 0,
    cursor: { x: 0, y: 0 },
  })
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const [loaded, setLoaded] = useState(false)
  // Settings de PÁGINA (columna `settings` de `draw`, no la config del grid).
  // Si trae `htmlUrl`, esta página es una "hoja HTML": el return final
  // renderiza <HtmlSheetView> en vez del editor de canvas.
  const [pageSettings, setPageSettings] = useState<{ htmlUrl?: string } | null>(null)
  const isHtmlSheet = Boolean(pageSettings?.htmlUrl)
  const isMobile = useIsMobile()
  // Panel de páginas (DIBUJOS): estado para el title del botón flotante.
  const sidebarOpen = useLayoutStore((s) => s.drawSidebarOpen)
  // true mientras hay un pinch TÁCTIL activo en la máquina de pointers; los
  // gesture events de WebKit (que en iPad disparan con el MISMO gesto) se
  // ignoran mientras tanto para que un solo camino maneje la cámara.
  const touchPinchActiveRef = useRef(false)
  // Lightbox de imagen (doble clic/tap sobre un elemento imagen del canvas).
  const imagePreviewUrl = useUIStore(s => s.imagePreviewUrl)
  const router = useRouter()
  // Navegacion del href de un elemento: rutas internas ("/ml-dashboard") van
  // por el router de Next (SPA, sin reload); http(s)/dominios abren en tab
  // nueva (mismo comportamiento que los elementos `embed`).
  const navigateHref = useCallback((href: string) => {
    navigateElementHref(href, router)
  }, [router])
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  // En móvil el minimapa arranca DESACTIVADO por default (tapaba la barra/burbuja).
  // Sigue siendo toggleable desde el engrane.
  useEffect(() => {
    if (isMobile) useCanvasStore.getState().updateSettings({ showMinimap: false })
  }, [isMobile])
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('New Page')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [renderTick, setRenderTick] = useState(0)
  const [hoverCursor, setHoverCursor] = useState<string | null>(null)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const [quickCreatePreview, setQuickCreatePreview] = useState<QuickCreatePreview>(null)
  const [selectionToolbarDismissed, setSelectionToolbarDismissed] = useState(false)
  // Embed VIVO en modo interacción: el canvas cede los pointer events y el iframe
  // (que vive DEBAJO, visible por la ventana perforada del engine) los recibe.
  const [activeEmbedId, setActiveEmbedId] = useState<string | null>(null)
  const [styleDefaults, setStyleDefaults] = useState<StyleDefaults>(() => ({
    strokeColor: THEMES.dark.defaultStroke,
    fillColor: null,
    strokeWidth: 2,
    strokeStyle: 'solid',
    fontFamily: 'Noto Sans',
    fontSize: 36,
    textColor: THEMES.dark.textColor,
    cornerRadius: 10,
  }))

  const elements = useCanvasStore(s => s.elements)
  const selectedIds = useCanvasStore(s => s.selectedIds)
  const activeTool = useCanvasStore(s => s.activeTool)
  const camera = useCanvasStore(s => s.camera)
  const theme = useCanvasStore(s => s.theme)
  const { resolvedTheme } = useTheme()
  const settings = useCanvasStore(s => s.settings)
  const editingId = useCanvasStore(s => s.editingId)
  const setElements = useCanvasStore(s => s.setElements)
  const setCamera = useCanvasStore(s => s.setCamera)
  const setPageId = useCanvasStore(s => s.setPageId)
  const setPageName = useCanvasStore(s => s.setPageName)
  const setAgentVersion = useCanvasStore(s => s.setAgentVersion)
  const setTheme = useCanvasStore(s => s.setTheme)
  const updateSettings = useCanvasStore(s => s.updateSettings)
  const setSelection = useCanvasStore(s => s.setSelection)
  const clearSelection = useCanvasStore(s => s.clearSelection)
  const setActiveTool = useCanvasStore(s => s.setActiveTool)
  const updateElement = useCanvasStore(s => s.updateElement)
  const addElement = useCanvasStore(s => s.addElement)
  const removeElements = useCanvasStore(s => s.removeElements)
  const setEditing = useCanvasStore(s => s.setEditing)
  const setHovered = useCanvasStore(s => s.setHovered)
  const commitHistory = useHistoryStore(s => s.commit)

  const palette = getPalette(theme === 'system' ? 'system' : theme)

  // Canvas theme is unified with the global app theme (Settings toggle). Mirror the
  // resolved global theme into the canvas store so the renderer + chrome follow it.
  // The canvas UtilityBar toggle drives the global theme, so the sync is bidirectional.
  useEffect(() => {
    setTheme(resolvedTheme)
  }, [resolvedTheme, setTheme])

  const selected = useMemo(() => elements.filter(e => selectedIds.has(e.id)), [elements, selectedIds])
  const singleSelected = selected.length === 1 ? selected[0] : null
  const selectionKey = useMemo(() => Array.from(selectedIds).sort().join('|'), [selectedIds])

  nameRef.current = name

  useEffect(() => {
    setSelectionToolbarDismissed(false)
  }, [selectionKey])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  const markDirty = useCallback(() => {
    dirtyRef.current = { pageId: useCanvasStore.getState().pageId, seq: dirtyRef.current.seq + 1 }
    setRenderTick(t => t + 1)
  }, [])

  useEffect(() => {
    if (!loaded) return
    let changed = false
    for (const element of useCanvasStore.getState().elements) {
      if (element.type !== 'text' || element.containerId || !element.autoSize) continue
      const naturalHeight = standaloneTextNaturalHeight(element)
      if (Math.abs(naturalHeight - element.height) <= 1) continue
      updateElement(element.id, { height: naturalHeight } as Partial<CanvasElement>)
      changed = true
    }
    if (changed) markDirty()
  }, [elements, loaded, markDirty, updateElement])

  const markViewDirty = useCallback(() => {
    dirtyRef.current = { pageId: useCanvasStore.getState().pageId, seq: dirtyRef.current.seq + 1 }
  }, [])

  useEffect(() => {
    const surface = containerRef.current
    if (!surface) return
    const wheelState = wheelFrameRef.current
    let gestureLastScale = 1

    const cursorFromClientPoint = (event: { clientX?: number; clientY?: number }) => {
      // clientX es px VISUAL; el camera math trabaja en px de LAYOUT del canvas.
      // Reescalar por el ratio real (≠1 bajo el CSS zoom global --ui-zoom).
      const el = canvasRef.current ?? surface
      const rect = el.getBoundingClientRect()
      const layoutW = el.clientWidth || rect.width
      const layoutH = el.clientHeight || rect.height
      if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') {
        return { x: layoutW / 2, y: layoutH / 2 }
      }
      const scaleX = rect.width > 0 ? layoutW / rect.width : 1
      const scaleY = rect.height > 0 ? layoutH / rect.height : 1
      return {
        x: clamp((event.clientX - rect.left) * scaleX, 0, layoutW),
        y: clamp((event.clientY - rect.top) * scaleY, 0, layoutH),
      }
    }

    const flushWheelFrame = () => {
      wheelState.raf = null
      const vp = viewportRef.current
      if (vp.width <= 1 || vp.height <= 1) return

      if (wheelState.mode === 'zoom' && Math.abs(wheelState.zoomLogDelta) > ZOOM_LOG_EPSILON) {
        const logDelta = wheelState.zoomLogDelta
        wheelState.zoomLogDelta = 0
        const factor = zoomFactorFromLogDelta(logDelta)
        setCamera(zoomCamera(useCanvasStore.getState().camera, factor, wheelState.cursor, vp))
        markViewDirty()
      } else if (
        wheelState.mode === 'pan' &&
        (Math.abs(wheelState.panX) > WHEEL_EPSILON || Math.abs(wheelState.panY) > WHEEL_EPSILON)
      ) {
        const dx = wheelState.panX
        const dy = wheelState.panY
        wheelState.panX = 0
        wheelState.panY = 0
        setCamera(panCamera(useCanvasStore.getState().camera, -dx, -dy))
        markViewDirty()
      }

      if (
        Math.abs(wheelState.zoomLogDelta) > ZOOM_LOG_EPSILON ||
        Math.abs(wheelState.panX) > WHEEL_EPSILON ||
        Math.abs(wheelState.panY) > WHEEL_EPSILON
      ) {
        wheelState.raf = requestAnimationFrame(flushWheelFrame)
      } else {
        wheelState.mode = null
      }
    }

    const scheduleWheelFrame = () => {
      if (wheelState.raf !== null) return
      wheelState.raf = requestAnimationFrame(flushWheelFrame)
    }

    const resetWheelMode = (mode: Exclude<WheelMode, null>) => {
      if (wheelState.mode === mode) return
      wheelState.mode = mode
      wheelState.zoomLogDelta = 0
      wheelState.panX = 0
      wheelState.panY = 0
    }

    const handleNativeWheel = (event: WheelEvent) => {
      if (isDraw3FloatingUiTarget(event.target)) return

      event.preventDefault()
      event.stopPropagation()

      const zooming = event.ctrlKey || event.metaKey

      if (zooming) {
        resetWheelMode('zoom')
        wheelState.cursor = cursorFromClientPoint(event)
        wheelState.zoomLogDelta += wheelZoomLogDelta(event)
      } else {
        resetWheelMode('pan')
        wheelState.panX += normalizeWheelDelta(event.deltaX, event.deltaMode)
        wheelState.panY += normalizeWheelDelta(event.deltaY, event.deltaMode)
      }

      scheduleWheelFrame()
    }

    const handleGestureStart = (event: Event) => {
      if (isDraw3FloatingUiTarget(event.target)) return

      event.preventDefault()
      event.stopPropagation()
      // Pinch táctil activo: la máquina de pointers ya maneja este gesto. Los
      // gesture events de WebKit disparan TAMBIÉN con touch en iPadOS — sin
      // este guard ambos caminos actualizaban la cámara y el zoom saltaba.
      if (touchPinchActiveRef.current) return
      const gestureEvent = event as Event & { scale?: number; clientX?: number; clientY?: number }
      gestureLastScale = Number.isFinite(gestureEvent.scale) && gestureEvent.scale ? gestureEvent.scale : 1
      resetWheelMode('zoom')
      wheelState.cursor = cursorFromClientPoint(gestureEvent)
    }

    const handleGestureChange = (event: Event) => {
      if (isDraw3FloatingUiTarget(event.target)) return

      event.preventDefault()
      event.stopPropagation()
      if (touchPinchActiveRef.current) return
      const gestureEvent = event as Event & { scale?: number; clientX?: number; clientY?: number }
      const scale = Number.isFinite(gestureEvent.scale) && gestureEvent.scale ? gestureEvent.scale : 1
      const factor = gestureLastScale > 0 ? scale / gestureLastScale : scale
      gestureLastScale = scale
      if (!Number.isFinite(factor) || factor <= 0) return
      resetWheelMode('zoom')
      wheelState.cursor = cursorFromClientPoint(gestureEvent)
      wheelState.zoomLogDelta += Math.log(factor)
      scheduleWheelFrame()
    }

    const handleGestureEnd = (event: Event) => {
      if (isDraw3FloatingUiTarget(event.target)) return

      event.preventDefault()
      event.stopPropagation()
      gestureLastScale = 1
    }

    surface.addEventListener('wheel', handleNativeWheel, { passive: false, capture: true })
    surface.addEventListener('gesturestart', handleGestureStart, { passive: false })
    surface.addEventListener('gesturechange', handleGestureChange, { passive: false })
    surface.addEventListener('gestureend', handleGestureEnd, { passive: false })

    return () => {
      surface.removeEventListener('wheel', handleNativeWheel, { capture: true })
      surface.removeEventListener('gesturestart', handleGestureStart)
      surface.removeEventListener('gesturechange', handleGestureChange)
      surface.removeEventListener('gestureend', handleGestureEnd)
      if (wheelState.raf !== null) cancelAnimationFrame(wheelState.raf)
      wheelState.raf = null
      wheelState.mode = null
      wheelState.zoomLogDelta = 0
      wheelState.panX = 0
      wheelState.panY = 0
    }
  }, [markViewDirty, setCamera])

  useEffect(() => {
    setStyleDefaults(prev => {
      const strokeWasThemeDefault = Object.values(THEMES).some(item => item.defaultStroke === prev.strokeColor)
      const textWasThemeDefault = Object.values(THEMES).some(item => item.textColor === prev.textColor)
      const fillWasThemeDefault = prev.fillColor === null || Object.values(THEMES).some(item => item.defaultFill === prev.fillColor)
      return {
        ...prev,
        strokeColor: strokeWasThemeDefault ? palette.defaultStroke : prev.strokeColor,
        fillColor: fillWasThemeDefault ? palette.defaultFill : prev.fillColor,
        textColor: textWasThemeDefault ? palette.textColor : prev.textColor,
      }
    })
  }, [palette])

  const applyLocalOps = useCallback((ops: Op[]) => {
    if (ops.length === 0) return
    const s = useCanvasStore.getState()
    const { newState } = applyOps({
      elements: s.elements,
      camera: s.camera,
      pageName: s.pageName,
      theme: s.theme,
      agentVersion: s.agentVersion,
    }, ops, 'human')
    setElements(newState.elements)
    if (newState.camera) setCamera(newState.camera)
    // Theme is unified with the global app theme (mirrored via useTheme); per-page
    // setTheme ops are intentionally ignored so the canvas always follows Settings.
    setAgentVersion(newState.agentVersion)
    markDirty()
  }, [markDirty, setAgentVersion, setCamera, setElements])

  const commitAndApply = useCallback((label: string, forward: Op[], reverse: Op[]) => {
    if (forward.length === 0 || reverse.length === 0) return
    commitHistory({ label, forward, reverse })
    applyLocalOps(forward)
  }, [applyLocalOps, commitHistory])

  const recordHistory = useCallback((label: string, forward: Op[], reverse: Op[]) => {
    if (forward.length === 0 || reverse.length === 0) return
    commitHistory({ label, forward, reverse })
  }, [commitHistory])

  const undo = useCallback(() => {
    const reverse = useHistoryStore.getState().consumeUndo()
    if (reverse) applyLocalOps(reverse)
  }, [applyLocalOps])

  const redo = useCallback(() => {
    const forward = useHistoryStore.getState().consumeRedo()
    if (forward) applyLocalOps(forward)
  }, [applyLocalOps])

  const deleteSelected = useCallback(() => {
    const s = useCanvasStore.getState()
    const selectedUnlocked = Array.from(s.selectedIds).filter(id => !s.elements.find(el => el.id === id)?.locked)
    const ids = expandDeletionIds(s.elements, selectedUnlocked)
    if (ids.length === 0) return
    const deleted = s.elements.filter(el => ids.includes(el.id))
    commitAndApply('Delete selection', [{ kind: 'delete', ids }], deleted.map(element => ({ kind: 'add', element }) as Op))
    clearSelection()
  }, [clearSelection, commitAndApply])

  const duplicateSelection = useCallback(() => {
    const state = useCanvasStore.getState()
    const sourceIds = Array.from(state.selectedIds)
    if (sourceIds.length === 0) return
    const { elements: copies, topLevelIds } = duplicateElements(sourceIds, state.elements)
    if (copies.length === 0) return
    for (const copy of copies) addElement(copy)
    recordHistory('Duplicate selection', copies.map(element => ({ kind: 'add', element }) as Op), [{ kind: 'delete', ids: copies.map(copy => copy.id) }])
    setSelection(topLevelIds.length > 0 ? topLevelIds : copies.map(copy => copy.id))
    markDirty()
  }, [addElement, markDirty, recordHistory, setSelection])

  const quickCreateFromAnchor = useCallback((sourceId: ElementId, anchor: QuickCreateAnchor) => {
    const state = useCanvasStore.getState()
    const source = state.elements.find(el => el.id === sourceId)
    if (!source || source.locked || !isBindable(source)) return

    const created = createQuickCreateBundle(source, anchor, state.elements, styleDefaults)
    if (!created) return

    commitAndApply(
      'Quick create connected element',
      created.elements.map(element => ({ kind: 'add', element }) as Op),
      [{ kind: 'delete', ids: created.elements.map(element => element.id) }],
    )
    setSelection([created.targetId])
    setActiveTool('select')
    setQuickCreatePreview(null)
  }, [commitAndApply, setActiveTool, setSelection, styleDefaults])

  const groupSelection = useCallback(() => {
    const state = useCanvasStore.getState()
    const ids = normalizeGroupSelectionIds(state.elements, Array.from(state.selectedIds))
      .filter(id => !state.elements.find(el => el.id === id)?.locked)
    if (ids.length < 2) return

    const boxes = ids
      .map(id => state.elements.find(el => el.id === id))
      .filter(Boolean)
      .map(el => bboxFromElement(el as CanvasElement))
    const bounds = bboxUnion(boxes)
    if (!bounds) return

    const group = createGroup({
      childIds: ids,
      bbox: { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height },
    })
    commitAndApply(
      'Group selection',
      [{ kind: 'group', ids, groupId: group.id }],
      [{ kind: 'ungroup', groupId: group.id }],
    )
    setSelection([group.id])
  }, [commitAndApply, setSelection])

  const ungroupSelection = useCallback(() => {
    const state = useCanvasStore.getState()
    const groups = selectedGroupElements(state.elements, Array.from(state.selectedIds))
      .filter(group => !group.locked)
    if (groups.length === 0) return

    commitAndApply(
      'Ungroup selection',
      groups.map(group => ({ kind: 'ungroup', groupId: group.id } as Op)),
      groups.map(group => ({ kind: 'group', ids: group.childIds, groupId: group.id } as Op)),
    )
    setSelection(groups.flatMap(group => group.childIds))
  }, [commitAndApply, setSelection])

  const lockSelection = useCallback(() => {
    const state = useCanvasStore.getState()
    const ids = Array.from(state.selectedIds)
    if (ids.length === 0) return
    const targets = state.elements.filter(el => ids.includes(el.id))
    // Toggle: si alguno NO esta locked → lock todos. Si todos locked → unlock todos.
    const anyUnlocked = targets.some(el => !el.locked)
    const nextLocked = anyUnlocked
    commitAndApply(
      nextLocked ? 'Lock selection' : 'Unlock selection',
      targets.map(el => ({ kind: 'update', id: el.id, patch: { locked: nextLocked } } as Op)),
      targets.map(el => ({ kind: 'update', id: el.id, patch: { locked: el.locked } } as Op)),
    )
  }, [commitAndApply])

  const editSelection = useCallback(() => {
    const state = useCanvasStore.getState()
    const target = state.elements.find(el => state.selectedIds.has(el.id))
    if (!target || target.locked) return
    if (target.type === 'text' || target.type === 'sticky') {
      setEditing(target.id)
      return
    }
    if (target.type === 'connector') {
      const label = window.prompt('Connector label', target.label ?? '')
      if (label != null) {
        commitAndApply(
          'Update connector label',
          [({ kind: 'update', id: target.id, patch: { label } } as Op)],
          [({ kind: 'update', id: target.id, patch: { label: target.label } } as Op)],
        )
      }
      return
    }
    if (target.type === 'frame') {
      const title = window.prompt('Section title', target.title ?? '')
      if (title != null) {
        commitAndApply(
          'Update frame title',
          [({ kind: 'update', id: target.id, patch: { title } } as Op)],
          [({ kind: 'update', id: target.id, patch: { title: target.title } } as Op)],
        )
      }
      return
    }
    if (isShape(target)) {
      const existing = state.elements.find(el => el.type === 'text' && (el as TextElement).containerId === target.id) as TextElement | undefined
      if (existing) {
        setEditing(existing.id)
        return
      }
      const boundText = createBoundTextForShape(target, styleDefaults, palette)
      addElement(boundText)
      recordHistory('Add shape label', [{ kind: 'add', element: boundText }], [{ kind: 'delete', ids: [boundText.id] }])
      setEditing(boundText.id)
      markDirty()
    }
  }, [addElement, commitAndApply, markDirty, palette, recordHistory, setEditing, styleDefaults.fontFamily, styleDefaults.fontSize])

  const addCommentToSelection = useCallback(() => {
    const state = useCanvasStore.getState()
    const selectedElements = state.elements.filter(el => state.selectedIds.has(el.id) && !el.locked)
    const bounds = bboxUnion(selectedElements.map(bboxFromElement))
    if (!bounds) return
    const comment = createComment({
      x: bounds.maxX + 24,
      y: bounds.minY,
      body: 'Comentario:',
      authorName: capital(NOMBRE_DUENO()),
    })
    addElement(comment)
    recordHistory('Add comment', [{ kind: 'add', element: comment }], [{ kind: 'delete', ids: [comment.id] }])
    setSelection([comment.id])
    markDirty()
  }, [addElement, markDirty, recordHistory, setSelection])

  const alignSelection = useCallback((axis: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => {
    const state = useCanvasStore.getState()
    const targets = state.elements.filter(el => state.selectedIds.has(el.id) && !el.locked)
    if (targets.length < 2) return
    commitAndApply(
      'Align selection',
      [{ kind: 'align', ids: targets.map(el => el.id), axis }],
      targets.map(el => ({ kind: 'update', id: el.id, patch: { x: el.x, y: el.y } } as Op)),
    )
  }, [commitAndApply])

  const distributeSelection = useCallback((axis: 'horizontal' | 'vertical') => {
    const state = useCanvasStore.getState()
    const targets = state.elements.filter(el => state.selectedIds.has(el.id) && !el.locked)
    if (targets.length < 3) return
    commitAndApply(
      'Distribute selection',
      [{ kind: 'distribute', ids: targets.map(el => el.id), axis }],
      targets.map(el => ({ kind: 'update', id: el.id, patch: { x: el.x, y: el.y } } as Op)),
    )
  }, [commitAndApply])

  const zOrderSelection = useCallback((direction: ZOrderDirection) => {
    const s = useCanvasStore.getState()
    const ids = Array.from(s.selectedIds)
    if (ids.length === 0) return
    const allZ = s.elements.map(el => el.zIndex ?? 0)
    const maxZ = Math.max(...allZ, 0)
    const minZ = Math.min(...allZ, 0)
    const selectedElements = s.elements.filter(el => ids.includes(el.id))
    const forward = selectedElements.map((el, index) => ({
      kind: 'update',
      id: el.id,
      patch: {
        zIndex:
          direction === 'front' ? maxZ + 1 + index :
          direction === 'back' ? minZ - 1 - index :
          direction === 'forward' ? (el.zIndex ?? 0) + 1 :
          (el.zIndex ?? 0) - 1,
      },
    } as Op))
    const reverse = selectedElements.map(el => ({
      kind: 'update',
      id: el.id,
      patch: { zIndex: el.zIndex },
    } as Op))
    const label = {
      forward: 'Bring forward',
      backward: 'Send backward',
      front: 'Bring to front',
      back: 'Send to back',
    }[direction]
    commitAndApply(label, forward, reverse)
  }, [commitAndApply])

  const flipSelection = useCallback((axis: 'x' | 'y') => {
    const s = useCanvasStore.getState()
    const ids = Array.from(s.selectedIds)
    if (ids.length === 0) return
    const key = axis === 'x' ? 'flipX' : 'flipY'
    const targets = s.elements.filter(el => ids.includes(el.id) && !el.locked && canFlipElement(el))
    if (targets.length === 0) return
    commitAndApply(
      axis === 'x' ? 'Flip horizontal' : 'Flip vertical',
      targets.map(el => ({ kind: 'update', id: el.id, patch: { [key]: !el[key] } } as Op)),
      targets.map(el => ({ kind: 'update', id: el.id, patch: { [key]: el[key] ?? false } } as Op)),
    )
  }, [commitAndApply])

  // Punto local al canvas (CSS px desde su esquina sup-izq).
  // Preferimos offsetX/offsetY del evento nativo: el engine los calcula relativos
  // al canvas, inmunes a la discrepancia clientY-vs-getBoundingClientRect que
  // aparece en el WKWebview de Tauri por `env(safe-area-inset-top)` / CSS `zoom`
  // (en desktop la linea arrancaba "un poco mas arriba" del cursor). Cuando el
  // evento es sintetico (drop/paste) no hay nativeEvent → fallback a client - rect.
  const canvasLocalPoint = useCallback((event: { clientX: number; clientY: number; nativeEvent?: unknown }) => {
    const canvas = canvasRef.current
    const native = (event as { nativeEvent?: { offsetX?: number; offsetY?: number; target?: EventTarget | null } }).nativeEvent
    const rect = canvas?.getBoundingClientRect()
    // Escala visual acumulada del canvas (CSS zoom global --ui-zoom, etc.):
    // el canvas dibuja en px de LAYOUT; clientX/rect viven en px VISUALES.
    const zoom = canvas && rect && canvas.offsetWidth > 0 && rect.width > 0 ? rect.width / canvas.offsetWidth : 1
    const visualX = event.clientX - (rect?.left ?? 0)
    const visualY = event.clientY - (rect?.top ?? 0)
    if (
      canvas && native && native.target === canvas &&
      Number.isFinite(native.offsetX) && Number.isFinite(native.offsetY)
    ) {
      // offsetX/offsetY es la fuente preferida (inmune al desfase rect-vs-client
      // del WKWebview de Tauri). PERO su convencion varia: por spec es px de
      // LAYOUT, y algunos motores/eventos sinteticos lo dan en px VISUALES.
      // Calibrar por evento con el eje X contra clientX y aplicar a ambos ejes.
      const offX = native.offsetX as number
      const offY = native.offsetY as number
      if (Math.abs(zoom - 1) > 0.001) {
        const errAsLayout = Math.abs(offX - visualX / zoom)
        const errAsVisual = Math.abs(offX - visualX)
        if (errAsVisual < errAsLayout) return { x: offX / zoom, y: offY / zoom }
      }
      return { x: offX, y: offY }
    }
    // Fallback (drop/paste/samples sin offsetX): visual → layout.
    return { x: visualX / zoom, y: visualY / zoom }
  }, [])

  const worldPointFromEvent = useCallback((event: { clientX: number; clientY: number; nativeEvent?: unknown }) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    // TODO el pipeline vive en px de LAYOUT: el punto es offsetX/offsetY
    // (canvasLocalPoint) y las dims del viewport son offsetWidth/offsetHeight
    // del canvas (= viewport.width con que renderiza el engine). NUNCA mezclar
    // con getBoundingClientRect aqui: bajo el CSS zoom global (--ui-zoom) rect
    // devuelve px visuales y la conversion screenToWorld se descalibra (el
    // trazo aterrizaba lejos del cursor en la desktop app).
    return screenToWorld(
      canvasLocalPoint(event),
      useCanvasStore.getState().camera,
      { width: canvas.offsetWidth || 1, height: canvas.offsetHeight || 1 },
    )
  }, [canvasLocalPoint])

  const screenPointFromEvent = useCallback((event: { clientX: number; clientY: number; nativeEvent?: unknown }) => {
    return canvasLocalPoint(event)
  }, [canvasLocalPoint])

  const freehandPointsFromEvent = useCallback((event: React.PointerEvent<HTMLCanvasElement>): FreehandPoint[] => {
    return coalescedPointerSamples(event.nativeEvent).map(sample => ({
      ...worldPointFromEvent({
        clientX: sample.clientX,
        clientY: sample.clientY,
        nativeEvent: sample,
      }),
      pressure: pointerPressure(sample),
    }))
  }, [worldPointFromEvent])

  const applyPatchToIds = useCallback((ids: ElementId[], patch: Partial<CanvasElement>, remember?: Partial<StyleDefaults>) => {
    const s = useCanvasStore.getState()
    if (ids.length === 0) return
    const current = s.elements.filter(el => ids.includes(el.id))
    if (current.length === 0) return
    recordHistory(
      'Update style',
      current.map(el => ({ kind: 'update', id: el.id, patch } as Op)),
      current.map(el => ({ kind: 'update', id: el.id, patch: elementPatchSnapshot(el) } as Op)),
    )
    for (const id of ids) updateElement(id, patch)
    if (remember) setStyleDefaults(prev => ({ ...prev, ...remember }))
    markDirty()
  }, [markDirty, recordHistory, updateElement])

  const applyPatchToSelection = useCallback((patch: Partial<CanvasElement>, remember?: Partial<StyleDefaults>) => {
    applyPatchToIds(Array.from(useCanvasStore.getState().selectedIds), patch, remember)
  }, [applyPatchToIds])

  const morphSelectedShape = useCallback((id: ElementId, shapeType: ShapeElementType) => {
    const state = useCanvasStore.getState()
    const target = state.elements.find(el => el.id === id)
    if (!target || !isShape(target) || target.locked || target.type === shapeType) return

    const text = state.elements.find(el => el.type === 'text' && (el as TextElement).containerId === target.id) as TextElement | undefined
    const forwardPatch = shapeMorphPatch(target, shapeType)
    const nextShape = { ...target, ...forwardPatch, type: shapeType } as ShapeBase & CanvasElement
    const reversePatch = shapeMorphPatch(target, target.type as ShapeElementType)
    const forward: Op[] = [
      { kind: 'morphShape', id: target.id, shapeType, patch: forwardPatch } as Op,
    ]
    const reverse: Op[] = [
      { kind: 'morphShape', id: target.id, shapeType: target.type as ShapeElementType, patch: reversePatch } as Op,
    ]

    if (text) {
      forward.push({ kind: 'update', id: text.id, patch: shapeTextBox(nextShape) } as Op)
      reverse.push({ kind: 'update', id: text.id, patch: pickTextBoxPatch(text) } as Op)
    }

    commitAndApply('Change shape', forward, reverse)
  }, [commitAndApply])

  const {
    pasteCanvasClipboard,
    copySelectionToClipboard,
    cutSelectionToClipboard,
    createImageFromDataUrl,
    pasteImageFromClipboardData,
    pasteImageFromSystemClipboard,
    pasteTextFromClipboard,
    pasteFromClipboard,
  } = useCanvasClipboard({
    viewport,
    viewportRef,
    styleDefaults,
    addElement,
    recordHistory,
    markDirty,
    setSelection,
    deleteSelected,
    lastNativePasteAtRef,
    pasteFallbackTimerRef,
    createStandaloneText: createStandaloneTextElement,
  })

  const save = useCallback(async () => {
    if (!loaded) return
    // Hoja HTML: no hay canvas que editar, el autosave (interval/unmount/
    // visibilitychange) jamás debe escribir page_elements para esta página.
    if (isHtmlSheet) return
    // Solo persistir cambios que pertenecen a ESTA página; un dirty heredado
    // de otra página (flush in-flight) jamás debe escribirse aquí.
    if (dirtyRef.current.pageId !== pageId) return
    if (useCanvasStore.getState().pageId !== pageId) return
    const snapshotSeq = dirtyRef.current.seq
    setSaving(true)
    try {
      const s = useCanvasStore.getState()
      const cloudSaved = await saveDrawData(
        pageId,
        s.elements as unknown as readonly Record<string, unknown>[],
        nameRef.current,
        {},
        {
          schemaVersion: 3,
          theme: s.theme,
          camera: { x: s.camera.x, y: s.camera.y, scale: s.camera.zoom },
          settings: s.settings,
        },
      )
      if (!cloudSaved) {
        // El save NO llegó al server (quedó solo local): mantener dirty para
        // que el autosave reintente cada 2s hasta lograrlo. Jamás fingir éxito.
        console.warn('[draw3] cloud save pendiente, reintentando…')
        return
      }
      const updatedAt = new Date().toISOString()
      useDrawStore.getState().setPageCache(pageId, {
        elements: s.elements as unknown as readonly Record<string, unknown>[],
        files: {},
        name: nameRef.current,
        theme: s.theme,
        camera: { x: s.camera.x, y: s.camera.y, scale: s.camera.zoom },
        settings: s.settings,
        updatedAt,
      })
      // Si hubo ediciones DURANTE el save (seq avanzó), sigue dirty y el
      // próximo autosave las persiste; solo limpiar si nada cambió.
      if (dirtyRef.current.seq === snapshotSeq) dirtyRef.current = { pageId: null, seq: snapshotSeq }
    } catch (err) {
      console.error('[draw3] save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [loaded, pageId, isHtmlSheet])

  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  }, [save])

  useEffect(() => {
    return () => {
      if (dirtyRef.current.pageId !== null) void saveRef.current()
    }
  }, [pageId])

  useEffect(() => {
    const flushPendingView = () => {
      if (dirtyRef.current.pageId !== null) void saveRef.current()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPendingView()
    }
    window.addEventListener('pagehide', flushPendingView)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flushPendingView)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Load page data and migrate legacy SFElement records into v3 elements.
  useEffect(() => {
    let cancelled = false
    // Resetear al cambiar de página: evita que el htmlUrl de la página anterior
    // siga renderizando la hoja HTML mientras carga el fetch de la nueva.
    setPageSettings(null)
    setActiveEmbedId(null)
    const canvasState = useCanvasStore.getState()
    const cached = useDrawStore.getState().getPageCache(pageId)
    const alreadyWarm = loadedPageIdRef.current === pageId || (
      canvasState.pageId === pageId &&
      (canvasState.elements.length > 0 || canvasState.pageName !== 'Untitled' || canvasState.agentVersion > 0)
    )

    if (alreadyWarm) {
      setName(canvasState.pageName || nameRef.current)
      loadedPageIdRef.current = pageId
      setLoaded(true)
    } else if (cached) {
      const cachedName = cached.name || 'New Page'
      const cachedFiles = (cached.files ?? {}) as Record<string, { dataURL?: string }>
      const cachedElements = cached.elements
        .map((raw, index) => normalizeElement(raw, cachedFiles, index))
        .filter(Boolean) as CanvasElement[]
      setName(cachedName)
      setPageName(cachedName)
      setElements(cachedElements)
      // Theme follows the global app theme (mirrored via useTheme), not the page snapshot.
      if (cached.settings && typeof cached.settings === 'object') {
        updateSettings(sanitizeCanvasSettings(cached.settings))
      }
      if (cached.camera) {
        setCamera({ x: cached.camera.x, y: cached.camera.y, zoom: (cached.camera as { zoom?: number; scale?: number }).zoom ?? cached.camera.scale ?? 1 })
        pendingInitialFitRef.current = null
      } else {
        pendingInitialFitRef.current = cachedElements
      }
      loadedPageIdRef.current = pageId
      setLoaded(true)
    } else {
      // Cold load: limpiar el store para que el canvas no muestre (ni pueda
      // persistir) elementos de la página anterior, y para que un paste hecho
      // durante la carga pueda mergearse con el snapshot del server sin riesgo.
      setElements([])
      clearSelection()
      setLoaded(false)
    }

    setPageId(pageId)
    const fetchStartedAt = Date.now()
    getDrawData(pageId).then((page) => {
      if (cancelled || !page) return
      setPageSettings(page.page_settings ?? null)
      const pageName = page.name || 'New Page'
      const rawElements = (page.page_elements?.elements ?? []) as Record<string, unknown>[]
      const files = (page.page_elements?.files ?? {}) as Record<string, { dataURL?: string }>
      const converted = rawElements.map((raw, index) => normalizeElement(raw, files, index)).filter(Boolean) as CanvasElement[]
      const loadedCamera = page.page_elements?.camera
      const loadedSettings = page.page_elements?.settings
      // PRINCIPIO (anti lost-update): una página que ya está VIVA en pantalla
      // jamás se REEMPLAZA con una respuesta del server — solo se mergea
      // (misma semántica que el canal realtime) o, si la respuesta es más
      // vieja que nuestro último save exitoso, se DESCARTA. El replace
      // incondicional queda solo para la primera carga de la página.
      const storeLive = useCanvasStore.getState().pageId === pageId
      const liveHere = storeLive && loadedPageIdRef.current === pageId
      const dirtyHere = storeLive && dirtyRef.current.pageId === pageId
      if (liveHere && getLastCloudSaveAt(pageId) > fetchStartedAt) {
        // La respuesta cargó estado de ANTES de un save nuestro que ya llegó
        // al cloud: es una foto vieja. Tirarla (el server ya tiene lo nuestro).
        setLoaded(true)
        return
      }
      if (liveHere || dirtyHere) {
        setName(pageName)
        setPageName(pageName)
        setElements(mergeRemoteElements(useCanvasStore.getState().elements, converted))
        setAgentVersion(page.agent_version ?? 0)
        remoteVersionRef.current = page.agent_version ?? 0
        useDrawStore.getState().setLastPageId(pageId)
        loadedPageIdRef.current = pageId
        setLoaded(true)
        return
      }
      setName(pageName)
      setPageName(pageName)
      setElements(converted)
      setAgentVersion(page.agent_version ?? 0)
      remoteVersionRef.current = page.agent_version ?? 0
      // Theme follows the global app theme (mirrored via useTheme), not the page payload.
      if (alreadyWarm) {
        pendingInitialFitRef.current = null
      } else if (loadedCamera) {
        setCamera({ x: loadedCamera.x, y: loadedCamera.y, zoom: (loadedCamera as { zoom?: number; scale?: number }).zoom ?? loadedCamera.scale ?? 1 })
        pendingInitialFitRef.current = null
      } else if (converted.length > 0 && viewportRef.current.width > 1) {
        const bounds = bboxUnion(converted.map(bboxFromElement))
        if (bounds) setCamera(fitToBBox(bounds, viewportRef.current, 120))
        pendingInitialFitRef.current = null
      } else {
        pendingInitialFitRef.current = converted
      }
      if (!alreadyWarm && loadedSettings && typeof loadedSettings === 'object') {
        updateSettings(sanitizeCanvasSettings(loadedSettings))
      }
      useDrawStore.getState().setLastPageId(pageId)
      loadedPageIdRef.current = pageId
      setLoaded(true)
    }).catch((err) => {
      console.error('[draw3] load failed:', err)
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [clearSelection, pageId, setAgentVersion, setCamera, setElements, setPageId, setPageName, setTheme, updateSettings])

  useEffect(() => {
    if (!loaded || viewport.width <= 1) return
    const pending = pendingInitialFitRef.current
    if (!pending || pending.length === 0) return
    const bounds = bboxUnion(pending.map(bboxFromElement))
    if (bounds) setCamera(fitToBBox(bounds, viewport, 120))
    pendingInitialFitRef.current = null
  }, [loaded, setCamera, viewport])

  const { flash, triggerFlash } = useAgentFlash()
  const { broadcastCursor } = useCanvasPresence({ loaded, pageId })

  useCanvasRealtime({
    loaded,
    pageId,
    remoteVersionRef,
    nameRef,
    setName,
    setElements,
    setAgentVersion,
    setPageName,
    updateSettings,
    setRenderTick,
    normalizeElement,
    sanitizeCanvasSettings,
    onRemoteChanges: triggerFlash,
  })

  // Resize canvas.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const resize = () => {
      // Px de LAYOUT (clientWidth), NO getBoundingClientRect: bajo el CSS zoom
      // global rect devuelve px visuales y el canvas quedaba sobredimensionado
      // (recortado) y descalibrado contra offsetX. El zoom visual se compensa
      // en el dpr para no perder nitidez.
      const dpr = computeViewportDpr(el)
      setViewport(prev => {
        const width = Math.max(1, el.clientWidth)
        const height = Math.max(1, el.clientHeight)
        if (prev.width === width && prev.height === height && prev.dpr === dpr) return prev
        return { width, height, dpr }
      })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    // Backup del observer: resize de ventana y vuelta de visibilidad. Cubre
    // los casos donde el observer se pierde un cambio (HMR, tab en background)
    // y el canvas quedaria "cortado" pintando con un viewport stale.
    window.addEventListener('resize', resize)
    const onVisible = () => { if (!document.hidden) resize() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // Render canvas from v3 state.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Self-healing: si el estado `viewport` quedo stale frente al contenedor
    // real (observer perdido por HMR/tab oculta), re-medir y dejar que el
    // proximo render pinte al tamano correcto. Sin esto el canvas se ve
    // "cortado" y el zoom-en-cursor se descalibra.
    const container = containerRef.current
    if (container && (Math.abs(container.clientWidth - viewport.width) > 1 || Math.abs(container.clientHeight - viewport.height) > 1)) {
      const dpr = computeViewportDpr(container)
      setViewport({ width: Math.max(1, container.clientWidth), height: Math.max(1, container.clientHeight), dpr })
      return
    }
    canvas.width = Math.floor(viewport.width * viewport.dpr)
    canvas.height = Math.floor(viewport.height * viewport.dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    render(canvas, {
      elements,
      camera,
      selectedIds,
      hoveredId: useCanvasStore.getState().hoveredId,
      editingId,
      palette,
      viewport,
      gridStyle: settings.gridStyle,
      gridSize: settings.gridSize,
      selectionBox: dragRef.current.kind === 'select-box'
        ? { start: dragRef.current.start, current: dragRef.current.current }
        : null,
      activeEmbedId,
      onImageLoad: () => setRenderTick(t => t + 1),
    })
    drawDraft(canvas, dragRef.current, camera, viewport, palette, styleDefaults)
    drawSnapGuides(canvas, snapGuides, camera, viewport)
    drawQuickCreatePreview(canvas, quickCreatePreview, elements, camera, viewport)
  }, [activeEmbedId, camera, editingId, elements, palette, quickCreatePreview, renderTick, selectedIds, settings.gridSize, settings.gridStyle, snapGuides, styleDefaults, viewport])

  useEffect(() => {
    const id = setInterval(() => { void save() }, 2000)
    return () => clearInterval(id)
  }, [save])

  useCanvasShortcuts({
    clearSelection,
    setActiveTool,
    deleteSelected,
    undo,
    redo,
    groupSelection,
    ungroupSelection,
    duplicateSelection,
    copySelectionToClipboard,
    cutSelectionToClipboard,
    pasteFromClipboard,
    pasteFallbackTimerRef,
    lastNativePasteAtRef,
    viewportRef,
    setCamera,
    markViewDirty,
    zOrderSelection,
  })

  const eraseAtPoint = useCallback((
    point: { x: number; y: number },
    session: { erased: Map<ElementId, CanvasElement>; addedByArea: Map<ElementId, CanvasElement> },
  ) => {
    const state = useCanvasStore.getState()

    if (state.eraserMode === 'area') {
      // Goma de ZONA: solo borra TINTA (freedraw/highlighter), partiendo el
      // trazo por donde pasa la goma. Los demas elementos no se tocan.
      const target = topFreehandAtPoint(state.elements, point, state.camera.zoom)
      if (!target) return
      const fragments = splitFreehandByErase(target, point, eraserRadiusWorld(state.camera.zoom))
      if (!fragments) return
      // Si el trazo era un fragmento creado en ESTE mismo drag, nunca existio
      // para el historial: sale de added sin entrar a erased.
      if (session.addedByArea.has(target.id)) session.addedByArea.delete(target.id)
      else session.erased.set(target.id, structuredClone(target))
      removeElements([target.id])
      for (const fragment of fragments) {
        addElement(fragment)
        session.addedByArea.set(fragment.id, fragment)
      }
      clearSelection()
      markDirty()
      return
    }

    const ids = eraserHitIds(state.elements, point, state.camera.zoom)
    const freshIds = ids.filter(id => !session.erased.has(id))
    if (freshIds.length === 0) return
    const deleted = state.elements.filter(el => freshIds.includes(el.id))
    for (const element of deleted) session.erased.set(element.id, structuredClone(element))
    removeElements(freshIds)
    clearSelection()
    markDirty()
  }, [addElement, clearSelection, markDirty, removeElements])

  const { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleDoubleClick } = useCanvasPointerMachine({
    palette,
    selected,
    activeTool,
    addElement,
    camera,
    canvasRef,
    clearSelection,
    commitAndApply,
    dragRef,
    elements,
    eraseAtPoint,
    fileInputRef,
    freehandPointsFromEvent,
    markDirty,
    markViewDirty,
    navigateHref,
    pendingImagePointRef,
    recordHistory,
    screenPointFromEvent,
    selectedIds,
    setActiveTool,
    setCamera,
    setEditing,
    setHoverCursor,
    setHovered,
    setRenderTick,
    setSelection,
    setSelectionToolbarDismissed,
    setSnapGuides,
    settings,
    styleDefaults,
    touchPinchActiveRef,
    updateElement,
    viewport,
    viewportRef,
    worldPointFromEvent,
  })

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'))
    if (files.length === 0) return
    const point = worldPointFromEvent(event)
    void fileToDataUrl(files[0]).then(dataUrl => createImageFromDataUrl(dataUrl, { x: point.x, y: point.y, alt: files[0].name }))
  }, [createImageFromDataUrl, worldPointFromEvent])

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const world = worldPointFromEvent(event)
    const target = pickElementForContext(useCanvasStore.getState().elements, world, useCanvasStore.getState().camera.zoom)
    if (target) setSelection([target.id])
    setContextMenu({ x: event.clientX, y: event.clientY, world, targetId: target?.id ?? null })
  }, [setSelection, worldPointFromEvent])

  // Móvil: long-press (550ms sin moverse) abre el menú contextual (equiv. clic derecho).
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  const clearLongPress = useCallback(() => {
    if (longPressRef.current) { window.clearTimeout(longPressRef.current.timer); longPressRef.current = null }
  }, [])
  const handleCanvasPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    handlePointerDown(event)
    // Long-press solo en modo seleccion/mano: con lapiz/marcador/borrador activo,
    // mantener el dedo quieto es parte del trazo, no un "clic derecho".
    const tool = useCanvasStore.getState().activeTool
    if (event.pointerType === 'touch' && (tool === 'select' || tool === 'hand')) {
      const cx = event.clientX, cy = event.clientY
      const world = worldPointFromEvent(event)
      clearLongPress()
      const timer = window.setTimeout(() => {
        const target = pickElementForContext(useCanvasStore.getState().elements, world, useCanvasStore.getState().camera.zoom)
        if (target) setSelection([target.id])
        setContextMenu({ x: cx, y: cy, world, targetId: target?.id ?? null })
        dragRef.current = { kind: 'none' } // cancela el pan-or-tap para que no seleccione al soltar
        longPressRef.current = null
      }, 550)
      longPressRef.current = { timer, x: cx, y: cy }
    }
  }, [handlePointerDown, worldPointFromEvent, setSelection, clearLongPress])
  const handleCanvasPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (longPressRef.current && Math.hypot(event.clientX - longPressRef.current.x, event.clientY - longPressRef.current.y) > 10) clearLongPress()
    handlePointerMove(event)
    broadcastCursor(worldPointFromEvent(event))
  }, [handlePointerMove, worldPointFromEvent, broadcastCursor, clearLongPress])
  const handleCanvasPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    clearLongPress()
    handlePointerUp(event)
  }, [handlePointerUp, clearLongPress])

  const fitAll = useCallback(() => {
    const bounds = bboxUnion(useCanvasStore.getState().elements.map(bboxFromElement))
    if (bounds) {
      setCamera(fitToBBox(bounds, viewport, 120))
      markViewDirty()
    }
  }, [markViewDirty, setCamera, viewport])

  const { exportCanvas, exportPng } = useCanvasExport({ pageId, palette, nameRef })
  useCanvasThumbnail({ pageId, palette, loaded })

  const canvasCursor = hoverCursor ?? cursorForTool(activeTool)

  // ---- Embed VIVO: activación/desactivación ----
  // Cambiar de herramienta (dibujar, texto...) sale del modo interacción: las
  // herramientas necesitan el canvas encima del embed.
  useEffect(() => {
    if (activeTool !== 'select') setActiveEmbedId(null)
  }, [activeTool])
  // Escape sale (cuando el foco está FUERA del iframe; adentro, el click fuera
  // sigue siendo la salida — el teclado del iframe le pertenece a su documento).
  useEffect(() => {
    if (!activeEmbedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setActiveEmbedId(null) }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [activeEmbedId])

  const liveEmbedAtPoint = (px: number, py: number): EmbedElement | null => {
    const z = camera.zoom
    let hit: EmbedElement | null = null
    const candidates = elements
      .filter((el): el is EmbedElement => el.type === 'embed' && Boolean((el as EmbedElement).url))
      .sort((a, b) => a.zIndex - b.zIndex)
    for (const el of candidates) {
      const sx = (el.x - camera.x) * z + viewport.width / 2
      const sy = (el.y - camera.y) * z + viewport.height / 2
      if (px >= sx && px <= sx + el.width * z && py >= sy && py <= sy + el.height * z) hit = el
    }
    return hit
  }

  // Todos los hooks del componente ya corrieron arriba; este branch solo
  // decide qué JSX se monta. Hoja HTML: ni toolbar ni canvas ni handlers de
  // interacción se renderizan, así markDirty() nunca dispara para esta página.
  if (isHtmlSheet && pageSettings?.htmlUrl) {
    return <HtmlSheetView name={name} htmlUrl={pageSettings.htmlUrl} />
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground">
      <div
        ref={containerRef}
        data-draw3-canvas-surface
        className="relative min-h-0 flex-1 overflow-hidden overscroll-none"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onDoubleClickCapture={(event) => {
          // doble-click sobre un embed con url = entrar al modo interacción
          const rect = containerRef.current?.getBoundingClientRect()
          if (!rect) return
          const hit = liveEmbedAtPoint(event.clientX - rect.left, event.clientY - rect.top)
          if (hit) {
            event.preventDefault()
            event.stopPropagation()
            setActiveEmbedId(hit.id)
          }
        }}
        onPointerDownCapture={(event) => {
          // click FUERA del embed activo = salir (los clicks DENTRO del iframe
          // nunca llegan aquí: los consume su documento)
          if (!activeEmbedId) return
          const rect = containerRef.current?.getBoundingClientRect()
          if (!rect) return
          const hit = liveEmbedAtPoint(event.clientX - rect.left, event.clientY - rect.top)
          if (!hit || hit.id !== activeEmbedId) setActiveEmbedId(null)
        }}
      >
        {/* Toggle del panel de páginas (DIBUJOS). En phones vive en el Header
            (FolderTree); este botón cubre desktop + iPad. Se perdió en 06fdfe36
            al limpiar el chrome flotante — el sidebar NO tiene control propio
            de colapso, así que sin esto no había forma de reabrirlo. El título
            se renombra desde el menú "..." del sidebar (eso sí quedó migrado). */}
        <div data-draw3-ui className={`absolute left-3 top-3 z-40 ${isMobile ? 'hidden' : ''}`}>
          <button
            onClick={() => useLayoutStore.getState().toggleDrawSidebar()}
            className="icon-btn size-10"
            style={{ background: palette.uiBgElevated + 'e6', borderColor: palette.uiBorder, color: palette.uiTextMuted }}
            title={sidebarOpen ? 'Ocultar lista de dibujos' : 'Mostrar lista de dibujos'}
          >
            <Rows3 size={14} />
          </button>
        </div>
        <LiveEmbedLayer
          elements={elements}
          camera={camera}
          viewport={viewport}
          activeId={activeEmbedId}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none"
          style={{
            cursor: canvasCursor,
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            // en modo interacción el canvas cede los eventos al iframe de abajo
            pointerEvents: activeEmbedId ? 'none' : undefined,
          }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={(event) => {
            clearLongPress()
            handlePointerCancel(event)
          }}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        />
        {!isMobile && (
          <PrimaryToolbar
            penStyle={{ strokeColor: styleDefaults.strokeColor, strokeWidth: styleDefaults.strokeWidth }}
            onPenStyle={(patch) => setStyleDefaults(prev => ({ ...prev, ...patch }))}
            onAddWidget={(kind) => {
              const center = nextWidgetPoint(viewport, camera, elements, selected)
              const el = createWidget(kind, center, palette)
              addElement(el)
              recordHistory(`Insert ${kind}`, [{ kind: 'add', element: el }], [{ kind: 'delete', ids: [el.id] }])
              setSelection([el.id])
              markDirty()
            }}
          />
        )}
        {isMobile && (
          <>
            {mobileToolsOpen && (
              <PrimaryToolbar
                penStyle={{ strokeColor: styleDefaults.strokeColor, strokeWidth: styleDefaults.strokeWidth }}
                onPenStyle={(patch) => setStyleDefaults(prev => ({ ...prev, ...patch }))}
                onAddWidget={(kind) => {
                  const center = nextWidgetPoint(viewport, camera, elements, selected)
                  const el = createWidget(kind, center, palette)
                  addElement(el)
                  recordHistory(`Insert ${kind}`, [{ kind: 'add', element: el }], [{ kind: 'delete', ids: [el.id] }])
                  setSelection([el.id])
                  markDirty()
                }}
                containerClassName="absolute bottom-[5.25rem] left-3 z-40 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-2xl border px-1.5 py-1.5 shadow-depth-anchor backdrop-blur-xl"
                extra={
                  <button
                    onClick={() => { void exportPng() }}
                    title="Exportar PNG"
                    className="ml-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-black/5"
                    style={{ color: palette.uiText }}
                  >
                    <DownloadIcon size={16} />
                  </button>
                }
              />
            )}
            {/* Burbuja FAB: la manita = moverse por el canvas (default). Tap = abrir herramientas. */}
            <button
              data-draw3-ui
              onClick={() => {
                if (mobileToolsOpen) { setMobileToolsOpen(false); setActiveTool('select') }
                else setMobileToolsOpen(true)
              }}
              className="absolute bottom-3 left-3 z-40 flex size-14 items-center justify-center rounded-full border shadow-depth-anchor backdrop-blur-xl transition-transform active:scale-95"
              style={{ background: palette.uiBgElevated + 'f2', borderColor: palette.uiBorder, color: palette.uiText }}
              title={mobileToolsOpen ? 'Cerrar herramientas (volver a mover)' : 'Herramientas'}
            >
              {mobileToolsOpen ? <XIcon size={22} /> : <Hand size={22} />}
            </button>
          </>
        )}
        {/* Export SOLO vive dentro del engrane (SettingsPopover) — sin boton
            "Exportar" top-right ni icono suelto de descarga en la barra. */}
        <UtilityBar
          viewport={viewport}
          saving={saving}
          onUndo={undo}
          onRedo={redo}
          onOpenSettings={() => setSettingsOpen(v => !v)}
          onViewChange={markViewDirty}
        />
        <MinimapOverlay
          elements={elements}
          camera={camera}
          viewport={viewport}
          palette={palette}
          enabled={settings.showMinimap}
          selectedIds={selectedIds}
          onCamera={(nextCamera) => {
            setCamera(nextCamera)
            markViewDirty()
          }}
        />
        <RemoteCursorsOverlay camera={camera} viewport={viewport} />
        <AgentFlashOverlay flash={flash} elements={elements} camera={camera} viewport={viewport} />
        <DimensionsOverlay selected={selected} viewport={viewport} camera={camera} palette={palette} enabled={settings.showObjectDimensions} />
        {!selectionToolbarDismissed && (
          <SelectionToolbar
            selected={selected}
            viewport={viewport}
            camera={camera}
            styleDefaults={styleDefaults}
            applyPatch={applyPatchToSelection}
            applyPatchByIds={applyPatchToIds}
            deleteSelection={deleteSelected}
            duplicateSelection={duplicateSelection}
            lockSelection={lockSelection}
            editSelection={editSelection}
            addCommentToSelection={addCommentToSelection}
            flipSelection={flipSelection}
            zOrderSelection={zOrderSelection}
            alignSelection={alignSelection}
            distributeSelection={distributeSelection}
            changeShapeType={morphSelectedShape}
            groupSelection={groupSelection}
            ungroupSelection={ungroupSelection}
            onOpenHref={navigateHref}
          />
        )}
        <WidgetInspector
          selected={contextMenu || singleSelected?.locked ? null : singleSelected}
          palette={palette}
          onPatch={(id, patch) => {
            updateElement(id, patch)
            markDirty()
          }}
        />
        <MagnetLayer
          selected={selected}
          drag={dragRef.current}
          camera={camera}
          viewport={viewport}
          palette={palette}
          quickPreview={quickCreatePreview}
          onQuickPreview={setQuickCreatePreview}
          onQuickCreate={quickCreateFromAnchor}
        />
        {settingsOpen && (
          <SettingsPopover
            theme={theme}
            palette={palette}
            gridStyle={settings.gridStyle}
            gridSize={settings.gridSize}
            snapToGrid={settings.snapToGrid}
            snapToObjects={settings.snapToObjects}
            showMinimap={settings.showMinimap}
            onClose={() => setSettingsOpen(false)}
            onTheme={(next) => {
              setTheme(next)
              markDirty()
            }}
            onSettings={(patch) => {
              updateSettings(patch)
              markDirty()
            }}
            onExport={(format) => {
              void exportCanvas(format)
              setSettingsOpen(false)
            }}
          />
        )}
        {contextMenu && (
          <CanvasContextMenu
            menu={contextMenu}
            target={contextMenu.targetId ? elements.find(el => el.id === contextMenu.targetId) ?? null : null}
            palette={palette}
            settings={settings}
            onClose={() => setContextMenu(null)}
            onAdd={(kind, point) => {
              const element = kind === 'text'
                ? createStandaloneTextElement({ text: '', point, anchor: 'top-left', viewport, camera, style: styleDefaults })
                : kind === 'sticky'
                  ? createSticky({ x: point.x, y: point.y, text: '', color: 'yellow' })
                  : kind === 'comment'
                    ? createComment({ x: point.x, y: point.y, body: 'Comentario:', authorName: capital(NOMBRE_DUENO()) })
                    : createFrame({ x: point.x, y: point.y, width: 420, height: 280, title: 'Section', color: 'slate' })
              addElement(element)
              recordHistory(`Add ${kind}`, [{ kind: 'add', element }], [{ kind: 'delete', ids: [element.id] }])
              setSelection([element.id])
              if (kind === 'text' || kind === 'sticky') setEditing(element.id)
              setContextMenu(null)
              markDirty()
            }}
            onPaste={async (point) => {
              try {
                if (await pasteImageFromSystemClipboard(point)) return
                const text = await navigator.clipboard.readText()
                const payload = canvasPayloadForClipboardText(text)
                if (payload && pasteCanvasClipboard(payload, point)) {
                  setContextMenu(null)
                  return
                }
                pasteTextFromClipboard(text, point, 'top-left')
              } catch (error) {
                console.warn('Clipboard paste failed', error)
              } finally {
                setContextMenu(null)
              }
            }}
            onDelete={(id) => {
              const state = useCanvasStore.getState()
              if (state.elements.find(el => el.id === id)?.locked) {
                setContextMenu(null)
                return
              }
              const ids = expandDeletionIds(state.elements, [id])
              const deleted = state.elements.filter(el => ids.includes(el.id))
              if (deleted.length === 0) return
              commitAndApply('Delete element', [{ kind: 'delete', ids }], deleted.map(element => ({ kind: 'add', element }) as Op))
              clearSelection()
              setContextMenu(null)
            }}
            onDuplicate={(id) => {
              const state = useCanvasStore.getState()
              const { elements: copies, topLevelIds } = duplicateElements([id], state.elements)
              if (copies.length === 0) return
              for (const copy of copies) addElement(copy)
              recordHistory('Duplicate element', copies.map(element => ({ kind: 'add', element }) as Op), [{ kind: 'delete', ids: copies.map(copy => copy.id) }])
              setSelection(topLevelIds.length > 0 ? topLevelIds : [copies[0].id])
              setContextMenu(null)
              markDirty()
            }}
            onFlip={(id, axis) => {
              setSelection([id])
              queueMicrotask(() => flipSelection(axis))
              setContextMenu(null)
            }}
            onZOrder={(id, direction) => {
              setSelection([id])
              queueMicrotask(() => zOrderSelection(direction))
              setContextMenu(null)
            }}
            onToggleLock={(id) => {
              const target = useCanvasStore.getState().elements.find(el => el.id === id)
              if (!target) return
              commitAndApply(
                target.locked ? 'Unlock element' : 'Lock element',
                [({ kind: 'update', id, patch: { locked: !target.locked } } as Op)],
                [({ kind: 'update', id, patch: { locked: target.locked } } as Op)],
              )
              setContextMenu(null)
            }}
            onOpenUrl={(id) => {
              const target = useCanvasStore.getState().elements.find(el => el.id === id)
              if (target?.type === 'embed') openCanvasUrl(target.url)
              else if (target?.href) navigateHref(target.href)
              setContextMenu(null)
            }}
            onEdit={(id) => {
              const target = useCanvasStore.getState().elements.find(el => el.id === id)
              if (!target) return
              if (target.locked) {
                setSelection([id])
                setContextMenu(null)
                return
              }
              if (target.type === 'text' || target.type === 'sticky') setEditing(id)
              else if (target.type === 'connector') {
                const label = window.prompt('Connector label', target.label ?? '')
                if (label != null) {
                  commitAndApply(
                    'Update connector label',
                    [({ kind: 'update', id, patch: { label } } as Op)],
                    [({ kind: 'update', id, patch: { label: target.label } } as Op)],
                  )
                }
              } else if (target.type === 'frame') {
                const title = window.prompt('Section title', target.title ?? '')
                if (title != null) {
                  commitAndApply(
                    'Update frame title',
                    [({ kind: 'update', id, patch: { title } } as Op)],
                    [({ kind: 'update', id, patch: { title: target.title } } as Op)],
                  )
                }
              }
              else if (target && isShape(target)) {
                const text = useCanvasStore.getState().elements.find(el => el.type === 'text' && (el as TextElement).containerId === target.id) as TextElement | undefined
                if (text) {
                  setEditing(text.id)
                } else {
                  const boundText = createText({
                    x: target.x + 16,
                    y: target.y + 12,
                    width: Math.max(40, target.width - 32),
                    height: Math.max(24, target.height - 24),
                    text: '',
                    containerId: target.id,
                    fontFamily: styleDefaults.fontFamily,
                    fontSize: styleDefaults.fontSize,
                    textColor: getTextColorForElement(target, palette),
                  })
                  boundText.textAlign = 'center'
                  boundText.verticalAlign = 'middle'
                  addElement(boundText)
                  recordHistory('Add shape label', [{ kind: 'add', element: boundText }], [{ kind: 'delete', ids: [boundText.id] }])
                  setEditing(boundText.id)
                  markDirty()
                }
              } else {
                setSelection([id])
              }
              setContextMenu(null)
            }}
            onFitAll={fitAll}
            onSettings={(patch) => {
              updateSettings(patch)
              setContextMenu(null)
              markDirty()
            }}
          />
        )}
        {editingId && <TiptapOverlay editingId={editingId} onCommit={() => { setEditing(null); markDirty() }} />}
        {imagePreviewUrl && (
          <ImageLightbox
            src={imagePreviewUrl}
            alt="Imagen del canvas"
            onClose={() => useUIStore.getState().setImagePreviewUrl(null)}
          />
        )}
        {!loaded && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/30 backdrop-blur-sm">
            <div className="titanium-panel px-5 py-3 text-sm text-muted">
              Loading Canvas v3…
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              const point = pendingImagePointRef.current
              pendingImagePointRef.current = null
              void fileToDataUrl(file).then(dataUrl => createImageFromDataUrl(dataUrl, { x: point?.x, y: point?.y, alt: file.name }))
            } else {
              pendingImagePointRef.current = null
            }
            event.currentTarget.value = ''
          }}
        />
      </div>
    </div>
  )
}

