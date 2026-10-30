'use client'
/**
 * Primary toolbar — Miro-style rail.
 * One compact rail; shapes/lines, pen, and widgets open proper flyouts.
 */
import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  ChevronsRight,
  Circle,
  Code2,
  Diamond,
  Eraser,
  FileText,
  Frame,
  Hand,
  Hash,
  Hexagon,
  Highlighter,
  Image as ImageIcon,
  Kanban,
  MessageSquare,
  Minus,
  MousePointer2,
  Pen,
  PenLine,
  Plus,
  Route,
  Search,
  Shapes,
  Sparkles,
  Square,
  Star,
  StickyNote,
  Table2,
  Timer,
  Triangle,
  Type,
} from 'lucide-react'
import { useCanvasStore, type ToolName } from '../../stores/canvas-store'
import { getPalette, type ThemeName } from '../../theme/tokens'
import { CanvasColorPalette } from '../ColorPalette/CanvasColorPalette'

type WidgetKind = 'sticky' | 'mermaid' | 'code' | 'table' | 'timeline' | 'kanban' | 'doc' | 'embed' | 'comment'
type MenuName = 'selection' | 'shapes' | 'pen' | 'widgets' | null

interface ToolItem {
  tool: ToolName
  Icon: typeof MousePointer2
  label: string
  shortcut?: string
  description?: string
}

interface WidgetItem {
  id: string
  Icon: typeof MousePointer2
  label: string
  description: string
  section: 'Formatos' | 'Esenciales'
  action: { type: 'widget'; kind: WidgetKind } | { type: 'tool'; tool: ToolName }
}

interface Props {
  onAddWidget?: (kind: WidgetKind) => void
  penStyle?: { strokeColor: string; strokeWidth: number }
  onPenStyle?: (patch: { strokeColor?: string; strokeWidth?: number }) => void
  /** Override de posicionamiento del contenedor (móvil = burbuja abajo-izq). */
  containerClassName?: string
  /** Botones extra al final de la barra (ej. Exportar en móvil). */
  extra?: ReactNode
}

// max-w contra el CONTENEDOR (100%), no contra la ventana (100vw): con el sidebar
// abierto 100vw era más ancho que el área real del canvas. no-scrollbar: el riel
// scrollea solo si de verdad no cabe, pero JAMÁS pinta barras — con scrollbars
// clásicas de macOS (mouse conectado) o zoom, 1px de redondeo pintaba las dos
// barras moradas parpadeantes (bug cazado por Daniel, 11 ago 2026).
const DEFAULT_TOOLBAR_CLASS = 'absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto no-scrollbar rounded-2xl border px-1.5 py-1.5 shadow-depth-anchor backdrop-blur-xl'

const SHAPE_MENU: ToolItem[] = [
  { tool: 'line', Icon: Minus, label: 'Linea', shortcut: 'L' },
  { tool: 'arrow', Icon: ArrowRight, label: 'Flecha', shortcut: 'A' },
  { tool: 'connector', Icon: Route, label: 'Flecha curva', shortcut: 'C' },
  { tool: 'rectangle', Icon: Square, label: 'Rectangulo', shortcut: 'R' },
  { tool: 'ellipse', Icon: Circle, label: 'Ovalo', shortcut: 'O' },
  { tool: 'diamond', Icon: Diamond, label: 'Rombo', shortcut: 'D' },
  { tool: 'triangle', Icon: Triangle, label: 'Triangulo', shortcut: 'T' },
  { tool: 'chevron', Icon: ChevronsRight, label: 'Chevron / proceso' },
]

const MORE_SHAPE_MENU: ToolItem[] = [
  { tool: 'star', Icon: Star, label: 'Estrella' },
  { tool: 'polygon', Icon: Hexagon, label: 'Hexagono' },
]

const SELECTION_MENU: ToolItem[] = [
  { tool: 'select', Icon: MousePointer2, label: 'Seleccionar', shortcut: 'V' },
  { tool: 'hand', Icon: Hand, label: 'Mover lienzo', shortcut: 'H' },
]

const PEN_WIDTHS = [2, 4, 6, 8, 12, 16]

const WIDGETS: WidgetItem[] = [
  { id: 'diagram', Icon: Sparkles, label: 'Diagrama', description: 'Genera estructura editable', section: 'Formatos', action: { type: 'widget', kind: 'mermaid' } },
  { id: 'table', Icon: Table2, label: 'Tabla', description: 'Datos en filas y columnas', section: 'Formatos', action: { type: 'widget', kind: 'table' } },
  { id: 'timeline', Icon: Timer, label: 'Cronograma', description: 'Linea de tiempo simple', section: 'Formatos', action: { type: 'widget', kind: 'timeline' } },
  { id: 'kanban', Icon: Kanban, label: 'Kanban', description: 'Columnas para flujo de trabajo', section: 'Formatos', action: { type: 'widget', kind: 'kanban' } },
  { id: 'doc', Icon: FileText, label: 'Documento', description: 'Nota larga en el lienzo', section: 'Formatos', action: { type: 'widget', kind: 'doc' } },
  { id: 'pen', Icon: Pen, label: 'Boligrafo', description: 'Dibujo a mano alzada', section: 'Esenciales', action: { type: 'tool', tool: 'freedraw' } },
  { id: 'sticky', Icon: StickyNote, label: 'Nota adhesiva', description: 'Nota editable estilo Miro', section: 'Esenciales', action: { type: 'widget', kind: 'sticky' } },
  { id: 'text', Icon: Type, label: 'Texto', description: 'Texto libre o dentro de shapes', section: 'Esenciales', action: { type: 'tool', tool: 'text' } },
  { id: 'image', Icon: ImageIcon, label: 'Imagen', description: 'Sube o pega una imagen', section: 'Esenciales', action: { type: 'tool', tool: 'image' } },
  { id: 'code', Icon: Code2, label: 'Bloque de codigo', description: 'Snippet con lenguaje editable', section: 'Esenciales', action: { type: 'widget', kind: 'code' } },
  { id: 'mermaid', Icon: Hash, label: 'Mermaid', description: 'Diagrama por sintaxis', section: 'Esenciales', action: { type: 'widget', kind: 'mermaid' } },
  { id: 'comment', Icon: MessageSquare, label: 'Comentario', description: 'Pin de revision', section: 'Esenciales', action: { type: 'widget', kind: 'comment' } },
  { id: 'embed', Icon: ImageIcon, label: 'Embed / link', description: 'Tarjeta para URL o recurso', section: 'Esenciales', action: { type: 'widget', kind: 'embed' } },
]

export function PrimaryToolbar({ onAddWidget, penStyle, onPenStyle, containerClassName, extra }: Props) {
  const activeTool = useCanvasStore(s => s.activeTool)
  const setActiveTool = useCanvasStore(s => s.setActiveTool)
  const theme = useCanvasStore(s => s.theme)
  const palette = getPalette(theme === 'system' ? 'system' : (theme as ThemeName))

  const [openMenu, setOpenMenu] = useState<MenuName>(null)
  const selectionBtnRef = useRef<HTMLButtonElement>(null)
  const shapesBtnRef = useRef<HTMLButtonElement>(null)
  const penBtnRef = useRef<HTMLButtonElement>(null)
  const widgetsBtnRef = useRef<HTMLButtonElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)

  const currentShapeTool = useMemo(() => [...SHAPE_MENU, ...MORE_SHAPE_MENU].find(item => item.tool === activeTool), [activeTool])
  const currentSelectionTool = useMemo(() => SELECTION_MENU.find(item => item.tool === activeTool), [activeTool])

  useEffect(() => {
    if (!openMenu) return
    // pointerdown, NO mousedown: sobre el canvas (touch-action: none) iOS
    // suprime los eventos mouse de compatibilidad y el flyout jamas cerraria.
    const handler = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        flyoutRef.current?.contains(target) ||
        selectionBtnRef.current?.contains(target) ||
        shapesBtnRef.current?.contains(target) ||
        penBtnRef.current?.contains(target) ||
        widgetsBtnRef.current?.contains(target)
      ) return
      setOpenMenu(null)
    }
    document.addEventListener('pointerdown', handler)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpenMenu(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', handler)
      window.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  const selectTool = (tool: ToolName) => {
    setActiveTool(tool)
    setOpenMenu(null)
  }

  return (
    <div
      data-draw3-ui
      className={containerClassName ?? DEFAULT_TOOLBAR_CLASS}
      style={{ background: palette.uiBgElevated + 'f2', borderColor: palette.uiBorder }}
    >
      <RailButton
        ref={selectionBtnRef}
        Icon={currentSelectionTool?.Icon ?? MousePointer2}
        label={currentSelectionTool?.label ?? 'Seleccionar'}
        shortcut={currentSelectionTool?.shortcut ?? 'V'}
        active={activeTool === 'select' || activeTool === 'hand' || openMenu === 'selection'}
        palette={palette}
        onClick={() => {
          // 1er tap desde otra tool: vuelve a seleccionar. 2o tap: abre el flyout.
          if (activeTool !== 'select' && activeTool !== 'hand') {
            setActiveTool('select')
            setOpenMenu(null)
            return
          }
          setOpenMenu(openMenu === 'selection' ? null : 'selection')
        }}
      />
      <RailDivider color={palette.uiBorder} />
      <RailButton Icon={StickyNote} label="Sticky" shortcut="N" active={activeTool === 'sticky'} palette={palette} onClick={() => selectTool('sticky')} />
      <RailButton Icon={Type} label="Text" shortcut="T" active={activeTool === 'text'} palette={palette} onClick={() => selectTool('text')} />
      <RailButton Icon={ImageIcon} label="Image" shortcut="I" active={activeTool === 'image'} palette={palette} onClick={() => selectTool('image')} />
      <RailButton
        ref={shapesBtnRef}
        Icon={currentShapeTool?.Icon ?? Shapes}
        label="Lineas y formas"
        shortcut={currentShapeTool?.shortcut ?? 'R'}
        active={Boolean(currentShapeTool) || openMenu === 'shapes'}
        palette={palette}
        onClick={() => setOpenMenu(openMenu === 'shapes' ? null : 'shapes')}
      />
      <RailButton Icon={Frame} label="Frame / seccion" shortcut="F" active={activeTool === 'frame'} palette={palette} onClick={() => selectTool('frame')} />
      <RailButton
        ref={penBtnRef}
        Icon={Pen}
        label="Pen"
        shortcut="P"
        active={activeTool === 'freedraw' || activeTool === 'highlighter' || activeTool === 'eraser' || openMenu === 'pen'}
        palette={palette}
        onClick={() => {
          // Tap desde FUERA de la familia pen → activa el boligrafo de una (nunca
          // dejar al usuario sin tool). Ya dentro de la familia (boligrafo/
          // marcador/borrador) el tap solo alterna el flyout: cambiar de sub-tool
          // se hace ahi dentro, sin pisar la eleccion actual.
          const inPenFamily = activeTool === 'freedraw' || activeTool === 'highlighter' || activeTool === 'eraser'
          if (!inPenFamily) setActiveTool('freedraw')
          setOpenMenu(openMenu === 'pen' ? null : 'pen')
        }}
      />
      <RailDivider color={palette.uiBorder} />
      <RailButton
        ref={widgetsBtnRef}
        Icon={Plus}
        label="Widgets"
        shortcut="+"
        active={openMenu === 'widgets'}
        palette={palette}
        onClick={() => setOpenMenu(openMenu === 'widgets' ? null : 'widgets')}
      />
      <RailButton Icon={MessageSquare} label="Comment" shortcut="C" active={activeTool === 'comment'} palette={palette} onClick={() => selectTool('comment')} />

      {extra}

      {/* Flyouts en PORTAL a <body>: el rail tiene transform + overflow-x-auto,
          que convierten al toolbar en containing block del position:fixed Y lo
          recortan — dentro del rail los menus quedaban 100% invisibles. */}
      {openMenu === 'selection' && createPortal(
        <SelectionFlyout
          ref={flyoutRef}
          anchor={selectionBtnRef}
          activeTool={activeTool}
          palette={palette}
          onSelect={selectTool}
        />,
        document.body,
      )}
      {openMenu === 'shapes' && createPortal(
        <ShapesFlyout
          ref={flyoutRef}
          anchor={shapesBtnRef}
          activeTool={activeTool}
          palette={palette}
          onSelect={selectTool}
        />,
        document.body,
      )}
      {openMenu === 'pen' && createPortal(
        <PenFlyout
          ref={flyoutRef}
          anchor={penBtnRef}
          palette={palette}
          penStyle={penStyle}
          onPenStyle={onPenStyle}
          activeTool={activeTool}
          onSelect={(tool) => setActiveTool(tool)}
        />,
        document.body,
      )}
      {openMenu === 'widgets' && createPortal(
        <WidgetsFlyout
          ref={flyoutRef}
          anchor={widgetsBtnRef}
          palette={palette}
          onSelect={(item) => {
            if (item.action.type === 'tool') selectTool(item.action.tool)
            else onAddWidget?.(item.action.kind)
            setOpenMenu(null)
          }}
        />,
        document.body,
      )}
    </div>
  )
}

const RailButton = forwardRef<HTMLButtonElement, {
  Icon: typeof MousePointer2
  label: string
  shortcut?: string
  active: boolean
  palette: ReturnType<typeof getPalette>
  accent?: boolean
  onClick?: () => void
}>(function RailButton({ Icon, label, shortcut, active, palette, accent, onClick }, ref) {
  const activeBg = accent ? palette.accent + '20' : palette.accent
  return (
    <button
      ref={ref}
      onClick={onClick}
      className="group relative flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:scale-[1.03]"
      style={{
        background: active ? activeBg : 'transparent',
        color: active ? (accent ? palette.accent : '#fff') : palette.uiText,
      }}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
    >
      <Icon size={18} />
      <span
        className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] shadow-xl group-hover:block"
        style={{ background: palette.uiBgElevated, color: palette.uiText, border: `1px solid ${palette.uiBorder}` }}
      >
        {label}{shortcut ? ` · ${shortcut}` : ''}
      </span>
    </button>
  )
})

const ShapesFlyout = forwardRef<HTMLDivElement, {
  anchor: RefObject<HTMLButtonElement | null>
  activeTool: ToolName
  palette: ReturnType<typeof getPalette>
  onSelect: (tool: ToolName) => void
}>(function ShapesFlyout({ anchor, activeTool, palette, onSelect }, ref) {
  const [showMore, setShowMore] = useState(false)
  const pos = getFlyoutPosition(anchor, 288, 430)
  return (
    <div
      ref={ref}
      data-draw3-ui
      className="fixed z-50 w-72 overflow-y-auto overscroll-contain rounded-2xl border p-2 shadow-depth-anchor backdrop-blur-xl"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: Math.min(430, pos.maxHeight), background: palette.uiBgElevated, borderColor: palette.uiBorder, color: palette.uiText }}
    >
      <FlyoutSection title="Lineas">
        <FlyoutItem item={SHAPE_MENU[0]} active={activeTool === 'line'} palette={palette} onSelect={onSelect} />
        <FlyoutItem item={SHAPE_MENU[1]} active={activeTool === 'arrow'} palette={palette} onSelect={onSelect} />
        <FlyoutItem item={SHAPE_MENU[2]} active={activeTool === 'connector'} palette={palette} onSelect={onSelect} />
      </FlyoutSection>
      <div className="my-2 h-px" style={{ background: palette.uiBorder }} />
      <FlyoutSection title="Formas">
        {SHAPE_MENU.slice(3).map(item => (
          <FlyoutItem key={item.tool} item={item} active={activeTool === item.tool} palette={palette} onSelect={onSelect} />
        ))}
      </FlyoutSection>
      <div className="my-2 h-px" style={{ background: palette.uiBorder }} />
      <button
        onClick={() => setShowMore(value => !value)}
        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-black/5"
        style={{ color: showMore ? palette.accent : palette.uiText }}
      >
        <span>Mas formas</span>
        <Plus size={16} className={showMore ? 'rotate-45 transition-transform' : 'transition-transform'} />
      </button>
      {showMore && (
        <FlyoutSection title="Extras">
          {MORE_SHAPE_MENU.map(item => (
            <FlyoutItem key={item.tool} item={item} active={activeTool === item.tool} palette={palette} onSelect={onSelect} />
          ))}
        </FlyoutSection>
      )}
    </div>
  )
})

const SelectionFlyout = forwardRef<HTMLDivElement, {
  anchor: RefObject<HTMLButtonElement | null>
  activeTool: ToolName
  palette: ReturnType<typeof getPalette>
  onSelect: (tool: ToolName) => void
}>(function SelectionFlyout({ anchor, activeTool, palette, onSelect }, ref) {
  const pos = getFlyoutPosition(anchor, 210, 116)
  return (
    <div
      ref={ref}
      data-draw3-ui
      className="fixed z-50 w-[210px] overflow-y-auto overscroll-contain rounded-2xl border p-1.5 shadow-depth-anchor backdrop-blur-xl"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, background: palette.uiBgElevated, borderColor: palette.uiBorder, color: palette.uiText }}
    >
      {SELECTION_MENU.map(item => (
        <CompactToolRow
          key={item.tool}
          item={item}
          active={activeTool === item.tool}
          palette={palette}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
})

function CompactToolRow({
  item,
  active,
  palette,
  onSelect,
}: {
  item: ToolItem
  active: boolean
  palette: ReturnType<typeof getPalette>
  onSelect: (tool: ToolName) => void
}) {
  const Icon = item.Icon
  return (
    <button
      onClick={() => onSelect(item.tool)}
      className="flex h-10 w-full items-center justify-between rounded-xl px-2.5 text-sm transition-colors hover:bg-black/5"
      style={{ background: active ? palette.accent + '16' : 'transparent', color: active ? palette.accent : palette.uiText }}
      title={item.label}
    >
      <span className="flex items-center gap-2.5">
        <Icon size={18} strokeWidth={2.1} />
        <span>{item.label}</span>
      </span>
      {item.shortcut && <span className="text-xs" style={{ color: active ? palette.accent : palette.uiTextMuted }}>{item.shortcut}</span>}
    </button>
  )
}

const PenFlyout = forwardRef<HTMLDivElement, {
  anchor: RefObject<HTMLButtonElement | null>
  palette: ReturnType<typeof getPalette>
  penStyle?: { strokeColor: string; strokeWidth: number }
  onPenStyle?: (patch: { strokeColor?: string; strokeWidth?: number }) => void
  activeTool: ToolName
  onSelect: (tool: ToolName) => void
}>(function PenFlyout({ anchor, palette, penStyle, onPenStyle, activeTool, onSelect }, ref) {
  const pos = getFlyoutPosition(anchor, 326, 560)
  const currentWidth = penStyle?.strokeWidth ?? 4
  const currentColor = penStyle?.strokeColor ?? '#111827'
  const eraserMode = useCanvasStore(s => s.eraserMode)
  const setEraserMode = useCanvasStore(s => s.setEraserMode)
  return (
    <div
      ref={ref}
      data-draw3-ui
      className="fixed z-50 flex flex-col gap-2 overflow-y-auto overscroll-contain rounded-2xl border p-2 shadow-depth-anchor backdrop-blur-xl"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: Math.min(560, pos.maxHeight), width: pos.width, background: palette.uiBgElevated, borderColor: palette.uiBorder, color: palette.uiText }}
    >
      <div className="grid grid-cols-3 gap-1">
        <PenToolButton Icon={PenLine} active={activeTool === 'freedraw'} palette={palette} label="Boligrafo (P)" onClick={() => onSelect('freedraw')} />
        <PenToolButton Icon={Highlighter} active={activeTool === 'highlighter'} palette={palette} label="Marcador" onClick={() => onSelect('highlighter')} />
        <PenToolButton Icon={Eraser} active={activeTool === 'eraser'} palette={palette} label="Borrador (E)" onClick={() => onSelect('eraser')} />
      </div>
      {activeTool === 'eraser' && (
        <div className="grid grid-cols-2 gap-1 rounded-xl border p-1" style={{ borderColor: palette.uiBorder, background: palette.uiBg }}>
          {([
            ['object', 'Objeto', 'Borra el elemento completo'],
            ['area', 'Zona', 'Borra tinta por zona (parte el trazo)'],
          ] as const).map(([mode, label, hint]) => (
            <button
              key={mode}
              onClick={() => setEraserMode(mode)}
              title={hint}
              className="rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: eraserMode === mode ? palette.accent + '20' : 'transparent',
                color: eraserMode === mode ? palette.accent : palette.uiTextMuted,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="rounded-xl border p-2" style={{ borderColor: palette.uiBorder, background: palette.uiBg }}>
        <CanvasColorPalette
          value={currentColor}
          palette={palette}
          includeCustom={false}
          swatchSize="md"
          onChange={(color) => {
            if (color) onPenStyle?.({ strokeColor: color })
          }}
        />
      </div>
      <div className="grid grid-cols-6 gap-1">
        {PEN_WIDTHS.map(width => (
          <PenWidthButton
            key={width}
            width={width}
            color={currentColor}
            active={currentWidth === width}
            palette={palette}
            onClick={() => onPenStyle?.({ strokeWidth: width })}
          />
        ))}
      </div>
    </div>
  )
})

function PenToolButton({
  Icon,
  active,
  palette,
  label,
  onClick,
}: {
  Icon: typeof MousePointer2
  active: boolean
  palette: ReturnType<typeof getPalette>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-black/5"
      style={{ background: active ? palette.accent + '18' : 'transparent', color: active ? palette.accent : palette.uiText }}
    >
      <Icon size={19} strokeWidth={2.15} />
    </button>
  )
}

function PenWidthButton({
  width,
  color,
  active,
  palette,
  onClick,
}: {
  width: number
  color: string
  active: boolean
  palette: ReturnType<typeof getPalette>
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={`${width}px`}
      className="flex h-9 w-10 items-center justify-center rounded-xl transition-colors hover:bg-black/5"
      style={{ background: active ? palette.accent + '14' : 'transparent' }}
    >
      <span
        className="rounded-full"
        style={{
          width: Math.min(30, 16 + width),
          height: Math.max(2, Math.min(8, width / 2)),
          background: color,
          border: color.toLowerCase() === '#ffffff' ? `1px solid ${palette.uiBorder}` : undefined,
          boxShadow: active ? `0 0 0 2px ${palette.accent}55` : undefined,
        }}
      />
    </button>
  )
}

const WidgetsFlyout = forwardRef<HTMLDivElement, {
  anchor: RefObject<HTMLButtonElement | null>
  palette: ReturnType<typeof getPalette>
  onSelect: (item: WidgetItem) => void
}>(function WidgetsFlyout({ anchor, palette, onSelect }, ref) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const pos = getFlyoutPosition(anchor, 460, 620)
  const filtered = WIDGETS.filter(item => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return `${item.label} ${item.description} ${item.section}`.toLowerCase().includes(q)
  })
  const sections: Array<WidgetItem['section']> = ['Formatos', 'Esenciales']

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div
      ref={ref}
      data-draw3-ui
      className="fixed z-50 overflow-y-auto overscroll-contain rounded-2xl border p-4 shadow-depth-anchor backdrop-blur-xl"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: Math.min(620, pos.maxHeight), width: pos.width, background: palette.uiBgElevated, borderColor: palette.uiBorder, color: palette.uiText }}
    >
      <div className="mb-3 flex items-center gap-2 rounded-xl border px-3 py-2" style={{ background: palette.uiBg, borderColor: palette.uiBorder }}>
        <Search size={16} style={{ color: palette.uiTextMuted }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          style={{ color: palette.uiText }}
          placeholder="Buscar herramientas..."
        />
      </div>
      <div className="mb-4 flex gap-2 text-sm font-medium">
        <span className="rounded-lg px-3 py-1.5" style={{ background: palette.accent + '18', color: palette.accent }}>Herramientas</span>
        <span className="rounded-lg px-3 py-1.5" style={{ color: palette.uiTextMuted }}>Marketplace</span>
      </div>
      {sections.map(section => {
        const items = filtered.filter(item => item.section === section)
        if (items.length === 0) return null
        return (
          <div key={section} className="mb-4">
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: palette.uiText }}>
              {section}
            </div>
            <div className="space-y-1">
              {items.map(({ id, Icon, label, description, action }) => (
                <button
                  key={id}
                  onClick={() => onSelect({ id, Icon, label, description, section, action })}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-black/5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border" style={{ borderColor: palette.uiBorder, color: palette.accent, background: palette.accent + '10' }}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium" style={{ color: palette.uiText }}>{label}</span>
                    <span className="block text-xs leading-snug" style={{ color: palette.uiTextMuted }}>{description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
      {filtered.length === 0 && (
        <div className="rounded-xl px-3 py-8 text-center text-sm" style={{ color: palette.uiTextMuted, background: palette.uiBg }}>
          Sin resultados
        </div>
      )}
    </div>
  )
})

interface FlyoutPosition {
  left: number
  top?: number
  bottom?: number
  width: number
  maxHeight: number
}

/**
 * Posicion del flyout en coordenadas de VIEWPORT (los flyouts viven en un
 * portal a <body> con position:fixed). Barra arriba → abre hacia abajo con
 * maxHeight (scroll interno si no cabe). Barra abajo (rail movil) → abre
 * hacia ARRIBA anclado con `bottom`.
 */
function getFlyoutPosition(anchor: RefObject<HTMLButtonElement | null>, width: number, _height: number): FlyoutPosition {
  if (typeof window === 'undefined') return { left: 0, top: 56, width, maxHeight: 480 }
  // Los rects vienen en px VISUALES pero el flyout (fixed, hijo del <html>
  // zoomeado por --ui-zoom) se posiciona en px de LAYOUT: dividir todo por el
  // zoom efectivo o el menu aterriza corrido cuando el UI zoom != 1.
  const uiZoom = Number(getComputedStyle(document.documentElement).zoom) || 1
  const scaleRect = (r: DOMRect) => ({
    left: r.left / uiZoom, top: r.top / uiZoom, right: r.right / uiZoom, bottom: r.bottom / uiZoom, width: r.width / uiZoom, height: r.height / uiZoom,
  })
  const rawRect = anchor.current?.getBoundingClientRect()
  const rawBar = anchor.current?.parentElement?.getBoundingClientRect()
  const rawSurface = anchor.current?.closest('[data-draw3-canvas-surface]')?.getBoundingClientRect()
  const rect = rawRect ? scaleRect(rawRect) : undefined
  const bar = rawBar ? scaleRect(rawBar) : undefined
  const surface = rawSurface ? scaleRect(rawSurface) : undefined
  const bounds = surface ?? { left: 0, top: 0, right: window.innerWidth / uiZoom, bottom: window.innerHeight / uiZoom }

  const resolvedWidth = Math.min(width, Math.max(280, bounds.right - bounds.left - 24))
  const anchorCenter = rect ? rect.left + rect.width / 2 : (bounds.left + bounds.right) / 2
  const left = Math.max(
    bounds.left + 12,
    Math.min(anchorCenter - resolvedWidth / 2, bounds.right - resolvedWidth - 12),
  )

  const barIsBottom = bar ? bar.top > (bounds.top + bounds.bottom) / 2 : false
  if (!barIsBottom) {
    const top = (bar?.bottom ?? 54) + 10
    return { left, top, width: resolvedWidth, maxHeight: Math.max(160, bounds.bottom - 12 - top) }
  }
  return {
    left,
    bottom: window.innerHeight / uiZoom - bar!.top + 10,
    width: resolvedWidth,
    maxHeight: Math.max(160, bar!.top - bounds.top - 24),
  }
}

function FlyoutSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-1 text-[10px] uppercase tracking-widest opacity-50">{title}</div>
      <div>{children}</div>
    </div>
  )
}

function FlyoutItem({ item, active, palette, onSelect }: {
  item: ToolItem
  active: boolean
  palette: ReturnType<typeof getPalette>
  onSelect: (tool: ToolName) => void
}) {
  const Icon = item.Icon
  return (
    <button
      onClick={() => onSelect(item.tool)}
      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-black/5"
      style={{ background: active ? palette.accent + '16' : 'transparent', color: active ? palette.accent : palette.uiText }}
    >
      <span className="flex items-center gap-3">
        <Icon size={17} />
        {item.label}
      </span>
      {item.shortcut && <span className="text-xs" style={{ color: palette.uiTextMuted }}>{item.shortcut}</span>}
    </button>
  )
}

function RailDivider({ color }: { color: string }) {
  return <div className="mx-0.5 h-6 w-px" style={{ background: color }} />
}
