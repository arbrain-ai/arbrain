/**
 * Lectura compartida del calendario para las vistas de la Cabina (día, semana,
 * mes): agrupar por día civil, separar metas de varios días, distinguir la
 * rutina (lo que se repite casi a diario) de lo que sí cambia, y escribir en
 * Todoist con la misma pluma que el calendario completo.
 */
import type { PlanningSnapshot, PlanEvent, PlanTask, PlanMutation } from '@/features/planning/types'
import { mutationFor } from '@/features/planning/model'
import { esFase, esMecanicaAlumno } from '@/features/planning/drip'
import { refrescarCabina } from '../datos'
import { zonaCabina, sumarDias } from '../model'

export interface Item { id: string; titulo: string; hora?: string; inicio?: number; fin?: number; orden: number; color: string; peso: number; objetivo: boolean; url?: string; tarea?: PlanTask; recurrente?: boolean }
export interface Banda { id: string; titulo: string; desde: string; hasta: string; color: string }

/** Formateador en la zona del dueño (instalación original: México; alumno: la suya), memorizado por zona. */
function enZona(locale: string, o: Intl.DateTimeFormatOptions) {
  const cache = new Map<string, Intl.DateTimeFormat>()
  return { format: (d: Date | number) => {
    const z = zonaCabina()
    let f = cache.get(z)
    if (!f) { f = new Intl.DateTimeFormat(locale, { ...o, timeZone: z }); cache.set(z, f) }
    return f.format(d)
  } }
}
export const hora = enZona('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
export const diaDe = enZona('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
const minutosDe = enZona('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Minutos desde la medianoche civil del dueño. */
export function minutosCiviles(ms: number) { const [h, m] = minutosDe.format(new Date(ms)).split(':').map(Number); return (h % 24) * 60 + m }
export function duracion(min: number) { if (min < 60) return `${min} min`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${m} min` : `${h} h` }
export function faltan(min: number) { return min < 1 ? 'ya' : min < 60 ? `en ${min} min` : `en ${duracion(min)}` }

/** Agrupa eventos y tareas por día civil. Las metas de varios días (calendarios de
 *  objetivos) no se repiten en cada celda: van como bandas. */
export function porDia(snap: PlanningSnapshot | undefined) {
  const mapa = new Map<string, Item[]>(), bandas: Banda[] = [], tramos: Banda[] = []
  if (!snap) return { mapa, bandas, tramos }
  const fuentes = new Map(snap.sources.map(f => [f.id, f]))
  const push = (d: string, it: Item) => { const l = mapa.get(d) ?? []; l.push(it); mapa.set(d, l) }
  for (const e of snap.events as PlanEvent[]) {
    // «🔓 Abre … en el classroom» es para los alumnos: no se pinta en el calendario de Daniel (drip.ts `esMecanicaAlumno`).
    if (esMecanicaAlumno(e)) continue
    const f = fuentes.get(e.sourceId)
    const base = { id: e.id, titulo: e.title || '(sin título)', color: f?.color ?? 'var(--brand)', objetivo: !!f?.objective, url: e.url, recurrente: !!e.recurringEventId }
    if (e.allDay && f?.objective && sumarDias(e.start.slice(0, 10), 1) < e.end.slice(0, 10)) {
      bandas.push({ id: e.id, titulo: e.title, desde: e.start.slice(0, 10), hasta: e.end.slice(0, 10), color: f.color ?? 'var(--gold)' })
      continue
    }
    if (e.allDay && sumarDias(e.start.slice(0, 10), 1) < e.end.slice(0, 10)) {
      tramos.push({ id: e.id, titulo: e.title, desde: e.start.slice(0, 10), hasta: e.end.slice(0, 10), color: f?.color ?? 'var(--brand)' })
    }
    // Las fases del programa viven solo como tramo (el Mes): el Día y la Semana no las repiten en cada celda (25 oct 2026).
    if (esFase(e)) continue
    if (e.allDay) {
      for (let d = e.start.slice(0, 10); d < e.end.slice(0, 10); d = sumarDias(d, 1)) push(d, { ...base, orden: -1, peso: f?.objective ? 0 : 1 })
      continue
    }
    const ini = new Date(e.start), fin = new Date(e.end)
    push(diaDe.format(ini), { ...base, hora: hora.format(ini), inicio: ini.getTime(), fin: fin.getTime(), orden: ini.getTime(), peso: f?.objective ? 0 : e.recurringEventId ? 3 : 2 })
  }
  for (const t of snap.tasks as PlanTask[]) {
    if (!t.due || t.completed) continue
    const d = t.due.includes('T') ? diaDe.format(new Date(t.due)) : t.due.slice(0, 10)
    push(d, { id: t.id, titulo: t.title, orden: Number.MAX_SAFE_INTEGER, color: 'var(--gold)', peso: 4, objetivo: false, url: t.url, tarea: t })
  }
  for (const l of mapa.values()) l.sort((a, b) => a.orden - b.orden)
  return { mapa, bandas, tramos }
}

/** La meta de varios días que MÁS cubre este tramo (se enciman un día en el relevo). */
export function bandaDe(bandas: Banda[], desde: string, dias = 7): Banda | null {
  const hasta = sumarDias(desde, dias)
  const cubre = (b: Banda) => { let n = 0; for (let d = desde; d < hasta; d = sumarDias(d, 1)) if (b.desde <= d && d < b.hasta) n++; return n }
  return bandas.map(b => ({ b, n: cubre(b) })).filter(x => x.n > 0).sort((x, y) => y.n - x.n)[0]?.b ?? null
}

/** La rutina: eventos recurrentes cuyo título aparece en al menos `umbral` días del
 *  tramo a la misma hora. Se nombra UNA vez; cada día muestra solo lo distinto. */
export function rutinaDe(mapa: Map<string, Item[]>, dias: string[], umbral = 4) {
  const veces = new Map<string, { hora: string; titulo: string; dias: Set<string> }>()
  for (const d of dias) for (const it of mapa.get(d) ?? []) {
    if (!it.recurrente || !it.hora || it.tarea) continue
    const k = `${it.hora}|${it.titulo}`
    const v = veces.get(k) ?? { hora: it.hora, titulo: it.titulo, dias: new Set<string>() }
    v.dias.add(d); veces.set(k, v)
  }
  const claves = new Set([...veces.entries()].filter(([, v]) => v.dias.size >= Math.min(umbral, dias.length)).map(([k]) => k))
  const lista = [...veces.entries()].filter(([k]) => claves.has(k)).map(([, v]) => v).sort((a, b) => a.hora.localeCompare(b.hora))
  return { claves, lista, esRutina: (it: Item) => !!it.hora && claves.has(`${it.hora}|${it.titulo}`) }
}

/** Título sin el emoji inicial (para listas densas donde el emoji ya no cabe). */
export const sinEmoji = (t: string) => t.replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u, '').trim() || t

/** Tareas abiertas del día; si el día es hoy, también las atrasadas (primero). */
export function tareasDe(snap: PlanningSnapshot | undefined, dia: string, hoy: string): PlanTask[] {
  if (!snap) return []
  const fecha = (t: PlanTask) => !t.due ? null : t.due.includes('T') ? diaDe.format(new Date(t.due)) : t.due.slice(0, 10)
  return (snap.tasks as PlanTask[])
    .filter(t => !t.completed && fecha(t) != null && (fecha(t) === dia || (dia === hoy && fecha(t)! < dia)))
    .sort((a, b) => Number(fecha(b)! < dia) - Number(fecha(a)! < dia) || (a.priority || 4) - (b.priority || 4) || a.title.localeCompare(b.title))
}
export function atrasada(t: PlanTask, dia: string) { const f = t.due ? (t.due.includes('T') ? diaDe.format(new Date(t.due)) : t.due.slice(0, 10)) : null; return !!f && f < dia }

/** Escribe en Todoist por la misma pluma que el calendario completo. */
export async function mutarTarea(t: PlanTask, ownerId: string, accion: 'complete' | 'reopen') {
  const base: PlanMutation = mutationFor(t, ownerId, {}, accion)
  // Deshacer no compara la versión: la tarea acaba de cambiar por este mismo clic.
  const op = accion === 'reopen' ? { ...base, updatedAt: undefined } : base
  const r = await fetch('/api/planning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op), signal: AbortSignal.timeout(100_000) })
  const b = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(b?.error ?? 'Todoist no confirmó el cambio.')
  refrescarCabina(1200)
  return b
}
