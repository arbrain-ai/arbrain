import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'

/**
 * ACK de turno recibido+guardado. El cliente lo dispara DESPUÉS de persistir
 * el par user+assistant en Supabase. El daemon, al completar un turno, espera
 * este ACK ~5s: si llega, no re-guarda ni manda push; si no llega, asume
 * desconexión (iPhone bloqueado, PWA suspendida) → guarda server-side y pushea.
 *
 * Es la inversión del diseño viejo: ya NO detectamos desconexiones (imposible
 * con sockets half-open de iOS + buffers de Vercel/ngrok) — asumimos
 * desconexión siempre y el ACK es la prueba positiva de que el cliente vive.
 */
export async function POST(request: Request) {
  // En paralelo con la auth: la URL del daemon no depende de ella.
  const claudeclawUrl = getClaudeclawUrl()
  // Misma puerta que el resto del chat: base o Auth caídas = 503 con causa, nunca 401/403 (12 oct 2026).
  try { await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }
  const turnId = body['turnId']
  if (typeof turnId !== 'string' || !turnId.trim()) {
    return new Response(JSON.stringify({ error: 'turnId required' }), { status: 400 })
  }

  try {
    const upstream = await fetch(`${await claudeclawUrl}/chat/ack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CLAUDECLAW_TOKEN}`,
      },
      body: JSON.stringify({ turnId }),
      // ACK es best-effort: si el daemon no responde rápido, su timeout de 5s
      // decide solo (guardará de más, el índice único lo absorbe).
      signal: AbortSignal.timeout(4000),
    })
    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'ClaudeClaw unreachable' }), { status: 502 })
  }
}
