import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { sinRespuestaDelServidor } from '@/lib/edicion'
import { tr } from '@/shared/i18n'

// Ajustes › Mejoras: un interruptor por mejora opcional. Los guarda el daemon (server/src/cliente/mejoras.ts, junto a
// panel-ajustes.json) para que valgan en todas las ventanas y en el teléfono. GET lee; POST { mejoras: { id: bool } }.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

async function alDaemon(cuerpo: Record<string, unknown>) {
  const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
    method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ que: 'mejoras', ...cuerpo }), signal: AbortSignal.timeout(10_000), cache: 'no-store',
  })
  const body = await res.json().catch(() => ({ error: tr(sinRespuestaDelServidor()) }))
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
    if (!body || !body.mejoras || typeof body.mejoras !== 'object') return Response.json({ error: tr('Faltan las mejoras.') }, { status: 400, headers: NO_CACHE })
    return await alDaemon({ accion: 'guardar', mejoras: body.mejoras })
  } catch (error) { return planningError(error) }
}
