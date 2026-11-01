import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { accountId, ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'

/** Quitar o editar un mensaje con fotos que espera en el servidor a que Levy termine (1 nov 2026, opción B).
 *  Solo lo retira si aún no salió; nunca detiene un turno. Responde `{ retirada, estado }`. */
export async function POST(request: Request) {
  let upstreamBody
  try {
    const principal = await requireChatPrincipal()
    const body = await request.json() as { sessionId?: string; account?: string; turnId?: string }
    if (!body.sessionId || !body.turnId) throw new ChatAccessError('sessionId and turnId required', 400)
    let scope
    if (body.sessionId.startsWith('sdk:')) {
      if (!principal.personalOwner) throw new ChatAccessError('Forbidden', 403)
      scope = { owner: principal.id, account: accountId(body.account), conversationId: body.sessionId }
    } else scope = await resolveChatConversation(principal, body.sessionId)
    upstreamBody = { sessionId: scope.conversationId, ownerId: scope.owner, account: scope.account, turnId: body.turnId }
  } catch (error) { return chatAccessResponse(error) }

  try {
    const CLAUDECLAW_URL = await getClaudeclawUrl()
    const upstream = await fetch(`${CLAUDECLAW_URL}/chat/inyeccion/retirar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(10_000),
    })
    return Response.json(await upstream.json(), { status: upstream.status })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'ClaudeClaw unreachable' }, { status: 502 })
  }
}
