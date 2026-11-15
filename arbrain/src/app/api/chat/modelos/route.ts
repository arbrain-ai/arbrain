import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'
import { tr } from '@/shared/i18n'

/** Registro de modelos y proveedores del daemon (motor estándar, 2 oct 2026). Solo nombres de variables
 *  de llaves y si existen; nunca sus valores. Sin el endpoint (daemon sin reiniciar) responde 404 tal cual. */
export async function GET() {
  try {
    const principal = await requireChatPrincipal()
    if (!principal.owner) throw new ChatAccessError(tr('Se requiere una conversación propia.'), 403)
  } catch (error) { return chatAccessResponse(error) }
  try {
    const upstream = await fetch(`${await getClaudeclawUrl()}/modelos/registro`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!upstream.ok) return upstreamError(upstream, tr('el registro de modelos'))
    return Response.json(await upstream.json())
  } catch {
    return Response.json({ error: tr('No pude alcanzar el daemon (ClaudeClaw).'), code: 'DAEMON_UNREACHABLE' }, { status: 503 })
  }
}
