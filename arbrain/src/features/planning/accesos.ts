import { addDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { CalendarMode } from './types'
import { enIngles, tr, trMarca } from '@/shared/i18n'
import { localeFechas } from '@/shared/i18n/fechas'

/** Vistas sincronizadas (4 oct 2026): cada vista del calendario ofrece los accesos de SU horizonte, con las mismas fechas. */
export type AlcanceObjetivos = 'dia' | 'semana' | 'mes'

/** El reporte de cada escala: un cron por periodo. Desde el 10 oct (v3) llega a la conversación favorita; el botón abre el de
 *  la fecha que se ve (reporte-por-fecha.ts). */
export type Acceso = { id: 'reporte' | 'plan'; etiqueta: string; job?: string }

const REPORTE: Record<AlcanceObjetivos, { job: string; etiqueta: string }> = {
  dia: { job: 'morning-briefing', etiqueta: trMarca('Reporte diario') },
  semana: { job: 'business-council', etiqueta: trMarca('Reporte semanal') },
  mes: { job: 'monthly-review', etiqueta: trMarca('Reporte mensual') },
}

/** Día y 4 días miran el día; Semana y Agenda (siete días corridos), la semana; Mes, el mes. Año y Rutinas no tienen. */
export function alcanceDeModo(mode: CalendarMode): AlcanceObjetivos | null {
  if (mode === 'day' || mode === 'fourDays') return 'dia'
  if (mode === 'week' || mode === 'agenda') return 'semana'
  if (mode === 'month') return 'mes'
  return null
}

/** El pie de la vista unificada (4 oct 2026): el reporte de SU periodo y, en el mes, el plan del mes. */
export function accesosDe(mode: CalendarMode): Acceso[] {
  const alcance = alcanceDeModo(mode)
  // El Día sin «Reporte diario» (16 nov 2026, Daniel: «añade variedad… dejar lo importante»): ya le llega a las 5:30.
  if (!alcance || mode === 'day') return []
  const r = REPORTE[alcance]
  return [{ id: 'reporte', etiqueta: r.etiqueta, job: r.job }, ...(alcance === 'mes' ? [{ id: 'plan' as const, etiqueta: trMarca('Plan del mes') }] : [])]
}

/** «Revisión del domingo» en el pie: en el Día solo cuando el día que se ve es domingo (16 nov 2026); en las demás vistas vivas, siempre. */
export function revisionEnPie(mode: CalendarMode, fecha: Date): boolean {
  return mode !== 'day' || fecha.getDay() === 0
}

/** La escala (Día · Semana · Mes) que corresponde a cada vista, para el selector de tres. */
export const ESCALAS: { alcance: AlcanceObjetivos; modo: CalendarMode; etiqueta: string }[] = [
  { alcance: 'dia', modo: 'day', etiqueta: trMarca('Día') }, { alcance: 'semana', modo: 'week', etiqueta: trMarca('Semana') }, { alcance: 'mes', modo: 'month', etiqueta: trMarca('Mes') },
]

/** El plan del mes vive en docs/guardados/plan-<mes>-<año>/index.html (p. ej. plan-octubre-2026). */
export function planDelMes(fecha: Date): { ruta: string; titulo: string; mes: string } {
  const mes = format(fecha, 'LLLL', { locale: es }).toLowerCase(), anio = fecha.getFullYear()
  return { ruta: `docs/guardados/plan-${mes}-${anio}/index.html`, titulo: `Plan de ${mes} ${anio}`, mes: `${mes} ${anio}` }
}

/** Título de UNA línea de la barra angosta: «octubre», «28 sep – 4 oct», «dom 4 oct». El año solo si no es el actual. */
export function tituloAngosto(mode: CalendarMode, ancla: Date, rango: { from: string; to: string }, hoy = new Date()): string {
  const quita = (t: string) => t.replace(/\./g, '')
  if (mode === 'month') return format(ancla, 'LLLL', { locale: localeFechas() }) + (ancla.getFullYear() === hoy.getFullYear() ? '' : ` ${ancla.getFullYear()}`)
  if (mode === 'year') return String(ancla.getFullYear())
  if (mode === 'day') return quita(format(ancla, tr('EEE d MMM'), { locale: localeFechas() })) + (ancla.getFullYear() === hoy.getFullYear() ? '' : ` ${ancla.getFullYear()}`)
  const a = new Date(rango.from), b = new Date(Date.parse(rango.to) - 1)
  const mismoMes = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const texto = enIngles() ? rangoEn(a, b, mismoMes) : mismoMes ? `${format(a, 'd')} – ${quita(format(b, 'd MMM', { locale: es }))}` : `${quita(format(a, 'd MMM', { locale: es }))} – ${quita(format(b, 'd MMM', { locale: es }))}`
  return b.getFullYear() === hoy.getFullYear() ? texto : `${texto} ${b.getFullYear()}`
}

/** En inglés el mes va antes del día y una sola vez si se repite: «Oct 8 – 14», «Sep 29 – Oct 5». */
function rangoEn(a: Date, b: Date, mismoMes: boolean): string {
  return `${format(a, 'MMM d', { locale: localeFechas() })} – ${format(b, mismoMes ? 'd' : 'MMM d', { locale: localeFechas() })}`
}

/** El título de la Semana deslizante: el rango que se ve de verdad («8 – 14 oct», «29 sep – 5 oct»; con año si no es este). */
export function tituloVentana(desde: string, n: number, hoy = new Date(), hasta?: string): string {
  const quita = (t: string) => t.replace(/\./g, '')
  // `hasta`: el último día visible cuando no son corridos (sin fines de semana).
  const a = parseISO(desde), b = hasta ? parseISO(hasta) : addDays(a, n - 1)
  const mismoMes = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const texto = n <= 1 || desde === hasta ? quita(format(a, tr('d MMM'), { locale: localeFechas() })) : enIngles() ? rangoEn(a, b, mismoMes) : mismoMes ? `${format(a, 'd')} – ${quita(format(b, 'd MMM', { locale: es }))}` : `${quita(format(a, 'd MMM', { locale: es }))} – ${quita(format(b, 'd MMM', { locale: es }))}`
  return b.getFullYear() === hoy.getFullYear() ? texto : `${texto} ${b.getFullYear()}`
}

/**
 * El selector D · S · M (10 oct 2026, Daniel): tocar otra escala la cambia y conserva la fecha en la que estabas; tocar la que ya
 * está activa lleva a hoy en esa escala (el día, la semana o el mes actual).
 */
export function accionDeEscala(actual: CalendarMode, pedida: CalendarMode): 'cambiar' | 'hoy' {
  return actual === pedida ? 'hoy' : 'cambiar'
}
