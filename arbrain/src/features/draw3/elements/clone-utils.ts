/**
 * Clonado y remapeo de elementos — extraido verbatim de DrawEditor3.tsx
 * (refactor fase 3). Compartido por clipboard (paste) y duplicate.
 */
import type { CanvasElement, ConnectorElement, ElementId } from './types'

export function remapConnectorBinding<T extends ConnectorElement['startBinding']>(
  binding: T,
  idMap: Map<ElementId, ElementId>,
): T {
  if (!binding) return null as T
  const elementId = idMap.get(binding.elementId)
  return elementId ? { ...binding, elementId } as T : null as T
}

export function createPastedElementId(type: CanvasElement['type'], now: number, index: number) {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
  return `${type}-${now}-${index}-${random}`
}

export function cloneCanvasElement<T extends CanvasElement>(element: T): T {
  if (typeof structuredClone === 'function') return structuredClone(element)
  return JSON.parse(JSON.stringify(element)) as T
}
