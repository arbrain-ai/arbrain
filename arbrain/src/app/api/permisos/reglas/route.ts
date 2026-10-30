import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// «Siempre este patrón» (botón Play, 27 oct 2026): las reglas que guardó la persona desde la tarjeta del hilo, visibles
// y revocables en Ajustes › Permisos y seguridad. Ver y quitar llevan el secreto de la app (un agente no se toca sus
// propias reglas); crear solo pasa por el clic en la tarjeta.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = /^rg_[0-9a-f]{6,20}$/

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/permisos/reglas', { confirmar: true, plazoMs: 3_000 })
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { quitar?: unknown }
  if (typeof body.quitar !== 'string' || !ID.test(body.quitar)) return Response.json({ error: 'Regla inválida.' }, { status: 400, headers: NOCACHE })
  return alDaemon('/permisos/reglas/quitar', { method: 'POST', confirmar: true, body: JSON.stringify({ id: body.quitar }) })
}
