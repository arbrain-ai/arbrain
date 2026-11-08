import type { Goal } from '@/features/goals/model'
import { taskDay } from '@/features/goals/model'
import type { Bloque } from './dia-vivo'
import { cronologia, horaDe } from './orden-tareas'
import type { PlanTask } from './types'

/**
 * Una sola lista del día (3 nov 2026, 18:43, Daniel mirando el Día del mié 4 nov: «noto que tenemos lo mismo en las tareas, no? creo que
 * quiero unificarlo toda la logica en el toggle… ya viste que se repite lo de la grupal… que las tareas, de alguna forma tambien se vean
 * reflejadas en el timeline del dia… peero de forma sutil y elegante»). Puro y sin React:
 *   - la lista junta las casillas del objetivo del día y las tareas de Todoist del día (las que vencen ese día, las vencidas si es hoy
 *     y las ligadas al objetivo por `taskIds`), sin repetir la tarea-objetivo (es el título) ni un criterio que dice lo mismo que una
 *     tarea (`mismoPendiente`): de esa pareja se ve UNA fila, la tarea con su color, y cerrarla marca el criterio (8 nov 2026);
 *   - cada pendiente puede tener hora: la de Todoist o la que trae escrita («Grupal 12:00: …», «Rutina a las 5:30»);
 *   - con hora, se liga a su evento: por `eventIds` del objetivo, o por caer en su horario con el mismo nombre de bloque o empezando
 *     a la misma hora. Ligado, vive dentro del evento; suelto y con hora, es una marca tenue en su hora; sin hora, solo en la lista.
 */
export interface ItemDia {
  /** `casilla:<línea>` o el id de la tarea. */
  id: string
  origen: 'casilla' | 'tarea'
  texto: string
  hecho: boolean
  /** Minutos desde la medianoche del día, o null si no tiene hora. */
  minuto: number | null
  /** La línea de la casilla en el texto del objetivo. */
  linea?: number
  tarea?: PlanTask
  /** El criterio del objetivo que dice lo mismo que esta tarea: no se pinta aparte y cerrar la tarea lo marca. */
  criterio?: { linea: number; texto: string; hecho: boolean }
  vencida?: boolean
  /** Una repetición ya completada no se reabre (Todoist ya movió la siguiente). */
  fija?: boolean
}

const sinMarcas = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
export const claveTexto = (s: string) => sinMarcas(s.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '')).toLowerCase().replace(/\s+/g, ' ').trim()

/** La primera hora escrita en un texto («12:00», «5:30», «a las 9:05») en minutos del día; null si no trae. */
export function horaEnTexto(texto: string): number | null {
  const m = /(?:^|[^\d:])([01]?\d|2[0-3]):([0-5]\d)(?!\d|:\d)/.exec(texto)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** La hora de una tarea en el día `dia`: la de Todoist si vence ese día con hora; si no, la que trae escrita. Otro día, sin hora. */
export function minutoDeTarea(t: PlanTask, dia: string, zona: string): number | null {
  if (taskDay(t, zona) !== dia) return null
  if (t.due?.includes('T')) { const [h, m] = horaDe(t.due, zona).split(':').map(Number); if (Number.isFinite(h) && h < 24) return h * 60 + m }
  return horaEnTexto(t.title)
}

const VACIAS = new Set(['para', 'como', 'with', 'from', 'esta', 'este', 'todos', 'todas', 'cada', 'sobre', 'desde', 'hasta', 'entre', 'mis', 'tus', 'nuestro', 'nuestra', 'dada', 'dado', 'hecho', 'hecha'])
/** Las palabras con cuerpo de un título (sin emojis, números ni palabras vacías): el «nombre de bloque». */
export function palabras(texto: string): Set<string> {
  return new Set(claveTexto(texto).split(/[^\p{L}]+/u).filter(p => p.length >= 4 && !VACIAS.has(p)))
}
/** La raíz de una palabra ya sin acentos: «revisada» y «revisar» → «revis», «tocado» y «tocar» → «toc», «clientes» → «client». */
const raiz = (p: string) => {
  const r = p.replace(/(?:ando|iendo|ados|adas|idos|idas|ado|ada|ido|ida|ar|er|ir|es|s)$/, '')
  const base = r.length >= 3 ? r : p
  return base.length > 4 ? base.replace(/[aeo]$/, '') : base
}
const raices = (texto: string) => new Set([...palabras(texto)].map(raiz))

/**
 * ¿Un criterio y una tarea dicen lo mismo? (8 nov 2026, Daniel con el Hoy del dom 8 nov: «Cola de la semana del canal de Levy revisada y
 * con tu sí» y «Revisar y dar tu sí a la cola de la semana del canal de Levy»; «Mensajes de cobro a Fulano, Mengano y Zutano enviados» y
 * «Mandar a Fulano, Mengano y Zutano el aviso amable de pago»). Mismo texto, o las raíces de sus palabras con cuerpo se cubren: al menos tres
 * en común y la mitad del más corto, o dos y casi todo el más corto. Devuelve la fuerza del parecido (0 = distintos).
 */
export function mismoPendiente(a: string, b: string): number {
  if (claveTexto(a) === claveTexto(b)) return 2
  const ra = raices(a), rb = raices(b), menor = Math.min(ra.size, rb.size)
  if (!menor) return 0
  const comunes = [...ra].filter(r => rb.has(r)).length, parte = comunes / menor
  // A igual cobertura del más corto, gana la que también cubre al otro (la de menos palabras de sobra).
  return (comunes >= 3 && parte >= 0.5) || (comunes >= 2 && parte >= 0.8) ? parte + comunes / (ra.size + rb.size - comunes) / 10 : 0
}

/** Las parejas criterio↔tarea, una a una y la más parecida primero: índice de la casilla → la tarea que la representa. */
export function parejas<C extends { texto: string }>(casillas: C[], tareas: PlanTask[]): Map<number, PlanTask> {
  const candidatas = casillas.flatMap((c, i) => tareas.map(t => ({ i, t, f: mismoPendiente(c.texto, t.title) }))).filter(x => x.f > 0).sort((x, y) => y.f - x.f)
  const res = new Map<number, PlanTask>(), usadas = new Set<string>()
  for (const { i, t } of candidatas) if (!res.has(i) && !usadas.has(t.id)) { res.set(i, t); usadas.add(t.id) }
  return res
}

const compartenNombre = (a: string, b: string) => { const pb = palabras(b); return [...palabras(a)].some(p => pb.has(p)) }

/**
 * El evento donde vive un pendiente con hora: explícito (`eventoExplicito`) si cae en el día; si no, de los bloques que cubren su hora,
 * el que comparte nombre con él y, si ninguno, el que empieza justo a esa hora. Entre varios, el más corto (el más específico).
 */
export function eventoDe(item: { texto: string; minuto: number | null }, bloques: Bloque[], base: number, eventoExplicito?: string | null): Bloque | null {
  if (eventoExplicito) { const b = bloques.find(x => x.evento.id === eventoExplicito); if (b) return b }
  if (item.minuto == null) return null
  const t = base + item.minuto * 60_000
  const cubren = bloques.filter(b => b.inicio <= t && t < b.fin).sort((a, b) => (a.fin - a.inicio) - (b.fin - b.inicio))
  return cubren.find(b => compartenNombre(item.texto, b.titulo)) ?? cubren.find(b => b.inicio === t) ?? null
}

/**
 * La lista del día, en el orden en que se lee: primero las casillas del objetivo (su orden), luego las tareas por cronología (vencidas,
 * con hora, sin hora). Las completadas de ese día se quedan en su lugar marcadas: tocarlas otra vez las reabre.
 */
export function listaDelDia(i: {
  dia: string; hoy: string; zona: string
  /** Las casillas del objetivo (`entregablesDe(...).items`, ya con lo marcado al instante). */
  casillas: { linea: number; texto: string; hecho: boolean }[]
  abiertas: PlanTask[]; completadas: PlanTask[]
  /** Los objetivos del registro: los de día ligan tareas por `taskIds`. */
  goals?: Goal[]
  /** La tarea-objetivo (ya es el título de la caja). */
  sin?: string | null
}): ItemDia[] {
  const { dia, hoy, zona } = i
  const delDia = (t: PlanTask) => taskDay(t, zona)
  const ligadas = new Set((i.goals ?? []).filter(g => g.scope === 'day' && g.start <= dia && g.end > dia).flatMap(g => g.taskIds))
  const liga = (t: PlanTask) => ligadas.has(t.id) || ligadas.has(t.externalId)
  const abiertas = i.abiertas.filter(t => !t.completed && t.id !== i.sin && (liga(t) || (() => { const d = delDia(t); return !!d && (d === dia || (dia === hoy && d < hoy)) })()))
  const ids = new Set(abiertas.map(t => t.id))
  const completadas = i.completadas.filter(t => t.id !== i.sin && !ids.has(t.id)
    && (liga(t) || delDia(t) === dia || (!!t.completedAt && dayKeyLocal(new Date(t.completedAt)) === dia)))
  const tareas = [...abiertas, ...completadas].sort(cronologia(zona))
  const deTarea = (t: PlanTask): ItemDia => {
    const hecho = Boolean(t.completed) || !ids.has(t.id), d = delDia(t)
    return { id: t.id, origen: 'tarea', texto: t.title, hecho, minuto: minutoDeTarea(t, dia, zona), tarea: t,
      ...(!hecho && d && d < dia ? { vencida: true } : {}), ...(hecho && t.recurring ? { fija: true } : {}) }
  }
  // Un criterio con su tarea gemela se ve como la tarea (con su prioridad), en el lugar del criterio; cerrarla lo marca.
  const pares = parejas(i.casillas, tareas), enPar = new Set([...pares.values()].map(t => t.id))
  const casillas: ItemDia[] = i.casillas.map((c, n) => {
    const t = pares.get(n)
    if (t) { const it = deTarea(t); return { ...it, minuto: it.minuto ?? horaEnTexto(c.texto), criterio: { linea: c.linea, texto: c.texto, hecho: c.hecho } } }
    return { id: `casilla:${c.linea}`, origen: 'casilla', texto: c.texto, hecho: c.hecho, minuto: horaEnTexto(c.texto), linea: c.linea }
  })
  return [...casillas, ...tareas.filter(t => !enPar.has(t.id)).map(deTarea)]
}

/** El evento explícito de cada tarea: un objetivo de día con `taskIds` y `eventIds` liga sus tareas a su evento si ese día tiene uno solo. */
export function eventosExplicitos(goals: Goal[] | undefined, dia: string, bloques: Bloque[]): Map<string, string> {
  const res = new Map<string, string>()
  for (const g of (goals ?? []).filter(g => g.scope === 'day' && g.start <= dia && g.end > dia && g.taskIds.length && g.eventIds.length)) {
    const delDia = bloques.filter(b => g.eventIds.includes(b.evento.id))
    if (delDia.length === 1) for (const id of g.taskIds) res.set(id, delDia[0].evento.id)
  }
  return res
}

/** Reparte la lista en el timeline: lo ligado va dentro de su evento (por id de bloque); lo suelto con hora, como marca en su hora. */
export function enElTimeline(items: ItemDia[], bloques: Bloque[], base: number, explicitos: Map<string, string> = new Map()) {
  const dentro = new Map<string, ItemDia[]>(), sueltas: ItemDia[] = []
  for (const it of items) {
    const explicito = it.tarea ? explicitos.get(it.tarea.id) ?? explicitos.get(it.tarea.externalId) : undefined
    const b = eventoDe(it, bloques, base, explicito)
    if (b) dentro.set(b.id, [...(dentro.get(b.id) ?? []), it])
    else if (it.minuto != null) sueltas.push(it)
  }
  return { dentro, sueltas: sueltas.sort((a, b) => a.minuto! - b.minuto!) }
}

const dayKeyLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
