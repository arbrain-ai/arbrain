import { eventData, mutationFor, taskData } from './model'
import type { MutationResult, PlanEvent, PlanItem, PlanMutation, PlanTask } from './types'

/** Deshacer (⌘Z) del calendario. Cada acción propia que el proveedor confirmó deja su inversa; deshacer la
 *  manda por la misma vía (`/api/planning` → `mc-event.py`). La inversa se arma con la lectura de AHORA
 *  (etag y updatedAt vigentes), no con la de cuando se hizo la acción. */
export type Aliases = Map<string, string>
export interface UndoEntry {
  label: string
  /** Sin inversa posible: ⌘Z lo dice en lugar de deshacer otra cosa en silencio. */
  irreversible?: string
  build(items: readonly PlanItem[], aliases: Aliases): PlanMutation | null
  /** Tras confirmar la inversa (un borrado deshecho vuelve con id nuevo). */
  after?(result: MutationResult, aliases: Aliases): void
}

export const UNDO_LIMIT = 50
const quote = (title: string) => `«${title.length > 40 ? title.slice(0, 39) + '…' : title}»`
const resolve = (aliases: Aliases, id: string) => aliases.get(id) ?? id
const findEvent = (items: readonly PlanItem[], aliases: Aliases, ref: Pick<PlanEvent, 'externalId' | 'account' | 'calendarId'>) => {
  const externalId = resolve(aliases, ref.externalId)
  return items.find((i): i is PlanEvent => i.kind === 'event' && i.externalId === externalId && i.account === ref.account && i.calendarId === ref.calendarId)
}
const findTask = (items: readonly PlanItem[], aliases: Aliases, externalId: string) => {
  const id = resolve(aliases, externalId)
  return items.find((i): i is PlanTask => i.kind === 'task' && i.externalId === id)
}

/** `before`: el elemento tal como estaba antes de la operación (undefined al crear). */
export function inverseFor(op: PlanMutation, before: PlanItem | undefined, result: MutationResult): UndoEntry | null {
  const title = before?.title ?? (typeof op.data?.title === 'string' ? op.data.title : '')
  if (op.kind === 'event') {
    if (op.action === 'create') {
      const created = result.event
      if (!created) return null
      return { label: `Creación de ${quote(created.title)}`, build: (items, aliases) => {
        const current = findEvent(items, aliases, created) ?? created
        return mutationFor(current, op.ownerId, {}, 'delete')
      } }
    }
    if (!before || before.kind !== 'event') return null
    if (op.action === 'update') {
      const prior = before
      return { label: `Cambio de ${quote(title)}`, build: (items, aliases) => {
        // Fuera de la ventana cargada se usa el etag con el que el proveedor confirmó el cambio.
        const current = findEvent(items, aliases, prior) ?? result.event
        return current ? mutationFor(current, op.ownerId, eventData(prior)) : null
      } }
    }
    if (op.action === 'delete') {
      const prior = before
      // Una ocurrencia borrada de una serie queda cancelada en Google; el contrato de escritura no la revive.
      if (prior.recurringEventId) return { label: `Borrado de ${quote(title)}`, irreversible: 'Esa ocurrencia de una serie no se puede restaurar desde aquí.', build: () => null }
      return { label: `Borrado de ${quote(title)}`,
        build: () => ({ ownerId: op.ownerId, requestId: crypto.randomUUID(), kind: 'event', action: 'create', account: prior.account, calendarId: prior.calendarId, data: eventData(prior) }),
        after: (res, aliases) => { if (res.event) aliases.set(prior.externalId, res.event.externalId) } }
    }
    return null
  }
  if (op.kind === 'task') {
    // Inversa de «reabrir» (solo nace al deshacer un completar): volver a completarla.
    if (op.action === 'reopen' && op.externalId) { const externalId = op.externalId; return { label: `Reabrir ${quote(title)}`, build: () => mutationFor({ kind: 'task', externalId, updatedAt: null } as PlanTask, op.ownerId, {}, 'complete') } }
    if (op.action === 'create') return { label: `Creación de ${quote(title)}`, irreversible: 'Una tarea nueva no se borra desde aquí: complétala o muévela.', build: () => null }
    if (!before || before.kind !== 'task') return null
    const prior = before
    if (op.action === 'update') return { label: `Cambio de ${quote(title)}`, build: (items, aliases) => {
      const current = findTask(items, aliases, prior.externalId)
      return mutationFor(current ?? { ...prior, updatedAt: null }, op.ownerId, taskData(prior))
    } }
    // Cambio de proyecto desde el detalle: la inversa la regresa a su proyecto anterior.
    if (op.action === 'move' && typeof op.data?.projectId === 'string' && prior.projectId) {
      const projectId = prior.projectId
      return { label: `Mover ${quote(title)}`, build: (items, aliases) => mutationFor(findTask(items, aliases, prior.externalId) ?? { ...prior, updatedAt: null }, op.ownerId, { projectId }, 'move') }
    }
    if (op.action === 'complete') {
      // Una repetición completada avanza su fecha; Todoist no la «reabre», y no se altera sin avisar.
      if (prior.recurring) return { label: `Completar ${quote(title)}`, irreversible: 'Una tarea recurrente ya avanzó a su próxima fecha.', build: () => null }
      return { label: `Completar ${quote(title)}`, build: () => mutationFor({ ...prior, updatedAt: null }, op.ownerId, {}, 'reopen') }
    }
  }
  return null
}

/** Dos pilas acotadas (deshacer y rehacer). No toca la red: solo contabilidad. Una acción nueva del usuario
 *  mata el rehacer, como en sfcal. */
export class UndoHistory {
  private stack: UndoEntry[] = []
  private redoStack: UndoEntry[] = []
  readonly aliases: Aliases = new Map()
  private static cap(list: UndoEntry[]) { if (list.length > UNDO_LIMIT) list.shift() }
  /** Acción nueva del usuario. */
  push(entry: UndoEntry | null) { if (entry) { this.stack.push(entry); UndoHistory.cap(this.stack); this.redoStack = [] } }
  pop() { return this.stack.pop() }
  /** Si la inversa no se pudo aplicar, la entrada vuelve a su sitio para reintentar. */
  restore(entry: UndoEntry) { this.stack.push(entry) }
  /** Tras deshacer: lo deshecho queda para rehacer. Tras rehacer: vuelve a la pila de deshacer sin matar el resto del rehacer. */
  pushRedo(entry: UndoEntry | null) { if (entry) { this.redoStack.push(entry); UndoHistory.cap(this.redoStack) } }
  pushUndo(entry: UndoEntry | null) { if (entry) { this.stack.push(entry); UndoHistory.cap(this.stack) } }
  popRedo() { return this.redoStack.pop() }
  restoreRedo(entry: UndoEntry) { this.redoStack.push(entry) }
  get size() { return this.stack.length }
  get redoSize() { return this.redoStack.length }
  clear() { this.stack = []; this.redoStack = []; this.aliases.clear() }
}
