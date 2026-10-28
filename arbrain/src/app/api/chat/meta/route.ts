import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'

/**
 * La meta (`/goal`) de una conversación de Claude desde el chip del chat (27 oct 2026): pausar, reanudar o quitar
 * sin teclear comandos. Directo al daemon, como el esfuerzo: por /chat/stream un comando esperaría a que termine el
 * turno, y pausar tiene que frenar las vueltas que corren ahora. Body: { session, account?, accion }.
 */
async function alcance(session: string, account: unknown) {
  const principal = await requireChatPrincipal()
  const scope = await resolveChatConversation(principal, session, typeof account === 'string' ? account : null)
  return { session: scope.conversationId, account: scope.account, ownerId: scope.owner }
}

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams
  const session = src.get('session')?.trim() ?? ''
  if (!session || session.startsWith('sdk:')) return Response.json({ meta: null })
  let params
  try { params = await alcance(session, src.get('account')) } catch (error) { return chatAccessResponse(error) }
  try {
    const upstream = await fetch(`${await getClaudeclawUrl()}/chat/meta?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` }, signal: AbortSignal.timeout(10_000),
    })
    if (!upstream.ok) return upstreamError(upstream, 'la meta de la conversación')
    return Response.json(await upstream.json())
  } catch {
    return Response.json({ error: 'No pude alcanzar el daemon (ClaudeClaw).', code: 'DAEMON_UNREACHABLE' }, { status: 503 })
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { session?: unknown; account?: unknown; accion?: unknown } | null
  const session = typeof body?.session === 'string' ? body.session.trim() : ''
  const accion = body?.accion
  if (!session || (accion !== 'pausar' && accion !== 'reanudar' && accion !== 'quitar')) return Response.json({ error: 'Falta la conversación o la acción (pausar, reanudar, quitar).' }, { status: 400 })
  let params
  try { params = await alcance(session, body?.account) } catch (error) { return chatAccessResponse(error) }
  try {
    const upstream = await fetch(`${await getClaudeclawUrl()}/chat/meta`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, accion }), signal: AbortSignal.timeout(10_000),
    })
    if (!upstream.ok) return upstreamError(upstream, 'la meta de la conversación')
    return Response.json(await upstream.json())
  } catch {
    return Response.json({ error: 'No pude alcanzar el daemon (ClaudeClaw).', code: 'DAEMON_UNREACHABLE' }, { status: 503 })
  }
}
