/**
 * Conversación nueva que abre Levy (31 oct 2026), lado web. El agent-server (server/src/cabina/conversaciones.ts) manda
 * aquí, con su token servidor-a-servidor, el pedido que dejó la herramienta `conversacion` de la Cabina. La ruta
 * `/api/cabina/conversacion` crea la fila fijada y entrega el primer mensaje al daemon por /chat/stream, como uno escrito.
 * Este módulo es la parte pura (probada en tests/cabina/conversacion-nueva.test.ts).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const TOPE_TITULO = 80
export const TOPE_MENSAJE = 6000

export interface PedidoConversacionNueva { id: string; ownerId: string; account: unknown; title: string; message: string; turnId: string }

/** Valida el cuerpo que manda el agent-server. */
export function leerPedido(body: unknown): PedidoConversacionNueva | { error: string } {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (typeof o.id !== 'string' || !UUID.test(o.id)) return { error: 'id de conversación inválido.' }
  if (typeof o.turnId !== 'string' || !UUID.test(o.turnId)) return { error: 'turnId inválido.' }
  if (typeof o.ownerId !== 'string' || !o.ownerId.trim() || o.ownerId.length > 120) return { error: 'ownerId obligatorio.' }
  const title = typeof o.title === 'string' ? o.title.replace(/\s+/g, ' ').trim() : ''
  if (!title || title.length > TOPE_TITULO) return { error: `title obligatorio, hasta ${TOPE_TITULO} caracteres.` }
  const message = typeof o.message === 'string' ? o.message.trim() : ''
  if (!message || message.length > TOPE_MENSAJE) return { error: `message obligatorio, hasta ${TOPE_MENSAJE} caracteres.` }
  if (message.startsWith('/')) return { error: 'message no puede ser un comando.' }
  return { id: o.id, ownerId: o.ownerId.trim(), account: o.account, title, message, turnId: o.turnId }
}

/** La fila de chat_sessions: del dueño de la conversación de origen, en su misma cuenta y ya fijada (arriba de Fijadas). */
export function filaConversacion(p: Pick<PedidoConversacionNueva, 'id' | 'ownerId' | 'title'>, account: string) {
  return { id: p.id, title: p.title, profile_id: p.ownerId, account: account === 'default' ? null : account, is_favorite: true, pinned_position: null }
}

/** Una fila que ya existía con ese id solo vale si es la misma conversación (reintento), nunca otra de otro dueño o cuenta. */
export function esLaMisma(existente: { profile_id?: string | null; account?: string | null }, p: Pick<PedidoConversacionNueva, 'ownerId'>, account: string): boolean {
  return existente.profile_id === p.ownerId && (existente.account ?? 'default') === account
}

/** El cuerpo para /chat/stream del daemon: el de un mensaje escrito en la app, aceptado sin esperar el stream. */
export function cuerpoPrimerMensaje(p: Pick<PedidoConversacionNueva, 'id' | 'ownerId' | 'message' | 'turnId'>, account: string) {
  return { message: p.message, ownerId: p.ownerId, account, chatSessionId: p.id, turnId: p.turnId, verifiedConversation: true, acceptOnly: true, source: 'desktop' }
}
