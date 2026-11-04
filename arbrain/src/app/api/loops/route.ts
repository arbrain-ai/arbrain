import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { cuerpoAgregar } from '@/lib/loops'

// Loops de negocio (3 nov 2026, prototipo detrás de ARBRAIN_LOOPS=1 en el daemon). Reenvía a SU daemon
// (server/src/cliente/loops.ts):
//   GET                 catálogo, tus loops, corridas de 7 días y el resumen. Apagado o fuera de la app: { activo: false }
//   POST {plantilla}    agrega el loop en un clic (una rutina real, activa)
// Solo la app (cookie del secreto por instalación) y, al agregar, origen propio. En la instalación original: { activo: false }.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APAGADO = () => Response.json({ activo: false }, { headers: NOCACHE })

export async function GET() {
  if (await soloAppCliente()) return APAGADO()
  const r = await alDaemon('/loops')
  // El flag vive en el daemon: si no está encendido (404) o el daemon no responde, la pestaña no aparece.
  if (!r.ok) return APAGADO()
  return r
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const c = cuerpoAgregar(await request.json().catch(() => null))
  if ('error' in c) return Response.json({ error: c.error }, { status: 400, headers: NOCACHE })
  return alDaemon('/loops/agregar', { method: 'POST', body: JSON.stringify(c) })
}
