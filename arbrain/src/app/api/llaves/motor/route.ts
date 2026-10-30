import { alDaemon, soloAppCliente } from '@/lib/daemon-local'

// Elegir con qué habla el chat: «Mi Claude Code» (tu suscripción) o una llave. El daemon lo guarda en su configuración
// y la pantalla lo reinicia para aplicarlo.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const cuerpo = await request.json().catch(() => ({})) as { motor?: unknown }
  const motor = cuerpo.motor === 'suscripcion' || cuerpo.motor === 'llave' ? cuerpo.motor : null
  if (!motor) return Response.json({ error: 'Elige «suscripcion» o «llave».' }, { status: 400 })
  return alDaemon('/llaves/motor', { method: 'POST', body: JSON.stringify({ motor }), plazoMs: 20_000 })
}
