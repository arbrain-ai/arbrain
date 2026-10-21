import { writeFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, extname, basename } from 'path'
import { UPLOADS_DIR } from './config.js'
import { logger } from './logger.js'
import { validateUrl, MAX_DOWNLOAD_SIZE } from './security.js'

/**
 * Construye el mensaje para Claude cuando se envía una foto.
 */
export function buildPhotoMessage(localPath: string, caption?: string): string {
  const lines = [`Analyze this image: ${localPath}`]
  if (caption) lines.push(`Caption: ${caption}`)
  return lines.join('\n')
}

/**
 * Construye el mensaje para Claude cuando se envía un documento.
 */
export function buildDocumentMessage(localPath: string, filename: string, caption?: string): string {
  const lines = [`Read and analyze this file: ${localPath} (filename: ${filename})`]
  if (caption) lines.push(`Caption: ${caption}`)
  return lines.join('\n')
}

/** Documentos que el chat web puede adjuntar (espejo de arbrain/src/features/chat/lib/adjuntos.ts). */
const EXTENSIONES_DOCUMENTO = new Set(['pdf', 'txt', 'md', 'csv', 'json', 'docx', 'xlsx', 'xls', 'pptx'])

function extensionDe(ruta: string): string {
  const m = ruta.split(/[?#]/)[0].match(/\.([A-Za-z0-9]{1,5})$/)
  return m ? m[1].toLowerCase() : ''
}

/** ¿Lo descargado es un documento (no una imagen)? */
export function esDocumento(ruta: string): boolean {
  return EXTENSIONES_DOCUMENTO.has(extensionDe(ruta))
}

/** Nombre original de un adjunto subido por el chat (`chat-<ms>-<rand>-<nombre>`). */
export function nombreOriginalDeAdjunto(ruta: string): string {
  const ultimo = ruta.split(/[?#]/)[0].split('/').pop() ?? ''
  let nombre = ultimo
  try { nombre = decodeURIComponent(ultimo) } catch { /* crudo */ }
  return nombre.replace(/^(web-\d+-)?chat-\d+-[a-z0-9]{3,8}-/, '') || nombre
}

/**
 * Mensaje para el modelo por cada adjunto descargado: imagen → «Analyze this image», documento → «Read and
 * analyze this file» con su nombre original. Read de Claude Code lee PDF nativo; Word/Excel con sus skills.
 */
export function buildAttachmentMessage(localPath: string): string {
  return esDocumento(localPath) ? buildDocumentMessage(localPath, nombreOriginalDeAdjunto(localPath)) : buildPhotoMessage(localPath)
}

/**
 * Descarga una imagen desde una URL pública (ej: Supabase Storage) al directorio de uploads.
 * Retorna el path local del archivo descargado.
 */
export async function downloadFromUrl(url: string): Promise<string> {
  // Validate URL before downloading (SSRF protection)
  const urlError = validateUrl(url)
  if (urlError) throw new Error(urlError)

  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`)

  // Check content-length before downloading body
  const contentLength = parseInt(res.headers.get('content-length') ?? '0', 10)
  if (contentLength > MAX_DOWNLOAD_SIZE) {
    throw new Error(`download blocked: file too large (${contentLength} bytes, max ${MAX_DOWNLOAD_SIZE})`)
  }

  const contentType = (res.headers.get('content-type') ?? 'image/png').split(';')[0].trim()
  const extMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  }
  // Documentos: conservan extensión y nombre original (el modelo ve «estado-de-cuenta.pdf», no «web-123.png»).
  const original = basename(new URL(url).pathname)
  const localPath = esDocumento(original)
    ? join(UPLOADS_DIR, `web-${Date.now()}-${original.replace(/[^A-Za-z0-9._-]/g, '-')}`)
    : join(UPLOADS_DIR, `web-${Date.now()}${extMap[contentType] ?? '.png'}`)

  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX_DOWNLOAD_SIZE) {
    throw new Error(`download blocked: file too large (${buffer.byteLength} bytes, max ${MAX_DOWNLOAD_SIZE})`)
  }
  writeFileSync(localPath, Buffer.from(buffer))

  logger.debug({ localPath, bytes: buffer.byteLength, url }, 'attachment downloaded from URL')
  return localPath
}

/**
 * Limpia uploads más viejos que maxAgeMs (default: 24h).
 * Llamado en startup.
 */
export function cleanupOldUploads(maxAgeMs = 24 * 60 * 60 * 1000): void {
  try {
    const now = Date.now()
    const files = readdirSync(UPLOADS_DIR)
    let cleaned = 0

    for (const file of files) {
      const filePath = join(UPLOADS_DIR, file)
      const stat = statSync(filePath)
      if (now - stat.mtimeMs > maxAgeMs) {
        unlinkSync(filePath)
        cleaned++
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned }, 'old uploads cleaned')
    }
  } catch {
    // UPLOADS_DIR puede no existir aún en primer arranque — no es error
  }
}
