import { planningOwner, planningError } from '@/lib/planning/server'
import { canalValido, leerFichaCanal } from '@/features/contenido/servidor'

// «Ir al canal» dentro de Arbrain (youtube.com está bloqueado en horas de foco): sus últimos largos y sus mejores
// outliers del año, desde cuartel.db en solo lectura. ESQUEMA §8.4.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  try {
    await planningOwner()
    const q = new URL(request.url).searchParams
    const id = q.get('id') ?? q.get('c')
    if (!canalValido(id)) return Response.json({ error: 'Canal inválido.' }, { status: 400, headers: H })
    const f = await leerFichaCanal(id)
    return f ? Response.json(f, { headers: H }) : Response.json({ error: 'canal_desconocido' }, { status: 404, headers: H })
  } catch (error) { return planningError(error) }
}
