'use client'
import { useMemo, useRef } from 'react'
import { addDays, format, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowDownUp, Plus } from 'lucide-react'
import type { Goal, GoalSnapshot } from '@/features/goals/model'
import { taskDay } from '@/features/goals/model'
import { shiftDay } from '@/features/sistema/calendar-days'
import { useCivilClock, useHabitRecords } from '@/features/sistema/useHabitRecords'
import { dayKey } from './model'
import { bloquesDelDia, casillasDelDia, enCurso, ETIQUETA_OBJETIVO, eventoObjetivoDelDia, objetivosDelDia, tareaObjetivo, tituloCumplido } from './dia-vivo'
import { AgendaMini } from './AgendaMini'
import { ordenarAgenda } from './agenda-llamadas'
import { Leyenda, type ControlLeyenda } from './Leyenda'
import { objetivoDe } from './periodo-vivo'
import { HabitosHoy } from './HabitosHoy'
import { VENTANA_RACHA } from './habitos-dia'
import { AvisoHecha, FilaTarea, proyectosDe, sinEmoji, TarjetaAhora, useAhora, useCompletar } from './vivo-piezas'
import { entregablesDe } from './claridad'
import { ContadorPeriodo } from './ContadorPeriodo'
import { Entregables, ObjetivoCaja, Segmentos } from './ObjetivoCaja'
import type { EditorSelection } from './PlanEditor'
import type { PlanEvent, PlanItem, PlanTask, PlanningSnapshot } from './types'
import type { Plegado } from './SemanaClara'
import { etiquetaOrden, ordenarTareas, siguienteOrden, topTareas, useOrdenTareas, usePreferencia, vencida } from './orden-tareas'
import d from './dia-vivo.module.css'

/**
 * La hoja del día (Calendario › Día, 5 oct 2026). Nació de la vista Día de la Cabina v2 y vive con las plumas del calendario:
 * completar y abrir pasan por el mismo `commit` (Todoist y Google, con ⌘Z).
 *
 * Una sola vista sin scroll (5 oct 2026, 16:36 → 17:48, «súper simple, sin redundancia»):
 *   fila de arriba (PlanningCalendar) → el objetivo del día → agenda mini | tareas → hábitos, una fila pequeñita cada uno.
 * El objetivo va ARRIBA con la misma caja que la Semana y el Mes (10 oct 2026, Daniel: «que se vea hasta arriba el objetivo
 * del día. Y que yo al darle clic simplemente me aparezcan los checkbox… toma de referencia la de la semana»; reemplaza el
 * «objetivo con estrella abajo» del 6 oct). Plegado en una línea; un toque lo abre con sus casillas (`casillasDelDia`). Tocarlo
 * ya no abre «Crear tarea»: solo el estado vacío ofrece fijar uno. Cumplirlo sigue en la fila «Objetivo del día» de Hábitos
 * (el mismo dato: tarea, ✓ en Google y hábito `objetivo_dia`). La tarea-objetivo sigue primera en Tareas.
 *
 * 18 oct 2026 (Daniel): las tareas suben arriba de la agenda como «Top 3» plegado (vencidas P1, luego P1→P4, luego hora) con
 * «Ver todas (N)» y el orden Hora · Prioridad · Proyecto (orden-tareas.ts). La agenda es la ÚNICA rejilla del Día y solo lleva
 * eventos: ni la tarea-objetivo como bloque ni la rejilla de FullCalendar debajo (que pintaba las tareas con hora entre las llamadas).
 */
/** Las tareas plegadas: el top 3 del día; «Ver todas (N)» abre la lista completa con su orden. */
const TOP = 3
/** El hábito que ES el cumplimiento del objetivo del día (plasticidad y rachas lo leen así). Lo marca la estrella. */
const HABITO_OBJETIVO = 'objetivo_dia'

export function DiaVivo({ goals, guardarObjetivo, onDescripcion, donde, leyenda, fecha, snapshot, eventos, visible, color, tareas, cargando, todoistCaido, ocupado, rejilla, onRejilla, onAbrir, onCompletar, onReabrir, onDeshacer, onNueva, onObjetivo, enfoque = false, plegado, central = true }: {
  fecha: Date; snapshot: PlanningSnapshot | null; eventos: PlanEvent[]
  /** Los objetivos los lee el calendario UNA vez (5 oct 2026): cambiar de escala o de periodo no relee ni parpadea. */
  goals: { data: GoalSnapshot | null; error: string | null }
  donde: string
  /** Colores por tipo de trabajo: chips con las horas del día y filtro (10 oct 2026). */
  leyenda?: ControlLeyenda
  /** El mismo criterio del calendario: calendarios encendidos y sin los de objetivos. */
  visible: (e: PlanEvent) => boolean; color: (e: PlanEvent) => string | null
  tareas: PlanTask[]; cargando: boolean; todoistCaido: boolean; ocupado: boolean
  /** La rejilla de horas de abajo: plegada por defecto en Día, a un toque para arrastrar y crear. */
  rejilla: boolean; onRejilla: () => void
  onAbrir: (item: PlanItem) => void; onCompletar: (t: PlanTask) => Promise<unknown>; onDeshacer: () => void
  /** Desmarcar la estrella: reabre la tarea-objetivo en Todoist. */
  onReabrir?: (t: PlanTask) => Promise<unknown>
  /** Abre la hoja de una tarea nueva (vacía o prellenada: anclar el objetivo). */
  onNueva: (semilla?: EditorSelection) => void
  /** `✓` en el evento «Objetivo del dia» de Google (dia-vivo.ts, `conMarca`). */
  onObjetivo?: (evento: PlanEvent, cumplido: boolean) => Promise<unknown>
  /** Las casillas del objetivo: el registro (como la Semana) o la descripción de su tarea/evento, por la misma pluma. */
  guardarObjetivo?: (g: Goal) => Promise<unknown>
  onDescripcion?: (item: PlanItem, descripcion: string) => Promise<unknown>
  onConversar?: (borrador: string) => void
  /** Enfoque también en Día (ronda 3, 10 oct 2026, Daniel): sin los chips de categorías, igual que en Semana. */
  enfoque?: boolean
  /** Lo de día completo plegado en una línea, el mismo estado que en la Semana. */
  plegado?: Plegado
  /** La hoja de en medio del carril (las vecinas se pintan para deslizar): solo ella encuadra el scroll en la hora. */
  central?: boolean
}) {
  const ahora = useAhora()
  const dia = dayKey(fecha), hoy = dayKey(new Date(ahora)), esHoy = dia === hoy, pasado = dia < hoy
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { conHora, todoElDia } = useMemo(() => bloquesDelDia(eventos, fecha, visible, color), [eventos, fecha, visible, color])
  // Semana de llamadas (18 oct 2026): las ventanas de disponibilidad van de fondo y el brief se pliega en su llamada.
  const agenda = useMemo(() => ordenarAgenda(conHora), [conHora])

  // Hábitos: una sola pluma para las filas y para la estrella del objetivo (que es el hábito `objetivo_dia`).
  const { today, timeZone } = useCivilClock()
  const habits = useHabitRecords({ date: dia, from: shiftDay(dia, -(VENTANA_RACHA - 1)), to: dia, timeZone })
  const conHabito = !!habits.data?.habitos.some(x => x.clave === HABITO_OBJETIVO) && dia <= today

  // El objetivo: la tarea con la etiqueta `objetivo`; si aún no hay, el del registro o el del calendario «Objetivo del dia».
  const ancla = useMemo(() => tareaObjetivo(snapshot?.tasks ?? [], snapshot?.completedTasks ?? [], dia, t => taskDay(t, zona)), [snapshot?.tasks, snapshot?.completedTasks, dia, zona])
  const registro = useMemo(() => goals.data ? objetivoDe(goals.data.goals, snapshot, 'day', dia) : null, [goals.data, snapshot, dia])
  const eventoObjetivo = useMemo(() => eventoObjetivoDelDia(eventos, snapshot?.sources ?? [], dia), [eventos, snapshot?.sources, dia])
  // Todos los del día (v0.2.6): el primero sigue siendo el de la caja; los demás se listan debajo, no se pierden.
  const todos = useMemo(() => objetivosDelDia({ dia, abiertas: snapshot?.tasks ?? [], completadas: snapshot?.completedTasks ?? [], diaDe: t => taskDay(t, zona), goals: goals.data?.goals, contexto: goals.data?.context }), [dia, snapshot?.tasks, snapshot?.completedTasks, zona, goals.data])
  const titulo = ancla ? sinEmoji(ancla.tarea.title) : registro?.titulo ?? todos[0]?.titulo ?? null
  const otros = useMemo(() => { const k = (s: string) => sinEmoji(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); return titulo ? todos.filter(o => k(o.titulo) !== k(titulo)) : [] }, [todos, titulo])
  const cumplido = ancla ? ancla.hecha : Boolean(registro) && ((eventoObjetivo ? tituloCumplido(eventoObjetivo.title) : false) || registro?.estado === 'completed' || habits.record(dia, HABITO_OBJETIVO)?.hecho === true)
  const puedeMarcar = Boolean(titulo) && (Boolean(ancla) || (eventoObjetivo?.editable && onObjetivo) || conHabito)
  // Sus casillas, en la misma fuente que da el título. La escritura toma siempre la versión más reciente (etag de Google).
  const plan = useMemo(() => !ancla && registro?.origen === 'plan' ? goals.data?.goals.find(g => g.id === registro.id) ?? null : null, [ancla, registro, goals.data])
  const casillas = titulo ? casillasDelDia(ancla, plan, eventoObjetivo) : null
  const casillasRef = useRef(casillas); casillasRef.current = casillas
  const guardarCasillas = casillas && (casillas.origen === 'plan' ? guardarObjetivo : onDescripcion) ? (texto: string) => {
    const f = casillasRef.current
    if (!f) return Promise.reject(new Error('El objetivo cambió. Vuelve a intentarlo.'))
    if (f.origen === 'plan') return plan && guardarObjetivo ? guardarObjetivo({ ...plan, success: texto }) : Promise.reject(new Error('Sin registro'))
    return onDescripcion!(f.origen === 'tarea' ? f.tarea : f.evento, texto)
  } : undefined
  const marcas = entregablesDe(casillas?.texto ?? '').items, hechas0 = marcas.filter(e => e.hecho).length

  const { abiertas, animando: hechas, completar, ultima, deshacer } = useCompletar(tareas, onCompletar, onDeshacer, ocupado)
  /** La estrella (y la palomita de la tarea-objetivo): un solo acto que se escribe en los tres lugares donde vive el dato. */
  function marcarObjetivo() {
    const siguiente = !cumplido
    if (ancla) {
      if (siguiente) { const i = abiertas.findIndex(t => t.id === ancla.tarea.id); i >= 0 ? completar(ancla.tarea, i) : void onCompletar(ancla.tarea).catch(() => {}) }
      else void onReabrir?.(ancla.tarea).catch(() => {})
    }
    if (conHabito) habits.mark(dia, HABITO_OBJETIVO, siguiente ? true : null)
    if (eventoObjetivo?.editable && onObjetivo && tituloCumplido(eventoObjetivo.title) !== siguiente) void onObjetivo(eventoObjetivo, siguiente).catch(() => {})
  }
  // La casilla del objetivo en «Hábitos de hoy»: cumplido por la tarea/Google o marcado a mano (desde el teléfono o por Levy).
  const objetivoHecho = cumplido || habits.record(dia, HABITO_OBJETIVO)?.hecho === true
  const alternarObjetivo = () => {
    if (objetivoHecho && !cumplido) habits.mark(dia, HABITO_OBJETIVO, null)
    else if (puedeMarcar) marcarObjetivo()
    else habits.toggle(dia, HABITO_OBJETIVO, 'manual')
  }
  // Solo sin objetivo: fijar uno nace como tarea P1 con la etiqueta `objetivo`.
  const fijarObjetivo = () => onNueva({ kind: 'task', allDay: true, start: startOfDay(fecha), titulo: '', prioridad: 1, etiquetas: [ETIQUETA_OBJETIVO] })
  const leyendoObjetivo = !goals.data && !goals.error && !ancla && !eventoObjetivo

  const { actual, sigue } = esHoy ? enCurso(agenda.bloques, ahora) : {}
  // Plegadas por defecto (18 oct 2026, Daniel: «top 3 tareas priority hasta arriba colapsadas… si quiero ver más pues un botón»).
  const [todas, alternarTodas] = usePreferencia('arbrain.dia.tareas-todas')
  const proyectos = useMemo(() => proyectosDe(snapshot), [snapshot])
  // El orden (18 oct 2026, «organiza las tareas por hora del día… el 80/20 de filtros en un botón simple»): Hora · Prioridad ·
  // Proyecto, un toque cicla y el dispositivo lo recuerda (orden-tareas.ts). La tarea-objetivo sigue arriba de su grupo.
  const [orden, ciclarOrden] = useOrdenTareas()
  const grupos = useMemo(() => ordenarTareas(abiertas, orden, { zona, proyectos: snapshot?.projects, primero: ancla?.tarea.id }), [abiertas, orden, zona, snapshot?.projects, ancla])
  const top = useMemo(() => topTareas(abiertas, { hoy, zona, primero: ancla?.tarea.id, n: TOP }), [abiertas, hoy, zona, ancla])
  const abierta = todas && abiertas.length > TOP
  const visibles = abierta ? grupos : [{ id: 'top', titulo: null, tareas: top }], pendientes = abiertas.length - Object.keys(hechas).length
  const hechasHoy = esHoy ? (snapshot?.completedTasks ?? []).filter(t => t.completedAt && dayKey(new Date(t.completedAt)) === dia).length : 0

  return <section className={d.dia} data-compacta aria-label={`Día ${format(fecha, "EEEE d 'de' MMMM", { locale: es })}`}>
    {/* El objetivo del día, hasta arriba y con la caja de la Semana: nace plegado; un toque abre sus casillas. */}
    <ObjetivoCaja rotulo={plegado && !plegado.objetivo ? (esHoy ? 'Hoy' : 'Día') : <>Objetivo del día{cumplido && titulo && <em> · cumplido</em>}</>}
      titulo={titulo} vacio={goals.error && !eventoObjetivo ? 'No se pudo leer el objetivo.' : 'Sin objetivo del día.'} leyendo={leyendoObjetivo}
      cuenta={marcas.length ? { k: hechas0, n: marcas.length, clave: `dia-${dia}-${hechas0}` } : otros.length ? { k: (cumplido ? 1 : 0) + otros.filter(o => o.hecho).length, n: otros.length + 1, clave: `dia-obj-${dia}`, unidad: 'objetivos' } : null}
      plegada={plegado ? !plegado.objetivo : false} onPlegar={plegado ? () => plegado.alternar('objetivo') : undefined}>
      {titulo ? <>
        <Segmentos k={hechas0} n={marcas.length} i={1} />
        <Entregables texto={casillas?.texto ?? ''} guardar={guardarCasillas} i0={2} nombre="Casillas del objetivo del día" vacio="Sin casillas para hoy." />
        {otros.length > 0 && <ul className={d.otrosObjetivos} aria-label="Más objetivos del día">
          {otros.map(o => <li key={o.titulo} data-hecho={o.hecho || undefined}>{o.titulo}</li>)}
        </ul>}
      </> : !leyendoObjetivo && <button className={d.objVacio} onClick={fijarObjetivo} disabled={!snapshot || ocupado}><Plus size={13} aria-hidden />Fijar el objetivo del día</button>}
    </ObjetivoCaja>
    <ContadorPeriodo />

    {/* Arriba, lo justo que debería estar haciendo: el bloque en curso o, si no hay, el siguiente. */}
    {esHoy && (actual || sigue) && <TarjetaAhora actual={actual} sigue={sigue} ahora={ahora} onAbrir={onAbrir} className={d.enCursoDia} />}

    {/* Las tareas, arriba de la agenda (18 oct 2026): el top 3 plegado; «Ver todas» abre la lista con su orden (Hora · Prioridad · Proyecto). */}
    <section className={`${d.columna} ${d.topTareas}`} aria-label={abierta ? 'Tareas' : 'Top 3 tareas'} data-abierta={abierta || undefined}>
      <header className={`${d.titulo} ${d.entra}`} style={{ ['--i' as string]: 2 }}><h3>{abierta || abiertas.length <= TOP ? 'Tareas' : 'Top 3'}</h3>{pendientes > 0 && <small>{abierta || abiertas.length <= TOP ? pendientes : `de ${pendientes}`}</small>}
        {hechasHoy > 0 && <small className={d.hechas}>{hechasHoy} {hechasHoy === 1 ? 'hecha' : 'hechas'}</small>}
        {abierta && <button className={`${d.accion} ${d.orden}`} onClick={ciclarOrden} aria-label={`Ordenar por ${etiquetaOrden(orden)}. Tocar para ordenar por ${etiquetaOrden(siguienteOrden(orden))}`}
          title={`Orden: ${etiquetaOrden(orden)} · toca para ${etiquetaOrden(siguienteOrden(orden))}`}><ArrowDownUp size={12} aria-hidden /><span>{etiquetaOrden(orden)}</span></button>}
        <button className={`${d.accion} ${d.soloIcono} ${d.sutil}`} onClick={() => onNueva()} disabled={!snapshot || ocupado} aria-label="Tarea nueva" title="Tarea nueva"><Plus size={14} aria-hidden /></button>
      </header>
      {abiertas.length === 0 ? <p className={d.vacio}>{cargando && !snapshot ? 'Leyendo Todoist…' : todoistCaido ? 'Todoist no se pudo leer.' : esHoy ? 'Nada pendiente hoy.' : 'Sin tareas este día.'}</p>
        : <div className={d.filas}>{(() => { let i = 0
          return visibles.map(g => <div key={g.id} className={d.grupoTareas} role="group" aria-label={g.titulo ?? undefined}>
            {g.titulo && <h4 className={d.grupoTitulo}>{g.titulo}<small>{grupos.find(x => x.id === g.id)?.tareas.length}</small></h4>}
            {g.tareas.map(t => { const esObj = t.id === ancla?.tarea.id, n = i++
              return <FilaTarea key={t.id} t={t} i={3 + n} hecha={!!hechas[t.id]} ocupado={ocupado} proyecto={t.projectId ? proyectos.get(t.projectId) : undefined} objetivo={esObj}
                vencida={vencida(t, hoy, zona)} onCompletar={() => esObj ? marcarObjetivo() : completar(t, n)} onAbrir={() => onAbrir(t)} /> })}
          </div>) })()}</div>}
      {abiertas.length > TOP && <button className={d.mas} onClick={alternarTodas} aria-expanded={abierta}>{abierta ? 'Ver solo el top 3' : `Ver todas (${abiertas.length})`}</button>}
      <AvisoHecha ultima={ultima} onDeshacer={deshacer} />
    </section>

    {leyenda && !enfoque && <div className={d.entra} style={{ ['--i' as string]: 1 }}><Leyenda ctl={leyenda} eventos={eventos} desde={startOfDay(fecha).getTime()} hasta={addDays(startOfDay(fecha), 1).getTime()} periodo="día" /></div>}
    <div className={d.cuerpo}>
      <AgendaMini central={central} bloques={agenda.bloques} bandas={agenda.bandas} todoElDia={todoElDia} fecha={fecha} ahora={ahora} esHoy={esHoy} pasado={pasado} color={color} cargando={cargando && !snapshot}
        rejilla={rejilla} onAbrir={onAbrir}
        todoElDiaAbierto={plegado?.todoElDia} onTodoElDia={plegado ? () => plegado.alternar('todoElDia') : undefined} />

    </div>

    {/* Hábitos de hoy (22 oct 2026, monk mode hasta Monterrey): tres casillas grandes hasta abajo, con racha e historia.
        La casilla del objetivo es el mismo dato que la caja de arriba: tarea, ✓ en Google y hábito `objetivo_dia`. */}
    <HabitosHoy dia={dia} donde={donde} habits={habits} today={today} i={6}
      especial={conHabito ? { [HABITO_OBJETIVO]: { hecho: objetivoHecho, onToggle: alternarObjetivo } } : undefined} />
  </section>
}
