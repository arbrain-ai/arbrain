/**
 * Canvas v4 — servir una imagen del disco que el lienzo referencia por RUTA (5 oct 2026).
 *
 * Los generadores (y sfmap) guardan `src: "/Users/tu-usuario/…/youtube/assets/logos/…png"`. sfmap la lee del
 * disco; el navegador no puede, y la pizarra pintaba «imagen no disponible» en cada logo del Customer
 * Journey. Esta ruta es el puente: la misma validación de la vista documento (sin `..`, symlinks
 * resueltos, reglas de credenciales) y SOLO imágenes.
 *
 * Se sirven los bytes (no una redirección a la URL firmada): la pizarra las carga con
 * `crossOrigin='anonymous'` para poder exportar PNG, y una cadena de redirecciones lo complica.
 */

import { NextResponse } from 'next/server'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { ErrorDocumento, resolverEnDisco } from '@/lib/cabina/documento-server'

export const runtime = 'nodejs'

const TIPOS: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  svg: 'image/svg+xml', avif: 'image/avif',
}
/** Un logo pesa KB; una foto, unos MB. Más que esto no es un asset de lienzo. */
const MAXIMO = 25 * 1024 * 1024

const no = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  if (!await authenticateDraw3(request)) return no(401, 'no autorizado')
  const pedida = new URL(request.url).searchParams.get('ruta') ?? ''
  let real: string
  try {
    real = (await resolverEnDisco(pedida)).real
  } catch (e) {
    return e instanceof ErrorDocumento ? no(e.status, e.message) : no(500, 'no se pudo resolver la ruta')
  }
  const tipo = TIPOS[path.extname(real).slice(1).toLowerCase()]
  if (!tipo) return no(415, 'Esa ruta no es una imagen.')
  const info = await stat(real).catch(() => null)
  if (!info?.isFile()) return no(404, 'Esa imagen ya no existe.')
  if (info.size > MAXIMO) return no(413, 'La imagen es demasiado grande para el lienzo.')

  const cuerpo = await readFile(real)
  return new NextResponse(new Uint8Array(cuerpo), {
    headers: {
      'Content-Type': tipo,
      'Content-Length': String(cuerpo.length),
      // Privada: viaja con la sesión. Corta: si el logo cambia en disco, el lienzo lo ve pronto.
      'Cache-Control': 'private, max-age=300',
      ETag: `"${info.size}-${Math.round(info.mtimeMs)}"`,
      // Un SVG abierto directo en el navegador no ejecuta nada en este origen.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
