import { alDaemon, soloAppCliente } from '@/lib/daemon-local'

// Motor «Mi Claude Code» (21 oct 2026): ¿hay Claude Code con tu sesión de suscripción? El daemon corre
// `claude auth status` y devuelve solo si hay sesión, el método y el plan; nunca un token ni el correo.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const no = await soloAppCliente()
  if (no) return no
  const fresco = new URL(request.url).searchParams.get('fresco') === '1'
  return alDaemon(`/llaves/suscripcion${fresco ? '?fresco=1' : ''}`, { plazoMs: 20_000 })
}
