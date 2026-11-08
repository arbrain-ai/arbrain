'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import type { Goal, GoalSnapshot } from '@/features/goals/model'
import { taskDay } from '@/features/goals/model'
import { shiftDay } from '@/features/sistema/calendar-days'
import { useCivilClock, useHabitRecords } from '@/features/sistema/useHabitRecords'
import { dayKey } from './model'
import { bloquesDelDia, casillasDelDia, ETIQUETA_OBJETIVO, eventoObjetivoDelDia, objetivosDelDia, tareaObjetivo, tituloCumplido } from './dia-vivo'
import { AgendaMini } from './AgendaMini'
import { ordenarAgenda } from './agenda-llamadas'
import { Leyenda, type ControlLeyenda } from './Leyenda'
import { LeyendaDrip, useGobierno } from './gobierno'
import { FranjaPlan } from './FranjaPlan'
import { objetivoDe } from './periodo-vivo'
import { HabitosHoy } from './HabitosHoy'
import { VENTANA_RACHA } from './habitos-dia'
import { sinEmoji, useAhora } from './vivo-piezas'
import { Segmentos, useCasillas } from './ObjetivoCaja'
import { ListaDia } from './ListaDia'
import { AvisoDecisiones, enfoquePedido, EVENTO_ENFOCAR_DECISIONES, SeccionDecisiones } from '@/features/decisiones/FranjaDecisiones'
import { useBandeja } from '@/features/decisiones/useBandeja'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import { enElTimeline, eventosExplicitos, listaDelDia, type ItemDia } from './lista-dia'
import type { EditorSelection } from './PlanEditor'
import type { PlanEvent, PlanItem, PlanTask, PlanningSnapshot } from './types'
import type { Plegado } from './SemanaClara'
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
 *
 * 3 nov 2026 (Daniel, 18:43: «quiero unificarlo toda la logica en el toggle… ya viste que se repite lo de la grupal»): UNA sola lista en el
 * toggle de la franja (lista-dia.ts): las casillas del objetivo y las tareas de Todoist del día; marcar cierra en su fuente y marcar otra vez
 * reabre. La sección «Tareas» se fue. Lo ligado a un evento vive dentro de su tarjeta en la agenda; lo suelto con hora, como marca tenue.
 */
/** El hábito que ES el cumplimiento del objetivo del día (plasticidad y rachas lo leen así). Lo marca la estrella. */
const HABITO_OBJETIVO = 'objetivo_dia'

export function DiaVivo({ goals, guardarObjetivo, onDescripcion, donde, leyenda, fecha, snapshot, eventos, visible, color, tareas, cargando, todoistCaido, ocupado, rejilla, onRejilla, onAbrir, onCompletar, onReabrir, onPrioridad, onDeshacer, onNueva, onObjetivo, enfoque = false, plegado, central = true, dosColumnas = false }: {
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
  /** Cambiar la prioridad de una tarea en Todoist, como allá (menú o teclas 1–4 sobre la fila). `p` es P1…P4. */
  onPrioridad?: (t: PlanTask, p: 1 | 2 | 3 | 4) => Promise<unknown>
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
  /** Pantalla completa (24 oct 2026): lo importante a la izquierda (temporada, objetivo abierto, ahora, tareas, hábitos) y la agenda
   *  a la derecha, a alto completo y sin scroll. El objetivo va abierto: hay espacio para sus casillas. */
  dosColumnas?: boolean
}) {
  /** El objetivo se pliega solo en el orden de siempre; en dos columnas va abierto y sin toque de plegar. */
  const ahora = useAhora()
  const dia = dayKey(fecha), hoy = dayKey(new Date(ahora)), esHoy = dia === hoy, pasado = dia < hoy
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { conHora } = useMemo(() => bloquesDelDia(eventos, fecha, visible, color), [eventos, fecha, visible, color])
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
  // La pluma de las casillas, una para la lista y el timeline (lo marcado se ve en los dos al instante).
  const pluma = useCasillas(casillas?.texto ?? '', guardarCasillas)
  /** La estrella (y la palomita de la tarea-objetivo): un solo acto que se escribe en los tres lugares donde vive el dato. */
  function marcarObjetivo() {
    const siguiente = !cumplido
    if (ancla) {
      if (siguiente) void onCompletar(ancla.tarea).catch(() => {})
      else void onReabrir?.({ ...ancla.tarea, updatedAt: null }).catch(() => {})
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

  // Una sola lista (3 nov 2026): casillas del objetivo y tareas del día (las que vencen hoy, las vencidas si es hoy y las ligadas al objetivo
  // por `taskIds`). La tarea-objetivo es el título de la franja: no se repite si su hábito la marca; sin hábito, va en la lista.
  const ligadas = useMemo(() => new Set((goals.data?.goals ?? []).filter(g => g.scope === 'day' && g.start <= dia && g.end > dia).flatMap(g => g.taskIds)), [goals.data, dia])
  const abiertasDia = useMemo(() => [...tareas, ...(snapshot?.tasks ?? []).filter(t => (ligadas.has(t.id) || ligadas.has(t.externalId)) && !tareas.some(x => x.id === t.id))], [tareas, snapshot?.tasks, ligadas])
  const lista = useMemo(() => listaDelDia({ dia, hoy, zona, casillas: pluma.items, abiertas: abiertasDia, completadas: snapshot?.completedTasks ?? [], goals: goals.data?.goals, sin: conHabito ? ancla?.tarea.id : null }),
    [dia, hoy, zona, pluma.items, abiertasDia, snapshot?.completedTasks, goals.data, conHabito, ancla])
  const enAgenda = useMemo(() => enElTimeline(lista, agenda.bloques, startOfDay(fecha).getTime(), eventosExplicitos(goals.data?.goals, dia, agenda.bloques)), [lista, agenda.bloques, fecha, goals.data, dia])
  const eventoDeItem = useMemo(() => { const m = new Map<string, string>()
    for (const b of agenda.bloques) for (const it of enAgenda.dentro.get(b.id) ?? []) m.set(it.id, sinEmoji(b.corto ?? b.titulo).replace(/^\d{1,2}:\d{2}\s*/, '').split(/\s+[·|:(]\s*/)[0].trim())
    return m }, [agenda.bloques, enAgenda])
  const abiertaEnTodoist = (t: { id: string }) => abiertasDia.some(x => x.id === t.id)
  /** Marcar desde la lista o el timeline: la casilla en su texto, la tarea en Todoist (y el criterio que dice lo mismo); lo marcado se reabre igual. */
  function alternarItem(it: ItemDia) {
    const cerrar = (t: NonNullable<ItemDia['tarea']>, hecho: boolean) => {
      if (t.id === ancla?.tarea.id) { if (hecho !== cumplido) marcarObjetivo(); return }
      if (hecho && abiertaEnTodoist(t)) void onCompletar(t).catch(() => {})
      else if (!hecho && !abiertaEnTodoist(t) && onReabrir && !t.recurring) void onReabrir({ ...t, updatedAt: null }).catch(() => {})
    }
    if (it.origen === 'casilla') { pluma.alternar(it.linea!, !it.hecho); return }
    if (it.criterio && pluma.puede && it.criterio.hecho === it.hecho) pluma.alternar(it.criterio.linea, !it.hecho)
    if (it.tarea) cerrar(it.tarea, !it.hecho)
  }
  // La tarea gemela cerrada en otro lado (Todoist en el teléfono, Levy): su criterio se marca una vez, desde la hoja de en medio.
  const yaMarcados = useRef(new Set<string>())
  useEffect(() => {
    if (!central || !pluma.puede) return
    for (const it of lista) if (it.criterio && it.hecho && !it.criterio.hecho && !yaMarcados.current.has(`${dia}:${it.id}`)) {
      yaMarcados.current.add(`${dia}:${it.id}`); pluma.alternar(it.criterio.linea, true)
    }
  }, [central, lista, dia]) // eslint-disable-line react-hooks/exhaustive-deps -- la pluma cambia en cada render; manda la lista
  const puedeItem = (it: ItemDia) => it.origen === 'casilla' ? pluma.puede
    : !ocupado && !it.tarea?.pending && !(it.hecho && (it.fija || !onReabrir))
  const cambiarPrioridad = onPrioridad && !ocupado ? (t: PlanTask, p: 1 | 2 | 3 | 4) => { if (t.priority !== p) void onPrioridad(t, p).catch(() => {}) } : undefined
  const [resaltado, setResaltado] = useState<string | null>(null)
  const hechasN = lista.filter(i => i.hecho).length

  // «Esperan tu toque» (4 nov 2026): dentro de la tarjeta HOY, junto a las tareas. Plegada, la línea dice «N te esperan» y la línea
  // del tiempo queda a la vista. Solo el Día de HOY y nunca en el calendario de otra persona. Es el ÚNICO lugar con ese número
  // (4 nov 2026, 19:31: fuera del encabezado del chat) y el teléfono es igual: la tarjeta nace plegada cada vez que llegas.
  const conBandeja = esHoy && !snapshot?.perfil
  const telefono = useIsMobile()
  const bandeja = useBandeja(5_000, conBandeja)
  const esperan = conBandeja ? bandeja.vista?.pendientes.length ?? 0 : 0
  const [abrirHoy, setAbrirHoy] = useState(0)
  useEffect(() => {
    if (!conBandeja) return
    const abrir = () => setAbrirHoy(n => n + 1)
    if (enfoquePedido()) abrir()
    window.addEventListener(EVENTO_ENFOCAR_DECISIONES, abrir)
    return () => window.removeEventListener(EVENTO_ENFOCAR_DECISIONES, abrir)
  }, [conBandeja])
  const decisiones = conBandeja && bandeja.vista ? <SeccionDecisiones b={bandeja} /> : null

  /* Las piezas, una vez; el orden lo decide el ancho (abajo). */
  // Lo que abre el objetivo del día (25 oct 2026, un solo esqueleto con Semana y Mes): sus casillas y, sin objetivo, fijar uno.
  const lleno = titulo || lista.length > 0
  const objetivoDetalle = lleno || !leyendoObjetivo || esperan > 0 ? <>
      {!titulo && !leyendoObjetivo && <button className={d.objVacio} onClick={fijarObjetivo} disabled={!snapshot || ocupado}><Plus size={13} aria-hidden />Fijar el objetivo del día</button>}
      {lista.length > 0 && lista.length <= 12 && <Segmentos k={hechasN} n={lista.length} i={1} />}
      {cargando && !snapshot && !lista.length ? <p className={d.vacio}>Leyendo Todoist…</p> : todoistCaido && !lista.length ? <p className={d.vacio}>Todoist no se pudo leer.</p> : null}
      <ListaDia items={lista} alternar={alternarItem} puede={puedeItem} evento={eventoDeItem} resaltado={resaltado} onResaltar={setResaltado}
        onAbrir={onAbrir} onPrioridad={cambiarPrioridad} onNueva={snapshot && !ocupado ? () => onNueva() : undefined} onAgregar={pluma.puede && titulo ? pluma.agregar : undefined} fallo={pluma.fallo} />
      {otros.length > 0 && <ul className={d.otrosObjetivos} aria-label="Más objetivos del día">
        {otros.map(o => <li key={o.titulo} data-hecho={o.hecho || undefined}>{o.titulo}</li>)}
      </ul>}
      {decisiones}
    </> : null
  // DRIP (24 oct 2026): la leyenda es la matriz; en ancho vive en la barra del calendario y aquí no se repite.
  const gobierno = useGobierno()
  const chips = <>
    {leyenda && !enfoque && (gobierno ? !gobierno.leyendaEnBarra && <div className={d.entra} style={{ ['--i' as string]: 1 }}><LeyendaDrip /></div>
      : <div className={d.entra} style={{ ['--i' as string]: 1 }}><Leyenda ctl={leyenda} eventos={eventos} desde={startOfDay(fecha).getTime()} hasta={addDays(startOfDay(fecha), 1).getTime()} periodo="día" /></div>)}
  </>
  // «Acepto mi día» se fue (25 oct 2026, Daniel: «en teoría ya lo acepté desde antes»): el día se da por aceptado. Proteger el bloque
  // de Producir sigue en su hoja (HojaDrip), un toque sobre el bloque.
  const agendaMini = <div className={d.cuerpo}>
      <AgendaMini central={central} llenar={dosColumnas} bloques={agenda.bloques} bandas={agenda.bandas} fecha={fecha} ahora={ahora} esHoy={esHoy} pasado={pasado} cargando={cargando && !snapshot}
        onAbrir={onAbrir} pendientes={{ dentro: enAgenda.dentro, sueltas: enAgenda.sueltas, alternar: alternarItem, puede: puedeItem, resaltado, onResaltar: setResaltado }} />
    </div>
  const habitos = <>
    {/* Hábitos de hoy, en mínimo (25 oct 2026): una línea por hábito con casilla y racha; su historia vive en la vista H.
        La casilla del objetivo es el mismo dato que la caja de arriba: tarea, ✓ en Google y hábito `objetivo_dia`. */}
    <HabitosHoy dia={dia} donde={donde} habits={habits} today={today} i={6} minimo
      especial={conHabito ? { [HABITO_OBJETIVO]: { hecho: objetivoHecho, onToggle: alternarObjetivo } } : undefined} />
  </>
  const etiqueta = `Día ${format(fecha, "EEEE d 'de' MMMM", { locale: es })}`

  // La franja (25 oct 2026, Daniel: «la UI actual me quita la mitad de la pantalla»): «Hoy · objetivo │ hábitos» en UNA línea
  // arriba; el detalle (el objetivo con sus subobjetivos y los hábitos en mínimo) se abre con un toque. La temporada vive en la vista H.
  const franja = <FranjaPlan rotulo={<>{esHoy ? 'Hoy' : 'Día'}{cumplido && titulo && <em> · cumplido</em>}</>} titulo={titulo}
    vacio={leyendoObjetivo ? 'Leyendo el objetivo…' : goals.error && !eventoObjetivo ? 'No se pudo leer el objetivo.' : 'Sin objetivo del día.'}
    cuenta={lista.length ? { k: hechasN, n: lista.length } : null} detalle={objetivoDetalle}
    aviso={<AvisoDecisiones n={esperan} />} abrirSenal={abrirHoy}
    {...(dosColumnas ? { clave: 'arbrain.dia.franja-abierta-dos-columnas', abiertaInicial: true } : { recordar: !telefono })} />

  // Pantalla completa (24 oct 2026, «lo importante al lado izquierdo» y la agenda a la derecha, sin scroll); la franja va encima de las
  // dos columnas (25 oct 2026).
  if (dosColumnas) return <section className={d.dia} data-compacta data-dos-columnas aria-label={etiqueta}>
    <div className={d.izquierda}>
      {franja}
    </div>
    <div className={d.derecha}>
      {chips}
      {agendaMini}
    </div>
    <div className={d.pieHabitos}>{habitos}</div>
  </section>

  return <section className={d.dia} data-compacta aria-label={etiqueta}>
    {franja}
    {chips}
    {agendaMini}
    <div className={d.pieHabitos}>{habitos}</div>
  </section>
}
