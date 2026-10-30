/**
 * Cuánto tardó Levy en un turno (8 oct 2026, Daniel: «a veces me toca esperar algunos minutos…
 * poder ver cuánto tardó»).
 *
 * - En vivo: reloj desde el INICIO del turno según el servidor (`metadata.startedAt`), así cerrar y
 *   reabrir la app a mitad del turno no lo reinicia. Sin ese dato, la hora del mensaje (el envío).
 * - Al terminar: la duración que reportó el motor (`usage.durationMs`), la misma del tooltip de la hora.
 * - Debajo de UMBRAL_MS no se pinta nada: lo rápido no necesita reloj.
 */

export const UMBRAL_MS = 10_000

interface MensajeConTiempo {
  timestamp: Date
  metadata?: { startedAt?: number } | null
  usage?: { durationMs?: number } | null
}

const valido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Inicio del turno en ms epoch. */
export function inicioTurno(msg: MensajeConTiempo): number {
  const servidor = msg.metadata?.startedAt
  return valido(servidor) ? servidor : msg.timestamp.getTime()
}

/** Reloj vivo compacto: «0:42», «2:14», «1:02:05». */
export function reloj(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Duración final en palabras: «42 s», «4 min 12 s», «1 h 3 min». */
export function duracionLegible(ms: number): string {
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} s`
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`
  return s > 0 ? `${m} min ${s} s` : `${m} min`
}

/** «Trabajó 4 min 12 s» si el turno terminado pasó el umbral; null si no hay dato o fue rápido. */
export function etiquetaTrabajo(msg: MensajeConTiempo): string | null {
  const ms = msg.usage?.durationMs
  if (!valido(ms) || ms < UMBRAL_MS) return null
  return `Trabajó ${duracionLegible(ms)}`
}
