import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { describirEquipo } from '@/features/cabina/panel/equipo-ua'
import { capital, NOMBRE_DUENO } from '@/config'
import { sinRespuestaDelServidor } from '@/lib/edicion'

// Bus del panel (4 oct 2026): la app reporta sus pestañas abiertas y recibe lo que Levy pide con
// `mostrar {fijar|soltar|guardar}`; responde con un acuse. La lógica vive en el daemon
// (arbrain/server/src/cabina/panel-bus.ts); esta ruta solo la pide, con la sesión de Daniel.
// 8 oct 2026: `planningOwner()` deja pasar SOLO al dueño (su cuenta personal); la sesión de otra persona (la socia) recibe 403 y nunca llega
// a ser un cliente del bus, así que jamás recibe pestañas de sus conversaciones. El usuario y el aparato los pone esta ruta con lo que
// verificó (la sesión y la petición), no el cliente.
// 14 oct 2026: `compartido` lleva el panel compartido entre aparatos (arbrain/server/src/cabina/panel-compartido.ts).

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  try {
    await planningOwner()
    checkMutationOrigin(request)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body.clientId !== 'string' || !body.clientId) return Response.json({ error: 'clientId obligatorio.' }, { status: 400, headers: NO_CACHE })
    const { clientId, etiqueta, pestanas, casa, activa, acuses, ajustesRev, dispositivo, conversacion, escribio, casaEn, compartido } = body
    const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ que: 'panel', clientId, etiqueta, pestanas, casa, activa, acuses, ajustesRev, dispositivo, conversacion, escribio, casaEn, compartido, usuario: capital(NOMBRE_DUENO()), equipo: describirEquipo(request.headers.get('user-agent'), request.headers.get('host')) }), signal: AbortSignal.timeout(8_000), cache: 'no-store',
    })
    const out = await res.json().catch(() => ({ error: sinRespuestaDelServidor() }))
    return Response.json(out, { status: res.status, headers: NO_CACHE })
  } catch (error) { return planningError(error) }
}
