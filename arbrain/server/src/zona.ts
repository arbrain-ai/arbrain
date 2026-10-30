/**
 * Zona horaria del dueño de este daemon (29 oct 2026, T7 de la cohorte: «la zona horaria está fija a
 * America/Mexico_City. Yo vivo en Madrid»). Misma regla que la web (`arbrain/src/shared/lib/zona-dueno.ts`):
 *
 * - Instalación original (edición no cliente): siempre `America/Mexico_City`, exactamente como antes.
 * - Edición cliente: `ARBRAIN_TZ` si es una zona IANA válida; si no, la del sistema (`Intl…resolvedOptions()`, que ya
 *   respeta `TZ`); si no hay ninguna válida, `UTC`.
 *
 * La usan los despertadores («a las 14:05» es en la zona del alumno), la bitácora de manos (un archivo por día civil)
 * y el listado de rutinas. El scheduler ya resolvía la zona del sistema para el alumno (`CRON_TZ` sigue mandando).
 */
import { esEdicionCliente } from './edicion.js'

export const ZONA_ORIGINAL = 'America/Mexico_City'

const validas = new Map<string, boolean>()
export function zonaValida(zona: unknown): zona is string {
  if (typeof zona !== 'string' || !zona.trim()) return false
  const previa = validas.get(zona)
  if (previa !== undefined) return previa
  let ok = true
  try { new Intl.DateTimeFormat('en-US', { timeZone: zona }) } catch { ok = false }
  validas.set(zona, ok)
  return ok
}

function zonaDelSistema(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined }
}

/** Zona del dueño. `env` y `sistema` son para pruebas. */
export function zonaDueno(env: NodeJS.ProcessEnv = process.env, sistema: string | undefined = zonaDelSistema()): string {
  if (!esEdicionCliente(env)) return ZONA_ORIGINAL
  const pedida = env.ARBRAIN_TZ?.trim()
  if (zonaValida(pedida)) return pedida
  return zonaValida(sistema) ? sistema : 'UTC'
}

/** Día civil (AAAA-MM-DD) de un instante en una zona. */
export function diaCivil(t: number | Date, zona: string = zonaDueno()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t)
}

/**
 * Instante (ms) de la hora de pared `h:m` del día civil `dia` en `zona`. Resuelve el desfase de esa zona en ese día
 * (horario de verano incluido). Si la hora no existe (salto de verano), cae en la siguiente válida.
 */
export function instanteDeHoraCivil(dia: string, h: number, m: number, zona: string): number {
  const objetivo = Date.parse(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  let t = objetivo
  for (let i = 0; i < 4; i++) {
    const p = f.formatToParts(new Date(t))
    const v = (k: string) => p.find(x => x.type === k)!.value
    const visto = Date.parse(`${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}:${v('second')}Z`)
    const delta = objetivo - visto
    if (!delta) return t
    t += delta
  }
  return t
}
