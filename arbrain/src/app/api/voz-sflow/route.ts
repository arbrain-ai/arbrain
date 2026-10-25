import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// «Voz con SFlow» (Ajustes › Voz; server/src/cliente/voz-sflow.ts). Encender lleva el secreto de confirmar, que pone
// este servidor; apagar es libre.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/voz-sflow', { plazoMs: 3_000 })
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { encendido?: unknown }
  if (typeof body.encendido !== 'boolean') return Response.json({ error: 'encendido (boolean) requerido.' }, { status: 400, headers: NOCACHE })
  return alDaemon('/voz-sflow', { method: 'POST', confirmar: body.encendido, body: JSON.stringify({ encendido: body.encendido }), plazoMs: 10_000 })
}
