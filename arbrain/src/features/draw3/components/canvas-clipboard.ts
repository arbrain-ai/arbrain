/**
 * Clipboard payload del canvas (formato draw3-selection) — extraido verbatim
 * de DrawEditor3.tsx (refactor fase 3, extraccion B3). Funciones puras de
 * serializacion/parseo/materializacion + storage local como fallback del
 * clipboard del sistema.
 */
import { bboxFromElement, bboxUnion, type CanvasElement, type ElementId, type StickyElement, type TextElement } from '../elements/types'
import { useCanvasStore } from '../stores/canvas-store'
import { cloneCanvasElement, createPastedElementId, remapConnectorBinding } from '../elements/clone-utils'

export type CanvasClipboardPayload = {
  kind: 'draw3-selection'
  version: 1
  copiedAt: number
  selectedIds: ElementId[]
  elements: CanvasElement[]
}

const DRAW3_CLIPBOARD_TEXT_PREFIX = 'BUSINESS_OS_DRAW3_CLIPBOARD:'
export const DRAW3_CLIPBOARD_MIME = 'application/x-business-os-draw3'
const DRAW3_CLIPBOARD_STORAGE_KEY = 'business-os.draw3.clipboard'
const DRAW3_CLIPBOARD_STORED_TTL_MS = 30 * 60 * 1000

export function currentCanvasClipboardPayload(): CanvasClipboardPayload | null {
  const state = useCanvasStore.getState()
  return createCanvasClipboardPayload(state.elements, Array.from(state.selectedIds))
}

export function createCanvasClipboardPayload(elements: CanvasElement[], selectedIds: ElementId[]): CanvasClipboardPayload | null {
  if (selectedIds.length === 0) return null
  const byId = new Map(elements.map(el => [el.id, el]))
  const included = new Set<ElementId>()

  const visit = (id: ElementId) => {
    if (included.has(id)) return
    const el = byId.get(id)
    if (!el || el.hidden) return
    included.add(id)
    if (el.type === 'group' || el.type === 'frame') {
      for (const childId of el.childIds) visit(childId)
    }
  }

  for (const id of selectedIds) visit(id)

  let changed = true
  while (changed) {
    changed = false
    for (const el of elements) {
      const shouldIncludeBoundText = el.type === 'text' && el.containerId != null && included.has(el.containerId)
      const shouldIncludeInternalConnector =
        el.type === 'connector' &&
        el.startBinding?.elementId != null &&
        el.endBinding?.elementId != null &&
        included.has(el.startBinding.elementId) &&
        included.has(el.endBinding.elementId)

      if ((shouldIncludeBoundText || shouldIncludeInternalConnector) && !included.has(el.id)) {
        included.add(el.id)
        changed = true
      }
    }
  }

  const copied = elements
    .filter(el => included.has(el.id))
    .map(el => cloneCanvasElement(el))

  if (copied.length === 0) return null
  return {
    kind: 'draw3-selection',
    version: 1,
    copiedAt: Date.now(),
    selectedIds: selectedIds.filter(id => included.has(id)),
    elements: copied,
  }
}

export function writeCanvasClipboardPayload(payload: CanvasClipboardPayload) {
  const serialized = serializeCanvasClipboardPayload(payload)
  storeCanvasClipboardPayload(serialized)

  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(systemClipboardTextForPayload(payload, serialized)).catch(() => {})
  }
}

export function systemClipboardTextForPayload(payload: CanvasClipboardPayload, serialized: string): string {
  const plainText = plainTextFromCanvasClipboardPayload(payload)
  if (plainText.trim() && payload.elements.every(element => element.type === 'text' || element.type === 'sticky')) {
    return plainText
  }
  return serialized
}

export function storeCanvasClipboardPayload(serialized: string) {
  try {
    window.localStorage.setItem(DRAW3_CLIPBOARD_STORAGE_KEY, serialized)
  } catch {
    // localStorage may be blocked; the OS clipboard path can still work.
  }
}

export function readStoredCanvasClipboardPayload(): CanvasClipboardPayload | null {
  try {
    return parseCanvasClipboardText(window.localStorage.getItem(DRAW3_CLIPBOARD_STORAGE_KEY) ?? '')
  } catch {
    return null
  }
}

export function canvasPayloadForClipboardText(text: string): CanvasClipboardPayload | null {
  const parsed = parseCanvasClipboardText(text)
  if (parsed) return parsed

  const stored = readStoredCanvasClipboardPayload()
  if (!stored || Date.now() - stored.copiedAt > DRAW3_CLIPBOARD_STORED_TTL_MS) return null
  const storedPlainText = plainTextFromCanvasClipboardPayload(stored)
  if (!storedPlainText.trim()) return null
  return storedPlainText === text ? stored : null
}

export function serializeCanvasClipboardPayload(payload: CanvasClipboardPayload) {
  return `${DRAW3_CLIPBOARD_TEXT_PREFIX}${JSON.stringify(payload)}`
}

export function parseCanvasClipboardText(text: string): CanvasClipboardPayload | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const raw = trimmed.startsWith(DRAW3_CLIPBOARD_TEXT_PREFIX)
    ? trimmed.slice(DRAW3_CLIPBOARD_TEXT_PREFIX.length)
    : trimmed
  if (!raw.startsWith('{')) return null
  try {
    return normalizeCanvasClipboardPayload(JSON.parse(raw))
  } catch {
    return null
  }
}

function normalizeCanvasClipboardPayload(value: unknown): CanvasClipboardPayload | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<CanvasClipboardPayload>
  if (candidate.kind !== 'draw3-selection' || candidate.version !== 1 || !Array.isArray(candidate.elements)) return null
  return {
    kind: 'draw3-selection',
    version: 1,
    copiedAt: typeof candidate.copiedAt === 'number' ? candidate.copiedAt : Date.now(),
    selectedIds: Array.isArray(candidate.selectedIds)
      ? candidate.selectedIds.filter((id): id is ElementId => typeof id === 'string')
      : [],
    elements: candidate.elements.filter(Boolean) as CanvasElement[],
  }
}

function plainTextFromCanvasClipboardPayload(payload: CanvasClipboardPayload): string {
  return payload.elements
    .filter((element): element is TextElement | StickyElement => element.type === 'text' || element.type === 'sticky')
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map(element => plainTextFromDrawTextDoc(element.doc))
    .filter(text => text.length > 0)
    .join('\n')
}

export function plainTextFromDrawTextDoc(doc: TextElement['doc'] | StickyElement['doc']): string {
  if (typeof doc === 'string') return doc
  if (!doc || typeof doc !== 'object') return ''
  return plainTextFromDrawTextNode(doc)
}

function plainTextFromDrawTextNode(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const typed = node as { type?: string; text?: string; content?: unknown[] }
  if (typed.type === 'text') return typed.text ?? ''
  if (typed.type === 'hardBreak') return '\n'
  if (!Array.isArray(typed.content)) return ''
  const separator = typed.type === 'paragraph' || typed.type === 'heading' ? '' : '\n'
  return typed.content.map(plainTextFromDrawTextNode).join(separator)
}

export function materializeCanvasClipboardPayload(
  payload: CanvasClipboardPayload,
  target: { x: number; y: number },
): { elements: CanvasElement[]; selectedIds: ElementId[] } | null {
  const sourceElements = payload.elements.filter(el => el && typeof el.id === 'string')
  if (sourceElements.length === 0) return null
  const bounds = bboxUnion(sourceElements.map(bboxFromElement))
  if (!bounds) return null

  const sourceCenter = { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 }
  const dx = target.x - sourceCenter.x + 28
  const dy = target.y - sourceCenter.y + 28
  const now = Date.now()
  const idMap = new Map<ElementId, ElementId>()

  sourceElements.forEach((el, index) => {
    idMap.set(el.id, createPastedElementId(el.type, now, index))
  })

  const elements = sourceElements.map((source, index) => {
    const copy = cloneCanvasElement(source)
    copy.id = idMap.get(source.id) ?? createPastedElementId(source.type, now, index)
    copy.x = source.x + dx
    copy.y = source.y + dy
    copy.zIndex = now + index
    copy.groupId = source.groupId ? idMap.get(source.groupId) ?? null : null
    copy.frameId = source.frameId ? idMap.get(source.frameId) ?? null : null
    copy.createdAt = now
    copy.updatedAt = now
    copy.createdBy = 'human'
    copy.version = 1
    copy.locked = false

    if (copy.type === 'text' && copy.containerId != null) {
      const containerId = idMap.get(copy.containerId)
      if (containerId) copy.containerId = containerId
      else delete copy.containerId
    }

    if (copy.type === 'group' || copy.type === 'frame') {
      copy.childIds = copy.childIds.map(id => idMap.get(id)).filter((id): id is ElementId => Boolean(id))
    }

    if (copy.type === 'connector') {
      copy.startBinding = copy.startBinding?.elementId
        ? remapConnectorBinding(copy.startBinding, idMap)
        : null
      copy.endBinding = copy.endBinding?.elementId
        ? remapConnectorBinding(copy.endBinding, idMap)
        : null
      if (Array.isArray(copy.waypoints)) {
        copy.waypoints = copy.waypoints.map(point => ({ x: point.x + dx, y: point.y + dy }))
      }
    }

    return copy
  })

  const selectedIds = payload.selectedIds
    .map(id => idMap.get(id))
    .filter((id): id is ElementId => Boolean(id) && elements.some(el => el.id === id))
    .filter(id => {
      const el = elements.find(item => item.id === id)
      return !(el?.type === 'text' && el.containerId != null)
    })

  const fallbackSelection = elements
    .filter(el => !(el.type === 'text' && el.containerId != null))
    .map(el => el.id)

  return {
    elements,
    selectedIds: selectedIds.length > 0 ? selectedIds : fallbackSelection,
  }
}
