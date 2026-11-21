import { planningOwner, planningError } from '@/lib/planning/server'
import { decidirMentalidad, leerMentalidad } from '@/features/contenido/servidor'

// Biblioteca fija (mentalidad, ESQUEMA §4.5b/§4.6): el palomeo del dueño y «fijar». Estante fijo; no alimenta el radar.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  try { await planningOwner(); return Response.json(await leerMentalidad(), { headers: H }) }
  catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    const b = await request.json().catch(() => ({})) as { videos?: Record<string, boolean | null>; fijar?: { video_id: string; channel_id?: string; canal?: string; titulo?: string; estante?: string; uso?: string } }
    const nuevo = b.fijar && typeof b.fijar.video_id === 'string'
      ? [{ video_id: b.fijar.video_id, channel_id: b.fijar.channel_id ?? '', canal: b.fijar.canal ?? '', capa: 'mentalidad', uso: b.fijar.uso ?? 'constancia', estante: b.fijar.estante ?? 'Fijados por ti', porque: null, nucleo: false, origen: 'fijado', titulo: b.fijar.titulo }]
      : []
    await decidirMentalidad({ videos: b.videos }, nuevo)
    return Response.json(await leerMentalidad(), { headers: H })
  } catch (error) { return planningError(error) }
}
