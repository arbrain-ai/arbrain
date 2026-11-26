import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { planningOwner, planningError } from '@/lib/planning/server'
import { final, tipoDe } from '@/features/editor/galeria/servidor'
import { partirId } from '@/features/editor/galeria/modelo'

// Un final del proyecto (largo, vertical, 720p) por rangos, para verlo dentro de la ficha. Solo lo que está en su inventario.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await planningOwner()
    const url = new URL(request.url)
    const id = url.searchParams.get('id'), f = url.searchParams.get('f')
    if (!partirId(id) || !f) return new Response('Pedido inválido.', { status: 400 })
    const ruta = await final(id!, f)
    if (!ruta) return new Response('No está.', { status: 404 })
    const bytes = (await stat(ruta)).size
    const base = { 'Content-Type': tipoDe(ruta), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=600' }
    const rango = request.headers.get('range')?.match(/bytes=(\d*)-(\d*)/)
    if (rango) {
      const ini = rango[1] ? Number(rango[1]) : Math.max(0, bytes - Number(rango[2]))
      const fin = rango[1] && rango[2] ? Math.min(Number(rango[2]), bytes - 1) : bytes - 1
      if (ini >= bytes || ini > fin) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes}` } })
      return new Response(Readable.toWeb(createReadStream(ruta, { start: ini, end: fin })) as ReadableStream, { status: 206, headers: { ...base, 'Content-Range': `bytes ${ini}-${fin}/${bytes}`, 'Content-Length': String(fin - ini + 1) } })
    }
    return new Response(Readable.toWeb(createReadStream(ruta)) as ReadableStream, { headers: { ...base, 'Content-Length': String(bytes) } })
  } catch (error) { return planningError(error) }
}
