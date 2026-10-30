import { instalacion, NOMBRE_SEGUNDA } from '@/config'

// Fuente UNICA de verdad para los colores del calendario.
// Deterministico por nombre de calendario (paleta de marca). NO depende de los
// colores que devuelve Google (gog) ni del mirror, asi el color no parpadea segun
// que fetch gane la carrera. Client-safe (sin imports de servidor).

export type CalendarColor = { backgroundColor: string; foregroundColor: string }

// GOOGLE MANDA (decision de Daniel, 27 jul 2026). Antes habia dos paletas conviviendo:
// la de Google y una elegida a mano en la desktop el 12 jun. El mismo calendario se veia
// de un color en el navegador y de otro en la app (Comidas celeste vs naranja), y Apple
// Calendar no tenia ninguna. Se unifico hacia Google porque es la superficie donde Daniel
// edita los colores a mano.
//
// Estos valores son un ESPEJO de los backgroundColor/foregroundColor de Google. Si Daniel
// cambia un color alla, Apple se actualiza solo (apple-mirror.py los relee en vivo) pero
// ESTE archivo hay que refrescarlo a mano:
//   gog cal calendars --account=<correo de la persona dueña> --json --no-input
const CALENDAR_COLORS: Record<string, CalendarColor> = {
  'Objetivo del dia': { backgroundColor: '#ffe894', foregroundColor: '#000000' },
  'Objetivo de la semana': { backgroundColor: '#a48b00', foregroundColor: '#ffffff' },
  'Trabajo Duro': { backgroundColor: '#6b6c6d', foregroundColor: '#ffffff' },
  'Trabajo Compartido': { backgroundColor: '#cd74e6', foregroundColor: '#000000' },
  EJERCICIO: { backgroundColor: '#ffa1a1', foregroundColor: '#000000' },
  Comidas: { backgroundColor: '#c8edf7', foregroundColor: '#000000' },
  Transporte: { backgroundColor: '#ffcfa6', foregroundColor: '#000000' },
  // Calendarios primary: color propio para que no se confundan entre si.
  [instalacion().correoDueno || 'Personal']: { backgroundColor: '#330e81', foregroundColor: '#ffffff' },
  Personal: { backgroundColor: '#330e81', foregroundColor: '#ffffff' },
  ...(instalacion().correoNegocio ? { [instalacion().correoNegocio]: { backgroundColor: '#14b8a6', foregroundColor: '#042f2e' } } : {}),
}

const SEGUNDA_COLOR: CalendarColor = { backgroundColor: '#d7c2ff', foregroundColor: '#000000' }
// Slate neutro: un calendario desconocido NO debe disfrazarse de Trabajo Duro (purple).
const DEFAULT_COLOR: CalendarColor = { backgroundColor: '#64748b', foregroundColor: '#ffffff' }

export function calendarColorFor(calendarName?: string | null): CalendarColor {
  if (calendarName?.startsWith(`Tiempo con ${NOMBRE_SEGUNDA()}`)) return SEGUNDA_COLOR
  return CALENDAR_COLORS[calendarName ?? ''] ?? DEFAULT_COLOR
}
