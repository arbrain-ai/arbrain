import { requireChatPrincipal } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { planningError } from '@/lib/planning/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { SEGUNDA_EMAIL } from '@/shared/constants/reporte-vivo'
import { DUENO, SEGUNDA } from '@/config'
import { sinRespuestaDelServidor } from '@/lib/edicion'

// Vista viva «diario» (5 oct 2026): Dinero y Lanzamiento (el dueño) o Comunidad y YouTube (la socia), leídos AL ABRIR
// la vista por el mismo script del cron (`reportes_matutinos.py --json`) en el Studio. Agenda y tareas van por
// /api/planning. El dueño ve los dos reportes; la socia, el suyo.

export const runtime = 'nodejs'
export const maxDuration = 120
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const noStore = { 'Cache-Control': 'no-store' }

async function esSegundaPersona(id: string) {
  const { data } = await createServiceClient().from('profiles').select('email').eq('id', id).maybeSingle()
  return (data?.email ?? '').toLowerCase() === SEGUNDA_EMAIL
}

export async function GET(request: Request) {
  try {
    const principal = await requireChatPrincipal()
    const q = new URL(request.url).searchParams
    const quien = q.get('quien') === SEGUNDA() ? SEGUNDA() : DUENO()
    const fecha = q.get('fecha') ?? undefined
    if (fecha && !FECHA.test(fecha)) throw new ChatAccessError('Fecha inválida.', 400)
    const permitido = principal.personalOwner || (quien === SEGUNDA() && await esSegundaPersona(principal.id))
    if (!permitido) throw new ChatAccessError('Este reporte es de otra persona.', 403)
    const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ que: 'diario', quien, fecha, fresco: q.get('fresco') === '1' }),
      signal: AbortSignal.timeout(110_000), cache: 'no-store',
    })
    const body = await res.json().catch(() => ({ error: sinRespuestaDelServidor() }))
    return Response.json(body, { status: res.status, headers: noStore })
  } catch (error) { return planningError(error) }
}
