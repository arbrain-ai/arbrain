// Reintento automático de los mensajes guardados (resiliencia, 12 oct 2026).
//
// Incidente del 11 oct: con PostgREST muerto, cada mensaje de Daniel quedó en «Mensaje guardado · Reintentar este
// envío» y solo salía con un toque. Regla nueva: un envío cuya selección (modelo y esfuerzo) ya estaba CONFIRMADA y que
// falló por algo pasajero (sin red, 5xx, 429, plazo vencido) se reintenta solo, con espera creciente, hasta que el
// servidor lo acepte. Lo que exige una decisión de la persona (selección sin confirmar, 4xx, conflicto) no se toca.
//
// Exactamente una vez: el reintento manda el MISMO sobre con el MISMO `turnId`; el journal del daemon deduplica por
// `turn_id` + huella (`chat-runtime/journal.ts › accept`) y conserva el contexto congelado del primer intento
// (`freezeChatContext`). Varios reintentos, pestañas o dispositivos producen un solo turno.
//
// Sin estado propio: la espera sale de `attempts` y `updatedAt` de la fila de la cola (sobrevive a recargar la app).
import type { SyncQueueItem } from '@/lib/local-first/types'
import { CHAT_RECEIPT_GRACE_MS } from './draft-visibility'

export const MARCA_TRANSITORIA = 'Reintentando solo…'
export const REINTENTO_BASE_MS = 3_000
export const REINTENTO_TOPE_MS = 60_000
/** Cada cuánto se revisa la cola (el reintento real lo decide `esperaReintento`). */
export const REVISION_COLA_MS = 2_500

/** Espera antes del siguiente intento: 3 s, 6 s, 12 s, 24 s, 48 s y luego 60 s. */
export function esperaReintento(intentos: number): number {
  return Math.min(REINTENTO_TOPE_MS, REINTENTO_BASE_MS * 2 ** Math.min(Math.max(0, intentos), 10))
}

/** Códigos que dicen «ahora no» y no «nunca»: el servidor o algo delante de él no está disponible. */
export function esStatusTransitorio(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

/** Falla pasajera: el mensaje dice la causa y que Arbrain reintenta solo. Se guarda tal cual en `lastError`. */
export class EntregaTransitoria extends Error {
  constructor(causa: string) {
    super(`${causa.trim().replace(/[.…]?\s*$/, '.')} ${MARCA_TRANSITORIA}`)
    this.name = 'EntregaTransitoria'
  }
}

export function esFallaTransitoria(lastError?: string | null): boolean {
  return !!lastError && lastError.endsWith(MARCA_TRANSITORIA)
}

type SobreMinimo = { expectedOwnerId?: string; turnId?: string; intent?: unknown; message?: string; version?: number }

function sobreDe(item: SyncQueueItem): SobreMinimo | null {
  if (item.entityType !== 'chat_prompt') return null
  try { return (JSON.parse(item.payloadJson)?.localContext?.chatEnvelope ?? null) as SobreMinimo | null } catch { return null }
}

/** Cuándo toca el siguiente intento automático de este envío (epoch ms), o null si no se reintenta solo. */
export function proximoReintento(item: SyncQueueItem, owner: string, enviandoTurnId: string | null | undefined): number | null {
  const sobre = sobreDe(item)
  // Solo lo confirmado: un borrador sin selección espera la decisión de la persona (nunca se despacha por ella).
  if (!sobre || sobre.expectedOwnerId !== owner || !sobre.intent || sobre.message?.trimStart().startsWith('/')) return null
  const creado = Date.parse(item.createdAt)
  const tocado = Date.parse(item.updatedAt)
  if (!Number.isFinite(creado) || !Number.isFinite(tocado)) return null
  if (item.status === 'failed') return esFallaTransitoria(item.lastError) ? tocado + esperaReintento(item.attempts) : null
  // Pendiente sin recibo: el envío directo falló o se cortó. Se le da el plazo del recibo antes de reintentar.
  if (item.status === 'pending' && sobre.turnId !== enviandoTurnId) return Math.max(creado + CHAT_RECEIPT_GRACE_MS, tocado + esperaReintento(item.attempts))
  return null
}

/** Ids de los envíos cuyo reintento automático ya venció. */
export function reintentosVencidos(items: SyncQueueItem[], owner: string, enviandoTurnId: string | null | undefined, ahora = Date.now()): string[] {
  return items.filter(item => { const t = proximoReintento(item, owner, enviandoTurnId); return t !== null && t <= ahora }).map(item => item.id)
}
