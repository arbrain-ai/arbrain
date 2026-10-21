import { shiftDay } from '@/features/sistema/calendar-days'

/**
 * Hábitos en la hoja del día (Calendario › Día, 5 oct 2026). Daniel firmó llevarlos aquí desde /todotask/hoy: «un solo
 * lugar por cosa». Lógica pura, sin React (tests/planning/habitos-dia.test.ts). Escriben por la misma pluma de siempre
 * (useHabitRecords → /api/sistema); aquí solo se decide qué se ve.
 */
export type Marca = boolean | null | undefined

/** Cuántos días lee la hoja para contar rachas. Lo que pase de aquí se dice «N+», nunca se inventa. */
export const VENTANA_RACHA = 60
/** Las semanas del tejido de continuidad (reemplaza la rejilla de /todotask?view=habits). */
export const DIAS_TEJIDO = 28

/**
 * Racha: días seguidos con marca de cumplido que terminan en `dia`. Si `dia` es hoy y aún no se marca, la racha sigue
 * viva (cuenta hasta ayer): el día no ha terminado. Un hueco sin registro corta la racha, pero no se pinta como fallo.
 * `tope`: la racha llega al borde de lo leído; puede ser más larga.
 */
export function racha(marca: (fecha: string) => Marca, dia: string, hoy: string, desde: string): { dias: number; tope: boolean } {
  let d = dia === hoy && marca(dia) !== true ? shiftDay(dia, -1) : dia, dias = 0
  while (d >= desde && marca(d) === true) { dias++; d = shiftDay(d, -1) }
  return { dias, tope: dias > 0 && d < desde }
}

/** «12 d», «60+ d». Debajo de 2 días no se muestra: una racha de uno es solo un día. */
export function rotuloRacha(r: { dias: number; tope: boolean }): string | null {
  return r.dias < 2 ? null : `${r.dias}${r.tope ? '+' : ''} d`
}

/** Los días del tejido, del más viejo al más reciente, terminando en `dia`. */
export function diasTejido(dia: string, n = DIAS_TEJIDO): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(dia, i - n + 1))
}

/** En el tejido, tocar un día rota su estado: sin registro → cumplido → no cumplido → sin registro. */
export const siguienteMarca = (m: Marca): boolean | null => m === true ? false : m === false ? null : true

/** Progreso del día: solo cuentan las marcas explícitas de cumplido. */
export function avanceHabitos(marcas: Marca[]) {
  const hechos = marcas.filter(m => m === true).length
  return { hechos, total: marcas.length, completo: marcas.length > 0 && hechos === marcas.length }
}

/** Movimiento con flechas dentro de la rejilla de hábitos (columnas = las que pinta el ancho). */
export function moverFoco(actual: number, total: number, tecla: string, columnas: number): number | null {
  if (total <= 0) return null
  const c = Math.max(1, columnas)
  const destino = tecla === 'ArrowRight' ? actual + 1 : tecla === 'ArrowLeft' ? actual - 1 : tecla === 'ArrowDown' ? actual + c
    : tecla === 'ArrowUp' ? actual - c : tecla === 'Home' ? 0 : tecla === 'End' ? total - 1 : null
  if (destino == null) return null
  return Math.max(0, Math.min(total - 1, destino))
}
