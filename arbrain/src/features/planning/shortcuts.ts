import type { CalendarMode } from './types'

/** Atajos de la sección Calendario (los de sfcal que Daniel ya tiene en los dedos). Teclas sin modificador, salvo
 *  ⌘Z. No chocan con los globales: Ctrl+1…7 son las áreas, Ctrl+D/W/M llevan al Calendario del panel en su escala
 *  (atajos-ctrl.ts), `[` la barra, `?` la ayuda. `T` es hoy dentro del calendario (10 oct 2026, como Google Calendar);
 *  fuera de él sigue siendo el tema (theme-context respeta el `preventDefault`). */
export type CalendarAction =
  | { type: 'mode'; mode: CalendarMode } | { type: 'nav'; delta: 1 | -1 } | { type: 'today' } | { type: 'new'; kind: 'event' | 'task' } | { type: 'undo' } | { type: 'redo' } | { type: 'delete' }

// Escalas por su inicial: D día, S (o W) semana, M mes. 4 días se retiró (5 oct 2026, 17:51: «solo planeo por Día, Semana y
// Mes»): el 2 y el 4 quedan libres. Los demás números siguen su lugar.
const NUMBERS: Record<string, CalendarMode> = { 1: 'day', 3: 'week', 5: 'year', 6: 'agenda', 7: 'crons' }
const LETTERS: Record<string, CalendarMode> = { d: 'day', s: 'week', w: 'week', m: 'month', y: 'year', a: 'agenda' }

export interface KeyLike { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean }

export function calendarAction(e: KeyLike): CalendarAction | null {
  if (e.isComposing || e.altKey) return null
  const key = e.key.toLowerCase()
  if ((e.metaKey || e.ctrlKey) && !(e.metaKey && e.ctrlKey)) return key === 'z' ? { type: e.shiftKey ? 'redo' : 'undo' } : null
  if (e.metaKey || e.ctrlKey || e.shiftKey) return null
  if (key === 'delete' || key === 'backspace') return { type: 'delete' }
  if (key === 'arrowleft' || key === 'arrowright') return { type: 'nav', delta: key === 'arrowright' ? 1 : -1 }
  if (NUMBERS[key]) return { type: 'mode', mode: NUMBERS[key] }
  if (LETTERS[key]) return { type: 'mode', mode: LETTERS[key] }
  if (key === 'n' || key === 'e') return { type: 'new', kind: 'event' }
  if (key === 'r') return { type: 'new', kind: 'task' }
  if (key === '.' || key === 't') return { type: 'today' }
  return null
}

export const CALENDAR_SHORTCUTS: { teclas: string[]; accion: string }[] = [
  { teclas: ['D', 'S', 'M'], accion: 'Día · Semana · Mes (repetir la activa lleva a hoy)' },
  { teclas: ['←', '→'], accion: 'Semana: un día antes o después (también deslizando). Día y Mes: su periodo' },
  { teclas: ['Y', 'A', '7'], accion: 'Año · Agenda · Rutinas' },
  { teclas: ['T', '.'], accion: 'Ir a hoy' },
  { teclas: ['H'], accion: 'Hábitos del día: luego su número, flechas o espacio' },
  { teclas: ['E'], accion: 'Evento nuevo (también N)' },
  { teclas: ['R'], accion: 'Tarea nueva' },
  { teclas: ['Supr'], accion: 'Borrar el evento seleccionado' },
  { teclas: ['⌘', 'Z'], accion: 'Deshacer la última acción' },
  { teclas: ['⇧', '⌘', 'Z'], accion: 'Rehacer lo deshecho' },
  { teclas: ['⌥', '↑', '↓'], accion: 'Mover 15 min el bloque con el foco (⌥ ← → un día)' },
  { teclas: ['Esc'], accion: 'Cancelar el arrastre o cerrar el editor' },
]
