// Etiquetas del esfuerzo en español (2 oct 2026), como Claude Desktop: Bajo,
// Medio, Alto, Muy alto, Máximo. El valor que viaja al daemon sigue siendo el
// del SDK (low, medium, high, xhigh, max); esto solo es lo que ve Daniel.
// Sin opción «Default»: el chip muestra siempre el nivel real.
import { tr, trMarca } from '@/shared/i18n'

export const DEFAULT_EFFORT = 'medium'

const LABELS: Record<string, string> = {
  none: trMarca('Ninguno'),
  minimal: trMarca('Mínimo'),
  low: trMarca('Bajo'),
  medium: trMarca('Medio'),
  high: trMarca('Alto'),
  xhigh: trMarca('Muy alto'),
  max: trMarca('Máximo'),
}

/** Nivel en español. Un nivel desconocido se muestra tal cual, capitalizado.
 * Sin nivel confirmado (cargando, o un modelo sin niveles) dice «Esfuerzo»: no
 * se inventa «Medio» antes de saberlo. */
export function effortLabel(effort: string | null | undefined): string {
  const value = effort?.trim()
  if (!value) return tr('Esfuerzo')
  return LABELS[value] ? tr(LABELS[value]) : value.charAt(0).toUpperCase() + value.slice(1)
}

/** Texto del chip: «Medio», «Alto · Ultracode» o, sin nivel confirmado, «Esfuerzo». */
export function stopLabel(effort: string | null | undefined, ultracode: boolean): string {
  if (!effort?.trim()) return ultracode ? 'Ultracode' : effortLabel(null)
  const label = effortLabel(effort)
  return ultracode ? `${label} · Ultracode` : label
}
