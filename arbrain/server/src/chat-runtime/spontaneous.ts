import type { Options } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeSpontaneousReply } from './claude-session.js'

/**
 * Respuestas espontáneas de Levy (chat vivo, 3 oct 2026).
 *
 * El CLI responde por su cuenta cuando termina un subagente o un Bash en segundo plano, o cuando un
 * despertador reinyecta un mensaje. Antes esas respuestas solo quedaban en
 * `chat_runtime_provider_observations`, que nadie lee: la persona no las veía (caso del 1 oct,
 * dos respuestas de madrugada). Ahora la sesión las ofrece aquí; el proceso que es dueño de los turnos (corredor o
 * agent-server sin corredor) instala el adoptante, que crea un turno sintético en el journal y lo
 * ejecuta por el mismo camino que un turno normal: eventos, SSE, punto de color y entrega.
 */
export interface SpontaneousScope { owner: string; account: string; conversationId: string }
export interface SpontaneousOffer extends SpontaneousScope {
  reply: ClaudeSpontaneousReply
  /** Conecta las preguntas (canUseTool) del proceso al turno sintético que adopta la respuesta. */
  bindCanUseTool: (fn: Options['canUseTool']) => void
}
export type Adopter = (offer: SpontaneousOffer) => boolean

let adopter: Adopter | undefined
const pending = new Map<string, SpontaneousOffer>()

export function setSpontaneousAdopter(next: Adopter | undefined): void { adopter = next }

export function offerSpontaneous(scope: SpontaneousScope, reply: ClaudeSpontaneousReply, bindCanUseTool: SpontaneousOffer['bindCanUseTool'] = () => {}): boolean {
  if (!adopter) return false
  const offer = { ...scope, reply, bindCanUseTool }
  pending.set(reply.id, offer)
  let ok = false
  try { ok = adopter(offer) } catch { ok = false }
  if (!ok) pending.delete(reply.id)
  return ok
}

/** El turno sintético toma su flujo vivo una sola vez (el flujo no es serializable al journal). */
export function takeSpontaneous(turnId: string): SpontaneousOffer | undefined {
  const offer = pending.get(turnId)
  pending.delete(turnId)
  return offer
}
