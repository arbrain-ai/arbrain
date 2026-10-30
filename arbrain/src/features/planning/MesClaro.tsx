'use client'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Goal, GoalSnapshot } from '@/features/goals/model'
import { dayKey } from './model'
import { objetivoDe, periodoDeEscala, rejillaDelMes } from './periodo-vivo'
import { entregablesDe } from './claridad'
import { DRIP, esFase, nombreDeFase, semanaDelPrograma, type Atencion, type Piedra } from './drip'
import { Entregables, Segmentos } from './ObjetivoCaja'
import { FranjaPlan } from './FranjaPlan'
import { useAhora } from './vivo-piezas'
import { resumenSemana } from './mes-resumen'
import type { PlanEvent, PlanningSnapshot } from './types'
import type { Plegado } from './SemanaClara'
import c from './claridad.module.css'

/**
 * El Mes como «piedras grandes» (25 oct 2026, Daniel: «la vista mensual es la que necesita más atención», «no me gusta que todo el
 * color se hizo amarillo», «monk mode mejor solo en la vista de hábitos»). Referentes: Notion Calendar, los roadmaps de Linear, Things.
 *
 * Arriba, UNA franja: solo el objetivo del mes; al desplegarla, sus entregables (sin temporada, sin hábitos, sin contadores).
 * Debajo, el mes mismo:
 *   - pantalla ancha: la cuadrícula de FullCalendar a lo ancho (PlanningCalendar), con las fases como cintas finas y neutras que
 *     cruzan semanas, viajes en morado, las clases como chips de una línea, S0…S11 del programa a la izquierda de cada fila, hoy
 *     marcado y lo pasado atenuado;
 *   - angosto (390 px): una lista por semanas con lo mismo: S del programa, objetivo de la semana, cintas de fase en su tramo de
 *     días, marcas (hitos y viajes) y el ritmo de la semana como puntos por día. Un toque en un día abre el Día.
 * La cuadrícula clásica sigue a un toque en el engrane (Recorrido o Cuadrícula) para lo angosto.
 *
 * El Recorrido es el default en TODAS las pantallas (25 oct 2026, Daniel): abre en la semana actual, las pasadas quedan atenuadas y
 * compactas (solo su ceja) y la ceja de cada semana es un botón que lleva a esa Semana.
 *
 * Limpiar el ruido (25 oct 2026, Daniel: «la veo difícil de estudiar, siento redundancia con las fases y objetivos… no hay colores
 * que guíen la atención»). Una sola línea por concepto:
 *   - la fase ya no es cinta: es la etiqueta junto al número («S2 · Supernova») y el objetivo de la semana es el título;
 *   - lo de varios días es UNA barra que cruza sus días; si sigue en la semana siguiente, allá queda solo el tramo, sin título;
 *   - solo lo que pide actuar lleva color (`atencionDe`): uno a uno y llamadas clave en bronce, Monterrey y lo de adentro en
 *     morado; lo demás, neutro. La semana actual lleva el borde dorado; las pasadas, tenues.
 *
 * Sin nombres (28 oct 2026, Daniel: «no debe listar cada diagnóstico con nombre de persona; eso es de la semana»): cada semana es su
 * objetivo y, plegable, UNA línea de resumen («7 uno a uno · demo day», mes-resumen.ts) con la tira de sus días. La semana actual
 * nace abierta; las demás, plegadas. El detalle con nombres y horas vive en la Semana (la ceja lleva ahí).
 */
export interface EventoMes { evento: PlanEvent; piedra: Piedra; color: string; atencion?: Atencion }

/** El color de la atención: bronce para actuar, morado para el viaje, nada para lo demás. */
const COLOR_ATENCION: Record<'accion' | 'viaje', string> = { accion: DRIP.producir.color, viaje: DRIP.invertir.color }
const colorAtencion = (a: Atencion | undefined) => a ? COLOR_ATENCION[a] : undefined

const quita = (s: string) => s.replace(/\./g, '')
const sinEmoji = (t: string) => t.replace(/^\s*(?:✓\s*)?(?:[\p{Extended_Pictographic}‍️]+\s*)+/u, '') || t
function rango(a: string, b: string) {
  const x = parseISO(a), y = parseISO(b)
  return x.getMonth() === y.getMonth() ? `${format(x, 'd')} – ${format(y, 'd MMM', { locale: es })}`.replace('.', '') : `${quita(format(x, 'd MMM', { locale: es }))} – ${quita(format(y, 'd MMM', { locale: es }))}`
}
/** Primer y último día (inclusive) de un evento, en días civiles. */
function diasDe(e: PlanEvent): [string, string] {
  const a = dayKey(parseISO(e.start))
  if (!e.allDay) return [a, a]
  const fin = dayKey(addDays(parseISO(e.end), -1))
  return [a, fin < a ? a : fin]
}

export function MesClaro({ goals, fecha, snapshot, cargando, angosto, cuadricula, plegado, dosColumnas = false, guardarObjetivo, eventos = [], programa = null, onDia, onSemana }: {
  goals: { data: GoalSnapshot | null; error: string | null }
  fecha: Date; snapshot: PlanningSnapshot | null; cargando: boolean; angosto: boolean
  /** La cuadrícula clásica (FullCalendar) en lugar de la lista por semanas: aquí solo queda la franja. */
  cuadricula: boolean
  onConversar?: (borrador: string) => void; onSemana?: (lunes: string) => void
  enfoque?: boolean
  plegado?: Plegado
  /** Pantalla ancha: la franja va arriba a lo ancho y la cuadrícula debajo (PlanningCalendar la pone ahí). */
  dosColumnas?: boolean
  guardarObjetivo?: (g: Goal) => Promise<unknown>
  /** Lo que el Mes pinta (sin rutinas diarias), ya clasificado por piedra. */
  eventos?: readonly EventoMes[]
  /** Semanas del programa (drip.ts `semanasDelPrograma`); null = sin programa, sin números. */
  programa?: { lunes0: number; ultima: number } | null
  onDia?: (dia: string) => void
}) {
  const ahora = useAhora(), hoy = dayKey(new Date(ahora))
  const { desde, hasta } = useMemo(() => periodoDeEscala('month', fecha), [fecha])
  const goal = useMemo(() => goals.data?.goals.find(g => g.scope === 'month' && g.start === desde) ?? null, [goals.data, desde])
  const objetivo = useMemo(() => goals.data ? objetivoDe(goals.data.goals, snapshot, 'month', desde) : null, [goals.data, snapshot, desde])
  const mes = format(parseISO(desde), 'MMMM', { locale: es })

  const semanas = useMemo(() => {
    const vistos = new Set<string>()
    return rejillaDelMes(fecha).map((dias, i) => {
      const lunes = dias[0], domingo = dias[6]
      const o = goals.data ? objetivoDe(goals.data.goals, snapshot, 'week', lunes) : null
      const de = eventos.map(x => ({ ...x, dias: diasDe(x.evento) })).filter(x => x.dias[0] <= domingo && x.dias[1] >= lunes)
      // La fase es la etiqueta de la semana (la que cubre más días de ella), no otra cinta.
      const cubre = (x: { dias: [string, string] }) => Date.parse(x.dias[1] > domingo ? domingo : x.dias[1]) - Date.parse(x.dias[0] < lunes ? lunes : x.dias[0])
      const fase = de.filter(x => x.piedra === 'hito' && esFase(x.evento)).sort((a, b) => cubre(b) - cubre(a))[0]
      const resto = de.filter(x => !(x.piedra === 'hito' && esFase(x.evento)))
      // Lo de varios días es una barra; el título va solo en la primera semana donde aparece (allá abajo, el tramo sin repetirlo).
      const barras = resto.filter(x => x.piedra !== 'chip' && x.dias[0] < x.dias[1]).sort((a, b) => a.dias[0].localeCompare(b.dias[0]))
        .map(x => { const primera = !vistos.has(x.evento.id); vistos.add(x.evento.id); return { ...x, primera } })
      // Marcas: lo de un día y las llamadas clave (con otra persona, sin serie); el resto de lo que tiene hora es ritmo.
      const marcas = resto.filter(x => x.piedra === 'chip' ? x.atencion === 'accion' : x.dias[0] === x.dias[1]).sort((a, b) => a.evento.start.localeCompare(b.evento.start))
      const ritmo = dias.map(d => ({ dia: d, chips: de.filter(x => x.piedra === 'chip' && x.dias[0] === d) }))
      const resumen = resumenSemana([...barras.map(x => ({ titulo: x.evento.title, variosDias: true })), ...marcas.map(x => ({ titulo: x.evento.title, variosDias: false }))])
      return { n: i + 1, lunes, domingo, dias, s: semanaDelPrograma(lunes, programa), fase: fase ? nombreDeFase(fase.evento.title) : null, titulo: o?.titulo ?? null, resumen, ritmo }
    })
  }, [fecha, goals.data, snapshot, eventos, programa])

  // Abre posicionado en la semana actual: si hay semanas pasadas arriba, la actual sube al borde (una vez por mes montado).
  const lista = useRef<HTMLOListElement>(null), situado = useRef(false)
  useEffect(() => {
    if (situado.current || !lista.current) return
    const actual = lista.current.querySelector<HTMLElement>('[data-actual]')
    if (!actual) return
    situado.current = true
    if (actual.previousElementSibling) actual.scrollIntoView({ block: 'start' })
  }, [semanas])

  // Qué semanas están abiertas: la actual nace abierta (28 oct 2026); un toque abre o pliega cualquiera.
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(() => new Set([dayKey(addDays(parseISO(hoy), -((parseISO(hoy).getDay() + 6) % 7)))]))
  const alternarSemana = (lunes: string) => setAbiertas(a => { const n = new Set(a); if (n.has(lunes)) n.delete(lunes); else n.add(lunes); return n })
  const criterios = goal ? entregablesDe(goal.success).items : []
  const franja = <FranjaPlan clave="arbrain.calendario.franja-mes-abierta"
    rotulo={<>Mes<b> · {mes}</b>{goal?.status === 'draft' && <em> · en planificación</em>}</>}
    titulo={objetivo?.titulo ?? null} vacio={cargando && !goals.data ? 'Leyendo el objetivo…' : 'Sin objetivo para este mes.'}
    cuenta={criterios.length ? { k: criterios.filter(e => e.hecho).length, n: criterios.length } : null}
    detalle={criterios.length > 0 && <>
      <Segmentos k={criterios.filter(e => e.hecho).length} n={criterios.length} i={0} />
      <Entregables texto={goal!.success} guardar={guardarObjetivo ? success => guardarObjetivo({ ...goal!, success }) : undefined} i0={1} nombre="Entregables del mes" />
    </>} />

  return <section className={c.vista} data-angosto={angosto || undefined} data-dos-columnas={dosColumnas || undefined} data-mes-piedras aria-label={`Mes de ${format(parseISO(desde), 'MMMM yyyy', { locale: es })}`}>
    {franja}
    {dosColumnas || cuadricula ? null : <ol ref={lista} className={c.mesLista} aria-label="Semanas del mes">{semanas.map(w => {
      const pasada = w.domingo < hoy, actual = w.lunes <= hoy && hoy <= w.domingo
      const abierta = abiertas.has(w.lunes)
      return <li key={w.lunes} className={c.mesSemana} data-pasada={pasada || undefined} data-actual={actual || undefined} data-abierta={abierta || undefined}>
        <header className={c.mesCejaFila}>
          <button type="button" className={c.mesCeja} onClick={onSemana ? () => onSemana(w.lunes) : undefined} disabled={!onSemana}
            aria-label={`Abrir la semana${w.s ? ` ${w.s}` : ''}${w.fase ? ` (${w.fase})` : ''} del ${rango(w.lunes, w.domingo)}${w.titulo ? `: ${w.titulo}` : ''}`}>
            {(w.s || w.fase) && <span className={c.mesS}>{w.s && <b>{w.s}</b>}{w.s && w.fase && ' · '}{w.fase}</span>}
            <span className={c.mesRango}>{rango(w.lunes, w.domingo)}</span>
            {w.titulo && <span className={c.mesTitulo}>{w.titulo}</span>}
            <ChevronRight size={14} className={c.mesIr} aria-hidden />
          </button>
          {!pasada && <button type="button" className={c.mesPlegar} onClick={() => alternarSemana(w.lunes)} aria-expanded={abierta}
            aria-label={abierta ? 'Plegar la semana' : `Ver el resumen de la semana${w.resumen ? `: ${w.resumen}` : ''}`}><ChevronDown size={14} aria-hidden /></button>}
        </header>
        {pasada || !abierta ? null : <>
        {w.resumen && <p className={c.mesResumen} data-resumen>{w.resumen}</p>}
        <div className={c.mesRitmo} role="group" aria-label={`Días de la semana del ${rango(w.lunes, w.domingo)}`}>{w.ritmo.map(d => {
          const fuera = d.dia < desde || d.dia >= hasta
          return <button key={d.dia} className={c.mesDia} onClick={onDia ? () => onDia(d.dia) : undefined} data-hoy={d.dia === hoy || undefined} data-pasado={d.dia < hoy || undefined} data-fuera={fuera || undefined}
            aria-label={`${format(parseISO(d.dia), "EEEE d 'de' MMMM", { locale: es })}: ${d.chips.length ? d.chips.map(x => sinEmoji(x.evento.title)).join(', ') : 'sin compromisos'}`}
            title={d.chips.map(x => `${format(parseISO(x.evento.start), 'HH:mm')} ${sinEmoji(x.evento.title)}`).join('\n') || undefined}>
            <small>{quita(format(parseISO(d.dia), 'EEEEE', { locale: es })).toUpperCase()}</small><b>{format(parseISO(d.dia), 'd')}</b>
            <span className={c.mesPuntos} aria-hidden>{d.chips.slice(0, 4).map(x => <i key={x.evento.id} data-atencion={x.atencion ?? undefined} style={{ '--c': colorAtencion(x.atencion) } as CSSProperties} />)}</span>
          </button>
        })}</div>
        </>}
      </li>
    })}</ol>}
  </section>
}
