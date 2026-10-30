/**
 * Tema «automático por hora» (4 oct 2026): claro de día (CLARO_DESDE) y oscuro de noche (OSCURO_DESDE),
 * hora de la zona del dueño (shared/lib/zona-dueno.ts: instalación original, America/Mexico_City; alumno, la de su sistema desde el
 * 29 oct 2026). Puro y sin React para poder probarlo y para que el script de arranque de layout.tsx use la misma regla
 * (ahí va copiada: corre antes de hidratar).
 */
import { zonaDueno } from './zona-dueno'

export const CLARO_DESDE = 6
export const OSCURO_DESDE = 19
/** Para capturas y pruebas: fuerza la hora (0-23) desde localStorage sin tocar el reloj. */
export const CLAVE_HORA_FORZADA = 'arbrain-hora-forzada'

/** Hora (0-23) en la zona del dueño. El nombre viene de cuando solo existía México. */
export function horaMexico(ahora: Date = new Date(), zona: string = zonaDueno()): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', hourCycle: 'h23' }).format(ahora)
  return Number(h) % 24
}

export function temaPorHora(hora: number): 'light' | 'dark' {
  return hora >= CLARO_DESDE && hora < OSCURO_DESDE ? 'light' : 'dark'
}

export function horaEfectiva(ahora: Date = new Date()): number {
  try {
    const f = typeof window !== 'undefined' ? window.localStorage.getItem(CLAVE_HORA_FORZADA) : null
    if (f !== null && f !== '' && Number.isInteger(Number(f)) && Number(f) >= 0 && Number(f) <= 23) return Number(f)
  } catch { /* sin storage */ }
  return horaMexico(ahora)
}

export const temaAhora = (ahora: Date = new Date()): 'light' | 'dark' => temaPorHora(horaEfectiva(ahora))

/**
 * Elegir claro u oscuro a mano (el botón del pie, ⌘⌥T) vale hasta el siguiente cambio de tramo (06:00 o 19:00) y
 * luego vuelve solo a «automático» (4 oct 2026, 21:08: Daniel vio la app en claro de noche porque un toque de días
 * antes había dejado «light» guardado para siempre). Se guarda junto al tema el instante en que caduca.
 */
export const CLAVE_TEMA = 'mission-control-theme'
export const CLAVE_TEMA_HASTA = 'mission-control-theme-hasta'

/** Instante (ms) del siguiente cruce de 06:00 o 19:00, hora del dueño. */
export function finDelTramo(ahora: Date = new Date(), zona: string = zonaDueno()): number {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(ahora)
  const n = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0)
  const seg = (n('hour') % 24) * 3600 + n('minute') * 60 + n('second')
  const limites = [CLARO_DESDE * 3600, OSCURO_DESDE * 3600, (CLARO_DESDE + 24) * 3600]
  const siguiente = limites.find((l) => l > seg)!
  return ahora.getTime() - (ahora.getTime() % 1000) + (siguiente - seg) * 1000
}

/** Lo guardado que sigue vigente: claro/oscuro solo antes de caducar; lo demás (o sin fecha, como lo viejo) es automático. */
export function temaGuardadoVigente(guardado: string | null, hasta: string | null, ahoraMs: number): 'light' | 'dark' | 'auto' {
  if (guardado !== 'light' && guardado !== 'dark') return 'auto'
  const fin = Number(hasta)
  return Number.isFinite(fin) && fin > ahoraMs ? guardado : 'auto'
}
