/**
 * Atajos de teclado del canvas — extraido verbatim de DrawEditor3.tsx
 * (refactor fase 3, extraccion B4). Escape, Delete, undo/redo, group,
 * duplicate, clipboard, zoom de camara y seleccion de tool por tecla.
 */
'use client'
import { useEffect, useRef, type RefObject } from 'react'
import { setZoomAtCenter, zoomCamera } from '../../canvas/camera'
import { useCanvasStore, type ToolName } from '../../stores/canvas-store'
import type { Camera } from '../../elements/types'
import { isEditableTarget } from '../dom-utils'

type Viewport = { width: number; height: number; dpr: number }

const TOOL_SHORTCUTS: Record<string, ToolName> = {
  v: 'select',
  h: 'hand',
  r: 'rectangle',
  o: 'ellipse',
  d: 'diamond',
  t: 'triangle',
  l: 'line',
  a: 'arrow',
  c: 'connector',
  f: 'frame',
  n: 'sticky',
  i: 'image',
  p: 'freedraw',
  e: 'eraser',
}

export interface CanvasShortcutsDeps {
  clearSelection: () => void
  setActiveTool: (tool: ToolName) => void
  deleteSelected: () => void
  undo: () => void
  redo: () => void
  groupSelection: () => void
  ungroupSelection: () => void
  duplicateSelection: () => void
  copySelectionToClipboard: () => boolean
  cutSelectionToClipboard: () => boolean
  pasteFromClipboard: () => Promise<boolean>
  pasteFallbackTimerRef: RefObject<number | null>
  lastNativePasteAtRef: RefObject<number>
  viewportRef: RefObject<Viewport>
  setCamera: (camera: Camera) => void
  markViewDirty: () => void
  zOrderSelection: (direction: 'forward' | 'backward' | 'front' | 'back') => void
}

export function useCanvasShortcuts({
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
}: CanvasShortcutsDeps) {
  // Foco del lienzo: true mientras el ultimo pointerdown haya ocurrido DENTRO de la
  // superficie del canvas. Si el usuario hace clic fuera (sidebar / chrome de la app),
  // pasa a false y los atajos de zoom dejan de secuestrar cmd +/- (se priorizan a la app).
  const canvasActiveRef = useRef(true)
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      canvasActiveRef.current = !!target?.closest('[data-draw3-canvas-surface]')
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (event.key === 'Escape') {
        const state = useCanvasStore.getState()
        if (state.selectedIds.size > 0 || state.activeTool !== 'select') {
          event.preventDefault()
          clearSelection()
          setActiveTool('select')
        }
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && useCanvasStore.getState().selectedIds.size > 0) {
        event.preventDefault()
        deleteSelected()
        return
      }
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && key === 'y') {
        event.preventDefault()
        redo()
        return
      }
      // Z-order: Cmd+] adelante / Cmd+[ atras; con Alt va al frente/fondo (estilo Figma)
      if (mod && (event.key === ']' || event.key === '[') && useCanvasStore.getState().selectedIds.size > 0) {
        event.preventDefault()
        if (event.key === ']') zOrderSelection(event.altKey ? 'front' : 'forward')
        else zOrderSelection(event.altKey ? 'back' : 'backward')
        return
      }
      if (mod && key === 'g') {
        event.preventDefault()
        // Toggle: Cmd+G sobre una seleccion que ya es grupo(s) desagrupa.
        // Con mezcla (grupo + sueltos) agrupa todo. Cmd+Shift+G sigue desagrupando.
        const state = useCanvasStore.getState()
        const selectedEls = state.elements.filter(el => state.selectedIds.has(el.id))
        const allGroups = selectedEls.length > 0 && selectedEls.every(el => el.type === 'group')
        if (event.shiftKey || allGroups) ungroupSelection()
        else groupSelection()
        return
      }
      if (mod && key === 'd') {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if (mod && key === 'c') {
        if (copySelectionToClipboard()) event.preventDefault()
        return
      }
      if (mod && key === 'x') {
        if (cutSelectionToClipboard()) event.preventDefault()
        return
      }
      if (mod && key === 'v') {
        if (pasteFallbackTimerRef.current != null) window.clearTimeout(pasteFallbackTimerRef.current)
        pasteFallbackTimerRef.current = window.setTimeout(() => {
          pasteFallbackTimerRef.current = null
          if (Date.now() - lastNativePasteAtRef.current < 500) return
          void pasteFromClipboard()
        }, 120)
        return
      }
      // Zoom de la CAMARA del lienzo (no el zoom CSS del UI). Estilo Miro/Figma.
      if (mod && (key === '0' || event.key === '=' || event.key === '+' || event.key === '-' || event.key === '_')) {
        // Solo cuando el canvas esta activo. Si el foco esta fuera (sidebar/app), dejamos
        // pasar cmd +/- para que lo maneje la app desktop / navegador.
        if (!canvasActiveRef.current) return
        event.preventDefault()
        const vp = viewportRef.current
        const cam = useCanvasStore.getState().camera
        if (key === '0') {
          setCamera(setZoomAtCenter(cam, 1, vp))
        } else if (event.key === '-' || event.key === '_') {
          setCamera(zoomCamera(cam, 1 / 1.2, { x: vp.width / 2, y: vp.height / 2 }, vp))
        } else {
          setCamera(zoomCamera(cam, 1.2, { x: vp.width / 2, y: vp.height / 2 }, vp))
        }
        markViewDirty()
        return
      }
      if (!mod && !event.altKey && !event.shiftKey) {
        const tool = TOOL_SHORTCUTS[key]
        if (tool) {
          event.preventDefault()
          setActiveTool(tool)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (pasteFallbackTimerRef.current != null) {
        window.clearTimeout(pasteFallbackTimerRef.current)
        pasteFallbackTimerRef.current = null
      }
    }
  }, [clearSelection, copySelectionToClipboard, cutSelectionToClipboard, deleteSelected, duplicateSelection, groupSelection, markViewDirty, pasteFromClipboard, redo, setActiveTool, setCamera, undo, ungroupSelection, zOrderSelection])
}
