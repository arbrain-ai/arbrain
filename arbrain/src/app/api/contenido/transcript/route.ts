import { planningOwner, planningError } from '@/lib/planning/server'
import { idValido, leerTranscript, pedirTranscript } from '@/features/contenido/servidor'

// Transcript a un clic: GET lo lee del corpus; POST se lo pide al sensor (`cuartel_sensor.py --transcript`) y lo devuelve.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  try {
    await planningOwner()
    const v = new URL(request.url).searchParams.get('v')
    if (!idValido(v)) return Response.json({ error: 'Video inválido.' }, { status: 400, headers: H })
    const t = await leerTranscript(v)
    return t ? Response.json(t, { headers: H }) : Response.json({ error: 'sin_transcript' }, { status: 404, headers: H })
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    const { v } = await request.json().catch(() => ({})) as { v?: string }
    if (!idValido(v)) return Response.json({ error: 'Video inválido.' }, { status: 400, headers: H })
    const ya = await leerTranscript(v)
    if (ya) return Response.json(ya, { headers: H })
    const r = await pedirTranscript(v)
    const t = await leerTranscript(v)
    if (t) return Response.json(t, { headers: H })
    const texto = r.estado === 'sin_subtitulos' ? 'Este video no tiene subtítulos en YouTube.' : `No se pudo traer: ${r.detalle ?? r.estado}`
    return Response.json({ error: texto, estado: r.estado }, { status: 502, headers: H })
  } catch (error) { return planningError(error) }
}
