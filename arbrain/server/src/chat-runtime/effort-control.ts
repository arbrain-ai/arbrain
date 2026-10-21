/** Esfuerzo por defecto de toda conversación (2 oct 2026, pedido de Daniel):
 * «medium», no el que traiga la config de cada cuenta (xhigh en la suya). Sin
 * opción «Default» en la UI: el chip muestra siempre el nivel real. */
export const DEFAULT_CHAT_EFFORT = 'medium'

// Menor a mayor. Un nivel fuera de esta lista (desconocido) nunca se elige solo.
const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/** El nivel de `available` más cercano a `target`; en empate, el menor (más
 * barato). Vacío o sin lista = el modelo no anuncia esfuerzo → null. */
export function nearestEffort(available: readonly string[] | null | undefined, target: string = DEFAULT_CHAT_EFFORT): string | null {
  const levels = (available ?? []).filter(level => EFFORT_ORDER.includes(level))
  if (!levels.length) return null
  if (levels.includes(target)) return target
  const goal = EFFORT_ORDER.indexOf(target)
  if (goal < 0) return null
  let best = levels[0]
  for (const level of levels) {
    const distance = Math.abs(EFFORT_ORDER.indexOf(level) - goal)
    const bestDistance = Math.abs(EFFORT_ORDER.indexOf(best) - goal)
    if (distance < bestDistance || (distance === bestDistance && EFFORT_ORDER.indexOf(level) < EFFORT_ORDER.indexOf(best))) best = level
  }
  return best
}

/** Lo que de verdad correrá el próximo turno: la elección de la conversación o,
 * sin ella, el default. `available` null = lista aún desconocida (sin modelo
 * confirmado): se devuelve lo elegido, o el default nominal. */
export function effectiveEffort(chosen: string | null | undefined, available: readonly string[] | null | undefined): string | null {
  if (!available) return chosen ?? DEFAULT_CHAT_EFFORT
  if (!available.length) return null
  return chosen && available.includes(chosen) ? chosen : nearestEffort(available)
}
