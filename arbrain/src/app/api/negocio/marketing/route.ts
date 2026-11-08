import { existsSync } from 'node:fs'
import path from 'node:path'
import { planningOwner, planningError } from '@/lib/planning/server'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'
import { panelNegocioEncendido } from '@/features/negocio/embudo'
import type { RespuestaMarketing } from '@/features/negocio/marketing'
import { marketing } from '@/features/negocio/marketing-servidor'

// Tu negocio › El pulso › Marketing por canal (8 nov 2026). La semana de cada canal de YouTube (sensor diario
// marketing_canales.py) y los clics a la comunidad (link_clicks en vivo). Son cifras públicas del canal: el modo directo no
// las vela. Mismo interruptor que el panel: apagado o en la edición cliente, { activo: false }.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOCACHE = { 'Cache-Control': 'no-store' }

const RAICES = () => [process.env.BUSINESS_OS_ROOT, instalacion().raizRepoRespaldo, path.join(process.cwd(), '..')].filter(Boolean) as string[]
const raiz = () => RAICES().find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? null

export async function GET() {
  if (!panelNegocioEncendido() || esEdicionCliente()) return Response.json({ activo: false } satisfies RespuestaMarketing, { headers: NOCACHE })
  try {
    await planningOwner()
    return Response.json((await marketing(raiz())) satisfies RespuestaMarketing, { headers: NOCACHE })
  } catch (error) {
    return planningError(error)
  }
}
