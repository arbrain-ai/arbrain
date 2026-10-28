'use client'
/**
 * La Cabina en el hilo: las invocaciones de Levy (`mostrar` / `abrir`) se
 * vuelven vistas vivas y navegación dentro de la conversación.
 *
 * Rendimiento (pedido de Daniel, le preocupa saturar el frontend):
 *  - se persiste la INVOCACIÓN, no el HTML (vive en toolInputs del mensaje);
 *  - una vista monta su componente solo mientras está a la vista y lo desmonta
 *    al salir, conservando su alto para que el scroll no salte;
 *  - solo las últimas N vistas del hilo están activas; las viejas quedan como
 *    un resumen estático que se reactiva al tocarlo;
 *  - cero iframes: componentes nativos que comparten una lectura por fuente.
 */
import { Component, createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, BookOpen, Bookmark, BookmarkCheck, CalendarDays, Clapperboard, Gauge, Inbox, Loader2, Maximize2, Target, TerminalSquare, Wallet, Shapes, X, Navigation, ChevronRight, Pin, PinOff, FileText, Repeat, Server, BrainCircuit, Network, Sun, Activity, Presentation, GraduationCap, FolderTree, UsersRound, House, Dog, History } from 'lucide-react'
import type { ChatMessage } from '@/features/chat/hooks/useChat'
import { type Invocacion, type MostrarInput, type AbrirInput, invocacionesDe, sinEcoDeDelegar, rutaDe, seccionDe, resumen, NOMBRE, abrirEsVivo, abrirEjecutado, hoyCivil, tituloPeriodo, nombreDocumento } from './model'
import { lecturaEnCache } from './datos'
import { VistaCalendario, urlCalendario, resumenCalendario } from './vistas/Calendario'
import { VistaObjetivos, URL_OBJETIVOS, resumenObjetivos } from './vistas/Objetivos'
import { VistaLienzo } from './vistas/Lienzo'
import { VistaReporte, urlReporte, resumenReporte } from './vistas/Reporte'
import { VistaNegocio, urlNegocio, resumenNegocio } from './vistas/Negocio'
import { VistaTrabajos, urlTrabajos, resumenTrabajos } from './vistas/Trabajos'
import { VistaRutinas, urlRutinas, resumenRutinas } from './vistas/Rutinas'
import { VistaServidores, URL_SERVIDORES, resumenServidores } from './vistas/Servidores'
import { VistaMemoria, URL_MEMORIA, resumenMemoria } from './vistas/Memoria'
import { VistaEquipo, URL_EQUIPO } from './vistas/Equipo'
import { resumenEquipo, type FotoEquipo } from './vistas/equipo-modelo'
import { VistaFinanzas, URL_FINANZAS, resumenFinanzas } from './vistas/Finanzas'
import { VistaRutinasViva } from '@/features/rutinas/RutinasViva'
import { ContentWorkspace } from '@/features/clarity/ContentWorkspace'
import { VistaContenido, URL_CONTENIDO, resumenContenido } from './vistas/Contenido'
import { VistaDocumento } from './vistas/Documento'
import { VistaSalud, URL_SALUD, resumenSalud } from './vistas/Salud'
import { VistaMasterclass } from './vistas/Masterclass'
import { VistaExplorador } from './vistas/Explorador'
import { VistaCohorte, URL_COHORTE, resumenCohorte } from './vistas/Cohorte'
import { VistaCasa, URL_CASA, resumenCasa } from '@/features/casa/PanelCasa'
import { VistaHistoria, URL_HISTORIA, resumenHistoria } from '@/features/historia/Historia'
import type { Historia as DatosHistoria } from '@/features/historia/modelo'
import dynamic from 'next/dynamic'
import type { EstadoCasa } from '@/features/casa/contrato'
import type { DatosCohorte } from '@/features/cohorte/modelo'
import { resumenMasterclass, URL_MASTERCLASS, type LecturaMasterclass } from '@/features/masterclass/modelo'
import { VistaPizarron } from '@/features/pizarron/VistaPizarron'
import type { DatosSalud } from '@/features/salud/modelo'
import { VistaDiario, urlDiario, resumenDiario, type DatosDueno, type DatosSegunda } from './vistas/Diario'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import { pantallaCompletaDisponible, verEnPantallaCompleta } from './panel/PantallaCompleta'
import { vistaDeDestino } from './panel/pantalla-completa'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { usePanelFijadas, fijadaDe, useFuera, EN_TALLER } from './panel/fijadas'
import { mostrarPanel } from './panel/ventanas'
import { resolverDestino } from './panel/bus'
import { PRINCIPAL } from './panel/pestanas-fuera'
import { useRecientesStore } from '../chat/stores/recientes-store'
import s from './cabina.module.css'
import l from './luz.module.css'

// El perro (cámara, 3D) solo carga al pedirse: Cabina viaja en el layout de toda la app.
const VistaPerro = dynamic(() => import('@/features/perro/VistaPerro').then(m => m.VistaPerro), { ssr: false })

/** Cuántas vistas del hilo quedan vivas (las más recientes). */
export const VISTAS_ACTIVAS = 3

const CabinaCtx = createContext<{ activas: ReadonlySet<string>; sinOptimizar?: boolean } | null>(null)

/** Calcula, para todo el hilo, qué invocaciones `mostrar` siguen activas. */
/** `sinOptimizar` existe SOLO para medir contra el caso ingenuo (todo montado siempre). */
export function CabinaProvider({ messages, children, sinOptimizar }: { messages: ChatMessage[]; children: ReactNode; sinOptimizar?: boolean }) {
  const firma = useMemo(() => messages.map(m => (m.toolCalls ?? []).map(t => t.toolName.includes('cabina') ? t.toolId : '').join('')).join('|'), [messages])
  const activas = useMemo(() => {
    // Activas: TODAS las del último mensaje que mostró algo (un plan de 4 vistas
    // se ve completo) más las VISTAS_ACTIVAS más recientes del hilo.
    const ids: string[] = []; let ultimo: string[] = []
    const ordenados = [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    for (const m of ordenados) {
      const propias = invocacionesDe(m).filter(i => i.verbo === 'mostrar').map(i => i.toolId)
      if (propias.length) { ids.push(...propias); ultimo = propias }
    }
    return new Set([...ids.slice(-VISTAS_ACTIVAS), ...ultimo])
  }, [firma]) // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo(() => ({ activas, sinOptimizar }), [activas, sinOptimizar])
  return <CabinaCtx.Provider value={value}>{children}</CabinaCtx.Provider>
}

export const ICONO = { calendario: CalendarDays, objetivos: Target, centro: Gauge, lienzo: Shapes, reporte: Inbox, negocio: BookOpen, trabajos: TerminalSquare, finanzas: Wallet, contenido: Clapperboard, rutinas: Repeat, servidores: Server, memoria: BrainCircuit, equipo: Network, documento: FileText, diario: Sun, salud: Activity, pizarron: Presentation, masterclass: GraduationCap, explorador: FolderTree, cohorte: UsersRound, casa: House, perro: Dog, historia: History }

/** Una vista que falla se queda en SU tarjeta: nunca tumba el hilo. */
class Aislada extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : 'Error desconocido' } }
  componentDidCatch(e: unknown) { console.error('[cabina] la vista falló', e) }
  render() { return this.state.error ? <p className={s.aviso}>Esta vista no se pudo pintar ({this.state.error}). La conversación sigue intacta; «Abrir completo» lleva a la sección.</p> : this.props.children }
}

export function Cuerpo(props: { input: MostrarInput; grande?: boolean }) { return <Aislada><CuerpoVista {...props} /></Aislada> }

function CuerpoVista({ input, grande }: { input: MostrarInput; grande?: boolean }) {
  switch (input.vista) {
    case 'calendario': return <VistaCalendario alcance={input.alcance} fecha={input.fecha} grande={grande} />
    case 'objetivos': return <VistaObjetivos alcance={input.alcance} fecha={input.fecha} grande={grande} />
    // «centro» queda por compatibilidad (6 oct 2026): Command Center se fue y abrirlo abre Finanzas · Lo que entra.
    case 'centro': return <VistaFinanzas grande={grande} />
    case 'lienzo': return <VistaLienzo paginaId={input.paginaId!} zona={input.zona} grande={grande} />
    case 'reporte': return <VistaReporte alcance={input.alcance} grande={grande} />
    case 'negocio': return <VistaNegocio seccion={input.seccion} grande={grande} />
    case 'trabajos': return <VistaTrabajos agenteId={input.agenteId} grande={grande} />
    case 'finanzas': return <VistaFinanzas grande={grande} />
    // En el panel y en «Ampliar», Contenido completo: producción, radar, resultados con ventas y comentarios (4 oct 2026).
    case 'contenido': return grande ? <ContentWorkspace donde="panel" /> : <VistaContenido />
    // En el panel y en «Ampliar», la sección completa (4 oct 2026); en el hilo, el resumen.
    case 'rutinas': return grande ? <VistaRutinasViva grande /> : <VistaRutinas />
    case 'servidores': return <VistaServidores grande={grande} />
    case 'memoria': return <VistaMemoria grande={grande} />
    case 'equipo': return <VistaEquipo grande={grande} />
    case 'documento': return <VistaDocumento input={input} grande={grande} />
    case 'diario': return <VistaDiario fecha={input.fecha} quien={input.quien} grande={grande} />
    case 'salud': return <VistaSalud grande={grande} />
    case 'masterclass': return <VistaMasterclass grande={grande} />
    // Cohorte (18 oct 2026): la venta y la entrega de la cohorte fundadora, en vivo de Polar y de la comunidad.
    case 'cohorte': return <VistaCohorte grande={grande} />
    // Casa (26 oct 2026): el perro y los dispositivos de la casa; la puerta a la casa 3D (/casa).
    case 'casa': return <VistaCasa grande={grande} modo={input.modo} repetir={input.repetir} />
    // Perro (27 oct 2026): el mando de /perro a lo ancho de la tarjeta; en el panel lo pinta CuerpoSeccion a lo alto de la pestaña.
    case 'perro': return <VistaPerro />
    // La historia de tu cerebro (27 oct 2026): qué cambió, quién y cuándo; carriles de agentes; volver con un clic.
    case 'historia': return <VistaHistoria grande={grande} />
    // Explorador de archivos (8 oct 2026): el árbol del repo; un clic abre el archivo en su pestaña de documento.
    case 'explorador': return <VistaExplorador grande={grande} />
    // El pizarrón (7 oct 2026): con paginaId, una sesión donde Levy enseña; sin él, la casa (sesiones y biblioteca).
    case 'pizarron': return <VistaPizarron sesion={input.paginaId} grande={grande} />
  }
}

function datoCache(input: MostrarInput): string | null {
  const f = input.fecha ?? hoyCivil()
  if (input.vista === 'calendario') return resumenCalendario(lecturaEnCache(urlCalendario(input.alcance ?? 'semana', f)), input.alcance ?? 'semana', f)
  if (input.vista === 'objetivos') return resumenObjetivos(lecturaEnCache(URL_OBJETIVOS), input.alcance ?? 'mes', f)
  if (input.vista === 'centro') return resumenFinanzas(lecturaEnCache(URL_FINANZAS))
  if (input.vista === 'reporte') return resumenReporte(lecturaEnCache(urlReporte(input.alcance)))
  if (input.vista === 'negocio') return resumenNegocio(lecturaEnCache(urlNegocio()))
  if (input.vista === 'trabajos') return resumenTrabajos(lecturaEnCache(urlTrabajos()))
  if (input.vista === 'finanzas') return resumenFinanzas(lecturaEnCache(URL_FINANZAS))
  if (input.vista === 'contenido') return resumenContenido(lecturaEnCache(URL_CONTENIDO))
  if (input.vista === 'rutinas') return resumenRutinas(lecturaEnCache(urlRutinas()))
  if (input.vista === 'servidores') return resumenServidores(lecturaEnCache(URL_SERVIDORES))
  if (input.vista === 'memoria') return resumenMemoria(lecturaEnCache(URL_MEMORIA))
  if (input.vista === 'equipo') return resumenEquipo(lecturaEnCache<FotoEquipo>(URL_EQUIPO))
  if (input.vista === 'salud') return resumenSalud(lecturaEnCache<DatosSalud>(URL_SALUD))
  if (input.vista === 'masterclass') return resumenMasterclass(lecturaEnCache<LecturaMasterclass>(URL_MASTERCLASS))
  if (input.vista === 'cohorte') return resumenCohorte(lecturaEnCache<DatosCohorte>(URL_COHORTE))
  if (input.vista === 'casa') return resumenCasa(lecturaEnCache<EstadoCasa>(URL_CASA) ?? null)
  if (input.vista === 'historia') return resumenHistoria(lecturaEnCache<DatosHistoria>(URL_HISTORIA))
  if (input.vista === 'diario') return resumenDiario(lecturaEnCache<DatosDueno | DatosSegunda>(urlDiario(input.quien, f)))
  return null
}

export function titulo(input: MostrarInput) {
  if (input.vista === 'documento') return nombreDocumento(input)
  if (input.titulo) return input.titulo
  const a = input.alcance ?? (input.vista === 'calendario' ? 'semana' : 'mes'), f = input.fecha ?? hoyCivil()
  if (input.vista === 'calendario' || input.vista === 'objetivos') return `${NOMBRE[input.vista]} · ${tituloPeriodo(a, f)}`
  if (input.vista === 'negocio' && input.seccion) return `${NOMBRE.negocio} · ${input.seccion}`
  return NOMBRE[input.vista]
}

/** Las vistas v2 traen su propio encabezado editorial (la fecha, la meta, la cifra):
 *  la cabecera de la tarjeta solo dice de dónde viene, sin repetir el título. */
const conHeroe = (i: MostrarInput) => ['calendario', 'objetivos', 'centro', 'finanzas', 'contenido', 'rutinas', 'servidores', 'memoria', 'equipo', 'diario', 'salud', 'masterclass', 'explorador', 'cohorte', 'casa', 'perro', 'historia'].includes(i.vista)

/** Monta el cuerpo solo mientras el marco está cerca del viewport (callback ref:
 *  se re-engancha cuando una vista colapsada se reactiva y aparece su nodo). */
function useALaVista(margen = '600px') {
  const [nodo, setNodo] = useState<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!nodo) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    // Montar es trabajo de render (un mes son ~40 celdas): va en una transición
    // interrumpible para no congelar el frame del scroll que la trajo a la vista.
    const io = new IntersectionObserver(([e]) => startTransition(() => setVisible(e.isIntersecting)), { rootMargin: margen })
    io.observe(nodo); return () => io.disconnect()
  }, [nodo, margen])
  return [setNodo, visible] as const
}

/** Recuerda el último alto real del cuerpo para reservarlo mientras duerme. */
function useAltoReservado() {
  const alto = useRef(0), ro = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect(); ro.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    ro.current = new ResizeObserver(([e]) => { if (e.contentRect.height > 40) alto.current = e.contentRect.height })
    ro.current.observe(el)
  }, [])
  return [ref, alto] as const
}

/** Guardar una vista en el archivero («+ › Guardadas»): mismo tamaño y lugar que Expandir, a su izquierda. */
export function GuardarVista({ guardada, ocupado, onAlternar }: { guardada: boolean; ocupado?: boolean; onAlternar: () => void }) {
  // Alterna en sitio (4 oct 2026): la vista no se cierra; guardada, el mismo botón la quita de «+ › Guardadas».
  const t = guardada ? 'Guardada en «+ › Guardadas» · clic para quitarla' : 'Guardar en «+ › Guardadas» (la vista sigue abierta)'
  return <button className={s.icono} data-guardada={guardada || undefined} onClick={onAlternar} disabled={ocupado} aria-busy={ocupado || undefined}
    title={t} aria-label={guardada ? 'Quitar de Guardadas' : 'Guardar'} aria-pressed={guardada}>
    {guardada ? <BookmarkCheck size={14} aria-hidden /> : <Bookmark size={14} aria-hidden />}
  </button>
}

/** En escritorio y dentro del shell, ir a una vista = su pestaña a pantalla completa con Levy a la mano (5 oct 2026). */
const enShell = () => pantallaCompletaDisponible() && !!document.querySelector('[data-shell-main]')

/** «Ir a X»: en escritorio, su pantalla completa (el chat sigue montado); en el teléfono, la sección (navegación de la app). */
export function AbrirCompleto({ input, compacto, alExpandir, enSeccion }: { input: MostrarInput; compacto?: boolean; alExpandir?: () => void; enSeccion?: boolean }) {
  const ruta = seccionDe(input)
  if (!ruta) return null
  const nombre = NOMBRE[input.vista]
  const contenido = compacto ? (enSeccion ? <ArrowUpRight size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />) : <>Ir a {nombre} <ArrowUpRight size={13} aria-hidden /></>
  // En el teléfono el panel es una hoja encima: se cierra para dejar ver la sección.
  const alIr = (e: React.MouseEvent) => {
    if (enShell()) { e.preventDefault(); verEnPantallaCompleta(input); return }
    alExpandir?.(); if (window.matchMedia('(max-width: 767px)').matches) useLayoutStore.getState().setPanelDerecho(false)
  }
  const props = { className: compacto ? s.icono : s.accion, title: enSeccion ? 'Abrir en su sección (la pestaña sigue abierta aquí)' : `${nombre} a pantalla completa (Levy sigue a la mano con ⌘J)`, 'aria-label': enSeccion ? `Abrir en ${nombre}` : `${nombre} a pantalla completa`, onClick: alIr }
  return <>
    {/* Una ruta de API (el reporte) no es página: se sigue con navegación completa. */}
    {ruta.startsWith('/api/') ? <a href={ruta} {...props}>{contenido}</a> : <Link href={ruta} {...props}>{contenido}</Link>}
  </>
}

function Panel({ input, onClose }: { input: MostrarInput; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [onClose])
  const Icono = ICONO[input.vista]
  return createPortal(<div className={s.velo} onClick={onClose}>
    <div className={s.panel} role="dialog" aria-modal="true" aria-label={titulo(input)} onClick={e => e.stopPropagation()}>
      <header className={s.cabecera}><Icono size={15} aria-hidden /><h3>{titulo(input)}</h3>
        <button className={s.cerrar} onClick={onClose} aria-label="Cerrar"><X size={16} /></button></header>
      {input.enfoque && <p className={s.enfoque}>{input.enfoque}</p>}
      <div className={s.panelCuerpo}><Cuerpo input={input} grande /></div>
      <footer className={s.pie}><AbrirCompleto input={input} /></footer>
    </div>
  </div>, document.body)
}

/** panel-claridad Fase 2 (1 oct, 09:22): las vistas viven en el chat por defecto. Se fijan en
 *  el panel solo si Levy lo pidió (`fijar`) o Daniel toca «Fijar en el panel». */
const fijadasVivas = new Set<string>()
const origenDeLevy = (input: MostrarInput) => ({ deLevy: true, conversacion: useRecientesStore.getState().activaId, guardada: !!input.guardar })
function useFijarAlNacer(inv: Extract<Invocacion, { verbo: 'mostrar' }>, input: MostrarInput | null, vivo: boolean) {
  const fijar = usePanelFijadas(st => st.fijar)
  // Solo una vista nacida en ESTE turno con fijar se fija sola; un historial recargado nunca abre el panel.
  useEffect(() => {
    if (!input?.fijar || input.soltar || !vivo || inv.status !== 'done' || fijadasVivas.has(inv.toolId)) return
    fijadasVivas.add(inv.toolId)
    // De Levy y de esta conversación: si Daniel no la guarda, se cierra sola al cambiar de conversación (3 oct 2026).
    // Y en la ventana que eligió en «Dónde abre Levy» (por defecto la de la izquierda): el panel de al lado no recibe pestañas.
    void resolverDestino().then(destino => {
      fijar(inv.toolId, input, true, { ...origenDeLevy(input), ventana: destino.ventana })
      if (destino.ventana === PRINCIPAL) useLayoutStore.getState().setPanelDerecho(true)
    })
  }, [vivo, inv.status, inv.toolId, input, fijar])
}

function BotonFijar({ inv, input }: { inv: Extract<Invocacion, { verbo: 'mostrar' }>; input: MostrarInput }) {
  const { fijadas, activa, fijar, soltar, cargar } = usePanelFijadas()
  const fuera = useFuera()
  const abierto = useLayoutStore(st => st.panelDerechoOpen)
  useEffect(() => { cargar() }, [cargar])
  const f = fijadaDe(fijadas, inv.toolId, input)
  // Una vista que ya vive en su propia ventana (se arrastró fuera del panel) se trae al frente, no se quita. (1 oct 2026)
  if (f && fuera.includes(f.id)) return <button className={s.icono} data-fijada onClick={() => mostrarPanel(f.id)}
    title="Está en su propia ventana: traerla al frente" aria-label="Traer al frente la ventana de esta vista"><PinOff size={14} aria-hidden /></button>
  if (f) return <button className={s.icono} data-fijada onClick={() => abierto && activa === f.id ? soltar(f.id) : mostrarPanel(f.id)}
    title={abierto && activa === f.id ? 'Quitar del panel' : 'Ver en el panel'} aria-label={abierto && activa === f.id ? 'Quitar del panel' : 'Ver en el panel'}><PinOff size={14} aria-hidden /></button>
  return <button className={s.icono} onClick={() => mostrarPanel(fijar(inv.toolId, input))} title="Fijar en el panel" aria-label="Fijar en el panel"><Pin size={14} aria-hidden /></button>
}

/** Línea del hilo que nombra una vista fijada (se conserva para el diseño v2; ya no es el defecto). */
export function LineaEnPanel({ inv, input, vivo }: { inv: Extract<Invocacion, { verbo: 'mostrar' }>; input: MostrarInput; vivo: boolean }) {
  const { fijadas, activa, fijar, cargar } = usePanelFijadas()
  const fuera = useFuera()
  const abierto = useLayoutStore(st => st.panelDerechoOpen)
  useEffect(() => { cargar() }, [cargar])
  useFijarAlNacer(inv, input, vivo)
  const f = fijadaDe(fijadas, inv.toolId, input)
  const aLaVista = !!f && (fuera.includes(f.id) || (abierto && activa === f.id))
  const Icono = ICONO[input.vista], dato = datoCache(input)
  return <button className={s.enPanel} data-cabina-vista={input.vista} data-cabina-estado="en-panel" data-a-la-vista={aLaVista || undefined}
    onClick={() => mostrarPanel(fijar(inv.toolId, input, true, origenDeLevy(input)))} aria-label={`Ver en el panel: ${input.titulo ?? resumen(input)}`}>
    <span className={s.colapsadaIcono}><Icono size={14} aria-hidden /></span>
    <span className={s.colapsadaTexto}><span>{input.titulo ?? resumen(input)}</span>{dato && <small>{dato}</small>}</span>
    <em>{aLaVista ? 'En el panel' : 'Ver en el panel'} <ChevronRight size={13} aria-hidden /></em>
  </button>
}

/** Lo técnico vive en el Taller: la línea del hilo lo nombra y lo abre (al nacer en un turno vivo, solo). */
const TALLER_PESTANA: Partial<Record<string, string>> = { servidores: 'Computadora', rutinas: 'Rutinas', memoria: 'Memoria', historia: 'Historia' }
function LineaTaller({ inv, input, vivo }: { inv: Extract<Invocacion, { verbo: 'mostrar' }>; input: MostrarInput; vivo: boolean }) {
  const fijar = usePanelFijadas(st => st.fijar)
  const abrir = useCallback(() => { mostrarPanel(fijar(inv.toolId, input)); useLayoutStore.getState().setPanelDerecho(true) }, [fijar, inv.toolId, input])
  useEffect(() => {
    if (!vivo || inv.status !== 'done' || fijadasVivas.has(inv.toolId)) return
    fijadasVivas.add(inv.toolId); abrir()
  }, [vivo, inv.status, inv.toolId, abrir])
  const Icono = ICONO[input.vista], dato = datoCache(input)
  const pestana = TALLER_PESTANA[input.vista] ?? 'Computadora'
  return <button className={s.enPanel} data-cabina-vista={input.vista} data-cabina-estado="en-taller" onClick={abrir} aria-label={`Ver en el Taller: ${pestana}`}>
    <span className={s.colapsadaIcono}><Icono size={14} aria-hidden /></span>
    <span className={s.colapsadaTexto}><span>{input.titulo ?? resumen(input)}</span>{dato && <small>{dato}</small>}</span>
    <em>Ver en el Taller <ChevronRight size={13} aria-hidden /></em>
  </button>
}

/** Levy quitó una pestaña (`soltar: true`): en el hilo queda la línea que lo dice. Solo un turno vivo suelta. */
const soltadasVivas = new Set<string>()
function LineaSoltada({ inv, input, vivo }: { inv: Extract<Invocacion, { verbo: 'mostrar' }>; input: MostrarInput; vivo: boolean }) {
  const soltarComo = usePanelFijadas(st => st.soltarComo)
  useEffect(() => {
    if (!vivo || inv.status !== 'done' || soltadasVivas.has(inv.toolId)) return
    soltadasVivas.add(inv.toolId); soltarComo(input)
  }, [vivo, inv.status, inv.toolId, input, soltarComo])
  const Icono = ICONO[input.vista]
  return <p className={s.preparando} data-cabina-vista={input.vista} data-cabina-estado="soltada"><Icono size={13} aria-hidden /> Levy quitó «{titulo(input)}» del panel.</p>
}

function VistaViva({ inv, streaming }: { inv: Extract<Invocacion, { verbo: 'mostrar' }>; streaming?: boolean }) {
  const ctx = useContext(CabinaCtx)
  const isMobile = useIsMobile()
  const vivo = useRef(!!streaming || inv.status === 'running').current
  const [tocada, setTocada] = useState(false), [ampliada, setAmpliada] = useState(false)
  const [ref, aLaVista] = useALaVista()
  const visible = aLaVista || !!ctx?.sinOptimizar
  const [cuerpoRef, altoRef] = useAltoReservado()
  const cerrar = useCallback(() => setAmpliada(false), [])
  useFijarAlNacer(inv, inv.input, vivo && !isMobile)

  if (inv.error) return <p className={s.error}><AlertTriangle size={13} aria-hidden /> Levy intentó mostrar una vista y falló: {inv.error}</p>
  if (!inv.input) return inv.status === 'running'
    ? <div className={s.preparando}><Loader2 size={13} className="animate-spin" aria-hidden /> Preparando la vista…</div>
    : null
  const input = inv.input, Icono = ICONO[input.vista]
  if (input.soltar) return <LineaSoltada inv={inv} input={input} vivo={vivo} />
  // Servidores, Rutinas y Memoria viven en el Taller (5 oct 2026): no se pintan en el hilo, abren el Taller en su pestaña.
  if (EN_TALLER.has(input.vista)) return <LineaTaller inv={inv} input={input} vivo={vivo && !isMobile} />
  // Lo fijado vive en el panel, no se repite en el chat (Daniel, 3 oct 06:56: «es redundante e innecesario»;
  // ya lo pedía el diseño v2 del 1 oct). En el hilo queda una línea que la nombra y enfoca su pestaña.
  if (input.fijar && !isMobile) return <LineaEnPanel inv={inv} input={input} vivo={vivo} />
  const activa = tocada || !ctx || !!ctx.sinOptimizar || ctx.activas.has(inv.toolId)

  if (!activa) {
    const dato = datoCache(input)
    return <button className={s.colapsada} onClick={() => setTocada(true)} data-cabina-vista={input.vista} data-cabina-estado="colapsada" aria-label={`Ver de nuevo: ${input.titulo ?? resumen(input)}`}>
      <span className={s.colapsadaIcono}><Icono size={14} aria-hidden /></span>
      <span className={s.colapsadaTexto}><span>{input.titulo ?? resumen(input)}</span>{dato && <small>{dato}</small>}</span>
      <em>Ver <ChevronRight size={13} aria-hidden /></em>
    </button>
  }

  return <section ref={ref} className={s.marco} data-cabina-vista={input.vista} data-cabina-estado={visible ? 'montada' : 'dormida'} aria-label={titulo(input)}>
    <header className={s.cabecera}><Icono size={14} aria-hidden /><h3>{conHeroe(input) ? NOMBRE[input.vista] : titulo(input)}</h3>
      <span className={s.acciones}>
        {!isMobile && <BotonFijar inv={inv} input={input} />}
        {/* Expandir lleva a la sección; solo lo que no tiene sección se amplía encima. */}
        {seccionDe(input)
          ? <AbrirCompleto input={input} compacto />
          : <button className={s.icono} onClick={() => enShell() ? verEnPantallaCompleta(input) : setAmpliada(true)} title="Ampliar" aria-label="Ampliar la vista"><Maximize2 size={14} aria-hidden /></button>}
      </span>
    </header>
    {input.enfoque && <p className={`${s.enfoque} ${l.serif}`}>{input.enfoque}</p>}
    <div ref={cuerpoRef} className={s.cuerpo} style={!visible && altoRef.current ? { minHeight: altoRef.current } : undefined}>
      {visible ? <Cuerpo input={input} /> : <div className={s.dormida} style={{ minHeight: altoRef.current || 160 }} />}
    </div>
    {ampliada && <Panel input={input} onClose={cerrar} />}
  </section>
}

function Llevar({ inv, streaming }: { inv: Extract<Invocacion, { verbo: 'abrir' }>; streaming?: boolean }) {
  const router = useRouter()
  const [cuenta, setCuenta] = useState<number | null>(null)
  const input = inv.input
  const ir = useCallback(async (d: AbrirInput) => {
    abrirEjecutado(inv.toolId)
    // Levy te lleva sin sacarte de la conversación: la vista a pantalla completa y Levy flotando a su lado.
    const vista = enShell() ? vistaDeDestino(d) : null
    if (vista) { verEnPantallaCompleta(vista, { levy: true }); return }
    router.push(rutaDe(d))
  }, [inv.toolId, router])
  // Solo navega sola una invocación nacida en ESTE turno vivo, al terminar la respuesta.
  useEffect(() => {
    if (!input || streaming || inv.status !== 'done' || inv.error || !abrirEsVivo(inv.toolId)) return
    setCuenta(3)
  }, [input, streaming, inv.status, inv.error, inv.toolId])
  useEffect(() => {
    if (cuenta === null || !input) return
    if (cuenta <= 0) { setCuenta(null); void ir(input); return }
    const t = setTimeout(() => setCuenta(c => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [cuenta, input, ir])

  if (inv.error) return <p className={s.error}><AlertTriangle size={13} aria-hidden /> No se pudo preparar la navegación: {inv.error}</p>
  if (!input) return null
  const fecha = input.fecha ? ` · ${new Date(input.fecha + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''
  return <div className={s.llevar} data-cabina-abrir={input.destino}>
    <Navigation size={14} aria-hidden />
    <span>{cuenta !== null ? `Te llevo a ${NOMBRE[input.destino]}${fecha} en ${cuenta}…` : `${NOMBRE[input.destino]}${fecha}`}{input.motivo && <small>{input.motivo}</small>}</span>
    {cuenta !== null
      ? <button className={s.accionSec} onClick={() => { abrirEjecutado(inv.toolId); setCuenta(null) }}>Cancelar</button>
      : <button className={s.accion} onClick={() => void ir(input)}>Ir <ArrowUpRight size={13} aria-hidden /></button>}
  </div>
}

/** Todas las invocaciones de la cabina de un mensaje de Levy. */
export function CabinaDelMensaje({ msg }: { msg: ChatMessage }) {
  const invs = useMemo(() => sinEcoDeDelegar(msg, invocacionesDe(msg)), [msg])
  if (!invs.length) return null
  return <div className={s.cabina}>
    {invs.map(inv => inv.verbo === 'mostrar'
      ? <VistaViva key={inv.toolId} inv={inv} streaming={msg.streaming} />
      : <Llevar key={inv.toolId} inv={inv} streaming={msg.streaming} />)}
  </div>
}
