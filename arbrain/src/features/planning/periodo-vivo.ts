import { addDays, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { period, statusLabels, taskDay, type Goal, type GoalStatus, type Horizon } from '@/features/goals/model'
import { focusFor } from '@/features/goals/hoy-model'
import { bloquesDelDia, type Bloque } from './dia-vivo'
import type { CalendarMode, PlanEvent, PlanTask, PlanningSnapshot } from './types'

/**
 * Modelo de las escalas vivas (Calendario › 4 días, Semana y Mes, 5 oct 2026). Puro y sin React.
 * Pedido de Daniel: «hagamos algo similar [al Día] con las vistas de 4 días, semana y mes… imagina cómo lo haría Notion Calendar».
 */

const civil = (d: Date) => format(d, 'yyyy-MM-dd')
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** El objetivo de un periodo, igual en las cuatro escalas (antes el Día lo daba por firme y la Semana decía «En planificación»). */
export interface ObjetivoPeriodo {
  id: string; titulo: string
  /** «Semana 2» cuando el calendario lo rotula así (también si el registro manda y el calendario lo espeja). */
  etiqueta: string | null
  estado: GoalStatus | null; exito: string; resto: number; origen: 'plan' | 'calendario'
  /** El evento de Google que lo respalda (el suyo o el espejo del registro): ahí escribe la estrella su «✓». */
  eventoId: string | null
}

/** Registro de objetivos primero (`.claude/plan/objetivos.md`); si no tiene, el evento «Objetivo de …» de Google que cubre ese día. */
export function objetivoDe(goals: Goal[], snapshot: PlanningSnapshot | null, horizonte: Horizon, dia: string): ObjetivoPeriodo | null {
  const p = period(horizonte, dia)
  // Del periodo exacto (el que empieza donde empieza el periodo) y, si no, el que lo cubre.
  const propias = goals.filter(g => g.scope === horizonte && g.start === p.start)
  const cubren = propias.length ? propias : goals.filter(g => g.scope === horizonte && g.start <= dia && g.end > dia)
  const calendario = focusFor([], snapshot, dia, horizonte)
  if (cubren.length) {
    // El espejo se busca en todo el periodo: Google rotula las semanas de viernes a jueves y el registro va de lunes a domingo.
    const g = cubren[0], mismo = (f: { label: string | null; title: string }) => !!f.label && sinAcentos(f.title) === sinAcentos(g.title)
    let espejo = calendario.find(mismo)
    for (const d of horizonte === 'day' ? [] : diasEntre(g.start, g.end)) { if (espejo) break; espejo = focusFor([], snapshot, d, horizonte).find(mismo) }
    return { id: g.id, titulo: g.title, etiqueta: espejo?.label ?? null, estado: g.status, exito: g.success, resto: cubren.length - 1, origen: 'plan', eventoId: espejo?.id ?? null }
  }
  if (!calendario.length) return null
  const f = calendario[0]
  return { id: f.id, titulo: f.title, etiqueta: f.label, estado: null, exito: '', resto: calendario.length - 1, origen: 'calendario', eventoId: f.id }
}

/** El rótulo del estado, el mismo en todas las escalas: «Acordado» no se dice (es lo normal); lo demás sí. */
export const rotuloEstado = (o: Pick<ObjetivoPeriodo, 'estado' | 'origen'>) =>
  o.estado && o.estado !== 'agreed' ? statusLabels[o.estado] : o.origen === 'calendario' ? 'Calendario' : null

/** Días civiles [desde, hasta). */
export function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = []
  for (let d = parseISO(desde); civil(d) < hasta && dias.length < 62; d = addDays(d, 1)) dias.push(civil(d))
  return dias
}

/** El periodo que pinta cada escala a partir del ancla: 4 días desde el ancla, semana de lunes a domingo, mes civil. */
export function periodoDeEscala(modo: CalendarMode, ancla: Date): { desde: string; hasta: string } {
  if (modo === 'fourDays') return { desde: civil(ancla), hasta: civil(addDays(ancla, 4)) }
  if (modo === 'month') { const p = period('month', civil(ancla)); return { desde: p.start, hasta: p.end } }
  if (modo === 'week') { const lunes = startOfWeek(ancla, { weekStartsOn: 1 }); return { desde: civil(lunes), hasta: civil(addDays(lunes, 7)) } }
  return { desde: civil(ancla), hasta: civil(addDays(ancla, 1)) }
}

/** La rejilla del mes como Notion Calendar: semanas de lunes a domingo, solo las que el mes necesita (4 a 6). */
export function rejillaDelMes(ancla: Date): string[][] {
  const inicio = startOfMonth(ancla), fin = period('month', civil(ancla)).end
  const semanas: string[][] = []
  for (let lunes = startOfWeek(inicio, { weekStartsOn: 1 }); civil(lunes) < fin; lunes = addDays(lunes, 7))
    semanas.push(Array.from({ length: 7 }, (_, i) => civil(addDays(lunes, i))))
  return semanas
}

/** Agenda por día (con el mismo criterio de la hoja del día) y tareas abiertas por día. */
export function porDia(dias: string[], eventos: PlanEvent[], visible: (e: PlanEvent) => boolean, color: (e: PlanEvent) => string | null) {
  const mapa = new Map<string, { conHora: Bloque[]; todoElDia: PlanEvent[] }>()
  const vis = eventos.filter(visible)
  for (const d of dias) mapa.set(d, bloquesDelDia(vis, parseISO(d), () => true, color))
  return mapa
}

export function tareasPorDia(tareas: PlanTask[], dias: string[], zona: string): Map<string, PlanTask[]> {
  const mapa = new Map<string, PlanTask[]>(dias.map(d => [d, []]))
  for (const t of tareas) { const d = taskDay(t, zona); if (d && mapa.has(d)) mapa.get(d)!.push(t) }
  for (const lista of mapa.values()) lista.sort((a, b) => Number(a.due?.includes('T') ? 0 : 1) - Number(b.due?.includes('T') ? 0 : 1) || (a.due ?? '').localeCompare(b.due ?? '') || a.priority - b.priority)
  return mapa
}

/** Tiempo del periodo: en qué día vas (1-indexado) de cuántos, y la fracción vivida (0..1). Fuera del periodo: antes o después. */
export function tiempoDelPeriodo(desde: string, hasta: string, hoy: string, ahora = Date.now()) {
  const total = diasEntre(desde, hasta).length
  if (hoy < desde) return { total, dia: 0, fraccion: 0, estado: 'futuro' as const, faltan: diasEntre(hoy, desde).length }
  if (hoy >= hasta) return { total, dia: total, fraccion: 1, estado: 'pasado' as const, faltan: 0 }
  const dia = diasEntre(desde, hoy).length + 1
  const hora = new Date(ahora), del = (hora.getHours() * 60 + hora.getMinutes()) / 1440
  return { total, dia, fraccion: Math.min(1, (dia - 1 + del) / total), estado: 'actual' as const, faltan: total - dia }
}

/** Tareas del periodo: hechas (completadas con fecha de cierre en el periodo) y pendientes. */
export function avanceDeTareas(abiertas: PlanTask[], completadas: PlanTask[] | undefined, desde: string, hasta: string, zona: string) {
  const hechas = (completadas ?? []).filter(t => { const d = t.completedAt ? civilEn(t.completedAt, zona) : null; return !!d && d >= desde && d < hasta }).length
  return { hechas, pendientes: abiertas.length, total: hechas + abiertas.length }
}
function civilEn(iso: string, zona: string) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) } catch { return iso.slice(0, 10) }
}

/** Las semanas del mes con su objetivo (registro; si no, el del calendario): la pista del objetivo del mes. */
export function semanasDelMes(goals: Goal[], snapshot: PlanningSnapshot | null, ancla: Date) {
  return rejillaDelMes(ancla).map((dias, i) => ({ numero: i + 1, inicio: dias[0], fin: civil(addDays(parseISO(dias[0]), 7)), objetivo: objetivoDe(goals, snapshot, 'week', dias[0]) }))
}

/**
 * Densidad inteligente de una celda del mes (Notion Calendar): primero lo de todo el día, luego lo que no se repite y al final las
 * rutinas. En días pasados las rutinas se callan (eran la mitad del mes viejo); siguen en la lista del día al tocarlo.
 */
export interface Marca { id: string; titulo: string; color: string | null; hora: string | null; rutina: boolean; evento: PlanEvent }
export function marcasDelDia(dia: { conHora: Bloque[]; todoElDia: PlanEvent[] }, pasado: boolean, color: (e: PlanEvent) => string | null): Marca[] {
  const todas: Marca[] = [
    ...dia.todoElDia.map(e => ({ id: e.id, titulo: e.title, color: color(e), hora: null, rutina: Boolean(e.recurringEventId), evento: e })),
    ...dia.conHora.map(b => ({ id: b.id, titulo: b.titulo, color: b.color, hora: format(b.inicio, 'HH:mm'), rutina: Boolean(b.evento.recurringEventId), evento: b.evento })),
  ]
  const orden = (m: Marca) => (m.hora === null ? 0 : 1) + (m.rutina ? 2 : 0)
  return todas.filter(m => !(pasado && m.rutina)).sort((a, b) => orden(a) - orden(b) || (a.hora ?? '').localeCompare(b.hora ?? ''))
}

/** Un punto por calendario presente ese día (en el color del calendario), sin repetir, como Notion Calendar en el teléfono. */
export function puntosDelDia(marcas: Marca[], max = 4): { colores: (string | null)[]; resto: number } {
  const vistos: (string | null)[] = []
  for (const m of marcas) if (!vistos.includes(m.color)) vistos.push(m.color)
  return { colores: vistos.slice(0, max), resto: Math.max(0, vistos.length - max) }
}

/** Orden de las escalas para la dirección de la transición: ir a una mayor «aleja», a una menor «acerca». */
const ORDEN: Partial<Record<CalendarMode, number>> = { day: 0, fourDays: 1, week: 2, agenda: 2, month: 3, year: 4 }
export function movimientoEntre(antes: CalendarMode, despues: CalendarMode): 'acercar' | 'alejar' | null {
  const a = ORDEN[antes], b = ORDEN[despues]
  return a === undefined || b === undefined || a === b ? null : b < a ? 'acercar' : 'alejar'
}


/* ── El hilo (5 oct 2026, segunda pasada): el riel del Día es el átomo de todas las escalas. ───────────────────────────────── */

type Agenda = Map<string, { conHora: Bloque[]; todoElDia: PlanEvent[] }>
const minutoDe = (t: number, dia: string) => (t - parseISO(dia).getTime()) / 60000

/** Un solo eje de horas para todo el periodo: de 06:00 a 22:00, o más si algo cae fuera, en horas cerradas. */
export function tramoDePeriodo(agenda: Agenda): { desde: number; hasta: number } {
  let ini = 6 * 60, fin = 22 * 60
  for (const [dia, a] of agenda) for (const b of a.conHora) { ini = Math.min(ini, minutoDe(b.inicio, dia)); fin = Math.max(fin, minutoDe(b.fin, dia)) }
  return { desde: Math.max(0, Math.floor(ini / 60) * 60), hasta: Math.min(24 * 60, Math.ceil(fin / 60) * 60) }
}

/** El ritmo: lo que se repite en 3 o más días del periodo (la misma serie de Google), con su hora más común. Lo más constante primero. */
export interface Ritmo { id: string; titulo: string; hora: string; dias: number; color: string | null }
export function ritmoDe(agenda: Agenda): Ritmo[] {
  const series = new Map<string, { titulo: string; color: string | null; dias: Set<string>; horas: Map<string, number> }>()
  for (const [dia, a] of agenda) for (const b of a.conHora) {
    const id = b.evento.recurringEventId
    if (!id) continue
    const s = series.get(id) ?? { titulo: b.titulo, color: b.color, dias: new Set<string>(), horas: new Map<string, number>() }
    s.dias.add(dia); const h = format(b.inicio, 'HH:mm'); s.horas.set(h, (s.horas.get(h) ?? 0) + 1)
    series.set(id, s)
  }
  return [...series.entries()].filter(([, s]) => s.dias.size >= 3)
    .map(([id, s]) => ({ id, titulo: s.titulo, color: s.color, dias: s.dias.size, hora: [...s.horas.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.dias - a.dias || a.hora.localeCompare(b.hora)).slice(0, 3)
}

/** El hueco libre más largo de un día entre 06:00 y 22:00 (desde ahora si es hoy). Menos de 30 min no cuenta. */
export function huecoMasLargo(bloques: Bloque[], dia: string, ahora?: number): { inicio: number; fin: number } | null {
  const base = parseISO(dia).getTime(), abre = Math.max(base + 6 * 3600e3, ahora ?? 0), cierra = base + 22 * 3600e3
  if (abre >= cierra) return null
  let cursor = abre, mejor: { inicio: number; fin: number } | null = null
  const probar = (a: number, b: number) => { if (b - a >= 30 * 60e3 && (!mejor || b - a > mejor.fin - mejor.inicio)) mejor = { inicio: a, fin: b } }
  for (const b of [...bloques].sort((x, y) => x.inicio - y.inicio)) {
    if (b.fin <= cursor) continue
    if (b.inicio >= cierra) break
    probar(cursor, Math.min(b.inicio, cierra)); cursor = Math.max(cursor, b.fin)
  }
  probar(cursor, cierra)
  return mejor
}

/** Los hitos del periodo: lo que NO se repite (las rutinas son textura, no noticia), en orden. Un evento de varios días cuenta una vez. */
export interface Hito { id: string; titulo: string; inicio: string; dia: string; hora: string | null; color: string | null; evento: PlanEvent }
export function hitosDe(agenda: Agenda, color: (e: PlanEvent) => string | null): Hito[] {
  const vistos = new Map<string, Hito>()
  for (const [dia, a] of agenda) {
    for (const e of a.todoElDia) if (!e.recurringEventId && !vistos.has(e.id)) vistos.set(e.id, { id: e.id, titulo: e.title, inicio: e.start, dia, hora: null, color: color(e), evento: e })
    for (const b of a.conHora) if (!b.evento.recurringEventId && !vistos.has(b.id)) vistos.set(b.id, { id: b.id, titulo: b.titulo, inicio: b.evento.start, dia, hora: format(b.inicio, 'HH:mm'), color: b.color, evento: b.evento })
  }
  return [...vistos.values()].sort((a, b) => a.dia.localeCompare(b.dia) || (a.hora ?? '').localeCompare(b.hora ?? ''))
}

/** «hoy», «mañana», «en 12 días», «hace 3 días». */
export function cuentaA(dia: string, hoy: string): string {
  const n = dia >= hoy ? diasEntre(hoy, dia).length : -diasEntre(dia, hoy).length
  return n === 0 ? 'hoy' : n === 1 ? 'mañana' : n === -1 ? 'ayer' : n > 0 ? `en ${n} días` : `hace ${-n} días`
}
