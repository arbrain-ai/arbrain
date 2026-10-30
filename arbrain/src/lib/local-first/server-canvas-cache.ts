import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type CanvasElements = {
  elements?: Record<string, unknown>[]
  files?: Record<string, unknown>
  schemaVersion?: number
  theme?: 'dark' | 'light' | 'mono' | 'system'
  camera?: { x: number; y: number; scale: number } | null
  settings?: Record<string, unknown>
}

export type CachedCanvasPage = {
  page_id: string
  user_id?: string | null
  name?: string | null
  page_elements?: CanvasElements | null
  agent_version?: number | null
  is_deleted?: boolean | null
  folder_id?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type CachedCanvasState = {
  ok: true
  version: 'draw3'
  page_id: string
  name: string
  agent_version: number
  schema_version: number
  element_count: number
  bounding_box: null
  elements: Record<string, unknown>[]
  files: Record<string, unknown>
  theme: 'dark' | 'light' | 'mono' | 'system'
  camera: { x: number; y: number; scale: number } | null
  updated_at: string
}

function cacheRoot() {
  if (process.env.MISSION_CONTROL_CANVAS_CACHE_DIR) {
    return process.env.MISSION_CONTROL_CANVAS_CACHE_DIR
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Business OS', 'canvas-cache')
  }

  return path.join(os.homedir(), '.business-os', 'canvas-cache')
}

function safePageId(pageId: string) {
  return pageId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function statePath(pageId: string) {
  return path.join(cacheRoot(), 'pages', `${safePageId(pageId)}.json`)
}

function indexPath() {
  return path.join(cacheRoot(), 'index.json')
}

function normalizeElements(page: CachedCanvasPage): CanvasElements {
  return page.page_elements ?? { elements: [], files: {}, schemaVersion: 3 }
}

function metadataOnly(page: CachedCanvasPage): CachedCanvasPage {
  return {
    page_id: page.page_id,
    user_id: page.user_id ?? null,
    name: page.name ?? 'Canvas',
    page_elements: { elements: [], files: {}, schemaVersion: 3 },
    agent_version: page.agent_version ?? 0,
    is_deleted: page.is_deleted ?? false,
    folder_id: page.folder_id ?? null,
    created_at: page.created_at ?? page.updated_at ?? new Date().toISOString(),
    updated_at: page.updated_at ?? page.created_at ?? new Date().toISOString(),
  }
}

function pageToState(page: CachedCanvasPage): CachedCanvasState {
  const elements = normalizeElements(page)
  const elementList = Array.isArray(elements.elements) ? elements.elements : []
  const files = elements.files && typeof elements.files === 'object' ? elements.files : {}

  return {
    ok: true,
    version: 'draw3',
    page_id: page.page_id,
    name: page.name ?? 'Canvas',
    agent_version: page.agent_version ?? 0,
    schema_version: elements.schemaVersion ?? 3,
    element_count: elementList.length,
    bounding_box: null,
    elements: elementList,
    files,
    theme: elements.theme ?? 'system',
    camera: elements.camera ?? null,
    updated_at: page.updated_at ?? page.created_at ?? new Date().toISOString(),
  }
}

async function ensureCacheDirs() {
  await mkdir(path.join(cacheRoot(), 'pages'), { recursive: true })
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

export async function writeCanvasPagesToCache(pages: CachedCanvasPage[]) {
  if (pages.length === 0) return
  await ensureCacheDirs()

  const metadata = pages.map(metadataOnly)
  await writeFile(indexPath(), JSON.stringify({ pages: metadata, updatedAt: new Date().toISOString() }), 'utf8')

  await Promise.all(pages.map(async (page) => {
    if (!page.page_id || !page.page_elements) return
    await writeFile(statePath(page.page_id), JSON.stringify(pageToState(page)), 'utf8')
  }))
}

export async function readCanvasPagesFromCache(): Promise<CachedCanvasPage[]> {
  const indexed = await readJson<{ pages?: CachedCanvasPage[] }>(indexPath())
  if (indexed?.pages?.length) return indexed.pages

  const dir = path.join(cacheRoot(), 'pages')
  if (!existsSync(dir)) return []

  const files = await readdir(dir).catch(() => [])
  const states = await Promise.all(files
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson<CachedCanvasState>(path.join(dir, file))))

  return states
    .filter((state): state is CachedCanvasState => Boolean(state?.page_id))
    .map((state) => ({
      page_id: state.page_id,
      user_id: 'local',
      name: state.name,
      page_elements: { elements: [], files: {}, schemaVersion: state.schema_version },
      agent_version: state.agent_version,
      is_deleted: false,
      folder_id: null,
      created_at: state.updated_at,
      updated_at: state.updated_at,
    }))
}

export async function writeCanvasStateToCache(page: CachedCanvasPage) {
  await ensureCacheDirs()
  await writeFile(statePath(page.page_id), JSON.stringify(pageToState(page)), 'utf8')

  const existing = await readCanvasPagesFromCache()
  const next = [metadataOnly(page), ...existing.filter((item) => item.page_id !== page.page_id)]
  await writeFile(indexPath(), JSON.stringify({ pages: next, updatedAt: new Date().toISOString() }), 'utf8')
}

export async function readCanvasStateFromCache(pageId: string): Promise<CachedCanvasState | null> {
  return readJson<CachedCanvasState>(statePath(pageId))
}
