import { createReadStream } from 'node:fs'
import { cabecerasArchivo, ErrorArchivo, resolverArchivoChat, verificarArchivo } from '@/lib/archivos-chat-server'
import { nombreArchivo } from '@/lib/archivos-chat'

// Un archivo que Levy generó, servido por su enlace firmado (29 oct 2026, T6; lib/archivos-chat-server.ts). Sin cookie a
// propósito: lo abre el navegador del sistema (app de escritorio) o Safari (app del teléfono). La firma dice qué archivo
// y hasta cuándo; aquí se vuelve a validar contra el cerebro, las carpetas abiertas y la lista de secretos, por si algo
// cambió desde que se firmó. `?descargar=1` lo baja en vez de abrirlo.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const no = (status: number, msg: string) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

/** Flujo que tolera que el navegador cancele a medias (un video que salta), como la ruta `crudo` de la vista documento. */
function flujo(ruta: string, rango?: { start: number; end: number }): ReadableStream<Uint8Array> {
  const rs = createReadStream(ruta, rango)
  return new ReadableStream<Uint8Array>({
    start(c) {
      rs.on('data', chunk => { try { c.enqueue(chunk as Buffer); if ((c.desiredSize ?? 1) <= 0) rs.pause() } catch { rs.destroy() } })
      rs.on('end', () => { try { c.close() } catch { /* ya cancelado */ } })
      rs.on('error', e => { try { c.error(e) } catch { /* ya cancelado */ } })
    },
    pull() { rs.resume() },
    cancel() { rs.destroy() },
  })
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string; nombre: string }> }) {
  const { token, nombre } = await params
  const firmada = verificarArchivo(token)
  if (!firmada) return no(403, 'Este enlace ya venció. Vuelve al chat de Arbrain y tócalo otra vez.')
  // El nombre de la URL es solo para que el navegador proponga bien el archivo; tiene que ser el del archivo firmado
  // (así una página HTML no pide «assets» que acaben sirviendo otra cosa).
  let pedido = nombre
  try { pedido = decodeURIComponent(nombre) } catch { /* tal cual */ }
  if (pedido !== nombreArchivo(firmada) && nombre !== nombreArchivo(firmada)) return no(404, 'No existe.')
  let real: string, bytes: number
  try {
    const a = await resolverArchivoChat(firmada)
    if (a.real !== firmada) return no(403, 'No permitido.')
    real = a.real; bytes = a.bytes
  } catch (e) {
    if (e instanceof ErrorArchivo) return no(e.status, e.message)
    return no(500, 'No se pudo leer el archivo.')
  }
  const c = cabecerasArchivo(nombreArchivo(real), new URL(request.url).searchParams.get('descargar') === '1')
  const headers: Record<string, string> = {
    'Content-Type': c.tipo,
    'Content-Disposition': c.disposicion,
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Accept-Ranges': 'bytes',
  }
  if (c.csp) headers['Content-Security-Policy'] = c.csp
  const rango = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (rango && (rango[1] || rango[2])) {
    const ini = rango[1] ? Number(rango[1]) : Math.max(0, bytes - Number(rango[2]))
    const fin = rango[1] && rango[2] ? Math.min(Number(rango[2]), bytes - 1) : bytes - 1
    if (ini >= bytes || ini > fin) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes}` } })
    return new Response(flujo(real, { start: ini, end: fin }), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${ini}-${fin}/${bytes}`, 'Content-Length': String(fin - ini + 1) } })
  }
  return new Response(flujo(real), { headers: { ...headers, 'Content-Length': String(bytes) } })
}
