import { useCallback, useEffect, useState } from 'react'
import { taskDay } from '@/features/goals/model'
import type { PlanTask } from './types'

/**
 * El orden de las tareas (18 oct 2026, Daniel: «organiza las tareas por hora del día, permite cambiar el filtro entre
 * prioridad, cronología, etc. el 80/20 de filtros que tú consideres en un botón simple»). Tres órdenes y nada más:
 *   Hora      · cronología: lo vencido arriba, luego lo que tiene hora (por hora), luego lo que solo tiene fecha.
 *   Prioridad · P1 → P4 y, dentro de cada una, la cronología.
 *   Proyecto  · agrupadas por proyecto de Todoist (con su emoji), en el orden de Todoist, y cronología dentro.
 * Lógica pura (tests/planning/orden-tareas.test.ts). `priority` ya viene invertida por planning.py: 1 = P1 (API v1 4).
 * La elección vive por dispositivo (localStorage), compartida entre el Día del calendario y la pestaña Tareas.
 */
export type OrdenTareas = 'hora' | 'prioridad' | 'proyecto'
export const ORDENES: { id: OrdenTareas; etiqueta: string }[] = [
  { id: 'hora', etiqueta: 'Hora' }, { id: 'prioridad', etiqueta: 'Prioridad' }, { id: 'proyecto', etiqueta: 'Proyecto' },
]
export const CLAVE_ORDEN = 'arbrain.tareas.orden'
export const esOrden = (v: unknown): v is OrdenTareas => ORDENES.some(o => o.id === v)
export const siguienteOrden = (o: OrdenTareas): OrdenTareas => ORDENES[(ORDENES.findIndex(x => x.id === o) + 1) % ORDENES.length].id
export const etiquetaOrden = (o: OrdenTareas) => ORDENES.find(x => x.id === o)!.etiqueta

export interface GrupoTareas { id: string; titulo: string | null; tareas: PlanTask[] }

const conHora = (due: string | null) => !!due && due.includes('T')
/** La hora de pared «HH:mm» de una hora de Todoist: con zona, en la zona de Daniel; flotante («2026-10-19T07:30:00»), tal cual. */
export function horaDe(due: string, zona: string): string {
  if (!/(?:Z|[+-]\d\d:?\d\d)$/.test(due)) return due.slice(11, 16)
  const v = new Date(due)
  return Number.isNaN(v.getTime()) ? '99:99' : new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(v)
}

/** Cronología: por día (lo vencido cae primero), dentro del día lo que tiene hora por hora y luego lo que solo tiene fecha. */
export function cronologia(zona: string) {
  return (a: PlanTask, b: PlanTask) => {
    const da = taskDay(a, zona) ?? '~', db = taskDay(b, zona) ?? '~'
    if (da !== db) return da < db ? -1 : 1
    const ha = conHora(a.due), hb = conHora(b.due)
    if (ha !== hb) return ha ? -1 : 1
    if (ha && hb) { const x = horaDe(a.due!, zona), y = horaDe(b.due!, zona); if (x !== y) return x < y ? -1 : 1 }
    return a.priority - b.priority || a.title.localeCompare(b.title, 'es')
  }
}

/** ¿Venció? Su día civil es anterior a `hoy`. */
export const vencida = (t: PlanTask, hoy: string, zona: string) => { const d = taskDay(t, zona); return !!d && d < hoy }

/** Las tareas del Día: las de ese día y, si es hoy, también las vencidas (que suben arriba con su marca). */
export function tareasDelDia(tareas: PlanTask[], dia: string, hoy: string, zona: string): PlanTask[] {
  return tareas.filter(t => { if (t.completed) return false; const d = taskDay(t, zona); return !!d && (d === dia || (dia === hoy && d < hoy)) })
}

/**
 * Ordena (y en Proyecto agrupa). `primero` (la tarea-objetivo del día) encabeza su grupo en cualquier orden.
 * Hora y Prioridad devuelven un solo grupo sin título.
 */
export function ordenarTareas(tareas: PlanTask[], orden: OrdenTareas, { zona, proyectos = [], primero }: {
  zona: string; proyectos?: { id: string; title: string }[]; primero?: string | null
}): GrupoTareas[] {
  const crono = cronologia(zona)
  const base = orden === 'prioridad' ? (a: PlanTask, b: PlanTask) => a.priority - b.priority || crono(a, b) : crono
  const cmp = (a: PlanTask, b: PlanTask) => primero ? Number(b.id === primero) - Number(a.id === primero) || base(a, b) : base(a, b)
  if (orden !== 'proyecto') return tareas.length ? [{ id: orden, titulo: null, tareas: [...tareas].sort(cmp) }] : []
  const pos = new Map(proyectos.map((p, i) => [p.id, { titulo: p.title, i }]))
  const grupos = new Map<string, PlanTask[]>()
  for (const t of tareas) { const k = t.projectId && pos.has(t.projectId) ? t.projectId : '—'; grupos.set(k, [...(grupos.get(k) ?? []), t]) }
  return [...grupos].sort(([a], [b]) => (pos.get(a)?.i ?? 1e6) - (pos.get(b)?.i ?? 1e6))
    .map(([k, ts]) => ({ id: `proyecto:${k}`, titulo: pos.get(k)?.titulo ?? 'Sin proyecto', tareas: ts.sort(cmp) }))
}

/**
 * El top 3 del día (18 oct 2026, Daniel: «top 3 tareas priority hasta arriba colapsadas… y si quiero ver más pues un botón»):
 * primero las vencidas P1, luego P1 → P4 y, a igual prioridad, por hora. La tarea-objetivo, si la hay, encabeza.
 */
export function topTareas(tareas: PlanTask[], { hoy, zona, primero, n = 3 }: { hoy: string; zona: string; primero?: string | null; n?: number }): PlanTask[] {
  const crono = cronologia(zona), urgente = (t: PlanTask) => t.priority === 1 && vencida(t, hoy, zona)
  return [...tareas].sort((a, b) => (primero ? Number(b.id === primero) - Number(a.id === primero) : 0)
    || Number(urgente(b)) - Number(urgente(a)) || a.priority - b.priority || crono(a, b)).slice(0, n)
}

/** Un sí/no del dispositivo (localStorage), p. ej. la lista completa de Tareas abierta o plegada en el Día. */
export function usePreferencia(clave: string, inicial = false): [boolean, () => void] {
  const [v, setV] = useState(inicial)
  useEffect(() => { try { const x = localStorage.getItem(clave); if (x === '1' || x === '0') setV(x === '1') } catch { /* sin almacenamiento */ } }, [clave])
  const alternar = useCallback(() => setV(x => { try { localStorage.setItem(clave, x ? '0' : '1') } catch { /* sin almacenamiento */ } return !x }), [clave])
  return [v, alternar]
}

/** La elección del dispositivo. Varias superficies montadas a la vez se enteran entre sí (evento propio + `storage`). */
const EVENTO = 'arbrain:tareas-orden'
export function useOrdenTareas(): [OrdenTareas, () => void] {
  const [orden, setOrden] = useState<OrdenTareas>('hora')
  useEffect(() => {
    const leer = () => { try { const v = localStorage.getItem(CLAVE_ORDEN); setOrden(esOrden(v) ? v : 'hora') } catch { /* sin almacenamiento */ } }
    leer()
    const enStorage = (e: StorageEvent) => { if (e.key === CLAVE_ORDEN) leer() }
    window.addEventListener('storage', enStorage); window.addEventListener(EVENTO, leer)
    return () => { window.removeEventListener('storage', enStorage); window.removeEventListener(EVENTO, leer) }
  }, [])
  const ciclar = useCallback(() => setOrden(o => {
    const s = siguienteOrden(o)
    try { localStorage.setItem(CLAVE_ORDEN, s) } catch { /* sin almacenamiento */ }
    queueMicrotask(() => window.dispatchEvent(new Event(EVENTO)))
    return s
  }), [])
  return [orden, ciclar]
}
