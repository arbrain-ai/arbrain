import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { cuerpoCierre } from '@/lib/computadora-cliente'

// Cerrar una app desde Taller › Computadora (T16, 29 oct 2026):
//   POST {id}                cierre amable y espera unos segundos (Mac: «quit»; Windows: taskkill sin /F)
//   POST {id, forzar: true}  forzar salida, después de que el amable no bastó (la pantalla pide una segunda confirmación)
// Solo la app, con origen propio, y el daemon exige además el secreto de la app (`confirmar`). Nunca deja cerrar Arbrain,
// claude, el sistema ni lo de otro usuario (lo decide el daemon, no esta ruta).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const c = cuerpoCierre(await request.json().catch(() => null))
  if ('error' in c) return Response.json({ error: c.error }, { status: 400, headers: NOCACHE })
  return alDaemon(c.forzar ? '/computadora/forzar' : '/computadora/cerrar', { method: 'POST', body: JSON.stringify({ id: c.id }), confirmar: true, plazoMs: 20_000 })
}
