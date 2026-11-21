/**
 * El bloque de «ver después» en el calendario (17 nov 2026). No hay escritor nuevo: todo sale por la MISMA pluma que usa
 * la vista de Día (`usePlanning().mutate` → POST /api/planning → mc-event.py o la pluma local del alumno), con las
 * mismas piezas: `mutationFor` para mover y deshacer, `datosDeMovimiento` para la hora. Aquí solo se arma la operación;
 * quien la manda recibe `mutar` por fuera, así las pruebas lo hacen con un doble y nada toca Google.
 *
 *  · Crear: UN evento con el título del video, lo que dura (redondeado hacia arriba) y el enlace que abre ese video en
 *    la Sala de Contenido.
 *  · Mover: el MISMO evento (su externalId y su etag de la lectura más nueva), nunca uno nuevo.
 *  · Deshacer lo recién creado: lo borra, porque es su propio toque de «Deshacer». Fuera de eso Contenido nunca borra:
 *    al verlo o votarlo, el bloque se queda en el calendario como lo que fue.
 */
import { mutationFor } from '@/features/planning/model'
import { datosDeMovimiento } from '@/features/planning/semana-horas'
import type { CalendarSource, MutationResult, PlanEvent, PlanMutation, PlanningSnapshot } from '@/features/planning/types'
import type { EventoRef, FichaVideo } from './mios'
import { tr } from '@/shared/i18n'
import type { Ocupado } from './huecos'

export type Mutar = (op: PlanMutation) => Promise<MutationResult>

/** La dirección que abre el video en la Sala (ContentWorkspace lee `?ver=`). */
export const enlaceVideo = (origen: string, videoId: string) => `${origen.replace(/\/+$/, '')}/youtube?ver=${encodeURIComponent(videoId)}`
export const tituloBloque = (titulo: string) => `▶ ${titulo}`.slice(0, 240)

/** El calendario donde se escribe: uno propio y editable (nunca el de otra persona ni el de objetivos); el principal si está. */
export function calendarioDestino(snapshot: Pick<PlanningSnapshot, 'sources' | 'perfil'> | null | undefined): CalendarSource | null {
  if (!snapshot || snapshot.perfil) return null
  const propios = snapshot.sources.filter(s => s.editable && !s.objective)
  return propios.find(s => s.calendarId === 'primary' || s.calendarId === s.account) ?? propios.find(s => s.selected) ?? propios[0] ?? null
}

export function datosBloque(video: FichaVideo, inicio: Date, minutos: number, origen: string, zona: string) {
  const enlace = enlaceVideo(origen, video.video_id)
  return {
    title: tituloBloque(video.titulo),
    description: [`Ver después, desde Contenido${video.canal ? ` · ${video.canal}` : ''}.`, enlace].join('\n'),
    // Solo en la descripción (17 nov): en `location` el Google Calendar del teléfono lo pinta como «lugar» y no abre nada.
    location: '', allDay: false, start: inicio.toISOString(), end: new Date(inicio.getTime() + minutos * 60_000).toISOString(), timeZone: zona,
  }
}

export const refDe = (e: PlanEvent): EventoRef => ({ externalId: e.externalId, account: e.account, calendarId: e.calendarId, etag: e.etag })

export async function crearBloque({ mutar, snapshot, video, inicio, minutos, origen, zona }: {
  mutar: Mutar; snapshot: PlanningSnapshot; video: FichaVideo; inicio: Date; minutos: number; origen: string; zona: string
}): Promise<PlanEvent> {
  const destino = calendarioDestino(snapshot)
  if (!destino) throw new Error(tr('No hay un calendario tuyo donde escribir.'))
  const r = await mutar({ ownerId: snapshot.ownerId, requestId: crypto.randomUUID(), kind: 'event', action: 'create', account: destino.account, calendarId: destino.calendarId, data: datosBloque(video, inicio, minutos, origen, zona) })
  if (!r.event) throw new Error(tr('El calendario no confirmó el bloque.'))
  return r.event
}

/** El evento vivo del bloque: el de la lectura (etag más nuevo) o, si está fuera de la ventana, el guardado. */
export function eventoVivo(snapshot: PlanningSnapshot, ref: EventoRef, video: FichaVideo, cuando: string | null, minutos: number): PlanEvent {
  const leido = snapshot.events.find(e => e.externalId === ref.externalId && e.account === ref.account && e.calendarId === ref.calendarId)
  if (leido) return leido
  const inicio = cuando ? new Date(cuando) : new Date()
  return { id: `${ref.account}:${ref.calendarId}:${ref.externalId}`, externalId: ref.externalId, kind: 'event', sourceId: '', account: ref.account, calendarId: ref.calendarId,
    title: tituloBloque(video.titulo), description: '', location: '', start: inicio.toISOString(), end: new Date(inicio.getTime() + minutos * 60_000).toISOString(),
    allDay: false, timeZone: 'UTC', etag: ref.etag ?? null, recurringEventId: null, recurrence: [], editable: true }
}

export async function moverBloque({ mutar, snapshot, ref, video, antes, inicio, minutos }: {
  mutar: Mutar; snapshot: PlanningSnapshot; ref: EventoRef; video: FichaVideo; antes: string | null; inicio: Date; minutos: number
}): Promise<PlanEvent> {
  const ev = eventoVivo(snapshot, ref, video, antes, minutos)
  const r = await mutar(mutationFor(ev, snapshot.ownerId, datosDeMovimiento(ev, inicio, new Date(inicio.getTime() + minutos * 60_000))))
  return r.event ?? { ...ev, start: inicio.toISOString(), end: new Date(inicio.getTime() + minutos * 60_000).toISOString() }
}

/** Solo para el «Deshacer» que sigue a crear: el dueño lo toca, no Contenido por su cuenta. */
export async function deshacerBloque({ mutar, snapshot, evento }: { mutar: Mutar; snapshot: PlanningSnapshot; evento: PlanEvent }) {
  const vivo = snapshot.events.find(e => e.externalId === evento.externalId && e.account === evento.account && e.calendarId === evento.calendarId) ?? evento
  await mutar(mutationFor(vivo, snapshot.ownerId, {}, 'delete'))
}

/** Lo ocupado de la lectura del calendario para `huecosLibres`: eventos con hora y tareas con hora. */
export function ocupadoDe(snapshot: Pick<PlanningSnapshot, 'events' | 'tasks'> | null | undefined): Ocupado[] {
  if (!snapshot) return []
  return [
    ...snapshot.events.map(e => ({ start: e.start, end: e.end, allDay: e.allDay, de: e.de ?? null, rechazado: !!e.attendees?.some(a => a.self && a.response === 'declined') })),
    ...snapshot.tasks.filter(t => !t.completed && t.due?.includes('T')).map(t => ({ start: t.due!, end: new Date(Date.parse(t.due!) + (t.durationMinutes ?? 30) * 60_000).toISOString() })),
  ]
}

/**
 * Dejar un video para después. Una sola puerta para la hoja y para mover desde la cola:
 *  · sin hora → solo la cola (y si ya tenía bloque, el bloque se queda donde estaba: borrar es decisión del dueño);
 *  · con hora y ya tenía bloque → se MUEVE ese bloque;
 *  · con hora y sin bloque → se crea UNO;
 *  · con hora pero sin calendario propio (la copia del alumno sin calendario conectado) → queda en la cola con su hora,
 *    sin bloque, y se dice.
 */
export async function agendar({ mutar, snapshot, video, previo, inicio, minutos, origen, zona }: {
  mutar: Mutar; snapshot: PlanningSnapshot | null; video: FichaVideo; previo: { cuando: string | null; evento: EventoRef | null } | null
  inicio: Date | null; minutos: number; origen: string; zona: string
}): Promise<{ cuando: string | null; evento: EventoRef | null; creado: PlanEvent | null; movido: boolean; sinCalendario: boolean }> {
  if (!inicio) return { cuando: null, evento: null, creado: null, movido: false, sinCalendario: false }
  const cuando = inicio.toISOString()
  if (snapshot && previo?.evento) {
    const ev = await moverBloque({ mutar, snapshot, ref: previo.evento, video, antes: previo.cuando, inicio, minutos })
    return { cuando, evento: refDe(ev), creado: null, movido: true, sinCalendario: false }
  }
  if (snapshot && calendarioDestino(snapshot)) {
    const ev = await crearBloque({ mutar, snapshot, video, inicio, minutos, origen, zona })
    return { cuando, evento: refDe(ev), creado: ev, movido: false, sinCalendario: false }
  }
  return { cuando, evento: null, creado: null, movido: false, sinCalendario: true }
}
