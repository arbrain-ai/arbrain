import { esNoNegociable } from './secciones'
import { ordenarAgenda } from './agenda-llamadas'
import { instalacion } from '@/config'
/**
 * Rutinas diarias (24 oct 2026, cascada Temporada → Mes → Semana → Día, *Buy Back Your Time*): el Mes es el Preloaded Year y
 * solo lleva piedras grandes; la Semana es la Perfect Week y pinta las rutinas atenuadas. Lógica pura, sin React
 * (tests/planning/rutinas.test.ts).
 *
 * Una rutina diaria es lo que se repite casi a diario: despertar, GYM, a dormir, el bloque fijo de trabajo. Google no manda
 * la regla de repetición en cada ocurrencia (`recurrence` llega vacío), así que se mide la FRECUENCIA en lo leído:
 *
 *   - Se agrupa por serie (`recurringEventId`) y, aparte, por título normalizado (sin emoji, hora ni mayúsculas): así cuentan
 *     también los bloques sueltos que Levy repite a diario sin serie («🍽️ Comida», «GYM» suelto).
 *   - Un grupo es diario si en alguna semana (lunes a domingo) cae en 3 días distintos o más. Una clase semanal (1 por semana)
 *     o la grupal de martes y jueves (2) siguen siendo piedras grandes.
 *   - Una ocurrencia de una serie diaria que se renombró («🧹 Preparar la grupal…» dentro de «Trabajo fuerte») es única: no
 *     se trata como rutina.
 *   - Lo de día completo de varios días (fases, viajes) nunca es rutina.
 */

export interface EventoRutina { id: string; title: string; start: string; end: string; allDay: boolean; recurringEventId: string | null }

/** Días distintos por semana que hacen a un grupo «casi diario». */
export const DIAS_POR_SEMANA = 3

/** El título sin emoji, sin la hora escrita («5:30», «21:30») y sin mayúsculas: lo que dice, no cómo se decora. */
export function tituloBase(titulo: string): string {
  return (titulo ?? '').normalize('NFC').replace(/^\s*✓\s*/, '')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** La familia de un título: lo de antes del primer « · » o «:» («Gym · Pierna + sauna» → «gym»). Sin separador, nada. */
export function familia(titulo: string): string {
  const m = /^(.+?)\s*(?:·|:|—| - )\s*\S/.exec(titulo ?? '')
  return m ? tituloBase(m[1]) : ''
}

const diaCivil = (iso: string) => iso.slice(0, 10)
/** El lunes de la semana de un día civil (YYYY-MM-DD), sin zona: aritmética en UTC del mediodía. */
function lunes(dia: string): string {
  const t = Date.parse(`${dia}T12:00:00Z`), dow = (new Date(t).getUTCDay() + 6) % 7
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10)
}
/** Lo de día completo que cubre más de un día (una fase, un viaje): nunca rutina. */
const varioDias = (e: EventoRutina) => e.allDay && diaCivil(e.end) > diaCivil(e.start) && Date.parse(e.end) - Date.parse(e.start) > 86_400_000

function densos(grupos: Map<string, EventoRutina[]>, dia: (e: EventoRutina) => string): Set<string> {
  const out = new Set<string>()
  for (const [k, es] of grupos) {
    if (es.length < DIAS_POR_SEMANA) continue
    const semanas = new Map<string, Set<string>>()
    for (const e of es) { const d = dia(e), l = lunes(d); if (!semanas.has(l)) semanas.set(l, new Set()); semanas.get(l)!.add(d) }
    if ([...semanas.values()].some(s => s.size >= DIAS_POR_SEMANA)) out.add(k)
  }
  return out
}

/** Los ids de las ocurrencias que son rutina diaria, medidas sobre todo lo leído (conviene pasar más que lo visible). */
export function rutinasDiarias(eventos: readonly EventoRutina[], diaDe: (iso: string) => string = diaCivil): Set<string> {
  const candidatos = eventos.filter(e => !varioDias(e))
  const dia = (e: EventoRutina) => e.allDay ? diaCivil(e.start) : diaDe(e.start)
  const porSerie = new Map<string, EventoRutina[]>(), porTitulo = new Map<string, EventoRutina[]>()
  for (const e of candidatos) {
    const t = tituloBase(e.title)
    if (e.recurringEventId) { if (!porSerie.has(e.recurringEventId)) porSerie.set(e.recurringEventId, []); porSerie.get(e.recurringEventId)!.push(e) }
    if (t) { if (!porTitulo.has(t)) porTitulo.set(t, []); porTitulo.get(t)!.push(e) }
  }
  // El título que domina cada serie: una ocurrencia renombrada es única aunque su serie sea diaria.
  const dominante = new Map<string, string>()
  for (const [k, es] of porSerie) {
    const cuenta = new Map<string, number>()
    for (const e of es) { const t = tituloBase(e.title); cuenta.set(t, (cuenta.get(t) ?? 0) + 1) }
    dominante.set(k, [...cuenta].sort((a, b) => b[1] - a[1])[0][0])
  }
  // Familias de series (24 oct 2026, crítico A/B): «Gym · Pierna + sauna», «Gym · Pecho…», «Gym · Brazo…» son tres series de dos
  // días cada una, pero juntas son el GYM de todos los días. Solo series: las llamadas sueltas «Llamada · Persona» no se juntan.
  const porFamilia = new Map<string, EventoRutina[]>()
  for (const e of candidatos) {
    const f = e.recurringEventId ? familia(e.title) : ''
    if (f) { if (!porFamilia.has(f)) porFamilia.set(f, []); porFamilia.get(f)!.push(e) }
  }
  const familiasDiarias = densos(porFamilia, dia)
  const seriesDiarias = densos(porSerie, dia), titulosDiarios = densos(porTitulo, dia)
  const ids = new Set<string>()
  for (const e of candidatos) {
    const t = tituloBase(e.title)
    if (e.recurringEventId && familiasDiarias.has(familia(e.title)) && !seriesDiarias.has(e.recurringEventId)) ids.add(e.id)
    else if (e.recurringEventId && seriesDiarias.has(e.recurringEventId)) { if (t === dominante.get(e.recurringEventId)) ids.add(e.id) }
    else if (t && titulosDiarios.has(t)) ids.add(e.id)
  }
  return ids
}

/**
 * Lo que no entra a la cuadrícula del Mes (solo piedras grandes): las rutinas diarias, las ventanas de disponibilidad con hora
 * («📞 Llamadas con aplicantes»: fondo, no compromiso) y el brief que se pliega en su llamada (agenda-llamadas.ts). La llamada
 * sí queda: es con otra persona y no se mueve.
 */
export function fueraDelMes(eventos: readonly EventoRutina[], diaDe?: (iso: string) => string): Set<string> {
  const fuera = rutinasDiarias(eventos, diaDe)
  const conHora = eventos.filter(e => !e.allDay).map(e => ({ id: e.id, titulo: e.title, inicio: Date.parse(e.start), fin: Date.parse(e.end) }))
  const { bloques, bandas } = ordenarAgenda(conHora)
  for (const b of bandas) fuera.add(b.id)
  for (const b of bloques) if (b.brief) fuera.add(b.brief.id)
  return fuera
}

/*
 * La rutina no se ve a futuro (26 oct 2026, 06:28, Daniel: «no quiero ver mi rutina a futuro, ya me la sé! la veo al pasado justo lo
 * que hice, no lo que espero hacer… quita calendario a futuro, quiero ver a Daniel»). Día y Semana: lo que ya empezó se ve (es lo que
 * hizo); lo que no ha empezado y es rutina, no. Los compromisos (grupales, clases, diagnósticos, eventos con invitados o Meet), lo
 * único que crearon Daniel o Levy y lo de día completo se ven siempre. Un interruptor del engrane («Rutina a futuro») la devuelve.
 *
 * Regla: rutina = evento con hora, de una serie (recurrente), sin invitados ni Meet, del calendario de la rutina (Trabajo Duro).
 * Una ocurrencia renombrada de la serie («🧹 Preparar la grupal» dentro de «Trabajo fuerte») es única: se ve. Si en lo leído no hay
 * nada del calendario de la rutina (otra instalación), vale la marca por frecuencia de siempre (`rutinasDiarias`), con las mismas
 * condiciones. Los bloques fantasma de la Semana Perfecta siguen el mismo corte (`yaEmpezo`). Pruebas: tests/planning/rutina-futura.test.ts.
 */

/** El calendario de la rutina de esta instalación (`config/instalacion.ts`); '' = sin calendario propio, vale la frecuencia. */
export const CALENDARIO_RUTINA = instalacion().calendarioRutinaId

export interface EventoAgenda extends EventoRutina {
  calendarId: string
  description?: string | null
  meetUrl?: string | null
  attendees?: { self: boolean }[]
}

/** Con otras personas: invitados que no son uno o videollamada. Lo mismo que `esCompromiso` (categorias.ts), sin su dependencia. */
const conOtros = (e: EventoAgenda) => Boolean(e.meetUrl) || (e.attendees ?? []).some(a => !a.self)

/** Los ids de la rutina en lo leído (conviene pasar más que lo visible: la serie se mide entera). */
export function rutinaDeAgenda(eventos: readonly EventoAgenda[], diaDe?: (iso: string) => string, calendario: string = CALENDARIO_RUTINA): Set<string> {
  // Lo marcado «no negociable» (secciones.ts) nunca es rutina oculta: despertar y gym se ven siempre.
  const puede = (e: EventoAgenda) => !e.allDay && Boolean(e.recurringEventId) && !conOtros(e) && !esNoNegociable(e)
  const ids = new Set<string>()
  if (!eventos.some(e => e.calendarId === calendario)) {
    const diarias = rutinasDiarias(eventos, diaDe)
    for (const e of eventos) if (puede(e) && diarias.has(e.id)) ids.add(e.id)
    return ids
  }
  const propios = eventos.filter(e => e.calendarId === calendario && puede(e))
  const cuenta = new Map<string, Map<string, number>>()
  for (const e of propios) {
    const s = e.recurringEventId!, t = tituloBase(e.title)
    if (!cuenta.has(s)) cuenta.set(s, new Map())
    cuenta.get(s)!.set(t, (cuenta.get(s)!.get(t) ?? 0) + 1)
  }
  for (const e of propios) {
    const titulos = cuenta.get(e.recurringEventId!)!, mio = titulos.get(tituloBase(e.title)) ?? 0
    // Renombrada: su título es minoría en una serie con otro título más común.
    if ([...titulos.values()].some(n => n > mio)) continue
    ids.add(e.id)
  }
  return ids
}

/** Ya empezó (epoch ms): lo de antes de «ahora» se ve siempre. */
export const yaEmpezo = (inicio: number, ahora: number) => inicio < ahora

/** ¿Se oculta este evento? Rutina que todavía no empieza, salvo que se pida verla. */
export function rutinaOculta(e: { id: string; start: string }, rutina: ReadonlySet<string>, ahora: number, mostrar = false): boolean {
  return !mostrar && rutina.has(e.id) && !yaEmpezo(Date.parse(e.start), ahora)
}
