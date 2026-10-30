import { addDays, addMinutes, differenceInMinutes, format, isSameDay, nextMonday, nextSaturday, parseISO, startOfMonth, startOfWeek, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { dayKey, hasTime, taskStart } from './model'
import type { PlanItem, PlanningSnapshot } from './types'

/** La hoja de detalle (5 oct 2026, «dame lo mejor que te imagines»): lógica pura, sin React. El borrador
 *  no guarda `datetime-local` sino sus partes (día, hora, minutos), que es como se eligen con los chips. */
export interface Borrador {
  kind: 'event' | 'task'
  title: string
  description: string
  location: string
  sourceId: string
  projectId: string
  priority: number
  /** `yyyy-MM-dd`; vacío = sin fecha (solo tareas). */
  day: string
  /** `HH:mm`; vacío = sin hora (tarea) o todo el día (evento). */
  time: string
  /** Duración con hora. */
  minutes: number
  /** Último día (inclusivo) de un evento de todo el día. */
  endDay: string
  repeat: string
  /** Etiquetas de Todoist al crear (la del objetivo del día). */
  labels?: string[]
}

export interface Semilla { item?: PlanItem; start?: Date; end?: Date; allDay?: boolean; kind?: 'event' | 'task'
  /** Tarea nueva prellenada (5 oct 2026, anclar el objetivo del día): título, prioridad y etiquetas. */
  titulo?: string; prioridad?: number; etiquetas?: string[] }

const hora = (d: Date) => format(d, 'HH:mm')

export function borradorDe(seed: Semilla, snapshot: Pick<PlanningSnapshot, 'sources'>): Borrador {
  const item = seed.item
  const first = snapshot.sources.find(s => s.editable && !s.objective)
  const base = { title: item?.title ?? seed.titulo ?? '', description: item?.description ?? '', location: '', sourceId: first?.id ?? '', projectId: '', priority: item ? 4 : seed.prioridad ?? 4, repeat: '',
    ...(!item && seed.etiquetas?.length ? { labels: seed.etiquetas } : {}) }
  if (item?.kind === 'event') {
    const start = parseISO(item.start), end = parseISO(item.end)
    return { ...base, kind: 'event', location: item.location, sourceId: item.sourceId, day: dayKey(start),
      time: item.allDay ? '' : hora(start), minutes: item.allDay ? 60 : Math.max(5, differenceInMinutes(end, start)),
      endDay: item.allDay ? dayKey(subDays(end, 1)) : dayKey(start) }
  }
  if (item?.kind === 'task') {
    const start = taskStart(item)
    return { ...base, kind: 'task', projectId: item.projectId ?? '', priority: item.priority, day: start ? dayKey(start) : '',
      time: start && hasTime(item.due) ? hora(start) : '', minutes: item.durationMinutes ?? 30, endDay: start ? dayKey(start) : '' }
  }
  const kind = seed.kind ?? 'event'
  // «Ahora» (N o +) arranca en la siguiente media hora; un rango arrastrado se respeta al minuto.
  const start = seed.start && (seed.end || seed.allDay) ? seed.start : seed.start ? proximaMediaHora(seed.start) : kind === 'event' ? proximaMediaHora(new Date()) : null
  const allDay = seed.allDay ?? false
  const end = seed.end ?? (start ? addMinutes(start, 60) : null)
  if (!start) return { ...base, kind, day: '', time: '', minutes: 30, endDay: '' }
  return { ...base, kind, day: dayKey(start), time: allDay ? '' : hora(start),
    minutes: allDay || !end ? (kind === 'task' ? 30 : 60) : Math.max(5, differenceInMinutes(end, start)),
    endDay: allDay && end && seed.end ? dayKey(subDays(end, 1)) : dayKey(start) }
}

export function proximaMediaHora(now: Date) {
  const d = new Date(now); d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60)
  return d
}

const local = (day: string, time: string) => parseISO(`${day}T${time || '00:00'}`)

/** Datos para la pluma (`mc-event.py planning`). Lanza un Error legible si el borrador no se puede guardar. */
export function datosDe(b: Borrador, timeZone: string): Record<string, unknown> {
  if (!b.title.trim()) throw new Error('Dale un nombre antes de guardar.')
  if (b.kind === 'event') {
    if (!b.day) throw new Error('Elige un día.')
    if (!b.time) {
      const last = b.endDay && b.endDay >= b.day ? b.endDay : b.day
      return { title: b.title, description: b.description, location: b.location, allDay: true, start: b.day, end: dayKey(addDays(parseISO(last), 1)), timeZone,
        ...(b.repeat ? { recurrence: [b.repeat] } : {}) }
    }
    const start = local(b.day, b.time)
    return { title: b.title, description: b.description, location: b.location, allDay: false, start: start.toISOString(),
      end: addMinutes(start, Math.max(5, b.minutes)).toISOString(), timeZone, ...(b.repeat ? { recurrence: [b.repeat] } : {}) }
  }
  return { title: b.title, description: b.description, priority: b.priority, projectId: b.projectId || undefined,
    due: !b.day ? null : b.time ? local(b.day, b.time).toISOString() : b.day,
    durationMinutes: b.day && b.time ? Math.min(1440, Math.max(1, b.minutes)) : null, ...(b.labels?.length ? { labels: b.labels } : {}) }
}

/** Solo lo que cambió: una tarea recurrente no recibe su fecha de vuelta si nadie la tocó. */
export function cambios(b: Borrador, base: Borrador) {
  const keys = ['title', 'description', 'location', 'priority', 'projectId', 'day', 'time', 'minutes', 'endDay', 'sourceId'] as const
  return keys.filter(k => {
    if (b.kind === 'task' && (k === 'location' || k === 'sourceId' || k === 'endDay')) return false
    if (b.kind === 'event' && (k === 'priority' || k === 'projectId')) return false
    if (k === 'minutes' && !b.time && !base.time) return false
    if (k === 'endDay' && b.time && base.time) return false
    return b[k] !== base[k]
  })
}

/** Datos de una actualización: en tareas, el título siempre (la pluma lo exige) y solo los campos tocados. */
export function datosDeCambio(b: Borrador, base: Borrador, timeZone: string, tocadas: Iterable<string> = []) {
  const full = datosDe(b, timeZone)
  if (b.kind === 'event') { const { recurrence: _omit, ...rest } = full; return rest }
  // Lo tocado en la sesión también viaja: deshacer hasta el valor original lo escribe de vuelta.
  const changed = new Set<string>([...cambios(b, base), ...tocadas])
  const data: Record<string, unknown> = { title: full.title }
  if (changed.has('description')) data.description = full.description
  if (changed.has('priority')) data.priority = full.priority
  if (changed.has('day') || changed.has('time') || changed.has('minutes')) { data.due = full.due; data.durationMinutes = full.durationMinutes }
  return data
}

export interface FechaRapida { id: string; label: string; day: string; hint: string }
export function fechasRapidas(hoy: Date): FechaRapida[] {
  const dia = (d: Date) => format(d, 'EEE', { locale: es }).replace('.', '')
  const sabado = hoy.getDay() === 6 ? hoy : nextSaturday(hoy)
  const lunes = nextMonday(hoy)
  return [
    { id: 'hoy', label: 'Hoy', day: dayKey(hoy), hint: dia(hoy) },
    { id: 'manana', label: 'Mañana', day: dayKey(addDays(hoy, 1)), hint: dia(addDays(hoy, 1)) },
    { id: 'finde', label: 'Este fin', day: dayKey(sabado), hint: format(sabado, 'EEE d', { locale: es }).replace('.', '') },
    { id: 'semana', label: 'Próx. semana', day: dayKey(lunes), hint: format(lunes, 'EEE d', { locale: es }).replace('.', '') },
  ]
}

export function etiquetaDuracion(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60), m = minutes % 60
  return m ? `${h} h ${m}` : `${h} h`
}

export type Tono = 'vacia' | 'vencida' | 'hoy' | 'normal'
export function etiquetaFecha(b: Pick<Borrador, 'kind' | 'day' | 'time' | 'minutes' | 'endDay'>, hoy = new Date()): { texto: string; tono: Tono } {
  if (!b.day) return { texto: 'Sin fecha', tono: 'vacia' }
  const d = parseISO(b.day)
  const manana = addDays(hoy, 1), ayer = subDays(hoy, 1)
  const nombre = isSameDay(d, hoy) ? 'Hoy' : isSameDay(d, manana) ? 'Mañana' : isSameDay(d, ayer) ? 'Ayer'
    : format(d, d.getFullYear() === hoy.getFullYear() ? 'EEE d MMM' : 'EEE d MMM yyyy', { locale: es }).replace(/\./g, '')
  let texto = nombre
  if (b.time) {
    const fin = addMinutes(local(b.day, b.time), b.minutes)
    texto += b.kind === 'event' || b.minutes ? ` · ${b.time} – ${hora(fin)}` : ` · ${b.time}`
  } else if (b.kind === 'event' && b.endDay && b.endDay > b.day) {
    texto += ` → ${format(parseISO(b.endDay), 'EEE d MMM', { locale: es }).replace(/\./g, '')}`
  }
  const vencida = b.kind === 'task' && (b.time ? addMinutes(local(b.day, b.time), b.minutes) < hoy : b.day < dayKey(hoy))
  return { texto, tono: vencida ? 'vencida' : isSameDay(d, hoy) ? 'hoy' : 'normal' }
}

/** «9», «930», «9:30», «9.30», «9pm», «9:30 pm», «21h» → `HH:mm`. */
export function leerHora(texto: string): string | null {
  const t = texto.trim().toLowerCase().replace(/\s+/g, '').replace(/h$/, '')
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?(am|pm|a\.m\.|p\.m\.)?$/.exec(t)
  if (!m) return null
  let h = Number(m[1]); const min = Number(m[2] ?? 0)
  const suf = m[3]?.[0]
  if (suf === 'p' && h < 12) h += 12
  if (suf === 'a' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export const HORAS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)
export const DURACIONES = [15, 30, 45, 60, 90, 120]

export interface Enlace { url: string; host: string; etiqueta: string; tipo: 'meet' | 'doc' | 'drive' | 'video' | 'codigo' | 'web' }
/** Enlaces del título, el contexto y el lugar; sin repetir y en orden de aparición. */
export function enlaces(textos: string[]): Enlace[] {
  const vistos = new Set<string>(), out: Enlace[] = []
  for (const texto of textos) {
    for (const raw of texto.match(/https?:\/\/[^\s<>()\]"'`]+/g) ?? []) {
      const url = raw.replace(/[.,;:!?)»]+$/, '')
      if (vistos.has(url)) continue
      let parsed: URL
      try { parsed = new URL(url) } catch { continue }
      vistos.add(url)
      const host = parsed.hostname.replace(/^www\./, '')
      const tipo: Enlace['tipo'] = /meet\.google|zoom\.us|teams\.microsoft/.test(host) ? 'meet'
        : host === 'docs.google.com' ? 'doc' : host === 'drive.google.com' ? 'drive'
        : /youtube\.com|youtu\.be|loom\.com|vimeo\.com/.test(host) ? 'video' : /github\.com|gitlab\.com/.test(host) ? 'codigo' : 'web'
      const etiqueta = tipo === 'doc' ? (parsed.pathname.includes('/spreadsheets') ? 'Hoja de Google' : parsed.pathname.includes('/presentation') ? 'Presentación de Google' : 'Documento de Google')
        : tipo === 'drive' ? 'Archivo en Drive' : tipo === 'meet' ? 'Videollamada'
        : tipo === 'codigo' ? parsed.pathname.split('/').filter(Boolean).slice(0, 2).join('/') || host
        : decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) ?? '').replace(/[-_]+/g, ' ').slice(0, 60) || host
      out.push({ url, host, etiqueta, tipo })
    }
  }
  return out
}

/** Semanas (lunes primero) del mes de `mes`, para el selector de fecha. */
export function semanasDelMes(mes: Date): Date[][] {
  const inicio = startOfWeek(startOfMonth(mes), { weekStartsOn: 1 })
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(inicio, w * 7 + d)))
}

/** Lo que Levy recibe al «Conversar sobre esto»: el elemento, su fuente y la regla de escribir por la pluma. */
export function borradorConversacion(item: PlanItem, proyecto?: string, calendario?: string) {
  if (item.kind === 'task') return `Hablemos de esta tarea de Todoist: «${item.title}» (id ${item.externalId}${proyecto ? `, proyecto ${proyecto}` : ''}${item.due ? `, fecha ${item.due}` : ', sin fecha'}).${item.description ? `\n\nContexto:\n${item.description}` : ''}\n\nAyúdame a pensar el siguiente paso. Si hay que cambiarla, hazlo por la pluma de planificación (mc-event.py planning) y confírmamelo antes.`
  return `Hablemos de este evento del calendario: «${item.title}» (${item.allDay ? item.start : `${item.start} → ${item.end}`}${calendario ? `, calendario ${calendario}` : ''}).${item.description ? `\n\nDescripción:\n${item.description}` : ''}\n\nAyúdame a prepararlo. Si hay que moverlo o editarlo, hazlo por mc-event.py y confírmamelo antes.`
}
