import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { esDecisionApp, ID_PEDIDO_APP } from '@/features/permisos/lib/permiso-app'

// Tarjeta de permiso por app (1 nov 2026): la decisión de la persona («siempre», «conversacion» o «no»). El secreto de
// confirmar lo pone este servidor; ni el navegador ni el modelo lo conocen. Además se exige el origen de la app.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { id?: unknown; decision?: unknown }
  if (typeof body.id !== 'string' || !ID_PEDIDO_APP.test(body.id)) return Response.json({ error: 'Pedido inválido.' }, { status: 400, headers: NOCACHE })
  if (!esDecisionApp(body.decision)) return Response.json({ error: 'Decisión inválida.' }, { status: 400, headers: NOCACHE })
  return alDaemon('/manos/apps/resolver', { method: 'POST', confirmar: true, plazoMs: 8_000, body: JSON.stringify({ id: body.id, decision: body.decision }) })
}
