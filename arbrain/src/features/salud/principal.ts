import 'server-only'
import { requireChatPrincipal } from '@/lib/chat-access'
import { ChatAccessError, type ChatPrincipal } from '@/lib/chat-access-policy'
import { createClient } from '@/lib/supabase/server'

/**
 * Quién pide su salud (5 oct 2026). Salud es para CUALQUIER usuario de Arbrain, no solo dueño y admin como el chat:
 * un miembro con sesión lee y conecta lo suyo. El escritorio sigue siendo Daniel (requireChatPrincipal lo resuelve).
 */
export async function principalSalud(): Promise<ChatPrincipal> {
  try { return await requireChatPrincipal() } catch (e) {
    if (!(e instanceof ChatAccessError) || e.status !== 403) throw e
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user) throw e
    return { id: user.id, personalOwner: false, owner: false }
  }
}
