import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { sinRespuestaDelServidor } from '@/lib/edicion'

// Archivero del panel derecho (3 oct 2026): «+ › Guardadas». La lista vive en el Studio
// (~/.config/arbrain/archivero.json) y la escribe una sola implementación, la del daemon
// (arbrain/server/src/cabina/archivero.ts), la misma que usa Levy con su herramienta.
// Esta ruta solo la pide: GET lista; POST { accion: guardar | sacar | abierta, … }.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }
const ACCIONES = new Set(['guardar', 'sacar', 'abierta'])

async function alDaemon(cuerpo: Record<string, unknown>) {
  const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
    method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ que: 'archivero', ...cuerpo }), signal: AbortSignal.timeout(15_000), cache: 'no-store',
  })
  const body = await res.json().catch(() => ({ error: sinRespuestaDelServidor() }))
  return Response.json(body, { status: res.status, headers: NO_CACHE })
}

export async function GET() {
  try { await planningOwner(); return await alDaemon({ accion: 'listar' }) }
  catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body.accion !== 'string' || !ACCIONES.has(body.accion)) return Response.json({ error: 'accion debe ser guardar, sacar o abierta.' }, { status: 400, headers: NO_CACHE })
    const { accion, id, input, nombre, conversacion } = body
    return await alDaemon({ accion, id, input, nombre, conversacion })
  } catch (error) { return planningError(error) }
}
