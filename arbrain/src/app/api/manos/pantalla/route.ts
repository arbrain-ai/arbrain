import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { pantallaVirtualServidor } from '@/features/permisos/lib/pantalla-server'

// Pantalla virtual del modo servidor (1 nov 2026; docs/builds/modo-servidor-2026-11-01/pantalla-virtual.md): estado de la
// pantalla donde trabaja Levy (encendida, memoria, minutos sin uso). Solo mirar; solo la sesión de la app (la cookie
// que se obtiene con el código de un solo uso o la contraseña). La pide la vista `/pantalla`. No la enciende.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  if (!pantallaVirtualServidor()) return Response.json({ instalada: false }, { headers: NOCACHE })
  return alDaemon('/pantalla/estado', { plazoMs: 12_000 })
}
