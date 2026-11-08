import { isDesktopAuthBypassFromHeaders } from '@/lib/desktop-auth-server'
import { requireChatPrincipal } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { checkMutationOrigin, planningError } from '@/lib/planning/server'
import { NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { esEdicionCliente } from '@/lib/edicion'
import { validarOrden } from '@/features/manos/lib/encargos'
import { dirEncargos, escribirOrden, leerEncargo, leerEncargosVivos } from '@/features/manos/lib/encargos-disco'

// Encargos de las manos en vivo (5 nov 2026, Daniel: «incluso si pudieras poner un temporizador»). GET = los encargos que
// corren (y los terminados hace ≤ 15 s), solo con los campos de la línea viva del chat: id, estado, pedido, inicio,
// actualizado, ms, paso, pasos y las órdenes que acepta la franja. POST { id, orden: 'detener' | 'control' } = deja
// `<id>.detener` donde lo lee el latido del encargo (server/src/manos/encargar.ts › ordenEnDisco): corta el encargo o,
// con «control», además le deja la ventana a la persona. Las dos ediciones: cliente, solo la app (cookie del secreto por
// instalación); original, la app de escritorio o la sesión de su dueño. Se lee del disco local, sin daemon.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function acceso(request: Request | undefined, mutacion: boolean): Promise<Response | null> {
  if (esEdicionCliente()) return soloAppCliente(request, mutacion)
  try {
    if (mutacion && request) checkMutationOrigin(request)
    if (await isDesktopAuthBypassFromHeaders()) return null
    const principal = await requireChatPrincipal()
    if (!principal.owner) throw new ChatAccessError('Solo la dueña o el dueño de esta Mac ve y detiene a las manos.', 403)
    return null
  } catch (error) { return planningError(error) }
}

export async function GET() {
  const no = await acceso(undefined, false)
  if (no) return no
  try {
    return Response.json({ encargos: leerEncargosVivos(dirEncargos()) }, { headers: NOCACHE })
  } catch (error) {
    // Sin carpeta de configuración (edición cliente mal lanzada): la línea viva simplemente no sale.
    return Response.json({ encargos: [], error: error instanceof Error ? error.message : 'Sin carpeta de encargos.' }, { status: 503, headers: NOCACHE })
  }
}

export async function POST(request: Request) {
  const no = await acceso(request, true)
  if (no) return no
  const cuerpo = await request.json().catch(() => null) as unknown
  let dir: string
  try { dir = dirEncargos() } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Sin carpeta de encargos.' }, { status: 503, headers: NOCACHE })
  }
  const v = validarOrden(cuerpo, id => leerEncargo(dir, id))
  if (!v.ok) return Response.json({ error: v.error }, { status: v.status, headers: NOCACHE })
  try {
    escribirOrden(dir, v.id, v.orden)
  } catch {
    return Response.json({ error: 'No pude dejar la orden para las manos.' }, { status: 500, headers: NOCACHE })
  }
  return Response.json({ ok: true, id: v.id, orden: v.orden }, { headers: NOCACHE })
}
