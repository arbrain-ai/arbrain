import { checkMutationOrigin, planningOwner, planningError } from '@/lib/planning/server'
import { anotar, ErrorPizarron, foto, huella, leerSesion } from '@/lib/pizarron/servidor'

// Una sesión del pizarrón (7 oct 2026): GET la lee entera (o responde «sin cambios» si la huella es la misma: el panel
// sondea cada segundo mientras Levy escribe pasos); POST anota los gestos del alumno; GET ?foto= da la foto de una predicción.
export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
const fallo = (e: unknown) => e instanceof ErrorPizarron ? Response.json({ error: e.message }, { status: e.status, headers: NO_CACHE }) : planningError(e)

export async function GET(request: Request) {
  try {
    await planningOwner()
    const q = new URL(request.url).searchParams
    const id = q.get('id') ?? ''
    const f = q.get('foto')
    if (f) return new Response(new Uint8Array(await foto(id, f)), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' } })
    const h = await huella(id)
    if (q.get('huella') === h) return Response.json({ sinCambios: true, huella: h }, { headers: NO_CACHE })
    return Response.json({ ...(await leerSesion(id)), huella: h }, { headers: NO_CACHE })
  } catch (error) { return fallo(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    const body = await request.json().catch(() => null) as { id?: unknown; eventos?: unknown } | null
    if (!body || typeof body.id !== 'string' || !Array.isArray(body.eventos)) throw new ErrorPizarron('Se espera { id, eventos: [] }.')
    return Response.json({ ok: true, anotados: await anotar(body.id, body.eventos) }, { headers: NO_CACHE })
  } catch (error) { return fallo(error) }
}
