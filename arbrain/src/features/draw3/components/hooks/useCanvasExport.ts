/**
 * Export del canvas (PNG / PDF / JSON) — extraido verbatim de DrawEditor3.tsx
 * (refactor fase 3, extraccion B1). Fire-and-forget sobre el estado del store;
 * no toca pointer events, realtime ni save.
 */
'use client'
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { render } from '../../canvas/engine'
import { visualBBoxUnion } from '../../canvas/visual-bbox'
import { useCanvasStore } from '../../stores/canvas-store'
import type { CanvasElement, Camera } from '../../elements/types'
import type { getPalette } from '../../theme/tokens'

export type CanvasExportFormat = 'png' | 'pdf' | 'json'

type Viewport = { width: number; height: number; dpr: number }
type Palette = ReturnType<typeof getPalette>

export function useCanvasExport({
  pageId,
  palette,
  nameRef,
}: {
  pageId: string
  palette: Palette
  nameRef: RefObject<string>
}) {
  const exportCanvas = useCallback(async (format: CanvasExportFormat) => {
    const state = useCanvasStore.getState()
    const baseName = safeExportName(nameRef.current || state.pageName || 'canvas-v3')

    if (format === 'json') {
      downloadBlob(
        new Blob([
          JSON.stringify({
            version: 'draw3',
            schemaVersion: 3,
            exportedAt: new Date().toISOString(),
            pageId,
            name: nameRef.current || state.pageName,
            theme: state.theme,
            camera: { x: state.camera.x, y: state.camera.y, scale: state.camera.zoom },
            settings: state.settings,
            elements: state.elements,
          }, null, 2),
        ], { type: 'application/json' }),
        `${baseName}.json`,
      )
      return
    }

    const exportCanvasEl = await renderCanvasForExport({
      elements: state.elements,
      palette,
      settings: state.settings,
    })
    if (!exportCanvasEl) return

    if (format === 'png') {
      const blob = await canvasToBlob(exportCanvasEl, 'image/png')
      if (blob) downloadBlob(blob, `${baseName}.png`)
      return
    }

    const jpeg = await canvasToBlob(exportCanvasEl, 'image/jpeg', 0.94)
    if (!jpeg) return
    const pdf = await createPdfFromJpeg(jpeg, exportCanvasEl.width, exportCanvasEl.height)
    downloadBlob(pdf, `${baseName}.pdf`)
  }, [pageId, palette, nameRef])

  const exportPng = useCallback(() => {
    void exportCanvas('png')
  }, [exportCanvas])

  return { exportCanvas, exportPng }
}

/**
 * Captura periodica del thumbnail del sidebar: cada CAPTURE_INTERVAL_MS, si
 * el array de elementos cambio de identidad desde la ultima captura (immer
 * crea array nuevo en cada edicion), renderiza el artboard a ~480px y lo
 * sube a /api/draw3/[id]/thumbnail. Fire-and-forget: un fallo no molesta.
 */
const THUMBNAIL_CAPTURE_INTERVAL_MS = 20_000
const THUMBNAIL_MAX_SIDE = 480

export function useCanvasThumbnail({
  pageId,
  palette,
  loaded,
}: {
  pageId: string
  palette: Palette
  loaded: boolean
}) {
  const lastCapturedRef = useRef<CanvasElement[] | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!loaded) return
    lastCapturedRef.current = null

    const capture = async () => {
      if (inFlightRef.current) return
      const state = useCanvasStore.getState()
      if (state.pageId !== pageId) return
      if (state.elements.length === 0) return
      if (state.elements === lastCapturedRef.current) return
      inFlightRef.current = true
      try {
        const canvas = await renderCanvasForExport({
          elements: state.elements,
          palette,
          settings: { ...state.settings, gridStyle: 'none' },
          maxSide: THUMBNAIL_MAX_SIDE,
          settleMs: 60,
        })
        if (!canvas) return
        const blob = await canvasToBlob(canvas, 'image/webp', 0.55)
        if (!blob || blob.size > 280 * 1024) return
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
        const res = await fetch(`/api/draw3/${encodeURIComponent(pageId)}/thumbnail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        })
        if (res.ok) lastCapturedRef.current = state.elements
      } catch {
        // best-effort
      } finally {
        inFlightRef.current = false
      }
    }

    const id = window.setInterval(() => { void capture() }, THUMBNAIL_CAPTURE_INTERVAL_MS)
    const initial = window.setTimeout(() => { void capture() }, 4_000)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(initial)
    }
  }, [loaded, pageId, palette])
}

async function renderCanvasForExport({
  elements,
  palette,
  settings,
  maxSide = 4096,
  settleMs = 800,
}: {
  elements: CanvasElement[]
  palette: Palette
  settings: ReturnType<typeof useCanvasStore.getState>['settings']
  maxSide?: number
  settleMs?: number
}) {
  const visible = elements.filter(el => !el.hidden)
  const bounds = visualBBoxUnion(visible, elements)
  if (!bounds) return null

  const padding = 140
  const rawWidth = Math.max(1, bounds.width + padding * 2)
  const rawHeight = Math.max(1, bounds.height + padding * 2)
  const scale = Math.max(0.12, Math.min(1.25, maxSide / Math.max(rawWidth, rawHeight)))
  const viewportForExport: Viewport = {
    width: Math.ceil(rawWidth * scale),
    height: Math.ceil(rawHeight * scale),
    dpr: 1,
  }
  const exportCamera: Camera = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    zoom: scale,
  }
  const canvas = document.createElement('canvas')
  canvas.width = viewportForExport.width
  canvas.height = viewportForExport.height
  canvas.style.width = `${viewportForExport.width}px`
  canvas.style.height = `${viewportForExport.height}px`

  const draw = () => render(canvas, {
    elements: visible,
    camera: exportCamera,
    selectedIds: new Set(),
    hoveredId: null,
    editingId: null,
    palette,
    viewport: viewportForExport,
    gridStyle: settings.gridStyle,
    gridSize: settings.gridSize,
  })

  draw()
  await new Promise(resolve => window.setTimeout(resolve, settleMs))
  draw()
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function safeExportName(value: string) {
  return value
    .trim()
    .replace(/[^\w\s.-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'canvas-v3'
}

async function createPdfFromJpeg(imageBlob: Blob, imageWidth: number, imageHeight: number) {
  const imageBytes = await imageBlob.arrayBuffer()
  const landscape = imageWidth >= imageHeight
  const pageWidth = landscape ? 841.89 : 595.28
  const pageHeight = landscape ? 595.28 : 841.89
  const margin = 24
  const imageScale = Math.min((pageWidth - margin * 2) / imageWidth, (pageHeight - margin * 2) / imageHeight)
  const drawWidth = imageWidth * imageScale
  const drawHeight = imageHeight * imageScale
  const x = (pageWidth - drawWidth) / 2
  const y = (pageHeight - drawHeight) / 2
  const content = [
    'q',
    `${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`,
    '/Im0 Do',
    'Q',
  ].join('\n')

  const encoder = new TextEncoder()
  const parts: Array<string | ArrayBuffer> = []
  const offsets: number[] = []
  let offset = 0
  const addString = (value: string) => {
    parts.push(value)
    offset += encoder.encode(value).byteLength
  }
  const addBuffer = (value: ArrayBuffer) => {
    parts.push(value)
    offset += value.byteLength
  }
  const addObject = (body: string) => {
    offsets.push(offset)
    addString(body)
  }

  addString('%PDF-1.3\n%\xFF\xFF\xFF\xFF\n')
  addObject('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  addObject(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] >>\nendobj\n`)
  addObject(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`)
  addObject(`4 0 obj\n<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}\nendstream\nendobj\n`)
  offsets.push(offset)
  addString(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.byteLength} >>\nstream\n`)
  addBuffer(imageBytes)
  addString('\nendstream\nendobj\n')

  const xrefOffset = offset
  addString(`xref\n0 6\n0000000000 65535 f \n${offsets.map(item => `${String(item).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return new Blob(parts, { type: 'application/pdf' })
}
