import { writeFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, extname, basename } from 'path'
import { UPLOADS_DIR } from './config.js'
import { logger } from './logger.js'
import { validateUrl, motivoUrlInterna, esStorageConfiable, MAX_DOWNLOAD_SIZE } from './security.js'

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
 * `fetch` que valida la URL en cada salto (SSRF): sigue hasta 5 redirecciones a mano, y cada `Location` pasa de nuevo
 * por `validateUrl` (bloquea loopback, enlaces-locales y metadatos de la nube). Así una 302 no lleva la descarga a la
 * red interna. CodeQL js/request-forgery (noche de seguridad 21→22 oct 2026).
 */
async function fetchValidado(url: string): Promise<Response> {
  let actual = url
  for (let salto = 0; salto < 5; salto++) {
    const err = validateUrl(actual)
    if (err) throw new Error(err)
    // Barrera real (no por texto): resolver el host y negar IPs internas; se salta solo el storage local de confianza.
    if (!esStorageConfiable(actual)) {
      const interna = await motivoUrlInterna(actual)
      if (interna) throw new Error(`URL blocked: ${interna}`)
    }
    const res = await fetch(actual, { redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      actual = new URL(loc, actual).href
      continue
    }
    return res
  }
  throw new Error('download blocked: too many redirects')
}

/**
 * Descarga una imagen desde una URL pública (ej: Supabase Storage) al directorio de uploads.
 * Retorna el path local del archivo descargado.
 */
export async function downloadFromUrl(url: string): Promise<string> {
  // SSRF: validar la URL Y cada salto de redirección. Antes se validaba solo el texto de la URL y luego `fetch`
  // seguía los 30x a donde dijera `Location` (127.0.0.1, 169.254…): un servidor público podía redirigir a la red
  // interna. Ahora los saltos se siguen a mano, revalidando cada destino (CodeQL js/request-forgery, noche 21→22 oct).
  const res = await fetchValidado(url)
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
