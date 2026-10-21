import { NextRequest, NextResponse } from 'next/server'
import { realpath, stat, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep, extname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth-utils'
import { esEdicionCliente } from '@/lib/edicion'
import { raizWorkspace } from '@/lib/rutas-instalacion'

// Sirve imágenes locales que Levy referencia en el chat (markdown con ruta de disco).
// Mismo origen y cookie de sesión que el resto de /api: funciona en <img> (web, PWA y escritorio).
// Seguridad: solo extensiones de imagen, solo bajo la lista blanca, realpath (sin traversal ni symlinks
// hacia fuera) y nunca carpetas de credenciales ni dotfiles de secretos.

export const runtime = 'nodejs'

const EXT_MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
}
// Edición cliente: solo imágenes del workspace del alumno.
const REPO_ROOT = () => esEdicionCliente() ? raizWorkspace() : process.env.ARBRAIN_REPO_ROOT || join(homedir(), 'Developer', 'artificial-brain')
const ALLOWED_ROOTS = () => esEdicionCliente() ? [raizWorkspace()] : (process.env.LOCAL_IMAGE_ROOTS?.split(':').filter(Boolean) ?? [join(homedir(), 'Developer')])
const DENY_SEGMENTS = new Set(['.ssh', '.aws', '.gnupg', '.kube', '.docker', '.git', 'node_modules'])
const MAX_BYTES = 40 * 1024 * 1024
const REDUCE_OVER = 1024 * 1024 // 1 MB
const REDUCED_WIDTH = 1600

const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })

function underRoot(real: string, root: string) {
  return real === root || real.startsWith(root.endsWith(sep) ? root : root + sep)
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail(401, 'Unauthorized')
  if (!(await hasRole(user.id, 'owner', 'admin'))) return fail(403, 'Forbidden')

  const raw = req.nextUrl.searchParams.get('path')
  if (!raw || raw.includes('\0')) return fail(400, 'path requerido')
  if (raw.split(/[\\/]/).includes('..')) return fail(400, 'ruta no permitida')

  const ext = extname(raw).toLowerCase()
  const mime = EXT_MIME[ext]
  if (!mime) return fail(415, 'solo imágenes')

  let real: string
  try {
    real = await realpath(resolve(REPO_ROOT(), raw)) // absoluta se respeta; relativa cuelga del repo
  } catch {
    return fail(404, 'no existe')
  }
  const roots = await Promise.all(ALLOWED_ROOTS().map((r) => realpath(r).catch(() => null)))
  if (!roots.some((r) => r && underRoot(real, r))) return fail(403, 'fuera de la lista blanca')
  const segs = real.split(sep)
  if (segs.some((s) => DENY_SEGMENTS.has(s)) || basename(real).startsWith('.env')) return fail(403, 'ruta no permitida')
  if (!EXT_MIME[extname(real).toLowerCase()]) return fail(415, 'solo imágenes')

  const st = await stat(real).catch(() => null)
  if (!st?.isFile()) return fail(404, 'no existe')
  if (st.size > MAX_BYTES) return fail(413, 'demasiado grande')

  const full = req.nextUrl.searchParams.get('full') === '1'
  const canReduce = ext !== '.svg' && ext !== '.gif'
  const reduce = !full && canReduce && st.size > REDUCE_OVER
  const etag = `"${createHash('sha1').update(`${real}:${st.mtimeMs}:${st.size}:${reduce}`).digest('hex')}"`
  const headers: Record<string, string> = {
    ETag: etag,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    // SVG puede traer scripts: sin ejecución al abrirlo directo.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  }
  if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers })

  try {
    let body: Buffer
    let type = mime
    if (reduce) {
      body = await sharp(real, { failOn: 'none' })
        .rotate()
        .resize({ width: REDUCED_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
      type = 'image/webp'
    } else {
      body = await readFile(real)
    }
    return new NextResponse(new Uint8Array(body), { headers: { ...headers, 'Content-Type': type, 'Content-Length': String(body.length) } })
  } catch {
    return fail(500, 'no se pudo leer la imagen')
  }
}
