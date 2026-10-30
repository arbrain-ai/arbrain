import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { accountId, ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'

export async function POST(request: Request) {
  let body: { chatSessionId?: string; turnId?: string; cursor?: number; account?: string }
  let scope
  try {
    const principal = await requireChatPrincipal()
    body = await request.json()
    if (!body.chatSessionId) throw new ChatAccessError('chatSessionId required', 400)
    if (body.chatSessionId.startsWith('sdk:')) {
      if (!principal.personalOwner) throw new ChatAccessError('Forbidden', 403)
      scope = { owner: principal.id, account: accountId(body.account), conversationId: body.chatSessionId }
    } else scope = await resolveChatConversation(principal, body.chatSessionId)
    if (body.cursor != null && (!Number.isSafeInteger(body.cursor) || body.cursor < 0)) throw new ChatAccessError('Invalid cursor', 400)
  } catch (error) { return chatAccessResponse(error) }
  try {
    const response = await fetch(`${await getClaudeclawUrl()}/chat/turn`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: scope.owner, account: scope.account, chatSessionId: scope.conversationId, turnId: body.turnId, cursor: body.cursor }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return upstreamError(response, 'la recuperación del turno')
    return Response.json(await response.json())
  } catch { return Response.json({ error: 'No se pudo recuperar el turno. Su ejecución no se ha reenviado.' }, { status: 503 }) }
}
