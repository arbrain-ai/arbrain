import { planningOwner, planningError } from '@/lib/planning/server'
import { leerCerebro, SIN_CACHE } from '@/lib/cuartel/cerebro-servidor'

// Lo aprendido y el marcador (CEREBRO.md §2.5): ideas aplicadas, acierto de la dosis y los pesos. No hay horas vistas.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await planningOwner()
    return Response.json((await leerCerebro('lazo')) ?? { votos: { sirvio: 0, no_sirvio: 0 }, ideas_aplicadas: { total: 0, semana: 0 }, acierto_dosis: null }, { headers: SIN_CACHE })
  } catch (error) { return planningError(error) }
}
