import { alDaemon, soloAppCliente } from '@/lib/daemon-local'

// «Iniciar sesión con Claude» (22 oct 2026, prueba en Windows: «sácame del medio»). El daemon lanza el login OFICIAL
// de Claude Code (lo instala antes si falta) y el navegador se abre solo; Arbrain no ve la página, el código ni el token.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  return alDaemon('/llaves/suscripcion/login', { method: 'POST', body: '{}', confirmar: true, plazoMs: 20_000 })
}
