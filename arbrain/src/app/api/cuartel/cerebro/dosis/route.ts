import { planningOwner, planningError } from '@/lib/planning/server'
import { leerCerebro, SIN_CACHE } from '@/lib/cuartel/cerebro-servidor'

// La dosis del día (CEREBRO.md §2.1): de 3 a 5 videos hacia la meta, con su porqué y el minuto del oro. La arma la rutina
// `cuartel-cerebro`; aquí solo se lee. Si aún no hay, lo dice en `nota` en vez de inventar una.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await planningOwner()
    const dosis = await leerCerebro('dosis')
    return Response.json(dosis ?? { videos: [], terminaste: false, nota: 'Todavía no hay dosis: el cerebro del cuartel aún no ha leído videos.' }, { headers: SIN_CACHE })
  } catch (error) { return planningError(error) }
}
