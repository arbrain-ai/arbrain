import {
  createLocalDrawingRecord,
  isOnline,
  listLocalDrawings,
  upsertLocalDrawing,
} from '@/lib/local-first'
import type { DrawPage, DrawFolder, DrawElements } from '../types'

const TABLE = 'draw'
const LOCAL_TIMEOUT_MS = 1200

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms)
    promise
      .then((value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        window.clearTimeout(timer)
        resolve(fallback)
      })
  })
}

function localDrawingToPage(drawing: Awaited<ReturnType<typeof listLocalDrawings>>[number]): DrawPage {
  return {
    page_id: drawing.id,
    user_id: 'local',
    name: drawing.title,
    page_elements: JSON.parse(drawing.dataJson) as DrawElements,
    agent_version: 0,
    is_deleted: false,
    folder_id: null,
    created_at: drawing.updatedAt,
    updated_at: drawing.updatedAt,
  }
}

async function localPages() {
  return withTimeout(
    listLocalDrawings()
      .then((drawings) => drawings.flatMap((drawing) => {
        try {
          return [localDrawingToPage(drawing)]
        } catch {
          return []
        }
      })),
    LOCAL_TIMEOUT_MS,
    [],
  )
}

function pageToLocalRecord(page: DrawPage, syncStatus: 'queued' | 'synced' = 'synced') {
  return {
    id: page.page_id,
    cloudId: page.page_id.startsWith('local_drawing_') ? null : page.page_id,
    title: page.name,
    dataJson: JSON.stringify(page.page_elements ?? { elements: [], files: {}, schemaVersion: 3 }),
    thumbnailPath: null,
    updatedAt: page.updated_at ?? new Date().toISOString(),
    deletedAt: null,
    syncStatus,
  }
}

async function cloudPagesViaApi(): Promise<DrawPage[]> {
  const res = await fetch(isOnline() ? '/api/draw3' : '/api/draw3?source=local', { cache: 'no-store' })
  const json = await res.json().catch(() => ({})) as { pages?: DrawPage[]; error?: string }
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  const pages = json.pages ?? []
  cachePagesLocally(pages)
  return pages
}

export async function getPages(_userId: string): Promise<DrawPage[]> {
  try {
    const cloud = await cloudPagesViaApi()
    if (cloud.length > 0) return cloud
    return localPages()
  } catch {
    return localPages()
  }
}

function cachePagesLocally(pages: DrawPage[]) {
  if (pages.length === 0) return
  void (async () => {
    const existing = await withTimeout(listLocalDrawings(), LOCAL_TIMEOUT_MS, [])
    const byCloudId = new Map(existing.flatMap((drawing) => drawing.cloudId ? [[drawing.cloudId, drawing.id] as const] : []))
    await Promise.all(pages.map((page) => {
      const record = pageToLocalRecord({
        ...page,
        page_elements: { elements: [], files: {}, schemaVersion: page.page_elements?.schemaVersion ?? 3 },
      }, 'synced')
      const existingId = byCloudId.get(page.page_id)
      return withTimeout(
        upsertLocalDrawing(existingId ? { ...record, id: existingId, cloudId: page.page_id } : record, false),
        LOCAL_TIMEOUT_MS,
        record,
      )
    }))
  })().catch((error) => {
    console.warn('[draw-service] local page cache failed', error)
  })
}

// Lost-update guard: saves de la misma página se serializan entre sí, y las
// lecturas esperan al save in-flight para nunca devolver datos pre-save
// (carrera: pegar elementos → cambiar de página dispara el flush async →
// volver rápido fetcheaba estado stale y el autosave lo persistía).
const inflightSaves = new Map<string, Promise<unknown>>()

// Momento del último save que SÍ llegó al cloud, por página. Permite al editor
// descartar respuestas de red más viejas que lo que ya guardamos (lost-update
// por fetch lento: la respuesta llega DESPUÉS de un save exitoso cargando el
// estado de ANTES del save).
const lastCloudSaveAt = new Map<string, number>()

export function getLastCloudSaveAt(pageId: string): number {
  return lastCloudSaveAt.get(pageId) ?? 0
}

async function waitForPendingSave(pageId: string): Promise<void> {
  let tail = inflightSaves.get(pageId)
  while (tail) {
    await tail.catch(() => {})
    const next = inflightSaves.get(pageId)
    if (next === tail) break
    tail = next
  }
}

export async function getDrawData(pageId: string): Promise<DrawPage | null> {
  await waitForPendingSave(pageId)
  try {
    if (!isOnline()) throw new Error('offline')
    const res = await fetch(`/api/draw3/${encodeURIComponent(pageId)}/state`, { cache: 'no-store' })
    const json = await res.json().catch(() => ({})) as {
      page_id?: string
      name?: string
      agent_version?: number
      schema_version?: number
      elements?: Record<string, unknown>[]
      files?: Record<string, unknown>
      theme?: DrawElements['theme']
      camera?: DrawElements['camera']
      page_settings?: { htmlUrl?: string } | null
      error?: string
    }
    if (!res.ok || !json.page_id) throw new Error(json.error ?? `HTTP ${res.status}`)
    const updatedAt = new Date().toISOString()
    const page: DrawPage = {
      page_id: json.page_id,
      user_id: 'local',
      name: json.name ?? 'Canvas',
      page_elements: {
        schemaVersion: json.schema_version ?? 3,
        elements: json.elements ?? [],
        files: json.files ?? {},
        ...(json.theme && { theme: json.theme }),
        ...(json.camera && { camera: json.camera }),
      } as DrawElements,
      agent_version: json.agent_version ?? 0,
      is_deleted: false,
      folder_id: null,
      created_at: updatedAt,
      updated_at: updatedAt,
      page_settings: json.page_settings ?? null,
    }
    void withTimeout(upsertLocalDrawing(pageToLocalRecord(page, 'synced'), false), LOCAL_TIMEOUT_MS, pageToLocalRecord(page, 'synced'))
    return page
  } catch {
    const localRes = await fetch(`/api/draw3/${encodeURIComponent(pageId)}/state?source=local`, { cache: 'no-store' }).catch(() => null)
    if (localRes?.ok) {
      const json = await localRes.json().catch(() => null) as {
        page_id?: string
        name?: string
        agent_version?: number
        schema_version?: number
        elements?: Record<string, unknown>[]
        files?: Record<string, unknown>
        theme?: DrawElements['theme']
        camera?: DrawElements['camera']
      } | null
      if (json?.page_id) {
        const updatedAt = new Date().toISOString()
        return {
          page_id: json.page_id,
          user_id: 'local',
          name: json.name ?? 'Canvas',
          page_elements: {
            schemaVersion: json.schema_version ?? 3,
            elements: json.elements ?? [],
            files: json.files ?? {},
            ...(json.theme && { theme: json.theme }),
            ...(json.camera && { camera: json.camera }),
          } as DrawElements,
          agent_version: json.agent_version ?? 0,
          is_deleted: false,
          folder_id: null,
          created_at: updatedAt,
          updated_at: updatedAt,
        }
      }
    }

    const drawing = (await withTimeout(listLocalDrawings(), LOCAL_TIMEOUT_MS, [])).find((item) => item.id === pageId)
    return drawing ? localDrawingToPage(drawing) : null
  }
}

export async function createNewPage(folderId: string | null = null): Promise<DrawPage> {
  if (isOnline()) {
    try {
      const res = await fetch('/api/draw3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Page', theme: 'system', folderId }),
      })
      const json = await res.json().catch(() => ({})) as { page_id?: string; agent_version?: number; folder_id?: string | null; error?: string }
      if (!res.ok || !json.page_id) throw new Error(json.error ?? `HTTP ${res.status}`)
      const updatedAt = new Date().toISOString()
      const page: DrawPage = {
        page_id: json.page_id,
        user_id: 'local',
        name: 'New Page',
        page_elements: { elements: [], files: {}, schemaVersion: 3 },
        agent_version: json.agent_version ?? 0,
        is_deleted: false,
        folder_id: json.folder_id ?? folderId,
        created_at: updatedAt,
        updated_at: updatedAt,
      }
      void withTimeout(upsertLocalDrawing(pageToLocalRecord(page, 'synced'), false), LOCAL_TIMEOUT_MS, pageToLocalRecord(page, 'synced'))
      return page
    } catch {
      // Fall through to local creation.
    }
  }

  const id = `local_drawing_${crypto.randomUUID()}`
  const updatedAt = new Date().toISOString()
  const page: DrawPage = {
    page_id: id,
    user_id: 'local',
    name: 'New Page',
    page_elements: { elements: [], files: {}, schemaVersion: 3 },
    agent_version: 0,
    is_deleted: false,
    folder_id: folderId,
    created_at: updatedAt,
    updated_at: updatedAt,
  }
  await withTimeout(upsertLocalDrawing(createLocalDrawingRecord({
    id,
    title: page.name,
    data: page.page_elements,
  })), LOCAL_TIMEOUT_MS, createLocalDrawingRecord({
    id,
    title: page.name,
    data: page.page_elements,
  }))
  return page
}

/** Devuelve true si el snapshot llegó al cloud; false = solo quedó local (reintentar). */
export function saveDrawData(
  pageId: string,
  elements: readonly Record<string, unknown>[],
  name: string,
  files?: Record<string, unknown>,
  metadata?: {
    schemaVersion?: number
    theme?: 'dark' | 'light' | 'mono' | 'system'
    camera?: { x: number; y: number; scale: number }
    settings?: DrawElements['settings']
  },
): Promise<boolean> {
  const prev = inflightSaves.get(pageId) ?? Promise.resolve()
  const next = prev.catch(() => {}).then(() => doSaveDrawData(pageId, elements, name, files, metadata))
  inflightSaves.set(pageId, next)
  void next.finally(() => {
    if (inflightSaves.get(pageId) === next) inflightSaves.delete(pageId)
  })
  return next
}

async function doSaveDrawData(
  pageId: string,
  elements: readonly Record<string, unknown>[],
  name: string,
  files?: Record<string, unknown>,
  metadata?: {
    schemaVersion?: number
    theme?: 'dark' | 'light' | 'mono' | 'system'
    camera?: { x: number; y: number; scale: number }
    settings?: DrawElements['settings']
  },
): Promise<boolean> {
  const pageElements = {
    elements,
    files: files ?? {},
    ...(metadata?.schemaVersion && { schemaVersion: metadata.schemaVersion }),
    ...(metadata?.theme && { theme: metadata.theme }),
    ...(metadata?.camera && { camera: metadata.camera }),
    ...(metadata?.settings && { settings: metadata.settings }),
  }

  // WRITE por el MISMO camino que los READS (API server-side con
  // authenticateDraw3: cookie web, bypass desktop, token agente). El cliente
  // supabase directo fallaba en silencio en desktop: sin sesión, RLS dejaba
  // el UPDATE en 0 filas SIN error y el save jamás llegaba al server.
  try {
    if (!isOnline() || pageId.startsWith('local_drawing_')) throw new Error('local-first save')
    const res = await fetch(`/api/draw3/${encodeURIComponent(pageId)}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, page_elements: pageElements }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    lastCloudSaveAt.set(pageId, Date.now())
    return true
  } catch (err) {
    console.warn('[draw-service] cloud save failed, queued locally:', err)
    await upsertLocalDrawing(createLocalDrawingRecord({
      id: pageId,
      cloudId: pageId.startsWith('local_drawing_') ? null : pageId,
      title: name,
      data: pageElements,
    }))
    return false
  }
}

export async function renamePage(pageId: string, name: string): Promise<void> {
  try {
    if (!isOnline() || pageId.startsWith('local_drawing_')) throw new Error('local-first rename')
    // Mismo motivo que deletePage: el cliente Supabase del navegador no persiste en el
    // desktop. Ruteamos por la API de ops (renamePage) con authenticateDraw3.
    const res = await fetch(`/api/draw3/${pageId}/ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'human', ops: [{ kind: 'renamePage', name }] }),
    })
    if (!res.ok) throw new Error('rename page failed')
  } catch {
    const current = await getDrawData(pageId)
    await upsertLocalDrawing({
      id: pageId,
      cloudId: pageId.startsWith('local_drawing_') ? null : pageId,
      title: name,
      dataJson: JSON.stringify(current?.page_elements ?? { elements: [], files: {}, schemaVersion: 3 }),
      thumbnailPath: null,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      syncStatus: 'queued',
    })
  }
}

export async function deletePage(pageId: string): Promise<void> {
  try {
    if (!isOnline() || pageId.startsWith('local_drawing_')) throw new Error('local-first delete')
    // El cliente Supabase del navegador NO tiene sesion en el desktop (Tauri): la update
    // de is_deleted matcheaba 0 filas sin error y el borrado no persistia (reaparecia al
    // refrescar). Ruteamos por la API (authenticateDraw3: token / desktop bypass / web).
    const res = await fetch(`/api/draw3/${pageId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('delete page failed')
  } catch {
    const current = await getDrawData(pageId)
    await upsertLocalDrawing({
      id: pageId,
      cloudId: pageId.startsWith('local_drawing_') ? null : pageId,
      title: current?.name ?? 'Canvas',
      dataJson: JSON.stringify(current?.page_elements ?? { elements: [], files: {}, schemaVersion: 3 }),
      thumbnailPath: null,
      updatedAt: new Date().toISOString(),
      deletedAt: new Date().toISOString(),
      syncStatus: 'queued',
    })
  }
}

// Folder ops go through /api/draw3/folders (unified auth: token / desktop bypass /
// web session). Using the browser client here returned empty on the desktop app
// (no Supabase session) and filtered by a bogus user_id, so folders never showed.
export async function movePageToFolder(pageId: string, folderId: string | null): Promise<void> {
  const res = await fetch('/api/draw3/folders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'move', pageId, folderId }),
  })
  if (!res.ok) throw new Error('move page failed')
}

// ─── Folders ────────────────────────────────────────────────────────────────

export async function getFolders(_userId: string): Promise<DrawFolder[]> {
  try {
    const res = await fetch('/api/draw3/folders', { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json()
    return (json.folders ?? []) as DrawFolder[]
  } catch {
    return []
  }
}

export async function createFolder(name?: string): Promise<DrawFolder> {
  const res = await fetch('/api/draw3/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('create folder failed')
  const json = await res.json()
  return json.folder as DrawFolder
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
  const res = await fetch('/api/draw3/folders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'rename', id: folderId, name }),
  })
  if (!res.ok) throw new Error('rename folder failed')
}

export async function deleteFolder(folderId: string): Promise<void> {
  const res = await fetch('/api/draw3/folders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id: folderId }),
  })
  if (!res.ok) throw new Error('delete folder failed')
}
