import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// Carpetas abiertas (seguridad del alumno, 12 oct 2026): la persona abre carpetas extra para Levy una por una. Abrir
// lleva el secreto de confirmar (lo pone este servidor); cerrar no lo necesita.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/carpetas', { plazoMs: 3_000 })
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { accion?: unknown; ruta?: unknown }
  if ((body.accion !== 'abrir' && body.accion !== 'cerrar') || typeof body.ruta !== 'string' || body.ruta.length > 1024) {
    return Response.json({ error: 'Petición inválida.' }, { status: 400, headers: NOCACHE })
  }
  return alDaemon('/carpetas', { method: 'POST', confirmar: body.accion === 'abrir', body: JSON.stringify({ accion: body.accion, ruta: body.ruta }) })
}
