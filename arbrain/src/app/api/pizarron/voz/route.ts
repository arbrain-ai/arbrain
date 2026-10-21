import { checkMutationOrigin, planningOwner, planningError } from '@/lib/planning/server'
import { audio, ErrorPizarron, voz } from '@/lib/pizarron/servidor'

// La voz de Levy en el pizarrón (7 oct 2026): POST fabrica (o saca de la caché) un tramo con el tiempo de cada
// carácter; GET entrega su audio. El panel lo pide antes de que haga falta, así la latencia queda escondida.
export const runtime = 'nodejs'
export const maxDuration = 60
const NO_CACHE = { 'Cache-Control': 'no-store' }
const fallo = (e: unknown) => e instanceof ErrorPizarron ? Response.json({ error: e.message }, { status: e.status, headers: NO_CACHE }) : planningError(e)

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    const body = await request.json().catch(() => null) as { sesion?: unknown; texto?: unknown } | null
    if (!body || typeof body.sesion !== 'string' || typeof body.texto !== 'string') throw new ErrorPizarron('Se espera { sesion, texto }.')
    const r = await voz(body.sesion, body.texto)
    return Response.json({ ...r, url: `/api/pizarron/voz?sesion=${encodeURIComponent(body.sesion)}&h=${r.h}` }, { headers: NO_CACHE })
  } catch (error) { return fallo(error) }
}

export async function GET(request: Request) {
  try {
    await planningOwner()
    const q = new URL(request.url).searchParams
    const buf = await audio(q.get('sesion') ?? '', q.get('h') ?? '')
    return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(buf.length), 'Cache-Control': 'private, max-age=86400', 'Accept-Ranges': 'none' } })
  } catch (error) { return fallo(error) }
}
