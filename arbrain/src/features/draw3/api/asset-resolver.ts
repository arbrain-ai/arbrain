/**
 * Asset resolver — convert any image source (local path, URL, base64) into
 * a stable bucket URL stored in `generated-images` Supabase Storage.
 *
 * Used by:
 * - api/draw3/[id]/ops with insertImage op
 * - api/draw3/[id]/assets endpoint
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'generated-images'
const PREFIX = 'canvas'

export interface ResolvedAsset {
  url: string
  width: number
  height: number
  mimeType: string
}

/**
 * Resolves any source string to a permanent bucket URL.
 *
 * Supported sources:
 *   - https://... or http://... → return as-is (NO upload)
 *   - data:image/...;base64,... → upload to bucket
 *   - file:///abs/path → upload
 *   - imagenes/portada.png (relative to repo root) → upload
 *   - /Users/.../file.png (absolute path) → upload
 */
export async function resolveImageSource(
  source: string,
  supabase: SupabaseClient,
): Promise<ResolvedAsset> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return { url: source, width: 0, height: 0, mimeType: 'image/*' }
  }

  let buffer: Buffer
  let mimeType = 'image/png'
  let baseName = 'image'

  if (source.startsWith('data:')) {
    const match = source.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) throw new Error('Invalid data URL')
    mimeType = match[1]
    buffer = Buffer.from(match[2], 'base64')
    const ext = mimeType.split('/')[1] || 'png'
    baseName = `pasted-${Date.now()}.${ext}`
  } else {
    const { existsSync, readFileSync } = await import('node:fs')
    const { resolve, basename, extname } = await import('node:path')
    const cwd = process.cwd()
    const repoRoot = cwd.endsWith('/arbrain')
      ? resolve(/*turbopackIgnore: true*/ cwd, '..')
      : cwd

    // path: relative to repo root or absolute
    const cleaned = source.startsWith('file://') ? source.slice(7) : source
    const candidates = cleaned.startsWith('/')
      ? [cleaned]
      : [
          resolve(/*turbopackIgnore: true*/ repoRoot, cleaned),
          resolve(/*turbopackIgnore: true*/ cwd, cleaned),
        ]
    let path: string | null = null
    for (const c of candidates) {
      if (existsSync(c)) { path = c; break }
    }
    if (!path) {
      throw new Error(`Image not found at any of: ${candidates.join(', ')}`)
    }
    buffer = readFileSync(path)
    baseName = basename(path)
    const ext = extname(path).toLowerCase()
    mimeType = mimeFromExt(ext)
  }

  // Read image dimensions from buffer
  const dims = readImageDimensions(buffer, mimeType)

  // Upload to bucket
  const ts = Date.now()
  const objectPath = `${PREFIX}/${ts}-${sanitizeName(baseName)}`
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buffer, {
      contentType: mimeType,
      cacheControl: '31536000',
      upsert: false,
    })
  if (uploadErr) {
    throw new Error(`Upload failed: ${uploadErr.message}`)
  }
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath)
  return {
    url: urlData.publicUrl,
    width: dims.width,
    height: dims.height,
    mimeType,
  }
}

function mimeFromExt(ext: string): string {
  switch (ext) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.webp': return 'image/webp'
    case '.gif': return 'image/gif'
    case '.svg': return 'image/svg+xml'
    default: return 'application/octet-stream'
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
}

/**
 * Parse image dimensions from raw bytes for PNG/JPEG/WebP/GIF without external deps.
 */
function readImageDimensions(buf: Buffer, mime: string): { width: number; height: number } {
  if (mime === 'image/png' && buf.length >= 24) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (mime === 'image/gif' && buf.length >= 10) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }
  if (mime === 'image/jpeg') {
    let i = 2
    while (i < buf.length) {
      if (buf[i] !== 0xff) break
      const marker = buf[i + 1]
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) }
      }
      i += 2 + buf.readUInt16BE(i + 2)
    }
  }
  if (mime === 'image/webp' && buf.length >= 30) {
    // VP8 / VP8L / VP8X
    const fourcc = buf.subarray(12, 16).toString('ascii')
    if (fourcc === 'VP8 ' && buf.length >= 30) {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      }
    }
    if (fourcc === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24]
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      }
    }
    if (fourcc === 'VP8X' && buf.length >= 30) {
      return {
        width: 1 + (buf.readUIntLE(24, 3)),
        height: 1 + (buf.readUIntLE(27, 3)),
      }
    }
  }
  return { width: 800, height: 600 }
}
