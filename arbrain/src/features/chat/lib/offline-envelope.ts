import { esEspacioChat, type EspacioChat } from '@/shared/lib/espacios-chat'
import { EntregaTransitoria, esStatusTransitorio } from './reintento-envios'
import { tr } from '@/shared/i18n'

/** Effective options captured from /selection, retained unchanged until ACK.
 * Scope and current availability are revalidated by the authenticated host. */
export interface ChatIntent {
  version: 1
  owner: string
  account: EspacioChat
  conversationId: string | null
  model: string
  effort: string | null
  fast: boolean
  ultracode: boolean
  observedAt: string
}
export interface OfflineChatEnvelope {
  version: 1 | 2
  expectedOwnerId: string
  chatSessionId: string
  turnId: string
  account: EspacioChat
  message: string
  source: 'mobile' | 'desktop'
  effort?: string
  intent?: ChatIntent
  context?: string
  liveWorkspace?: boolean
  audioUrl?: string
  imageUrl?: string
  editOriginalText?: string
  editTurnId?: string
  editOccurrenceFromEnd?: number
  createConversation?: boolean
}

export function offlineEnvelope(value: unknown): OfflineChatEnvelope {
  const envelope = value as OfflineChatEnvelope | null
  if (!envelope || ![1, 2].includes(envelope.version) || !envelope.expectedOwnerId || !envelope.chatSessionId || !envelope.turnId || !envelope.message?.trim()
    || !esEspacioChat(envelope.account) || !['mobile', 'desktop'].includes(envelope.source)) {
    throw new Error(tr('Este borrador no conserva identidad suficiente para enviarse automáticamente. Su texto sigue guardado; recupera el borrador en la conversación correcta.'))
  }
  return envelope
}

export function confirmedDraftPayload(payloadJson: string, localOwner: string, intent: ChatIntent): string {
  const payload = JSON.parse(payloadJson)
  const envelope = offlineEnvelope(payload?.localContext?.chatEnvelope)
  if (envelope.expectedOwnerId !== localOwner || intent.account !== envelope.account || intent.conversationId !== envelope.chatSessionId) throw new Error(tr('La selección no pertenece al borrador.'))
  if (envelope.intent) throw new Error(tr('El borrador ya tiene una selección; no se puede sustituir al reintentar.'))
  if (intent.version !== 1 || !intent.owner || !intent.model || !(intent.effort === null || typeof intent.effort === 'string') || typeof intent.fast !== 'boolean' || typeof intent.ultracode !== 'boolean' || !Number.isFinite(Date.parse(intent.observedAt))) throw new Error(tr('La selección está incompleta.'))
  payload.localContext.chatEnvelope = { ...envelope, version: 2, intent }
  return JSON.stringify(payload)
}

/** An ACK means durable acceptance, not inference completion. Retrying this
 * exact envelope after a lost ACK cannot create another turn. */
export class ChatDraftNoLongerPending extends Error {}
// Sin plazo, un servidor colgado congelaba el reenvío de la cola para siempre (7 oct 2026): el ciclo quedaba
// «corriendo» y el borrador de Daniel en 0 intentos. Vencido el plazo, el borrador queda fallido y se reintenta con
// el mismo turnId (el servidor deduplica), nunca se duplica ni se pierde.
const DISPATCH_TIMEOUT_MS = 45_000

export async function deliverOfflineChat(value: unknown, request: typeof fetch = fetch, canDispatch?: () => Promise<boolean>): Promise<string> {
  const envelope = offlineEnvelope(value)
  const check = async () => { if (canDispatch && !await canDispatch()) throw new ChatDraftNoLongerPending(tr('El borrador ya no está pendiente.')) }
  await check()
  if (envelope.version === 2 && !envelope.intent) throw new Error(tr('El mensaje está guardado. Confirma su modelo y esfuerzo antes de enviarlo.'))
  if (envelope.message.trimStart().startsWith('/')) throw new Error(tr('El comando sigue guardado. Su ejecución offline requiere el controlador de comandos duradero.'))
  // Sin red, plazo vencido o 5xx/429: falla pasajera (se reintenta sola, reintento-envios.ts). 4xx: decisión humana.
  const pedir = async (url: string, body: unknown): Promise<Response> => {
    let response: Response
    try {
      response = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS), body: JSON.stringify(body) })
    } catch (error) {
      const name = (error as { name?: string } | null)?.name
      throw new EntregaTransitoria(name === 'TimeoutError' || name === 'AbortError' ? tr('Arbrain no respondió a tiempo.') : tr('Sin conexión con Arbrain.'))
    }
    if (!response.ok && esStatusTransitorio(response.status)) {
      const j = await response.json().catch(() => null) as { error?: unknown } | null
      throw new EntregaTransitoria(typeof j?.error === 'string' && j.error.trim() ? tr(j.error) : tr('Arbrain no está disponible ahora ({estado}).', { estado: response.status }))
    }
    return response
  }
  if (envelope.createConversation) {
    const response = await pedir('/api/chat/sessions', { id: envelope.chatSessionId, expectedOwnerId: envelope.expectedOwnerId, title: envelope.message.slice(0, 55), account: envelope.account })
    if (!response.ok) throw new Error(tr('No se pudo confirmar la conversación del borrador; no se envió al motor.'))
  }
  await check() // Cancellation may arrive while cloud conversation creation waits.
  const response = await pedir('/api/chat/stream', { ...envelope, acceptOnly: true })
  const receipt = await response.json().catch(() => null)
  if (!response.ok || receipt?.accepted !== true || receipt.turnId !== envelope.turnId) {
    throw new Error(receipt?.error ? tr(String(receipt.error)) : tr('No se confirmó la aceptación. El borrador se conserva con el mismo ID para recuperar su estado.'))
  }
  return envelope.turnId
}
