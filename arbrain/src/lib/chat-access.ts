import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getUserRole, RoleLookupError } from '@/lib/auth-utils'
import { isLocalDesktopUserId, LOCAL_DESKTOP_EMAIL } from '@/lib/desktop-auth'
import { ChatAccessError, conversationScope, type ChatPrincipal } from './chat-access-policy'
import { esEdicionCliente } from '@/lib/edicion'
import { esFallaDeAuth, MSJ_BASE_CAIDA } from '@/lib/infra-errores'

export async function requireChatPrincipal(): Promise<ChatPrincipal> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  // Auth caído (red o 5xx) no es «sin sesión»: 503, nunca 401 (que además manda a /login).
  if (!user && esFallaDeAuth(authError)) throw new ChatAccessError(MSJ_BASE_CAIDA, 503)
  if (!user) throw new ChatAccessError('Unauthorized', 401)
  // Edición cliente: la única persona es la dueña de la instalación (sesión de la app); no hay tabla de perfiles.
  if (esEdicionCliente()) {
    if (!isLocalDesktopUserId(user.id)) throw new ChatAccessError('Unauthorized', 401)
    return { id: user.id, personalOwner: true, owner: true }
  }
  if (isLocalDesktopUserId(user.id)) {
    // The authenticated local desktop represents Daniel, not every profile in the DB.
    const { data, error } = await createServiceClient().from('profiles').select('id').eq('email', LOCAL_DESKTOP_EMAIL).eq('role', 'owner').maybeSingle()
    if (error) throw new ChatAccessError(MSJ_BASE_CAIDA, 503)
    if (!data) throw new ChatAccessError('No se pudo verificar el propietario del escritorio.', 503)
    return { id: data.id, personalOwner: true, owner: true }
  }
  const role = await getUserRole(user.id).catch((error: unknown) => {
    if (error instanceof RoleLookupError) throw new ChatAccessError(MSJ_BASE_CAIDA, 503)
    throw error
  })
  if (role !== 'owner' && role !== 'admin') throw new ChatAccessError('Forbidden', 403)
  return { id: user.id, owner: role === 'owner', personalOwner: role === 'owner' && user.email?.toLowerCase() === LOCAL_DESKTOP_EMAIL.toLowerCase() }
}

export async function resolveChatConversation(principal: ChatPrincipal, id: string, requestedAccount?: unknown) {
  const { data, error } = await createServiceClient().from('chat_sessions').select('id, profile_id, account').eq('id', id).maybeSingle()
  if (error) throw new ChatAccessError(MSJ_BASE_CAIDA, 503)
  if (!data) throw new ChatAccessError('Conversación no encontrada.', 404)
  return conversationScope(principal, data, requestedAccount)
}

export function chatAccessResponse(error: unknown): Response {
  return Response.json({ error: error instanceof ChatAccessError ? error.message : 'No se pudo verificar el acceso al chat.' }, { status: error instanceof ChatAccessError ? error.status : 503 })
}

export function requireExpectedChatOwner(principal: ChatPrincipal, expected: unknown): void {
  if (expected === undefined) return
  if (typeof expected !== 'string' || (expected !== principal.id && !(isLocalDesktopUserId(expected) && principal.personalOwner))) {
    throw new ChatAccessError('El borrador pertenece a otra identidad. No se cambió su cuenta.', 409)
  }
}
