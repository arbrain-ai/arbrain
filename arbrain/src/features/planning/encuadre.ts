/**
 * El encuadre vertical del calendario (22 oct 2026, Daniel: «que el default del calendario sea viendo la hora actual durante el
 * día»). Lógica pura, sin DOM: a qué minuto se abre y cuánto se desplaza el contenedor para dejarlo a la vista.
 *
 * - Hoy: la línea de ahora queda a un tercio de la altura visible (contexto de lo que pasó arriba, más espacio para lo que viene).
 * - Otro día: arriba, la primera hora con eventos o, si no hay, la hora en que despierta Daniel (5:30, monk mode 22 oct–20 nov).
 * Solo se encuadra al abrir, al cambiar de día o al pulsar «Hoy» (useEncuadre.ts); los datos y el reloj nunca mueven el scroll.
 */

/** La hora en que despierta Daniel, en minutos del día («me despierto 5:30», 22 oct 2026). */
export const DESPIERTA = 5 * 60 + 30
/** Dónde queda la línea de ahora dentro de lo visible, desde arriba. */
export const TERCIO = 1 / 3
/** Aire sobre la primera hora cuando no es hoy (px): la etiqueta de la hora no queda pegada al borde. */
export const AIRE = 8

export interface Encuadre {
  /** Minuto del día que se encuadra. */
  minuto: number
  /** Qué fracción de la altura visible queda por encima de ese minuto. */
  fraccion: number
  /** Aire fijo en px por encima (además de la fracción). */
  aire: number
}

/**
 * Qué encuadrar. `ahora` es el minuto del día si hoy está a la vista (null si no); `inicios`, los minutos de inicio de los
 * eventos con hora de lo que se ve. Sin hoy, se abre en la hora entera de su primer evento o en la hora de despertar.
 */
export function encuadreDe(ahora: number | null, inicios: readonly number[], despierta = DESPIERTA): Encuadre {
  if (ahora != null) return { minuto: ahora, fraccion: TERCIO, aire: 0 }
  const primero = inicios.length ? Math.min(...inicios) : null
  return { minuto: primero == null ? despierta : Math.floor(primero / 60) * 60, fraccion: 0, aire: AIRE }
}

/**
 * El `scrollTop` que deja la marca donde se pide. `marca` es la posición en pantalla del minuto encuadrado; `arriba` y `alto`,
 * lo visible del contenedor ya sin lo pegajoso de arriba (la barra, la cabecera de días). Se recorta al rango posible: a las
 * 6:00 no se sube más allá del principio, y al final del día el pie (Hábitos de hoy) llega a su tope sin forzar.
 */
export function destinoScroll({ actual, marca, arriba, alto, maximo, fraccion, aire = 0 }: {
  actual: number; marca: number; arriba: number; alto: number; maximo: number; fraccion: number; aire?: number
}): number {
  const destino = actual + (marca - arriba) - Math.max(0, alto) * fraccion - aire
  return Math.round(Math.min(Math.max(0, maximo), Math.max(0, destino)))
}
