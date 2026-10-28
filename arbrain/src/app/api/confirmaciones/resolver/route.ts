import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// Resolver una confirmación con el clic de la persona (AUDITORIA I8). El secreto de confirmar lo pone este servidor
// (lo recibe de la app); ni el navegador ni el modelo lo conocen. Además se exige el origen de la app y su cookie.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = /^cf_[0-9a-f]{6,64}$/i

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { id?: unknown; decision?: unknown; alcance?: unknown; comentario?: unknown }
  if (typeof body.id !== 'string' || !ID.test(body.id)) return Response.json({ error: 'Confirmación inválida.' }, { status: 400, headers: NOCACHE })
  // Botón Play (27 oct 2026): «correr» = «Córrelo tú» (el daemon corre SU literal en una terminal visible); «siempre» =
  // guardar el patrón que calculó el daemon. El navegador nunca manda un comando ni un patrón.
  if (body.decision !== 'permitir' && body.decision !== 'rechazar' && body.decision !== 'correr') return Response.json({ error: 'Decisión inválida.' }, { status: 400, headers: NOCACHE })
  const alcance = body.alcance === 'siempre' ? 'siempre' : 'una'
  const comentario = typeof body.comentario === 'string' ? body.comentario.slice(0, 500) : undefined
  return alDaemon('/confirmaciones/resolver', { method: 'POST', confirmar: true, plazoMs: body.decision === 'correr' ? 15_000 : 8_000, body: JSON.stringify({ id: body.id, decision: body.decision, alcance, ...(comentario ? { comentario } : {}) }) })
}
