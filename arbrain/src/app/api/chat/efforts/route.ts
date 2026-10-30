import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { accountId, ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'

/** Alcance verificado de la petición (dueño, conversación, cuenta): lo comparten GET y POST. */
async function alcance(src: URLSearchParams): Promise<URLSearchParams> {
  const params = new URLSearchParams()
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
  return params
}

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams
  let params: URLSearchParams
  try { params = await alcance(src) } catch (error) { return chatAccessResponse(error) }
  const qs = params.toString() ? `?${params}` : ''

  try {
    const CLAUDECLAW_URL = await getClaudeclawUrl()
    const upstream = await fetch(`${CLAUDECLAW_URL}/efforts${qs}`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    })

    if (!upstream.ok) {
      return upstreamError(upstream, 'los controles de esfuerzo')
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

/** Cambia el esfuerzo (o Ultracode) de una conversación ya creada, directo al daemon (2 oct 2026).
 * Por /chat/stream el cambio se perdía en silencio si había un turno en curso.
 * Body: { session, account?, effort? | ultracode? }. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { session?: unknown; account?: unknown; effort?: unknown; ultracode?: unknown } | null
  const session = typeof body?.session === 'string' ? body.session.trim() : ''
  const effort = typeof body?.effort === 'string' ? body.effort.trim() : ''
  const ultracode = typeof body?.ultracode === 'boolean' ? body.ultracode : null
  if (!session || (!effort && ultracode === null)) return Response.json({ error: 'Falta la conversación o el esfuerzo a aplicar.' }, { status: 400 })
  let params: URLSearchParams
  try { params = await alcance(new URLSearchParams({ session, ...(typeof body?.account === 'string' && { account: body.account }) })) } catch (error) { return chatAccessResponse(error) }

  try {
    const CLAUDECLAW_URL = await getClaudeclawUrl()
    const upstream = await fetch(`${CLAUDECLAW_URL}/efforts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: params.get('session') ?? session, account: params.get('account'), ownerId: params.get('ownerId'),
        verifiedConversation: params.get('verifiedConversation') === '1', verifiedNativeOwner: params.get('verifiedNativeOwner') === '1',
        ...(ultracode !== null ? { ultracode } : { effort }),
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!upstream.ok) return upstreamError(upstream, 'el cambio de esfuerzo')
    return Response.json(await upstream.json())
  } catch {
    return Response.json({ error: 'No pude alcanzar el daemon (ClaudeClaw).', code: 'DAEMON_UNREACHABLE' }, { status: 503 })
  }
}
