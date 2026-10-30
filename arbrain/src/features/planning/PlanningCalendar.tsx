'use client'
import { estiloEvento } from '@/lib/calendar/contraste'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { Draggable } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import esLocale from '@fullcalendar/core/locales/es'
import type { DatesSetArg, EventInput } from '@fullcalendar/core'
import { addDays, addMinutes, addYears, format, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Circle, Loader2, Newspaper, Plus, Repeat2, ScrollText, X } from 'lucide-react'
import { usePlanning } from './usePlanning'
import { useGoals } from '@/features/goals/useGoals'
import { dayKey, escalaVigente, eventData, hasTime, isOwnSurface, MODES, mutationFor, taskData, taskEnd } from './model'
import { accesosDe, accionDeEscala, alcanceDeModo, planDelMes, tituloAngosto, tituloVentana, type Acceso } from './accesos'
import { PlanPeriodo } from './PlanPeriodo'
import { DiaVivo } from './DiaVivo'
import { destinoAlSoltarToque, ejeDeRueda, ejeDeToque } from './carril-logica'
import { Carril } from './Carril'
import { conMarca } from './dia-vivo'
import { SemanaClara } from './SemanaClara'
import { PulsoHoy } from './useEncuadre'
import { datosDeMovimiento, diasVisibles, inicioDeVentana, lunesDe, moverDias } from './semana-horas'
import { rechazado, useAjustes } from './ajustes'
import { Engrane } from './Engrane'
import { fechaDeArranque, marcarSesion, reabrirEnHoy, tocarSesion } from './apertura'
import { MesClaro } from './MesClaro'
import { movimientoEntre } from './periodo-vivo'
import { debeAvanzarAHoy } from './hoy-vivo'
import { tareasDelPeriodo, ventanaDelPeriodo } from './plan-periodo'
import { tareasDelDia } from './orden-tareas'
import { PlanEditor, type EditorSelection } from './PlanEditor'
import { useAutoguardado } from './autoguardado'
import { CronsView } from './CronsView'
import { YearView } from './YearView'
import { HabitosTiempo } from './HabitosTiempo'
import { useYearEvents } from './useYearEvents'
import { inverseFor, UndoHistory } from './undo'
import { CALENDAR_SHORTCUTS, calendarAction } from './shortcuts'
import { useOrdenCalendario } from './orden-panel'
import type { CalendarMode, MutationResult, PlanEvent, PlanItem, PlanMutation, PlanTask } from './types'
import styles from './planning.module.css'
import { esEdicionCliente } from '@/lib/edicion'
import vivas from './escalas-vivas.module.css'
import { EVENTO_IR_CALENDARIO } from './eventos'
import { categoriaDe, DEF, esCompromiso } from './categorias'
import { fueraDelMes, rutinaDeAgenda, rutinaOculta } from './rutinas'
import { useOcultas, type ControlLeyenda } from './Leyenda'
import { atencionDe, colorDePiedra, conDelegado, conProtegido, DRIP, esFase, esMecanicaAlumno, fotoDe, marcasEnViajes, piedraDe, semanaDelPrograma, semanasDelPrograma, horasRecompradas, horasUnion, leerDrip, type BloqueDrip, type Cuadrante, type LecturaDrip, type Propuesta } from './drip'
import { GobiernoCtx, LeyendaDrip, useOcultosDrip, type Gobierno } from './gobierno'
import { useDrip } from './useDrip'
import { Domingo } from './Domingo'
import { CalendarCheck2, Lock } from 'lucide-react'

const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]
const LOCALES = [esLocale]
// rollingAgenda (25 sep 2026): la Agenda empieza HOY y cubre siete días; antes era
// listWeek y en el teléfono abría en el lunes, con los días pasados primero.
// semanas2 · 4 · 6 (10 oct 2026, el engrane): la cuadrícula del Mes con N semanas desde la que se ve; el gesto la mueve de a una.
const VIEWS = { fourDays: { type: 'timeGrid', duration: { days: 4 } }, rollingWeek: { type: 'timeGrid', duration: { days: 7 }, dateAlignment: 'day' }, rollingAgenda: { type: 'list', duration: { days: 7 }, dateAlignment: 'day' },
  semanas2: { type: 'dayGrid', duration: { weeks: 2 }, dateAlignment: 'week', fixedWeekCount: false }, semanas4: { type: 'dayGrid', duration: { weeks: 4 }, dateAlignment: 'week', fixedWeekCount: false }, semanas6: { type: 'dayGrid', duration: { weeks: 6 }, dateAlignment: 'week', fixedWeekCount: false } }
/** Un gesto de rueda o trackpad termina tras esta pausa (ms); hasta entonces su eje no cambia. */
const PAUSA_GESTO = 160
/** Un gesto horizontal claro de trackpad cambia de periodo al recorrer esto (px); antes, 55-90 px movían de más. */
const UMBRAL_RUEDA = 120
/** La zona horaria del equipo, corta («GMT-6»), para la esquina de la rejilla. */
function zonaCorta(): string {
  try { return new Intl.DateTimeFormat('es-MX', { timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? '' } catch { return '' }
}

/** `inicio` (2 oct 2026): la pestaña Calendario del panel, desprendida a su ventana, abre el editor en
 *  el mismo día/semana/mes que enseñaba (la URL de esa ventana no lleva `?date=&mode=`).
 *  `donde` (4 oct 2026, «el panel es la experiencia completa»): el MISMO editor vive en la sección y en la
 *  pestaña del panel. En el panel las teclas solo actúan con el foco dentro, sus preferencias de vista son
 *  propias y `onCambio` avisa la fecha y vista para que Expandir lleve a la sección ahí mismo. */
/** Ancho angosto (4 oct 2026, «piensa como la ventana del teléfono»): el panel mide ~560 px. Por debajo de este ancho del
 *  CONTENEDOR (no de la ventana) el calendario cambia de forma, como Google Calendar móvil: barra de UNA línea
 *  (Hoy · ‹ › · «octubre ▾», que abre el selector de vista), mes con chips de color y «+N» (tocar un día abre su lista
 *  abajo), semana y 4 días con encabezado apilado. El CSS usa el mismo corte (@container planning). */
const ANGOSTO = 700
/** Pantalla completa (24 oct 2026, Daniel: «en pantalla completa tengo todo el espacio para que todo quepa sin hacer scroll»):
 *  desde este ancho útil del calendario (y con alto para que quepa), Día, Semana y Mes van en dos columnas a alto completo:
 *  lo importante a la izquierda, el calendario a la derecha. Por debajo, el orden de siempre (teléfono, panel, ventana angosta). */
const DOS_COLUMNAS = { ancho: 1400, alto: 640 }
/** Evento de ventana con `{ fecha, modo }`: lleva el calendario de la sección a esa fecha y vista (lo emite Expandir del panel). */
export { EVENTO_IR_CALENDARIO }
const DIAS_INICIAL = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
/** La cuadrícula del Mes: la de calendario o la de N semanas. */
/** Los chips del Mes van sin el emoji del título: el punto DRIP ya los distingue y así no compiten con las piedras. */
const sinEmojiInicial = (t: string) => t.replace(/^\s*(?:[\p{Extended_Pictographic}\u200d\ufe0f]+\s*)+/u, '') || t
const esMesFC = (tipo: string) => tipo === 'dayGridMonth' || tipo.startsWith('semanas')
/** Escalas vivas (5 oct 2026): Día, 4 días, Semana y Mes se leen como hojas; la rejilla de FullCalendar queda plegada, a un toque. */
const VIVAS: readonly CalendarMode[] = ['day', 'week', 'month']
const esViva = (m: CalendarMode) => VIVAS.includes(m)
/** La tecla de cada pestaña (shortcuts.ts): D · 4 · S · M, y Y · A · 7. */
const TECLA: Record<CalendarMode, string> = { day: 'D', fourDays: '4', week: 'S', month: 'M', year: 'Y', agenda: 'A', crons: '7', habits: 'H' }
/** El selector de escala de la barra (5 oct 2026, «botones súper sutiles»): una letra por escala; el nombre, en la etiqueta y el título. */
const LETRA: Partial<Record<CalendarMode, string>> = { day: 'D', week: 'S', month: 'M', habits: 'H' }
/** El selector: las tres hojas vivas y, cuarta, Hábitos (25 oct 2026), que es superficie propia (como Año), no hoja del riel. */
const ESCALAS_BARRA: readonly CalendarMode[] = [...VIVAS, 'habits']
/** Clave de la rejilla por escala y superficie. La del Día conserva su nombre del 5 oct (`rejilla-dia`). */
const claveRejilla = (m: CalendarMode, donde: string) => `arbrain:planning:rejilla-${m === 'day' ? 'dia' : m}:${donde}`

/** Edición cliente: el calendario lee su pluma local (lib/planning/local.ts); sin reportes de crons ni plan del mes. */
const EDICION_CLIENTE = esEdicionCliente()
/** Vistas del selector. En cliente sin «Rutinas» (crons del Studio: `/api/planning/crons` no existe ahí; sus rutinas viven en
 *  Taller › Rutinas, 30 oct 2026). */
const MODOS_CALENDARIO = EDICION_CLIENTE ? MODES.filter(m => m.id !== 'crons') : MODES

export function PlanningCalendar({ inicio, donde = 'seccion', onCambio, onConversar, onAbrirDocumento, onNavegar }: {
  inicio?: { fecha?: string; modo?: CalendarMode }; donde?: 'seccion' | 'panel'; onCambio?: (fecha: string, modo: CalendarMode) => void
  /** Vista unificada Calendario + Objetivos (4 oct 2026): «Conversar» deja el borrador de planificación en el chat. Sin esto el botón no aparece. */
  onConversar?: (borrador: string) => void
  /** Abre un documento del repo en el panel (el plan del mes). Sin esto el botón no aparece. */
  onAbrirDocumento?: (ruta: string, titulo: string) => void
  /** Navegación dentro de la app (router). Sin esto cae a navegación completa del navegador. */
  onNavegar?: (url: string) => void
} = {}) {
  const raiz = useRef<HTMLDivElement>(null)
  // El engrane (10 oct 2026): cómo se ve el calendario, por superficie (ajustes.ts).
  const [ajustes, poner] = useAjustes(donde)
  const ajustesRef = useRef(ajustes); ajustesRef.current = ajustes
  // Lo principal plegado en una línea (ronda 3, 10 oct 2026): el objetivo y lo de día completo, un toque y se recuerda en las tres vistas.
  const plegado = useMemo(() => ({ objetivo: ajustes.abreObjetivo, todoElDia: ajustes.abreTodoElDia,
    alternar: (que: 'objetivo' | 'todoElDia') => poner(que === 'objetivo' ? { abreObjetivo: !ajustesRef.current.abreObjetivo } : { abreTodoElDia: !ajustesRef.current.abreTodoElDia }) }),
  [ajustes.abreObjetivo, ajustes.abreTodoElDia, poner])
  // La barra se queda pegada arriba al hacer scroll (ronda 3); lo que se pega debajo (los días de la Semana) necesita su alto.
  const barraRef = useRef<HTMLDivElement>(null)
  const [altoBarra, setAltoBarra] = useState(42)
  useLayoutEffect(() => {
    const el = barraRef.current
    if (!el) return
    const medir = () => setAltoBarra(el.offsetHeight)
    medir()
    const o = new ResizeObserver(medir); o.observe(el)
    return () => o.disconnect()
  }, [])
  const angosto = () => (raiz.current?.clientWidth ?? window.innerWidth) < ANGOSTO
  const [compacto, setCompacto] = useState(false)
  const [dosColumnas, setDosColumnas] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  // Mes angosto: el día tocado, cuya lista completa se abre debajo (null = ninguno, la cuadrícula ocupa todo).
  const [diaMes, setDiaMes] = useState<Date | null>(null)
  const clavePrefs = (owner: string) => `arbrain:planning:views:${donde === 'panel' ? 'panel:' : ''}${owner}`
  const [mode, setMode] = useState<CalendarMode>('week')
  const modeRef = useRef(mode); modeRef.current=mode
  const [anchor, setAnchor] = useState(() => new Date())
  const anchorRef = useRef(anchor); anchorRef.current = anchor
  // La ventana de la Semana: primer día visible y cuántos (3 · 4 · 7). `inicio: null` = alinear al llegar (lunes, u hoy con 3 o 4).
  const [ventanaSemana, setVentanaSemana] = useState<{ inicio: string | null; n: number }>({ inicio: null, n: 7 })
  const ventanaRef = useRef(ventanaSemana); ventanaRef.current = ventanaSemana
  const onVentana = useCallback((inicio: string, n: number) => setVentanaSemana(v => v.inicio === inicio && v.n === n ? v : { inicio, n }), [])
  const realinear = useCallback(() => setVentanaSemana(v => v.inicio === null ? v : { ...v, inicio: null }), [])
  /** Mover la ventana de la Semana `dias` días (← → uno; las flechas de la barra, siete). */
  const deslizarSemana = useCallback((dias: number) => setVentanaSemana(v => { const finde = ajustesRef.current.finDeSemana
    return { ...v, inicio: moverDias(v.inicio ?? inicioDeVentana(dayKey(anchorRef.current), dayKey(new Date()), v.n, finde), dias, finde) } }), [])
  const [title, setTitle] = useState('Tu semana')
  const [range, setRange] = useState(() => ({ from: startOfDay(new Date()).toISOString(), to: addDays(startOfDay(new Date()), 7).toISOString() }))
  // La cuadrícula del Mes con N semanas (el engrane): el mes que manda (título, objetivo, recorrido) es el del centro de lo visible.
  const semanasMes = mode === 'month' && ajustes.mesVista === 'cuadricula' ? ajustes.mesSemanas : 0
  const vistaMes = semanasMes ? `semanas${semanasMes}` : 'dayGridMonth'
  const vistaMesRef = useRef(vistaMes); vistaMesRef.current = vistaMes
  /** La vista de FullCalendar de cada escala (el Mes puede ser de N semanas). */
  const vistaFC = useCallback((m: CalendarMode) => m === 'month' ? vistaMesRef.current : MODES.find(x => x.id === m)?.calendar, [])
  const fechaMes = useMemo(() => semanasMes ? new Date((Date.parse(range.from) + Date.parse(range.to)) / 2) : anchor, [semanasMes, range, anchor])
  // Una escena por escala y periodo: al cambiar cualquiera de los dos, entra la nueva con su movimiento.
  // La Semana no remonta al cambiar de días (10 oct 2026): su riel desliza solo, como el carril del Día.
  const claveEscena = mode === 'day' || mode === 'week' ? mode : `${mode}:${mode === 'month' ? format(fechaMes, 'yyyy-MM') : dayKey(anchor)}`
  const [sources, setSources] = useState<string[] | null>(null)
  const [project, setProject] = useState('')
  const [priority, setPriority] = useState(0)
  const [filterOpen, setFilterOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [showUnscheduled, setShowUnscheduled] = useState(false)
  const [selection, setSelection] = useState<EditorSelection | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Aviso con «Deshacer» (completar o borrar desde la hoja de detalle): el botón corre el mismo ⌘Z.
  const [noticeUndo, setNoticeUndo] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [history] = useState(() => new UndoHistory())
  const [cronReload,setCronReload] = useState(0)
  // Las hojas vivas (5 oct 2026): en Día, 4 días, Semana y Mes la rejilla de FullCalendar queda plegada y a un toque; se recuerda por escala y superficie.
  const [rejillas, setRejillas] = useState<Partial<Record<CalendarMode, boolean>>>(() => {
    const leido: Partial<Record<CalendarMode, boolean>> = {}
    for (const m of VIVAS) { try { leido[m] = localStorage.getItem(claveRejilla(m, donde)) === '1' } catch { /* sin almacenamiento */ } }
    return leido
  })
  // Hacia dónde entra la escena: ← → deslizan, cambiar de escala acerca o aleja.
  const [mov, setMov] = useState<'der' | 'izq' | 'acercar' | 'alejar' | null>(null)
  const escena = useRef<HTMLDivElement>(null)
  // Cambiar de escala entre hojas vivas (5 oct 2026, «el hilo»): con transiciones de vista, el riel de cada día (mismo nombre en Día,
  // partitura y tejido, Partitura.tsx `nombreRiel`) crece o se encoge hasta su lugar en la escala nueva; sin ellas, la escena acerca o aleja.
  const enTransicion = useRef(false)
  const transicion = useCallback((cambio: () => void) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cambio(); return }
    enTransicion.current = true
    try { doc.startViewTransition(() => { try { flushSync(cambio) } finally { enTransicion.current = false } }) } catch { enTransicion.current = false; cambio() }
  }, [])
  const [tick, setTick] = useState(0)
  const calendar = useRef<FullCalendar>(null), rail = useRef<HTMLDivElement>(null)
  const calendarPane = useRef<HTMLElement>(null)
  const calendarGeometry = useRef<HTMLDivElement>(null)
  const initialDate = useRef(anchor)
  // Lectura (5 oct 2026): ±28 días alrededor de lo visible (tope del proveedor: 65) para que pasar de Día a Semana a Mes no relea, y con
  // las tareas cerradas del periodo para que el progreso de cada objetivo sea real. La misma pluma y el mismo endpoint.
  const lectura = useMemo(() => ({ ...range, includeCompleted: 'true' }), [range])
  const { snapshot: leido, loading, error, readError, saving, pending, refresh, mutate } = usePlanning(lectura, 28)
  // Autoguardado de la hoja (5 oct): lo editado se ve al instante en todas las vistas y se escribe por la misma pluma (commit con ⌘Z).
  const commitRef = useRef<(op: PlanMutation) => Promise<MutationResult>>(null!)
  const [fallo, setFallo] = useState<{ texto: string; reintentar: () => void } | null>(null)
  const auto = useAutoguardado({ ownerId: leido?.ownerId, escribir: op => commitRef.current(op),
    onFallo: (titulo, mensaje, reintentar) => setFallo({ texto: `No se guardó «${titulo}»: ${mensaje} Volvió a como está en Google.`, reintentar }) })
  const snapshot = useMemo(() => leido ? auto.aplicar(leido) : leido, [leido, auto])
  const dataRef = useRef(leido)
  const goalsLeidos = useGoals()
  const preferencesOwner = useRef<string | null>(null)
  const explicitView = useRef(false)
  dataRef.current = leido // ⌘Z calcula su inversa contra lo que Google tiene, no contra la capa optimista
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const presentedEvents = useMemo(() => (snapshot?.events ?? []).map(e => saving && pending?.kind === 'event' && pending.action === 'update' && pending.externalId === e.externalId && pending.calendarId === e.calendarId && pending.account === e.account ? { ...e, ...pending.data } : e), [snapshot?.events, saving, pending])
  const presentedTasks = useMemo(() => (snapshot?.tasks ?? []).map(t => saving && pending?.kind === 'task' && pending.action === 'update' && pending.externalId === t.externalId ? { ...t, ...pending.data } : t), [snapshot?.tasks, saving, pending])

  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 60_000); return () => clearInterval(t) }, [])
  const taskMatches = useCallback((t: PlanTask) => (!project || t.projectId === project) && (!priority || t.priority === priority), [project, priority])
  const visibleTasks = useMemo(() => presentedTasks.filter(taskMatches), [presentedTasks, taskMatches])
  const enabled = useMemo(() => new Set(sources ?? snapshot?.sources.filter(s => s.selected).map(s => s.id) ?? []), [sources, snapshot?.sources])
  const sourceMap = useMemo(() => new Map(snapshot?.sources.map(s => [s.id, s]) ?? []), [snapshot?.sources])
  const items = useMemo(() => new Map<string, PlanItem>([...(snapshot?.events ?? []), ...(snapshot?.tasks ?? [])].map(i => [i.id, i])), [snapshot?.events, snapshot?.tasks])
  const yearEvents = useYearEvents(anchor.getFullYear(), mode === 'year' ? snapshot?.ownerId : undefined)
  const yearVisible = useMemo(() => yearEvents.events.filter(e => enabled.has(e.sourceId) && !sourceMap.get(e.sourceId)?.objective && !esMecanicaAlumno(e)), [yearEvents.events, enabled, sourceMap])
  // Colores por tipo de trabajo (10 oct 2026, categorias.ts): cada evento se pinta por su categoría, no por su calendario.
  const [ocultas, alternarCategoria] = useOcultas()
  const categoriaEvento = useCallback((e: PlanEvent) => categoriaDe(e, sourceMap.get(e.sourceId)?.title ?? e.calendarId).categoria, [sourceMap])
  const porCalendario = useCallback((e: PlanEvent) => enabled.has(e.sourceId) && !sourceMap.get(e.sourceId)?.objective && (ajustes.rechazados || !rechazado(e)), [enabled, sourceMap, ajustes.rechazados])
  // DRIP (24 oct 2026, Daniel: «cada evento se clasifica SOLO por DRIP… y se colorea»): la ÚNICA clasificación y el color de cada
  // evento en Día, Semana y Mes. Levy lo infiere (drip.ts) y la persona lo corrige con un toque (almacén DRIP, useDrip). La categoría
  // de antes (Crear/Vender/…) queda solo como red de la inferencia y en la vista del chat.
  const drip = useDrip()
  const [ocultosDrip, alternarDrip] = useOcultosDrip()
  const lecturas = useMemo(() => { const m = new Map<string, LecturaDrip>()
    for (const e of presentedEvents) m.set(e.id, leerDrip(e, sourceMap.get(e.sourceId)?.title ?? e.calendarId, drip.doc))
    return m }, [presentedEvents, sourceMap, drip.doc])
  const lecturaDe = useCallback((e: PlanEvent) => lecturas.get(e.id) ?? leerDrip(e, sourceMap.get(e.sourceId)?.title ?? e.calendarId, drip.doc), [lecturas, sourceMap, drip.doc])
  // La mecánica del programa para los alumnos («🔓 Abre … en el classroom») no se pinta en ninguna vista de Daniel (drip.ts).
  const eventoVisible = useCallback((e: PlanEvent) => porCalendario(e) && !esMecanicaAlumno(e) && !ocultosDrip.has(lecturaDe(e).cuadrante), [porCalendario, ocultosDrip, lecturaDe])
  // Los hitos del programa (fases, aperturas, demo day, uno a uno) se pintan neutros en todas las escalas (drip.ts `colorDePiedra`).
  const colorEvento = useCallback((e: PlanEvent) => colorDePiedra(e, lecturaDe(e).cuadrante), [lecturaDe])
  const leyenda = useMemo<ControlLeyenda>(() => ({ categoria: categoriaEvento, ocultas, alternar: alternarCategoria, porCalendario,
    calendarios: snapshot?.sources.filter(s => !s.objective).map(s => ({ id: s.id, titulo: s.title, color: s.color, activo: enabled.has(s.id) })),
    alternarCalendario: id => { const next = new Set(enabled); if (next.has(id)) next.delete(id); else next.add(id); setSources([...next]) },
    ponerCalendarios: (ids, activo) => { const next = new Set(enabled); for (const id of ids) { if (activo) next.add(id); else next.delete(id) } setSources([...next]) } }),
  [categoriaEvento, ocultas, alternarCategoria, porCalendario, snapshot?.sources, enabled])
  // Las vistas reciben la leyenda sin su menú de calendarios: los calendarios viven en el engrane.
  const leyendaVista = useMemo<ControlLeyenda>(() => ({ ...leyenda, calendarios: undefined, alternarCalendario: undefined, ponerCalendarios: undefined }), [leyenda])
  // El Mes es el Preloaded Year (24 oct 2026, cascada): solo piedras grandes. Las rutinas diarias (rutinas.ts, por frecuencia en
  // todo lo leído), las ventanas de disponibilidad y el brief plegado en su llamada no entran a su cuadrícula; la Semana pinta
  // las rutinas atenuadas y el Día, todo entero.
  const fueraMes = useMemo(() => fueraDelMes(presentedEvents, iso => dayKey(parseISO(iso))), [presentedEvents])
  // El Mes en lista por semanas (angosto) y los números de semana del programa (S0…S11), leídos de las propias fases.
  const eventosMes = useMemo(() => presentedEvents.filter(eventoVisible).filter(e => !fueraMes.has(e.id)).map(e => { const piedra = piedraDe(e, lecturaDe(e).cuadrante); return { evento: e, piedra, color: colorEvento(e), atencion: atencionDe(e, piedra) } }), [presentedEvents, eventoVisible, fueraMes, lecturaDe, colorEvento])
  const programa = useMemo(() => semanasDelPrograma(presentedEvents), [presentedEvents])
  // La cuadrícula del Mes (25 oct 2026, Daniel: «las clases son eventos que no quiero ver», «quiero simplicidad»): solo lo de día
  // completo (fases, hitos, viajes, uno a uno), sin clases, bloques con hora ni tareas. Lo que cae dentro de un viaje (la reunión
  // del 28 en Monterrey) es una marca en su día, no otra cinta apilada.
  const marcasMes = useMemo(() => marcasEnViajes(presentedEvents.filter(eventoVisible)), [presentedEvents, eventoVisible])
  const marcasPorDia = useMemo(() => { const m = new Map<string, PlanEvent[]>()
    for (const e of presentedEvents) { const d = marcasMes.get(e.id); if (d) m.set(d, [...(m.get(d) ?? []), e]) }
    return m }, [presentedEvents, marcasMes])
  // La Semana y el Día no repiten la fase en cada columna: vive solo en el Mes.
  // La rutina a futuro no se pinta en Semana ni Día (26 oct 2026, Daniel: «la veo al pasado, justo lo que hice, no lo que espero
  // hacer»): lo que ya empezó sí; los compromisos y lo único, siempre (rutinas.ts). `tick` la recorta cada minuto.
  const rutina = useMemo(() => rutinaDeAgenda(presentedEvents, iso => dayKey(parseISO(iso))), [presentedEvents])
  const ahoraMinuto = useMemo(() => Date.now(), [tick]) // eslint-disable-line react-hooks/exhaustive-deps -- `tick` repinta cada minuto
  const visibleSemanaDia = useCallback((e: PlanEvent) => eventoVisible(e) && !esFase(e) && !rutinaOculta(e, rutina, ahoraMinuto, ajustes.rutinaFutura),
    [eventoVisible, rutina, ahoraMinuto, ajustes.rutinaFutura])
  const eventInputs = useMemo<EventInput[]>(() => [
    ...presentedEvents.filter(eventoVisible).filter(e => mode !== 'month' || (e.allDay && !fueraMes.has(e.id) && (compacto || !marcasMes.has(e.id)))).filter(e => mode === 'month' || !esFase(e)).map(e => ({
      id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, editable: e.editable && !saving && !pending,
      classNames: [styles.calendarEvent], extendedProps: { kind: 'event', recurring: Boolean(e.recurringEventId), source: sourceMap.get(e.sourceId)?.title, color: colorEvento(e), drip: lecturaDe(e).cuadrante, piedra: piedraDe(e, lecturaDe(e).cuadrante), protegido: lecturaDe(e).protegido,
        // El peso en la celda del Mes: lo de día completo, luego lo que es con otras personas o una clase, luego lo demás.
        peso: e.allDay ? 0 : esCompromiso(e) || categoriaEvento(e) === 'ensenar' ? 1 : 2 },
    })),
    ...visibleTasks.filter(t => mode !== 'month' && t.due && !t.completed && !(alcanceDeModo(mode) && !hasTime(t.due))).map(t => ({ id: t.id, title: t.title, start: t.due!, end: taskEnd(t)?.toISOString(),
      allDay: !hasTime(t.due), editable: !saving && !pending, classNames: t.priority === 1 ? [styles.calendarTask, styles.calendarTaskP1] : [styles.calendarTask], extendedProps: { kind: 'task', recurring: t.recurring } })),
  ], [presentedEvents, eventoVisible, colorEvento, categoriaEvento, sourceMap, visibleTasks, saving, pending, mode, fueraMes, marcasMes, compacto, lecturaDe])
  const railTasks = useMemo(() => visibleTasks.filter(t => t.due ? parseISO(t.due).getTime() < Date.parse(range.to) : showUnscheduled)
    .sort((a, b) => Number(!a.due) - Number(!b.due) || a.priority - b.priority || (a.due ?? 'z').localeCompare(b.due ?? 'z')), [visibleTasks, range.to, showUnscheduled])
  // El Mes elige Recorrido o Cuadrícula en el engrane; el Día conserva su toque para la rejilla.
  const rejilla = mode === 'month' ? ajustes.mesVista === 'cuadricula' : Boolean(rejillas[mode])
  // La Semana trae su propia rejilla de horas (9 oct 2026, SemanaHoras.tsx): la de FullCalendar queda plegada siempre en esa escala.
  // El Día tampoco (18 oct 2026, Daniel vio dos rejillas en «Lun 19 oct»): su agenda es la única rejilla y solo lleva eventos.
  // El Mes abre en Recorrido en todas las pantallas (25 oct 2026, Daniel: «el recorrido es el default»); la cuadrícula, solo si se
  // elige en el engrane. Sin cuadrícula, el Mes no usa el acomodo de dos columnas: el recorrido es la única columna.
  const rejillaOculta = esViva(mode) && (mode === 'week' || mode === 'day' || !rejilla)
  const dosColumnasVista = dosColumnas && !(mode === 'month' && !rejilla)
  useEffect(() => {
    if (rejillaOculta) return
    const t = setTimeout(() => calendar.current?.getApi().updateSize(), 30)
    return () => clearTimeout(t)
  }, [mode, rejillaOculta, dosColumnasVista])
  function alternarRejilla() {
    const siguiente = !rejilla
    setRejillas(r => ({ ...r, [mode]: siguiente }))
    try { localStorage.setItem(claveRejilla(mode, donde), siguiente ? '1' : '0') } catch { /* sin almacenamiento: vale para esta sesión */ }
    if (siguiente) setTimeout(() => calendarPane.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  const objectives = useMemo(() => snapshot?.events.filter(e => sourceMap.get(e.sourceId)?.objective && parseISO(e.start).getTime() <= Date.now() && parseISO(e.end).getTime() > Date.now()) ?? [], [snapshot?.events, sourceMap, tick])

  // Mes angosto: la lista del día tocado (eventos y tareas de ese día, completos).
  const monthDay = useMemo(() => diaMes ?? startOfDay(anchor), [diaMes, anchor])
  const dayItems = useMemo(() => {
    const from = startOfDay(monthDay).getTime(), to = addDays(startOfDay(monthDay), 1).getTime(), key = dayKey(monthDay)
    const events = presentedEvents.filter(eventoVisible).filter(e => {
      const s = parseISO(e.start).getTime(), f = parseISO(e.end).getTime()
      return s < to && (f > from || (f === s && s >= from))
    }).map(e => ({ item: e as PlanItem, allDay: e.allDay, at: parseISO(e.start).getTime(), color: colorEvento(e) as string | null,
      time: e.allDay ? 'Todo el día' : `${format(parseISO(e.start), 'HH:mm')} – ${format(parseISO(e.end), 'HH:mm')}` }))
    const tasks = visibleTasks.filter(t => t.due && !t.completed && dayKey(parseISO(t.due)) === key).map(t => ({ item: t as PlanItem, allDay: !hasTime(t.due), at: parseISO(t.due!).getTime(),
      color: null as string | null, time: hasTime(t.due) ? format(parseISO(t.due!), 'HH:mm') : 'Tarea' }))
    return [...events, ...tasks].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.at - b.at)
  }, [monthDay, presentedEvents, visibleTasks, eventoVisible, colorEvento])

  const changeMode = useCallback((pedido: CalendarMode, restoring = false) => {
    if (EDICION_CLIENTE && pedido === 'crons') return
    const next = escalaVigente(pedido)
    if (!restoring) { explicitView.current = true; setMov(enTransicion.current ? null : movimientoEntre(modeRef.current, next)) }
    if (isOwnSurface(next) || isOwnSurface(modeRef.current)) initialDate.current = calendar.current?.getApi().getDate() ?? initialDate.current
    if (next === 'week' && modeRef.current !== 'week') realinear()
    setMode(next)
    const view = vistaFC(next)
    if (view && !isOwnSurface(modeRef.current)) calendar.current?.getApi().changeView(view)
  }, [realinear, vistaFC])
  /** Lo que pide Daniel (pestañas, teclas, selector): entre hojas vivas, con el riel compartido. */
  const escala = useCallback((next: CalendarMode) => {
    if (esViva(next) && esViva(modeRef.current) && next !== modeRef.current) transicion(() => changeMode(next))
    else changeMode(next)
  }, [changeMode, transicion])
  useEffect(() => {
    if (!snapshot?.ownerId || preferencesOwner.current === snapshot.ownerId) return
    preferencesOwner.current = snapshot.ownerId
    try {
      const stored = localStorage.getItem(clavePrefs(snapshot.ownerId))
      const prefs = stored ? JSON.parse(stored) : null
      setTasksOpen(!angosto() && (prefs?.tasksOpen ?? false))
      if (!explicitView.current) {
        const guardado = escalaVigente(prefs?.mode)
        if (guardado && MODOS_CALENDARIO.some(m => m.id === guardado)) changeMode(guardado, true)
        else if (angosto() && donde !== 'panel') changeMode('agenda', true)
      }
      if (Array.isArray(prefs?.sources)) setSources(prefs.sources)
      if (typeof prefs?.project === 'string') setProject(prefs.project)
      if ([0, 1, 2, 3, 4].includes(prefs?.priority)) setPriority(prefs.priority)
    } catch { setTasksOpen(false) }
  }, [snapshot?.ownerId, changeMode]) // eslint-disable-line react-hooks/exhaustive-deps -- clavePrefs y angosto dependen de `donde`, fijo por montaje
  useEffect(() => {
    if (!snapshot?.ownerId) return
    // Defer until restoration state has committed, so an initial render cannot
    // replace saved preferences with its defaults.
    const timer = setTimeout(() => {
      try { localStorage.setItem(clavePrefs(snapshot.ownerId), JSON.stringify({ mode, sources, project, priority, tasksOpen })) } catch { /* noop */ }
    }, 100)
    return () => clearTimeout(timer)
  }, [snapshot?.ownerId, mode, sources, project, priority, tasksOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  // Toda escritura propia pasa por aquí: al confirmarla el proveedor, deja su inversa para ⌘Z.
  const lookup = useCallback((op: PlanMutation): PlanItem | undefined => {
    const data = dataRef.current
    if (!data) return undefined
    return [...data.events, ...data.tasks, ...(data.completedTasks ?? [])].find(i => i.kind === op.kind && i.externalId === op.externalId && (i.kind === 'task' || (i.account === op.account && i.calendarId === op.calendarId)))
  }, [])
  // Escrituras propias en vuelo (10 oct 2026, «⌘Z confiable»): su inversa entra a la pila al confirmarse; deshacer espera a que
  // lleguen, si no desharía la acción anterior (o diría que no hay nada) mientras Google aún contesta.
  const enVuelo = useRef(new Set<Promise<unknown>>())
  // La lectura que ve ⌘Z (`dataRef`) se renueva al repintar: el paso siguiente espera a verla, así arma su inversa con el
  // etag que Google acaba de dar y no con el de antes (un etag viejo es un conflicto). Tope de 2 s por si no hubo repintado.
  const lecturaNueva = useCallback(async (antes: unknown) => {
    const t0 = performance.now()
    while (dataRef.current === antes && performance.now() - t0 < 2000) await new Promise(r => setTimeout(r, 16))
  }, [])
  const commit = useCallback((op: PlanMutation) => {
    const before = lookup(op)
    const tarea = (async () => { const result = await mutate(op); history.push(inverseFor(op, before, result)); await lecturaNueva(dataRef.current); return result })()
    enVuelo.current.add(tarea)
    const quitar = () => { enVuelo.current.delete(tarea) }
    tarea.then(quitar, quitar)
    return tarea
  }, [mutate, history, lookup, lecturaNueva])
  commitRef.current = commit
  const autoRef = useRef(auto); autoRef.current = auto
  // Deshacer y rehacer son el mismo paso con la pila al revés: la inversa de la inversa es la acción original. Cada ⌘Z entra a
  // una fila: tres ⌘Z seguidos deshacen tres pasos, en orden, aunque el primero aún esté esperando a Google.
  const cadena = useRef<Promise<void>>(Promise.resolve())
  const paso = useCallback(async (dir: 'undo' | 'redo') => {
    // Lo que la hoja o la rejilla dejaron por escribir se escribe ya, y lo que va en camino se espera: así la pila está completa.
    await autoRef.current.vaciar().catch(() => false)
    while (enVuelo.current.size) await Promise.allSettled([...enVuelo.current])
    const entry = dir === 'undo' ? history.pop() : history.popRedo()
    const put = (e: typeof entry) => { if (!e) return; if (dir === 'undo') history.restore(e); else history.restoreRedo(e) }
    if (!entry) { setNotice(dir === 'undo' ? 'No hay nada que deshacer.' : 'No hay nada que rehacer.'); return }
    if (entry.irreversible) { setNotice(`No se puede deshacer: ${entry.label}. ${entry.irreversible}`); return }
    const data = dataRef.current
    const op = entry.build(data ? [...data.events, ...data.tasks] : [], history.aliases)
    if (!op) { setNotice(`No se pudo ${dir === 'undo' ? 'deshacer' : 'rehacer'} ${entry.label}: ya no está en el calendario.`); return }
    const before = lookup(op)
    setNoticeUndo(false)
    try {
      const result = await mutate(op)
      // La pluma deja su lectura nueva justo antes de resolver; React la pinta en la siguiente tarea: se espera a verla.
      await lecturaNueva(dataRef.current)
      entry.after?.(result, history.aliases)
      const counter = inverseFor(op, before, result)
      const inverse = counter && !counter.irreversible ? { ...counter, label: entry.label } : null
      if (dir === 'undo') history.pushRedo(inverse); else history.pushUndo(inverse)
      setNotice(`${dir === 'undo' ? 'Deshecho' : 'Rehecho'}: ${entry.label}.`)
    } catch (err) { put(entry); setNotice(`No se pudo ${dir === 'undo' ? 'deshacer' : 'rehacer'}: ${err instanceof Error ? err.message : 'el proveedor no confirmó.'}`) }
  }, [history, mutate, lookup, lecturaNueva])
  const step = useCallback((dir: 'undo' | 'redo') => {
    const run = () => paso(dir)
    cadena.current = cadena.current.then(run, run)
    return cadena.current
  }, [paso])
  useEffect(() => { if (!notice) { setNoticeUndo(false); return } const t = setTimeout(() => setNotice(null), noticeUndo ? 8000 : 5000); return () => clearTimeout(t) }, [notice, noticeUndo])

  // ── El gobierno del tiempo (24 oct 2026, fase 2): DRIP, los tres números, la foto del plan, el domingo y la mañana. ──────────
  /** Todo lo leído con hora, ya clasificado: los calendarios encendidos, sin mirar los cuadrantes ocultos (la medición no se esconde). */
  const bloquesDrip = useMemo<BloqueDrip[]>(() => presentedEvents.filter(e => !e.allDay && porCalendario(e)).map(e => { const l = lecturaDe(e)
    return { id: e.id, titulo: e.title, inicio: Date.parse(e.start), fin: Date.parse(e.end), cuadrante: l.cuadrante, delegadoA: l.delegadoA, protegido: l.protegido,
      editable: e.editable, conOtros: Boolean(e.meetUrl) || (e.attendees ?? []).some(a => !a.self), serie: e.recurringEventId } }), [presentedEvents, porCalendario, lecturaDe])
  const lunesHoy = lunesDe(dayKey(new Date())) // eslint-disable-line react-hooks/exhaustive-deps -- `tick` repinta cada minuto
  /** ¿La lectura cubre la semana entera [lunes, lunes+7)? Sin eso, sus números son «—». */
  const cubre = useCallback((lunes: string) => Boolean(snapshot) && Date.parse(snapshot!.range.from) <= parseISO(lunes).getTime() && Date.parse(snapshot!.range.to) >= addDays(parseISO(lunes), 7).getTime(), [snapshot])
  // Los TRES números de la franja: Día N de la temporada (ContadorPeriodo), horas en Producir esta semana y horas recompradas.
  const numeros = useMemo(() => {
    const l = parseISO(lunesHoy).getTime(), f = addDays(parseISO(lunesHoy), 7).getTime(), leida = cubre(lunesHoy)
    const hayMedicion = Boolean(drip.doc && Object.keys(drip.doc.delegados).length) || bloquesDrip.some(b => b.delegadoA)
    return { producir: leida ? horasUnion(bloquesDrip.filter(b => b.cuadrante === 'producir'), l, f) : null,
      recompradas: leida && drip.doc ? horasRecompradas(bloquesDrip, l, f, hayMedicion) : null, tarifa: drip.doc?.tarifa ?? null }
  }, [lunesHoy, cubre, bloquesDrip, drip.doc])
  /** El evento vivo (la última lectura con la capa optimista): proteger y delegar escriben sobre su etag de ahora. */
  const eventoVivo = useCallback((e: PlanEvent) => presentedEvents.find(x => x.id === e.id) ?? e, [presentedEvents])
  const titular = (t: string) => t.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim()
  const escribirDescripcionEvento = useCallback((e: PlanEvent, description: string) => snapshot ? commit(mutationFor(e, snapshot.ownerId, { ...eventData(e), description })) : Promise.reject(new Error('Sin lectura')), [snapshot, commit])
  const proteger = useCallback(async (e0: PlanEvent, si: boolean) => {
    const e = eventoVivo(e0)
    await escribirDescripcionEvento(e, conProtegido(e.description, si))
    setNotice(si ? `«${titular(e.title)}» quedó protegido.` : `«${titular(e.title)}» ya no está protegido.`); setNoticeUndo(true)
  }, [eventoVivo, escribirDescripcionEvento])
  const corregir = useCallback(async (e: PlanEvent, c: Cuadrante | null) => {
    await drip.cambiar({ accion: 'corregir', claves: lecturaDe(e).claves, titulo: e.title, cuadrante: c })
    setNotice(c ? `«${titular(e.title)}» es ${DRIP[c].nombre}. Levy lo recordará.` : `«${titular(e.title)}» vuelve a lo que infiere Levy.`)
  }, [drip, lecturaDe])
  const delegar = useCallback(async (e0: PlanEvent, activo: boolean) => {
    const e = eventoVivo(e0)
    await drip.cambiar({ accion: 'delegar', claves: lecturaDe(e).claves, titulo: e.title, a: 'Levy', activo })
    // Recuperar también quita la marca `[delegado: …]` de la descripción, si la tenía (por la pluma, con ⌘Z).
    if (!activo && /\[delegado/i.test(e.description) && e.editable) await escribirDescripcionEvento(e, conDelegado(e.description, null))
    setNotice(activo ? `«${titular(e.title)}» es de Levy${onConversar ? ': el encargo quedó en el chat' : ''}.` : `«${titular(e.title)}» vuelve a ser tuyo.`)
  }, [drip, lecturaDe, eventoVivo, escribirDescripcionEvento, onConversar])
  // La foto del plan (la referencia del domingo): la primera vez que se lee una semana entera, se guarda lo que había.
  const fotos = useRef(new Map<string, Promise<import('./drip').FotoSemana | null>>())
  const tomarFoto = useCallback((lunes: string) => {
    const doc = drip.doc
    if (!doc) return Promise.resolve(null)
    if (doc.fotos[lunes]) return Promise.resolve(doc.fotos[lunes])
    if (!cubre(lunes) || (!goalsLeidos.data && !goalsLeidos.error)) return Promise.resolve(null)
    const enCurso = fotos.current.get(lunes)
    if (enCurso) return enCurso
    const l = parseISO(lunes).getTime(), f = addDays(parseISO(lunes), 7).getTime()
    const g = goalsLeidos.data?.goals.find(x => x.scope === 'week' && x.start === lunes)
    const p = drip.cambiar({ accion: 'foto', foto: fotoDe(lunes, bloquesDrip, l, f, g?.title ?? null, g ? g.success.split('\n').filter(x => /^\s*[-*]\s*\[( |x|X)\]/.test(x)).length : 0) })
      .then(d => d.fotos[lunes] ?? null).catch(() => { fotos.current.delete(lunes); return null })
    fotos.current.set(lunes, p)
    return p
  }, [drip, cubre, goalsLeidos.data, goalsLeidos.error, bloquesDrip])
  useEffect(() => { if (drip.doc && !drip.doc.fotos[lunesHoy]) void tomarFoto(lunesHoy) }, [drip.doc, lunesHoy, tomarFoto])
  // El domingo: abierto por defecto los domingos (una vez por domingo, en la sección); a un toque desde el pie de cada escala.
  const [domingo, setDomingo] = useState<string | null>(null)
  useEffect(() => {
    if (donde !== 'seccion' || new Date().getDay() !== 0) return
    const k = `arbrain:planning:domingo-abierto:${dayKey(new Date())}`
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1') } catch { return }
    setDomingo(lunesDe(dayKey(new Date())))
  }, [donde, tick])
  const aplicarPropuesta = useCallback(async (p: Propuesta) => {
    const e = presentedEvents.find(x => x.id === p.bloque.id)
    if (!e) throw new Error('Ese bloque ya no está en tu calendario.')
    await escribirDescripcionEvento(e, p.tipo === 'proteger' ? conProtegido(e.description, true) : conDelegado(e.description, 'Levy'))
  }, [presentedEvents, escribirDescripcionEvento])
  const gobierno = useMemo<Gobierno>(() => ({ lectura: lecturaDe, ocultas: ocultosDrip, alternar: alternarDrip, numeros, doc: drip.doc, corregir, delegar,
    proteger: snapshot ? proteger : null, abrirDomingo: () => setDomingo(lunesDe(dayKey(anchorRef.current))),
    ponerTarifa: (monto, moneda) => drip.cambiar({ accion: 'tarifa', monto, moneda }),
    aceptarManana: dia => drip.cambiar({ accion: 'manana', dia, aceptada: true }), conversar: onConversar, leyendaEnBarra: true }),
  [lecturaDe, ocultosDrip, alternarDrip, numeros, drip, corregir, delegar, snapshot, proteger, onConversar])

  // «Hoy» también lleva a la hora (22 oct 2026): el pulso hace que el Día y la Semana vuelvan a su encuadre con scroll suave.
  const [pulsoHoy, setPulsoHoy] = useState(0)
  const goToday = useCallback(() => {
    const today = new Date()
    setPulsoHoy(n => n + 1)
    initialDate.current = today
    if (modeRef.current !== 'day' && modeRef.current !== 'week') setMov(dayKey(today) < dayKey(anchorRef.current) ? 'izq' : dayKey(today) > dayKey(anchorRef.current) ? 'der' : null)
    // Ancla y ventana antes de mover FullCalendar: su `today()` hace flushSync y la Semana se alinearía con el ancla vieja.
    setAnchor(today)
    if (modeRef.current === 'week') realinear()
    if (mode === 'crons') setRange({ from: startOfDay(today).toISOString(), to: addDays(startOfDay(today), 7).toISOString() })
    else if (mode !== 'year') calendar.current?.getApi().today()
  }, [mode, realinear])
  // Medianoche con la app abierta (5 oct 2026): si lo que se veía era «hoy», el calendario pasa solo al día nuevo. Se revisa
  // con el reloj de cada minuto y al volver a la ventana (tras dormir la Mac los intervalos llegan tarde).
  const hoyVisto = useRef(dayKey(new Date()))
  const rangoRef = useRef(range); rangoRef.current = range
  const irHoy = useRef(goToday); irHoy.current = goToday
  useEffect(() => {
    const revisar = () => {
      const hoy = dayKey(new Date()), antes = hoyVisto.current
      if (hoy === antes) return
      hoyVisto.current = hoy
      if (debeAvanzarAHoy(antes, hoy, dayKey(parseISO(rangoRef.current.from)), dayKey(parseISO(rangoRef.current.to)))) irHoy.current()
    }
    revisar()
    window.addEventListener('focus', revisar); document.addEventListener('visibilitychange', revisar)
    return () => { window.removeEventListener('focus', revisar); document.removeEventListener('visibilitychange', revisar) }
  }, [tick])
  const pickDay = useCallback((day: string) => {
    const target = parseISO(day)
    initialDate.current = target; setAnchor(target); changeMode('day')
  }, [changeMode])

  useEffect(() => {
    const keydown = (e: KeyboardEvent, enCaptura = false) => {
      const action = calendarAction(e)
      // Un elemento ya desmontado (el «Cerrar» de la hoja que acaba de irse) no cuenta como «dentro de un diálogo».
      const target = (e.target as HTMLElement | null)?.isConnected === false ? null : e.target as HTMLElement | null
      if (!action || selection || target?.closest('input,textarea,select,[role="dialog"],[contenteditable="true"],[contenteditable=""],[role="textbox"]')) return
      // Con el foco en los hábitos del día, los números marcan hábitos, no cambian de escala (5 oct 2026).
      if (target?.closest('[data-habitos]') && action.type === 'mode') return
      // Sección y panel pueden estar a la vez: el del panel solo con el foco dentro; la sección, con el foco fuera del panel.
      const enPanel = !!target?.closest('[data-panel-derecho]')
      if (donde === 'panel' ? !raiz.current?.contains(target) : enPanel) return
      // T = hoy en el calendario (10 oct 2026); fuera de él, T sigue siendo el tema. Se atiende en captura para ganarle al tema.
      const esT = action.type === 'today' && e.key.toLowerCase() === 't'
      if (enCaptura !== esT) return
      switch (action.type) {
        case 'undo': e.preventDefault(); void step('undo'); break
        case 'redo': e.preventDefault(); void step('redo'); break
        case 'delete': {
          const item = items.get(target?.closest<HTMLElement>('[data-planning-id]')?.dataset.planningId ?? '')
          if (item?.kind === 'event' && item.editable) { e.preventDefault(); setSelection({ item, confirmDelete: true }) }
          break
        }
        case 'new': if (snapshot) { e.preventDefault(); setSelection(action.kind === 'task' ? { kind: 'task', allDay: true } : { start: new Date() }) } break
        case 'today': e.preventDefault(); goToday(); break
        // Repetir la tecla de la escala activa (D · S · M) lleva a hoy, como el segundo toque del selector (10 oct 2026).
        case 'mode': e.preventDefault(); if (accionDeEscala(modeRef.current, action.mode) === 'hoy') goToday(); else escala(action.mode); break
        // En la Semana, ← → mueven la ventana UN día (10 oct 2026); las flechas de la barra siguen moviendo la semana entera.
        case 'nav': if (modeRef.current === 'week') { e.preventDefault(); deslizarSemana(action.delta) } else if (modeRef.current !== 'crons') { e.preventDefault(); navRef.current(action.delta) } break
      }
    }
    const burbuja = (e: KeyboardEvent) => keydown(e), captura = (e: KeyboardEvent) => keydown(e, true)
    window.addEventListener('keydown', burbuja)
    window.addEventListener('keydown', captura, true)
    return () => { window.removeEventListener('keydown', burbuja); window.removeEventListener('keydown', captura, true) }
  }, [selection, snapshot, escala, items, step, goToday, donde, deslizarSemana])

  // La lectura sigue a la ventana de la Semana: si el primer día visible pasa a otra semana, el calendario (rango, URL, panel) va ahí.
  useEffect(() => {
    const inicio = ventanaSemana.inicio
    if (mode !== 'week' || !inicio || lunesDe(inicio) === dayKey(startOfWeek(anchorRef.current, { weekStartsOn: 1 }))) return
    const t = setTimeout(() => { initialDate.current = parseISO(inicio); calendar.current?.getApi().gotoDate(parseISO(inicio)) }, 120)
    return () => clearTimeout(t)
  }, [mode, ventanaSemana.inicio])

  // El panel avisa dónde está (fecha y vista) para que su pestaña y Expandir lo conserven.
  const avisar = useRef(onCambio); avisar.current = onCambio
  useEffect(() => {
    if (mode === 'crons') return
    const t = setTimeout(() => avisar.current?.(dayKey(anchor), mode), 200)
    return () => clearTimeout(t)
  }, [mode, anchor])

  useEffect(() => {
    if (!rail.current || isOwnSurface(mode)) return
    const draggable = new Draggable(rail.current, { itemSelector: '[data-plan-task]', eventData: element => {
      const item = dataRef.current?.tasks.find(t => t.id === element.dataset.planTask)
      return { id: item?.id, title: item?.title ?? '', duration: { minutes: item?.durationMinutes ?? 30 }, create: true }
    } })
    return () => draggable.destroy()
  }, [tasksOpen, mode, snapshot?.ownerId])

  const aplicarVista = useCallback((date: string | null | undefined, pedido: string | null | undefined) => {
    const requestedMode = escalaVigente(pedido)
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    const target = parseISO(date)
    if (!Number.isFinite(target.getTime()) || format(target,'yyyy-MM-dd') !== date) return
    explicitView.current = true
    initialDate.current = target
    // Ancla y ventana antes de mover FullCalendar (hace flushSync): la Semana se alinea con la fecha pedida.
    setAnchor(target)
    realinear()
    const requested = MODES.find(m => m.id === requestedMode && m.id !== 'crons')
    setMov(requested && !enTransicion.current ? movimientoEntre(modeRef.current, requested.id) : null)
    if (requested?.calendar) { setMode(requested.id); modeRef.current=requested.id; calendar.current?.getApi().changeView(vistaFC(requested.id) ?? requested.calendar, target) }
    else if (requested?.id === 'year' || requested?.id === 'habits') { setMode(requested.id); modeRef.current = requested.id }
    else calendar.current?.getApi().gotoDate(target)
    setAnchor(target)
  }, [realinear, vistaFC])
  // El engrane cambió las semanas del Mes: la cuadrícula pasa a esa vista en la misma fecha.
  useEffect(() => {
    if (mode !== 'month') return
    const api = calendar.current?.getApi()
    if (api && api.view.type !== vistaMes) api.changeView(vistaMes, api.getDate())
  }, [mode, vistaMes])
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    // Al abrir, hoy (apertura.ts): la fecha de la URL o de la pestaña del panel solo vale dentro de la sesión viva; la escala, siempre.
    const viva = marcarSesion(), hoy = format(new Date(), 'yyyy-MM-dd')
    const pedida = inicio ? inicio.fecha : query.get('date'), modo = inicio ? inicio.modo : query.get('mode')
    const fecha = fechaDeArranque(pedida, viva, hoy)
    if (fecha === hoy && !pedida && !modo) return
    aplicarVista(fecha, modo ?? modeRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar: `inicio` es el punto de partida, no un control
  // Volver a la app tras un rato fuera (la página siguió viva en segundo plano) es reabrirla: vuelve a hoy. Mientras se usa, la
  // marca de sesión se renueva para que recargar dentro de la sesión conserve la fecha.
  useEffect(() => {
    let oculto: number | null = null
    const cambio = () => {
      if (document.visibilityState === 'hidden') { oculto = Date.now(); tocarSesion(); return }
      const volver = reabrirEnHoy(oculto, Date.now())
      oculto = null; tocarSesion()
      if (volver && modeRef.current !== 'crons' && modeRef.current !== 'year') irHoy.current()
    }
    document.addEventListener('visibilitychange', cambio)
    return () => document.removeEventListener('visibilitychange', cambio)
  }, [])
  // Expandir desde la pestaña del panel con la sección ya abierta: el Link a la misma ruta no remonta, así que el panel avisa por aquí
  // y la sección se pone en la MISMA fecha y vista (si la sección no estaba abierta, la lee de la URL al montar).
  useEffect(() => {
    if (donde !== 'seccion') return
    const ir = (e: Event) => { const d = (e as CustomEvent<{ fecha?: string; modo?: string }>).detail; aplicarVista(d?.fecha, d?.modo) }
    window.addEventListener(EVENTO_IR_CALENDARIO, ir)
    return () => window.removeEventListener(EVENTO_IR_CALENDARIO, ir)
  }, [donde, aplicarVista])
  // Ctrl+D/X/W/M (5 oct 2026): la pestaña del panel va a hoy en esa escala, esté ya abierta o recién montada (orden-panel.ts).
  const orden = useOrdenCalendario(st => st.orden)
  useEffect(() => {
    if (donde !== 'panel' || !orden) return
    const o = useOrdenCalendario.getState().tomar()
    if (o) aplicarVista(o.fecha, o.modo)
  }, [donde, orden, aplicarVista])

  // La URL siempre lleva fecha y vista: recargar, compartir o «expandir» desde el panel abre exactamente ahí.
  useEffect(() => {
    if (inicio || mode === 'crons') return
    const t = setTimeout(() => {
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('date', dayKey(anchor)); url.searchParams.set('mode', mode)
        if (url.search !== window.location.search) window.history.replaceState(window.history.state, '', url)
        tocarSesion()
      } catch { /* la URL es un espejo: sin ella todo sigue funcionando */ }
    }, 150)
    return () => clearTimeout(t)
  }, [inicio, mode, anchor])

  const onDates = useCallback((arg: DatesSetArg) => {
    setTitle(arg.view.title)
    setAnchor(previous => previous.getTime() === arg.view.currentStart.getTime() ? previous : arg.view.currentStart)
    const next = { from: arg.start.toISOString(), to: arg.end.toISOString() }
    setRange(old => old.from === next.from && old.to === next.to ? old : next)
  }, [])

  useEffect(() => {
    const pane = calendarPane.current
    if (!pane) return
    // El eje se decide al empezar el gesto y el vertical gana (10 oct 2026): un scroll vertical con algo de X no cambia de periodo.
    let eje: 'x' | 'y' | null = null, accumulated = 0, lastEvent = 0, lastStep = 0, consumed = false
    const wheel = (event: WheelEvent) => {
      if (mode === 'year' || selection || event.ctrlKey || event.metaKey || event.buttons || (event.target as HTMLElement)?.closest('input,textarea,select,[role="dialog"],[data-more-menu]')) return
      const shift = event.shiftKey && event.deltaX === 0
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pane.clientWidth : 1
      const dx = (shift ? event.deltaY : event.deltaX) * factor
      const dy = shift ? 0 : event.deltaY * factor
      const now = performance.now()
      if (now - lastEvent > PAUSA_GESTO) { eje = null; accumulated = 0; consumed = false }
      lastEvent = now
      if (!eje) eje = shift ? 'x' : ejeDeRueda(dx, dy)
      if (eje !== 'x') return
      event.preventDefault()
      accumulated += dx
      const api = calendar.current?.getApi()
      if (!api) return
      if (mode === 'day' || mode === 'fourDays' || mode === 'week' || mode === 'crons') {
        if (Math.abs(accumulated) < 140 || now - lastStep < 180) return
        const direction = Math.sign(accumulated)
        if (mode === 'week' || mode === 'crons') api.changeView('rollingWeek', addDays(api.view.activeStart, direction))
        else api.incrementDate({ days: direction * (mode === 'fourDays' ? 4 : 1) })
        lastStep = now
        accumulated = Math.max(-126, Math.min(126, accumulated - direction * 140))
      } else if (!consumed && Math.abs(accumulated) >= UMBRAL_RUEDA) {
        consumed = true
        pasoRef.current(accumulated > 0 ? 1 : -1)
      }
    }
    pane.addEventListener('wheel', wheel, { passive: false })
    return () => pane.removeEventListener('wheel', wheel)
  }, [mode, selection])

  // Deslizar en el móvil (4 oct 2026): izquierda = siguiente, derecha = anterior; la unidad es la de la escala (día, 4 días, semana, mes).
  // Solo cuenta un gesto claramente horizontal (umbral y proporción), así el scroll vertical no se estorba.
  const navRef = useRef(navigate); navRef.current = navigate
  /** Un gesto de lado: un periodo; en la cuadrícula del Mes de N semanas, UNA semana (10 oct 2026, «la misma lógica en el Mes»). */
  const pasoRef = useRef((d: number) => {
    if (modeRef.current === 'month' && vistaMesRef.current !== 'dayGridMonth') calendar.current?.getApi().incrementDate({ weeks: d })
    else navRef.current(d)
  })
  useEffect(() => {
    // En las hojas vivas lo que se desliza es la escena; la nueva entra desde su lado (escalas-vivas.module.css).
    const root = raiz.current, slab = rejillaOculta ? escena.current : calendarGeometry.current
    if (!root || !slab || mode === 'crons') return
    let x0 = 0, y0 = 0, eje: 'x' | 'y' | null = null, activo = false, dx = 0, xAnt = 0, tAnt = 0, v = 0
    const ignora = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input,textarea,select,[role="dialog"],[data-more-menu],.fc-popover,[data-carril]')
    const start = (e: TouchEvent) => { activo = e.touches.length === 1 && !selection && !ignora(e.target) || false; if (!activo) return; x0 = xAnt = e.touches[0].clientX; y0 = e.touches[0].clientY; tAnt = performance.now(); v = 0; eje = null; dx = 0; slab.style.transition = 'none' }
    const move = (e: TouchEvent) => {
      if (!activo) return
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0
      if (!eje) eje = ejeDeToque(mx, my)
      if (eje !== 'x' || document.querySelector('.fc-event-dragging,.fc-event-mirror,.fc-highlight')) return
      dx = mx
      const t = performance.now(); if (t > tAnt) v = (e.touches[0].clientX - xAnt) / Math.max(16, t - tAnt); xAnt = e.touches[0].clientX; tAnt = t
      slab.style.transform = `translateX(${Math.max(-120, Math.min(120, mx * .5))}px)`
      slab.style.opacity = String(1 - Math.min(.35, Math.abs(mx) / 600))
    }
    const end = () => {
      if (!activo) return
      activo = false
      const paso = eje === 'x' && !document.querySelector('.fc-event-dragging,.fc-event-mirror,.fc-highlight') ? destinoAlSoltarToque(dx, root.clientWidth, v) : 0
      if (!paso) { slab.style.transition = 'transform 180ms ease, opacity 180ms ease'; slab.style.transform = ''; slab.style.opacity = ''; return }
      // El Día no remonta su escena (clave fija): el carril ya anima la hoja que entra, igual que con las flechas; la escena solo se suelta.
      if (rejillaOculta && mode === 'day') { slab.style.transition = 'transform 180ms ease, opacity 180ms ease'; slab.style.transform = ''; slab.style.opacity = ''; navRef.current(paso); return }
      // La Semana tampoco remonta: fuera del riel, el swipe mueve la ventana un día, igual que el riel.
      if (rejillaOculta && mode === 'week') { slab.style.transition = 'transform 180ms ease, opacity 180ms ease'; slab.style.transform = ''; slab.style.opacity = ''; deslizarSemana(paso); return }
      if (rejillaOculta) { slab.style.transition = 'transform 110ms ease-in, opacity 110ms ease-in'; slab.style.transform = `translateX(${-paso * 48}px)`; slab.style.opacity = '0'; setTimeout(() => navRef.current(paso), 90); return }
      slab.style.transition = 'transform 120ms ease-in, opacity 120ms ease-in'
      slab.style.transform = `translateX(${-paso * 40}px)`; slab.style.opacity = '0'
      setTimeout(() => {
        pasoRef.current(paso)
        slab.style.transition = 'none'; slab.style.transform = `translateX(${paso * 40}px)`
        void slab.offsetWidth
        slab.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out'; slab.style.transform = ''; slab.style.opacity = ''
      }, 120)
    }
    root.addEventListener('touchstart', start, { passive: true })
    root.addEventListener('touchmove', move, { passive: true })
    root.addEventListener('touchend', end); root.addEventListener('touchcancel', end)
    return () => { root.removeEventListener('touchstart', start); root.removeEventListener('touchmove', move); root.removeEventListener('touchend', end); root.removeEventListener('touchcancel', end) }
  }, [mode, selection, rejillaOculta, claveEscena, deslizarSemana])

  // Trackpad en las hojas vivas: un gesto horizontal claro = un periodo (como el swipe). El vertical sigue siendo scroll.
  useEffect(() => {
    const root = raiz.current
    if (!root || !rejillaOculta) return
    let eje: 'x' | 'y' | null = null, acumulado = 0, ultimo = 0, gastado = false
    const rueda = (e: WheelEvent) => {
      if (selection || e.ctrlKey || e.metaKey || (e.target as HTMLElement)?.closest('input,textarea,select,[role="dialog"],[data-carril],[data-more-menu]')) return
      const shift = e.shiftKey && e.deltaX === 0
      const dx = shift ? e.deltaY : e.deltaX, dy = shift ? 0 : e.deltaY
      const t = performance.now()
      if (t - ultimo > PAUSA_GESTO) { eje = null; acumulado = 0; gastado = false }
      ultimo = t
      if (!eje) eje = shift ? 'x' : ejeDeRueda(dx, dy)
      if (eje !== 'x') return
      e.preventDefault()
      acumulado += dx
      if (!gastado && Math.abs(acumulado) >= UMBRAL_RUEDA) { gastado = true; if (modeRef.current === 'week') deslizarSemana(acumulado > 0 ? 1 : -1); else navRef.current(acumulado > 0 ? 1 : -1) }
    }
    root.addEventListener('wheel', rueda, { passive: false })
    return () => root.removeEventListener('wheel', rueda)
  }, [rejillaOculta, selection, deslizarSemana])

  useLayoutEffect(() => {
    const element = raiz.current
    if (!element) return
    const read = () => {
      setCompacto(element.clientWidth < ANGOSTO)
      setDosColumnas(donde === 'seccion' && element.clientWidth >= DOS_COLUMNAS.ancho && element.clientHeight >= DOS_COLUMNAS.alto)
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!helpOpen) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelpOpen(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [helpOpen])
  useEffect(() => {
    if (!moreOpen) return
    const close = (e: Event) => { if (!(e.target as HTMLElement | null)?.closest('[data-more-menu]')) setMoreOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [moreOpen])

  useEffect(() => {
    const element = calendarGeometry.current
    if (!element) return
    let frame = 0
    const measure = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => calendar.current?.getApi().updateSize()) }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('arbrain:ui-zoom', measure)
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('arbrain:ui-zoom', measure) }
  }, [mode])

  async function reprogram(id: string, start: Date, end: Date | null, allDay: boolean) {
    const item = items.get(id)
    if (!item || !snapshot) return
    const finish = end ?? (allDay ? addDays(start, 1) : addMinutes(start, item.kind === 'task' ? item.durationMinutes ?? 30 : 60))
    const data = item.kind === 'event' ? { ...eventData(item), start: allDay ? dayKey(start) : start.toISOString(), end: allDay ? dayKey(finish) : finish.toISOString(), allDay } : {
      ...taskData(item), due: allDay ? dayKey(start) : start.toISOString(), durationMinutes: allDay ? null : Math.max(1, Math.round((finish.getTime() - start.getTime()) / 60_000)),
    }
    try {
      await commit(mutationFor(item, snapshot.ownerId, data))
      setNotice(item.kind === 'event' && item.recurringEventId ? 'Esta ocurrencia se actualizó.' : 'Horario actualizado.')
    } catch { /* hook preserves error and exact request for retry */ }
  }

  const changeCronRange = useCallback((next:{from:string;to:string})=>{
    setRange(current=>current.from===next.from&&current.to===next.to?current:next)
    setAnchor(parseISO(next.from))
  },[])
  function navigate(delta: number) {
    // La Semana desliza su riel siete días (la ventana sigue siendo de 3 · 4 · 7); la lectura la sigue sola.
    if (mode === 'week') { deslizarSemana(7 * Math.sign(delta)); return }
    // Hábitos es la historia entera de una vez: no hay periodo anterior ni siguiente.
    if (mode === 'habits') return
    // En el Día no hay escena que entre: el carril desliza la hoja (Carril.tsx).
    if (mode !== 'day') setMov(delta > 0 ? 'der' : 'izq')
    if (mode === 'year') { const next = addYears(anchor, delta); initialDate.current = next; setAnchor(next); return }
    delta < 0 ? calendar.current?.getApi().prev() : calendar.current?.getApi().next()
  }

  function irAFecha(value: string) {
    if (!value) return
    const date = parseISO(value)
    initialDate.current = date
    if (mode === 'week') { setAnchor(date); realinear() }
    if (mode === 'crons') { setAnchor(date); setRange({ from: date.toISOString(), to: addDays(date, 7).toISOString() }) }
    else if (mode === 'year') setAnchor(date)
    else calendar.current?.getApi().gotoDate(date)
  }
  // Edición cliente (21 oct 2026): sin «Reporte diario/mensual» ni «Plan del mes» (son crons y documentos de la instalación original).
  // Calendario de otra persona (29 oct 2026): solo sus calendarios; los reportes, el plan y el Todoist son del dueño.
  const ajeno = Boolean(snapshot?.perfil)
  const accesos = EDICION_CLIENTE || ajeno ? [] : accesosDe(mode).filter(a => a.id !== 'plan' || onAbrirDocumento)
  const navegar = (url: string) => onNavegar ? onNavegar(url) : window.location.assign(url)
  const alcance = alcanceDeModo(mode)
  const zonaPlan = timeZone
  const ventana = useMemo(() => alcance ? ventanaDelPeriodo(alcance, dayKey(anchor), range) : null, [alcance, anchor, range])
  const tareasPeriodo = useMemo(() => ventana ? tareasDelPeriodo(visibleTasks, ventana.desde, ventana.hasta, zonaPlan) : [], [ventana, visibleTasks, zonaPlan])
  async function irAcceso(a: Acceso) {
    if (a.id === 'reporte') {
      try {
        // El reporte de ESTE periodo, también de días pasados (v3, 10 oct 2026; features/planning/reporte-por-fecha.ts).
        const r = await fetch(`/api/cabina/reporte/abrir?job=${a.job}${alcance ? `&alcance=${alcance}&fecha=${dayKey(anchor)}` : ''}&json=1`)
        const { url } = await r.json() as { url?: string }
        if (!r.ok || !url) throw new Error('sin reporte')
        navegar(url)
      } catch { setNotice(`No hay ${a.etiqueta.toLowerCase()} guardado de ${titulo}${alcance === 'mes' ? ': el de cada mes llega el día 1 del siguiente' : ''}.`) }
    } else if (a.id === 'plan' && onAbrirDocumento) {
      const plan = planDelMes(anchor)
      try {
        const r = await fetch(`/api/cabina/documento?ruta=${encodeURIComponent(plan.ruta)}`)
        if (!r.ok) throw new Error('sin plan')
        onAbrirDocumento(plan.ruta, plan.titulo)
      } catch { setNotice(`Aún no hay un plan de ${plan.mes}.`) }
    }
  }
  const titulo = mode === 'crons' ? `${format(parseISO(range.from), "d MMM", { locale: es })} – ${format(new Date(Date.parse(range.to)-1), "d MMM yyyy", { locale: es })}` : tituloAngosto(mode, mode === 'month' ? fechaMes : anchor, range)
  const vistaActual = MODES.find(m => m.id === mode)?.label ?? ''
  // Lo que las cuatro hojas vivas reciben igual: mismas plumas (commit con ⌘Z), mismos filtros, mismo editor.
  const comunes = { goals: { data: goalsLeidos.data, error: goalsLeidos.error }, snapshot: snapshot ?? null, eventos: presentedEvents, visible: visibleSemanaDia, color: colorEvento,
    // Completar no espera a nadie (5 oct 2026): la fila de escrituras las serializa y un envío sin confirmar se reenvía solo.
    cargando: loading, ocupado: !snapshot, todoistCaido: !ajeno && Boolean(snapshot) && snapshot!.health.find(h => h.id === 'todoist')?.state !== 'fresh',
    onModo: undefined, onConversar, donde, leyenda: leyendaVista,
    onAbrir: (item: PlanItem) => setSelection({ item }), onCompletar: (t: PlanTask) => snapshot ? commit(mutationFor(t, snapshot.ownerId, {}, 'complete')) : Promise.reject(new Error('Sin lectura')),
    onNueva: () => setSelection({ kind: 'task', allDay: true }), onObjetivo: (ev: PlanEvent, cumplido: boolean) => marcarObjetivo(ev, cumplido) }

  // La estrella del objetivo del día: `✓` al inicio del título del evento «Objetivo del dia», por la misma pluma (con ⌘Z).
  const marcarObjetivo = (ev: PlanEvent, cumplido: boolean) => snapshot ? commit(mutationFor(ev, snapshot.ownerId, { ...eventData(ev), title: conMarca(ev.title, cumplido) })) : Promise.reject(new Error('Sin lectura'))
  // Las casillas del objetivo del día cuando viven en la descripción de su tarea o evento (10 oct 2026): misma pluma, con ⌘Z.
  const escribirDescripcion = (item: PlanItem, description: string) => !snapshot ? Promise.reject(new Error('Sin lectura'))
    : commit(mutationFor(item, snapshot.ownerId, item.kind === 'event' ? { ...eventData(item), description } : { title: item.title, description }))
  // La rejilla de la Semana mueve y estira por el guardián del autoguardado: se ve al instante, se escribe por la misma pluma
  // (commit con ⌘Z) y, si Google no confirma, el bloque vuelve a su hora y el aviso lo dice con «Reintentar».
  const moverEnRejilla = async (item: PlanItem, inicio: Date, fin: Date) => {
    if (item.kind === 'event' && !item.editable) return
    auto.editar({ item, data: datosDeMovimiento(item, inicio, fin) })
    if (await auto.vaciar(item.id)) {
      setNotice(`${item.kind === 'event' && item.recurringEventId ? 'Esta ocurrencia' : `«${item.title}»`} quedó el ${format(inicio, "EEEE d 'a las' HH:mm", { locale: es })}.`)
      setNoticeUndo(true)
    }
  }
  const tramoSemana = useMemo(() => ({ desde: ajustes.desde, hasta: ajustes.hasta }), [ajustes.desde, ajustes.hasta])
  const crearEnRejilla = (inicio: Date, fin: Date) => setSelection({ start: inicio, end: fin, allDay: false, freshRange: true })
  // El carril cambió de día: el calendario lo sigue sin escena (barra, URL, lectura y rejilla).
  const irDia = useCallback((f: Date) => { initialDate.current = f; calendar.current?.getApi().gotoDate(f) }, [])
  // La Semana dice el rango que se ve de verdad («8 – 14 oct»), no la semana de calendario donde cae (ni la de FullCalendar).
  const inicioVisible = ventanaSemana.inicio ?? inicioDeVentana(dayKey(anchor), dayKey(new Date()), ventanaSemana.n, ajustes.finDeSemana)
  const visibles = diasVisibles(inicioVisible, ventanaSemana.n, ajustes.finDeSemana)
  const hoyClave = dayKey(new Date())
  const enHoy = mode === 'week' ? visibles.includes(hoyClave)
    : Date.now() >= Date.parse(range.from) && Date.now() < Date.parse(range.to) && mode !== 'year' && mode !== 'crons'
  const tituloBarra = mode === 'week' ? tituloVentana(visibles[0], visibles.length, undefined, visibles.at(-1)) : mode === 'habits' ? 'Hábitos' : compacto || mode === 'crons' || mode === 'year' || mode === 'month' ? titulo : mode === 'day' ? format(anchor, "EEEE d 'de' MMMM", { locale: es }) : title
  // Lo que el engrane muestra como «días a la vista»: lo elegido o, si no, lo que se ve (sin fines de semana, 5 columnas son 7 días).
  const diasActual = ventanaSemana.n

  return <PulsoHoy.Provider value={pulsoHoy}><GobiernoCtx.Provider value={gobierno}><div ref={raiz} className={styles.root} style={{ '--plan-pegado': `${altoBarra}px` } as CSSProperties} data-planning-calendar data-donde={donde} data-dos-columnas={dosColumnasVista ? mode : undefined} data-mes-piedras={mode === 'month' && !compacto ? '' : undefined} data-unificada={alcance ? '' : undefined} data-ventana={mode === 'week' ? `${ventanaSemana.inicio ?? '-'}:${ventanaSemana.n}` : undefined} tabIndex={donde === 'panel' ? -1 : undefined}>
    <h1 className={styles.srOnly}>Calendario</h1>
    {/* UNA fila (5 oct 2026, «los botones deben ser súper sutiles, que ocupen el menor espacio»): Hoy · ‹ › · fecha ▾ · D 4 S M · +.
        La fecha abre lo demás: ir a fecha, Año · Agenda · Rutinas, calendarios, panel de tareas, atajos y actualizar. */}
    <div ref={barraRef} className={styles.barra} data-ancho={compacto ? undefined : ''}>
      <button className={styles.today} data-en-hoy={enHoy || undefined} onClick={goToday} title="Ir a hoy y a la hora actual (T)">Hoy</button>
      <button className={styles.iconButton} aria-label="Período anterior" onClick={() => navigate(-1)}><ChevronLeft size={17} /></button><button className={styles.iconButton} aria-label="Período siguiente" onClick={() => navigate(1)}><ChevronRight size={17} /></button>
      <span data-more-menu className={styles.vistaWrap}>
        <button className={styles.vistaTitulo} aria-haspopup="menu" aria-expanded={moreOpen} aria-label={`${tituloBarra}: ir a fecha y más vistas (${vistaActual})`} onClick={() => setMoreOpen(v => !v)}><span>{tituloBarra}</span><ChevronDown size={13} aria-hidden /></button>
        {moreOpen && <div className={styles.vistaMenu} role="menu">
          <div className={styles.vistaPie} data-arriba>
            <label>Ir a fecha<input aria-label="Ir a fecha" type="date" value={dayKey(anchor)} onChange={e => { irAFecha(e.target.value); setMoreOpen(false) }} /></label>
          </div>
          <div className={styles.vistaLista} role="group" aria-label="Más vistas">{MODOS_CALENDARIO.filter(m => !ESCALAS_BARRA.includes(m.id)).map(m => <button role="menuitemradio" aria-checked={mode === m.id} key={m.id} onClick={() => { escala(m.id); setMoreOpen(false) }}>{m.label}{mode === m.id ? <Check size={14} aria-hidden /> : <kbd aria-hidden>{TECLA[m.id]}</kbd>}</button>)}</div>
        </div>}
      </span>
      <div className={styles.escala} role="tablist" aria-label="Escala del calendario">{ESCALAS_BARRA.map(m => { const def = MODES.find(x => x.id === m)!
        return <button key={m} role="tab" aria-label={def.label} aria-selected={mode === m} aria-keyshortcuts={TECLA[m]} title={mode === m ? `${def.label}: ir a hoy` : `${def.label} (${TECLA[m]})`} onClick={() => accionDeEscala(mode, m) === 'hoy' ? goToday() : escala(m)}>{LETRA[m]}</button> })}</div>
      {mode !== 'crons' && <button className={styles.iconButton} aria-label="Evento nuevo" title="Nuevo (N)" disabled={!snapshot} onClick={() => setSelection({ start: new Date() })}><Plus size={17} /></button>}
      {/* Un solo engrane (10 oct 2026), la misma hoja en Día, Semana y Mes: días, Enfoque, cómo se ve cada escala, horas, calendarios, categorías. */}
      <Engrane ajustes={ajustes} poner={poner} diasActual={diasActual} leyenda={leyenda} matriz={<LeyendaDrip enBarra />} drip={{ ocultas: ocultosDrip, alternar: alternarDrip, tarifa: drip.doc?.tarifa ?? null, propia: drip.doc?.tarifaPropia ?? false, bloquesPerfectos: drip.doc?.semana?.bloques.length ?? 0, poner: (m, mon) => drip.cambiar({ accion: 'tarifa', monto: m, moneda: mon }) }} acciones={{
        onFiltros: mode !== 'crons' ? () => setFilterOpen(v => !v) : undefined,
        tareas: !compacto && !isOwnSurface(mode) ? { abierto: tasksOpen, alternar: () => setTasksOpen(v => !v) } : undefined,
        onAtajos: !compacto ? () => setHelpOpen(true) : undefined,
        onActualizar: () => { if (mode === 'crons') setCronReload(n => n + 1); else if (mode === 'year') void yearEvents.reload(); else void refresh() },
        actualizando: mode !== 'crons' && (mode === 'year' ? yearEvents.loading : loading) }} />
      {helpOpen && <div className={styles.shortcutHelp} role="dialog" aria-label="Atajos del calendario"><h3>ATAJOS DEL CALENDARIO<button className={styles.iconButton} aria-label="Cerrar atajos" onClick={() => setHelpOpen(false)}><X size={13} /></button></h3>{CALENDAR_SHORTCUTS.map(a => <div key={a.accion}><span>{a.accion}</span><span>{a.teclas.map(k => <kbd key={k}>{k}</kbd>)}</span></div>)}</div>}
      <span className={styles.srOnly} role="status">{saving ? 'Guardando' : loading ? 'Actualizando' : readError ? 'Sin conexión' : snapshot?.health.some(h => h.state !== 'fresh') ? 'Lectura parcial' : snapshot ? 'Al día' : 'Conectando'}</span>
    </div>
    {filterOpen && mode !== 'crons' && <div className={styles.filters}>
      <div className={styles.sourceFilters}><strong>Calendarios</strong>{snapshot?.sources.filter(s => !s.objective).map(s => <label key={s.id}><input type="checkbox" checked={enabled.has(s.id)} onChange={() => { const next = new Set(enabled); next.has(s.id) ? next.delete(s.id) : next.add(s.id); setSources([...next]) }} />{s.title}</label>)}</div>
      <label>Proyecto<select aria-label="Proyecto" value={project} onChange={e => setProject(e.target.value)}><option value="">Todos</option>{snapshot?.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
      <label>Prioridad<select aria-label="Prioridad" value={priority} onChange={e => setPriority(Number(e.target.value))}><option value={0}>Todas</option>{[1, 2, 3, 4].map(p => <option key={p} value={p}>P{p}</option>)}</select></label>
      <span className={styles.note}>{snapshot ? snapshot.tasks.length - visibleTasks.length : 0} tareas ocultas por filtros</span>
      <button className={styles.textButton} onClick={() => { setSources(null); setProject(''); setPriority(0) }}>Restablecer</button>
    </div>}
    {esViva(mode) ? <div ref={escena} key={claveEscena} className={vivas.escena} data-mov={mov ?? undefined}>{mode === 'day' ? <Carril fecha={anchor} clave={dayKey} mover={addDays} onIr={irDia} etiqueta="Días: desliza para cambiar de día"
      render={(f, central) => <DiaVivo fecha={f} central={central} {...comunes} rejilla={rejilla} onRejilla={alternarRejilla} onObjetivo={marcarObjetivo} guardarObjetivo={goalsLeidos.save} onDescripcion={escribirDescripcion} enfoque={ajustes.enfoque} plegado={plegado} dosColumnas={dosColumnas}
        onNueva={semilla => setSelection(semilla ?? { kind: 'task', allDay: true })} onReabrir={t => snapshot ? commit(mutationFor(t, snapshot.ownerId, {}, 'reopen')) : Promise.reject(new Error('Sin lectura'))}
        tareas={tareasDelDia(visibleTasks, dayKey(f), dayKey(new Date()), zonaPlan)} onDeshacer={() => void step('undo')} />} />
      : mode === 'month' ? <MesClaro fecha={fechaMes} eventos={eventosMes} programa={programa} onDia={dia => transicion(() => aplicarVista(dia, 'day'))} goals={comunes.goals} snapshot={comunes.snapshot} cargando={loading} angosto={compacto} cuadricula={rejilla} enfoque={ajustes.enfoque} plegado={plegado} dosColumnas={dosColumnasVista} guardarObjetivo={goalsLeidos.save}
        onConversar={onConversar} onSemana={lunes => transicion(() => aplicarVista(lunes, 'week'))} />
      : <SemanaClara fecha={anchor} ventana={ventanaSemana} onVentana={onVentana} {...comunes} guardarObjetivo={goalsLeidos.save} tareas={visibleTasks} zona={zonaPlan}
        vista={ajustes.vistaSemana} enfoque={ajustes.enfoque} plegado={plegado} dosColumnas={dosColumnas} diasVista={ajustes.dias} finDeSemana={ajustes.finDeSemana} tramo={tramoSemana} compacta={ajustes.densidad === 'compacta'} etiquetaZona={ajustes.zona ? zonaCorta() : null} semanaPerfecta={ajustes.semanaPerfecta} corteRutina={ajustes.rutinaFutura ? null : ahoraMinuto}
        onMover={snapshot && !pending ? (item, inicio, fin) => void moverEnRejilla(item, inicio, fin) : undefined}
        onEstirar={snapshot && !pending ? (item, fin) => { const ini = item.kind === 'event' ? parseISO(item.start) : item.due ? parseISO(item.due) : null; if (ini) void moverEnRejilla(item, ini, fin) } : undefined}
        onCrear={snapshot && !pending ? crearEnRejilla : undefined}
        onDia={dia => transicion(() => aplicarVista(dia, 'day'))} />}</div>
    : alcance && !ajeno && <PlanPeriodo alcance={alcance} fecha={dayKey(anchor)} tareas={tareasPeriodo} snapshot={snapshot ?? null} cargando={loading} ocupado={!snapshot} todoistCaido={Boolean(snapshot) && snapshot!.health.find(h => h.id === 'todoist')?.state !== 'fresh'}
      modo={mode} onModo={undefined} onConversar={onConversar}
      onAbrirTarea={t => setSelection({ item: t })} onCompletar={t => snapshot && void commit(mutationFor(t, snapshot.ownerId, {}, 'complete')).catch(() => {})} onNueva={() => setSelection({ kind: 'task', allDay: true })} />}
    {!isOwnSurface(mode) && (error || (pending && !saving) || snapshot?.health.some(h => h.state !== 'fresh')) && <div className={styles.banner} role="status"><span>{error ?? (pending ? 'Hay un envío pendiente de confirmar. Su borrador está guardado.' : (snapshot?.health.find(h => h.id === 'calendario-json' && h.state !== 'fresh')?.message ?? 'Algunas fuentes no respondieron. Se conserva la última lectura disponible.'))}</span>{pending && <button disabled={saving} onClick={() => void mutate(pending).catch(() => {})}>Reintentar envío</button>}{!pending && <button onClick={() => void refresh()}>Reintentar lectura</button>}</div>}
    {fallo && <div className={styles.notice} role="alert" data-hoja-ignora data-fallo><X size={14} /> {fallo.texto}<button className={styles.noticeUndo} onClick={() => { const f = fallo; setFallo(null); f.reintentar() }}>Reintentar</button><button className={styles.noticeUndo} aria-label="Cerrar aviso" onClick={() => setFallo(null)}><X size={12} /></button></div>}
    {mode !== 'crons' && notice && (noticeUndo ? <div className={styles.notice} role="status" data-hoja-ignora><Check size={14} /> {notice}<button className={styles.noticeUndo} onClick={() => { setNotice(null); void step('undo') }}>Deshacer</button></div>
      : <button className={styles.notice} onClick={() => setNotice(null)}><Check size={14} /> {notice}</button>)}
    <div className={styles.workspace} data-oculta={rejillaOculta || undefined} inert={rejillaOculta || undefined}>
      <main ref={calendarPane} className={styles.calendarPane} data-mode={mode} data-lista={compacto && diaMes ? '' : undefined}>
        <div ref={calendarGeometry} className={styles.calendarGeometry}>{mode === 'habits' ? <HabitosTiempo donde={donde} /> : mode === 'crons' ? <CronsView range={range} onRangeChange={changeCronRange} calendarRef={calendar} reloadKey={cronReload}/> : mode === 'year' ? <YearView year={anchor.getFullYear()} events={yearVisible} today={dayKey(new Date())} loading={yearEvents.loading} failed={yearEvents.failed} onPick={pickDay} onRetry={() => void yearEvents.reload()} /> : <FullCalendar ref={calendar} plugins={PLUGINS} locale={esLocale} locales={LOCALES} initialDate={initialDate.current} initialView={vistaFC(mode) ?? 'timeGridWeek'}
          views={VIEWS} headerToolbar={false} height="100%" timeZone="local" firstDay={1}
          dayHeaderContent={arg => esMesFC(arg.view.type) ? compacto ? <span className={styles.diaInicial}>{DIAS_INICIAL[arg.dow]}</span> : <span>{arg.text}</span> : compacto ? <span className={styles.diaApilado}><small>{format(arg.date, 'EEE', { locale: es }).replace('.', '')}</small><strong>{format(arg.date, 'd')}</strong></span> : <span>{format(arg.date, 'EEE', { locale: es })} {!esMesFC(arg.view.type) && <strong>{format(arg.date, 'd')}</strong>}</span>}
          dayCellContent={arg => { if (compacto && esMesFC(arg.view.type)) return <span className={styles.celdaMes}><b>{arg.date.getDate()}</b></span>
            const marcas = mode === 'month' && esMesFC(arg.view.type) ? marcasPorDia.get(dayKey(arg.date)) : undefined
            return marcas ? <>{marcas.map(e => <span key={e.id} className={styles.marcaDia} title={e.title} onClick={ev => { ev.preventDefault(); ev.stopPropagation(); setSelection({ item: e }) }}>{e.title}</span>)}<span>{arg.dayNumberText}</span></> : arg.dayNumberText }}
          weekNumbers={mode === 'month' && dosColumnas && Boolean(programa)} weekNumberContent={arg => semanaDelPrograma(dayKey(arg.date), programa) ?? ''}
          dayCellClassNames={arg => esMesFC(arg.view.type) && diaMes && dayKey(arg.date) === dayKey(diaMes) ? [styles.diaElegido] : []}
          nowIndicator allDaySlot={!compacto || eventInputs.some(e => e.allDay && Date.parse(String(e.start)) < Date.parse(range.to) && Date.parse(String(e.end ?? e.start)) > Date.parse(range.from))} allDayText="Sin hora" slotMinTime="00:00:00" slotMaxTime="24:00:00" scrollTime="06:00:00" scrollTimeReset={false}
          nowIndicatorContent={arg => arg.isAxis ? <span className={styles.nowTime}>{format(arg.date, 'HH:mm')}</span> : null}
          slotDuration="00:30:00" snapDuration="00:15:00" slotLabelFormat={compacto ? { hour: 'numeric', hour12: false } : { hour: 'numeric', minute: '2-digit', hour12: false }} eventTimeFormat={{ hour: 'numeric', minute: '2-digit', hour12: false }}
          events={eventInputs} datesSet={onDates} dayMaxEvents={compacto || (dosColumnas && mode === 'month') ? true : 3} eventOrder={esMesFC(vistaMes) && mode === 'month' ? 'peso,start,-duration,title' : 'start,-duration,allDay,title'} eventDisplay={compacto ? 'block' : 'auto'} fixedWeekCount={!compacto && !dosColumnas} moreLinkContent={arg => `+${arg.num}`} moreLinkClick={arg => { if (compacto) setDiaMes(arg.date); else return 'popover' }} dateClick={arg => { if (compacto && esMesFC(arg.view.type)) setDiaMes(arg.date) }} eventMinHeight={0} eventShortHeight={32} selectMinDistance={6} expandRows stickyHeaderDates weekends={mode !== 'month' || ajustes.finDeSemana}
          selectable={Boolean(snapshot) && !pending && !saving} selectMirror editable={Boolean(snapshot) && !pending && !saving} droppable={!pending && !saving}
          select={arg => { if (compacto && esMesFC(arg.view.type)) { setDiaMes(arg.start); calendar.current?.getApi().unselect(); return } setSelection({ start: arg.start, end: arg.end, allDay: arg.allDay, freshRange: true }); calendar.current?.getApi().unselect() }}
          eventClick={arg => { const item = items.get(arg.event.id); if (item) setSelection({ item }) }}
          eventDrop={arg => { const { id, start, end, allDay } = arg.event; arg.revert(); if (start) void reprogram(id, start, end, allDay) }}
          eventResize={arg => { const { id, start, end, allDay } = arg.event; arg.revert(); if (start) void reprogram(id, start, end, allDay) }}
          eventReceive={arg => { const { id, start, end, allDay } = arg.event; arg.revert(); if (start) void reprogram(id, start, end, allDay) }}
          eventDidMount={arg => { arg.el.title = arg.event.title; if (arg.event.extendedProps.peso !== undefined) arg.el.dataset.peso = String(arg.event.extendedProps.peso); if (arg.event.extendedProps.piedra) arg.el.dataset.piedra = String(arg.event.extendedProps.piedra); arg.el.dataset.planningId = arg.event.id; arg.el.setAttribute('aria-label', arg.event.title); const color = arg.event.extendedProps.color; if (arg.event.extendedProps.kind === 'event') { const c = typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : null; if (c) arg.el.style.setProperty('--plan-event-color', c); for (const [k, v] of Object.entries(estiloEvento(c))) arg.el.style.setProperty(k, v); arg.el.classList.add('ev-color') } }}
          eventContent={arg => {
            // Mes angosto: chip de una línea, solo el título (el color ya dice el calendario); la hora y el resto, en la lista del día.
            if (compacto && esMesFC(arg.view.type)) return <span className={styles.chip}>{arg.event.title}</span>
            // Cuadrícula del Mes, ancha o no (24 oct 2026, Preloaded Year; 25 oct, también la del engrane): cada piedra en UNA línea, solo su título (la hora vive en la Semana y
            // en el detalle; el título entero, al pasar el cursor). Caben las del día sin «+N» de más.
            if (mode === 'month' && esMesFC(arg.view.type)) return <span className={styles.piedra}>{!arg.event.allDay && arg.timeText && <time>{arg.timeText}</time>}<span>{arg.event.allDay ? arg.event.title : sinEmojiInicial(arg.event.title)}</span>{arg.event.extendedProps.protegido && <Lock size={9} aria-label="protegido" />}</span>
            const minutes = arg.event.start && arg.event.end ? (arg.event.end.getTime() - arg.event.start.getTime()) / 60_000 : 60
            const compact = !arg.event.allDay && minutes <= 30 && !arg.view.type.startsWith('list') && arg.view.type !== 'rollingAgenda'
            return <div className={`${styles.eventContent} ${compact ? styles.eventCompact : ''}`}><div className={styles.eventMeta}>{arg.event.extendedProps.kind === 'task' ? <Circle size={10} /> : null}{arg.timeText && <span>{arg.timeText}</span>}{arg.event.extendedProps.recurring && <Repeat2 size={10} />}</div><strong>{arg.event.title}</strong></div>
          }}
          noEventsContent="No hay elementos en este período." />}</div>
        {mode === 'month' && compacto && diaMes && <section className={styles.monthAgenda} aria-label={`Agenda del ${format(monthDay, "d 'de' MMMM", { locale: es })}`}>
          <header><h2>{format(monthDay, "EEEE d 'de' MMMM", { locale: es })}</h2>{dayKey(monthDay) === dayKey(new Date()) && <span>hoy</span>}
            <button className={styles.iconButton} aria-label="Cerrar la lista del día" onClick={() => setDiaMes(null)}><X size={16} /></button><button className={styles.iconButton} aria-label="Evento nuevo este día" disabled={!snapshot || Boolean(pending)} onClick={() => setSelection({ start: startOfDay(monthDay), end: addDays(startOfDay(monthDay), 1), allDay: true, freshRange: true })}><Plus size={17} /></button></header>
          {dayItems.length === 0 ? <p className={styles.empty}>Nada este día.</p> : <ul>{dayItems.map(d => <li key={d.item.id}><button onClick={() => setSelection({ item: d.item })}>
            <i style={{ background: d.item.kind === 'task' ? undefined : d.color ?? undefined }} data-task={d.item.kind === 'task' ? '' : undefined} data-p1={d.item.kind === 'task' && d.item.priority === 1 ? '' : undefined} aria-hidden />
            <span><b>{d.item.title}</b><small>{d.time}{d.item.kind === 'event' && d.item.recurringEventId ? ' · se repite' : ''}</small></span></button></li>)}</ul>}
        </section>}
        {loading && !snapshot && !isOwnSurface(mode) && <div className={styles.loadingOverlay}><Loader2 className={styles.spin} size={20} /><span>Conectando tu agenda y tus tareas…</span></div>}
      </main>
      {tasksOpen && !compacto && !isOwnSurface(mode) && <aside className={styles.taskRail}>
        <header><div><span className={styles.eyebrow}>TODOIST</span><h2>Por hacer</h2></div><button className={styles.iconButton} aria-label="Crear tarea" onClick={() => setSelection({ kind: 'task', allDay: true })} disabled={!snapshot || Boolean(pending)}><Plus size={17} /></button></header>
        <p className={styles.railHint}>Arrastra a tu agenda para darle hora.</p>
        <button className={styles.textButton} style={{ alignSelf: 'flex-start', margin: '0 14px 12px' }} onClick={() => setShowUnscheduled(v => !v)} aria-pressed={showUnscheduled}>{showUnscheduled ? 'Ocultar sin fecha' : 'Añadir sin fecha'} · {visibleTasks.filter(t => !t.due).length}</button>
        <div className={styles.taskList} ref={rail}>{railTasks.map(t => <div className={styles.taskCard} data-plan-task={t.id} data-priority={t.priority} key={t.id}>
          <button className={styles.taskCheck} aria-label={`Completar ${t.title}`} onClick={() => snapshot && void commit(mutationFor(t, snapshot.ownerId, {}, 'complete')).catch(() => {})}><Circle size={16} /></button>
          <button className={styles.taskBody} onClick={() => setSelection({ item: t })}><strong>{t.title}</strong><span>{snapshot?.projects.find(p => p.id === t.projectId)?.title ?? 'Bandeja de entrada'}</span><small>{t.due ? format(new Date(t.due.includes('T') ? t.due : t.due + 'T12:00:00'), hasTime(t.due) ? "d MMM · HH:mm" : 'd MMM', { locale: es }) : 'Sin fecha'}{t.recurring && ' · Recurrente'}</small></button>
        </div>)}</div>
        {!loading && snapshot && railTasks.length === 0 && <p className={styles.empty}>{snapshot.health.find(h => h.id === 'todoist')?.state !== 'fresh' ? 'No se pudo leer Todoist.' : 'No hay tareas en esta selección.'}</p>}
        <footer><span>{railTasks.length} en esta selección</span><span>{timeZone.split('/').at(-1)?.replaceAll('_', ' ')}</span></footer>
      </aside>}
    </div>
    {(accesos.length > 0 || (esViva(mode) && !ajeno)) && <nav className={styles.accesos} aria-label="Reporte de este periodo">{accesos.map(a => <button key={a.id} data-acceso={a.id} onClick={() => void irAcceso(a)}>{a.id === 'reporte' ? <Newspaper size={14} aria-hidden /> : <ScrollText size={14} aria-hidden />}<span>{a.etiqueta}</span></button>)}
      {/* La revisión del domingo (24 oct 2026): plan contra real de la semana, como el circuito; abierta sola los domingos. */}
      {esViva(mode) && !ajeno && <button data-acceso="domingo" onClick={() => setDomingo(lunesDe(dayKey(mode === 'week' ? parseISO(inicioVisible) : anchor)))}><CalendarCheck2 size={14} aria-hidden /><span>Revisión del domingo</span></button>}</nav>}
    {domingo && !ajeno && <Domingo lunes={domingo} bloques={bloquesDrip} goals={goalsLeidos.data} snapshot={snapshot ?? null} doc={drip.doc} ahora={Date.now()} tomarFoto={tomarFoto} pluma={Boolean(snapshot)} ponerTarifa={(m, mon) => drip.cambiar({ accion: 'tarifa', monto: m, moneda: mon })}
      rutinasPlegadas={(() => { const l = parseISO(domingo).getTime(), f = addDays(parseISO(domingo), 7).getTime(); return presentedEvents.filter(e => fueraMes.has(e.id) && Date.parse(e.start) >= l && Date.parse(e.start) < f).length })()}
      aplicar={aplicarPropuesta} deshacer={() => void step('undo')} onCerrar={() => setDomingo(null)} onLunes={d => setDomingo(x => x ? dayKey(addDays(parseISO(x), d)) : x)} />}
    {selection && snapshot && <PlanEditor key={selection.item?.id ?? `new:${selection.start?.getTime() ?? 'capture'}:${selection.end?.getTime() ?? ''}`} selection={selection} snapshot={snapshot} saving={saving} unresolved={Boolean(pending) && !saving && !(pending?.action === 'update' && pending.externalId === selection.item?.externalId)} auto={auto}
      onSave={commit} onRetry={() => pending ? mutate(pending) : Promise.resolve()} onUndo={() => step('undo')} onAbrir={setSelection} onConversar={onConversar}
      onAviso={(texto, deshacer) => { setNotice(texto); setNoticeUndo(Boolean(deshacer)) }}
      // La hoja DRIP ya no se monta en el evento (30 oct 2026, pedido del dueño: que se vea normal); HojaDrip.tsx queda para reactivarla.
      acento={selection.item?.kind === 'event' ? colorEvento(selection.item) : null}
      // La hoja cierra guardando (puede tardar): si mientras tanto se abrió otra, no se cierra la nueva.
      onClose={() => setSelection(s => s === selection ? null : s)} />}
  </div></GobiernoCtx.Provider></PulsoHoy.Provider>
}
