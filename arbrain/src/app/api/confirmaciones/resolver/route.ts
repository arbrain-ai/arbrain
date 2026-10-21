import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// Resolver una confirmación con el clic de la persona (AUDITORIA I8). El secreto de confirmar lo pone este servidor
// (lo recibe de la app); ni el navegador ni el modelo lo conocen. Además se exige el origen de la app y su cookie.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = /^cf_[0-9a-f]{6,64}$/i

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { id?: unknown; decision?: unknown }
  if (typeof body.id !== 'string' || !ID.test(body.id)) return Response.json({ error: 'Confirmación inválida.' }, { status: 400, headers: NOCACHE })
  if (body.decision !== 'permitir' && body.decision !== 'rechazar') return Response.json({ error: 'Decisión inválida.' }, { status: 400, headers: NOCACHE })
  return alDaemon('/confirmaciones/resolver', { method: 'POST', confirmar: true, body: JSON.stringify({ id: body.id, decision: body.decision }) })
}
