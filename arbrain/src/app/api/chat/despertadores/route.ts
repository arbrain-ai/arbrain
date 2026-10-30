import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { accountId, ChatAccessError } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'

// Despertadores pendientes de una conversación (chat vivo, 3 oct 2026). Levy los programa con su
// herramienta; aquí la web los lee para el aviso «⏰ N pendientes» y deja cancelarlos.
//   POST { chatSessionId, account }            → { despertadores }
//   POST { chatSessionId, account, cancelar }  → { ok }
// Degradado: daemon viejo o caído = lista vacía con available:false (el aviso simplemente no aparece).
export async function POST(request: Request) {
  let scope
  let cancelar: string | undefined
  try {
    const principal = await requireChatPrincipal()
    const body = await request.json() as { chatSessionId?: string; account?: string; cancelar?: string }
    if (!body.chatSessionId) throw new ChatAccessError('chatSessionId required', 400)
    if (body.cancelar !== undefined && (typeof body.cancelar !== 'string' || !body.cancelar)) throw new ChatAccessError('Invalid id', 400)
    cancelar = body.cancelar
    if (body.chatSessionId.startsWith('sdk:')) {
      if (!principal.personalOwner) throw new ChatAccessError('Forbidden', 403)
      scope = { owner: principal.id, account: accountId(body.account), conversationId: body.chatSessionId }
    } else scope = await resolveChatConversation(principal, body.chatSessionId, body.account)
  } catch (error) { return chatAccessResponse(error) }
  try {
    const response = await fetch(`${await getClaudeclawUrl()}/chat/despertadores${cancelar ? '/cancelar' : ''}`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: scope.owner, account: scope.account, chatSessionId: scope.conversationId, ...(cancelar ? { id: cancelar } : {}) }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return Response.json({ available: false, despertadores: [] }, { headers: { 'Cache-Control': 'no-store' } })
    return Response.json({ available: true, ...(await response.json()) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ available: false, despertadores: [] }, { headers: { 'Cache-Control': 'no-store' } }) }
}
