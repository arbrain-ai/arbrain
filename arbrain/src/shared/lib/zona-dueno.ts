/**
 * Zona horaria del dueño de esta instalación (29 oct 2026, T7 de la cohorte: «la zona horaria está fija a
 * America/Mexico_City. Yo vivo en Madrid»). Una sola fuente para el «hoy», las casillas de hábitos, el tema por hora y
 * las fechas que se pintan.
 *
 * - Instalación original (edición no cliente): siempre `America/Mexico_City`, exactamente como antes.
 * - Edición cliente: `ARBRAIN_TZ` si existe y es una zona IANA válida (solo la ve el servidor de Next); si no, la zona
 *   del sistema (`Intl…resolvedOptions().timeZone`, que en Node ya respeta `TZ`); si no hay ninguna válida, `UTC`.
 *
 * Quién manda: en la app del alumno el navegador y el servidor de Next corren en la MISMA máquina, así que la zona del
 * sistema es la misma en los dos. Lo que se guarda (hábitos) lleva la zona del navegador en cada petición
 * (`useHabitRecords` manda `timeZone`), y el servidor usa esta función solo cuando la petición no trae zona. El daemon
 * (`arbrain/server/src/zona.ts`) aplica la misma regla para despertadores, rutinas y bitácora.
 *
 * Módulo puro: lo importan componentes, rutas y pruebas.
 */
import { esEdicionCliente } from '@/lib/edicion'

export const ZONA_ORIGINAL = 'America/Mexico_City'

const validas = new Map<string, boolean>()
/** ¿Es una zona IANA que entiende Intl? Se memoriza: se pregunta en cada render. */
export function zonaValida(zona: unknown): zona is string {
  if (typeof zona !== 'string' || !zona.trim()) return false
  const previa = validas.get(zona)
  if (previa !== undefined) return previa
  let ok = true
  try { new Intl.DateTimeFormat('en-US', { timeZone: zona }) } catch { ok = false }
  validas.set(zona, ok)
  return ok
}

/** Zona del sistema donde corre este código (navegador o Node). */
export function zonaDelSistema(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined }
}

/**
 * Zona del dueño. `env` y `sistema` son para pruebas; por defecto, `process.env` y la zona del sistema.
 * En la original no consulta nada más: devuelve `America/Mexico_City`.
 */
export function zonaDueno(env: Record<string, string | undefined> = process.env, sistema: string | undefined = zonaDelSistema()): string {
  if (!esEdicionCliente(env)) return ZONA_ORIGINAL
  const pedida = env.ARBRAIN_TZ?.trim()
  if (zonaValida(pedida)) return pedida
  return zonaValida(sistema) ? sistema : 'UTC'
}

