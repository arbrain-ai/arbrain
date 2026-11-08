// Sincronización autónoma (4 nov 2026, Daniel: «quitemos este punto verde… deja todo preparado para que sea la ia quien se
// encargue de esto sin mi atención en el medio»). Lo que el punto verde («Arbrain Runtime») ofrecía a mano corre solo:
//   - la cola local (tareas, eventos, lienzos) se sube sola, con espera creciente entre intentos;
//   - conflicto = la regla de la casa: gana el cambio local (lo último que hizo la persona en este equipo) y se reenvía;
//   - el espejo local se trae cada 5 min y el paquete offline se rehace una vez al día (uno solo, se sobrescribe);
//   - todo queda en la bitácora; SOLO una falla que no se resolvió en `INTENTOS_PARA_SUBIR` intentos sube a la campana, una
//     vez por envío. Telemetría a bitácora, nunca a la campana.
// Los mensajes del chat no pasan por aquí: los reintenta `features/chat/lib/reintento-envios.ts` (con su dueño y su turno).
//
// Sin estado propio: la espera sale de `attempts` y `updatedAt` de la fila (sobrevive a recargar la app).
import type { SyncQueueItem } from './types'

export const SYNC_BASE_MS = 5_000
export const SYNC_TOPE_MS = 10 * 60_000
/** Intentos tras los cuales una falla deja de ser «pasajera» y se le avisa a la persona (una vez). */
export const INTENTOS_PARA_SUBIR = 8
/** Cada cuánto se revisa la cola (el intento real lo decide `esperaSync`). */
export const REVISION_SYNC_MS = 30_000
export const ESPEJO_CADA_MS = 5 * 60_000
export const PAQUETE_CADA_MS = 24 * 60 * 60_000
/** El paquete offline es uno solo y se sobrescribe (el disco del Studio es escaso). */
export const NOMBRE_PAQUETE = 'paquete-offline'

/** Espera antes del siguiente intento: 5 s, 10 s, 20 s… hasta 10 min. */
export function esperaSync(intentos: number): number {
  return Math.min(SYNC_TOPE_MS, SYNC_BASE_MS * 2 ** Math.min(Math.max(0, intentos), 12))
}

/** Lo que el sincronizador autónomo atiende: lo de la cola que no es chat. */
export const esDeSync = (item: SyncQueueItem) => item.entityType !== 'chat_prompt'

/** Ids cuyo siguiente intento ya tocó: pendientes nuevos de inmediato; fallas y conflictos, con su espera. */
export function syncVencidos(items: SyncQueueItem[], ahora = Date.now()): string[] {
  return items.filter(item => {
    if (!esDeSync(item)) return false
    if (item.status === 'pending') return true
    if (item.status !== 'failed' && item.status !== 'conflict') return false
    const tocado = Date.parse(item.updatedAt)
    return !Number.isFinite(tocado) || tocado + esperaSync(item.attempts) <= ahora
  }).map(item => item.id)
}

/** Los conflictos se resuelven por regla: vuelven a la cola como pendientes (gana el cambio local). */
export const conflictosPorResolver = (items: SyncQueueItem[], ahora = Date.now()) =>
  items.filter(item => esDeSync(item) && item.status === 'conflict' && syncVencidos([item], ahora).length > 0)

/** Lo que el sistema no pudo resolver solo: sube a la campana, una vez por envío. */
export const irresolubles = (items: SyncQueueItem[]) =>
  items.filter(item => esDeSync(item) && (item.status === 'failed' || item.status === 'conflict') && item.attempts >= INTENTOS_PARA_SUBIR)

const NOMBRE: Record<string, string> = { task: 'una tarea', calendar_event: 'un evento', drawing: 'un lienzo' }
/** «No pude subir una tarea tras 8 intentos: <error>». */
export function fraseIrresoluble(item: SyncQueueItem): { titulo: string; cuerpo: string } {
  const que = NOMBRE[item.entityType] ?? 'un cambio'
  return {
    titulo: `No pude sincronizar ${que}`,
    cuerpo: `Lo intenté ${item.attempts} veces y sigue fallando${item.lastError ? `: ${item.lastError.slice(0, 200)}` : ''}. Tu cambio sigue guardado en este equipo; Levy lo revisa en Ajustes › Avanzado › Sincronización.`,
  }
}

/** ¿Toca traer el espejo / rehacer el paquete? (marca en el almacenamiento del dispositivo). */
export const toca = (ultimo: number, cada: number, ahora = Date.now()) => !Number.isFinite(ultimo) || ahora - ultimo >= cada
