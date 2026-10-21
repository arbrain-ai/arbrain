import { alDaemon, soloAppCliente } from '@/lib/daemon-local'

// «Probar conexión» del primer arranque y de Ajustes › Llaves: un turno mínimo del daemon con la llave que tiene
// (CONTRATO-DAEMON.md › Probar conexión). La llave nunca pasa por aquí: vive en el llavero y el daemon la recibe de la app.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  return alDaemon('/llaves/probar', { method: 'POST', plazoMs: 30_000 })
}
