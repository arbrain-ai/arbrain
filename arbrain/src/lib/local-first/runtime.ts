import type {
  ChatPromptInput,
  LocalDrawingRecord,
  LocalEventRecord,
  LocalFileRecord,
  LocalTaskRecord,
  OfflinePackRequest,
  OfflinePackResult,
  RuntimeStatus,
  SearchHit,
  SyncQueueItem,
  SyncResult,
  MarkSyncQueueItemInput,
  PullLocalMirrorResult,
  SyncAndPullResult,
} from './types'
import * as browserStore from './browser-store'
import { deliverOfflineChat, ChatDraftNoLongerPending } from '@/features/chat/lib/offline-envelope'
import { instalacion } from '@/config'

const DEFAULT_CALENDAR_ACCOUNT_EMAIL = instalacion().correoDueno
const DEFAULT_GOOGLE_CALENDAR_ID = instalacion().correoDueno

type TauriDesktopStatus = {
  desktop: boolean
  server?: RuntimeStatus['server']
  workspacePath: string
  databasePath: string
  pendingCount: number
  failedCount: number
  conflictCount: number
  lastSyncedAt?: string | null
  lastPackPath?: string | null
}

const CHANGE_EVENT = 'mission-control-local-first:changed'

const MIRROR_RANGE_PAST_DAYS = 60
const MIRROR_RANGE_FUTURE_DAYS = 180

const SNAPSHOT_TARGETS: Array<{ module: string; key: string; url: string }> = [
  { module: 'dashboard', key: 'radar:business', url: '/api/analytics/business' },
  { module: 'dashboard', key: 'dashboard:ml', url: '/api/analytics/ml' },
  { module: 'intel', key: 'radar:intel', url: '/api/analytics/intel' },
  { module: 'comments', key: 'comments:queue', url: '/api/comments/queue' },
  { module: 'comments', key: 'bandeja:leads', url: '/api/comments/leads' },
  { module: 'ops', key: 'cron:jobs', url: '/api/cron' },
  { module: 'business', key: 'business:polar', url: '/api/analytics/polar' },
]

type MirrorTask = {
  id: string
  title?: string | null
  description?: string | null
  status?: string | null
  priority?: number | null
  due_at?: string | null
  updated_at?: string | null
  created_at?: string | null
  task_assignees?: Array<{ profile_id?: string | null }>
}

type MirrorDrawing = {
  page_id: string
  name?: string | null
  page_elements?: unknown
  updated_at?: string | null
  created_at?: string | null
}

type MirrorCalendarEvent = {
  id: string
  googleEventId?: string
  googleCalendarId?: string
  accountEmail?: string
  title?: string | null
  description?: string | null
  start: string
  end?: string
}

type MirrorPullResponse = {
  pulledAt?: string
  range?: { from: string; to: string }
  tasks?: MirrorTask[]
  drawings?: MirrorDrawing[]
  calendarEvents?: MirrorCalendarEvent[]
  calendarSources?: unknown[]
  snapshots?: Record<string, { module: string; payload: unknown }>
  errors?: string[]
}

export function isDesktopRuntime() {
  if (typeof window === 'undefined') return false
  return Boolean('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
}

export function isLocalhostRuntime() {
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function isOnline() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

export function emitLocalFirstChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function onLocalFirstChanged(listener: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}

/** The Tauri bridge is proven per app session. Until a command has succeeded
 * once, any failure marks the desktop store unavailable and every store call
 * falls back to the browser store (IndexedDB inside the same WebView), so a
 * broken IPC never blocks a send. The reason is kept for the status pill and
 * reported once to the local server (loopback only) for diagnosis. */
type DesktopStoreState = 'unknown' | 'ready' | 'unavailable'
let desktopStoreState: DesktopStoreState = 'unknown'
let desktopStoreIssue: string | null = null
export function desktopStoreStatus() { return { state: desktopStoreState, issue: desktopStoreIssue } }
function useDesktopStore() { return isDesktopRuntime() && desktopStoreState !== 'unavailable' }
function markDesktopStoreUnavailable(command: string, error: unknown) {
  desktopStoreState = 'unavailable'
  const reason = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error)
  desktopStoreIssue = `Puente de escritorio no disponible (${command}: ${reason}). Usando el almacén del navegador.`
  console.error('[local-first] desktop bridge unavailable', command, error)
  try {
    void fetch('/api/local-first/desktop-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue: desktopStoreIssue, userAgent: navigator.userAgent }) }).catch(() => {})
  } catch { /* diagnostics are best effort */ }
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktopRuntime()) throw new Error('Mission Control desktop runtime is not active')
  try {
    const api = await import('@tauri-apps/api/core')
    const result = await api.invoke<T>(command, args)
    desktopStoreState = 'ready'
    return result
  } catch (error) {
    if (desktopStoreState !== 'ready') markDesktopStoreUnavailable(command, error)
    throw error
  }
}

/** Desktop store first; browser store when the bridge just proved unavailable. */
async function withStore<T>(desktop: () => Promise<T>, browser: () => Promise<T>): Promise<T> {
  if (!useDesktopStore()) return browser()
  try { return await desktop() } catch (error) {
    if (desktopStoreState === 'unavailable') return browser()
    throw error
  }
}

function localId(prefix: string) {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}_${id}`
}

function computeMode(desktop: boolean, online: boolean, pendingCount: number, failedCount: number, conflictCount: number): RuntimeStatus['mode'] {
  if (!online) return 'offline'
  if (desktop || pendingCount > 0 || failedCount > 0 || conflictCount > 0) return 'hybrid'
  return 'cloud'
}

export async function getRuntimeStatus(syncing = false): Promise<RuntimeStatus> {
  const online = isOnline()
  if (useDesktopStore()) {
    let status: TauriDesktopStatus | null = null
    try { status = await invoke<TauriDesktopStatus>('desktop_status') } catch (error) { if (desktopStoreState !== 'unavailable') throw error }
    if (status) return {
      desktop: true,
      mode: computeMode(true, online, status.pendingCount, status.failedCount, status.conflictCount),
      online,
      syncing,
      pendingCount: status.pendingCount,
      failedCount: status.failedCount,
      conflictCount: status.conflictCount,
      workspacePath: status.workspacePath,
      databasePath: status.databasePath,
      server: status.server,
      lastSyncedAt: status.lastSyncedAt,
      lastPackPath: status.lastPackPath,
    }
  }

  const fallback = await browserStore.browserStatus()
  return {
    desktop: false,
    mode: computeMode(false, online, fallback.pendingCount, fallback.failedCount, fallback.conflictCount),
    online,
    syncing,
    pendingCount: fallback.pendingCount,
    failedCount: fallback.failedCount,
    conflictCount: fallback.conflictCount,
    lastSyncedAt: fallback.lastSyncedAt,
    lastPackPath: fallback.lastPackPath,
    ...(desktopStoreIssue ? { message: desktopStoreIssue } : {}),
  }
}

export async function listLocalTasks() {
  if (isDesktopRuntime()) return invoke<LocalTaskRecord[]>('list_local_tasks')
  return browserStore.listLocalTasks()
}

export async function createLocalTask(input: {
  title: string
  description?: string | null
  status?: string | null
  priority?: number | null
  dueAt?: string | null
  assigneeId?: string | null
}) {
  const task: LocalTaskRecord = {
    id: localId('local_task'),
    cloudId: null,
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? 'backlog',
    priority: input.priority ?? 0,
    dueAt: input.dueAt ?? null,
    assigneeId: input.assigneeId ?? null,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    syncStatus: 'queued',
  }
  const saved = await upsertLocalTask(task, true)
  emitLocalFirstChanged()
  return saved
}

export async function upsertLocalTask(task: LocalTaskRecord, queue = true) {
  const saved = isDesktopRuntime()
    ? await invoke<LocalTaskRecord>('upsert_local_task', { task, queue })
    : await browserStore.upsertLocalTask(task, queue)
  emitLocalFirstChanged()
  return saved
}

export async function listLocalEvents(from?: string, to?: string) {
  if (isDesktopRuntime()) return invoke<LocalEventRecord[]>('list_local_events', { from, to })
  return browserStore.listLocalEvents(from, to)
}

export async function createLocalEvent(input: {
  title: string
  description?: string | null
  accountEmail?: string | null
  calendarId?: string | null
  startsAt: string
  endsAt?: string | null
  timezone?: string | null
}) {
  const event: LocalEventRecord = {
    id: localId('local_event'),
    cloudId: null,
    accountEmail: input.accountEmail ?? DEFAULT_CALENDAR_ACCOUNT_EMAIL,
    calendarId: input.calendarId ?? DEFAULT_GOOGLE_CALENDAR_ID,
    title: input.title,
    description: input.description ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? input.startsAt,
    timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: 'queued',
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  }
  const saved = await upsertLocalEvent(event, true)
  emitLocalFirstChanged()
  return saved
}

export async function upsertLocalEvent(event: LocalEventRecord, queue = true) {
  const saved = isDesktopRuntime()
    ? await invoke<LocalEventRecord>('upsert_local_event', { event, queue })
    : await browserStore.upsertLocalEvent(event, queue)
  emitLocalFirstChanged()
  return saved
}

export async function listLocalDrawings() {
  if (isDesktopRuntime()) return invoke<LocalDrawingRecord[]>('list_local_drawings')
  return browserStore.listLocalDrawings()
}

export async function upsertLocalDrawing(drawing: LocalDrawingRecord, queue = true) {
  const saved = isDesktopRuntime()
    ? await invoke<LocalDrawingRecord>('upsert_local_drawing', { drawing, queue })
    : await browserStore.upsertLocalDrawing(drawing, queue)
  emitLocalFirstChanged()
  return saved
}

export async function registerLocalFile(file: LocalFileRecord) {
  const saved = isDesktopRuntime()
    ? await invoke<LocalFileRecord>('register_local_file', { file })
    : await browserStore.registerLocalFile(file)
  emitLocalFirstChanged()
  return saved
}

export async function listSyncQueue() {
  return withStore(() => invoke<SyncQueueItem[]>('list_sync_queue'), () => browserStore.listSyncQueue())
}

async function markSyncQueueItem(input: MarkSyncQueueItemInput) {
  const item = await withStore(() => invoke<SyncQueueItem>('mark_sync_queue_item', { input }), () => browserStore.markSyncQueueItem(input))
  emitLocalFirstChanged()
  return item
}

export async function retrySyncQueueItem(id: string) {
  return markSyncQueueItem({ id, status: 'pending', lastError: null })
}

export async function acknowledgeQueuedChat(id: string) {
  return markSyncQueueItem({ id, status: 'synced', lastError: null })
}

export async function confirmQueuedChatSelection(id: string, localOwner: string, intent: import('@/features/chat/lib/offline-envelope').ChatIntent) {
  return markSyncQueueItem({ id, status: 'pending', lastError: null, confirmedSelection: { localOwner, intent } })
}

export async function cancelQueuedChat(id: string) {
  return markSyncQueueItem({ id, status: 'cancelled', lastError: null })
}

export async function queueChatPrompt(input: ChatPromptInput) {
  const item = await withStore(() => invoke<SyncQueueItem>('queue_chat_prompt', { input }), () => browserStore.queueChatPrompt(input))
  emitLocalFirstChanged()
  return item
}

export async function syncNow(): Promise<SyncResult> { return syncQueue() }

/** `soloIds`: reintento automático de envíos concretos (reintento-envios.ts); sin él, toda la cola del dueño. */
export async function syncChatQueue(expectedOwnerId: string, soloIds?: string[]): Promise<SyncResult> { return syncQueue(expectedOwnerId, soloIds ? new Set(soloIds) : undefined) }

async function syncQueue(chatOwner?: string, soloIds?: Set<string>): Promise<SyncResult> {
  const online = isOnline()
  if (!online) {
    if (chatOwner) return { processed: 0, synced: 0, failed: 0, conflicts: 0 }
    const result = await withStore(() => invoke<SyncResult>('sync_now', { online: false }), () => browserStore.syncNow(false))
    emitLocalFirstChanged()
    return result
  }

  const queue = (await listSyncQueue())
    .filter((item) => item.status === 'pending' || item.status === 'failed')
    .filter((item) => !soloIds || soloIds.has(item.id))
    .filter(item => {
      if (item.entityType !== 'chat_prompt') return !chatOwner
      try {
        const envelope = JSON.parse(item.payloadJson).localContext?.chatEnvelope
        // A draft whose selection was unknown at the tap waits for an explicit
        // confirmation in the conversation; it is not a failed delivery.
        if (envelope?.version === 2 && !envelope.intent) return false
        return !chatOwner || envelope?.expectedOwnerId === chatOwner
      } catch { return !chatOwner }
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const result: SyncResult = { processed: 0, synced: 0, failed: 0, conflicts: 0 }

  for (const item of queue) {
    result.processed += 1
    try {
      if (item.entityType === 'chat_prompt') {
        const current = (await listSyncQueue()).find(candidate => candidate.id === item.id)
        if (!current || !['pending', 'failed'].includes(current.status)) continue
      }
      const cloudId = await replaySyncQueueItem(item)
      await markSyncQueueItem({ id: item.id, status: 'synced', cloudId, lastError: null })
      result.synced += 1
    } catch (error) {
      if (error instanceof ChatDraftNoLongerPending) continue
      const status = isConflictError(error) ? 'conflict' : 'failed'
      await markSyncQueueItem({
        id: item.id,
        status,
        lastError: error instanceof Error ? error.message : 'Sync failed',
      })
      if (status === 'conflict') result.conflicts += 1
      else result.failed += 1
    }
  }

  emitLocalFirstChanged()
  return result
}

function isoOffset(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

function isDirtyTask(task?: LocalTaskRecord) {
  return task ? ['queued', 'failed', 'conflict', 'syncing'].includes(task.syncStatus ?? '') : false
}

function isDirtyEvent(event?: LocalEventRecord) {
  return event ? ['queued', 'failed', 'conflict', 'syncing'].includes(event.status ?? '') : false
}

function isDirtyDrawing(drawing?: LocalDrawingRecord) {
  return drawing ? ['queued', 'failed', 'conflict', 'syncing'].includes(drawing.syncStatus ?? '') : false
}

function mirrorTaskToLocal(task: MirrorTask, pulledAt: string): LocalTaskRecord {
  return {
    id: task.id,
    cloudId: task.id,
    title: task.title ?? 'Untitled task',
    description: task.description ?? null,
    status: task.status ?? 'backlog',
    priority: task.priority ?? 0,
    dueAt: task.due_at ?? null,
    assigneeId: task.task_assignees?.find((item) => item.profile_id)?.profile_id ?? null,
    updatedAt: task.updated_at ?? task.created_at ?? pulledAt,
    deletedAt: null,
    syncStatus: 'synced',
  }
}

function mirrorDrawingToLocal(drawing: MirrorDrawing, pulledAt: string): LocalDrawingRecord {
  return {
    id: drawing.page_id,
    cloudId: drawing.page_id,
    title: drawing.name ?? 'Canvas',
    dataJson: JSON.stringify(drawing.page_elements ?? { elements: [], files: {}, schemaVersion: 3 }),
    thumbnailPath: null,
    updatedAt: drawing.updated_at ?? drawing.created_at ?? pulledAt,
    deletedAt: null,
    syncStatus: 'synced',
  }
}

function mirrorCalendarEventToLocal(event: MirrorCalendarEvent, pulledAt: string): LocalEventRecord {
  return {
    id: event.id,
    cloudId: event.googleEventId ?? event.id,
    accountEmail: event.accountEmail ?? DEFAULT_CALENDAR_ACCOUNT_EMAIL,
    calendarId: event.googleCalendarId ?? DEFAULT_GOOGLE_CALENDAR_ID,
    title: event.title ?? 'Sin titulo',
    description: event.description ?? null,
    startsAt: event.start,
    endsAt: event.end ?? event.start,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: 'synced',
    updatedAt: pulledAt,
    deletedAt: null,
  }
}

async function fetchAndCacheSnapshot(target: { module: string; key: string; url: string }) {
  const res = await fetch(target.url, { cache: 'no-store' })
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`${target.key}: ${payload?.error ?? `HTTP ${res.status}`}`)
  }
  await cacheSnapshot(target.module, target.key, payload)
  return target.key
}

export async function pullCloudToLocal(includeSnapshots = true): Promise<PullLocalMirrorResult> {
  const pulledAt = new Date().toISOString()
  const result: PullLocalMirrorResult = {
    pulledAt,
    tasks: 0,
    events: 0,
    drawings: 0,
    snapshots: 0,
    skippedLocalChanges: 0,
    errors: [],
  }

  if (!isOnline()) {
    result.errors.push('Offline; pull skipped')
    return result
  }

  const range = {
    from: isoOffset(-MIRROR_RANGE_PAST_DAYS),
    to: isoOffset(MIRROR_RANGE_FUTURE_DAYS),
  }

  const [tasksBefore, eventsBefore, drawingsBefore] = await Promise.all([
    listLocalTasks().catch(() => []),
    listLocalEvents().catch(() => []),
    listLocalDrawings().catch(() => []),
  ])
  const localTasksById = new Map(tasksBefore.map((task) => [task.id, task]))
  const localEventsById = new Map(eventsBefore.map((event) => [event.id, event]))
  const localDrawingsById = new Map(drawingsBefore.map((drawing) => [drawing.id, drawing]))
  const localTasksByCloudId = new Map(tasksBefore.flatMap((task) => task.cloudId ? [[task.cloudId, task] as const] : []))
  const localEventsByCloudId = new Map(eventsBefore.flatMap((event) => event.cloudId ? [[event.cloudId, event] as const] : []))
  const localDrawingsByCloudId = new Map(drawingsBefore.flatMap((drawing) => drawing.cloudId ? [[drawing.cloudId, drawing] as const] : []))

  try {
    const params = new URLSearchParams(range)
    const res = await fetch(`/api/local-first/pull?${params.toString()}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({})) as MirrorPullResponse
    if (!res.ok) {
      throw new Error(data.errors?.join('; ') || `Mirror pull failed (${res.status})`)
    }

    const mirrorPulledAt = data.pulledAt ?? pulledAt
    const lote: browserStore.LoteEspejo = { tasks: [], events: [], drawings: [] }
    for (const task of data.tasks ?? []) {
      if (!task.id) continue
      const existing = localTasksById.get(task.id) ?? localTasksByCloudId.get(task.id)
      if (isDirtyTask(existing)) {
        result.skippedLocalChanges += 1
        continue
      }
      const local = mirrorTaskToLocal(task, mirrorPulledAt)
      lote.tasks!.push(existing ? { ...local, id: existing.id, cloudId: task.id } : local)
      result.tasks += 1
    }

    for (const event of data.calendarEvents ?? []) {
      if (!event.id || !event.start) continue
      const cloudId = event.googleEventId ?? event.id
      const existing = localEventsById.get(event.id) ?? localEventsByCloudId.get(cloudId)
      if (isDirtyEvent(existing)) {
        result.skippedLocalChanges += 1
        continue
      }
      const local = mirrorCalendarEventToLocal(event, mirrorPulledAt)
      lote.events!.push(existing ? { ...local, id: existing.id, cloudId } : local)
      result.events += 1
    }

    for (const drawing of data.drawings ?? []) {
      if (!drawing.page_id) continue
      const existing = localDrawingsById.get(drawing.page_id) ?? localDrawingsByCloudId.get(drawing.page_id)
      if (isDirtyDrawing(existing)) {
        result.skippedLocalChanges += 1
        continue
      }
      const local = mirrorDrawingToLocal(drawing, mirrorPulledAt)
      lote.drawings!.push(existing ? { ...local, id: existing.id, cloudId: drawing.page_id } : local)
      result.drawings += 1
    }
    await guardarEspejo(lote)

    if (data.calendarEvents) {
      await cacheSnapshot('calendar', 'calendar:last-range', {
        range: data.range ?? range,
        events: data.calendarEvents,
      })
      result.snapshots += 1
    }

    if (data.calendarSources) {
      await cacheSnapshot('calendar', 'calendar:sources', data.calendarSources)
      result.snapshots += 1
    }

    for (const [key, snapshot] of Object.entries(data.snapshots ?? {})) {
      await cacheSnapshot(snapshot.module, key, snapshot.payload)
      result.snapshots += 1
    }

    for (const error of data.errors ?? []) result.errors.push(error)
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Mirror pull failed')
  }

  const snapshotResults = await Promise.allSettled((includeSnapshots ? SNAPSHOT_TARGETS : []).map(fetchAndCacheSnapshot))
  for (const item of snapshotResults) {
    if (item.status === 'fulfilled') result.snapshots += 1
    else result.errors.push(item.reason instanceof Error ? item.reason.message : 'Snapshot pull failed')
  }

  emitLocalFirstChanged()
  return result
}

/**
 * El espejo se escribe de una vez y se avisa UNA vez (al final de `pullCloudToLocal`). Antes cada fila emitia
 * `changed`, y cada aviso recargaba las tareas y el estado: ~455 recargas por sincronizacion (5 oct 2026).
 */
async function guardarEspejo(lote: browserStore.LoteEspejo): Promise<void> {
  await withStore(async () => {
    for (const task of lote.tasks ?? []) await invoke('upsert_local_task', { task, queue: false })
    for (const event of lote.events ?? []) await invoke('upsert_local_event', { event, queue: false })
    for (const drawing of lote.drawings ?? []) await invoke('upsert_local_drawing', { drawing, queue: false })
  }, () => browserStore.upsertMirrorBatch(lote))
}

export async function syncAndPullLocalMirror(includeSnapshots = true): Promise<SyncAndPullResult> {
  const sync = await syncNow()
  const pull = await pullCloudToLocal(includeSnapshots)
  return { sync, pull }
}

async function replaySyncQueueItem(item: SyncQueueItem): Promise<string | null> {
  const payload = parseQueuePayload(item)
  if (item.entityType === 'task') return replayTask(payload as LocalTaskRecord)
  if (item.entityType === 'calendar_event') return replayCalendarEvent(payload as LocalEventRecord)
  if (item.entityType === 'drawing') return replayDrawing(payload as LocalDrawingRecord)
  if (item.entityType === 'chat_prompt') return replayChatPrompt(payload as ChatPromptInput, item.id)
  return null
}

function parseQueuePayload(item: SyncQueueItem): unknown {
  try {
    return JSON.parse(item.payloadJson)
  } catch {
    throw new Error(`Invalid queue payload for ${item.entityType}:${item.entityId}`)
  }
}

function isConflictError(error: unknown) {
  return error instanceof Error && /conflict|409|version/i.test(error.message)
}

async function replayTask(task: LocalTaskRecord): Promise<string | null> {
  return replayEntityThroughServer('task', task)
}

async function replayCalendarEvent(event: LocalEventRecord): Promise<string | null> {
  const accountEmail = event.accountEmail || DEFAULT_CALENDAR_ACCOUNT_EMAIL
  const googleCalendarId = event.calendarId && event.calendarId !== 'local'
    ? event.calendarId
    : DEFAULT_GOOGLE_CALENDAR_ID
  const payload = {
    accountEmail,
    googleCalendarId,
    title: event.title,
    start: event.startsAt,
    end: event.endsAt ?? event.startsAt,
    allDay: /^\d{4}-\d{2}-\d{2}$/.test(event.startsAt),
    description: event.description ?? undefined,
    sendUpdates: 'none' as const,
  }

  const url = event.cloudId
    ? `/api/calendar/events/${encodeURIComponent(event.cloudId)}`
    : '/api/calendar/events'
  const res = await fetch(url, {
    method: event.cloudId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Calendar sync failed (${res.status})`)
  return (data.event?.googleEventId ?? data.event?.id ?? event.cloudId ?? null) as string | null
}

async function replayDrawing(drawing: LocalDrawingRecord): Promise<string | null> {
  return replayEntityThroughServer('drawing', drawing)
}

async function replayEntityThroughServer(entityType: 'task' | 'drawing', payload: unknown): Promise<string | null> {
  const res = await fetch('/api/local-first/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, payload }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `${entityType} sync failed (${res.status})`)
  return (data.cloudId ?? null) as string | null
}

async function replayChatPrompt(input: ChatPromptInput, queueId: string): Promise<string | null> {
  // localContext is retained by both IndexedDB and the existing Tauri queue.
  // Legacy text-only drafts stay recoverable instead of being sent to a global chat.
  return deliverOfflineChat((input.localContext as { chatEnvelope?: unknown } | null)?.chatEnvelope, fetch, async () => {
    const current = (await listSyncQueue()).find(item => item.id === queueId)
    return !!current && ['pending', 'failed'].includes(current.status)
  })
}

export async function prepareOfflinePack(request: OfflinePackRequest = {}): Promise<OfflinePackResult> {
  const result = isDesktopRuntime()
    ? await invoke<OfflinePackResult>('prepare_offline_pack', { request })
    : await browserStore.prepareOfflinePack(request)
  emitLocalFirstChanged()
  return result
}

export async function cacheSnapshot(module: string, key: string, payload: unknown) {
  if (isDesktopRuntime()) {
    await invoke<void>('cache_snapshot', { input: { module, key, payload } })
  } else {
    await browserStore.cacheSnapshot(module, key, payload)
  }
}

export async function getCachedSnapshot<T = unknown>(key: string): Promise<T | null> {
  if (isDesktopRuntime()) return invoke<T | null>('get_cached_snapshot', { key })
  return browserStore.getCachedSnapshot<T>(key)
}

export async function searchLocal(query: string): Promise<SearchHit[]> {
  if (isDesktopRuntime()) return invoke<SearchHit[]>('search_local', { query })
  return browserStore.searchLocal(query)
}

export async function openLocalWorkspace() {
  if (!isDesktopRuntime()) return null
  return invoke<string>('open_workspace')
}

export function createLocalDrawingRecord(input: {
  id: string
  title: string
  data: unknown
  cloudId?: string | null
}): LocalDrawingRecord {
  return {
    id: input.id,
    cloudId: input.cloudId ?? null,
    title: input.title,
    dataJson: JSON.stringify(input.data),
    thumbnailPath: null,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    syncStatus: 'queued',
  }
}
