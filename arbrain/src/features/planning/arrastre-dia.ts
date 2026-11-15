import { format } from 'date-fns'
import { tr } from '@/shared/i18n'
import { localeFechas } from '@/shared/i18n/fechas'
import { medianoche, medianocheSiguiente, soltar } from './semana-horas'
import type { PlanEvent, PlanItem } from './types'

/**
 * Arrastrar en el Día (11 nov 2026, Daniel: «deberia poder agarrar eventos y reposicionarlos a otra hora… manualmente y en automatico
 * te actualizas»). La agenda del Día (AgendaMini) mueve con las MISMAS reglas que la Semana en Horas: `soltar` de semana-horas.ts
 * (conserva la duración, redondea a 15 min y no sale del tramo) y la misma pluma (`moverEnRejilla` → autoguardado → commit con ⌘Z →
 * `/api/planning` → `mc-event.py planning`). Aquí solo vive lo que el Día añade: qué se puede arrastrar y la guarda de invitados.
 */

/** ¿Se arrastra en el Día? La regla de la Semana (`movible: e.editable`), con hora y entero dentro del día civil `dia`
 *  (lo que cruza la medianoche se edita en su hoja: arrastrar su recorte cambiaría la duración). Los de todo el día, nunca. */
export function arrastrableEnDia(e: PlanEvent, dia: string): boolean {
  if (e.allDay || !e.editable) return false
  const a = Date.parse(e.start), z = Date.parse(e.end)
  return Number.isFinite(a) && Number.isFinite(z) && a >= medianoche(dia) && z <= medianocheSiguiente(dia)
}

/** Dónde cae el evento al soltarlo en el minuto `minutoInicio` del día: `soltar` de la Semana con el tramo de la agenda del Día
 *  (en minutos, horas cerradas). null = no se movió. */
export function soltarEnDia(e: PlanEvent, dia: string, minutoInicio: number, tramo: { desde: number; hasta: number }): { inicio: Date; fin: Date } | null {
  const bloque = { id: e.id, titulo: e.title, inicio: Date.parse(e.start), fin: Date.parse(e.end), color: null, movible: true }
  return soltar(bloque, dia, minutoInicio, { desde: tramo.desde / 60, hasta: tramo.hasta / 60 })
}

/** Las otras personas del evento (sin uno mismo): su nombre o, si no hay, su correo. Una tarea no tiene invitados. */
export function invitadosDe(item: PlanItem): string[] {
  if (item.kind !== 'event') return []
  return (item.attendees ?? []).filter(a => !a.self).map(a => a.name?.trim() || a.email)
}

/** «Alfa», «Alfa y Beta», «Alfa, Beta y 3 más». */
export function listaNombres(nombres: string[], max = 2): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  if (nombres.length <= max) return tr('{lista} y {ultimo}', { lista: nombres.slice(0, -1).join(', '), ultimo: nombres.at(-1) })
  return tr('{lista} y {n} más', { lista: nombres.slice(0, max).join(', '), n: nombres.length - max })
}

/**
 * La guarda de invitados (11 nov 2026): un evento con otras personas no se mueve en silencio. Al soltarlo, la app pregunta
 * diciendo quiénes lo verán; sin su sí, el evento se queda donde estaba. Vale para el Día y la Semana (una sola pluma).
 * Google cambia la hora en el calendario de cada invitado (la pluma no les manda correo: `sendUpdates` queda en «none»).
 */
export function guardaInvitados(item: PlanItem, inicio: Date): { invitados: string[]; texto: string } | null {
  const invitados = invitadosDe(item)
  if (!invitados.length) return null
  const cuando = format(inicio, tr("EEEE d 'a las' HH:mm"), { locale: localeFechas() })
  return { invitados, texto: tr('«{titulo}» tiene invitados ({invitados}). Si lo mueves al {cuando}, verán la nueva hora en su calendario.', { titulo: item.title, invitados: listaNombres(invitados), cuando }) }
}
