import { planningOwner, planningError } from '@/lib/planning/server'
import { correrCerebro, respuestaError, SIN_CACHE } from '@/lib/cuartel/cerebro-servidor'
import { pedidoPreguntar } from '@/lib/cuartel/cerebro-pedidos'

// «Pregúntale al video»: Levy contesta solo con lo que dice ese transcript, con minuto y cita verificada (10 a 60 s;
// claude -p por la suscripción dentro del script).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(request: Request) {
  try {
    await planningOwner()
    return Response.json(await correrCerebro(pedidoPreguntar(await request.json().catch(() => ({})))), { headers: SIN_CACHE })
  } catch (error) { return respuestaError(error) ?? planningError(error) }
}
