/**
 * Canvas store — single source of truth for elements, camera, selection.
 *
 * Uses Zustand 5 with Immer for ergonomic updates.
 */
'use client'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import type {
  CanvasElement,
  ElementId,
  Camera,
} from '../elements/types'
import { syncZIndexFromElements } from '../elements/factories'
import { DEFAULT_CAMERA } from '../canvas/camera'

enableMapSet()

export type ToolName =
  | 'select' | 'hand'
  | 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'chevron' | 'star' | 'polygon'
  | 'line' | 'arrow' | 'connector'
  | 'text' | 'sticky'
  | 'freedraw' | 'highlighter' | 'eraser'
  | 'frame' | 'image' | 'comment'

export type ThemeMode = 'dark' | 'light' | 'mono' | 'system'

/** 'object' borra elementos completos; 'area' borra TINTA por zona (parte trazos). */
export type EraserMode = 'object' | 'area'

const ERASER_MODE_KEY = 'draw3-eraser-mode'

function initialEraserMode(): EraserMode {
  if (typeof window === 'undefined') return 'object'
  try {
    return window.localStorage.getItem(ERASER_MODE_KEY) === 'area' ? 'area' : 'object'
  } catch {
    return 'object'
  }
}

export interface CanvasState {
  pageId: string | null
  elements: CanvasElement[]
  camera: Camera
  selectedIds: Set<ElementId>
  hoveredId: ElementId | null
  editingId: ElementId | null
  activeTool: ToolName
  eraserMode: EraserMode
  agentVersion: number
  pageName: string
  theme: ThemeMode
  settings: {
    gridStyle: 'none' | 'lines' | 'dots'
    gridSize: number
    snapToGrid: boolean
    snapToObjects: boolean
    snapThreshold: number
    showObjectDimensions: boolean
    showMinimap: boolean
  }

  // Setters
  setPageId: (id: string) => void
  setElements: (elements: CanvasElement[]) => void
  addElement: (el: CanvasElement) => void
  updateElement: (id: ElementId, patch: Partial<CanvasElement>) => void
  removeElements: (ids: ElementId[]) => void
  moveElements: (ids: ElementId[], dx: number, dy: number) => void

  setCamera: (camera: Camera) => void
  setSelection: (ids: ElementId[]) => void
  addToSelection: (id: ElementId) => void
  removeFromSelection: (id: ElementId) => void
  clearSelection: () => void
  setHovered: (id: ElementId | null) => void
  setEditing: (id: ElementId | null) => void

  setActiveTool: (tool: ToolName) => void
  setEraserMode: (mode: EraserMode) => void
  setAgentVersion: (v: number) => void
  setPageName: (name: string) => void
  setTheme: (theme: ThemeMode) => void
  updateSettings: (patch: Partial<CanvasState['settings']>) => void

  reset: () => void
}

const INITIAL_SETTINGS: CanvasState['settings'] = {
  gridStyle: 'dots',
  gridSize: 20,
  snapToGrid: false,
  snapToObjects: true,
  snapThreshold: 6,
  showObjectDimensions: false,
  showMinimap: true,
}

function expandMoveIds(elements: CanvasElement[], ids: ElementId[]): Set<ElementId> {
  const byId = new Map(elements.map(el => [el.id, el]))
  const toMove = new Set<ElementId>()
  const visit = (id: ElementId) => {
    if (toMove.has(id)) return
    const el = byId.get(id)
    if (!el) return
    toMove.add(id)
    if (el.type === 'group') {
      for (const childId of el.childIds) visit(childId)
    }
  }

  for (const id of ids) visit(id)

  let changed = true
  while (changed) {
    changed = false
    for (const el of elements) {
      if (el.type === 'text' && el.containerId != null && toMove.has(el.containerId) && !toMove.has(el.id)) {
        toMove.add(el.id)
        changed = true
      }
    }
  }

  return toMove
}

export const useCanvasStore = create<CanvasState>()(
  immer((set) => ({
    pageId: null,
    elements: [],
    camera: DEFAULT_CAMERA,
    selectedIds: new Set(),
    hoveredId: null,
    editingId: null,
    activeTool: 'select',
    eraserMode: initialEraserMode(),
    agentVersion: 0,
    pageName: 'Untitled',
    theme: 'system',
    settings: INITIAL_SETTINGS,

    setPageId: (id) => set((s) => { s.pageId = id }),

    setElements: (elements) => set((s) => {
      s.elements = elements
      syncZIndexFromElements(elements)
    }),

    addElement: (el) => set((s) => {
      s.elements.push(el)
    }),

    updateElement: (id, patch) => set((s) => {
      const idx = s.elements.findIndex(e => e.id === id)
      if (idx === -1) return
      const next = { ...s.elements[idx], ...patch, updatedAt: Date.now(), version: (s.elements[idx].version ?? 1) + 1 }
      s.elements[idx] = next as CanvasElement
    }),

    removeElements: (ids) => set((s) => {
      const toRemove = new Set(ids)
      s.elements = s.elements.filter(e => !toRemove.has(e.id))
      for (const id of ids) s.selectedIds.delete(id)
    }),

    moveElements: (ids, dx, dy) => set((s) => {
      const toMove = expandMoveIds(s.elements, ids)
      const now = Date.now()
      for (const el of s.elements) {
        if (toMove.has(el.id)) {
          el.x += dx
          el.y += dy
          if (el.type === 'connector' && Array.isArray(el.waypoints)) {
            el.waypoints = el.waypoints.map(point => ({ x: point.x + dx, y: point.y + dy }))
          }
          el.updatedAt = now
          el.version = (el.version ?? 1) + 1
        }
      }
    }),

    setCamera: (camera) => set((s) => {
      // Una camara NaN/Infinity (op corrupta, division por cero en un gesture)
      // congela el zoom de la UI en "NaN%". Ignorar y conservar la previa.
      if (!Number.isFinite(camera.x) || !Number.isFinite(camera.y) || !Number.isFinite(camera.zoom) || camera.zoom <= 0) {
        console.warn('[draw3] setCamera ignored invalid camera:', camera)
        return
      }
      s.camera = camera
    }),

    setSelection: (ids) => set((s) => { s.selectedIds = new Set(ids) }),
    addToSelection: (id) => set((s) => { s.selectedIds.add(id) }),
    removeFromSelection: (id) => set((s) => { s.selectedIds.delete(id) }),
    clearSelection: () => set((s) => { s.selectedIds = new Set() }),

    setHovered: (id) => set((s) => { s.hoveredId = id }),
    setEditing: (id) => set((s) => { s.editingId = id }),

    setActiveTool: (tool) => set((s) => { s.activeTool = tool }),
    setEraserMode: (mode) => set((s) => {
      s.eraserMode = mode
      try { window.localStorage.setItem(ERASER_MODE_KEY, mode) } catch { /* private mode */ }
    }),
    setAgentVersion: (v) => set((s) => { s.agentVersion = v }),
    setPageName: (name) => set((s) => { s.pageName = name }),
    setTheme: (theme) => set((s) => { s.theme = theme }),

    updateSettings: (patch) => set((s) => { s.settings = { ...s.settings, ...patch } }),

    reset: () => set((s) => {
      s.elements = []
      s.camera = DEFAULT_CAMERA
      s.selectedIds = new Set()
      s.hoveredId = null
      s.editingId = null
      s.activeTool = 'select'
      s.agentVersion = 0
      s.settings = INITIAL_SETTINGS
    }),
  }))
)

/**
 * Selectors (subscribe to slices to avoid full re-renders)
 */
const selectElements = (s: CanvasState) => s.elements
const selectCamera = (s: CanvasState) => s.camera
const selectSelection = (s: CanvasState) => s.selectedIds
const selectTool = (s: CanvasState) => s.activeTool
const selectTheme = (s: CanvasState) => s.theme
