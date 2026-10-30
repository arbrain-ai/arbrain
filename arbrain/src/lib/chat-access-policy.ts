import { esEspacioChat, espacioDisponible, type EspacioChat } from '@/shared/lib/espacios-chat'
import { esEdicionCliente } from '@/lib/edicion'

export type AccountId = EspacioChat
/** `owner`: permisos completos (el dueño y, desde el 4 oct 2026, la socia): conversaciones nuevas, modelo,
 * esfuerzo y catálogo. `personalOwner`: solo el dueño (por email): lo que es suyo de origen —
 * conversaciones sin `profile_id`, sesiones nativas `sdk:` de su máquina, su calendario, Live, Consejo. */
export interface ChatPrincipal { id: string; personalOwner: boolean; owner: boolean }
export interface ConversationRow { id: string; profile_id: string | null; account: string | null }
export class ChatAccessError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export function accountId(value: unknown): AccountId {
  if (value == null || value === 'default') return 'default'
  // Edición cliente: las cuentas de la instalación original (segunda cuenta de Claude, Codex) no existen.
  if (esEspacioChat(value) && !espacioDisponible(value, esEdicionCliente())) throw new ChatAccessError('Cuenta de chat no disponible en esta edición.', 400)
  if (esEspacioChat(value)) return value
  throw new ChatAccessError('Cuenta de chat desconocida.', 400)
}

/** Persisted ownership/account wins over optional client routing fields. */
export function conversationScope(principal: ChatPrincipal, row: ConversationRow, requestedAccount?: unknown) {
  if (row.profile_id ? row.profile_id !== principal.id : !principal.personalOwner) {
    throw new ChatAccessError('Conversación no encontrada.', 404)
  }
  const account = accountId(row.account)
  if (requestedAccount != null && accountId(requestedAccount) !== account) {
    throw new ChatAccessError('La cuenta enviada no coincide con la conversación. Recarga su configuración.', 409)
  }
  return { owner: row.profile_id ?? principal.id, account, conversationId: row.id }
}
