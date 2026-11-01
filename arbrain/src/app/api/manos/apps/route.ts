import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// Permiso por app (1 nov 2026): GET = las apps en «siempre» y las tarjetas que esperan; POST { quitar, nombre } = sacar
// una app de «siempre» (la próxima vez vuelve a preguntar). Solo la app de la edición del alumno.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/manos/apps', { plazoMs: 3_000 })
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { quitar?: unknown; nombre?: unknown }
  if (typeof body.quitar !== 'string' || !body.quitar.trim() || body.quitar.length > 160) return Response.json({ error: 'App inválida.' }, { status: 400, headers: NOCACHE })
  return alDaemon('/manos/apps/quitar', { method: 'POST', plazoMs: 5_000, body: JSON.stringify({ clave: body.quitar, ...(typeof body.nombre === 'string' ? { nombre: body.nombre.slice(0, 80) } : {}) }) })
}
