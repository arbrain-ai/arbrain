import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { sinRespuestaDelServidor } from '@/lib/edicion'

// Ajustes del panel derecho (6 oct 2026): qué secciones salen en el «+» y en qué orden. La config vive en el Studio
// (~/.config/arbrain/panel-ajustes.json) y la escribe una sola implementación, la del daemon
// (arbrain/server/src/cabina/panel-ajustes.ts), la misma que usa Levy con `panel {accion:"secciones"}`.
// Esta ruta solo la pide: GET lee; POST { accion: migrar | guardar | restablecer, … }.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
const ACCIONES = new Set(['migrar', 'guardar', 'restablecer'])

async function alDaemon(cuerpo: Record<string, unknown>) {
  const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
    method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ que: 'panel-ajustes', ...cuerpo }), signal: AbortSignal.timeout(10_000), cache: 'no-store',
  })
  const body = await res.json().catch(() => ({ error: sinRespuestaDelServidor() }))
  return Response.json(body, { status: res.status, headers: NO_CACHE })
}

export async function GET() {
  try { await planningOwner(); return await alDaemon({ accion: 'leer' }) }
  catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body.accion !== 'string' || !ACCIONES.has(body.accion)) return Response.json({ error: 'accion debe ser migrar, guardar o restablecer.' }, { status: 400, headers: NO_CACHE })
    const { accion, orden, ocultas, donde } = body
    return await alDaemon({ accion, orden, ocultas, donde })
  } catch (error) { return planningError(error) }
}
