import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { accountId } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'

/** Catálogo de comandos de la paleta «/»: lo que el SDK de Claude Code expone (nativos, skills,
 * plugins, agentes) más los modos y comandos locales de Arbrain. El daemon lo cachea. */
export async function GET(req: Request) {
  const src = new URL(req.url).searchParams
  const params = new URLSearchParams()
  try {
    const principal = await requireChatPrincipal()
    if (!principal.owner) return Response.json({ error: 'Se requiere una sesión propia.' }, { status: 403 })
    params.set('account', accountId(src.get('account')))
    params.set('ownerId', principal.id)
  } catch (error) { return chatAccessResponse(error) }

  try {
    const CLAUDECLAW_URL = await getClaudeclawUrl()
    const upstream = await fetch(`${CLAUDECLAW_URL}/commands?${params}`, {
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (!upstream.ok) return upstreamError(upstream, 'el catálogo de comandos')
    return Response.json(await upstream.json())
  } catch {
    return Response.json(
      { error: 'No pude alcanzar el daemon (ClaudeClaw).', code: 'DAEMON_UNREACHABLE' },
      { status: 503 },
    )
  }
}
