import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { cuerpoCrear } from '@/lib/rutinas-cliente'

// Taller › Rutinas en la edición cliente (T8, 29 oct 2026). Reenvía a SU daemon (server/src/cliente/rutinas.ts):
//   GET                      lista, zona horaria y aviso (por qué no correrían ahora)
//   POST {prompt, schedule}  crea una rutina activa
// Solo la app (cookie del secreto por instalación) y, al crear, origen propio. En la instalación original: 404.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const no = await soloAppCliente()
  if (no) return no
  return alDaemon('/schedule')
}

export async function POST(request: Request) {
  const no = await soloAppCliente(request, true)
  if (no) return no
  const c = cuerpoCrear(await request.json().catch(() => null))
  if ('error' in c) return Response.json({ error: c.error }, { status: 400, headers: NOCACHE })
  return alDaemon('/schedule', { method: 'POST', body: JSON.stringify(c) })
}
