import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { accountId, ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'

export async function POST(request: Request) {
  let upstreamBody
  try {
    const principal = await requireChatPrincipal()
    const body = await request.json() as { sessionId?: string; account?: string; turnId?: string }
    if (!body.sessionId) throw new ChatAccessError('sessionId required', 400)
    let scope
    if (body.sessionId.startsWith('sdk:')) {
      if (!principal.personalOwner) throw new ChatAccessError('Forbidden', 403)
      scope = { owner: principal.id, account: accountId(body.account), conversationId: body.sessionId }
    } else scope = await resolveChatConversation(principal, body.sessionId)
    upstreamBody = { sessionId: scope.conversationId, ownerId: scope.owner, account: scope.account, ...(body.turnId ? { turnId: body.turnId } : {}) }
  } catch (error) { return chatAccessResponse(error) }

  try {
    const CLAUDECLAW_URL = await getClaudeclawUrl()
    const upstream = await fetch(`${CLAUDECLAW_URL}/chat/interrupt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CLAUDECLAW_TOKEN}`,
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(10_000),
    })

    const data = await upstream.json()
    return Response.json(data, { status: upstream.status })
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'ClaudeClaw unreachable' }),
      { status: 502 },
    )
  }
}
