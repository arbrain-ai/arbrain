import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { planningOwner, planningError } from '@/lib/planning/server'
import { archivoDescarga, idValido } from '@/features/contenido/servidor'

// El archivo bajado, por rangos (el <video> del iPhone los exige para reproducir y adelantar).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await planningOwner()
    const url = new URL(request.url)
    const v = url.searchParams.get('v')
    if (!idValido(v)) return new Response('Video inválido.', { status: 400 })
    const a = await archivoDescarga(v)
    if (!a) return new Response('No está descargado.', { status: 404 })
    const base = { 'Content-Type': a.tipo, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600',
      ...(url.searchParams.get('guardar') ? { 'Content-Disposition': `attachment; filename="${v}${a.tipo === 'audio/mp4' ? '.m4a' : '.mp4'}"` } : {}) }
    const rango = request.headers.get('range')?.match(/bytes=(\d*)-(\d*)/)
    if (rango) {
      const ini = rango[1] ? Number(rango[1]) : Math.max(0, a.bytes - Number(rango[2]))
      const fin = rango[1] && rango[2] ? Math.min(Number(rango[2]), a.bytes - 1) : a.bytes - 1
      if (ini >= a.bytes || ini > fin) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${a.bytes}` } })
      const flujo = Readable.toWeb(createReadStream(a.ruta, { start: ini, end: fin })) as ReadableStream
      return new Response(flujo, { status: 206, headers: { ...base, 'Content-Range': `bytes ${ini}-${fin}/${a.bytes}`, 'Content-Length': String(fin - ini + 1) } })
    }
    return new Response(Readable.toWeb(createReadStream(a.ruta)) as ReadableStream, { headers: { ...base, 'Content-Length': String(a.bytes) } })
  } catch (error) { return planningError(error) }
}
