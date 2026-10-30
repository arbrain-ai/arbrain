import type { PlanTask } from '@/features/planning/types'
import { cronologia, ordenarTareas, type OrdenTareas } from '@/features/planning/orden-tareas'

/**
 * La lista completa de Todoist dentro de Tareas (5 oct 2026, retiro de /todotask). Lógica pura, sin React
 * (tests/cabina/todoist-lista.test.ts): en qué segmento cae cada tarea, cómo se agrupa, cómo se busca y a qué fecha se
 * mueve con «hoy» o «mañana». Las fechas son civiles ('yyyy-MM-dd') en la zona de Daniel.
 */
export type Segmento = 'hoy' | 'proximas' | 'sinFecha' | 'hechas'
export interface Grupo { id: string; titulo: string; tono?: 'oro'; tareas: PlanTask[] }

export const SEGMENTOS: { id: Segmento; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' }, { id: 'proximas', etiqueta: 'Próximas' }, { id: 'sinFecha', etiqueta: 'Sin fecha' }, { id: 'hechas', etiqueta: 'Hechas' },
]
/** Cuántos días de completadas lee la lista. */
export const DIAS_HECHAS = 14

const fmtDia = (zona: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
const sumar = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const conHora = (due: string | null) => !!due && due.includes('T')

/** El día civil de una fecha de Todoist: «2026-10-05» tal cual; un instante con zona, en la zona de Daniel. */
export function diaDe(fecha: string | null | undefined, zona: string): string | null {
  if (!fecha) return null
  if (!fecha.includes('T')) return fecha.slice(0, 10)
  if (!/(?:Z|[+-]\d\d:?\d\d)$/.test(fecha)) return fecha.slice(0, 10)
  return fmtDia(zona).format(new Date(fecha))
}

export function segmentoDe(t: PlanTask, hoy: string, zona: string): Exclude<Segmento, 'hechas'> {
  const d = diaDe(t.due, zona)
  return !d ? 'sinFecha' : d <= hoy ? 'hoy' : 'proximas'
}

/** Prioridad (1 = P1) primero; luego la fecha y la hora; luego el título. */
export const orden = (a: PlanTask, b: PlanTask) => a.priority - b.priority || (a.due ?? '~').localeCompare(b.due ?? '~') || a.title.localeCompare(b.title, 'es')

export function contar(activas: PlanTask[], hechas: PlanTask[], hoy: string, zona: string) {
  const c = { hoy: 0, proximas: 0, sinFecha: 0, hechas: hechas.length, vencidas: 0, hechasHoy: 0 }
  for (const t of activas) { const s = segmentoDe(t, hoy, zona); c[s]++; if (s === 'hoy' && diaDe(t.due, zona)! < hoy) c.vencidas++ }
  c.hechasHoy = hechas.filter(t => diaDe(t.completedAt, zona) === hoy).length
  return c
}

const etiquetaDia = (dia: string, hoy: string) => {
  if (dia === hoy) return 'Hoy'
  if (dia === sumar(hoy, -1)) return 'Ayer'
  if (dia === sumar(hoy, 1)) return 'Mañana'
  const t = new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Los grupos de un segmento. `proyectos` da el orden y el nombre de cada proyecto (Sin fecha se agrupa por proyecto).
 * `modo` (18 oct 2026, el mismo botón que el Día) vale en Hoy y Próximas: Hora = cronología (vencidas arriba, con hora por
 * hora, luego solo fecha) · Prioridad = P1→P4 dentro de cada grupo · Proyecto = agrupadas por proyecto, cronología dentro.
 */
export function agrupar(seg: Segmento, activas: PlanTask[], hechas: PlanTask[], hoy: string, zona: string, proyectos: { id: string; title: string }[], modo: OrdenTareas = 'hora'): Grupo[] {
  if (seg === 'hechas') {
    const porDia = new Map<string, PlanTask[]>()
    for (const t of [...hechas].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))) {
      const d = diaDe(t.completedAt, zona) ?? 'sin'
      porDia.set(d, [...(porDia.get(d) ?? []), t])
    }
    return [...porDia].map(([d, tareas]) => ({ id: `hechas:${d}`, titulo: d === 'sin' ? 'Sin fecha de cierre' : etiquetaDia(d, hoy), tareas }))
  }
  const del = activas.filter(t => segmentoDe(t, hoy, zona) === seg)
  if (modo === 'proyecto' && seg !== 'sinFecha') return ordenarTareas(del, 'proyecto', { zona, proyectos }).map(g => ({ id: g.id, titulo: g.titulo ?? '', tareas: g.tareas }))
  const crono = cronologia(zona), cmp = modo === 'prioridad' ? (a: PlanTask, b: PlanTask) => a.priority - b.priority || crono(a, b) : crono
  if (seg === 'hoy') {
    const vencidas = del.filter(t => diaDe(t.due, zona)! < hoy).sort(cmp)
    const deHoy = del.filter(t => diaDe(t.due, zona) === hoy).sort(cmp)
    return [{ id: 'vencidas', titulo: 'Vencidas', tono: 'oro' as const, tareas: vencidas }, { id: 'hoy', titulo: 'Hoy', tareas: deHoy }].filter(g => g.tareas.length)
  }
  if (seg === 'proximas') {
    const manana = sumar(hoy, 1), semana = sumar(hoy, 7)
    const g = (id: string, titulo: string, f: (d: string) => boolean) => ({ id, titulo, tareas: del.filter(t => f(diaDe(t.due, zona)!)).sort(cmp) })
    return [g('manana', 'Mañana', d => d === manana), g('semana', 'Esta semana', d => d > manana && d <= semana), g('despues', 'Después', d => d > semana)].filter(x => x.tareas.length)
  }
  const nombres = new Map(proyectos.map((p, i) => [p.id, { titulo: p.title, i }]))
  const porProyecto = new Map<string, PlanTask[]>()
  for (const t of del) { const k = t.projectId && nombres.has(t.projectId) ? t.projectId : '—'; porProyecto.set(k, [...(porProyecto.get(k) ?? []), t]) }
  return [...porProyecto].sort(([a], [b]) => (nombres.get(a)?.i ?? 1e6) - (nombres.get(b)?.i ?? 1e6))
    .map(([k, tareas]) => ({ id: `proyecto:${k}`, titulo: nombres.get(k)?.titulo ?? 'Sin proyecto', tareas: tareas.sort(orden) }))
}

/** Minúsculas, sin acentos ni emoji: «Revisión» y «revision» son lo mismo. */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\p{Extended_Pictographic}️‍]/gu, '').toLowerCase().trim()

/** Busca en título, contexto y proyecto; cada palabra de la búsqueda debe aparecer. Activas primero, luego hechas. */
export function buscar(q: string, activas: PlanTask[], hechas: PlanTask[], proyectos: { id: string; title: string }[]): Grupo[] {
  const palabras = normalizar(q).split(/\s+/).filter(Boolean)
  if (!palabras.length) return []
  const nombre = new Map(proyectos.map(p => [p.id, normalizar(p.title)]))
  const pasa = (t: PlanTask) => { const texto = `${normalizar(t.title)} ${normalizar(t.description)} ${t.projectId ? nombre.get(t.projectId) ?? '' : ''}`; return palabras.every(p => texto.includes(p)) }
  return [{ id: 'buscar:activas', titulo: 'Pendientes', tareas: activas.filter(pasa).sort(orden) },
    { id: 'buscar:hechas', titulo: 'Hechas', tareas: hechas.filter(pasa).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')) }].filter(g => g.tareas.length)
}

/** La fecha nueva al mover a `dia` (hoy o mañana): conserva la hora si la tenía. Sin hora, la fecha sola (Todoist conserva la recurrencia). */
export function fechaMovida(t: PlanTask, dia: string, zona: string): string {
  if (!conHora(t.due)) return dia
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t.due!))
  return instanteCivil(dia, h, zona)
}

/** «2026-10-06» + «09:30» en la zona → ISO. Resuelve el desfase de la zona en ese día (horario de verano incluido). */
export function instanteCivil(dia: string, hora: string, zona: string): string {
  const objetivo = Date.parse(`${dia}T${hora}:00Z`)
  let v = objetivo
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(f.formatToParts(new Date(v)).map(x => [x.type, x.value]))
    const visto = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`)
    if (visto === objetivo) break
    v += objetivo - visto
  }
  return new Date(v).toISOString()
}

/** El rótulo corto de la fecha de una tarea en su fila: «Venció 2 oct», «Hoy · 09:30», «Mañana», «Jue 8 oct». */
export function rotuloFecha(t: PlanTask, hoy: string, zona: string): { texto: string; tono?: 'oro' } | null {
  const d = diaDe(t.due, zona)
  if (!d) return null
  const hora = conHora(t.due) ? new Date(t.due!).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona }) : null
  if (d < hoy) return { texto: `Venció ${new Date(`${d}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`, tono: 'oro' }
  const base = etiquetaDia(d, hoy)
  return { texto: hora ? `${base} · ${hora}` : base }
}
