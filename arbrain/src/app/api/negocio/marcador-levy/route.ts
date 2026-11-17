import { planningOwner, planningError } from '@/lib/planning/server'
import { raizCerebro } from '@/lib/raiz-cerebro'
import { esEdicionCliente } from '@/lib/edicion'
import { panelNegocioEncendido } from '@/features/negocio/embudo'
import type { RespuestaMarcador } from '@/features/negocio/marcador-levy'
import { marcadorLevy } from '@/features/negocio/marketing-servidor'

// Tu negocio › Marketing › Canal de Levy: el marcador por video (9 nov 2026). Lee la foto diaria del sensor marcador_levy.py.
// Mismo interruptor y mismo criterio que /api/negocio/marketing: cifras públicas del canal, sin velo en directo.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOCACHE = { 'Cache-Control': 'no-store' }
// En la app instalada del alumno, `ARBRAIN_HOME` (lib/raiz-cerebro.ts, 16 nov 2026).
const raiz = () => raizCerebro()

export async function GET() {
  if (!panelNegocioEncendido() || esEdicionCliente()) return Response.json({ activo: false } satisfies RespuestaMarcador, { headers: NOCACHE })
  try {
    await planningOwner()
    return Response.json((await marcadorLevy(raiz())) satisfies RespuestaMarcador, { headers: NOCACHE })
  } catch (error) {
    return planningError(error)
  }
}
