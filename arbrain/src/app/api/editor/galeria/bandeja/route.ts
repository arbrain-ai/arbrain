import { planningOwner, planningError } from '@/lib/planning/server'
import { subirALaBandeja } from '@/features/editor/galeria/servidor'
import { partirId } from '@/features/editor/galeria/modelo'

// El freno (autonomía v2): aprobar el post o programar la salida sube UNA tarjeta a la bandeja del dueño (Sí · No · Otro,
// push al teléfono). Esta ruta pide, nunca decide ni publica. POST { id, tipo: aprobar_post | programar, revision, para? }.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request) {
  try {
    await planningOwner()
    const b = await request.json().catch(() => null) as { id?: unknown; tipo?: unknown; revision?: unknown; para?: unknown } | null
    if (!b || !partirId(b.id) || (b.tipo !== 'aprobar_post' && b.tipo !== 'programar')) return Response.json({ error: 'Pedido inválido.' }, { status: 400, headers: H })
    try {
      const s = await subirALaBandeja(request, String(b.id), b.tipo, { revision: typeof b.revision === 'string' ? b.revision : null, para: typeof b.para === 'string' ? b.para : null })
      return Response.json({ solicitud: s }, { headers: H })
    } catch (e) { return Response.json({ error: (e as Error).message }, { status: 409, headers: H }) }
  } catch (error) { return planningError(error) }
}
