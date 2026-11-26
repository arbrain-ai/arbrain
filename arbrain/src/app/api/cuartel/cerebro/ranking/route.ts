import { planningOwner, planningError } from '@/lib/planning/server'
import { leerCerebro, SIN_CACHE } from '@/lib/cuartel/cerebro-servidor'
import { idVideo } from '@/lib/cuartel/cerebro-pedidos'

// La calificación de un video (CEREBRO.md §2.2): puntaje hacia la meta, sus partes, el porqué y el minuto del oro.
// 404 = ese video aún no se ha leído. Sin `video_id` devuelve el ranking completo.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await planningOwner()
    const ranking = await leerCerebro<{ videos?: Record<string, unknown> }>('ranking')
    const id = new URL(request.url).searchParams.get('video_id')
    if (!id) return Response.json(ranking ?? { videos: {} }, { headers: SIN_CACHE })
    if (!idVideo(id)) return Response.json({ error: 'Video inválido.' }, { status: 400, headers: SIN_CACHE })
    const video = ranking?.videos?.[id]
    return video
      ? Response.json({ video_id: id, ...(video as object) }, { headers: SIN_CACHE })
      : Response.json({ error: 'Ese video aún no se ha leído.' }, { status: 404, headers: SIN_CACHE })
  } catch (error) { return planningError(error) }
}
