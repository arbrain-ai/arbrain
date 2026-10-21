import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { variante } from '@/lib/imagenes/optimizar'

// Variante optimizada de una imagen (5 oct 2026): `/api/imagen/<hash del contenido>/<ancho>.<avif|webp>`.
// La URL cambia si cambia el archivo, así que se cachea para siempre. Sin cookie a propósito: termina en .avif/.webp
// y el proxy no la toca (cada imagen sin el viaje de la sesión); el hash solo lo reparte una ruta que ya autorizó.

export const runtime = 'nodejs'

const TIPO = { avif: 'image/avif', webp: 'image/webp' } as const
const no = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request, { params }: { params: Promise<{ hash: string; archivo: string }> }) {
  const { hash, archivo } = await params
  const m = /^(\d{2,5})\.(avif|webp)$/.exec(archivo)
  if (!m) return no(404)
  const formato = m[2] as keyof typeof TIPO
  const etag = `"${hash}-${m[1]}-${formato}"`
  const headers = {
    'Content-Type': TIPO[formato],
    // private: son imágenes del dueño; nada de cachés compartidas en medio.
    'Cache-Control': 'private, max-age=31536000, immutable',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  const ruta = await variante(hash, Number(m[1]), formato).catch(() => null)
  if (!ruta) return no(404)
  const info = await stat(ruta)
  return new Response(Readable.toWeb(createReadStream(ruta)) as ReadableStream, { headers: { ...headers, 'Content-Length': String(info.size) } })
}
