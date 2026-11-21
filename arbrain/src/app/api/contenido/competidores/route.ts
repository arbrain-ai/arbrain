import { planningOwner, planningError } from '@/lib/planning/server'
import { leerCompetidores } from '@/features/contenido/embudo-servidor'

// «Competidores» en Contenido: qué vende cada canal de competencia y referentes, con precio y su modelo de negocio,
// resumido de contenido/youtube/intel/embudos/embudos.json. La foto y los suscriptores los pone la pantalla (universo).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  try {
    await planningOwner()
    const r = await leerCompetidores()
    return Response.json(r ?? { corte: null, competidores: [] }, { headers: H })
  } catch (error) { return planningError(error) }
}
