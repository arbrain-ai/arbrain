/**
 * Canvas v4 — los bytes de un medio del Studio, con Range (14 oct 2026). Lo pide el reproductor del lienzo.
 *
 * GET ?m=medio:<alias>/<ruta>&v=<versión> → 206/200/416. Con sesión (la misma de toda la app). Solo las raíces de la
 * lista cerrada (lib/canvas/nervio-medios.ts); fuera de ellas, 403. Sin comodines: la URL que entrega ../route.ts ya
 * es la ruta concreta.
 */
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { ErrorMedio, resolverArchivo, responderArchivo } from '@/lib/canvas/nervio-medios'
import { esEdicionCliente } from '@/lib/edicion'

export const runtime = 'nodejs'
const no = (status: number, msg: string) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  if (!await authenticateDraw3(request)) return no(401, 'no autorizado')
  if (esEdicionCliente()) return no(404, 'No existe en esta edición.')
  const m = new URL(request.url).searchParams.get('m') ?? ''
  if (m.includes('*')) return no(400, 'Pide la ruta concreta.')
  try {
    return responderArchivo(await resolverArchivo(m), request.headers.get('range'))
  } catch (e) {
    return e instanceof ErrorMedio ? no(e.status, e.message) : no(500, 'no se pudo leer el medio')
  }
}
