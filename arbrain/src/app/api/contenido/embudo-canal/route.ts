import { planningOwner, planningError } from '@/lib/planning/server'
import { canalValido } from '@/features/contenido/servidor'
import { leerEmbudoCanal } from '@/features/contenido/embudo-servidor'

// «Su embudo» de un canal para su ficha: qué vende, su regalo, a dónde manda sus videos, su promesa y su vehículo,
// resumido de contenido/youtube/intel/embudos/embudos.json. `{ embudo: null }` = ese canal aún no tiene ficha de embudo.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  try {
    await planningOwner()
    const id = new URL(request.url).searchParams.get('id')
    if (!canalValido(id)) return Response.json({ error: 'Canal inválido.' }, { status: 400, headers: H })
    return Response.json({ embudo: await leerEmbudoCanal(id) }, { headers: H })
  } catch (error) { return planningError(error) }
}
