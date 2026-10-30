import { addDays, parseISO, startOfDay } from 'date-fns'
import type { PlanEvent, PlanTask } from './types'
import type { Goal } from '@/features/goals/model'
import { TRAMO } from './semana-horas'

/**
 * Modelo de la hoja del día (Calendario › Día, 5 oct 2026): lo que trae la Cabina v2 al calendario. Puro y sin React:
 * qué bloques caen en el día, cuál está en curso, cuál sigue y la forma del día para el riel.
 */
export interface Bloque { id: string; titulo: string; inicio: number; fin: number; color: string | null; evento: PlanEvent }

/** Eventos con hora que tocan el día civil `dia` (sin los calendarios de objetivos ni los ocultos por filtro). Los de todo el día van aparte. */
export function bloquesDelDia(eventos: PlanEvent[], dia: Date, visible: (e: PlanEvent) => boolean, color: (e: PlanEvent) => string | null) {
  const desde = startOfDay(dia).getTime(), hasta = addDays(startOfDay(dia), 1).getTime()
  const delDia = eventos.filter(visible).filter(e => {
    const a = parseISO(e.start).getTime(), b = parseISO(e.end).getTime()
    return a < hasta && (b > desde || (a === b && a >= desde))
  })
  const conHora: Bloque[] = delDia.filter(e => !e.allDay).map(e => ({ id: e.id, titulo: e.title, inicio: Math.max(desde, parseISO(e.start).getTime()), fin: Math.min(hasta, parseISO(e.end).getTime()), color: color(e), evento: e }))
    .sort((a, b) => a.inicio - b.inicio || a.fin - b.fin)
  return { conHora, todoElDia: delDia.filter(e => e.allDay) }
}

/** El bloque en curso (el que empezó más tarde si se enciman) y el siguiente que aún no empieza. */
export function enCurso(bloques: Bloque[], ahora: number): { actual?: Bloque; sigue?: Bloque } {
  const vivos = bloques.filter(b => b.inicio <= ahora && ahora < b.fin)
  return { actual: vivos.at(-1), sigue: bloques.find(b => b.inicio > ahora) }
}

/** «1 h 30 min», «45 min», «2 h». */
export function duracion(min: number): string {
  const m = Math.max(0, Math.round(min)), h = Math.floor(m / 60), r = m % 60
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`
}

/** «en 40 min», «en 2 h», «en 1 h 15 min». */
export const faltan = (min: number) => `en ${duracion(Math.max(1, min))}`

/** Tramo visible del riel en minutos del día: de 06:00 (o antes si hay algo antes) a 22:00 (o después), en horas cerradas. */
export function tramoRiel(bloques: Bloque[], dia: Date): { desde: number; hasta: number } {
  const base = startOfDay(dia).getTime(), min = (t: number) => (t - base) / 60000
  const ini = Math.min(6 * 60, ...bloques.map(b => min(b.inicio))), fin = Math.max(22 * 60, ...bloques.map(b => min(b.fin)))
  return { desde: Math.max(0, Math.floor(ini / 60) * 60), hasta: Math.min(24 * 60, Math.ceil(fin / 60) * 60) }
}

/** Qué fracción (0..1) del bloque ya pasó. */
export const avance = (b: Bloque, ahora: number) => Math.max(0, Math.min(1, (ahora - b.inicio) / Math.max(1, b.fin - b.inicio)))

/**
 * Objetivo del día cumplido (5 oct 2026, Daniel: «una ESTRELLA para marcarlo como cumplido»). Decisión: se escribe donde
 * vive el objetivo, sin borrar nada.
 *  1. En Google, el evento del calendario «Objetivo del dia» lleva `✓ ` al inicio del título. Se ve igual en el teléfono
 *     y en Google Calendar, es reversible (tocar la estrella otra vez lo quita) y no necesita campos ocultos.
 *     La lectura (`splitLabel`) ya ignora lo que no es letra al inicio, así que el título se sigue viendo limpio.
 *  2. El hábito `objetivo_dia`: la casa ya lo define como el cumplimiento del objetivo (plasticidad, rachas). La estrella lo
 *     marca también; por eso en la hoja del día ese hábito no se repite en la banda.
 * Cumplido = cualquiera de los dos (o el registro de objetivos en «Cumplido»).
 */
export const MARCA_CUMPLIDO = '✓'
export const tituloCumplido = (titulo: string) => /^\s*✓/.test(titulo)
export function conMarca(titulo: string, cumplido: boolean): string {
  const limpio = titulo.replace(/^\s*✓\s*/, '')
  return cumplido ? `${MARCA_CUMPLIDO} ${limpio}` : limpio
}

/** El evento del calendario «Objetivo del dia» que cubre `dia` (el editable primero). */
export function eventoObjetivoDelDia(eventos: PlanEvent[], fuentes: { id: string; title: string; objective: boolean }[], dia: string): PlanEvent | null {
  const delDia = new Set(fuentes.filter(f => f.objective && /^objetivo del d[ií]a/i.test(f.title.trim())).map(f => f.id))
  const cubre = (e: PlanEvent) => e.allDay ? e.start.slice(0, 10) <= dia && e.end.slice(0, 10) > dia
    : dayKeyLocal(parseISO(e.start)) <= dia && dayKeyLocal(new Date(parseISO(e.end).getTime() - 1)) >= dia
  const candidatos = eventos.filter(e => delDia.has(e.sourceId) && cubre(e))
  return candidatos.find(e => e.editable) ?? candidatos[0] ?? null
}
const dayKeyLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Carriles de la agenda mini (5 oct 2026, «la mitad de la pantalla con el día en horas, como una agenda miniatura»): los
 * bloques que se enciman se reparten lado a lado. Cada grupo de empalmes usa las columnas que necesita, no más.
 */
export function carriles(bloques: Bloque[]): Map<string, { col: number; cols: number }> {
  const res = new Map<string, { col: number; cols: number }>()
  let grupo: { b: Bloque; col: number }[] = [], finGrupo = -Infinity
  const cerrar = () => { const cols = Math.max(1, ...grupo.map(g => g.col + 1)); for (const g of grupo) res.set(g.b.id, { col: g.col, cols }) }
  for (const b of [...bloques].sort((x, y) => x.inicio - y.inicio || y.fin - x.fin)) {
    if (b.inicio >= finGrupo && grupo.length) { cerrar(); grupo = [] }
    const ocupadas = new Set(grupo.filter(g => g.b.fin > b.inicio).map(g => g.col))
    let col = 0; while (ocupadas.has(col)) col++
    grupo.push({ b, col }); finGrupo = Math.max(finGrupo === -Infinity ? b.fin : finGrupo, b.fin)
  }
  if (grupo.length) cerrar()
  return res
}

/**
 * El objetivo del día es una TAREA (5 oct 2026, 17:48): la de Todoist con la etiqueta `objetivo` y fecha de ese día.
 * La etiqueta es el ancla (explícita, sobrevive a cambiar el título, se ve en Todoist); la P1 la pone la hoja al crearla.
 * Abierta o ya completada ese día (para que la estrella se vea llena). Si hay varias, la de mayor prioridad.
 */
export const ETIQUETA_OBJETIVO = 'objetivo'
export function tareaObjetivo(abiertas: PlanTask[], completadas: PlanTask[], dia: string, diaDe: (t: PlanTask) => string | null): { tarea: PlanTask; hecha: boolean } | null {
  const marcada = (t: PlanTask) => (t.labels ?? []).some(l => l.toLowerCase() === ETIQUETA_OBJETIVO)
  const abierta = abiertas.filter(t => marcada(t) && !t.completed && diaDe(t) === dia).sort((a, b) => a.priority - b.priority)[0]
  if (abierta) return { tarea: abierta, hecha: false }
  const hecha = completadas.find(t => marcada(t) && (diaDe(t) === dia || (t.completedAt ? dayKeyLocal(new Date(t.completedAt)) === dia : false)))
  return hecha ? { tarea: hecha, hecha: true } : null
}

/**
 * Todos los objetivos del día (v0.2.6; un fundador definió 3 y el Día solo enseñaba 1). Un día puede tener varios:
 * las tareas con la etiqueta `objetivo` de ese día, los objetivos de día del registro y las casillas `- [ ]` del bloque
 * del día en `objetivos.md` (contexto heredado). Sin duplicados por título, en ese orden; el primero es el que ya
 * pintaba la caja. Pura.
 */
export interface ObjetivoDelDia { titulo: string; hecho: boolean; origen: 'tarea' | 'plan' | 'casilla' }
export function objetivosDelDia(i: {
  dia: string; abiertas: PlanTask[]; completadas: PlanTask[]; diaDe: (t: PlanTask) => string | null
  goals?: Goal[]; contexto?: { scope: string; start: string; text: string }[]
}): ObjetivoDelDia[] {
  const marcada = (t: PlanTask) => (t.labels ?? []).some(l => l.toLowerCase() === ETIQUETA_OBJETIVO)
  const limpio = (s: string) => s.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '').trim()
  const clave = (s: string) => limpio(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ')
  const out: ObjetivoDelDia[] = [], vistos = new Set<string>()
  const poner = (titulo: string, hecho: boolean, origen: ObjetivoDelDia['origen']) => {
    const k = clave(titulo)
    if (!k || vistos.has(k)) return
    vistos.add(k); out.push({ titulo: limpio(titulo), hecho, origen })
  }
  for (const t of [...i.abiertas].filter(t => marcada(t) && !t.completed && i.diaDe(t) === i.dia).sort((a, b) => a.priority - b.priority)) poner(t.title, false, 'tarea')
  for (const t of i.completadas.filter(t => marcada(t) && (i.diaDe(t) === i.dia || (t.completedAt ? dayKeyLocal(new Date(t.completedAt)) === i.dia : false)))) poner(t.title, true, 'tarea')
  for (const g of (i.goals ?? []).filter(g => g.scope === 'day' && g.start <= i.dia && g.end > i.dia)) poner(g.title, g.status === 'completed', 'plan')
  for (const c of (i.contexto ?? []).filter(c => c.scope === 'day' && c.start === i.dia)) poner(c.text, false, 'casilla')
  return out
}

/**
 * Tramo de la agenda del Día (10 oct 2026): siempre el TRAMO de la
 * Semana), y más si algo del día cae fuera, en horas cerradas. Nunca empieza en el ahora ni corta temprano.
 */
export function tramoDia(bloques: { inicio: number; fin: number }[], dia: Date, tramo: { desde: number; hasta: number } = TRAMO): { desde: number; hasta: number } {
  const base = new Date(dia).setHours(0, 0, 0, 0), min = (t: number) => (t - base) / 60000
  const ini = Math.min(tramo.desde * 60, ...bloques.map(b => min(b.inicio))), fin = Math.max(tramo.hasta * 60, ...bloques.map(b => min(b.fin)))
  return { desde: Math.max(0, Math.floor(ini / 60) * 60), hasta: Math.min(1440, Math.ceil(fin / 60) * 60) }
}

/**
 * Las casillas del objetivo del día (10 oct 2026, Daniel: «al darle clic simplemente me aparezcan los checkbox… toma de
 * referencia la de la semana»). Viven en la MISMA fuente que da el título, como texto `- [ ] …`, para no inventar un almacén:
 *   tarea con etiqueta `objetivo` → su descripción en Todoist;
 *   registro de objetivos (`scope: day`) → su «cómo se comprueba» (`success`), igual que la semana;
 *   evento «Objetivo del dia» de Google → su descripción.
 * `null` si el título viene de un lugar que no se puede escribir (o no hay objetivo).
 */
export type FuenteCasillas = { origen: 'tarea'; texto: string; tarea: PlanTask } | { origen: 'plan'; texto: string } | { origen: 'evento'; texto: string; evento: PlanEvent }
export function casillasDelDia(ancla: { tarea: PlanTask } | null, plan: { success: string } | null, evento: PlanEvent | null): FuenteCasillas | null {
  if (ancla) return { origen: 'tarea', texto: ancla.tarea.description ?? '', tarea: ancla.tarea }
  if (plan) return { origen: 'plan', texto: plan.success }
  if (evento?.editable) return { origen: 'evento', texto: evento.description ?? '', evento }
  return null
}
