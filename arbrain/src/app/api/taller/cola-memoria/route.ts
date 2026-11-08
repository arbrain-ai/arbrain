import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// Taller › Agentes › En cola por memoria (5 nov 2026). Reenvía a SU daemon (server/src/cliente/cola-memoria.ts):
//   GET                              la cola (lo que espera aire, en orden) y la memoria libre contra el umbral
//   POST {accion:'mover', id, posicion}   cambiar el orden (0 = primero)
//   POST {accion:'forzar', id}            «Lanzar ya» aunque no haya aire
// Solo la app (cookie del secreto por instalación). En la instalación original: 404 (la cola está apagada ahí).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/cola-memoria', { plazoMs: 10_000 })
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const b = (await request.json().catch(() => null)) as { accion?: unknown; id?: unknown; posicion?: unknown } | null
  const id = typeof b?.id === 'string' && /^cm_[0-9a-f]{12}$/.test(b.id) ? b.id : null
  if (!id) return Response.json({ error: 'Falta el encargo.' }, { status: 400, headers: NOCACHE })
  if (b?.accion === 'mover' && Number.isFinite(Number(b.posicion))) return alDaemon('/cola-memoria/mover', { method: 'POST', body: JSON.stringify({ id, posicion: Number(b.posicion) }), plazoMs: 10_000 })
  if (b?.accion === 'forzar') return alDaemon('/cola-memoria/forzar', { method: 'POST', body: JSON.stringify({ id }), plazoMs: 10_000 })
  return Response.json({ error: 'Acción desconocida.' }, { status: 400, headers: NOCACHE })
}
