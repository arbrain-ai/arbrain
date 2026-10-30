import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { accountId, ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'

/** Límites de uso del plan de UNA cuenta (2 oct 2026), para el popover de la barra de entrada.
 * Son de las cuentas de la instalación del autor: solo su identidad personal los lee. */
export async function GET(req: Request) {
  let account: string
  try {
    const principal = await requireChatPrincipal()
    if (!principal.owner) throw new ChatAccessError('Los límites del plan son de la cuenta personal.', 403)
    account = accountId(new URL(req.url).searchParams.get('account'))
  } catch (error) { return chatAccessResponse(error) }

  try {
    const CLAUDECLAW_URL = await getClaudeclawUrl()
    const upstream = await fetch(`${CLAUDECLAW_URL}/limits?account=${encodeURIComponent(account)}`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      // El daemon espera hasta 15 s al proveedor: este margen cubre ese tope.
      signal: AbortSignal.timeout(25_000),
      cache: 'no-store',
    })
    if (!upstream.ok) return upstreamError(upstream, 'los límites del plan')
    return Response.json(await upstream.json(), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'No pude alcanzar el daemon (ClaudeClaw).', code: 'DAEMON_UNREACHABLE' }, { status: 503 })
  }
}
