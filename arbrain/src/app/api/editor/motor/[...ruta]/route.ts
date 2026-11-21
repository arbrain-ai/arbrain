import { checkMutationOrigin, planningError, planningOwner } from '@/lib/planning/server'
import { alMotor, CABECERAS_IDA, CABECERAS_VUELTA, rutaPermitida } from '@/lib/editor/motor'

// El editor habla con el motor por aquí (19 nov 2026): exige la sesión del dueño, pone el token del lado del servidor y
// reenvía en loopback. El video pasa con sus rangos HTTP (el <video> los pide para reproducir y adelantar).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOPE_CUERPO = 2_000_000

async function reenviar(request: Request, ruta: string[], metodo: string) {
  try {
    await planningOwner()
    if (metodo !== 'GET' && metodo !== 'HEAD') checkMutationOrigin(request)
    const segmentos = ruta.map(s => decodeURIComponent(s))
    if (!rutaPermitida(metodo === 'HEAD' ? 'GET' : metodo, segmentos)) {
      return Response.json({ error: { code: 'no_permitida', message: 'Esa ruta del motor no está abierta para el editor.' } }, { status: 404 })
    }
    const url = new URL(request.url)
    const headers = new Headers()
    for (const h of CABECERAS_IDA) { const v = request.headers.get(h); if (v) headers.set(h, v) }
    let body: ArrayBuffer | undefined
    if (metodo !== 'GET' && metodo !== 'HEAD') {
      body = await request.arrayBuffer()
      if (body.byteLength > TOPE_CUERPO) return Response.json({ error: { code: 'muy_grande', message: 'Pedido demasiado grande.' } }, { status: 413 })
    }
    const res = await alMotor(`/${segmentos.join('/')}${url.search}`, { method: metodo, headers, body, signal: request.signal })
    const vuelta = new Headers({ 'Cache-Control': 'no-store' })
    for (const h of CABECERAS_VUELTA) { const v = res.headers.get(h); if (v) vuelta.set(h, v) }
    return new Response(metodo === 'HEAD' ? null : res.body, { status: res.status, headers: vuelta })
  } catch (error) {
    const e = error as NodeJS.ErrnoException
    if (e?.code === 'ENOENT' || /fetch failed|ECONNREFUSED/.test(String(e?.message ?? e) + String((e as { cause?: unknown })?.cause ?? ''))) {
      return Response.json({ error: { code: 'motor_apagado', message: 'El motor del editor no responde. Levy lo levanta con su servicio (com.levy.editor-motor).' } }, { status: 503 })
    }
    return planningError(error)
  }
}

type Ctx = { params: Promise<{ ruta: string[] }> }
export async function GET(request: Request, { params }: Ctx) { return reenviar(request, (await params).ruta, 'GET') }
export async function HEAD(request: Request, { params }: Ctx) { return reenviar(request, (await params).ruta, 'HEAD') }
export async function POST(request: Request, { params }: Ctx) { return reenviar(request, (await params).ruta, 'POST') }
export async function PUT(request: Request, { params }: Ctx) { return reenviar(request, (await params).ruta, 'PUT') }
