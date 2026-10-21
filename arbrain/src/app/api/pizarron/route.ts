import { planningOwner, planningError } from '@/lib/planning/server'
import { listar } from '@/lib/pizarron/servidor'

// La casa del pizarrón (7 oct 2026): sesiones anteriores y la biblioteca de objetos vivos.
export const runtime = 'nodejs'

export async function GET() {
  try {
    await planningOwner()
    return Response.json(await listar(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return planningError(error) }
}
