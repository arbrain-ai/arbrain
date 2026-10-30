import { addDays, format, parseISO } from 'date-fns'
import type { Goal } from '@/features/goals/model'
import type { Bloque } from './dia-vivo'
import type { PlanEvent, PlanTask } from './types'

/**
 * Semana y Mes con claridad (6 oct 2026). Lógica pura, sin React. Lo que responde cada vista lo firmó Daniel:
 *   Semana: «¿qué logro cada día para cumplir el objetivo de la semana?»
 *   Mes: «¿voy a llegar?»
 * Los entregables y los hitos viven en el registro de objetivos (`.claude/plan/objetivos.md`), en texto que se edita a mano:
 *   entregables: líneas `- [ ] …` / `- [x] …` en el «cómo se comprueba» (`success`) del objetivo;
 *   hitos: líneas `◆ 2026-10-17 · Masterclass 12:00` o `◆ 2026-10-17..2026-10-20 · Ventana de llamadas` en las notas del mes.
 */

const civil = (d: Date) => format(d, 'yyyy-MM-dd')

export interface Entregable { texto: string; hecho: boolean; linea: number }

/** Las casillas del objetivo. Sin casillas, el texto se queda como prosa (`resto`). */
export function entregablesDe(texto: string): { items: Entregable[]; resto: string } {
  const items: Entregable[] = [], prosa: string[] = []
  texto.split('\n').forEach((l, linea) => {
    const m = l.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.+?)\s*$/)
    if (m) items.push({ texto: m[2], hecho: m[1] !== ' ', linea })
    else if (l.trim()) prosa.push(l.trim())
  })
  return { items, resto: prosa.join(' ') }
}

/** Agrega una casilla `- [ ] …` al final sin mover las líneas de arriba (sus índices siguen valiendo). */
export function conNuevoEntregable(texto: string, nuevo: string): string {
  const limpio = texto.replace(/\s+$/, ''), linea = `- [ ] ${nuevo.replace(/\s+/g, ' ').trim()}`
  return limpio ? `${limpio}\n${linea}` : linea
}

/** Marca o desmarca una casilla sin tocar el resto del texto. */
export function conEntregable(texto: string, linea: number, hecho: boolean): string {
  return texto.split('\n').map((l, i) => i === linea ? l.replace(/\[( |x|X)\]/, hecho ? '[x]' : '[ ]') : l).join('\n')
}

export interface HitoMes { dia: string; hasta: string | null; titulo: string }

/** Los hitos firmados del mes, en orden. `hasta` es inclusivo (ventana 17–20). */
export function hitosDelRegistro(notas: string): HitoMes[] {
  const hitos: HitoMes[] = []
  for (const l of notas.split('\n')) {
    const m = l.match(/^\s*◆\s*(\d{4}-\d{2}-\d{2})(?:\s*\.\.\s*(\d{4}-\d{2}-\d{2}))?\s*[·:—-]\s*(.+?)\s*$/)
    if (m) hitos.push({ dia: m[1], hasta: m[2] ?? null, titulo: m[3] })
  }
  return hitos.sort((a, b) => a.dia.localeCompare(b.dia))
}

/** «sáb 17» o «17–20» (mismo mes) para un hito. */
export function cuandoHito(h: HitoMes): string {
  const a = parseISO(h.dia)
  if (!h.hasta || h.hasta === h.dia) return format(a, 'd')
  return `${format(a, 'd')}–${format(parseISO(h.hasta), 'd')}`
}

/** Días civiles que faltan de `hoy` a `dia` (0 = hoy). */
export function diasHasta(hoy: string, dia: string): number {
  return Math.round((parseISO(dia).getTime() - parseISO(hoy).getTime()) / 86_400_000)
}

/** «Faltan 11 días», «Mañana», «Hoy», «Hace 3 días». */
export function faltanTexto(n: number): string {
  if (n === 0) return 'Hoy'
  if (n === 1) return 'Mañana'
  if (n > 1) return `Faltan ${n} días`
  return n === -1 ? 'Ayer' : `Hace ${-n} días`
}

export type EstadoSemana = 'hecha' | 'en-curso' | 'pendiente' | 'sin-cerrar' | 'sin-objetivo'

/** El estado de una semana del recorrido: lo cierra el registro (`completed`), no el reloj. */
export function estadoSemana(goal: Pick<Goal, 'status'> | null, lunes: string, hoy: string): EstadoSemana {
  if (goal?.status === 'completed') return 'hecha'
  const domingo = civil(addDays(parseISO(lunes), 6))
  if (hoy >= lunes && hoy <= domingo) return 'en-curso'
  if (hoy < lunes) return goal ? 'pendiente' : 'sin-objetivo'
  return goal ? 'sin-cerrar' : 'sin-objetivo'
}

export const ROTULO_SEMANA: Record<EstadoSemana, string> = { hecha: 'Hecha', 'en-curso': 'En curso', pendiente: 'Pendiente', 'sin-cerrar': 'Sin cerrar', 'sin-objetivo': 'Sin objetivo' }

/**
 * Uno o dos compromisos del día: primero lo que no se repite y tiene hora (lo que Daniel agendó a propósito), luego las tareas P1/P2.
 * Las rutinas son textura y se quedan en el Día. `resto` cuenta lo demás que no es rutina.
 */
export interface Compromiso { id: string; titulo: string; hora: string | null; tipo: 'evento' | 'tarea'; item: PlanEvent | PlanTask }
export function compromisosDelDia(dia: { conHora: Bloque[]; todoElDia: PlanEvent[] }, tareas: PlanTask[], max = 2, excluir: (titulo: string) => boolean = () => false): { lista: Compromiso[]; resto: number } {
  // Lo corto (menos de 45 min: ducha, abdomen) es rutina aunque no se repita en Google: va después de lo que pesa.
  const eventos: Compromiso[] = dia.conHora.filter(b => !b.evento.recurringEventId && !excluir(b.titulo))
    .sort((a, b) => Number(a.fin - a.inicio < 45 * 60e3) - Number(b.fin - b.inicio < 45 * 60e3) || a.inicio - b.inicio)
    .map(b => ({ id: b.id, titulo: b.titulo, hora: format(b.inicio, 'HH:mm'), tipo: 'evento' as const, item: b.evento }))
  const largos: Compromiso[] = dia.todoElDia.filter(e => !e.recurringEventId && !excluir(e.title))
    .map(e => ({ id: e.id, titulo: e.title, hora: null, tipo: 'evento' as const, item: e }))
  const importantes: Compromiso[] = [...tareas].filter(t => !excluir(t.title)).sort((a, b) => a.priority - b.priority)
    .map(t => ({ id: t.id, titulo: t.title, hora: t.due?.includes('T') ? format(parseISO(t.due), 'HH:mm') : null, tipo: 'tarea' as const, item: t }))
  const todos = [...eventos, ...largos, ...importantes]
  // Un mismo compromiso puede estar en dos calendarios (masterclass en el personal y en el del negocio): se cuenta una vez.
  const vistos = new Set<string>(), unicos = todos.filter(c => { const k = limpio(c.titulo); if (vistos.has(k)) return false; vistos.add(k); return true })
  const lista = unicos.slice(0, max).sort((a, b) => a.tipo === b.tipo && a.hora && b.hora ? a.hora.localeCompare(b.hora) : 0)
  return { lista, resto: Math.max(0, unicos.length - max) }
}
const limpio = (s: string) => s.replace(/^[\p{Extended_Pictographic}️‍\s✓✅]+/u, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
/** El mismo texto sin emoji ni acentos: para comparar títulos que viven en dos fuentes. */
export const mismoTitulo = (a: string, b: string) => limpio(a) === limpio(b)
