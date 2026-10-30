import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'

/** Registro de modelos y proveedores del daemon (motor estándar, 2 oct 2026). Solo nombres de variables
 *  de llaves y si existen; nunca sus valores. Sin el endpoint (daemon sin reiniciar) responde 404 tal cual. */
export async function GET() {
  try {
    const principal = await requireChatPrincipal()
    if (!principal.owner) throw new ChatAccessError('Se requiere una conversación propia.', 403)
  } catch (error) { return chatAccessResponse(error) }
  try {
    const upstream = await fetch(`${await getClaudeclawUrl()}/modelos/registro`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!upstream.ok) return upstreamError(upstream, 'el registro de modelos')
    return Response.json(await upstream.json())
  } catch {
    return Response.json({ error: 'No pude alcanzar el daemon (ClaudeClaw).', code: 'DAEMON_UNREACHABLE' }, { status: 503 })
  }
}
