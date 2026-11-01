import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { leerPrimerArranque } from '@/features/primer-arranque/lib/estado'
import { entregarSiguiente, pausar, planActual, resumenRutinas, saltar } from '@/features/primer-arranque/lib/tour-servidor'
import { publicarCapitulo } from '@/features/primer-arranque/lib/tour-chat'

// Tour de bienvenida de Levy (1 nov 2026). Solo la app (cookie del secreto por instalación).
//   GET                                 qué toca: { plan } (null = nada que mostrar; ya lo vio)
//   POST { accion: 'siguiente', sesion? } entrega el siguiente capítulo como mensaje de Levy en esa conversación
//   POST { accion: 'pausar' | 'saltar' } saltar cuenta como visto
// La lógica y el estado viven en features/primer-arranque/lib/tour*.ts.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  try {
    return Response.json({ plan: planActual() }, { headers: NOCACHE })
  } catch (e) {
    return Response.json({ plan: null, error: e instanceof Error ? e.message : 'No pude leer el tour.' }, { status: 503, headers: NOCACHE })
  }
}

/** Las rutinas reales para el capítulo que las nombra; sin daemon, null (el capítulo dice dónde verlas). */
async function rutinasDelDaemon() {
  const r = await alDaemon('/schedule', { plazoMs: 2_000 })
  return r.ok ? resumenRutinas(await r.json()) : null
}

type Cuerpo = { accion?: unknown; sesion?: unknown }
const UUID = /^[0-9a-f-]{36}$/i

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as Cuerpo
  try {
    if (body.accion === 'pausar') return Response.json({ plan: pausar() }, { headers: NOCACHE })
    if (body.accion === 'saltar') return Response.json({ plan: saltar() }, { headers: NOCACHE })
    if (body.accion === 'siguiente') {
      const pedida = typeof body.sesion === 'string' && UUID.test(body.sesion) ? body.sesion : null
      const entrega = await entregarSiguiente({ rutinas: rutinasDelDaemon })
      if (!entrega) return Response.json({ plan: planActual(), mensaje: null }, { headers: NOCACHE })
      // Va a la conversación donde se pidió; sin ella, a la de bienvenida o a una nueva («Recorrido de Levy»).
      const r = await publicarCapitulo(entrega, pedida ?? leerPrimerArranque().sesionBienvenida)
      return Response.json({ plan: entrega.plan, sesion: r.sesion, mensaje: r.mensaje }, { headers: NOCACHE })
    }
    return Response.json({ error: 'Acción desconocida.' }, { status: 400, headers: NOCACHE })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'No pude seguir con el recorrido.' }, { status: 503, headers: NOCACHE })
  }
}
