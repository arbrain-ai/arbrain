import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'

// Respuesta a una pregunta interactiva de Levy (AskUserQuestion).
// Proxy fino al daemon: resuelve la promesa de canUseTool y el turno continúa.
export async function POST(request: Request) {
  // En paralelo con la auth: la URL del daemon no depende de ella.
  const claudeclawUrl = getClaudeclawUrl()
  // Misma puerta que el resto del chat: base o Auth caídas = 503 con causa, nunca 401/403 (12 oct 2026).
  try { await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }

  let body: { requestId?: string; answers?: Record<string, string> } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  if (typeof body.requestId !== 'string' || !body.requestId) {
    return new Response(JSON.stringify({ error: 'requestId required' }), { status: 400 })
  }

  try {
    const upstream = await fetch(`${await claudeclawUrl}/chat/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CLAUDECLAW_TOKEN}`,
      },
      body: JSON.stringify({
        requestId: body.requestId,
        ...(body.answers && typeof body.answers === 'object' ? { answers: body.answers } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const data = await upstream.json().catch(() => ({ ok: false }))
    return new Response(JSON.stringify(data), { status: upstream.status })
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'ClaudeClaw unreachable' }),
      { status: 502 },
    )
  }
}
