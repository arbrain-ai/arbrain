import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { raices, verificar } from '@/lib/cabina/documento-server'
import { rutaPermitida } from '@/features/cabina/documento/ruta'
import { inyectarTema } from '@/features/cabina/documento/tema-html'
import { cspCrudo } from '@/features/cabina/documento/csp-crudo'

// Archivos de la vista «documento» servidos con su carpeta (3 oct 2026): el HTML del iframe aislado
// y sus assets relativos, imágenes y video (con Range: WebKit no reproduce mp4 sin él). Sin cookie
// (el iframe tiene origen opaco): la firma de la URL dice hasta qué carpeta se lee y hasta cuándo.

export const runtime = 'nodejs'

const TIPOS: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', ico: 'image/x-icon',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', pdf: 'application/pdf', wasm: 'application/wasm',
}
const no = (status: number, msg: string) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
/** Un archivo como flujo web que tolera que el navegador cancele a medias (un video que salta de un punto a otro cancela
 *  la petición anterior cada vez): con `Readable.toWeb` eso lanzaba «Controller is already closed» como excepción sin atrapar. */
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
const dentro = (abs: string, base: string) => abs === base || abs.startsWith(base.endsWith('/') ? base : base + '/')

export async function GET(request: Request, { params }: { params: Promise<{ token: string; ruta: string[] }> }) {
  const { token, ruta } = await params
  const alcance = verificar(token)
  if (!alcance) return no(403, 'Enlace vencido: vuelve a abrir el documento.')
  const pedida = '/' + ruta.map(decodeURIComponent).join('/')
  if (pedida.split('/').includes('..') || !dentro(pedida, alcance)) return no(403, 'Fuera de la carpeta del documento.')
  let real: string
  try { real = await realpath(pedida) } catch { return no(404, 'No existe.') }
  const r = raices()
  if (rutaPermitida(real, r) && rutaPermitida(real, { ...r, repo: await realpath(r.repo).catch(() => r.repo) })) return no(403, 'No permitido.')
  const info = await stat(real).catch(() => null)
  if (!info?.isFile()) return no(404, 'No existe.')
  const ext = real.slice(real.lastIndexOf('.') + 1).toLowerCase()
  const headers: Record<string, string> = { 'Content-Type': TIPOS[ext] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=60', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' }
  const csp = cspCrudo(ext)
  if (csp) headers['Content-Security-Policy'] = csp
  // Los .html llevan el tema de la app: se les inyecta `html[data-tema]` (convención en documento/tema-html.ts).
  if (ext === 'html' || ext === 'htm') {
    const crudo = await readFile(real, 'utf8')
    const cuerpo = inyectarTema(crudo, new URL(request.url).searchParams.get('tema'))
    return new Response(cuerpo, { headers: { ...headers, 'Content-Length': String(Buffer.byteLength(cuerpo)) } })
  }
  const rango = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (rango && (rango[1] || rango[2])) {
    const ini = rango[1] ? Number(rango[1]) : Math.max(0, info.size - Number(rango[2]))
    const fin = rango[1] && rango[2] ? Math.min(Number(rango[2]), info.size - 1) : info.size - 1
    if (ini >= info.size || ini > fin) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } })
    return new Response(flujo(real, { start: ini, end: fin }), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${ini}-${fin}/${info.size}`, 'Content-Length': String(fin - ini + 1) } })
  }
  return new Response(flujo(real), { headers: { ...headers, 'Content-Length': String(info.size) } })
}
