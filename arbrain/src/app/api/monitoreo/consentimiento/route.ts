import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// Dar o quitar el consentimiento del monitoreo. Darlo exige el secreto de la app (el modelo no puede activarlo);
// quitarlo no (apagar siempre es fácil).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { acepto?: unknown }
  if (typeof body.acepto !== 'boolean') return Response.json({ error: 'acepto debe ser true o false.' }, { status: 400, headers: NOCACHE })
  return alDaemon('/cohorte/consentimiento', { method: 'POST', confirmar: body.acepto, body: JSON.stringify({ acepto: body.acepto }) })
}
