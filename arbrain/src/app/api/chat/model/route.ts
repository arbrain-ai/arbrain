import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { accountId, ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams
  const params = new URLSearchParams()
  try {
    const principal = await requireChatPrincipal()
    const session = src.get('session')
    if (session && !session.startsWith('sdk:')) {
      const scope = await resolveChatConversation(principal, session, src.get('account'))
      params.set('session', scope.conversationId)
      params.set('account', scope.account)
      params.set('ownerId', scope.owner)
      params.set('verifiedConversation', '1')
    } else {
      if (session?.startsWith('sdk:') ? !principal.personalOwner : !principal.owner) throw new ChatAccessError('Se requiere una conversación propia.', 403)
      if (session) params.set('session', session)
      if (session?.startsWith('sdk:')) params.set('verifiedNativeOwner', '1')
      params.set('account', accountId(src.get('account')))
      params.set('ownerId', principal.id)
    }
  } catch (error) { return chatAccessResponse(error) }
  const qs = params.toString() ? `?${params}` : ''

  try {
    const CLAUDECLAW_URL = await getClaudeclawUrl()
    const upstream = await fetch(`${CLAUDECLAW_URL}/model${qs}`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    })

    if (!upstream.ok) {
      return upstreamError(upstream, 'el modelo de la conversación')
    }

    const data = await upstream.json()
    return Response.json(data)
  } catch {
    return Response.json(
      { error: 'No pude alcanzar el daemon (ClaudeClaw).', code: 'DAEMON_UNREACHABLE' },
      { status: 503 },
    )
  }
}
