import { planningOwner, planningError } from '@/lib/planning/server'
import { correrCerebro, respuestaError, SIN_CACHE } from '@/lib/cuartel/cerebro-servidor'
import { pedidoVoto } from '@/lib/cuartel/cerebro-pedidos'

// «Me sirvió / no me sirvió / saltar» (CEREBRO.md §2.4): la única señal de la que aprende el algoritmo. No acepta ni
// guarda tiempo visto. Devuelve la dosis ya marcada y el marcador del lazo.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    await planningOwner()
    return Response.json(await correrCerebro(pedidoVoto(await request.json().catch(() => ({})))), { headers: SIN_CACHE })
  } catch (error) { return respuestaError(error) ?? planningError(error) }
}
