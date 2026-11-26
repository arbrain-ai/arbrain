import { planningOwner, planningError } from '@/lib/planning/server'
import { ajustarDescarga, idValido, listarDescargas, pedirDescarga } from '@/features/contenido/servidor'

// Descargas con su botón (15 nov 2026, el dueño: «solo si yo decido hacerlo»): una por video, al Studio, servible al
// teléfono por /api/contenido/descargas/archivo. Se borran solas a los 30 días o tras verlas, salvo fijadas.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  try { await planningOwner(); return Response.json({ descargas: await listarDescargas() }, { headers: H }) }
  catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    const b = await request.json().catch(() => ({})) as { v?: string; titulo?: string; canal?: string; modo?: string }
    if (!idValido(b.v) || typeof b.titulo !== 'string') return Response.json({ error: 'Falta el video.' }, { status: 400, headers: H })
    const d = await pedirDescarga({ video_id: b.v, titulo: b.titulo, canal: b.canal ?? null, modo: b.modo === 'audio' ? 'audio' : 'video' })
    return Response.json({ descarga: d }, { headers: H })
  } catch (error) { return planningError(error) }
}

export async function PATCH(request: Request) {
  try {
    await planningOwner()
    const b = await request.json().catch(() => ({})) as { v?: string; fijada?: boolean; vista?: boolean; borrar?: boolean }
    if (!idValido(b.v)) return Response.json({ error: 'Video inválido.' }, { status: 400, headers: H })
    const d = await ajustarDescarga(b.v, { fijada: typeof b.fijada === 'boolean' ? b.fijada : undefined, vista: b.vista === true, borrar: b.borrar === true })
    return Response.json({ descarga: d }, { headers: H })
  } catch (error) { return planningError(error) }
}
