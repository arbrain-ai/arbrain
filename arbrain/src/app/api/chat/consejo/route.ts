import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { NOMBRE_DUENO } from '@/config'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  let ownerId: string
  try {
    const principal = await requireChatPrincipal()
    if (!principal.personalOwner) throw new ChatAccessError(`Consejo pertenece a la cuenta personal de ${NOMBRE_DUENO()}.`, 403)
    ownerId = principal.id
    const raw = await request.text()
    if (raw.length > 12_100_000) return Response.json({ error: 'Adjuntos demasiado grandes.' }, { status: 413 })
    body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ChatAccessError('Solicitud inválida.', 400)
  } catch (e) { return chatAccessResponse(e) }
  try {
    const upstream = await fetch(`${await getClaudeclawUrl()}/consejo`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, ownerId }), signal: AbortSignal.timeout(body.action === 'catalog' ? 30_000 : 15_000), cache: 'no-store',
    })
    if (upstream.status === 404) return Response.json({ error: 'Consejo aún no está instalado en este host.' }, { status: 503 })
    const result = await upstream.json()
    return Response.json(result, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'Se perdió la conexión. Recupera el turno antes de reenviar; su identidad se conserva.' }, { status: 503 }) }
}
