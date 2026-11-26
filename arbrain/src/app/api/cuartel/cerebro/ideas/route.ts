import { planningOwner, planningError } from '@/lib/planning/server'
import { leerCerebro, respuestaError, SIN_CACHE } from '@/lib/cuartel/cerebro-servidor'
import { correrIdeas } from '@/lib/cuartel/ideas-servidor'
import { PEDIDO_BANCO, pedidoBanco } from '@/lib/cuartel/ideas-pedidos'

// Banco de ideas (v2, 15 nov 2026). GET: lo que pinta la pestaña (ideas vivas, lo que falta para que cada una se vaya
// sola y «Tu tipo de contenido»). POST: generar una idea desde un video, decidirla (a su backlog de youtube-os, guardar,
// fuera), firmar la hipótesis o pedir ideas nuevas de su nicho. Nada de esto publica ni le escribe a nadie.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    await planningOwner()
    try {
      return Response.json(await correrIdeas(PEDIDO_BANCO), { headers: SIN_CACHE })
    } catch {
      // Sin el script (o si falló): el banco tal como quedó en disco, sin caducidad ni hipótesis.
      return Response.json((await leerCerebro('ideas')) ?? { ideas: [] }, { headers: SIN_CACHE })
    }
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    return Response.json(await correrIdeas(pedidoBanco(await request.json().catch(() => ({})))), { headers: SIN_CACHE })
  } catch (error) { return respuestaError(error) ?? planningError(error) }
}
