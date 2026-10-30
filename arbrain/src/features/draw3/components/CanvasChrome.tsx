/**
 * Canvas chrome — toolbar de seleccion, menus contextuales, popovers,
 * overlays (dimensiones, minimapa, magnet) e inspector de widgets.
 * Extraido VERBATIM de DrawEditor3.tsx (refactor fase 3, extraccion B5).
 * Los tipos compartidos se importan type-only desde DrawEditor3 (cero ciclo
 * en runtime).
 */
'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerUpLeft,
  CornerUpRight,
  Download,
  FileImage,
  FileJson,
  FileText,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Italic,
  Layers,
  Link2,
  Lock,
  LockOpen,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Settings,
  Sparkles,
  Strikethrough,
  Trash2,
  Underline,
  Ungroup,
  X,
} from 'lucide-react'
import { ChevronUp, Grid3X3, Group as GroupIcon, Minus, Rows3, Type, Ungroup as UngroupIcon, type LucideIcon } from 'lucide-react'
import { worldToScreen, viewportInWorld } from '../canvas/camera'
import { CanvasColorPalette } from './ColorPalette/CanvasColorPalette'
import { useUIStore } from '../stores/ui-store'
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
  type StrokeStyle,
  openCanvasUrl,
  canFlipElement,
} from './canvas-ui-constants'
import { getConnectorRoute, type Point as ConnectorPoint } from '../canvas/renderer/connectors'
import { visualBBoxUnion } from '../canvas/visual-bbox'
import { bboxFromElement, bboxUnion, elementDisplayBBox, isShape, type ArrowHead, type ArrowElement, type BBox, type CanvasElement, type Camera, type ConnectorElement, type ElementId, type EmbedElement, type FontFamily, type FontWeight, type FrameColor, type FrameElement, type GroupElement, type ShapeBase, type ShapeElementType, type StickyColor, type StickyElement, type TextDecoration, type TextElement } from '../elements/types'
import { useCanvasStore, type ToolName, type ThemeMode } from '../stores/canvas-store'
import { getPalette, THEMES, type ThemeName } from '../theme/tokens'
import type { Viewport, StyleDefaults, ZOrderDirection, QuickCreateAnchor, BindingHit, ContextMenuState, DragMode, QuickCreatePreview } from './DrawEditor3'
import type { CanvasExportFormat } from './hooks/useCanvasExport'

function useDismissOnOutsidePointer<T extends HTMLElement>(
  enabled: boolean,
  refs: Array<RefObject<T | null>>,
  onDismiss: () => void,
  options: { ignoreSelector?: string } = {},
) {
  useEffect(() => {
    if (!enabled) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (options.ignoreSelector && target instanceof Element && target.closest(options.ignoreSelector)) return
      if (refs.some(ref => ref.current?.contains(target))) return
      onDismiss()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [enabled, onDismiss, options.ignoreSelector, refs])
}

function textWeightValue(element: CanvasElement | null): FontWeight {
  if (element && 'fontWeight' in element && typeof element.fontWeight === 'number') {
    if (element.fontWeight >= 900) return 900
    if (element.fontWeight >= 800) return 800
    if (element.fontWeight >= 700) return 700
    if (element.fontWeight >= 600) return 600
    if (element.fontWeight >= 500) return 500
  }
  return 400
}

export function DimensionsOverlay({
  selected,
  viewport,
  camera,
  palette,
  enabled,
}: {
  selected: CanvasElement[]
  viewport: Viewport
  camera: Camera
  palette: ReturnType<typeof getPalette>
  enabled: boolean
}) {
  if (!enabled || selected.length !== 1) return null
  const box = bboxFromElement(selected[0])
  const screen = worldToScreen({ x: box.minX + box.width / 2, y: box.maxY }, camera, viewport)
  const label = `${Math.round(box.width)} x ${Math.round(box.height)}`
  return (
    <div
      className="pointer-events-none absolute z-[78] -translate-x-1/2 rounded-lg border px-2 py-1 text-[11px] font-medium shadow-lg backdrop-blur-md"
      style={{
        left: Math.max(12, Math.min(screen.x, viewport.width - 12)),
        top: Math.max(12, Math.min(screen.y + 12, viewport.height - 34)),
        background: palette.uiBgElevated + 'f0',
        borderColor: palette.uiBorder,
        color: palette.uiText,
      }}
    >
      {label}
    </div>
  )
}

export function MinimapOverlay({
  elements,
  camera,
  viewport,
  palette,
  enabled,
  selectedIds,
  onCamera,
}: {
  elements: CanvasElement[]
  camera: Camera
  viewport: Viewport
  palette: ReturnType<typeof getPalette>
  enabled: boolean
  selectedIds: Set<string>
  onCamera: (camera: Camera) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = Math.min(220, Math.max(140, viewport.width - 24))
  const height = Math.min(150, Math.max(96, viewport.height * 0.22))

  const visibleElements = useMemo(() => elements.filter(el => !el.hidden), [elements])
  const bounds = useMemo(() => {
    const viewportBox = viewportInWorld(camera, viewport)
    const elementBox = bboxUnion(visibleElements.map(bboxFromElement))
    return bboxUnion(elementBox ? [elementBox, viewportBox] : [viewportBox])
  }, [camera, viewport, visibleElements])

  const transform = useMemo(() => {
    if (!bounds) return null
    const padding = 12
    const scale = Math.min((width - padding * 2) / Math.max(bounds.width, 1), (height - padding * 2) / Math.max(bounds.height, 1))
    const offsetX = (width - bounds.width * scale) / 2
    const offsetY = (height - bounds.height * scale) / 2
    return {
      worldToMini(point: { x: number; y: number }) {
        return {
          x: offsetX + (point.x - bounds.minX) * scale,
          y: offsetY + (point.y - bounds.minY) * scale,
        }
      },
      miniToWorld(point: { x: number; y: number }) {
        return {
          x: bounds.minX + (point.x - offsetX) / scale,
          y: bounds.minY + (point.y - offsetY) / scale,
        }
      },
    }
  }, [bounds, height, width])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bounds || !transform) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = palette.uiBgElevated
    ctx.fillRect(0, 0, width, height)

    for (const el of visibleElements) {
      const box = bboxFromElement(el)
      const a = transform.worldToMini({ x: box.minX, y: box.minY })
      const b = transform.worldToMini({ x: box.maxX, y: box.maxY })
      const isSelected = selectedIds.has(el.id)
      if (isSelected) {
        ctx.fillStyle = palette.selectionFill
        ctx.strokeStyle = palette.selectionStroke
        ctx.lineWidth = 1.5
      } else {
        ctx.fillStyle = el.type === 'frame' ? palette.accent + '14' : palette.uiText + '18'
        ctx.strokeStyle = el.type === 'frame' ? palette.accent : palette.uiTextMuted
        ctx.lineWidth = el.type === 'frame' ? 1.25 : 0.75
      }
      ctx.fillRect(a.x, a.y, Math.max(1, b.x - a.x), Math.max(1, b.y - a.y))
      ctx.strokeRect(a.x, a.y, Math.max(1, b.x - a.x), Math.max(1, b.y - a.y))
    }

    const viewBox = viewportInWorld(camera, viewport)
    const va = transform.worldToMini({ x: viewBox.minX, y: viewBox.minY })
    const vb = transform.worldToMini({ x: viewBox.maxX, y: viewBox.maxY })
    ctx.strokeStyle = palette.selectionStroke
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.strokeRect(va.x, va.y, Math.max(4, vb.x - va.x), Math.max(4, vb.y - va.y))
    ctx.setLineDash([])
  }, [bounds, camera, height, palette, transform, viewport, visibleElements, width, selectedIds])

  if (!enabled || !bounds || !transform) return null

  return (
    <div
      className="absolute bottom-16 right-3 z-30 overflow-hidden rounded-2xl border shadow-depth-anchor backdrop-blur-xl"
      style={{ background: palette.uiBgElevated + 'f2', borderColor: palette.uiBorder }}
    >
      <canvas
        ref={canvasRef}
        className="block cursor-crosshair"
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const world = transform.miniToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top })
          onCamera({ ...camera, x: world.x, y: world.y })
        }}
      />
    </div>
  )
}

export function SelectionToolbar({
  selected,
  viewport,
  camera,
  styleDefaults,
  applyPatch,
  applyPatchByIds,
  deleteSelection,
  duplicateSelection,
  lockSelection,
  editSelection,
  addCommentToSelection,
  flipSelection,
  zOrderSelection,
  changeShapeType,
  groupSelection,
  ungroupSelection,
  alignSelection,
  distributeSelection,
  onOpenHref,
}: {
  selected: CanvasElement[]
  viewport: Viewport
  camera: Camera
  styleDefaults: StyleDefaults
  applyPatch: (patch: Partial<CanvasElement>, remember?: Partial<StyleDefaults>) => void
  applyPatchByIds: (ids: ElementId[], patch: Partial<CanvasElement>, remember?: Partial<StyleDefaults>) => void
  deleteSelection: () => void
  duplicateSelection: () => void
  lockSelection: () => void
  editSelection: () => void
  addCommentToSelection: () => void
  flipSelection: (axis: 'x' | 'y') => void
  zOrderSelection: (direction: ZOrderDirection) => void
  changeShapeType: (id: ElementId, shapeType: ShapeElementType) => void
  groupSelection: () => void
  ungroupSelection: () => void
  alignSelection?: (axis: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => void
  distributeSelection?: (axis: 'horizontal' | 'vertical') => void
  onOpenHref?: (href: string) => void
}) {
  const [openMenu, setOpenMenu] = useState<'shapeType' | 'font' | 'size' | 'align' | 'textStyle' | 'textColor' | 'fill' | 'stickyColor' | 'frameColor' | 'stroke' | 'arrowStart' | 'arrowEnd' | 'connectorLabel' | 'connectorRoute' | 'more' | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [measuredToolbarWidth, setMeasuredToolbarWidth] = useState(0)
  const elements = useCanvasStore(s => s.elements)
  const theme = useCanvasStore(s => s.theme)
  const palette = getPalette(theme === 'system' ? 'system' : (theme as ThemeName))

  useEffect(() => {
    const node = toolbarRef.current
    if (!node) return
    const measure = () => setMeasuredToolbarWidth(node.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [openMenu, selected.length, viewport.width])
  const closeOpenMenu = useCallback(() => setOpenMenu(null), [])
  useDismissOnOutsidePointer(openMenu !== null, [toolbarRef], closeOpenMenu)

  if (selected.length === 0) return null
  const bounds = visualBBoxUnion(selected, elements)
  if (!bounds) return null
  const screen = worldToScreen({ x: bounds.minX + bounds.width / 2, y: bounds.minY }, camera, viewport)
  const bottomScreen = worldToScreen({ x: bounds.minX + bounds.width / 2, y: bounds.maxY }, camera, viewport)
  const first = selected[0]
  const allLocked = selected.every(el => el.locked)
  // Si todos los seleccionados estan locked, mostramos toolbar minimo (solo Unlock + More)
  // En vez de ocultar el toolbar y dejar al usuario atrapado sin forma de desbloquear.
  const canShape = isShape(first)
  const frameTarget = first.type === 'frame' ? first as FrameElement : null
  const stickyTarget = first.type === 'sticky' ? first as StickyElement : null
  const canStroke = canShape || first.type === 'line' || first.type === 'arrow' || first.type === 'connector' || first.type === 'freedraw' || first.type === 'highlighter'
  const strokeTarget = canStroke ? first : null
  const connectorTarget = first.type === 'connector' ? first as ConnectorElement : null
  const arrowheadTarget = (first.type === 'arrow' || first.type === 'connector') ? first as ArrowElement | ConnectorElement : null
  const textTarget = (first.type === 'text' || first.type === 'sticky')
    ? first
    : canShape
      ? elements.find(el => el.type === 'text' && (el as TextElement).containerId === first.id) ?? null
      : null
  const textPatch = (patch: Partial<CanvasElement>, remember?: Partial<StyleDefaults>) => {
    if (!textTarget) return
    applyPatchByIds([textTarget.id], patch, remember)
  }
  const currentFont = ((textTarget as TextElement | undefined)?.fontFamily ?? styleDefaults.fontFamily) as FontFamily
  const currentFontSize = Math.round((textTarget as TextElement | undefined)?.fontSize ?? styleDefaults.fontSize)
  const currentAlign = (textTarget as TextElement | StickyElement | undefined)?.textAlign ?? 'center'
  const currentVertical = (textTarget as TextElement | StickyElement | undefined)?.verticalAlign ?? 'middle'
  const currentTextWeight = textWeightValue(textTarget)
  const currentFontStyle = textFontStyleValue(textTarget)
  const currentTextDecoration = textDecorationValue(textTarget)
  const canComment = first.type !== 'comment'
  // Indicador de estado de grupo: boton "activo" (tinte accent) = la seleccion ES un grupo.
  const isGroupSelected = selected.some(el => el.type === 'group')
  const toolbarWidth = Math.min(
    viewport.width - 24,
    (textTarget ? 420 : 0) + (frameTarget ? 54 : 0) + (canStroke ? 290 : 0) + (arrowheadTarget ? 230 : 0) + (connectorTarget ? 250 : 0) + 120,
  )
  const left = Math.max(12 + toolbarWidth / 2, Math.min(screen.x, viewport.width - 12 - toolbarWidth / 2))
  const actualToolbarWidth = measuredToolbarWidth || toolbarWidth
  const toolbarLeftEdge = left - actualToolbarWidth / 2
  const popoverPlacement: 'up' | 'down' = screen.y > viewport.height * 0.55 ? 'up' : 'down'
  const popoverOffset = (width: number) => {
    const min = 12 - toolbarLeftEdge
    const max = viewport.width - 12 - width - toolbarLeftEdge
    return Math.max(min, Math.min(8, max))
  }
  // Para menus anclados a botones del extremo DERECHO del toolbar (ej. "...").
  // Alinea el borde derecho del popover con el borde derecho del toolbar.
  const popoverOffsetRight = (width: number) => {
    const ideal = actualToolbarWidth - width
    const min = 12 - toolbarLeftEdge
    const max = viewport.width - 12 - width - toolbarLeftEdge
    return Math.max(min, Math.min(ideal, max))
  }
  const placeAbove = screen.y >= 84
  const top = placeAbove
    ? Math.max(72, Math.min(screen.y - 14, viewport.height - 12))
    : Math.max(12, Math.min(bottomScreen.y + 14, viewport.height - 12))
  const toolbarChrome = {
    bg: theme === 'dark' ? palette.uiBgElevated + 'f8' : '#ffffff',
    border: theme === 'dark' ? palette.uiBorder : '#e6e6ea',
    text: theme === 'dark' ? palette.uiText : '#1f2933',
    muted: theme === 'dark' ? palette.uiTextMuted : '#5f6368',
    hover: theme === 'dark' ? 'rgba(255,255,255,0.08)' : '#f5f5f7',
    active: theme === 'dark' ? palette.accent + '22' : '#f1e9ff',
    divider: theme === 'dark' ? palette.uiBorder : '#e8e8ee',
    shadow: theme === 'dark'
      ? '0 18px 42px rgba(0,0,0,0.42)'
      : '0 6px 18px rgba(20,20,24,0.16), 0 1px 2px rgba(20,20,24,0.08)',
  }

  return (
    <div
      ref={toolbarRef}
      data-draw3-ui
      data-draw3-selection-toolbar
      className={`absolute z-[80] flex -translate-x-1/2 items-stretch gap-0 rounded-[9px] border px-0 py-0 backdrop-blur-xl ${placeAbove ? '-translate-y-full' : ''}`}
      style={{ left, top, height: 44, width: 'max-content', maxWidth: viewport.width - 24, background: toolbarChrome.bg, borderColor: toolbarChrome.border, color: toolbarChrome.text, boxShadow: toolbarChrome.shadow, fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {canShape && !allLocked ? (
        <ToolbarMenuButton
          label="Cambiar figura"
          palette={palette}
          active={openMenu === 'shapeType'}
          onClick={() => setOpenMenu(openMenu === 'shapeType' ? null : 'shapeType')}
        >
          <MiroObjectIcon type={first.type} color={openMenu === 'shapeType' ? palette.accent : toolbarChrome.text} />
        </ToolbarMenuButton>
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center" style={{ color: toolbarChrome.text }}>
          <MiroObjectIcon type={first.type} color={toolbarChrome.text} />
        </div>
      )}
      {!allLocked && (
        <>
      {frameTarget && (
        <ToolbarMenuButton
          label="Frame color"
          palette={palette}
          active={openMenu === 'frameColor'}
          onClick={() => setOpenMenu(openMenu === 'frameColor' ? null : 'frameColor')}
        >
          <FrameColorSwatch color={frameTarget.color} palette={palette} />
        </ToolbarMenuButton>
      )}
      {stickyTarget && (
        <ToolbarMenuButton
          label="Sticky color"
          palette={palette}
          active={openMenu === 'stickyColor'}
          onClick={() => setOpenMenu(openMenu === 'stickyColor' ? null : 'stickyColor')}
        >
          <StickyColorDot color={stickyTarget.color} palette={palette} />
        </ToolbarMenuButton>
      )}
      {textTarget && (
        <>
          <ToolbarDivider />
          <ToolbarMenuButton
            label="Font family"
            palette={palette}
            active={openMenu === 'font'}
            wide
            onClick={() => setOpenMenu(openMenu === 'font' ? null : 'font')}
          >
            <span className="max-w-[126px] truncate text-[15px] font-normal">{fontLabel(currentFont)}</span>
          </ToolbarMenuButton>
          <ToolbarMenuButton
            label="Font size"
            palette={palette}
            active={openMenu === 'size'}
            onClick={() => setOpenMenu(openMenu === 'size' ? null : 'size')}
          >
            <span className="min-w-6 text-center text-[15px] tabular-nums">{currentFontSize}</span>
            <span className="flex flex-col text-[10px]" style={{ color: toolbarChrome.muted }}>
              <ChevronUp size={12} strokeWidth={2.2} />
              <ChevronDown className="-mt-1" size={12} strokeWidth={2.2} />
            </span>
          </ToolbarMenuButton>
          <ToolbarDivider />
          <ToolbarMenuButton
            label="Text style"
            palette={palette}
            active={openMenu === 'textStyle' || currentTextWeight >= 600 || currentFontStyle === 'italic' || currentTextDecoration !== 'none'}
            onClick={() => setOpenMenu(openMenu === 'textStyle' ? null : 'textStyle')}
          >
            <MiroTextStyleIcon
              bold={currentTextWeight >= 600}
              italic={currentFontStyle === 'italic'}
              decoration={currentTextDecoration}
            />
          </ToolbarMenuButton>
          <ToolbarMenuButton
            label="Alignment"
            palette={palette}
            active={openMenu === 'align'}
            onClick={() => setOpenMenu(openMenu === 'align' ? null : 'align')}
          >
            {currentAlign === 'center' ? <AlignCenter size={20} strokeWidth={2.2} /> : currentAlign === 'right' ? <AlignRight size={20} strokeWidth={2.2} /> : <AlignLeft size={20} strokeWidth={2.2} />}
          </ToolbarMenuButton>
          <ToolbarMenuButton
            label="Text color"
            palette={palette}
            active={openMenu === 'textColor'}
            onClick={() => setOpenMenu(openMenu === 'textColor' ? null : 'textColor')}
          >
            <MiroTextColorIcon color={(textTarget as TextElement).textColor ?? styleDefaults.textColor} />
          </ToolbarMenuButton>
        </>
      )}
      {canStroke && strokeTarget && (
        <>
          {textTarget && <ToolbarDivider />}
          {canShape && (
            <ToolbarMenuButton
              label="Border style"
              palette={palette}
              active={openMenu === 'stroke'}
              onClick={() => setOpenMenu(openMenu === 'stroke' ? null : 'stroke')}
            >
              <MiroMarkerIcon color={toolbarChrome.text} />
            </ToolbarMenuButton>
          )}
          <ToolbarMenuButton
            label={canShape ? 'Border color' : 'Line style'}
            palette={palette}
            active={openMenu === 'stroke'}
            wide={!canShape}
            onClick={() => setOpenMenu(openMenu === 'stroke' ? null : 'stroke')}
          >
            {canShape ? (
              <MiroStrokeSwatch color={strokeColorValue(strokeTarget, styleDefaults.strokeColor)} width={'strokeWidth' in strokeTarget ? strokeTarget.strokeWidth : styleDefaults.strokeWidth} />
            ) : (
              <>
                <LinePreview
                  color={strokeColorValue(strokeTarget, styleDefaults.strokeColor)}
                  width={'strokeWidth' in strokeTarget ? strokeTarget.strokeWidth : styleDefaults.strokeWidth}
                  strokeStyle={'strokeStyle' in strokeTarget ? strokeTarget.strokeStyle : styleDefaults.strokeStyle}
                />
                <span className="text-[15px] tabular-nums">{'strokeWidth' in strokeTarget ? strokeTarget.strokeWidth : styleDefaults.strokeWidth}px</span>
              </>
            )}
          </ToolbarMenuButton>
          {canShape && (
            <ToolbarMenuButton
              label="Fill"
              palette={palette}
              active={openMenu === 'fill'}
              onClick={() => setOpenMenu(openMenu === 'fill' ? null : 'fill')}
            >
              <MiroFillSwatch color={(first as ShapeBase).fillColor ?? 'transparent'} border={toolbarChrome.divider} />
            </ToolbarMenuButton>
          )}
        </>
      )}
      {arrowheadTarget && (
        <>
          <ToolbarDivider />
          <ToolbarMenuButton
            label="Start arrowhead"
            palette={palette}
            active={openMenu === 'arrowStart'}
            wide
            onClick={() => setOpenMenu(openMenu === 'arrowStart' ? null : 'arrowStart')}
          >
            <ArrowHeadPreview head={arrowheadTarget.startArrowhead ?? 'none'} side="start" color={strokeColorValue(arrowheadTarget, styleDefaults.strokeColor)} />
            <span className="text-[15px]">Start</span>
          </ToolbarMenuButton>
          <ToolbarMenuButton
            label="End arrowhead"
            palette={palette}
            active={openMenu === 'arrowEnd'}
            wide
            onClick={() => setOpenMenu(openMenu === 'arrowEnd' ? null : 'arrowEnd')}
          >
            <ArrowHeadPreview head={arrowheadTarget.endArrowhead ?? 'none'} side="end" color={strokeColorValue(arrowheadTarget, styleDefaults.strokeColor)} />
            <span className="text-[15px]">End</span>
          </ToolbarMenuButton>
        </>
      )}
      {connectorTarget && (
        <>
          <ToolbarDivider />
          <ToolbarMenuButton
            label="Connector label"
            palette={palette}
            active={openMenu === 'connectorLabel'}
            wide
            onClick={() => setOpenMenu(openMenu === 'connectorLabel' ? null : 'connectorLabel')}
          >
            <Type size={15} />
            <span className="max-w-[120px] truncate text-[15px]">{connectorTarget.label || 'Label'}</span>
          </ToolbarMenuButton>
          <ToolbarMenuButton
            label="Connector route"
            palette={palette}
            active={openMenu === 'connectorRoute'}
            wide
            onClick={() => setOpenMenu(openMenu === 'connectorRoute' ? null : 'connectorRoute')}
          >
            <RoutePreview routing={connectorTarget.routing} color={strokeColorValue(connectorTarget, styleDefaults.strokeColor)} />
            <span className="text-[15px]">{CONNECTOR_ROUTING_OPTIONS.find(option => option.value === connectorTarget.routing)?.label ?? connectorTarget.routing}</span>
          </ToolbarMenuButton>
        </>
      )}
      <ToolbarDivider />
      {isGroupSelected && (
        <ToolbarMenuButton
          label="Agrupado · Desagrupar (⌘G)"
          palette={palette}
          active
          onClick={ungroupSelection}
        >
          <UngroupIcon size={20} strokeWidth={2.15} />
        </ToolbarMenuButton>
      )}
      {!isGroupSelected && selected.length >= 2 && (
        <ToolbarMenuButton
          label="Agrupar (⌘G)"
          palette={palette}
          onClick={groupSelection}
        >
          <GroupIcon size={20} strokeWidth={2.15} />
        </ToolbarMenuButton>
      )}
      {canComment && (
        <ToolbarMenuButton
          label="Comment"
          palette={palette}
          onClick={addCommentToSelection}
        >
          <MessageSquare size={20} strokeWidth={2.15} />
        </ToolbarMenuButton>
      )}
      {selected.length === 1 && first.href && (
        <ToolbarMenuButton
          label="Abrir enlace"
          palette={palette}
          onClick={() => onOpenHref?.(first.href!)}
        >
          <Link2 size={20} strokeWidth={2.15} />
        </ToolbarMenuButton>
      )}
        </>
      )}
      <ToolbarMenuButton
        label={allLocked ? 'Unlock' : 'Lock'}
        palette={palette}
        onClick={lockSelection}
      >
        <LockToggleIcon locked={allLocked} />
      </ToolbarMenuButton>
      <ToolbarMenuButton
        label="More"
        palette={palette}
        active={openMenu === 'more'}
        onClick={() => setOpenMenu(openMenu === 'more' ? null : 'more')}
      >
        <MoreHorizontal size={22} strokeWidth={2.4} />
      </ToolbarMenuButton>

      {openMenu === 'font' && textTarget && (
        <ToolbarPopover palette={palette} width={250} left={popoverOffset(250)} placement={popoverPlacement}>
          <div className="px-3 py-2 text-xs" style={{ color: palette.uiTextMuted }}>Fuentes de marca</div>
          <div className="mb-2 rounded-xl px-3 py-2 text-left text-xs" style={{ color: palette.uiTextMuted, background: palette.uiBg }}>
            Inter + Roboto Slab estan cargadas para mapas Business OS.
          </div>
          <div className="px-3 py-2 text-xs" style={{ color: palette.uiTextMuted }}>Todas las fuentes</div>
          {FONT_OPTIONS.map(font => (
            <button
              key={font.value}
              onClick={() => { textPatch({ fontFamily: font.value } as Partial<CanvasElement>, { fontFamily: font.value }); setOpenMenu(null) }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-black/5"
              style={{ color: palette.uiText, fontFamily: font.stack }}
            >
              <span>{font.label}</span>
              {currentFont === font.value && <span style={{ color: palette.accent }}>✓</span>}
            </button>
          ))}
        </ToolbarPopover>
      )}

      {openMenu === 'shapeType' && canShape && (
        <ToolbarPopover palette={palette} width={300} left={popoverOffset(300)} placement={popoverPlacement}>
          <div className="mb-1 px-2 py-1 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>Cambiar figura</div>
          <div className="grid grid-cols-2 gap-1">
            {SHAPE_TYPE_OPTIONS.map(option => {
              const active = first.type === option.type
              return (
                <button
                  key={option.type}
                  onClick={() => {
                    changeShapeType(first.id, option.type)
                    setOpenMenu(null)
                  }}
                  className="flex h-11 items-center gap-2 rounded-lg px-2 text-left text-xs transition-colors hover:bg-black/5"
                  style={{ background: active ? palette.accent + '18' : 'transparent', color: active ? palette.accent : palette.uiText }}
                  title={option.label}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                    <MiroObjectIcon type={option.type} color={active ? palette.accent : palette.uiText} />
                  </span>
                  <span className="min-w-0 whitespace-nowrap">{option.label}</span>
                </button>
              )
            })}
          </div>
        </ToolbarPopover>
      )}

      {openMenu === 'size' && textTarget && (
        <ToolbarPopover palette={palette} width={190} left={popoverOffset(190)} placement={popoverPlacement}>
          <input
            type="number"
            min={8}
            max={240}
            value={currentFontSize}
            onChange={(e) => textPatch({ fontSize: Number(e.target.value) } as Partial<CanvasElement>, { fontSize: Number(e.target.value) })}
            className="mb-2 h-9 w-full rounded-xl border px-3 text-sm outline-none"
            style={{ background: palette.uiBg, borderColor: palette.uiBorder, color: palette.uiText }}
          />
          {FONT_SIZE_PRESETS.map(size => (
            <button
              key={size.value}
              onClick={() => { textPatch({ fontSize: size.value } as Partial<CanvasElement>, { fontSize: size.value }); setOpenMenu(null) }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-black/5"
              style={{ color: palette.uiText }}
            >
              <span>{size.label}</span>
              <span className="tabular-nums" style={{ color: palette.uiTextMuted }}>{size.value}</span>
            </button>
          ))}
        </ToolbarPopover>
      )}

      {openMenu === 'align' && textTarget && (
        <ToolbarPopover palette={palette} width={180} left={popoverOffset(180)} placement={popoverPlacement}>
          <div className="mb-2 grid grid-cols-3 gap-1">
            {(['left', 'center', 'right'] as TextElement['textAlign'][]).map(align => (
              <button
                key={align}
                onClick={() => textPatch({ textAlign: align } as Partial<CanvasElement>)}
                className="flex h-9 items-center justify-center rounded-xl transition-colors hover:bg-black/5"
                style={{ background: currentAlign === align ? palette.accent + '18' : 'transparent', color: currentAlign === align ? palette.accent : palette.uiText }}
              >
                {align === 'center' ? <AlignCenter size={17} /> : align === 'right' ? <AlignRight size={17} /> : <AlignLeft size={17} />}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(['top', 'middle', 'bottom'] as TextElement['verticalAlign'][]).map(align => (
              <button
                key={align}
                onClick={() => textPatch({ verticalAlign: align } as Partial<CanvasElement>)}
                className="h-9 rounded-xl text-xs capitalize transition-colors hover:bg-black/5"
                style={{ background: currentVertical === align ? palette.accent + '18' : 'transparent', color: currentVertical === align ? palette.accent : palette.uiText }}
              >
                {align}
              </button>
            ))}
          </div>
        </ToolbarPopover>
      )}

      {openMenu === 'textStyle' && textTarget && (
        <ToolbarPopover palette={palette} width={174} left={popoverOffset(174)} placement={popoverPlacement}>
          <div className="grid grid-cols-4 gap-1">
            <TextStyleButton
              label="Bold"
              active={currentTextWeight >= 600}
              palette={palette}
              onClick={() => textPatch({ fontWeight: currentTextWeight >= 600 ? 400 : 700 } as Partial<CanvasElement>)}
            >
              <Bold size={18} strokeWidth={2.4} />
            </TextStyleButton>
            <TextStyleButton
              label="Italic"
              active={currentFontStyle === 'italic'}
              palette={palette}
              onClick={() => textPatch({ fontStyle: currentFontStyle === 'italic' ? 'normal' : 'italic' } as Partial<CanvasElement>)}
            >
              <Italic size={18} strokeWidth={2.4} />
            </TextStyleButton>
            <TextStyleButton
              label="Underline"
              active={currentTextDecoration.includes('underline')}
              palette={palette}
              onClick={() => textPatch({ textDecoration: toggleTextDecoration(currentTextDecoration, 'underline') } as Partial<CanvasElement>)}
            >
              <Underline size={18} strokeWidth={2.4} />
            </TextStyleButton>
            <TextStyleButton
              label="Strike"
              active={currentTextDecoration.includes('line-through')}
              palette={palette}
              onClick={() => textPatch({ textDecoration: toggleTextDecoration(currentTextDecoration, 'line-through') } as Partial<CanvasElement>)}
            >
              <Strikethrough size={18} strokeWidth={2.4} />
            </TextStyleButton>
          </div>
        </ToolbarPopover>
      )}

      {openMenu === 'textColor' && textTarget && (
        <ColorPalettePopover
          palette={palette}
          value={(textTarget as TextElement).textColor ?? styleDefaults.textColor}
          onChange={(color) => { textPatch({ textColor: color } as Partial<CanvasElement>, { textColor: color }); setOpenMenu(null) }}
          left={popoverOffset(326)}
          placement={popoverPlacement}
        />
      )}

      {openMenu === 'fill' && canShape && (
        <ToolbarPopover palette={palette} width={326} left={popoverOffset(326)} placement={popoverPlacement}>
          <MiroRange
            label="Opacidad"
            value={Math.round(fillOpacityValue(first as ShapeBase) * 100)}
            min={0}
            max={100}
            step={5}
            suffix="%"
            palette={palette}
            onChange={(value) => applyPatch({ fillOpacity: value / 100 } as Partial<CanvasElement>)}
          />
          <div className="my-3 h-px" style={{ background: palette.uiBorder }} />
          <CanvasColorPalette
            palette={palette}
            value={(first as ShapeBase).fillColor ?? null}
            allowTransparent
            onChange={(color) => {
              applyPatch({ fillColor: color } as Partial<CanvasElement>, { fillColor: color })
              setOpenMenu(null)
            }}
          />
        </ToolbarPopover>
      )}

      {openMenu === 'stickyColor' && stickyTarget && (
        <ToolbarPopover palette={palette} width={220} left={popoverOffset(220)} placement={popoverPlacement}>
          <div className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>Color de nota</div>
          <StickyColorGrid
            value={stickyTarget.color}
            palette={palette}
            onChange={(color) => {
              applyPatch({ color } as Partial<CanvasElement>)
              setOpenMenu(null)
            }}
          />
        </ToolbarPopover>
      )}

      {openMenu === 'frameColor' && frameTarget && (
        <ToolbarPopover palette={palette} width={250} left={popoverOffset(250)} placement={popoverPlacement}>
          <div className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>Color de frame</div>
          <FrameColorGrid
            value={frameTarget.color}
            palette={palette}
            onChange={(color) => {
              applyPatch({ color } as Partial<CanvasElement>)
              setOpenMenu(null)
            }}
          />
        </ToolbarPopover>
      )}

      {openMenu === 'stroke' && strokeTarget && (
        <ToolbarPopover palette={palette} width={326} left={popoverOffset(326)} placement={popoverPlacement}>
          {'strokeStyle' in strokeTarget && (
            <div className="mb-3">
              <div className="grid grid-cols-3 gap-1.5">
              {STROKE_STYLE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => applyPatch({ strokeStyle: value } as Partial<CanvasElement>, { strokeStyle: value })}
                  className="flex h-10 items-center justify-center rounded-lg px-2 transition-colors hover:bg-black/5"
                  style={{ background: strokeTarget.strokeStyle === value ? palette.accent + '18' : palette.uiBg, color: strokeTarget.strokeStyle === value ? palette.accent : palette.uiText }}
                  title={label}
                >
                  <LinePreview color={strokeColorValue(strokeTarget, styleDefaults.strokeColor)} width={'strokeWidth' in strokeTarget ? strokeTarget.strokeWidth : styleDefaults.strokeWidth} strokeStyle={value} compact />
                </button>
              ))}
              </div>
            </div>
          )}
          {'strokeWidth' in strokeTarget && (
            <MiroRange
              label="Grosor"
              value={strokeTarget.strokeWidth}
              min={1}
              max={16}
              step={1}
              palette={palette}
              onChange={(value) => applyPatch({ strokeWidth: value } as Partial<CanvasElement>, { strokeWidth: value })}
            />
          )}
          <MiroRange
            label="Opacidad"
            value={Math.round(strokeOpacityValue(strokeTarget) * 100)}
            min={0}
            max={100}
            step={5}
            suffix="%"
            palette={palette}
            onChange={(value) => applyPatch({ strokeOpacity: value / 100 } as Partial<CanvasElement>)}
          />
          <div className="my-3 h-px" style={{ background: palette.uiBorder }} />
          <CanvasColorPalette
            palette={palette}
            value={strokeColorValue(strokeTarget, styleDefaults.strokeColor)}
            onChange={(color) => {
              if (!color) return
              applyPatch(strokeColorPatch(strokeTarget, color), { strokeColor: color })
            }}
          />
          {first.type === 'rectangle' && (
            <label className="mt-3 block text-xs" style={{ color: palette.uiTextMuted }}>
              Esquinas {first.cornerRadius}
              <input
                type="range"
                min={0}
                max={48}
                value={first.cornerRadius}
                onChange={(e) => applyPatch({ cornerRadius: Number(e.target.value) } as Partial<CanvasElement>, { cornerRadius: Number(e.target.value) })}
                className="mt-2 w-full"
                style={{ accentColor: palette.accent }}
              />
            </label>
          )}
        </ToolbarPopover>
      )}

      {openMenu === 'arrowStart' && arrowheadTarget && (
        <ArrowheadPopover
          palette={palette}
          value={arrowheadTarget.startArrowhead ?? 'none'}
          side="start"
          color={strokeColorValue(arrowheadTarget, styleDefaults.strokeColor)}
          left={popoverOffset(210)}
          placement={popoverPlacement}
          onChange={(value) => {
            applyPatch({ startArrowhead: value } as Partial<CanvasElement>)
            setOpenMenu(null)
          }}
        />
      )}

      {openMenu === 'arrowEnd' && arrowheadTarget && (
        <ArrowheadPopover
          palette={palette}
          value={arrowheadTarget.endArrowhead ?? 'none'}
          side="end"
          color={strokeColorValue(arrowheadTarget, styleDefaults.strokeColor)}
          left={popoverOffset(210)}
          placement={popoverPlacement}
          onChange={(value) => {
            applyPatch({ endArrowhead: value } as Partial<CanvasElement>)
            setOpenMenu(null)
          }}
        />
      )}

      {openMenu === 'connectorLabel' && connectorTarget && (
        <ToolbarPopover palette={palette} width={260} left={popoverOffset(260)} placement={popoverPlacement}>
          <div className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>Etiqueta</div>
          <input
            autoFocus
            value={connectorTarget.label ?? ''}
            onChange={(event) => applyPatch({ label: event.target.value } as Partial<CanvasElement>)}
            className="h-10 w-full rounded-xl border px-3 text-sm outline-none"
            style={{ background: palette.uiBg, borderColor: palette.uiBorder, color: palette.uiText }}
            placeholder="Describe la relacion"
          />
          <button
            onClick={() => applyPatch({ label: '' } as Partial<CanvasElement>)}
            className="mt-2 w-full rounded-xl px-3 py-2 text-left text-xs transition-colors hover:bg-black/5"
            style={{ color: palette.uiTextMuted }}
          >
            Limpiar etiqueta
          </button>
        </ToolbarPopover>
      )}

      {openMenu === 'connectorRoute' && connectorTarget && (
        <ToolbarPopover palette={palette} width={230} left={popoverOffset(230)} placement={popoverPlacement}>
          <div className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>Tipo de ruta</div>
          <div className="grid grid-cols-3 gap-1.5">
            {CONNECTOR_ROUTING_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => {
                  applyPatch({ routing: option.value, waypoints: [] } as Partial<CanvasElement>)
                  setOpenMenu(null)
                }}
                className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] transition-colors hover:bg-black/5"
                style={{ background: connectorTarget.routing === option.value ? palette.accent + '18' : palette.uiBg, color: connectorTarget.routing === option.value ? palette.accent : palette.uiText }}
              >
                <RoutePreview routing={option.value} color={connectorTarget.routing === option.value ? palette.accent : strokeColorValue(connectorTarget, styleDefaults.strokeColor)} compact />
                {option.label}
              </button>
            ))}
          </div>
        </ToolbarPopover>
      )}

      {openMenu === 'more' && (
        <ToolbarPopover palette={palette} width={212} left={popoverOffsetRight(212)} placement={popoverPlacement}>
          <SelectionActionsMenu
            target={first}
            palette={palette}
            canComment={canComment}
            onEdit={() => { editSelection(); setOpenMenu(null) }}
            onDuplicate={() => { duplicateSelection(); setOpenMenu(null) }}
            onFlip={(axis) => { flipSelection(axis); setOpenMenu(null) }}
            onZOrder={(direction) => { zOrderSelection(direction); setOpenMenu(null) }}
            onToggleLock={() => { lockSelection(); setOpenMenu(null) }}
            onAddComment={() => { addCommentToSelection(); setOpenMenu(null) }}
            onDelete={() => { deleteSelection(); setOpenMenu(null) }}
            selectionCount={selected.length}
            onAlign={alignSelection ? (axis) => { alignSelection(axis); setOpenMenu(null) } : undefined}
            onDistribute={distributeSelection ? (axis) => { distributeSelection(axis); setOpenMenu(null) } : undefined}
          />
        </ToolbarPopover>
      )}
    </div>
  )
}

function MiroObjectIcon({ type, color }: { type: CanvasElement['type']; color: string }) {
  if (type === 'ellipse') {
    return <span className="h-[22px] w-[22px] rounded-full border-2" style={{ borderColor: color }} />
  }
  if (type === 'diamond') {
    return <span className="h-[18px] w-[18px] rotate-45 border-2" style={{ borderColor: color }} />
  }
  if (type === 'triangle') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4.5 20 19H4Z" fill="none" stroke={color} strokeWidth="2.1" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'chevron') {
    return (
      <svg width="25" height="24" viewBox="0 0 25 24" aria-hidden="true">
        <path d="M4 5h12.8L21 12l-4.2 7H4l3.1-7Z" fill="none" stroke={color} strokeWidth="2.1" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'line') return <Minus size={23} strokeWidth={2.4} />
  if (type === 'arrow' || type === 'connector') {
    return (
      <svg width="25" height="24" viewBox="0 0 25 24" aria-hidden="true">
        <path d="M4 12h15" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        <path d="m14 6 6 6-6 6" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'text') return <Type size={22} strokeWidth={2.2} />
  return <span className="h-[22px] w-[22px] rounded-[2px] border-2" style={{ borderColor: color }} />
}

function MiroTextColorIcon({ color }: { color: string }) {
  return (
    <span className="relative flex h-7 w-7 items-center justify-center text-[21px] font-semibold leading-none">
      A
      <span className="absolute bottom-[3px] h-[3px] w-[20px] rounded-full" style={{ background: color }} />
    </span>
  )
}

function MiroTextStyleIcon({
  bold,
  italic,
  decoration,
}: {
  bold: boolean
  italic: boolean
  decoration: TextDecoration
}) {
  return (
    <span
      className="relative flex h-7 w-7 items-center justify-center text-[21px] leading-none"
      style={{
        fontWeight: bold ? 700 : 600,
        fontStyle: italic ? 'italic' : 'normal',
      }}
    >
      B
      {(decoration.includes('underline') || decoration === 'none') && (
        <span className="absolute bottom-[3px] h-[2px] w-[18px] rounded-full bg-current" />
      )}
      {decoration.includes('line-through') && (
        <span className="absolute top-[13px] h-[2px] w-[18px] rounded-full bg-current" />
      )}
    </span>
  )
}

function MiroStrokeSwatch({ color, width }: { color: string; width: number }) {
  return (
    <span
      className="h-[25px] w-[25px] rounded-full"
      style={{
        border: `${Math.min(5, Math.max(2, width))}px solid ${color}`,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.74)',
      }}
    />
  )
}

function MiroFillSwatch({ color, border }: { color: string | null; border: string }) {
  return (
    <span
      className="h-[25px] w-[25px] rounded-full border"
      style={{
        background: color && color !== 'transparent' ? color : 'transparent',
        borderColor: color && color !== 'transparent' ? 'rgba(17,24,39,0.18)' : border,
        backgroundImage: color && color !== 'transparent' ? undefined : 'linear-gradient(135deg, transparent 46%, #9ca3af 48%, #9ca3af 52%, transparent 54%)',
      }}
    />
  )
}

function MiroMarkerIcon({ color }: { color: string }) {
  return (
    <svg width="25" height="25" viewBox="0 0 25 25" aria-hidden="true">
      <path d="M15.7 4.2 21 9.5 10.2 20.3l-6.1 1.4 1.4-6.1Z" fill="none" stroke={color} strokeWidth="2.1" strokeLinejoin="round" />
      <path d="M13.4 6.6 18.6 11.8" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" />
      <path d="M5 19.7h6.2" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  )
}

function LockToggleIcon({ locked }: { locked: boolean }) {
  const Icon = locked ? LockOpen : Lock
  return (
    <span
      key={locked ? 'open' : 'closed'}
      className="inline-flex animate-[lockSwap_220ms_ease-out] items-center justify-center"
      style={{ transformOrigin: 'center' }}
    >
      <Icon size={20} strokeWidth={2.15} />
    </span>
  )
}

function strokeDashArray(strokeStyle: StrokeStyle, width: number) {
  if (strokeStyle === 'dashed') return `${width * 4} ${width * 3}`
  if (strokeStyle === 'dotted') return `${Math.max(1, width)} ${Math.max(2, width * 2)}`
  return undefined
}

function LinePreview({
  color,
  width,
  strokeStyle,
  compact = false,
}: {
  color: string
  width: number
  strokeStyle: StrokeStyle
  compact?: boolean
}) {
  return (
    <svg width={compact ? 42 : 52} height={18} viewBox="0 0 52 18" aria-hidden="true" className="shrink-0">
      <line
        x1="6"
        y1="9"
        x2="46"
        y2="9"
        stroke={color}
        strokeWidth={Math.min(8, Math.max(1.5, width))}
        strokeDasharray={strokeDashArray(strokeStyle, Math.max(2, width))}
        strokeLinecap="round"
      />
    </svg>
  )
}

function MiroRange({
  label,
  value,
  min,
  max,
  step,
  suffix,
  palette,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  palette: ReturnType<typeof getPalette>
  onChange: (value: number) => void
}) {
  const tickCount = Math.floor((max - min) / step) + 1
  return (
    <label className="mb-3 block text-[11px]" style={{ color: palette.uiTextMuted }}>
      <div className="mb-1.5 flex items-center justify-between">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value)}{suffix}</span>
      </div>
      <div className="relative h-7">
        <div className="pointer-events-none absolute left-2 right-2 top-1/2 h-px -translate-y-1/2" style={{ background: palette.uiBorder }} />
        <div className="pointer-events-none absolute left-2 right-2 top-1/2 flex -translate-y-1/2 justify-between">
          {Array.from({ length: Math.min(tickCount, 16) }).map((_, index) => (
            <span
              key={index}
              className="h-1 w-1 rounded-full"
              style={{ background: palette.uiTextMuted, opacity: 0.34 }}
            />
          ))}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 h-7 w-full cursor-pointer bg-transparent"
          style={{ accentColor: palette.uiTextMuted }}
        />
      </div>
    </label>
  )
}

function ArrowHeadPreview({
  head,
  side,
  color,
  compact = false,
}: {
  head: ArrowHead
  side: 'start' | 'end'
  color: string
  compact?: boolean
}) {
  const endpoint = side === 'end' ? 38 : 10
  const lineStart = side === 'end' ? 8 : 38
  const dir = side === 'end' ? 1 : -1
  const back = endpoint - dir * 8
  return (
    <svg width={compact ? 32 : 44} height={compact ? 18 : 22} viewBox="0 0 44 22" aria-hidden="true" className="shrink-0">
      <line x1={lineStart} y1="11" x2={endpoint} y2="11" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      {head === 'arrow' && (
        <path d={`M ${endpoint} 11 L ${back} 6 M ${endpoint} 11 L ${back} 16`} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {head === 'triangle' && (
        <path d={`M ${endpoint} 11 L ${back} 5.5 L ${back} 16.5 Z`} fill={color} />
      )}
      {head === 'diamond' && (
        <path d={`M ${endpoint} 11 L ${endpoint - dir * 5} 5.5 L ${endpoint - dir * 11} 11 L ${endpoint - dir * 5} 16.5 Z`} fill={color} />
      )}
      {head === 'circle' && (
        <circle cx={endpoint - dir * 4} cy="11" r="4.2" fill={color} />
      )}
      {head === 'bar' && (
        <line x1={endpoint} y1="5" x2={endpoint} y2="17" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      )}
    </svg>
  )
}

function RoutePreview({ routing, color, compact = false }: { routing: ConnectorElement['routing']; color: string; compact?: boolean }) {
  const path =
    routing === 'orthogonal'
      ? 'M 6 15 H 22 V 7 H 42'
      : routing === 'curved'
        ? 'M 6 15 Q 22 1 42 11'
        : 'M 6 13 L 42 9'
  return (
    <svg width={compact ? 40 : 48} height={compact ? 18 : 22} viewBox="0 0 48 22" aria-hidden="true" className="shrink-0">
      <path d={path} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 42 9 L 35 5 M 42 9 L 36 14" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowheadPopover({
  palette,
  value,
  side,
  color,
  left,
  placement,
  onChange,
}: {
  palette: ReturnType<typeof getPalette>
  value: ArrowHead
  side: 'start' | 'end'
  color: string
  left: number
  placement: 'up' | 'down'
  onChange: (value: ArrowHead) => void
}) {
  return (
    <ToolbarPopover palette={palette} width={210} left={left} placement={placement}>
      <div className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>
        {side === 'start' ? 'Punta inicial' : 'Punta final'}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {ARROWHEAD_OPTIONS.map(option => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className="flex h-10 items-center justify-center rounded-lg px-1 transition-colors hover:bg-black/5"
            style={{ background: value === option ? palette.accent + '18' : palette.uiBg, color: value === option ? palette.accent : palette.uiText }}
            title={ARROWHEAD_LABELS[option]}
          >
            <ArrowHeadPreview head={option} side={side} color={value === option ? palette.accent : color} />
          </button>
        ))}
      </div>
    </ToolbarPopover>
  )
}

function ToolbarDivider() {
  const theme = useCanvasStore(s => s.theme)
  const palette = getPalette(theme === 'system' ? 'system' : (theme as ThemeName))
  const divider = theme === 'dark' ? palette.uiBorder : '#e8e8ee'
  return <div className="h-11 w-px shrink-0" style={{ background: divider }} />
}

function ToolbarMenuButton({ children, label, palette, active, wide, onClick }: {
  children: ReactNode
  label: string
  palette: ReturnType<typeof getPalette>
  active?: boolean
  wide?: boolean
  onClick: () => void
}) {
  const theme = useCanvasStore(s => s.theme)
  const isDark = theme === 'dark'
  const text = isDark ? palette.uiText : '#1f2933'
  const activeBg = isDark ? palette.accent + '22' : '#f1e9ff'
  const hoverClass = isDark ? 'hover:bg-white/10' : 'hover:bg-black/[0.045]'
  return (
    <button
      onClick={onClick}
      className={`relative flex h-11 items-center justify-center gap-2 rounded-none px-3 text-[15px] font-normal transition-colors ${hoverClass} ${wide ? 'min-w-[132px] justify-start' : 'min-w-11'}`}
      style={{ background: active ? activeBg : 'transparent', color: active ? palette.accent : text }}
      title={label}
    >
      {children}
    </button>
  )
}

function TextStyleButton({ children, label, active, palette, onClick }: {
  children: ReactNode
  label: string
  active: boolean
  palette: ReturnType<typeof getPalette>
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-10 items-center justify-center rounded-lg transition-colors hover:bg-black/5"
      style={{
        background: active ? palette.accent + '18' : 'transparent',
        color: active ? palette.accent : palette.uiText,
      }}
      title={label}
    >
      {children}
    </button>
  )
}

function ToolbarPopover({
  children,
  palette,
  width,
  left,
  placement,
}: {
  children: ReactNode
  palette: ReturnType<typeof getPalette>
  width: number
  left: number
  placement: 'up' | 'down'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)
  // Móvil: si el popover se sale del viewport (derecha o izquierda), lo corre de
  // vuelta. Corre una vez por apertura (deps left/width estables mientras está abierto).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 8
    if (r.right > window.innerWidth - margin) setShift((p) => p + (window.innerWidth - margin - r.right))
    else if (r.left < margin) setShift((p) => p + (margin - r.left))
  }, [left, width])
  return (
    <div
      ref={ref}
      data-draw3-ui
      data-draw3-toolbar-popover
      className={`absolute max-h-[min(340px,65vh)] overflow-y-auto overscroll-contain rounded-xl border p-1.5 shadow-depth-anchor ${placement === 'up' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]'}`}
      style={{ left: left + shift, width, maxWidth: 'calc(100vw - 16px)', background: palette.uiBgElevated, borderColor: palette.uiBorder, color: palette.uiText }}
    >
      {children}
    </div>
  )
}

function StickyColorDot({ color, palette }: { color: StickyColor; palette: ReturnType<typeof getPalette> }) {
  const swatch = palette.stickyColors[color]
  return (
    <span
      className="h-4 w-4 rounded-full border"
      style={{ background: swatch.bg, borderColor: palette.uiBorder }}
    />
  )
}

function FrameColorSwatch({ color, palette }: { color: FrameColor; palette: ReturnType<typeof getPalette> }) {
  const swatch = palette.frameColors[color]
  return (
    <span
      className="h-5 w-5 rounded-[5px] border"
      style={{
        background: swatch.bg,
        borderColor: swatch.border,
        boxShadow: `inset 0 0 0 2px ${swatch.border}`,
      }}
    />
  )
}

function ColorPalettePopover({
  palette,
  value,
  onChange,
  left,
  placement,
}: {
  palette: ReturnType<typeof getPalette>
  value: string
  onChange: (color: string) => void
  left: number
  placement: 'up' | 'down'
}) {
  return (
    <ToolbarPopover palette={palette} width={326} left={left} placement={placement}>
      <CanvasColorPalette palette={palette} value={value} onChange={(color) => color && onChange(color)} />
    </ToolbarPopover>
  )
}

function FrameColorGrid({ value, palette, onChange }: { value: FrameColor; palette: ReturnType<typeof getPalette>; onChange: (color: FrameColor) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {FRAME_COLOR_OPTIONS.map(color => {
        const swatch = palette.frameColors[color]
        return (
          <button
            key={color}
            onClick={() => onChange(color)}
            className="flex h-10 items-center justify-center rounded-xl border transition-transform hover:scale-105"
            style={{
              background: swatch.bg,
              borderColor: value === color ? palette.accent : swatch.border,
              boxShadow: value === color ? `0 0 0 2px ${palette.accent}55, inset 0 0 0 2px ${swatch.border}` : `inset 0 0 0 2px ${swatch.border}`,
            }}
            title={color}
          >
            {value === color && <span className="h-2 w-2 rounded-full" style={{ background: swatch.border }} />}
          </button>
        )
      })}
    </div>
  )
}

function StickyColorGrid({ value, palette, onChange }: { value: StickyColor; palette: ReturnType<typeof getPalette>; onChange: (color: StickyColor) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {STICKY_COLOR_OPTIONS.map(color => {
        const swatch = palette.stickyColors[color]
        return (
          <button
            key={color}
            onClick={() => onChange(color)}
            className="flex h-10 items-center justify-center rounded-xl border transition-transform hover:scale-105"
            style={{
              background: swatch.bg,
              borderColor: value === color ? palette.accent : palette.uiBorder,
              boxShadow: value === color ? `0 0 0 2px ${palette.accent}55` : undefined,
            }}
            title={color}
          >
            {value === color && <span className="h-2 w-2 rounded-full" style={{ background: swatch.text }} />}
          </button>
        )
      })}
    </div>
  )
}

function ExportMenuRow({
  Icon,
  label,
  detail,
  palette,
  onClick,
}: {
  Icon: LucideIcon
  label: string
  detail: string
  palette: ReturnType<typeof getPalette>
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-black/5"
      style={{ color: palette.uiText }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: palette.accent + '14', color: palette.accent }}>
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs" style={{ color: palette.uiTextMuted }}>{detail}</span>
      </span>
    </button>
  )
}

export function SettingsPopover({
  theme,
  palette,
  gridStyle,
  gridSize,
  snapToGrid,
  snapToObjects,
  showMinimap,
  onClose,
  onTheme,
  onSettings,
  onExport,
}: {
  theme: ThemeMode
  palette: ReturnType<typeof getPalette>
  gridStyle: 'none' | 'lines' | 'dots'
  gridSize: number
  snapToGrid: boolean
  snapToObjects: boolean
  showMinimap: boolean
  onClose: () => void
  onTheme: (theme: ThemeMode) => void
  onSettings: (patch: Partial<ReturnType<typeof useCanvasStore.getState>['settings']>) => void
  onExport?: (format: CanvasExportFormat) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDismissOnOutsidePointer(true, [ref], onClose, { ignoreSelector: '[data-draw3-settings-trigger]' })

  return (
    <div
      ref={ref}
      data-draw3-ui
      className="fixed bottom-24 right-6 z-[120] max-h-[calc(100vh-140px)] w-80 overflow-y-auto overscroll-contain rounded-2xl border p-4 shadow-depth-anchor backdrop-blur-xl"
      style={{ background: palette.uiBgElevated + 'f5', borderColor: palette.uiBorder, color: palette.uiText }}
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Settings size={16} />
        Canvas settings
      </div>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>Theme</div>
          <div className="grid grid-cols-4 gap-2">
            {(['system', 'dark', 'light', 'mono'] as ThemeMode[]).map(item => (
              <button
                key={item}
                onClick={() => onTheme(item)}
                className="rounded-xl border px-3 py-2 text-xs transition-colors"
                style={{
                  background: theme === item ? palette.accent + '20' : palette.uiBg,
                  borderColor: theme === item ? palette.accent : palette.uiBorder,
                  color: theme === item ? palette.accent : palette.uiTextMuted,
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>Background</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['none', Minus, 'Blank'],
              ['lines', Grid3X3, 'Grid'],
              ['dots', Sparkles, 'Dots'],
            ].map(([value, Icon, label]) => {
              const I = Icon as typeof Grid3X3
              return (
                <button
                  key={value as string}
                  onClick={() => onSettings({ gridStyle: value as 'none' | 'lines' | 'dots' })}
                  className="flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs transition-colors"
                  style={{
                    background: gridStyle === value ? palette.accent + '20' : palette.uiBg,
                    borderColor: gridStyle === value ? palette.accent : palette.uiBorder,
                    color: gridStyle === value ? palette.accent : palette.uiTextMuted,
                  }}
                >
                  <I size={15} />
                  {label as string}
                </button>
              )
            })}
          </div>
        </div>
        <label className="block text-xs" style={{ color: palette.uiTextMuted }}>
          Grid size: {gridSize}px
          <input
            type="range"
            min={10}
            max={80}
            step={5}
            value={gridSize}
            onChange={(e) => onSettings({ gridSize: Number(e.target.value) })}
            className="mt-2 w-full accent-violet-500"
          />
        </label>
        <label className="flex items-center justify-between text-xs" style={{ color: palette.uiText }}>
          Snap to grid
          <input type="checkbox" checked={snapToGrid} onChange={(e) => onSettings({ snapToGrid: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between text-xs" style={{ color: palette.uiText }}>
          Snap to objects
          <input type="checkbox" checked={snapToObjects} onChange={(e) => onSettings({ snapToObjects: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between text-xs" style={{ color: palette.uiText }}>
          Mostrar minimapa
          <input type="checkbox" checked={showMinimap} onChange={(e) => onSettings({ showMinimap: e.target.checked })} />
        </label>
        {onExport && (
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>Exportar</div>
            <div className="space-y-1">
              <ExportMenuRow Icon={FileImage} label="PNG" detail="Imagen del mapa" palette={palette} onClick={() => onExport('png')} />
              <ExportMenuRow Icon={FileText} label="PDF" detail="Documento portable" palette={palette} onClick={() => onExport('pdf')} />
              <ExportMenuRow Icon={FileJson} label="JSON" detail="Fuente editable" palette={palette} onClick={() => onExport('json')} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Acciones de un elemento seleccionado. UN SOLO componente compartido entre el
 * menu de clic-derecho (CanvasContextMenu) y el menu "..." del toolbar flotante.
 */
export function SelectionActionsMenu({
  target,
  palette,
  canComment,
  onEdit,
  onDuplicate,
  onFlip,
  onZOrder,
  onToggleLock,
  onAddComment,
  onDelete,
  selectionCount = 1,
  onAlign,
  onDistribute,
}: {
  target: CanvasElement
  palette: ReturnType<typeof getPalette>
  canComment: boolean
  onEdit: () => void
  onDuplicate: () => void
  onFlip: (axis: 'x' | 'y') => void
  onZOrder: (direction: ZOrderDirection) => void
  onToggleLock: () => void
  onAddComment: () => void
  onDelete: () => void
  selectionCount?: number
  onAlign?: (axis: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => void
  onDistribute?: (axis: 'horizontal' | 'vertical') => void
}) {
  const locked = target.locked
  const flippable = canFlipElement(target)
  return (
    <>
      {!locked && <ContextItem label={contextEditLabel(target)} shortcut="Enter" onClick={onEdit} palette={palette} />}
      <ContextItem label="Duplicar" shortcut="⌘D" onClick={onDuplicate} palette={palette} />
      {!locked && flippable && (
        <>
          <ContextItem label="Voltear horizontal" onClick={() => onFlip('x')} palette={palette} />
          <ContextItem label="Voltear vertical" onClick={() => onFlip('y')} palette={palette} />
        </>
      )}
      {!locked && (
        <>
          <ContextDivider palette={palette} />
          <ContextItem label="Traer adelante" shortcut="⌘]" onClick={() => onZOrder('forward')} palette={palette} />
          <ContextItem label="Traer al frente" shortcut="⌥⌘]" onClick={() => onZOrder('front')} palette={palette} />
          <ContextItem label="Enviar atras" shortcut="⌘[" onClick={() => onZOrder('backward')} palette={palette} />
          <ContextItem label="Enviar al fondo" shortcut="⌥⌘[" onClick={() => onZOrder('back')} palette={palette} />
        </>
      )}
      {!locked && selectionCount >= 2 && onAlign && (
        <>
          <ContextDivider palette={palette} />
          <ContextItem label="Alinear izquierda" onClick={() => onAlign('left')} palette={palette} />
          <ContextItem label="Alinear centro" onClick={() => onAlign('center-x')} palette={palette} />
          <ContextItem label="Alinear derecha" onClick={() => onAlign('right')} palette={palette} />
          <ContextItem label="Alinear arriba" onClick={() => onAlign('top')} palette={palette} />
          <ContextItem label="Alinear medio" onClick={() => onAlign('center-y')} palette={palette} />
          <ContextItem label="Alinear abajo" onClick={() => onAlign('bottom')} palette={palette} />
        </>
      )}
      {!locked && selectionCount >= 3 && onDistribute && (
        <>
          <ContextItem label="Distribuir horizontal" onClick={() => onDistribute('horizontal')} palette={palette} />
          <ContextItem label="Distribuir vertical" onClick={() => onDistribute('vertical')} palette={palette} />
        </>
      )}
      <ContextDivider palette={palette} />
      <ContextItem label={locked ? 'Desbloquear' : 'Bloquear'} onClick={onToggleLock} palette={palette} />
      {!locked && canComment && <ContextItem label="Añadir comentario" onClick={onAddComment} palette={palette} />}
      {!locked && (
        <>
          <ContextDivider palette={palette} />
          <ContextItem label="Eliminar" shortcut="Del" danger onClick={onDelete} palette={palette} />
        </>
      )}
    </>
  )
}

export function CanvasContextMenu({
  menu,
  target,
  palette,
  settings,
  onClose,
  onAdd,
  onPaste,
  onDelete,
  onDuplicate,
  onFlip,
  onZOrder,
  onToggleLock,
  onOpenUrl,
  onEdit,
  onFitAll,
  onSettings,
}: {
  menu: NonNullable<ContextMenuState>
  target: CanvasElement | null
  palette: ReturnType<typeof getPalette>
  settings: ReturnType<typeof useCanvasStore.getState>['settings']
  onClose: () => void
  onAdd: (kind: 'text' | 'sticky' | 'comment' | 'frame', point: { x: number; y: number }) => void
  onPaste: (point: { x: number; y: number }) => void
  onDelete: (id: ElementId) => void
  onDuplicate: (id: ElementId) => void
  onFlip: (id: ElementId, axis: 'x' | 'y') => void
  onZOrder: (id: ElementId, direction: ZOrderDirection) => void
  onToggleLock: (id: ElementId) => void
  onOpenUrl: (id: ElementId) => void
  onEdit: (id: ElementId) => void
  onFitAll: () => void
  onSettings: (patch: Partial<ReturnType<typeof useCanvasStore.getState>['settings']>) => void
}) {
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const el = event.target as HTMLElement | null
      if (!el?.closest('[data-canvas-context-menu]')) onClose()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      data-canvas-context-menu
      data-draw3-ui
      className="fixed z-[140] w-72 rounded-2xl border p-1.5 shadow-depth-anchor backdrop-blur-xl"
      style={{
        left: Math.min(menu.x, window.innerWidth - 300),
        top: Math.min(menu.y, window.innerHeight - 430),
        background: palette.uiBgElevated,
        borderColor: palette.uiBorder,
        color: palette.uiText,
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {target ? (
        <>
          {(target.type === 'embed' || Boolean(target.href)) && <ContextItem label="Abrir enlace" onClick={() => onOpenUrl(target.id)} palette={palette} />}
          <SelectionActionsMenu
            target={target}
            palette={palette}
            canComment={target.type !== 'comment'}
            onEdit={() => onEdit(target.id)}
            onDuplicate={() => onDuplicate(target.id)}
            onFlip={(axis) => onFlip(target.id, axis)}
            onZOrder={(direction) => onZOrder(target.id, direction)}
            onToggleLock={() => onToggleLock(target.id)}
            onAddComment={() => onAdd('comment', { x: target.x + target.width + 24, y: target.y })}
            onDelete={() => onDelete(target.id)}
          />
        </>
      ) : (
        <>
          <ContextItem label="Pegar" shortcut="⌘V" onClick={() => onPaste(menu.world)} palette={palette} />
          <ContextItem label="Agregar texto" onClick={() => onAdd('text', menu.world)} palette={palette} />
          <ContextItem label="Agregar nota adhesiva" onClick={() => onAdd('sticky', menu.world)} palette={palette} />
          <ContextItem label="Agregar comentario" onClick={() => onAdd('comment', menu.world)} palette={palette} />
          <ContextItem label="Agregar frame / sección" onClick={() => onAdd('frame', menu.world)} palette={palette} />
          <ContextDivider palette={palette} />
          <ContextItem label="Mostrar cuadrícula" checked={settings.gridStyle !== 'none'} onClick={() => onSettings({ gridStyle: settings.gridStyle === 'none' ? 'lines' : 'none' })} palette={palette} />
          <ContextItem label="Cuadrícula de puntos" checked={settings.gridStyle === 'dots'} onClick={() => onSettings({ gridStyle: settings.gridStyle === 'dots' ? 'lines' : 'dots' })} palette={palette} />
          <ContextItem label="Ajustar a la cuadrícula" checked={settings.snapToGrid} onClick={() => onSettings({ snapToGrid: !settings.snapToGrid })} palette={palette} />
          <ContextItem label="Capturar objetos" checked={settings.snapToObjects} onClick={() => onSettings({ snapToObjects: !settings.snapToObjects })} palette={palette} />
          <ContextDivider palette={palette} />
          <ContextItem label="Mostrar todo" shortcut="⌥1" onClick={() => { onFitAll(); onClose() }} palette={palette} />
        </>
      )}
    </div>
  )
}

function ContextItem({ label, shortcut, checked, danger, muted, onClick, palette }: {
  label: string
  shortcut?: string
  checked?: boolean
  danger?: boolean
  muted?: boolean
  onClick: () => void
  palette: ReturnType<typeof getPalette>
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-black/5"
      style={{ color: danger ? '#dc2626' : muted ? palette.uiTextMuted : palette.uiText }}
    >
      <span className="flex items-center gap-2">
        {checked != null && <span style={{ color: checked ? palette.accent : 'transparent' }}>✓</span>}
        {label}
      </span>
      {shortcut && <span className="text-xs" style={{ color: palette.uiTextMuted }}>{shortcut}</span>}
    </button>
  )
}

function ContextDivider({ palette }: { palette: ReturnType<typeof getPalette> }) {
  return <div className="my-1 h-px" style={{ background: palette.uiBorder }} />
}

function contextEditLabel(target: CanvasElement): string {
  if (target.type === 'connector') return 'Editar etiqueta'
  if (target.type === 'frame') return 'Editar titulo'
  if (['mermaid', 'code', 'table', 'embed', 'comment'].includes(target.type)) return 'Abrir inspector'
  return 'Editar texto'
}

export function MagnetLayer({
  selected,
  drag,
  camera,
  viewport,
  palette,
  quickPreview,
  onQuickPreview,
  onQuickCreate,
}: {
  selected: CanvasElement[]
  drag: DragMode
  camera: Camera
  viewport: Viewport
  palette: ReturnType<typeof getPalette>
  quickPreview: QuickCreatePreview
  onQuickPreview: (preview: QuickCreatePreview) => void
  onQuickCreate: (sourceId: ElementId, anchor: QuickCreateAnchor) => void
}) {
  const elements = useCanvasStore(s => s.elements)
  const connectorSourceId =
    drag.kind === 'connector' ? drag.startBinding.elementId :
    drag.kind === 'draw' && drag.startBinding ? drag.startBinding.elementId :
    null
  const showCandidates = drag.kind === 'connector' || (drag.kind === 'draw' && Boolean(drag.startBinding))
  const visibleElements = showCandidates
    ? elements.filter(el => isBindable(el) && el.id !== connectorSourceId)
    : selected.length === 1 && isBindable(selected[0])
      ? [selected[0]]
      : []
  if (visibleElements.length === 0) return null
  return (
    <>
      {visibleElements.flatMap(el => MAGNET_ANCHORS.map(anchor => {
          const point = anchorPoint(el, anchor)
          const screen = worldToScreen(point, camera, viewport)
          const isSelected = selected.some(item => item.id === el.id)
          const canQuickCreate = isSelected && !el.locked && drag.kind === 'none'
          const isPreviewing = quickPreview?.sourceId === el.id && quickPreview.anchor === anchor
          const size = isSelected ? 12 : 9
          const commonStyle = {
            left: screen.x,
            top: screen.y,
            width: size,
            height: size,
            background: isPreviewing ? palette.selectionStroke : palette.uiBg,
            borderColor: palette.selectionStroke,
            opacity: isSelected ? 1 : 0.72,
            boxShadow: isSelected ? `0 0 0 4px ${palette.selectionStroke}18` : `0 0 0 2px ${palette.selectionStroke}14`,
          }
          if (canQuickCreate) {
            return (
              <button
                key={`${el.id}:${anchor}`}
                type="button"
                data-draw3-ui
                aria-label={`Crear conectado hacia ${quickCreateAnchorLabel(anchor)}`}
                title={`Crear conectado hacia ${quickCreateAnchorLabel(anchor)}`}
                className="absolute z-[75] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 p-0 shadow-sm transition-transform hover:scale-125 focus:outline-none focus:ring-2"
                style={{
                  ...commonStyle,
                  cursor: 'copy',
                  pointerEvents: 'auto',
                }}
                onPointerEnter={() => onQuickPreview({ sourceId: el.id, anchor })}
                onPointerLeave={() => onQuickPreview(null)}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onQuickCreate(el.id, anchor)
                }}
              />
            )
          }
          return (
            <div
              key={`${el.id}:${anchor}`}
              className="pointer-events-none absolute z-[75] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm"
              style={commonStyle}
            />
          )
        }))}
    </>
  )
}

export function WidgetInspector({ selected, palette, onPatch }: {
  selected: CanvasElement | null
  palette: ReturnType<typeof getPalette>
  onPatch: (id: ElementId, patch: Partial<CanvasElement>) => void
}) {
  const commentInspectorId = useUIStore(s => s.commentInspectorId)
  if (!selected) return null
  if (!['mermaid', 'code', 'table', 'embed', 'comment', 'frame'].includes(selected.type)) return null
  // Comments only show their inspector after a pure click (no drag) or a
  // double-click. Drag must not surface the editor.
  if (selected.type === 'comment' && commentInspectorId !== selected.id) return null
  const fieldStyle = {
    background: palette.uiBg,
    borderColor: palette.uiBorder,
    color: palette.uiText,
  }

  return (
    <div
      data-draw3-ui
      className="absolute right-5 top-20 z-[85] w-80 overflow-y-auto rounded-2xl border p-4 shadow-depth-anchor backdrop-blur-xl"
      style={{ background: palette.uiBgElevated + 'f5', borderColor: palette.uiBorder, color: palette.uiText }}
    >
      <div className="mb-3 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>
        {selected.type} inspector
      </div>
      {selected.type === 'mermaid' && (
        <textarea
          value={selected.code}
          onChange={(event) => onPatch(selected.id, { code: event.target.value } as Partial<CanvasElement>)}
          className="h-48 w-full resize-none rounded-2xl border p-3 font-mono text-xs outline-none"
          style={fieldStyle}
          spellCheck={false}
        />
      )}
      {selected.type === 'code' && (
        <div className="space-y-2">
          <input
            value={selected.language}
            onChange={(event) => onPatch(selected.id, { language: event.target.value } as Partial<CanvasElement>)}
            className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
            style={fieldStyle}
            placeholder="language"
          />
          <textarea
            value={selected.code}
            onChange={(event) => onPatch(selected.id, { code: event.target.value } as Partial<CanvasElement>)}
            className="h-44 w-full resize-none rounded-2xl border p-3 font-mono text-xs outline-none"
            style={fieldStyle}
            spellCheck={false}
          />
        </div>
      )}
      {selected.type === 'table' && (
        <textarea
          value={selected.cells.map(row => row.join('\t')).join('\n')}
          onChange={(event) => {
            const cells = event.target.value.split('\n').map(row => row.split('\t'))
            onPatch(selected.id, {
              cells,
              rowHeights: Array(cells.length).fill(40),
              colWidths: Array(Math.max(1, ...cells.map(row => row.length))).fill(120),
            } as Partial<CanvasElement>)
          }}
          className="h-48 w-full resize-none rounded-2xl border p-3 font-mono text-xs outline-none"
          style={fieldStyle}
          spellCheck={false}
        />
      )}
      {selected.type === 'embed' && (
        <div className="space-y-2">
          <input
            value={selected.url}
            onChange={(event) => onPatch(selected.id, { url: event.target.value } as Partial<CanvasElement>)}
            className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
            style={fieldStyle}
            placeholder="https://..."
          />
          <select
            value={selected.embedKind}
            onChange={(event) => onPatch(selected.id, { embedKind: event.target.value as EmbedElement['embedKind'] } as Partial<CanvasElement>)}
            className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
            style={fieldStyle}
          >
            <option value="generic">generic</option>
            <option value="youtube">youtube</option>
            <option value="twitter">twitter</option>
            <option value="loom">loom</option>
          </select>
        </div>
      )}
      {selected.type === 'comment' && (
        <div className="space-y-2">
          <textarea
            value={selected.body}
            onChange={(event) => onPatch(selected.id, { body: event.target.value } as Partial<CanvasElement>)}
            className="h-32 w-full resize-none rounded-2xl border p-3 text-xs outline-none"
            style={fieldStyle}
            placeholder="Comment"
          />
          <label className="flex items-center justify-between text-xs" style={{ color: palette.uiTextMuted }}>
            Resolved
            <input
              type="checkbox"
              checked={selected.resolved}
              onChange={(event) => onPatch(selected.id, { resolved: event.target.checked } as Partial<CanvasElement>)}
            />
          </label>
        </div>
      )}
      {selected.type === 'frame' && (
        <div className="space-y-3">
          <input
            value={selected.title}
            onChange={(event) => onPatch(selected.id, { title: event.target.value } as Partial<CanvasElement>)}
            className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
            style={fieldStyle}
            placeholder="Section title"
          />
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>Color</div>
            <FrameColorGrid
              value={selected.color}
              palette={palette}
              onChange={(color) => onPatch(selected.id, { color } as Partial<CanvasElement>)}
            />
          </div>
          <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-xs" style={{ ...fieldStyle, color: palette.uiTextMuted }}>
            Recortar hijos
            <input
              type="checkbox"
              checked={selected.clipChildren}
              onChange={(event) => onPatch(selected.id, { clipChildren: event.target.checked } as Partial<CanvasElement>)}
            />
          </label>
        </div>
      )}
    </div>
  )
}
