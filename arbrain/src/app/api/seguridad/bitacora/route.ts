import { alDaemon, soloAppCliente } from '@/lib/daemon-local'

// «Lo que hizo Levy» (seguridad del alumno, 12 oct 2026): bitácora local del daemon, ya redactada. Solo la app.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const no = await soloAppCliente()
  if (no) return no
  const limite = Math.max(1, Math.min(1000, Number(new URL(request.url).searchParams.get('limite')) || 200))
  return alDaemon(`/bitacora?limite=${limite}`, { plazoMs: 5_000 })
}
