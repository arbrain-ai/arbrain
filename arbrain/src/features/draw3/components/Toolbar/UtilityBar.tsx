'use client'
/**
 * Utility bar — single Miro-like bottom-right cluster.
 *
 * Creation stays in the left rail. This bar owns navigation, view options,
 * export, settings, undo/redo and save status.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  ChevronRight,
  Download,
  Expand,
  Grid3X3,
  Maximize,
  Minus,
  Clock,
  Moon,
  Navigation,
  Plus,
  RotateCw,
  Ruler,
  Settings,
  Sun,
  Undo2,
  Redo2,
} from 'lucide-react'
import { useCanvasStore } from '../../stores/canvas-store'
import { useHistoryStore } from '../../stores/history-store'
import { MIN_ZOOM, MAX_ZOOM, setZoomAtCenter, zoomCamera, fitToBBox } from '../../canvas/camera'
import { bboxFromElement, bboxUnion } from '../../elements/types'
import { getPalette } from '../../theme/tokens'
import { useTheme } from '@/shared/contexts/theme-context'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'

type MenuName = 'zoom' | 'view' | null

const ZOOM_PRESETS = [0.01, 0.1, 0.25, 0.5, 0.7, 1, 2, 4, 8, 12, 20]

interface Props {
  viewport?: { width: number; height: number }
  /**
   * Aceptado pero YA NO se muestra (feedback Daniel 13 jul 2026: el texto
   * "Guardando/Guardado" estorbaba en tablet). El guardado es silencioso —
   * igual que en móvil — y el autosave reintenta cada 2s si falla.
   */
  saving?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onDownload?: () => void
  onOpenSettings?: () => void
  onViewChange?: () => void
}

export function UtilityBar({ viewport, onUndo, onRedo, onDownload, onOpenSettings, onViewChange }: Props) {
  const camera = useCanvasStore(s => s.camera)
  const setCamera = useCanvasStore(s => s.setCamera)
  const elements = useCanvasStore(s => s.elements)
  const { theme, resolvedTheme, cycleTheme: cycleGlobalTheme } = useTheme()
  const settings = useCanvasStore(s => s.settings)
  const updateSettings = useCanvasStore(s => s.updateSettings)
  const canUndo = useHistoryStore(s => s.canUndo())
  const canRedo = useHistoryStore(s => s.canRedo())
  const palette = getPalette(resolvedTheme)
  const isMobile = useIsMobile()
  const [openMenu, setOpenMenu] = useState<MenuName>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const vp = viewport && viewport.width > 0 && viewport.height > 0
    ? viewport
    : { width: typeof window === 'undefined' ? 1000 : window.innerWidth, height: typeof window === 'undefined' ? 800 : window.innerHeight }

  useEffect(() => {
    if (!openMenu) return
    // pointerdown (no mousedown): tocar el canvas touch-action:none no emite
    // eventos mouse de compatibilidad en iOS y el menu quedaba abierto.
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpenMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    syncFullscreen()
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  const zoomIn = () => {
    setCamera(zoomCamera(camera, 1.2, { x: vp.width / 2, y: vp.height / 2 }, vp))
    onViewChange?.()
  }
  const zoomOut = () => {
    setCamera(zoomCamera(camera, 1 / 1.2, { x: vp.width / 2, y: vp.height / 2 }, vp))
    onViewChange?.()
  }
  const setZoom = (zoom: number) => {
    setCamera(setZoomAtCenter(camera, zoom, vp))
    onViewChange?.()
    setOpenMenu(null)
  }
  const fitAll = () => {
    if (elements.length === 0) return
    const u = bboxUnion(elements.map(bboxFromElement))
    if (!u) return
    setCamera(fitToBBox(u, vp, 80))
    onViewChange?.()
    setOpenMenu(null)
  }
  const cycleTheme = () => {
    cycleGlobalTheme()
    onViewChange?.()
  }
  const requestFullscreen = () => {
    const root = document.documentElement
    if (!document.fullscreenElement) void root.requestFullscreen?.()
    else void document.exitFullscreen?.()
    setOpenMenu(null)
  }

  const themeIcon = theme === 'auto' ? <Clock size={15} /> : theme === 'light' ? <Sun size={15} /> : <Moon size={15} />

  // Móvil: la barra inferior se reduce a UN engrane; todo (fit, undo/redo, descargar,
  // cuadrícula, ajustes) vive dentro de su popover. Sin texto "Guardando/Guardado".
  if (isMobile) {
    return (
      <div
        ref={ref}
        data-draw3-ui
        className="absolute bottom-3 right-3 z-40 flex items-center gap-0.5 rounded-2xl border px-1.5 py-1.5 shadow-depth-anchor backdrop-blur-xl"
        style={{ background: palette.uiBgElevated + 'f2', borderColor: palette.uiBorder, color: palette.uiText }}
      >
        <IconBtn label="Deshacer" Icon={Undo2} onClick={onUndo ?? (() => {})} palette={palette} disabled={!canUndo || !onUndo} />
        <IconBtn label="Rehacer" Icon={Redo2} onClick={onRedo ?? (() => {})} palette={palette} disabled={!canRedo || !onRedo} />
        <Divider color={palette.uiBorder} />
        <IconBtn label="Zoom out" Icon={Minus} onClick={zoomOut} palette={palette} disabled={camera.zoom <= MIN_ZOOM} />
        <button
          onClick={() => setOpenMenu(openMenu === 'zoom' ? null : 'zoom')}
          className="h-8 min-w-[52px] shrink-0 rounded-lg px-2 text-sm font-medium transition-colors hover:bg-black/5"
          style={{ background: openMenu === 'zoom' ? palette.accent + '16' : 'transparent', color: palette.uiText }}
          title="Zoom"
        >
          {Math.round(camera.zoom * 100)}%
        </button>
        <IconBtn label="Zoom in" Icon={Plus} onClick={zoomIn} palette={palette} disabled={camera.zoom >= MAX_ZOOM} />
        <IconBtn label="Reencuadrar" Icon={Maximize} onClick={fitAll} palette={palette} />
        <Divider color={palette.uiBorder} />
        <IconBtn label="Opciones del canvas" Icon={Settings} onClick={() => setOpenMenu(openMenu === 'view' ? null : 'view')} palette={palette} active={openMenu === 'view'} />
        {openMenu === 'zoom' && (
          <Popover palette={palette} width={190}>
            <MenuRow Icon={Maximize} label="Ajustar a pantalla" palette={palette} onClick={fitAll} />
            <div className="my-2 h-px" style={{ background: palette.uiBorder }} />
            {ZOOM_PRESETS.map(zoom => (
              <MenuRow key={zoom} Icon={Plus} label={`${Math.round(zoom * 100)}%`} palette={palette} active={Math.abs(camera.zoom - zoom) < 0.005} onClick={() => setZoom(zoom)} />
            ))}
          </Popover>
        )}
        {openMenu === 'view' && (
          <Popover palette={palette} width={250}>
            <MenuRow Icon={RotateCw} label="Recargar página" palette={palette} onClick={() => window.location.reload()} />
            {onDownload && <MenuRow Icon={Download} label="Descargar PNG" palette={palette} onClick={() => { onDownload(); setOpenMenu(null) }} />}
            <div className="my-2 h-px" style={{ background: palette.uiBorder }} />
            <MenuRow Icon={Navigation} label="Mostrar minimapa" palette={palette} active={settings.showMinimap} onClick={() => { updateSettings({ showMinimap: !settings.showMinimap }); onViewChange?.() }} />
            <MenuRow Icon={Ruler} label="Dimensiones del objeto" palette={palette} active={settings.showObjectDimensions} onClick={() => { updateSettings({ showObjectDimensions: !settings.showObjectDimensions }); onViewChange?.() }} />
            <div className="px-2 py-1 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>Cuadricula</div>
            {(['none', 'lines', 'dots'] as const).map(style => (
              <MenuRow
                key={style}
                Icon={ChevronRight}
                label={style === 'none' ? 'Sin fondo' : style === 'lines' ? 'Lineas' : 'Puntos'}
                palette={palette}
                active={settings.gridStyle === style}
                onClick={() => { updateSettings({ gridStyle: style }); onViewChange?.() }}
              />
            ))}
            <label className="mt-2 block px-2 text-xs" style={{ color: palette.uiTextMuted }}>
              Grid size: {settings.gridSize}px
              <input
                type="range" min={10} max={80} step={5} value={settings.gridSize}
                onChange={(e) => { updateSettings({ gridSize: Number(e.target.value) }); onViewChange?.() }}
                className="mt-2 h-7 w-full accent-violet-500"
              />
            </label>
            {onOpenSettings && (
              <>
                <div className="my-2 h-px" style={{ background: palette.uiBorder }} />
                <MenuRow Icon={Settings} label="Ajustes del canvas" palette={palette} onClick={() => { onOpenSettings(); setOpenMenu(null) }} />
              </>
            )}
          </Popover>
        )}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      data-draw3-ui
      className="absolute bottom-3 right-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-2xl border px-1.5 py-1.5 shadow-depth-anchor backdrop-blur-xl"
      style={{ background: palette.uiBgElevated + 'f2', borderColor: palette.uiBorder, color: palette.uiText }}
    >
      <IconBtn label="Undo" Icon={Undo2} onClick={onUndo ?? (() => {})} palette={palette} disabled={!canUndo || !onUndo} />
      <IconBtn label="Redo" Icon={Redo2} onClick={onRedo ?? (() => {})} palette={palette} disabled={!canRedo || !onRedo} />
      <Divider color={palette.uiBorder} />
      <IconBtn label="Zoom out" Icon={Minus} onClick={zoomOut} palette={palette} disabled={camera.zoom <= MIN_ZOOM} />
      <button
        onClick={() => setOpenMenu(openMenu === 'zoom' ? null : 'zoom')}
        className="h-8 min-w-[58px] rounded-lg px-2 text-sm font-medium transition-colors hover:bg-black/5"
        style={{ background: openMenu === 'zoom' ? palette.accent + '16' : 'transparent', color: palette.uiText }}
        title="Zoom presets"
      >
        {Math.round(camera.zoom * 100)}%
      </button>
      <IconBtn label="Zoom in" Icon={Plus} onClick={zoomIn} palette={palette} disabled={camera.zoom >= MAX_ZOOM} />
      <Divider color={palette.uiBorder} />
      <IconBtn label="Fit all" Icon={Maximize} onClick={fitAll} palette={palette} />
      <IconBtn label="View options" Icon={Grid3X3} onClick={() => setOpenMenu(openMenu === 'view' ? null : 'view')} palette={palette} active={openMenu === 'view'} />
      <IconBtn label={`Theme: ${theme}`} customIcon={themeIcon} onClick={cycleTheme} palette={palette} />
      {onDownload && <IconBtn label="Download PNG" Icon={Download} onClick={onDownload} palette={palette} />}
      {onOpenSettings && <IconBtn label="Canvas settings" Icon={Settings} onClick={onOpenSettings} palette={palette} settingsTrigger />}

      {openMenu === 'zoom' && (
        <Popover palette={palette} width={190}>
          <MenuRow Icon={Maximize} label="Ajustar a pantalla" shortcut="⌥ 1" palette={palette} onClick={fitAll} />
          <div className="my-2 h-px" style={{ background: palette.uiBorder }} />
          {ZOOM_PRESETS.map(zoom => (
            <MenuRow
              key={zoom}
              Icon={Plus}
              label={`${Math.round(zoom * 100)}%`}
              shortcut={zoom === 1 ? '⌘ 0' : undefined}
              palette={palette}
              active={Math.abs(camera.zoom - zoom) < 0.005}
              onClick={() => setZoom(zoom)}
            />
          ))}
        </Popover>
      )}

      {openMenu === 'view' && (
        <Popover palette={palette} width={260}>
          <MenuRow Icon={Expand} label={fullscreen ? 'Salir de pantalla completa' : 'Ingresar a pantalla completa'} palette={palette} onClick={requestFullscreen} />
          <MenuRow Icon={Navigation} label="Mostrar minimapa" palette={palette} active={settings.showMinimap} onClick={() => { updateSettings({ showMinimap: !settings.showMinimap }); onViewChange?.() }} />
          <MenuRow Icon={Ruler} label="Dimensiones del objeto" palette={palette} active={settings.showObjectDimensions} onClick={() => { updateSettings({ showObjectDimensions: !settings.showObjectDimensions }); onViewChange?.() }} />
          <div className="my-2 h-px" style={{ background: palette.uiBorder }} />
          <div className="px-2 py-1 text-[10px] uppercase tracking-widest" style={{ color: palette.uiTextMuted }}>Cuadricula</div>
          {(['none', 'lines', 'dots'] as const).map(style => (
            <MenuRow
              key={style}
              Icon={ChevronRight}
              label={style === 'none' ? 'Sin fondo' : style === 'lines' ? 'Lineas' : 'Puntos'}
              palette={palette}
              active={settings.gridStyle === style}
              onClick={() => { updateSettings({ gridStyle: style }); onViewChange?.() }}
            />
          ))}
          <label className="mt-2 block px-2 text-xs" style={{ color: palette.uiTextMuted }}>
            Grid size: {settings.gridSize}px
            <input
              type="range"
              min={10}
              max={80}
              step={5}
              value={settings.gridSize}
              onChange={(e) => { updateSettings({ gridSize: Number(e.target.value) }); onViewChange?.() }}
              className="mt-2 w-full accent-violet-500"
            />
          </label>
        </Popover>
      )}
    </div>
  )
}

function Popover({ children, palette, width }: { children: ReactNode; palette: ReturnType<typeof getPalette>; width: number }) {
  return (
    <div
      data-draw3-ui
      className="absolute bottom-[calc(100%+8px)] right-0 max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain rounded-2xl border p-2 shadow-depth-anchor"
      style={{ width, background: palette.uiBgElevated, borderColor: palette.uiBorder, color: palette.uiText }}
    >
      {children}
    </div>
  )
}

function MenuRow({ Icon, label, shortcut, palette, active, onClick }: {
  Icon: typeof Plus
  label: string
  shortcut?: string
  palette: ReturnType<typeof getPalette>
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-black/5"
      style={{ background: active ? palette.accent + '14' : 'transparent', color: palette.uiText }}
    >
      <span className="flex h-5 w-5 items-center justify-center" style={{ color: active ? palette.accent : palette.uiText }}>
        {active ? <Check size={15} /> : <Icon size={15} />}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      {shortcut && <span className="text-xs" style={{ color: palette.uiTextMuted }}>{shortcut}</span>}
    </button>
  )
}

function IconBtn({ Icon, label, onClick, palette, disabled, active, customIcon, settingsTrigger }: {
  Icon?: typeof Plus
  customIcon?: ReactNode
  label: string
  onClick: () => void
  palette: ReturnType<typeof getPalette>
  disabled?: boolean
  active?: boolean
  settingsTrigger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      data-draw3-settings-trigger={settingsTrigger ? true : undefined}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-35 hover:bg-black/5"
      style={{
        background: active ? palette.accent + '18' : 'transparent',
        color: active ? palette.accent : palette.uiText,
      }}
    >
      {customIcon ?? (Icon ? <Icon size={15} /> : null)}
    </button>
  )
}

function Divider({ color }: { color: string }) {
  return <div className="mx-0.5 h-5 w-px shrink-0" style={{ background: color }} />
}
