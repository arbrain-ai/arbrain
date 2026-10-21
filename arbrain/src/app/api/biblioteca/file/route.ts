import { promises as fs } from 'fs'
import path from 'path'
import { resolveLibraryFile } from '@/features/library/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Sirve un PDF/EPUB de la biblioteca personal, inline, con guarda anti path-traversal
// (resolveLibraryFile garantiza que la ruta cae DENTRO de personal/libros).
export async function GET(req: Request) {
  const rel = new URL(req.url).searchParams.get('path') || ''
  const resolved = await resolveLibraryFile(rel)
  if (!resolved) return new Response('No encontrado', { status: 404 })

  const data = await fs.readFile(resolved.full)
  const type = resolved.ext === 'pdf' ? 'application/pdf' : 'application/epub+zip'
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `inline; filename="${encodeURIComponent(path.basename(resolved.full))}"`,
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
