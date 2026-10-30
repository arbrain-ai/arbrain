/**
 * Canvas v4 — historial de deshacer/rehacer.
 *
 * Una accion = una entrada, aunque toque 200 elementos. Recompilar una region
 * mueve decenas de cajas y debe deshacerse de UNA vez, con una etiqueta que
 * diga que fue: "recompilar region" y no 200 pasos anonimos.
 *
 * Se guardan PARCHES (que cambio), no fotos del documento entero. Con 200
 * elementos la diferencia entre un parche y una foto es la que decide si el
 * historial cabe en memoria o no.
 */

import type { CanvasElement } from '../model/element'

export interface Patch {
  /** Elementos que este cambio agrego (para deshacer: se quitan). */
  added: CanvasElement[]
  /** Estado ANTERIOR de los que cambiaron (para deshacer: se restauran). */
  before: CanvasElement[]
  /** Estado NUEVO de los que cambiaron (para rehacer). */
  after: CanvasElement[]
  /** Elementos que este cambio quito (para deshacer: se reponen). */
  removed: CanvasElement[]
}

export interface Entry {
  label: string
  patch: Patch
  at: number
}

/** Deriva el parche entre dos estados. La identidad es el id, no la posicion. */
export function diff(prev: CanvasElement[], next: CanvasElement[]): Patch {
  const prevById = new Map(prev.map(e => [e.id, e]))
  const nextById = new Map(next.map(e => [e.id, e]))
  const added: CanvasElement[] = []
  const before: CanvasElement[] = []
  const after: CanvasElement[] = []
  const removed: CanvasElement[] = []

  for (const [id, el] of nextById) {
    const old = prevById.get(id)
    if (!old) { added.push(el); continue }
    if (old !== el) { before.push(old); after.push(el) }
  }
  for (const [id, el] of prevById) if (!nextById.has(id)) removed.push(el)
  return { added, before, after, removed }
}

export function isEmpty(p: Patch): boolean {
  return p.added.length === 0 && p.before.length === 0 && p.removed.length === 0
}

function apply(elements: CanvasElement[], remove: CanvasElement[], upsert: CanvasElement[]): CanvasElement[] {
  const quitar = new Set(remove.map(e => e.id))
  const poner = new Map(upsert.map(e => [e.id, e]))
  const out: CanvasElement[] = []
  for (const el of elements) {
    if (quitar.has(el.id)) continue
    const reemplazo = poner.get(el.id)
    if (reemplazo) { out.push(reemplazo); poner.delete(el.id); continue }
    out.push(el)
  }
  for (const el of poner.values()) out.push(el)
  return out
}

export class History {
  private undoStack: Entry[] = []
  private redoStack: Entry[] = []

  constructor(private limit = 200) {}

  /** Registra un cambio ya aplicado. Devuelve false si no cambio nada. */
  record(label: string, prev: CanvasElement[], next: CanvasElement[]): boolean {
    const patch = diff(prev, next)
    if (isEmpty(patch)) return false
    this.undoStack.push({ label, patch, at: Date.now() })
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    // Una accion nueva invalida el futuro: rehacer despues de editar daria un
    // estado que nunca existio.
    this.redoStack = []
    return true
  }

  canUndo(): boolean { return this.undoStack.length > 0 }
  canRedo(): boolean { return this.redoStack.length > 0 }
  peekUndo(): string | null { return this.undoStack.at(-1)?.label ?? null }

  undo(elements: CanvasElement[]): { elements: CanvasElement[]; label: string } | null {
    const entry = this.undoStack.pop()
    if (!entry) return null
    this.redoStack.push(entry)
    const { added, before, removed } = entry.patch
    return { elements: apply(elements, added, [...before, ...removed]), label: entry.label }
  }

  redo(elements: CanvasElement[]): { elements: CanvasElement[]; label: string } | null {
    const entry = this.redoStack.pop()
    if (!entry) return null
    this.undoStack.push(entry)
    const { added, after, removed } = entry.patch
    return { elements: apply(elements, removed, [...after, ...added]), label: entry.label }
  }

  depth(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length }
  }
}
