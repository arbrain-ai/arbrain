import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'

// «Pausar todo» (seguridad del alumno, 12 oct 2026). Pausar: el clic de la persona en la app. Reanudar: además el
// secreto de confirmar, que pone este servidor (ni el navegador ni el modelo lo conocen).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/pausa', { plazoMs: 3_000 })
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as { pausado?: unknown }
  if (typeof body.pausado !== 'boolean') return Response.json({ error: 'pausado (boolean) requerido.' }, { status: 400, headers: NOCACHE })
  return alDaemon('/pausa', { method: 'POST', confirmar: !body.pausado, body: JSON.stringify({ pausado: body.pausado }), plazoMs: 10_000 })
}
