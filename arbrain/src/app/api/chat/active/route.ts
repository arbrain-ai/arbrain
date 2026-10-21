import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'

// Turnos EN CURSO de Daniel (1 oct 2026): una sola consulta al journal del daemon para pintar el
// semáforo de TODA la lista, en vez de un /api/chat/turn por conversación cada pocos segundos.
//   working  = Levy escribe/trabaja (queued, dispatching, running, uncertain)
//   waiting  = Levy espera tu respuesta (AskUserQuestion)
// Degradado, nunca error: si el daemon es de una versión sin /chat/active, está caído o tarda,
// responde `{ available: false }` y el cliente cae a la heurística de la fila (last_role).
export async function GET() {
  let principal
  try { principal = await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }
  const noDisponible = Response.json({ available: false, turns: [] }, { headers: { 'Cache-Control': 'no-store' } })
  try {
    const response = await fetch(`${await getClaudeclawUrl()}/chat/active`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: principal.id }),
      signal: AbortSignal.timeout(4_000),
    })
    if (!response.ok) return noDisponible
    const json = await response.json() as { turns?: unknown }
    if (!Array.isArray(json.turns)) return noDisponible
    return Response.json({ available: true, turns: json.turns }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return noDisponible }
}
