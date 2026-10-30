import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// Conectar con arbrain.ai (puente de seguimiento, 21 oct 2026): estado + vista previa exacta (GET) y
// conectar / ajustes / enviar / desconectar (POST {accion}). Conectar, ajustar y enviar llevan el secreto de la app.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACCIONES = new Set(['conectar', 'ajustes', 'enviar', 'desconectar'])

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/progreso', { plazoMs: 5_000 })
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const accion = String(body.accion ?? '')
  if (!ACCIONES.has(accion)) return Response.json({ error: 'accion: conectar, ajustes, enviar o desconectar.' }, { status: 400, headers: NOCACHE })
  const { accion: _a, ...resto } = body
  void _a
  return alDaemon(`/progreso/${accion}`, { method: 'POST', confirmar: accion !== 'desconectar', body: JSON.stringify(resto), plazoMs: 20_000 })
}
