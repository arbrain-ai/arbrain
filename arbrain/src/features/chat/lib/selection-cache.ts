import type { ChatIntent } from './offline-envelope'
export type SelectionScope = { localOwner: string; account: string; conversationId: string | null }
/** localStorage is the shared truth between tabs of one origin; memory only
 * stands in when storage is unavailable. Another tab's confirmed change
 * arrives through the `storage` event, so a stale in-memory copy never eclipses it. */
const memory = new Map<string, ChatIntent>()
const revisions = new Map<string, number>()
const pending = new Map<string, { revision: number; promise: Promise<ChatIntent> }>()
export const SELECTION_CHANGED = 'arbrain:selection-changed'
export const SELECTION_MAX_AGE_MS = 10 * 60_000
// v2 (2 oct 2026): el default pasó a medium; las selecciones v1 cacheadas llevaban el xhigh de la cuenta al turno.
const PREFIX = 'arbrain:selection:v2:'
const keyFor = (scope: SelectionScope) => `${PREFIX}${JSON.stringify([scope.localOwner, scope.account, scope.conversationId])}`
const announce = () => { try { window.dispatchEvent(new Event(SELECTION_CHANGED)) } catch { /* Non-browser runtime. */ } }
function validate(value: unknown, scope: SelectionScope): ChatIntent {
  const v = value as ChatIntent | undefined
  if (!v || v.version !== 1 || !v.owner || !v.model || v.account !== scope.account || v.conversationId !== scope.conversationId
    || !(v.effort === null || typeof v.effort === 'string') || typeof v.fast !== 'boolean' || typeof v.ultracode !== 'boolean' || !Number.isFinite(Date.parse(v.observedAt))) throw new Error('No se pudo confirmar la selección de esta conversación.')
  return { ...v }
}
let listening = false
function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage || !event.key?.startsWith(PREFIX)) return
    // Any change published by another tab moves this scope's revision: a
    // capture fenced on the previous revision must not adopt it silently.
    revisions.set(event.key, (revisions.get(event.key) ?? 0) + 1)
    if (event.newValue === null) memory.delete(event.key)
    else { try { memory.set(event.key, JSON.parse(event.newValue) as ChatIntent) } catch { memory.delete(event.key) } }
    announce()
  })
}
function readStored(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) return JSON.parse(raw)
    // Storage is reachable and empty: an invalidation from another tab wins over memory.
    memory.delete(key); return null
  } catch { return memory.get(key) ?? null }
}
export function cachedSelection(scope: SelectionScope): ChatIntent | undefined {
  if (!scope.localOwner) return
  listen()
  try {
    const stored = readStored(keyFor(scope))
    return stored ? validate(stored, scope) : undefined
  } catch { return undefined }
}
/** Old enough that the host should be consulted again in the background.
 * The cached value remains valid intent until the host rejects it. */
export function selectionIsStale(intent: ChatIntent | undefined, now = Date.now()): boolean {
  return !intent || now - Date.parse(intent.observedAt) > SELECTION_MAX_AGE_MS
}
/** Monotonic per scope: moves on every confirmed change or invalidation seen
 * by this tab (own SSE, other tabs). Equal before/after a fetch means nothing
 * observable changed in between. */
export function selectionRevision(scope: SelectionScope): number {
  listen()
  return revisions.get(keyFor(scope)) ?? 0
}
export function invalidateSelection(scope: SelectionScope) {
  listen()
  const key = keyFor(scope)
  revisions.set(key, (revisions.get(key) ?? 0) + 1); memory.delete(key)
  try { localStorage.removeItem(key) } catch { /* Memory still invalidated. */ }
  announce()
}
export function refreshSelection(scope: SelectionScope): Promise<ChatIntent> {
  listen()
  const key = keyFor(scope), revision = revisions.get(key) ?? 0
  const existing = pending.get(key)
  if (existing?.revision === revision) return existing.promise
  const params = new URLSearchParams({ account: scope.account })
  if (scope.conversationId) params.set('session', scope.conversationId)
  const promise = (async () => {
    const response = await fetch(`/api/chat/selection?${params}`, { signal: AbortSignal.timeout(25_000), cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error ?? 'No se pudieron consultar los ajustes.')
    const intent = validate(data?.intent, scope)
    if ((revisions.get(key) ?? 0) !== revision) throw new Error('Los ajustes cambiaron durante la consulta.')
    memory.set(key, intent)
    try { localStorage.setItem(key, JSON.stringify(intent)) } catch { /* Draft envelope will retain the selection independently. */ }
    announce()
    return { ...intent }
  })().finally(() => { if (pending.get(key)?.promise === promise) pending.delete(key) })
  pending.set(key, { revision, promise }); return promise
}
