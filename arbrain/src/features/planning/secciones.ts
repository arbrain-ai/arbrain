/**
 * Secciones de la agenda (26 oct 2026, pedido del dueño: «tarjetas por sección, no todas del mismo color»): Gym, Grupal/Clase, Uno a uno,
 * Trabajo fuerte y Personal. El color de la sección manda en toda la tarjeta (barra, icono y tinte); el DRIP (drip.ts) solo se ve al pasar el ratón (chip).  Lógica pura, sin React. Pruebas: tests/planning/secciones.test.ts.
 */
export type Seccion = 'gym' | 'clase' | 'unoauno' | 'trabajo' | 'personal'

export interface DefSeccion { id: Seccion; nombre: string; color: string; icono: string }

/** Colores sobrios (el ámbar queda solo para «ahora»; el titanio, para piezas puntuales). */
export const SECCIONES: readonly DefSeccion[] = [
  { id: 'gym', nombre: 'Gym', color: '#b23a4a', icono: 'M3 6h1.5v4H3zM11.5 6H13v4h-1.5zM4.5 7h7v2h-7zM1.5 7h1v2h-1zM13.5 7h1v2h-1z' },
  { id: 'clase', nombre: 'Grupal y clase', color: '#8c27f1', icono: 'M8 3l6 3-6 3-6-3 6-3zM4.5 8.4v2.3c0 .9 1.6 1.8 3.5 1.8s3.5-.9 3.5-1.8V8.4L8 10.2 4.5 8.4z' },
  { id: 'unoauno', nombre: 'Uno a uno', color: '#2f7fd1', icono: 'M5.5 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM1.5 12c0-2 1.8-3 4-3s4 1 4 3zM11 5a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 11 5zM10.6 9.2c2 0 3.9.8 3.9 2.8h-3.2c0-1.1-.3-2-.7-2.8z' },
  { id: 'trabajo', nombre: 'Trabajo fuerte', color: '#5b6472', icono: 'M8 2l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 10.7 4.5 12.7l.8-3.9L2.4 6.1l3.9-.5L8 2z' },
  { id: 'personal', nombre: 'Personal', color: '#a3acb9', icono: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 4.5v3.7l2.4 1.4' },
]
export const SECCION: Record<Seccion, DefSeccion> = Object.fromEntries(SECCIONES.map(s => [s.id, s])) as Record<Seccion, DefSeccion>

interface Ev { title: string; description?: string | null; meetUrl?: string | null; attendees?: { self: boolean }[] }

/** Marca explícita de «no negociable» en la descripción del evento: la etiqueta `#no-negociable` (ya puesta en Despertar y GYM del calendario Trabajo Duro). Nunca por el título. */
const MARCA_NO_NEGOCIABLE = /(^|\s)#no-negociable\b/i
export const esNoNegociable = (e: { description?: string | null }) => MARCA_NO_NEGOCIABLE.test(e.description ?? '')

const sinEmoji = (t: string) => t.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase()

/** La sección de un evento por su título (sin emoji inicial); null si no es de ninguna. */
export function seccionDe(e: Ev): Seccion | null {
  const t = sinEmoji(e.title)
  if (/^gym\b|\bgimnasio\b/.test(t)) return 'gym'
  if (/uno a uno|diagn[oó]stico|1[:\-]1|\b1 a 1\b/.test(t)) return 'unoauno'
  if (/\bgrupal\b|\bclase\b|^\W*d[ií]a \d+\b|\bdemo day\b|prospecci[oó]n en fr[ií]o|videollamada de comunidad/.test(t)) return 'clase'
  if (/trabajo fuerte|trabajo profundo|deep work|velocidad|planific|\bgrabar\b/.test(t)) return 'trabajo'
  if (/despiert|a dormir|rutina matutina|\bdescanso\b|\bcomida\b|\bfamilia\b/.test(t)) return 'personal'
  return null
}
