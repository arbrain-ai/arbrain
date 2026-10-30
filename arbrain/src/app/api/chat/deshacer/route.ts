import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { createServiceClient } from '@/lib/supabase/service'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'

// POST /api/chat/deshacer   body: { turnId, accion: 'vista' | 'deshacer' | 'rehacer', respaldoId? }
//
// «Deshacer desde aquí» (27 oct 2026): los archivos que Levy cambió vuelven a como estaban antes de ese mensaje
// (checkpoint de archivos del SDK, server/src/chat-runtime/deshacer.ts). La conversación se resuelve por el turno
// (la fila del mensaje lleva metadata.turnId) y se verifica el dueño como en el resto del chat. `vista` no toca nada.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  let body: { turnId?: unknown; accion?: unknown; respaldoId?: unknown }
  let scope
  try {
    const principal = await requireChatPrincipal()
    body = await request.json().catch(() => ({}))
    if (typeof body.turnId !== 'string' || !UUID.test(body.turnId)) throw new ChatAccessError('turnId inválido', 400)
    if (!['vista', 'deshacer', 'rehacer'].includes(String(body.accion))) throw new ChatAccessError('accion inválida', 400)
    const { data, error } = await createServiceClient().from('chat_messages').select('session_id').eq('metadata->>turnId', body.turnId).limit(1).maybeSingle()
    if (error) throw new ChatAccessError('No se pudo leer la conversación.', 503)
    if (!data?.session_id) throw new ChatAccessError('No encontré ese mensaje.', 404)
    scope = await resolveChatConversation(principal, String(data.session_id))
  } catch (error) { return chatAccessResponse(error) }

  const rehacer = body.accion === 'rehacer'
  if (rehacer && (typeof body.respaldoId !== 'string' || !UUID.test(body.respaldoId))) return Response.json({ ok: false, error: 'respaldoId inválido' }, { status: 400 })
  try {
    const response = await fetch(`${await getClaudeclawUrl()}/chat/${rehacer ? 'rehacer' : 'deshacer'}`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: scope.owner, account: scope.account, chatSessionId: scope.conversationId, turnId: body.turnId, respaldoId: body.respaldoId, dryRun: body.accion === 'vista' }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await response.json().catch(() => ({ ok: false, error: 'Respuesta ilegible del servidor de Levy.' }))
    return Response.json(data, { status: response.ok ? 200 : response.status })
  } catch {
    return Response.json({ ok: false, error: 'No pude hablar con el servidor de Levy. No se tocó ningún archivo.' }, { status: 503 })
  }
}
