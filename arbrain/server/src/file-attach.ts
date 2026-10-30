/**
 * File attachment system — allows Levy to send files through Mission Control chat.
 *
 * The agent outputs {{FILE_ATTACH:/path/to/file}} markers in its response.
 * The server detects these, uploads to Supabase Storage, emits SSE events,
 * and strips the markers from the final text.
 *
 * Supported: audio (mp3, wav, webm, ogg, m4a, aac), video (mp4),
 *            documents (pdf, txt, json), images (png, jpg, gif, webp)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { STORE_DIR } from './config.js'
import { readEnvFile } from './env.js'
import { logger } from './logger.js'

const MIME_MAP: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.py': 'text/x-python',
  '.sh': 'application/x-sh',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export interface FileAttachment {
  url: string
  filename: string
  mimeType: string
  size: number
}

const FILE_ATTACH_PATTERN = /\{\{FILE_ATTACH:([^}]+)\}\}/g

/**
 * Extract {{FILE_ATTACH:/path}} markers from text.
 * Returns cleaned text (markers removed) and list of file paths.
 */
export function extractFileMarkers(text: string): { cleanText: string; paths: string[] } {
  const paths: string[] = []
  const cleanText = text
    .replace(FILE_ATTACH_PATTERN, (_, path) => {
      paths.push(path.trim())
      return ''
    })
    .replace(/\n{3,}/g, '\n\n') // collapse extra newlines left by marker removal
    .trim()
  return { cleanText, paths }
}

/**
 * Upload a local file to Mission Control's Supabase Storage (chat-audio bucket).
 * Returns the public URL and metadata.
 */
export async function uploadToStorage(localPath: string, stable?: { storageKey: string; filename: string }): Promise<FileAttachment> {
  if (!existsSync(localPath)) {
    throw new Error(`File not found: ${localPath}`)
  }

  const stat = statSync(localPath)
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${stat.size} bytes (max ${MAX_FILE_SIZE})`)
  }

  const env = readEnvFile(['MC_SUPABASE_URL', 'MC_SUPABASE_KEY'])
  const supabaseUrl = env['MC_SUPABASE_URL']
  const supabaseKey = env['MC_SUPABASE_KEY']

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing MC_SUPABASE_URL or MC_SUPABASE_KEY in .env')
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(stable ? { global: { fetch: (request: RequestInfo | URL, options?: RequestInit) => fetch(request, { ...options, signal: AbortSignal.timeout(25_000) }) } } : {}),
  })

  const ext = extname(localPath).toLowerCase()
  const mimeType = MIME_MAP[ext] ?? 'application/octet-stream'
  const filename = stable?.filename ?? basename(localPath)
  if (stable && !/^[a-f0-9]{64}$/.test(stable.storageKey)) throw new Error('Invalid attachment key')
  const storagePath = stable ? `levy/durable/${stable.storageKey}${ext}` : `levy/${Date.now()}-${filename}`

  // Route to the right bucket:
  // - chat-audio: only accepts audio/* MIME types
  // - generated-images: accepts everything (null MIME restriction)
  const isAudio = mimeType.startsWith('audio/')
  const bucket = isAudio ? 'chat-audio' : 'generated-images'

  const buffer = readFileSync(localPath)

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: !!stable,
    })

  if (error) {
    throw new Error(`Upload failed: ${error.message}`)
  }

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path)

  logger.info({ filename, mimeType, size: stat.size, url: urlData.publicUrl }, 'file uploaded to storage')

  return {
    url: urlData.publicUrl,
    filename,
    mimeType,
    size: stat.size,
  }
}


export interface StagedAttachment { localPath: string; storageKey: string; filename: string }
/** Freeze bytes before recording completion; delivery retries reuse the same object key. */
export async function stageAttachment(localPath: string, turnId: string): Promise<StagedAttachment> {
  const stat = statSync(localPath)
  if (!stat.isFile() || stat.size > MAX_FILE_SIZE) throw new Error('Attachment is unavailable or exceeds 50MB')
  const buffer = readFileSync(localPath)
  const storageKey = createHash('sha256').update(turnId).update('\0').update(buffer).digest('hex')
  const directory = join(STORE_DIR, 'chat-artifacts')
  await mkdir(directory, { recursive: true })
  const frozenPath = join(directory, `${storageKey}${extname(localPath).toLowerCase()}`)
  await writeFile(frozenPath, buffer, { flag: 'wx' }).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error })
  return { localPath: frozenPath, storageKey, filename: basename(localPath) }
}
