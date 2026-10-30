import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { accountId, ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { fetchConPlazoDeCabeceras, textoConPlazo, PLAZO_LIVE_MS } from '@/lib/daemon-fetch'

// Resume de un turno EN VUELO (estilo Anthropic): si el daemon tiene un stream
// activo para la sesión, devuelve SSE con replay del buffer + tail en vivo —
// reabrir la app a mitad del streaming lo reengancha justo donde va. Si no hay
// turno vivo, responde JSON {live:false} y el cliente reconcilia desde la BD.
// Mismo techo que /api/chat/stream: el tail puede durar lo que dure el turno.
export const maxDuration = 300

export async function POST(request: Request) {
  let principal
  try { principal = await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  let scope
  try {
    if (body.cursor !== undefined && (!Number.isSafeInteger(body.cursor) || Number(body.cursor) < 0)) throw new ChatAccessError('Invalid cursor', 400)
    if (body.turnId !== undefined && (typeof body.turnId !== 'string' || !body.turnId)) throw new ChatAccessError('Invalid turnId', 400)
    const id = body['chatSessionId']
    if (typeof id !== 'string' || !id) throw new ChatAccessError('chatSessionId required', 400)
    if (id.startsWith('sdk:')) {
      if (!principal.personalOwner) throw new ChatAccessError('Forbidden', 403)
      scope = { owner: principal.id, conversationId: id, account: accountId(body.account) }
    } else scope = await resolveChatConversation(principal, id, body.account)
  } catch (error) { return chatAccessResponse(error) }

  try {
    const CLAUDECLAW_URL = await getClaudeclawUrl()
    // Plazo hasta las cabeceras (7 oct 2026): el tail puede durar lo que el turno, la espera muda no.
    const upstream = await fetchConPlazoDeCabeceras(`${CLAUDECLAW_URL}/chat/live`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CLAUDECLAW_TOKEN}`,
      },
      body: JSON.stringify({
        chatSessionId: scope.conversationId, ownerId: scope.owner, account: scope.account,
        ...(body.turnId !== undefined ? { turnId: body.turnId } : {}),
        ...(body.cursor !== undefined ? { cursor: body.cursor } : {}),
        ...(body.snapshot === true ? { snapshot: true } : {}),
        ...(body.recover === true ? { recover: true } : {}),
      }),
      signal: request.signal,
    }, PLAZO_LIVE_MS)

    const contentType = upstream.headers.get('Content-Type') ?? ''
    if (!upstream.ok || !upstream.body || !contentType.includes('text/event-stream')) {
      // {live:false} o error del daemon — passthrough JSON
      const text = await textoConPlazo(upstream, PLAZO_LIVE_MS)
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return new Response(null, { status: 499 })
    }
    // Daemon inalcanzable: para el cliente equivale a "no hay turno vivo".
    return new Response(JSON.stringify({ live: false, error: 'ClaudeClaw unreachable' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
