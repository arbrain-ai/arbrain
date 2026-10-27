'use client'
import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronRight } from 'lucide-react'
import type { Goal, GoalSnapshot } from '@/features/goals/model'
import { taskDay } from '@/features/goals/model'
import { dayKey, hasTime } from './model'
import { tareaObjetivo, tituloCumplido } from './dia-vivo'
import { tareasDelPeriodo } from './plan-periodo'
import { diasEntre, objetivoDe, porDia, rejillaDelMes, tareasPorDia } from './periodo-vivo'
import { compromisosDelDia, entregablesDe, mismoTitulo } from './claridad'
import { ContadorPeriodo } from './ContadorPeriodo'
import { Entregables, ObjetivoCaja, Segmentos } from './ObjetivoCaja'
import { esc, sinEmoji, useAhora } from './vivo-piezas'
import { SemanaHoras, type MarcaDia } from './SemanaHoras'
import { diasDesde, diasVisibles, esFinDeSemana, lunesDe, medianoche, medianocheSiguiente, semanaDeMayoria, sumarDia, TRAMO, type Bloque, type DiasVista } from './semana-horas'
import { esCompromiso } from './categorias'
import { rutinasDiarias } from './rutinas'
import { Leyenda, type ControlLeyenda } from './Leyenda'
import { LeyendaDrip, useGobierno } from './gobierno'
import { esDelegable, type LecturaDrip } from './drip'
import type { PlanEvent, PlanItem, PlanTask, PlanningSnapshot } from './types'
import c from './claridad.module.css'

/**
 * La Semana (6 oct 2026). Responde, firmado por Daniel: «¿qué logro cada día para cumplir el objetivo de la semana?».
 * Arriba, el objetivo con sus entregables como casillas y su conteo. Debajo, la semana en horas (9 oct 2026, «una vista de
 * calendario normal… desde las cinco hasta las diez pm»): arrastrar mueve, tocar un hueco crea (SemanaHoras.tsx). La lista
 * de antes, una fila por día con su ⭐ y uno o dos compromisos, sigue a un toque como «Agenda».
 *
 * Ventana deslizante (10 oct 2026): lo visible puede cruzar dos semanas. El objetivo, su número y la Agenda siguen a la
 * semana con más días a la vista (`semanaDeMayoria`); los chips de horas cuentan solo los días visibles.
 *
 * Ronda 2 (10 oct 2026): Horas · Agenda, Enfoque y los días a la vista viven en el engrane del calendario (ajustes.ts); aquí
 * llegan como props y la Semana no trae botones sueltos.
 */
const quita = (s: string) => s.replace(/\./g, '')

/** Lo que se pliega en una línea y se abre con un toque (ajustes.ts: `abreObjetivo`, `abreTodoElDia`), igual en Día, Semana y Mes. */
export interface Plegado { objetivo: boolean; todoElDia: boolean; alternar: (que: 'objetivo' | 'todoElDia') => void }

/** S1…S5 dentro de su mes (el del jueves de la semana, como el recorrido del Mes). */
export function numeroDeSemana(lunes: string): number {
  const jueves = parseISO(lunes); jueves.setDate(jueves.getDate() + 3)
  return rejillaDelMes(jueves).findIndex(s => s[0] === lunes) + 1
}

/** El ⭐ de un día: la tarea `objetivo` de Todoist; si no, el registro; si no, el evento «Objetivo del dia» de Google. */
export function objetivoDelDia(goals: Goal[], snapshot: PlanningSnapshot | null, dia: string, zona: string): { titulo: string; cumplido: boolean } | null {
  const ancla = tareaObjetivo(snapshot?.tasks ?? [], snapshot?.completedTasks ?? [], dia, t => taskDay(t, zona))
  if (ancla) return { titulo: sinEmoji(ancla.tarea.title), cumplido: ancla.hecha }
  const o = objetivoDe(goals, snapshot, 'day', dia)
  if (!o) return null
  const ev = o.eventoId ? snapshot?.events.find(e => e.id === o.eventoId) : null
  return { titulo: sinEmoji(o.titulo), cumplido: Boolean(ev && tituloCumplido(ev.title)) || o.estado === 'completed' }
}

export const ESTRELLA = <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9z" /></svg>

export type VistaSemana = 'horas' | 'agenda'
const claveVista = (donde: string) => `arbrain:planning:semana-vista:${donde}`
/** Horas o Agenda, recordado por superficie (la sección y el panel pueden pensar distinto). */
export function useVistaSemana(donde: string): [VistaSemana, (v: VistaSemana) => void] {
  const [vista, setVista] = useState<VistaSemana>(() => { try { return localStorage.getItem(claveVista(donde)) === 'agenda' ? 'agenda' : 'horas' } catch { return 'horas' } })
  return [vista, v => { setVista(v); try { localStorage.setItem(claveVista(donde), v) } catch { /* sin almacenamiento: vale para esta sesión */ } }]
}

/** El selector Horas · Agenda, igual en el calendario y en el chat. */
export function SelectorVista({ vista, onVista }: { vista: VistaSemana; onVista: (v: VistaSemana) => void }) {
  return <div className={c.selector} role="tablist" aria-label="Cómo ver la semana">
    {(['horas', 'agenda'] as const).map(v => <button key={v} role="tab" aria-selected={vista === v} onClick={() => onVista(v)}
      title={v === 'horas' ? 'La semana en horas: arrastra para mover, toca un hueco para crear' : 'Una fila por día con su objetivo y sus compromisos'}>{v === 'horas' ? 'Horas' : 'Agenda'}</button>)}
  </div>
}

/** Los bloques con hora de la semana: eventos visibles y tareas con hora. Lo de día completo va a la franja. */
export function bloquesDeSemana(eventos: PlanEvent[], tareas: PlanTask[], visible: (e: PlanEvent) => boolean, color: (e: PlanEvent) => string | null,
  /** DRIP (24 oct 2026): la etiqueta «delegable», de quién es y si está protegido. Sin esto (la vista del chat), nada cambia. */
  drip?: (e: PlanEvent) => LecturaDrip): Bloque[] {
  // La Perfect Week (24 oct 2026): rutina es lo que se repite casi a diario (rutinas.ts), no cualquier serie; la clase semanal resalta.
  const rutinas = rutinasDiarias(eventos, iso => dayKey(parseISO(iso)))
  return [
    ...eventos.filter(e => !e.allDay && visible(e)).map(e => ({ id: e.id, titulo: sinEmoji(e.title || '(sin título)'), inicio: Date.parse(e.start), fin: Date.parse(e.end), color: color(e), movible: e.editable,
      rutina: rutinas.has(e.id), compromiso: esCompromiso(e), ...(drip ? marcaDrip(drip(e)) : {}) })),
    ...tareas.filter(t => t.due && hasTime(t.due) && !t.completed).map(t => { const ini = Date.parse(t.due!); return { id: t.id, titulo: sinEmoji(t.title), inicio: ini, fin: ini + (t.durationMinutes ?? 30) * 60_000, color: null, movible: true, tarea: true, prioridad: t.priority === 1, ...(t.durationMinutes ? {} : { sinDuracion: true }) } }),
  ]
}
/** Lo que DRIP le pone a un bloque de la rejilla: su cuadrante, la etiqueta de delegable, de quién es y si está protegido. */
export const marcaDrip = (l: LecturaDrip) => ({ drip: l.cuadrante, delegable: esDelegable(l.cuadrante), delegadoA: l.delegadoA, protegido: l.protegido })
/** Lo de día completo, por día civil (un viaje de tres días aparece en sus tres columnas). */
export function todoElDiaDeSemana(dias: string[], eventos: PlanEvent[], visible: (e: PlanEvent) => boolean, color: (e: PlanEvent) => string | null, abrir?: (e: PlanEvent) => void) {
  const mapa = new Map<string, MarcaDia[]>(dias.map(d => [d, []]))
  for (const e of eventos) {
    if (!e.allDay || !visible(e)) continue
    for (const d of dias) if (e.start.slice(0, 10) <= d && d < e.end.slice(0, 10)) mapa.get(d)!.push({ id: e.id, titulo: sinEmoji(e.title || '(sin título)'), color: color(e), abrir: abrir ? () => abrir(e) : undefined })
  }
  return mapa
}

export function SemanaClara({ goals, guardarObjetivo, fecha, ventana, onVentana, snapshot, eventos, visible, color, tareas, zona, cargando, donde = 'seccion', leyenda, onDia, onAbrir, onMover, onEstirar, onCrear,
  vista = 'horas', enfoque = false, diasVista = null, finDeSemana = true, tramo = TRAMO, compacta = false, etiquetaZona = null, plegado, dosColumnas = false }: {
  goals: { data: GoalSnapshot | null; error: string | null }
  /** El primer día visible y cuántos se ven (null hasta que la rejilla se mida: entonces manda la semana de `fecha`). */
  ventana?: { inicio: string | null; n: number }
  onVentana?: (inicio: string, n: number) => void
  /** Marcar un entregable escribe en el registro de objetivos (useGoals.save). */
  guardarObjetivo?: (g: Goal) => Promise<unknown>
  fecha: Date; snapshot: PlanningSnapshot | null; eventos: PlanEvent[]
  visible: (e: PlanEvent) => boolean; color: (e: PlanEvent) => string | null
  tareas: PlanTask[]; zona: string; cargando: boolean
  donde?: string
  /** Colores por tipo de trabajo: chips con horas y filtro, y el menú de calendarios (10 oct 2026). */
  leyenda?: ControlLeyenda
  onConversar?: (borrador: string) => void; onDia: (dia: string) => void
  /** La hoja de detalle del elemento. */
  onAbrir?: (item: PlanItem) => void
  /** Escribir un movimiento por la pluma del calendario (autoguardado: si Google no confirma, vuelve y lo avisa). */
  onMover?: (item: PlanItem, inicio: Date, fin: Date) => void
  onEstirar?: (item: PlanItem, fin: Date) => void
  /** Arrastrar en un hueco (o doble clic): el editor en ese rango. */
  onCrear?: (inicio: Date, fin: Date) => void
  /** Lo del engrane (ajustes.ts). */
  vista?: VistaSemana; enfoque?: boolean; diasVista?: DiasVista | null; finDeSemana?: boolean
  tramo?: { desde: number; hasta: number }; compacta?: boolean; etiquetaZona?: string | null
  /** Lo principal plegado en una línea (el objetivo y lo de día completo); un toque lo abre. Sin esto, todo abierto (el chat). */
  plegado?: Plegado
  /** Pantalla completa (24 oct 2026): a la izquierda la temporada, el foco abierto con sus entregables y la lista de cada día; a la
   *  derecha la semana en horas a alto completo (7 columnas, de 5:00 a 22:00, sin scroll). Horas · Agenda dejan de ser excluyentes. */
  dosColumnas?: boolean
}) {
  const ahora = useAhora(), hoy = dayKey(new Date(ahora))
  const semana = dayKey(fecha)
  const inicio = ventana?.inicio ?? null, nVista = ventana?.n ?? 7
  const visibles = useMemo(() => inicio ? diasVisibles(inicio, nVista, finDeSemana) : diasVisibles(lunesDe(semana), finDeSemana ? 7 : 5, finDeSemana), [inicio, nVista, semana, finDeSemana])
  const desde = useMemo(() => semanaDeMayoria(visibles), [visibles]), hasta = sumarDia(desde, 7)
  const dias = useMemo(() => diasEntre(desde, hasta), [desde, hasta])
  // Lo que pinta el riel (la ventana y su colchón): la ⭐ y lo de día completo se preparan para ±5 semanas alrededor.
  const ancla = lunesDe(inicio ?? desde)
  const diasRiel = useMemo(() => diasDesde(sumarDia(ancla, -35), 84), [ancla])
  const agenda = useMemo(() => porDia(dias, eventos, visible, color), [dias, eventos, visible, color])
  const porDiaTareas = useMemo(() => tareasPorDia(tareasDelPeriodo(tareas, desde, hasta, zona), dias, zona), [tareas, desde, hasta, zona, dias])

  const goal = useMemo(() => goals.data?.goals.find(g => g.scope === 'week' && g.start === desde) ?? null, [goals.data, desde])
  // Sin registro, vale el evento «🎯 Semana N · …» de Google (sin casillas).
  const objetivo = useMemo(() => goals.data ? objetivoDe(goals.data.goals, snapshot, 'week', desde) : null, [goals.data, snapshot, desde])
  const entregables = goal ? entregablesDe(goal.success).items : []
  const hechos = entregables.filter(e => e.hecho).length
  const n = numeroDeSemana(desde)
  const objetivos = useMemo(() => new Map(diasRiel.map(x => [x, goals.data ? objetivoDelDia(goals.data.goals, snapshot, x, zona) : null])), [goals.data, snapshot, diasRiel, zona])

  const porId = useMemo(() => new Map<string, PlanItem>([...eventos, ...tareas].map(i => [i.id, i])), [eventos, tareas])
  const gobierno = useGobierno()
  const bloques = useMemo(() => bloquesDeSemana(eventos, tareas, visible, color, gobierno?.lectura), [eventos, tareas, visible, color, gobierno?.lectura])
  const todoElDia = useMemo(() => todoElDiaDeSemana(diasRiel, eventos, visible, color, onAbrir), [diasRiel, eventos, visible, color, onAbrir])
  const estrellas = useMemo(() => new Map([...objetivos].map(([d, o]) => [d, o ? { titulo: o.titulo, cumplido: o.cumplido } : null])), [objetivos])
  const item = (b: Bloque) => porId.get(b.id)
  // Enfoque (10 oct 2026, Daniel): se van los chips de categorías y el subtítulo; quedan el objetivo, los botones y la rejilla.
  // DRIP (24 oct 2026): la leyenda es la matriz; en ancho vive en la barra del calendario y aquí no se repite.
  const chips = leyenda && !enfoque ? gobierno ? (gobierno.leyendaEnBarra ? null : <LeyendaDrip />)
    : <Leyenda ctl={leyenda} eventos={eventos} desde={medianoche(visibles[0])} hasta={medianocheSiguiente(visibles[visibles.length - 1])} periodo="semana" /> : null


  const pliega = dosColumnas ? undefined : plegado
  const etiqueta = `Semana del ${format(parseISO(desde), "d 'de' MMMM", { locale: es })}`
  const objetivoCaja = <>
    {/* El objetivo nace plegado en una línea (ronda 3): un toque lo abre con sus entregables. */}
    <ObjetivoCaja rotulo={pliega && !pliega.objetivo ? <>Semana{n > 0 && <b> · S{n}</b>}</> : <>Objetivo de la semana{n > 0 && <b> · S{n}</b>}{goal?.status === 'draft' && <em> · en planificación</em>}{goal?.status === 'completed' && <em> · cumplido</em>}</>}
      titulo={objetivo?.titulo ?? null} vacio="Sin objetivo para esta semana." leyendo={!goals.data && !goals.error}
      cuenta={entregables.length ? { k: hechos, n: entregables.length, clave: `sem-${goal!.id}-${hechos}` } : null}
      plegada={pliega ? !pliega.objetivo : false} onPlegar={pliega ? () => pliega.alternar('objetivo') : undefined}>
      {goal ? <>
        <Segmentos k={hechos} n={entregables.length} i={1} />
        <Entregables texto={goal.success} guardar={guardarObjetivo ? success => guardarObjetivo({ ...goal, success }) : undefined} i0={2} nombre="Entregables de la semana" />
      </> : null}
    </ObjetivoCaja>
  </>
  const horasRejilla = (llenar: boolean) => <SemanaHoras listo={Boolean(snapshot) || !cargando} dias={onVentana ? undefined : dias} semana={semana} inicio={inicio} onVentana={onVentana} sinBarra={enfoque} hoy={hoy} ahora={ahora} bloques={bloques} todoElDia={todoElDia} estrellas={estrellas} onDia={onDia} donde={donde} barra={chips} amplia={enfoque}
        diasVista={llenar ? 7 : diasVista} finDeSemana={finDeSemana} tramo={tramo} compacta={compacta} zona={etiquetaZona} llenar={llenar}
        todoElDiaAbierto={plegado?.todoElDia} onTodoElDia={plegado ? () => plegado.alternar('todoElDia') : undefined}
        onAbrir={onAbrir ? b => { const i = item(b); if (i) onAbrir(i) } : undefined}
        onMover={onMover ? (b, inicio, fin) => { const i = item(b); if (i) onMover(i, inicio, fin) } : undefined}
        onEstirar={onEstirar ? (b, fin) => { const i = item(b); if (i) onEstirar(i, fin) } : undefined}
        onCrear={onCrear} />
  const listaDias = (desdeI: number) => <ol className={c.dias}>{dias.filter(d => finDeSemana || !esFinDeSemana(d)).map((dia, i) => {
        const f = parseISO(dia), od = objetivos.get(dia) ?? null, esHoy = dia === hoy, pasado = dia < hoy
        const { lista, resto } = compromisosDelDia(agenda.get(dia)!, porDiaTareas.get(dia) ?? [], 2, t => !!od && mismoTitulo(t, od.titulo))
        return <li key={dia} className={c.entra} style={esc(desdeI + i)}>
          <button className={c.dia} data-hoy={esHoy || undefined} data-pasado={pasado || undefined} onClick={() => onDia(dia)}
            aria-label={`Abrir el ${format(f, "EEEE d", { locale: es })}${od ? `: ${od.titulo}` : ''}`}>
            <span className={c.fecha}><small>{quita(format(f, 'EEE', { locale: es }))}</small><b>{format(f, 'd')}</b>{esHoy && <em>Hoy</em>}</span>
            <span className={c.diaCuerpo}>
              <span className={c.diaLinea}>{od ? <span className={c.estrellaDia} data-cumplido={od.cumplido || undefined}>{ESTRELLA}<span>{od.titulo}</span></span>
                : <span className={c.sinObjetivo}>{pasado ? 'Sin objetivo' : 'Sin objetivo del día'}</span>}
                {resto > 0 && <span className={c.mas}>+{resto}</span>}</span>
              {lista.map(x => <span key={x.id} className={c.compromiso} data-tarea={x.tipo === 'tarea' || undefined}>
                {x.hora ? <time>{x.hora}</time> : <i aria-hidden />}<span>{sinEmoji(x.titulo)}</span></span>)}
            </span>
            <ChevronRight size={14} aria-hidden className={c.ir} />
          </button>
        </li>
      })}</ol>

  // Pantalla completa (24 oct 2026, Daniel: «en la semana podemos hacer lo mismo: el calendario más angosto, tipo a la mitad de la
  // pantalla, a la mitad derecha, y lo importante al lado izquierdo»).
  if (dosColumnas) return <section className={c.vista} data-dos-columnas aria-label={etiqueta}>
    <div className={c.izquierda}>
      <ContadorPeriodo delgada i={0} />
      {objetivoCaja}
      <div className={`${c.subtitulo} ${c.entra}`} style={esc(6)}><h3>Cada día</h3></div>
      {cargando && !snapshot ? <p className={c.leyendo}>Leyendo tu calendario…</p> : listaDias(7)}
    </div>
    <div className={`${c.derecha} ${c.entra}`} style={esc(4)}>
      {cargando && !snapshot ? <p className={c.leyendo}>Leyendo tu calendario…</p> : horasRejilla(true)}
    </div>
  </section>

  return <section className={c.vista} aria-label={etiqueta}>
    {objetivoCaja}
    <ContadorPeriodo />

    {!enfoque && <div className={`${c.subtitulo} ${c.entra}`} style={esc(6)}><h3>{vista === 'horas' ? 'La semana en horas' : 'Cada día'}</h3></div>}

    {cargando && !snapshot ? <p className={c.leyendo}>Leyendo tu calendario…</p>
      : vista === 'horas' ? <div className={c.entra} style={esc(7)}>{horasRejilla(false)}</div>
      : <>{chips}{listaDias(7)}</>}
  </section>
}
