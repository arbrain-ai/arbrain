/**
 * Clipboard del canvas: copy/cut/paste interno + imagenes + texto del sistema —
 * extraido verbatim de DrawEditor3.tsx (refactor fase 3, extraccion B3).
 * Incluye los 3 window listeners (copy/cut/paste).
 */
'use client'
import { useCallback, useEffect, type RefObject } from 'react'
import { screenToWorld } from '../../canvas/camera'
import { useCanvasStore } from '../../stores/canvas-store'
import type { CanvasElement, Camera, ElementId, TextElement } from '../../elements/types'
import { createImage } from '../../elements/factories'
import type { Op } from '../../ops/contract'
import { isEditableTarget } from '../dom-utils'
import {
  type CanvasClipboardPayload,
  DRAW3_CLIPBOARD_MIME,
  canvasPayloadForClipboardText,
  currentCanvasClipboardPayload,
  materializeCanvasClipboardPayload,
  parseCanvasClipboardText,
  readStoredCanvasClipboardPayload,
  serializeCanvasClipboardPayload,
  storeCanvasClipboardPayload,
  systemClipboardTextForPayload,
  writeCanvasClipboardPayload,
  createCanvasClipboardPayload,
} from '../canvas-clipboard'

type Viewport = { width: number; height: number; dpr: number }

export interface CanvasClipboardDeps<S> {
  viewport: Viewport
  viewportRef: RefObject<Viewport>
  styleDefaults: S
  addElement: (el: CanvasElement) => void
  recordHistory: (label: string, forward: Op[], reverse: Op[]) => void
  markDirty: () => void
  setSelection: (ids: ElementId[]) => void
  deleteSelected: () => void
  lastNativePasteAtRef: RefObject<number>
  pasteFallbackTimerRef: RefObject<number | null>
  createStandaloneText: (args: {
    text: string
    point: { x: number; y: number }
    anchor: 'top-left' | 'center'
    viewport: Viewport
    camera: Camera
    style: S
  }) => TextElement
}

export function useCanvasClipboard<S>({
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
  createStandaloneText,
}: CanvasClipboardDeps<S>) {
  const pasteCanvasClipboard = useCallback((payload: CanvasClipboardPayload, point?: { x: number; y: number }) => {
    const target = point ?? screenToWorld(
      { x: viewportRef.current.width / 2, y: viewportRef.current.height / 2 },
      useCanvasStore.getState().camera,
      viewportRef.current,
    )
    const pasted = materializeCanvasClipboardPayload(payload, target)
    if (!pasted || pasted.elements.length === 0) return false
    for (const element of pasted.elements) addElement(element)
    recordHistory(
      'Paste selection',
      pasted.elements.map(element => ({ kind: 'add', element }) as Op),
      [{ kind: 'delete', ids: pasted.elements.map(element => element.id) }],
    )
    setSelection(pasted.selectedIds)
    markDirty()
    return true
  }, [addElement, markDirty, recordHistory, setSelection])

  const copySelectionToClipboard = useCallback(() => {
    const state = useCanvasStore.getState()
    const payload = createCanvasClipboardPayload(state.elements, Array.from(state.selectedIds))
    if (!payload) return false
    writeCanvasClipboardPayload(payload)
    return true
  }, [])

  const cutSelectionToClipboard = useCallback(() => {
    if (!copySelectionToClipboard()) return false
    deleteSelected()
    return true
  }, [copySelectionToClipboard, deleteSelected])
  const createImageFromDataUrl = useCallback(async (dataUrl: string, opts: { x?: number; y?: number; alt?: string } = {}) => {
    const dims = await readImageSize(dataUrl).catch(() => ({ width: 800, height: 600 }))
    const maxWidth = 560
    const ratio = dims.width > maxWidth ? maxWidth / dims.width : 1
    const width = Math.round(dims.width * ratio)
    const height = Math.round(dims.height * ratio)
    const center = screenToWorld(
      { x: viewport.width / 2, y: viewport.height / 2 },
      useCanvasStore.getState().camera,
      viewport,
    )
    const el = createImage({
      x: opts.x ?? center.x - width / 2,
      y: opts.y ?? center.y - height / 2,
      width,
      height,
      url: dataUrl,
      naturalWidth: dims.width,
      naturalHeight: dims.height,
      alt: opts.alt,
    })
    addElement(el)
    recordHistory('Insert image', [{ kind: 'add', element: el }], [{ kind: 'delete', ids: [el.id] }])
    setSelection([el.id])
    markDirty()
  }, [addElement, markDirty, setSelection, viewport])

  const createImageFromBlob = useCallback(async (blob: Blob, opts: { x?: number; y?: number; alt?: string } = {}) => {
    const dataUrl = await blobToDataUrl(blob)
    await createImageFromDataUrl(dataUrl, opts)
  }, [createImageFromDataUrl])

  const pasteImageFromClipboardData = useCallback(async (
    clipboardData: DataTransfer | null | undefined,
    point?: { x: number; y: number },
  ) => {
    const file = imageFileFromClipboardData(clipboardData)
    if (!file) return false
    await createImageFromBlob(file, {
      x: point?.x,
      y: point?.y,
      alt: file.name || 'Pasted image',
    })
    return true
  }, [createImageFromBlob])

  const pasteImageFromSystemClipboard = useCallback(async (point?: { x: number; y: number }) => {
    if ('clipboard' in navigator && 'read' in navigator.clipboard) {
      try {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const imageType = item.types.find(type => type.startsWith('image/'))
          if (!imageType) continue
          const blob = await item.getType(imageType)
          await createImageFromBlob(blob, { x: point?.x, y: point?.y, alt: 'clipboard image' })
          return true
        }
      } catch {
        // Tauri/WebKit can deny direct read on shortcut fallback. Stored payload still works.
      }
    }
    return false
  }, [createImageFromBlob])

  const pasteTextFromClipboard = useCallback((text: string, point?: { x: number; y: number }, anchor: 'center' | 'top-left' = 'center') => {
    if (!text.trim()) return false
    const target = point ?? screenToWorld(
      { x: viewportRef.current.width / 2, y: viewportRef.current.height / 2 },
      useCanvasStore.getState().camera,
      viewportRef.current,
    )
    const element = createStandaloneText({
      text,
      point: target,
      anchor,
      viewport: viewportRef.current,
      camera: useCanvasStore.getState().camera,
      style: styleDefaults,
    })
    addElement(element)
    recordHistory('Paste text', [{ kind: 'add', element }], [{ kind: 'delete', ids: [element.id] }])
    setSelection([element.id])
    markDirty()
    return true
  }, [addElement, markDirty, recordHistory, setSelection, styleDefaults])

  const pasteFromClipboard = useCallback(async (point?: { x: number; y: number }) => {
    if (await pasteImageFromSystemClipboard(point)) return true

    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText()
        const payload = canvasPayloadForClipboardText(text)
        if (payload && pasteCanvasClipboard(payload, point)) return true
        if (pasteTextFromClipboard(text, point)) return true
      } catch {
        // Tauri/WebKit can deny direct readText on shortcut fallback. Stored payload still works.
      }
    }

    const storedPayload = readStoredCanvasClipboardPayload()
    if (storedPayload && pasteCanvasClipboard(storedPayload, point)) return true
    return false
  }, [pasteCanvasClipboard, pasteImageFromSystemClipboard, pasteTextFromClipboard])

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return
      const payload = currentCanvasClipboardPayload()
      if (!payload) return
      const serialized = serializeCanvasClipboardPayload(payload)
      storeCanvasClipboardPayload(serialized)
      if (event.clipboardData) {
        event.clipboardData.setData(DRAW3_CLIPBOARD_MIME, serialized)
        event.clipboardData.setData('text/plain', systemClipboardTextForPayload(payload, serialized))
        event.preventDefault()
      } else {
        writeCanvasClipboardPayload(payload)
      }
    }
    window.addEventListener('copy', handleCopy)
    return () => window.removeEventListener('copy', handleCopy)
  }, [])

  useEffect(() => {
    const handleCut = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return
      const payload = currentCanvasClipboardPayload()
      if (!payload) return
      const serialized = serializeCanvasClipboardPayload(payload)
      storeCanvasClipboardPayload(serialized)
      if (event.clipboardData) {
        event.clipboardData.setData(DRAW3_CLIPBOARD_MIME, serialized)
        event.clipboardData.setData('text/plain', systemClipboardTextForPayload(payload, serialized))
        event.preventDefault()
      } else {
        writeCanvasClipboardPayload(payload)
      }
      deleteSelected()
    }
    window.addEventListener('cut', handleCut)
    return () => window.removeEventListener('cut', handleCut)
  }, [deleteSelected])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return
      lastNativePasteAtRef.current = Date.now()
      if (pasteFallbackTimerRef.current != null) {
        window.clearTimeout(pasteFallbackTimerRef.current)
        pasteFallbackTimerRef.current = null
      }
      const text = event.clipboardData?.getData('text/plain') ?? ''
      const customPayload = event.clipboardData?.getData(DRAW3_CLIPBOARD_MIME) ?? ''
      const payload = parseCanvasClipboardText(customPayload)
      if (payload) {
        event.preventDefault()
        pasteCanvasClipboard(payload)
        return
      }

      if (imageFileFromClipboardData(event.clipboardData)) {
        event.preventDefault()
        void pasteImageFromClipboardData(event.clipboardData)
        return
      }

      const textPayload = canvasPayloadForClipboardText(text)
      if (textPayload) {
        event.preventDefault()
        pasteCanvasClipboard(textPayload)
        return
      }

      if (text.trim()) {
        event.preventDefault()
        pasteTextFromClipboard(text)
        return
      }

      if (!text.trim()) {
        const storedPayload = readStoredCanvasClipboardPayload()
        if (storedPayload) {
          event.preventDefault()
          pasteCanvasClipboard(storedPayload)
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [pasteCanvasClipboard, pasteImageFromClipboardData, pasteTextFromClipboard])

  return {
    pasteCanvasClipboard,
    copySelectionToClipboard,
    cutSelectionToClipboard,
    createImageFromDataUrl,
    pasteImageFromClipboardData,
    pasteImageFromSystemClipboard,
    pasteTextFromClipboard,
    pasteFromClipboard,
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file)
}

function imageFileFromClipboardData(clipboardData: DataTransfer | null | undefined): File | null {
  const files = Array.from(clipboardData?.files ?? [])
  const file = files.find(candidate => candidate.type.startsWith('image/'))
  if (file) return file

  const items = Array.from(clipboardData?.items ?? [])
  for (const item of items) {
    if (!item.type.startsWith('image/')) continue
    const image = item.getAsFile()
    if (image) return image
  }
  return null
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function readImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height })
    image.onerror = reject
    image.src = src
  })
}
