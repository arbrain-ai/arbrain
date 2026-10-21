import type {
  ChatPromptInput,
  LocalDrawingRecord,
  LocalEventRecord,
  LocalFileRecord,
  LocalTaskRecord,
  OfflinePackRequest,
  OfflinePackResult,
  SearchHit,
  SyncQueueItem,
  SyncResult,
  MarkSyncQueueItemInput,
} from './types'

import { confirmedDraftPayload } from '@/features/chat/lib/offline-envelope'

interface BrowserLocalState {
  tasks: LocalTaskRecord[]
  events: LocalEventRecord[]
  drawings: LocalDrawingRecord[]
  files: LocalFileRecord[]
  queue: SyncQueueItem[]
  snapshots: Record<string, { module: string; payload: unknown; updatedAt: string }>
  lastSyncedAt?: string | null
  lastPackPath?: string | null
}

const STORE_KEY = 'mission-control-local-first-v1'

async function kv() {
  return import('idb-keyval')
}

function now() {
  return new Date().toISOString()
}

function uuid(prefix: string) {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}_${id}`
}

async function readState(): Promise<BrowserLocalState> {
  if (typeof window === 'undefined') return emptyState()
  const { get } = await kv()
  return (await get<BrowserLocalState>(STORE_KEY)) ?? emptyState()
}

async function mutateState<T>(mutate: (state: BrowserLocalState) => T): Promise<T> {
  const { update } = await kv()
  let result!: T
  // IndexedDB read/write transaction: simultaneous tabs, cache refreshes and
  // queue acknowledgements cannot replace each other's accepted local data.
  await update<BrowserLocalState>(STORE_KEY, stored => {
    const state = stored ?? emptyState()
    result = mutate(state)
    return state
  })
  return result
}

function emptyState(): BrowserLocalState {
  return {
    tasks: [],
    events: [],
    drawings: [],
    files: [],
    queue: [],
    snapshots: {},
    lastSyncedAt: null,
    lastPackPath: null,
  }
}

function enqueue(state: BrowserLocalState, entityType: string, entityId: string, operation: string, payload: unknown): SyncQueueItem {
  const item: SyncQueueItem = {
    id: uuid('queue'),
    entityType,
    entityId,
    operation,
    payloadJson: JSON.stringify(payload),
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: now(),
    updatedAt: now(),
  }
  state.queue.unshift(item)
  return item
}

/**
 * Varias filas de un golpe, con un solo indice. Llamar `upsertById` en bucle copia el arreglo entero por fila.
 */
function upsertMany<T extends { id: string }>(rows: T[], nexts: T[]): T[] {
  if (nexts.length === 0) return rows
  const copy = [...rows]
  const index = new Map(copy.map((row, i) => [row.id, i]))
  const nuevos: T[] = []
  for (const next of nexts) {
    const i = index.get(next.id)
    if (i === undefined) { index.set(next.id, -1 - nuevos.length); nuevos.push(next) }
    else if (i >= 0) copy[i] = next
    else nuevos[-1 - i] = next
  }
  return [...nuevos.reverse(), ...copy]
}

export interface LoteEspejo {
  tasks?: LocalTaskRecord[]
  events?: LocalEventRecord[]
  drawings?: LocalDrawingRecord[]
}

/**
 * El espejo de la nube, aplicado en memoria. Puro: lo prueba `tests/shared/espejo-local.test.ts`.
 * Mismas normalizaciones que las altas sueltas con `queue = false` (traer de la nube no se re-sube).
 */
export function aplicarEspejo(state: BrowserLocalState, lote: LoteEspejo, sello = now()): BrowserLocalState {
  state.tasks = upsertMany(state.tasks, (lote.tasks ?? []).map(t => ({ ...t, syncStatus: t.syncStatus ?? 'queued' as const, updatedAt: t.updatedAt || sello })))
  state.events = upsertMany(state.events, (lote.events ?? []).map(e => ({ ...e, status: e.status ?? 'queued' as const, updatedAt: e.updatedAt || sello })))
  state.drawings = upsertMany(state.drawings, (lote.drawings ?? []).map(d => ({ ...d, syncStatus: d.syncStatus ?? 'queued' as const, updatedAt: d.updatedAt || sello })))
  return state
}

/**
 * EL ESPEJO EN UNA SOLA ESCRITURA (5 oct 2026).
 *
 * Todo el almacén vive en UNA llave (con los dibujos espejados pesa ~28 MB) y cada alta suelta la lee, la clona y
 * la reescribe completa: ~130 ms de hilo principal bloqueado. El espejo traía 74 tareas + 341 eventos + 40 dibujos
 * uno por uno: ~455 reescrituras seguidas tras abrir la app, medidas como tareas de 120-280 ms cada ~250 ms durante
 * casi un minuto (el lienzo caía a 28-35 fps hiciera lo que hiciera). Un lote = una escritura.
 */
export async function upsertMirrorBatch(lote: LoteEspejo) {
  return mutateState(state => { aplicarEspejo(state, lote) })
}

function upsertById<T extends { id: string }>(rows: T[], next: T) {
  const index = rows.findIndex((row) => row.id === next.id)
  if (index === -1) return [next, ...rows]
  const copy = [...rows]
  copy[index] = next
  return copy
}

export async function browserStatus() {
  const state = await readState()
  return {
    pendingCount: state.queue.filter((item) => item.status === 'pending').length,
    failedCount: state.queue.filter((item) => item.status === 'failed').length,
    conflictCount: state.queue.filter((item) => item.status === 'conflict').length,
    lastSyncedAt: state.lastSyncedAt ?? null,
    lastPackPath: state.lastPackPath ?? null,
  }
}

export async function listLocalTasks() {
  const state = await readState()
  return state.tasks.filter((task) => !task.deletedAt)
}

export async function upsertLocalTask(task: LocalTaskRecord, queue = true) {
  return mutateState(state => {
    const next = { ...task, syncStatus: task.syncStatus ?? 'queued' as const, updatedAt: task.updatedAt || now() }
    state.tasks = upsertById(state.tasks, next)
    if (queue) enqueue(state, 'task', next.id, 'upsert', next)
    return next
  })
}

export async function listLocalEvents(from?: string, to?: string) {
  const state = await readState()
  return state.events
    .filter((event) => !event.deletedAt)
    .filter((event) => !from || event.startsAt >= from)
    .filter((event) => !to || event.startsAt <= to)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

export async function upsertLocalEvent(event: LocalEventRecord, queue = true) {
  return mutateState(state => {
    const next = { ...event, status: event.status ?? 'queued' as const, updatedAt: event.updatedAt || now() }
    state.events = upsertById(state.events, next)
    if (queue) enqueue(state, 'calendar_event', next.id, 'upsert', next)
    return next
  })
}

export async function listLocalDrawings() {
  const state = await readState()
  return state.drawings.filter((drawing) => !drawing.deletedAt)
}

export async function upsertLocalDrawing(drawing: LocalDrawingRecord, queue = true) {
  return mutateState(state => {
    const next = { ...drawing, syncStatus: drawing.syncStatus ?? 'queued' as const, updatedAt: drawing.updatedAt || now() }
    state.drawings = upsertById(state.drawings, next)
    if (queue) enqueue(state, 'drawing', next.id, 'upsert', next)
    return next
  })
}

export async function registerLocalFile(file: LocalFileRecord) {
  return mutateState(state => {
    state.files = upsertById(state.files, file)
    return file
  })
}

export async function listSyncQueue() {
  const state = await readState()
  return state.queue.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function markSyncQueueItem(input: MarkSyncQueueItemInput) {
  return mutateState(state => {
    const item = state.queue.find((row) => row.id === input.id)
    if (!item) throw new Error(`Sync queue item not found: ${input.id}`)
    if (item.status === 'cancelled') return item
    if (input.confirmedSelection) {
      if (item.entityType !== 'chat_prompt' || !['pending', 'failed'].includes(item.status) || input.status !== 'pending') throw new Error('El borrador ya no admite confirmar ajustes.')
      item.payloadJson = confirmedDraftPayload(item.payloadJson, input.confirmedSelection.localOwner, input.confirmedSelection.intent)
    }
    if (input.status === 'cancelled') {
      if (item.entityType !== 'chat_prompt') throw new Error('Only chat drafts support local cancellation')
      item.status = 'cancelled'; item.updatedAt = now(); item.lastError = null
      return item
    }
    // An overlapping retry can fail after another observer received the
    // durable acceptance receipt. Do not turn accepted chat work back into a
    // failed draft. Explicit user retry ('pending') remains available.
    if (item.entityType === 'chat_prompt' && item.status === 'synced' && input.status !== 'pending') return item

    item.status = input.status
    item.lastError = input.lastError ?? null
    item.attempts += 1
    item.updatedAt = now()

    const entityStatus = input.status === 'pending' ? 'queued' : input.status
    if (item.entityType === 'task') {
      state.tasks = state.tasks.map((task) => (
        task.id === item.entityId
          ? { ...task, cloudId: input.cloudId ?? task.cloudId ?? null, syncStatus: entityStatus }
          : task
      ))
    } else if (item.entityType === 'calendar_event') {
      state.events = state.events.map((event) => (
        event.id === item.entityId
          ? { ...event, cloudId: input.cloudId ?? event.cloudId ?? null, status: entityStatus }
          : event
      ))
    } else if (item.entityType === 'drawing') {
      state.drawings = state.drawings.map((drawing) => (
        drawing.id === item.entityId
          ? { ...drawing, cloudId: input.cloudId ?? drawing.cloudId ?? null, syncStatus: entityStatus }
          : drawing
      ))
    }

    if (input.status === 'synced') state.lastSyncedAt = now()
    return item
  })
}

export async function queueChatPrompt(input: ChatPromptInput) {
  return mutateState(state => {
    const item = enqueue(state, 'chat_prompt', uuid('chat_prompt'), 'send_prompt', {
      ...input,
      createdAt: now(),
  })
  return item
  })
}

export async function syncNow(online: boolean): Promise<SyncResult> {
  return mutateState(state => {
    const candidates = state.queue.filter((item) => item.status === 'pending' || item.status === 'failed')
    const result: SyncResult = { processed: 0, synced: 0, failed: 0, conflicts: 0 }
    for (const item of candidates) {
      result.processed += 1
      item.attempts += 1
      item.updatedAt = now()
      if (!online) {
        item.status = 'failed'
        item.lastError = 'Offline; queued for retry when connectivity returns'
        result.failed += 1
        continue
      }
      item.status = 'synced'
      item.lastError = null
      result.synced += 1
    }
    if (result.synced > 0) state.lastSyncedAt = now()
    return result
  })
}

export async function prepareOfflinePack(request: OfflinePackRequest): Promise<OfflinePackResult> {
  const state = await readState()
  const generatedAt = now()
  const name = request.name ?? `browser-pack-${generatedAt.slice(0, 10)}`
  const manifest = {
    name,
    generatedAt,
    notes: request.notes ?? null,
    counts: {
      tasks: state.tasks.length,
      events: state.events.length,
      drawings: state.drawings.length,
      files: state.files.length,
    },
    snapshots: request.snapshots ?? {},
  }
  const { set } = await kv()
  const packPath = `indexeddb://${STORE_KEY}/packs/${name}`
  await set(`${STORE_KEY}:pack:${name}`, manifest)
  await mutateState(current => { current.lastPackPath = packPath })
  return {
    packPath,
    manifestPath: `${packPath}/manifest.json`,
    generatedAt,
    tasks: state.tasks.length,
    events: state.events.length,
    drawings: state.drawings.length,
    files: state.files.length,
  }
}

/**
 * CADA INSTANTANEA EN SU PROPIA LLAVE (5 oct 2026).
 *
 * Vivian dentro del estado unico: refrescar el calendario o la actividad (cientos de KB) reescribia tambien los
 * ~28 MB de dibujos espejados, y leer una instantanea deserializaba todo. Ahora cada una se escribe y se lee sola.
 * Las viejas siguen dentro del estado: se leen UNA vez por sesion como respaldo hasta que se reescriban.
 */
const SNAP_PREFIX = `${STORE_KEY}:snap:`
type Instantanea = { module: string; payload: unknown; updatedAt: string }
let snapshotsViejos: Promise<BrowserLocalState['snapshots']> | null = null

export async function cacheSnapshot(module: string, key: string, payload: unknown) {
  const { set } = await kv()
  await set(SNAP_PREFIX + key, { module, payload, updatedAt: now() } satisfies Instantanea)
}

export async function getCachedSnapshot<T>(key: string): Promise<T | null> {
  if (typeof window === 'undefined') return null
  const { get } = await kv()
  const propia = await get<Instantanea>(SNAP_PREFIX + key)
  if (propia) return (propia.payload as T | undefined) ?? null
  snapshotsViejos ??= readState().then(s => s.snapshots ?? {}).catch(() => ({}))
  return ((await snapshotsViejos)[key]?.payload as T | undefined) ?? null
}

export async function searchLocal(query: string): Promise<SearchHit[]> {
  const state = await readState()
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const taskHits = state.tasks
    .filter((task) => !task.deletedAt && task.title.toLowerCase().includes(needle))
    .slice(0, 25)
    .map<SearchHit>((task) => ({
      id: task.id,
      module: 'tasks',
      title: task.title,
      subtitle: task.status ?? null,
      updatedAt: task.updatedAt,
    }))
  const eventHits = state.events
    .filter((event) => !event.deletedAt && event.title.toLowerCase().includes(needle))
    .slice(0, 25)
    .map<SearchHit>((event) => ({
      id: event.id,
      module: 'calendar',
      title: event.title,
      subtitle: event.startsAt,
      updatedAt: event.updatedAt,
    }))
  const drawingHits = state.drawings
    .filter((drawing) => !drawing.deletedAt && drawing.title.toLowerCase().includes(needle))
    .slice(0, 25)
    .map<SearchHit>((drawing) => ({
      id: drawing.id,
      module: 'canvas',
      title: drawing.title,
      subtitle: drawing.syncStatus ?? null,
      updatedAt: drawing.updatedAt,
    }))
  return [...taskHits, ...eventHits, ...drawingHits]
}
