import { alDaemon, soloAppCliente } from '@/lib/daemon-local'

// Taller › Computadora en la edición cliente (T16, 29 oct 2026). Reenvía a SU daemon (server/src/cliente/computadora.ts):
// memoria con semáforo, disco libre, procesador, si se duerme sola y las 8 apps que más memoria usan. Solo lectura.
// Solo la app (cookie del secreto por instalación). En la instalación original: 404.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/computadora', { plazoMs: 15_000 })
}
