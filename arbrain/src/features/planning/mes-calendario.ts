import { addDays, format, parseISO } from 'date-fns'
import { taskDay, type Goal } from '@/features/goals/model'
import { esCompromiso } from './categorias'
import { esFase, esHitoPrograma, esMecanicaAlumno, esViaje, nombreDeFase, semanaDelPrograma } from './drip'
import { CALENDARIO_RUTINA, rutinaDeAgenda, rutinasDiarias } from './rutinas'
import { ordenarAgenda } from './agenda-llamadas'
import { datosDeMovimiento, sumarDia, tramoDeTodoElDia } from './semana-horas'
import { eventoObjetivoDelDia, tareaObjetivo, tituloCumplido } from './dia-vivo'
import { horaDe } from './orden-tareas'
import { eventData, taskData } from './model'
import type { PlanEvent, PlanItem, PlanTask } from './types'
import { tr } from '@/shared/i18n'

/**
 * El Mes como un calendario de verdad (17 nov 2026, Daniel: «esta vista de mes no me ayuda para planificar nada, pensemos en un
 * calendario de toda la vida, pero con las mejores prácticas posibles para la gestión del tiempo… apalancándonos del ecosistema de la
 * vista de día… e incluye mi viaje a Monterrey del 26-29»). Lógica pura, sin React (tests/planning/mes-calendario.test.ts).
 *
 * La cuadrícula de siempre (semanas por días) con lo que el Día ya sabe leer, ordenado para planificar:
 *   - cada semana es un renglón: su S del programa, su fase y su carga (compromisos y tareas que vencen, contados del calendario y de
 *     Todoist); el objetivo de la semana lo pone la vista;
 *   - lo de varios días es UNA barra que cruza sus celdas (el viaje, el periodo de uno a uno); lo que cae entero dentro de un viaje
 *     (el hospedaje) se pliega en su barra y lo de un día dentro del viaje (la reunión presencial) queda en su celda;
 *   - en cada día, por importancia: lo de todo el día, los compromisos con personas o de hora fija (clases, llamadas, vuelos), lo que
 *     vence en Todoist (las vencidas suben a hoy, como en el Día) y los bloques propios de 45 min o más; lo ya cerrado no ocupa la celda;
 *   - la rutina (ritual, trabajo fuerte, gym, rutina de noche) no es texto: es RITMO, marcas por hora del día;
 *   - la fase del programa es la etiqueta de su semana, nunca otra barra; la mecánica para los alumnos no se pinta.
 */

/** Lo que pide el día: lo de todo el día, el compromiso con personas o de hora fija, la tarea que vence y el bloque propio. */
export type TipoItem = 'hito' | 'compromiso' | 'tarea' | 'bloque'
/** El tono que guía la atención (el mismo del Recorrido): bronce para actuar, morado para el viaje; lo demás, neutro. */
export type Tono = 'accion' | 'viaje' | null

export interface ItemMes {
  id: string; tipo: TipoItem; titulo: string
  /** «12:00»; null en lo de todo el día y en las tareas sin hora. */
  hora: string | null
  /** Prioridad de Todoist (1 = P1); null en eventos. */
  prioridad: number | null
  /** Tarea de un día anterior que sigue abierta: se pinta en hoy. */
  vencida: boolean
  /** Tarea ya cerrada (se queda en su día, al final y tenue). */
  hecha: boolean
  tono: Tono
  item: PlanItem
  /** Se puede arrastrar a otro día. */
  movible: boolean
  /** Se cruza a la misma hora con otro compromiso del día (el juez del 17 nov: «los choques de horario no se marcan»). */
  choque?: string
}
/** Una marca del ritmo: minuto de inicio y fin dentro del día civil (0–1440). */
export interface MarcaRitmo { id: string; titulo: string; desde: number; hasta: number }
export interface ObjetivoDia { titulo: string; hecho: boolean }
export interface DiaMes {
  dia: string; enMes: boolean; hoy: boolean; pasado: boolean; finde: boolean
  /** Fuera de casa: el título del viaje que cubre el día. */
  fuera: string | null
  items: ItemMes[]; ritmo: MarcaRitmo[]; objetivo: ObjetivoDia | null
}
export interface BarraMes {
  id: string; titulo: string
  /** Columnas de la semana (0 = lunes), inclusive. */
  a: number; z: number
  carril: number
  /** Empezó antes de este lunes / sigue después de este domingo. */
  antes: boolean; despues: boolean
  tono: Tono
  /** Lo de varios días que cae entero dentro (el hospedaje del viaje). */
  dentro: string[]
  evento: PlanEvent
  movible: boolean
}
/** La carga de la semana, contada (nunca estimada): compromisos con hora o de todo el día, tareas que vencen y horas con personas. */
export interface Carga { compromisos: number; tareas: number; horas: number }
export interface SemanaMes {
  lunes: string; domingo: string; dias: DiaMes[]; barras: BarraMes[]; carriles: number
  /** «S4» del programa; la fase que cubre más días de la semana («Tu primer cliente»). */
  s: string | null; fase: string | null
  carga: Carga
}

export interface EntradaMes {
  /** Semanas de lunes a domingo (periodo-vivo.ts `rejillaDelMes`). */
  semanas: string[][]
  /** El mes [desde, hasta). */
  desde: string; hasta: string; hoy: string
  /** Lo que se pinta: calendarios encendidos, sin los de objetivos. */
  eventos: readonly PlanEvent[]
  /** Todo lo leído, para medir el ritmo (la serie se mide entera). Default: `eventos`. */
  todos?: readonly PlanEvent[]
  /** Tareas abiertas y ya cerradas de Todoist. */
  tareas: readonly PlanTask[]; hechas?: readonly PlanTask[]
  zona: string
  programa: { lunes0: number; ultima: number } | null
  calendarioRutina?: string
  objetivoDia?: (dia: string) => ObjetivoDia | null
  /** Día civil de una hora ISO (default: el del equipo). */
  diaDe?: (iso: string) => string
}

const diaLocal = (iso: string) => format(parseISO(iso), 'yyyy-MM-dd')
const sinEmoji = (t: string) => (t ?? '').replace(/^\s*(?:✓\s*)?(?:[\p{Extended_Pictographic}‍️]+\s*)+/u, '').replace(/\s*[\p{Extended_Pictographic}‍️]+\s*$/u, '').trim() || t
function palabras(lista: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])(?:${lista})(?![\\p{L}\\d])`, 'iu')
}
/** Con otras personas por su título: clases, grupales, llamadas, uno a uno, reuniones (aunque la ocurrencia no traiga invitados). */
const RE_CON_PERSONAS = palabras('grupal|clase|nivel \\d+|videollamada|masterclass|taller|workshop|uno a uno|1 ?a ?1|1-1|diagn[oó]stico|llamadas?|reuni[oó]n|entrevista|mentor[ií]a|kickoff|demo day|cita|consulta|tu oferta')
/** De hora fija aunque no haya nadie más: vuelos y traslados. */
const RE_FIJO = palabras('vuelo|flight|autob[uú]s|tren|aeropuerto|check-?in|check-?out')
const RE_UNO_A_UNO = palabras('uno a uno|1 ?a ?1|1-1')
/**
 * El título en la celda: sin emoji, sin el sufijo del programa que se repite en cada clase («· Cerebro Artificial (cohorte
 * fundadora)») y en español lo que Google escribe solo en inglés (los vuelos y el hospedaje que llegan del correo). El título entero
 * sigue en el detalle y al pasar el cursor.
 */
export function tituloMes(titulo: string): string {
  let t = sinEmoji(titulo ?? '').replace(/\s*·\s*Cerebro Artificial(?:\s*\(cohorte fundadora\))?\s*$/i, '').trim()
  const vuelo = /^flight to (.+?)\s*\([A-Z0-9]{2}\s?\d{1,4}\)\s*$/i.exec(t)
  // El número de vuelo queda en el título entero (detalle y cursor): en la celda cabe «Vuelo a Monterrey».
  if (vuelo) return tr('Vuelo a {destino}', { destino: vuelo[1] })
  const estancia = /^stay at (.+)$/i.exec(t)
  if (estancia) return tr('Hospedaje: {lugar}', { lugar: estancia[1] })
  return t || titulo
}

/**
 * El ritmo de todos los días, dicho UNA vez (el juez del 17 nov: «sacar la rutina de las celdas… una línea: Ritmo diario: 5:00 ritual
 * · 9:30 gym…»): cada rutina que aparece en al menos un tercio de los días del mes, con su hora más común. Se agrupa por el nombre
 * corto (lo de antes del primer « · » o «:», sin la hora escrita): «GYM · Pierna» y «GYM · Espalda» son el mismo gym.
 */
export function ritmoTipico(semanas: readonly SemanaMes[], minimo = 1 / 3): { nombre: string; hora: string; dias: number }[] {
  const dias = semanas.flatMap(w => w.dias.filter(d => d.enMes))
  const grupos = new Map<string, { nombre: string; dias: Set<string>; horas: Map<number, number> }>()
  for (const d of dias) for (const r of d.ritmo) {
    const nombre = (r.titulo.split(/\s+·\s+|:\s/)[0] ?? r.titulo).replace(/^\d{1,2}[:.]\d{2}\s*/, '').trim()
    const k = nombre.toLowerCase()
    if (!grupos.has(k)) grupos.set(k, { nombre, dias: new Set(), horas: new Map() })
    const g = grupos.get(k)!
    g.dias.add(d.dia); g.horas.set(r.desde, (g.horas.get(r.desde) ?? 0) + 1)
  }
  return [...grupos.values()].filter(g => g.dias.size >= Math.max(1, dias.length * minimo))
    .map(g => { const desde = [...g.horas].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]; return { nombre: g.nombre, hora: `${String(Math.floor(desde / 60)).padStart(2, '0')}:${String(Math.round(desde % 60)).padStart(2, '0')}`, dias: g.dias.size, desde } })
    .sort((a, b) => a.desde - b.desde).map(({ desde: _d, ...r }) => r)
}

/** Lo que dura menos que esto y no es compromiso es textura del Día (la siesta, la ducha): no entra al Mes. */
export const BLOQUE_MIN = 45

const conOtros = (e: Pick<PlanEvent, 'meetUrl' | 'attendees'>) => esCompromiso(e)

/**
 * El ritmo del mes: lo que se repite y no es con nadie (ritual, trabajo fuerte, gym, rutina de noche). Se mide con la regla de la
 * agenda (la serie del calendario de la rutina, `rutinaDeAgenda`, ahora también lo «no negociable») y, aparte, por frecuencia
 * (`rutinasDiarias`). Nunca es ritmo lo que tiene a alguien más en cualquier ocurrencia de su serie, una clase o grupal (la de lunes,
 * miércoles y viernes son tres por semana: la frecuencia sola la daba por rutina) ni un vuelo.
 */
export function ritmoDelMes(eventos: readonly PlanEvent[], diaDe: (iso: string) => string = diaLocal, calendario: string = CALENDARIO_RUTINA): Set<string> {
  const seriesConOtros = new Set(eventos.filter(e => e.recurringEventId && conOtros(e)).map(e => e.recurringEventId!))
  const base = rutinaDeAgenda(eventos, diaDe, calendario, { noNegociables: true }), frecuencia = rutinasDiarias(eventos, diaDe)
  const ids = new Set<string>()
  for (const e of eventos) {
    if (e.allDay || conOtros(e) || (e.recurringEventId && seriesConOtros.has(e.recurringEventId))) continue
    if (RE_CON_PERSONAS.test(e.title ?? '') || RE_FIJO.test(e.title ?? '')) continue
    if (base.has(e.id) || frecuencia.has(e.id)) ids.add(e.id)
  }
  return ids
}

/** ¿Compromiso (con personas o de hora fija) o bloque propio? Para lo que tiene hora y no es ritmo. */
export function esCompromisoMes(e: PlanEvent, seriesConOtros: ReadonlySet<string> = new Set()): boolean {
  return conOtros(e) || Boolean(e.recurringEventId && seriesConOtros.has(e.recurringEventId)) || RE_CON_PERSONAS.test(e.title ?? '') || RE_FIJO.test(e.title ?? '')
}

/** Las clases y grupales son del programa (neutras, el mismo marcador todo el mes); actuar es el uno a uno y la llamada suelta. */
const RE_CLASE = palabras('grupal|clase|nivel \\d+|videollamada|masterclass|taller|workshop')
function tonoDe(e: PlanEvent): Tono {
  if (esViaje(e) || RE_FIJO.test(e.title ?? '')) return 'viaje'
  if (RE_CLASE.test(e.title ?? '')) return null
  if (RE_UNO_A_UNO.test(e.title ?? '') && !esFase(e)) return 'accion'
  if (!e.allDay && !e.recurringEventId && conOtros(e)) return 'accion'
  return null
}

/** Días civiles entre a y b (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5)
}

/** Horas de la unión de intervalos (los empalmes cuentan una vez). */
function horasUnion(tramos: { inicio: number; fin: number }[]): number {
  let total = 0, hasta = -Infinity
  for (const t of [...tramos].sort((x, y) => x.inicio - y.inicio)) {
    const a = Math.max(t.inicio, hasta)
    if (t.fin > a) { total += t.fin - a; hasta = t.fin }
  }
  return total / 3_600_000
}

const PESO: Record<TipoItem, number> = { hito: 0, compromiso: 1, tarea: 2, bloque: 3 }

export function mesCalendario(entrada: EntradaMes): SemanaMes[] {
  const { semanas, desde, hasta, hoy, zona, programa } = entrada
  const diaDe = entrada.diaDe ?? diaLocal
  const eventos = entrada.eventos.filter(e => !esMecanicaAlumno(e))
  const ritmo = ritmoDelMes(entrada.todos ?? entrada.eventos, diaDe, entrada.calendarioRutina ?? CALENDARIO_RUTINA)
  const seriesConOtros = new Set((entrada.todos ?? entrada.eventos).filter(e => e.recurringEventId && conOtros(e)).map(e => e.recurringEventId!))
  const primerDia = semanas[0]?.[0] ?? desde, ultimoDia = semanas.at(-1)?.[6] ?? hasta

  const items = new Map<string, ItemMes[]>(), marcas = new Map<string, MarcaRitmo[]>()
  const poner = (dia: string, x: ItemMes) => { if (!items.has(dia)) items.set(dia, []); items.get(dia)!.push(x) }
  const medianoche = (dia: string) => parseISO(dia).getTime()

  // Lo de todo el día (y lo que con hora cruza días): barras, salvo la fase (es la etiqueta de su semana).
  type Tramo = { e: PlanEvent; a: string; z: string; titulo: string; dentro: string[] }
  const tramos: Tramo[] = []
  // Las ventanas de disponibilidad y los briefs plegados en su llamada no son compromisos (agenda-llamadas.ts).
  const conHora = eventos.filter(e => !e.allDay)
  const { bloques, bandas } = ordenarAgenda(conHora.map(e => ({ id: e.id, titulo: e.title, inicio: Date.parse(e.start), fin: Date.parse(e.end) })))
  const fuera = new Set<string>(bandas.map(b => b.id))
  for (const b of bloques) if (b.brief) fuera.add(b.brief.id)
  // «Brief del diagnóstico · Persona» a la misma hora que su llamada es su preparación: vive en la llamada, no es otro compromiso.
  const esBrief = (e: PlanEvent) => /^brief\b/i.test(sinEmoji(e.title))
  const horasDeLlamada = new Set(conHora.filter(e => !esBrief(e)).map(e => Math.round(Date.parse(e.start) / 60_000)))
  for (const e of conHora) if (esBrief(e) && horasDeLlamada.has(Math.round(Date.parse(e.start) / 60_000))) fuera.add(e.id)

  for (const e of eventos) {
    if (fuera.has(e.id)) continue
    if (e.allDay) {
      if (esFase(e)) continue
      const [a, z] = tramoDeTodoElDia(e)
      tramos.push({ e, a, z, titulo: tituloMes(e.title), dentro: [] })
      continue
    }
    const a = diaDe(e.start), z = diaDe(new Date(Date.parse(e.end) - 1).toISOString())
    if (z > a) { tramos.push({ e, a, z, titulo: tituloMes(e.title), dentro: [] }); continue }
    const desdeMin = (Date.parse(e.start) - medianoche(a)) / 60_000, hastaMin = (Date.parse(e.end) - medianoche(a)) / 60_000
    if (ritmo.has(e.id)) {
      if (!marcas.has(a)) marcas.set(a, [])
      marcas.get(a)!.push({ id: e.id, titulo: sinEmoji(e.title), desde: Math.max(0, desdeMin), hasta: Math.min(1440, hastaMin) })
      continue
    }
    const compromiso = esCompromisoMes(e, seriesConOtros)
    if (!compromiso && hastaMin - desdeMin < BLOQUE_MIN) continue
    poner(a, { id: e.id, tipo: compromiso ? 'compromiso' : 'bloque', titulo: tituloMes(e.title), hora: format(parseISO(e.start), 'HH:mm'), prioridad: null, vencida: false, hecha: false,
      tono: tonoDe(e), item: e, movible: e.editable && !e.de })
  }

  // Lo que cae entero dentro de un viaje se pliega en él: lo de varios días, en su barra; lo de un día, en su celda.
  const viajes = tramos.filter(t => esViaje(t.e) && t.z > t.a).sort((x, y) => diasEntre(y.a, y.z) - diasEntre(x.a, x.z) || x.a.localeCompare(y.a))
  const plegados = new Set<string>()
  for (const t of tramos) {
    const v = viajes.find(v => v !== t && !plegados.has(v.e.id) && v.a <= t.a && t.z <= v.z)
    if (!v) continue
    if (t.z > t.a) { v.dentro.push(t.titulo); plegados.add(t.e.id) }
  }
  const barras = tramos.filter(t => t.z > t.a && !plegados.has(t.e.id))
  for (const t of tramos) if (t.z === t.a && !plegados.has(t.e.id))
    poner(t.a, { id: t.e.id, tipo: 'hito', titulo: t.titulo, hora: t.e.allDay ? null : format(parseISO(t.e.start), 'HH:mm'), prioridad: null, vencida: false, hecha: false,
      tono: tonoDe(t.e) ?? (viajes.some(v => v.a <= t.a && t.a <= v.z) ? 'viaje' : null), item: t.e, movible: t.e.editable && !t.e.de })

  // Todoist: cada tarea en su día; las vencidas que siguen abiertas, en hoy (como el Día). Las cerradas, en su día y al final.
  const enRejilla = (d: string) => d >= primerDia && d <= ultimoDia
  const tareaItem = (t: PlanTask, hecha: boolean, vencida: boolean): ItemMes => ({ id: t.id, tipo: 'tarea', titulo: tituloMes(t.title), hora: t.due?.includes('T') ? horaDe(t.due, zona) : null,
    prioridad: t.priority, vencida, hecha, tono: null, item: t, movible: !hecha })
  const vencenEn = new Map<string, number>()
  for (const t of entrada.tareas) {
    if (t.completed) continue
    const d = taskDay(t, zona)
    if (!d) continue
    vencenEn.set(d, (vencenEn.get(d) ?? 0) + 1)
    if (d < hoy && enRejilla(hoy)) poner(hoy, tareaItem(t, false, true))
    else if (enRejilla(d)) poner(d, tareaItem(t, false, false))
  }
  // Lo ya cerrado no ocupa la celda (el juez del 17 nov: «el pasado lleno de tachadas»), pero cuenta en la carga de su semana.
  for (const t of entrada.hechas ?? []) {
    const d = taskDay(t, zona)
    if (d && enRejilla(d)) vencenEn.set(d, (vencenEn.get(d) ?? 0) + 1)
  }

  // Dentro de las tareas: las que tienen hora, por hora (se leen como agenda); luego las de solo fecha, P1 primero. La prioridad se ve
  // en el color de su círculo (el juez del 17 nov: «ordena por prioridad pero enseña la hora: se ve desordenado»).
  const orden = (x: ItemMes, y: ItemMes) => Number(x.hecha) - Number(y.hecha) || PESO[x.tipo] - PESO[y.tipo]
    || Number(!x.hora) - Number(!y.hora)
    || (x.hora && y.hora ? x.hora.localeCompare(y.hora) : x.tipo === 'tarea' ? (x.prioridad ?? 4) - (y.prioridad ?? 4) || Number(y.vencida) - Number(x.vencida) : 0)
    || x.titulo.localeCompare(y.titulo, 'es')

  return semanas.map(dias => {
    const lunes = dias[0], domingo = dias[6]
    const dentro = (t: { a: string; z: string }) => t.a <= domingo && t.z >= lunes
    // La fase de la semana: la que cubre más días de ella.
    const cubre = (t: { a: string; z: string }) => diasEntre(t.a < lunes ? lunes : t.a, t.z > domingo ? domingo : t.z)
    const fase = eventos.filter(e => e.allDay && esFase(e)).map(e => { const [a, z] = tramoDeTodoElDia(e); return { e, a, z } }).filter(dentro).sort((x, y) => cubre(y) - cubre(x))[0]
    // Carriles: por inicio y, a igual inicio, la más larga arriba.
    const suyas = barras.filter(dentro).sort((x, y) => x.a.localeCompare(y.a) || diasEntre(y.a, y.z) - diasEntre(x.a, x.z))
    const finCarril: number[] = []
    const enSemana: BarraMes[] = suyas.map(t => {
      const a = Math.max(0, diasEntre(lunes, t.a)), z = Math.min(6, diasEntre(lunes, t.z))
      let carril = finCarril.findIndex(f => f < a)
      if (carril === -1) { carril = finCarril.length; finCarril.push(z) } else finCarril[carril] = z
      return { id: t.e.id, titulo: t.titulo, a, z, carril, antes: t.a < lunes, despues: t.z > domingo, tono: tonoDe(t.e), dentro: t.dentro, evento: t.e, movible: t.e.editable && !t.e.de }
    })
    const diasMes: DiaMes[] = dias.map((dia, i) => ({
      dia, enMes: dia >= desde && dia < hasta, hoy: dia === hoy, pasado: dia < hoy, finde: i >= 5,
      fuera: viajes.find(v => v.a <= dia && dia <= v.z)?.titulo ?? null,
      items: conChoques([...(items.get(dia) ?? [])].sort(orden)),
      ritmo: [...(marcas.get(dia) ?? [])].sort((x, y) => x.desde - y.desde),
      objetivo: entrada.objetivoDia?.(dia) ?? null,
    }))
    const compromisos = diasMes.flatMap(d => d.items.filter(x => x.tipo === 'compromiso' || x.tipo === 'hito'))
    const horas = horasUnion(compromisos.filter(x => x.item.kind === 'event' && !x.item.allDay).map(x => ({ inicio: Date.parse((x.item as PlanEvent).start), fin: Date.parse((x.item as PlanEvent).end) })))
    const tareas = dias.reduce((n, d) => n + (vencenEn.get(d) ?? 0), 0)
    return { lunes, domingo, dias: diasMes, barras: enSemana, carriles: finCarril.length, s: semanaDelPrograma(lunes, programa),
      fase: fase ? nombreDeFase(fase.e.title) : null, carga: { compromisos: compromisos.length, tareas, horas: Math.round(horas * 2) / 2 } }
  })
}

/** Una ventana de disponibilidad («Uno a uno disponible»): la llamada que cae dentro es lo que se reservó en ella, no un choque. */
const RE_VENTANA = palabras('disponible|disponibilidad|ventana')
/** Dos compromisos con hora que se enciman el mismo día: cada uno dice con cuál choca. */
function conChoques(items: ItemMes[]): ItemMes[] {
  const tramo = (x: ItemMes) => x.tipo === 'compromiso' && x.item.kind === 'event' && !x.item.allDay && !RE_VENTANA.test(x.titulo) ? [Date.parse(x.item.start), Date.parse(x.item.end)] as const : null
  return items.map(x => {
    const a = tramo(x)
    if (!a) return x
    const otro = items.find(y => { const b = y !== x ? tramo(y) : null; return b && a[0] < b[1] && b[0] < a[1] })
    return otro ? { ...x, choque: otro.titulo } : x
  })
}

/** La carga total de una semana (lo que mide su barra) y la más alta del mes, para escalar. */
export const cargaTotal = (c: Carga) => c.compromisos + c.tareas

/**
 * El objetivo del día en una celda: el mismo dato del Día (la tarea con la etiqueta `objetivo`, el registro de objetivos o el evento
 * «Objetivo del día» de Google). Cumplido si la tarea se cerró, el registro dice «Cumplido», el evento lleva ✓ o el hábito
 * `objetivo_dia` está marcado (cuando la vista tiene ese dato).
 */
export function objetivoDelDiaMes(i: {
  dia: string; goals: readonly Goal[]; abiertas: readonly PlanTask[]; completadas: readonly PlanTask[]
  eventos: readonly PlanEvent[]; fuentes: readonly { id: string; title: string; objective: boolean }[]; zona: string
  habito?: (dia: string) => boolean | null
}): ObjetivoDia | null {
  const ancla = tareaObjetivo([...i.abiertas], [...i.completadas], i.dia, t => taskDay(t, i.zona))
  const plan = i.goals.find(g => g.scope === 'day' && g.start <= i.dia && g.end > i.dia) ?? null
  const evento = eventoObjetivoDelDia([...i.eventos], [...i.fuentes], i.dia)
  const titulo = ancla?.tarea.title ?? plan?.title ?? evento?.title ?? null
  if (!titulo) return null
  const hecho = Boolean(ancla?.hecha) || plan?.status === 'completed' || (evento ? tituloCumplido(evento.title) : false) || i.habito?.(i.dia) === true
  return { titulo: sinEmoji(titulo.replace(/^\s*✓\s*/, '')), hecho }
}

/**
 * Los días con el hábito cumplido, leídos de los DATOS del hábito (17 nov 2026). El Mes no puede depender de la función `record` de
 * `useHabitRecords`: lee de una ref y su identidad nunca cambia, así que un `useMemo` que dependía de ella no se recalculaba al llegar
 * los hábitos y la estrella del 26 oct se quedaba ☆ hasta otro refresco (Levy lo vio comparando dos capturas). `listos` dice si lo
 * leído cubre el rango que pidió el Mes (al cambiar de mes, lo del mes anterior no cuenta como leído).
 */
export function diasConHabito(datos: { from: string; to: string; records: readonly { fecha: string; habito_clave: string; hecho: boolean | null }[]; checks?: readonly { fecha: string; habito_clave: string; hecho: boolean | null }[] } | null,
  clave: string, rango: { from: string; to: string }): { listos: boolean; dias: ReadonlySet<string> } {
  if (!datos) return { listos: false, dias: new Set() }
  const listos = datos.from <= rango.from && datos.to >= rango.to
  const dias = new Set([...datos.records, ...(datos.checks ?? [])].filter(r => r.habito_clave === clave && r.hecho === true).map(r => r.fecha))
  return { listos, dias }
}

/**
 * Arrastrar a otro día (17 nov 2026): lo mismo que en la Semana y el Día, pero de día a día. Conserva la hora y la duración; lo de
 * todo el día conserva cuántos días dura. Devuelve los datos de la actualización (por la misma pluma, con ⌘Z) o null si no se movió.
 */
export function moverAlDia(item: PlanItem, hacia: string, diaDe: (iso: string) => string = diaLocal): { inicio: Date; fin: Date; data: Record<string, unknown>; todoElDia: boolean } | null {
  if (item.kind === 'event') {
    if (item.allDay) {
      const [a] = tramoDeTodoElDia(item), n = diasEntre(a, hacia)
      if (!n) return null
      const inicio = sumarDia(a, n), fin = sumarDia(item.end.slice(0, 10), n)
      return { inicio: parseISO(inicio), fin: parseISO(fin), todoElDia: true, data: { ...eventData(item), start: inicio, end: fin, allDay: true } }
    }
    const n = diasEntre(diaDe(item.start), hacia)
    if (!n) return null
    const inicio = addDays(parseISO(item.start), n), fin = addDays(parseISO(item.end), n)
    return { inicio, fin, todoElDia: false, data: datosDeMovimiento(item, inicio, fin) }
  }
  if (!item.due || item.completed) return null
  const conHora = item.due.includes('T')
  const actual = conHora && /(?:Z|[+-]\d\d:?\d\d)$/.test(item.due) ? diaDe(item.due) : item.due.slice(0, 10)
  const n = diasEntre(actual, hacia)
  if (!n) return null
  // Fecha sola o hora flotante: se cambia el día y se conserva lo demás; con zona, se suma en el reloj.
  const due = !conHora ? hacia : /(?:Z|[+-]\d\d:?\d\d)$/.test(item.due) ? addDays(new Date(item.due), n).toISOString() : `${hacia}${item.due.slice(10)}`
  const inicio = parseISO(due), fin = conHora ? new Date(inicio.getTime() + (item.durationMinutes ?? 30) * 60_000) : addDays(inicio, 1)
  return { inicio, fin, todoElDia: !conHora, data: { ...taskData(item), due } }
}
