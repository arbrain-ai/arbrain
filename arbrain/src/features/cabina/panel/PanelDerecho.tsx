'use client'
/**
 * Panel derecho de Arbrain · diseño v2 (firmado por Daniel el 1 oct, 07:40).
 *
 * «En el chat va lo que hablamos; en el panel, lo que está pasando.» La unidad
 * es la TAREA, no la conversación: una sola lista con lo que hace el dueño y lo
 * que hacen sus agentes, con su dueño visible. Secciones dinámicas que solo
 * aparecen si tienen algo: Espera tu decisión, En curso y, debajo, todo Todoist
 * (Hoy · Próximas · Sin fecha · Hechas; 5 oct 2026, retiro de /todotask).
 * Lo que Levy muestra se fija arriba como pestaña. El Taller (terminales,
 * servidores, servicios y archivos del cerebro) es para quien construye.
 *
 * Escritorio: columna con divisor arrastrable que recuerda su ancho (⌘B).
 * Ventana aparte dividida (9 oct 2026): ⌘B y el botón de la esquina esconden y muestran su columna derecha sin mover
 * sus pestañas ni perder su ancho (division.ts · alternarColumna); ahí ⌘B manda sobre la negrita del lienzo.
 * Teléfono (6 oct 2026): sin hoja; la fila de pestañas bajo la cabecera (FilaPestanas.tsx) y, al tocar una, su vista a pantalla completa.
 * Segunda pantalla: las pestañas se arrastran a otras ventanas con su propia tira, como en Chrome (5 oct 2026,
 * ver ventanas.ts y Ventana.tsx); la misma `Contenido` pinta la tira del panel y la de cada ventana.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { AppWindow, ArrowLeft, Bell, ChevronRight, Hammer, ListChecks, PanelRightClose, Pin, PinOff, X } from 'lucide-react'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { ZoomDoc } from '../vistas/Documento'
import { esTelefonoAhora, useIsMobile } from '@/shared/hooks/useMediaQuery'
import { useFuente, lecturaEnCache } from '../datos'
import { Cuerpo, GuardarVista, titulo } from '../Cabina'
import { guardable, usePanelFijadas, useTodasFuera, type Fijada } from './fijadas'
import { nombrePestana } from './nombre-pestana'
import { aFijo, zoomUI } from '@/shared/lib/zoom-ui'
import { pedirSegmentoTaller, SEGMENTOS_TALLER, useSegmentoTaller, type SegmentoTaller } from './taller-segmento'
import { AgentesTaller, MaquinaTaller, ProgramadosStudio, PulsoTaller, SegmentosTaller } from './Taller'
import { MemoriaTaller } from './MemoriaTaller'
import { EscucharDocumento } from './EscucharDocumento'
import { ActividadViva } from './ActividadViva'
import { VistaRutinasViva } from '@/features/rutinas/RutinasViva'
import { RutinasCliente } from '@/features/rutinas/RutinasCliente'
import { ComputadoraCliente } from '@/features/computadora/ComputadoraCliente'
import { useAtenderPedidos, useGuardado } from './archivero'
import { useAtenderPanel } from './bus'
import { atenderVentana, coordinarPrincipal, devolverAlPanel, llevarA, puedeDesprender, sacarAVentanaNueva, seguirLlegadas, useHueco, useVentanas } from './ventanas'
import { indiceEnOrden, nombreVentana, pestanaActiva, PRINCIPAL, TALLER, TAREAS, tiraDe, todasLasClaves, ventanaDe, ventanasCon } from './pestanas-fuera'
import { arrastrarPestana } from './arrastre'
import { Division } from './VentanaDividida'
import { useDivision, useDivisiones } from './division-store'
import { alActivar, alternarColumna, dividida, hayColumnaDerecha, igualesEstado, miembros, normalizar, revelaColumna, type EstadoDivision, type Ranura } from './division'
import { ControlesPanel } from './Ventana'
import { clavesTelefono } from './telefono-pestanas'
import { BotonVolver, PantallaCompleta, salirPantallaCompleta, useAtajoPantallaCompleta, useRecuerdoPantallaCompleta } from './PantallaCompleta'
import { CuerpoSeccion, IconoVista, MenuSecciones, OpcionesPanel, esSeccion } from './Secciones'
import { siguienteNacimiento, vivasTras, type Nacimiento } from './vivas'
import { FichaConsumo } from './GastoAgente'
import {
  abrirEnNavegador, esAgente, hace, nombreTerminal, urlPanel,
  type Terminal, type Trabajos,
} from './datos'
import { lineaLimpia, dondeVive, esperaALevy, fuenteEnPalabras, preguntaAlgo, ultimaRespuesta } from '../trabajos-modelo'
import { TerminalViva } from './TerminalViva'
import { firmaRevision, usePendientes } from './pendientes'
import { TareasTodoist, useTodoist } from './TareasTodoist'
import { useAskLevy } from '@/shared/hooks/useAskLevy'
import { Registro } from './Registro'
import t from './todoist.module.css'
import { DetalleInterna } from './InternaDetalle'
import { useConversacionActiva } from '../conversaciones'
import { IconoTipo, NOMBRE_TIPO, estadoTerminal, tipoTerminal } from './Tipo'
import s from './panel.module.css'
import { HistoriaTaller } from '@/features/historia/Historia'
import w from './taller.module.css'
import { esEdicionCliente, sinRespuestaDelServidor } from '@/lib/edicion'
import { zonaDueno } from '@/shared/lib/zona-dueno'

const CLAVE = 'arbrain.panelDerecho'
const MIN = 320, CHAT_MIN = 520
const anchoInicial = () => Math.round(Math.min(760, Math.max(380, window.innerWidth * 0.42)))

function leerGuardado(): { abierto?: boolean; ancho?: number } {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') } catch { return {} }
}
function guardar(parcial: Record<string, unknown>) {
  try { localStorage.setItem(CLAVE, JSON.stringify({ ...leerGuardado(), ...parcial })) } catch { /* sin almacenamiento */ }
}

/** Monta el panel donde toca: columna en escritorio, hoja en teléfono. */
export function PanelDerechoShell() {
  const isMobile = useIsMobile()
  const { panelDerechoOpen, setPanelDerecho, drawFullscreen } = useLayoutStore()
  // Con todas las pestañas en su propia ventana la columna se cierra sola; vuelve cuando una regresa (1 oct 2026).
  const sinColumna = useTodasFuera()
  const listo = useRef(false)
  // Las fijadas se cargan aunque la columna no se pinte: con el panel afuera, esta ventana
  // igual recibe las vistas que vuelven y lo que fija otra ventana.
  useEffect(() => {
    usePanelFijadas.getState().cargar()
    const fin = [coordinarPrincipal(), atenderVentana(), seguirLlegadas()]
    return () => fin.forEach(f => f())
  }, [])
  // Lo que Levy fijó en otra conversación y Daniel no guardó se cierra solo al cambiar de conversación (3 oct 2026).
  const conversacion = useConversacionActiva()
  // 14 oct 2026: el panel es uno para todos los aparatos (compartido.ts); el teléfono no poda (abre cada vez una conversación
  // nueva y cerraría en el escritorio lo que Levy dejó en sus ventanas).
  useEffect(() => { if (!esTelefonoAhora()) usePanelFijadas.getState().podarConversacion(conversacion) }, [conversacion])
  // Fijar, soltar y guardar de Levy se aplican aquí, sobre el panel real, y se acusan (bus del panel, 4 oct 2026).
  useAtenderPanel()
  // El estado abierto se recuerda en escritorio; el teléfono siempre arranca con el chat libre.
  useEffect(() => {
    // Se pregunta al viewport directo: en la hidratación useIsMobile aún vale false.
    const telefono = window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-height: 600px)').matches
    if (!listo.current) { listo.current = true; if (!telefono && leerGuardado().abierto) setPanelDerecho(true); return }
    if (!isMobile) guardar({ abierto: panelDerechoOpen })
  }, [panelDerechoOpen, isMobile, setPanelDerecho])
  const columnaVisible = !(drawFullscreen || !panelDerechoOpen || (sinColumna && !isMobile))
  // Pantalla completa (4–5 oct 2026, ver pantalla-completa.ts): la pestaña a todo el ancho con el chat montado y a la
  // mano como Levy flotante. Se recuerda entre recargas; sin columna (panel cerrado o todo fuera) se apaga sola.
  const enfoque = useLayoutStore(st => st.enfoquePanel) && columnaVisible && !isMobile
  useAtajoPantallaCompleta(!isMobile)
  useRecuerdoPantallaCompleta()
  const habiaColumna = useRef(false)
  useEffect(() => {
    // Solo al perderla: en la carga la columna aparece un cuadro después del recuerdo y no debe apagarlo.
    if ((habiaColumna.current && !columnaVisible) || isMobile) useLayoutStore.getState().setEnfoquePanel(false)
    habiaColumna.current = columnaVisible
  }, [columnaVisible, isMobile])
  if (!columnaVisible) return <AtenderPedidos />
  return isMobile ? <><AtenderPedidos /><PestanaTelefono /></> : <>
    <AtenderPedidos />
    <Lateral onCerrar={() => setPanelDerecho(false)} />
    {enfoque && <PantallaCompleta />}
  </>
}

/** «Ábreme lo que guardé de…»: Levy deja el pedido en el archivero y esta ventana lo abre como pestaña. En su propio
 *  componente (6 oct 2026): el sondeo de 5 s re-renderizaba la raíz del panel y con ella el calendario entero. */
function AtenderPedidos() {
  useAtenderPedidos()
  return null
}

function Lateral({ onCerrar }: { onCerrar: () => void }) {
  const ref = useRef<HTMLElement>(null)
  const [ancho, setAncho] = useState<number | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  useLayoutEffect(() => { setAncho(leerGuardado().ancho ?? anchoInicial()) }, [])

  // Máximo = lo que deja al chat al menos CHAT_MIN px (el chat sigue usable al lado).
  const maximo = useCallback(() => {
    const el = ref.current, main = el?.previousElementSibling as HTMLElement | null
    return el && main ? el.offsetWidth + main.offsetWidth - CHAT_MIN : 900
  }, [])
  const fijar = useCallback((w: number, persistir = true) => {
    const v = Math.round(Math.min(Math.max(w, MIN), Math.max(MIN, maximo())))
    setAncho(v); if (persistir) guardar({ ancho: v })
  }, [maximo])

  const empezar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX, w0 = ref.current?.offsetWidth ?? ancho ?? 480
    const barra = e.currentTarget
    barra.setPointerCapture(e.pointerId)
    setArrastrando(true)
    document.documentElement.classList.add(s.redimensionando)
    const mover = (ev: PointerEvent) => fijar(w0 + (x0 - ev.clientX), false)
    const soltar = (ev: PointerEvent) => {
      barra.removeEventListener('pointermove', mover); barra.removeEventListener('pointerup', soltar); barra.removeEventListener('pointercancel', soltar)
      document.documentElement.classList.remove(s.redimensionando)
      setArrastrando(false)
      fijar(w0 + (x0 - ev.clientX))
    }
    barra.addEventListener('pointermove', mover); barra.addEventListener('pointerup', soltar); barra.addEventListener('pointercancel', soltar)
  }
  const teclas = (e: React.KeyboardEvent) => {
    const paso = e.shiftKey ? 96 : 24, w = ref.current?.offsetWidth ?? ancho ?? 480
    if (e.key === 'ArrowLeft') { e.preventDefault(); fijar(w + paso) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); fijar(w - paso) }
    else if (e.key === 'Home') { e.preventDefault(); fijar(maximo()) }
    else if (e.key === 'End') { e.preventDefault(); fijar(MIN) }
  }

  return (
    <aside ref={ref} className={s.lateral} data-panel-derecho data-arrastrando={arrastrando || undefined} style={{ width: ancho ?? undefined, visibility: ancho == null ? 'hidden' : undefined }} aria-label="Panel de tareas">
      <div
        className={s.divisor} role="separator" aria-orientation="vertical" tabIndex={0}
        aria-label="Cambiar el ancho del panel" aria-valuenow={ancho ?? undefined} aria-valuemin={MIN}
        title="Arrastra para cambiar el ancho · doble clic para volver al tamaño inicial"
        onPointerDown={empezar} onKeyDown={teclas} onDoubleClick={() => fijar(anchoInicial())}
      />
      <Contenido modo="lateral" onCerrar={onCerrar} />
    </aside>
  )
}

/**
 * La pestaña a pantalla completa del teléfono (6 oct 2026, Daniel): su vista ocupa todo lo que queda bajo la cabecera y la
 * fila de pestañas, sin hoja ni asa. Va POR ENCIMA del chat, que sigue montado debajo: al volver (el botón izquierdo de la
 * cabecera) su scroll y su borrador son los mismos. Las últimas vistas se quedan montadas y ocultas, como en el escritorio.
 */
function PestanaTelefono() {
  const { fijadas, orden, taller, activa } = usePanelFijadas()
  const claves = clavesTelefono(orden, taller)
  const actual = pestanaActiva(activa, claves)
  const fijada = fijadas.find(f => f.id === actual)
  const vivasRef = useRef<string[]>([])
  vivasRef.current = vivasTras(vivasRef.current, fijada?.id ?? null, claves.filter(c => fijadas.some(f => f.id === c)))
  const vivas = claves.filter(c => vivasRef.current.includes(c)).map(c => fijadas.find(f => f.id === c)!).filter(Boolean)
  // Sin pestañas (se cerró la última, aquí o por Levy) no hay nada que ver a pantalla completa: de vuelta al chat.
  useEffect(() => { if (!actual) useLayoutStore.getState().setPanelDerecho(false) }, [actual])
  // Un cambio de ruta (un aviso que lleva a otra sección) se ve: la pestaña deja el paso.
  const ruta = usePathname()
  const rutaInicial = useRef(ruta)
  useEffect(() => { if (ruta !== rutaInicial.current) useLayoutStore.getState().setPanelDerecho(false) }, [ruta])
  // El lienzo llega hasta el borde inferior (9 oct 2026): su barra de capítulos ya respeta la zona segura por su cuenta.
  return <div className={s.pestanaTelefono} data-pestana-telefono data-hasta-el-borde={fijada?.input.vista === 'lienzo' || undefined}>
    {actual === TAREAS ? <Tareas />
      : actual === TALLER ? <TallerPanel />
      : fijada ? null
      : <PanelVacio />}
    {vivas.map(f => <VistaFijada key={f.id} f={f} oculta={f.id !== fijada?.id} />)}
  </div>
}

// ── Pestañas (3 oct 2026): el acomodo de Daniel · «+» · Taller fijo a la derecha ──
export function Contenido({ onCerrar, modo, ventana = PRINCIPAL }: { onCerrar: () => void; modo: 'lateral' | 'ventana'; ventana?: string }) {
  const { fijadas, orden, taller, activa, activar, cerrar, cargar, reordenar, moverUno, ancladas, enVentana, anclar } = usePanelFijadas()
  const puede = puedeDesprender(useVentanas(st => st.nativo))
  const tiraRef = useRef<HTMLElement>(null)
  const [menu, setMenu] = useState<{ clave: string; x: number; y: number } | null>(null)
  useEffect(() => { cargar() }, [cargar])
  // Cada ventana pinta su tramo de pestañas.
  const dentro = tiraDe(todasLasClaves(orden, taller), enVentana, ventana)
  const actual = pestanaActiva(activa, dentro)
  const fijada = fijadas.find(f => f.id === actual)
  // Las últimas vistas se quedan montadas y ocultas, como las pestañas de Chrome (vivas.ts). Se calcula en el render
  // (es idempotente) para que la vista anterior no se desmonte ni un cuadro antes de tiempo.
  const vivasRef = useRef<string[]>([])
  vivasRef.current = vivasTras(vivasRef.current, fijada?.id ?? null, dentro.filter(c => fijadas.some(f => f.id === c)))
  // En el orden de la tira, no en el de uso: mover un nodo del DOM recargaría los iframes de los documentos.
  const vivas = dentro.filter(c => vivasRef.current.includes(c)).map(c => fijadas.find(f => f.id === c)!).filter(Boolean)
  const tira = dentro.filter(c => c !== TALLER)
  const dentroRef = useRef(dentro)
  dentroRef.current = dentro
  // Ventana dividida como Visual Studio (8 oct 2026, division.ts): hasta cuatro vistas a la vez. Solo tras montar (la
  // división se lee de este dispositivo) y nunca en el teléfono. La activa es la de la parte con el foco.
  const telefono = useIsMobile()
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])
  const division = useDivision(ventana)
  const estadoDiv = normalizar(division, dentro)
  const celdas = estadoDiv.celdas
  const dividido = montado && !telefono && dividida(celdas)
  const firmaDentro = dentro.join('|')
  useEffect(() => {
    if (!montado) return
    const st = useDivisiones.getState(), d = st.de(ventana)
    let e: EstadoDivision = normalizar(d, dentro), foco = d.foco
    // Elegir otra pestaña (en una tira, por Levy o porque llegó de otra ventana) la deja a la vista en su grupo; una
    // nueva, en el grupo con el foco.
    if (dividida(e.celdas) && actual) ({ estado: e, foco } = alActivar(e, foco, actual))
    // Con la columna derecha escondida, lo que se pide ahí la vuelve a mostrar.
    const oculta = d.oculta && !revelaColumna(e.celdas, d.oculta, actual)
    if (!igualesEstado(e, d) || foco !== d.foco || oculta !== d.oculta) st.poner(ventana, { celdas: e.celdas, grupos: e.grupos, foco, oculta })
  }, [montado, ventana, actual, firmaDentro])
  const colocarDivision = (e: EstadoDivision, clave: string) => {
    const d = useDivisiones.getState().de(ventana)
    useDivisiones.getState().poner(ventana, { celdas: e.celdas, grupos: e.grupos, foco: Math.max(0, e.celdas.indexOf(clave)) as Ranura, oculta: d.oculta && !revelaColumna(e.celdas, d.oculta, clave) })
    activar(clave)
  }
  // ⌘B en una ventana aparte (9 oct 2026): esconde y vuelve a mostrar su columna derecha, como la barra lateral de VS
  // Code. Sus pestañas, su grupo y su ancho no se mueven. El botón de la esquina hace lo mismo.
  const columnaDerecha = dividido && hayColumnaDerecha(celdas)
  const ocultaDerecha = columnaDerecha && division.oculta
  const alternarDerecha = () => {
    const st = useDivisiones.getState(), d = st.de(ventana), c = normalizar(d, dentro).celdas
    const r = alternarColumna(c, d.foco, d.oculta)
    if (!r) return false
    st.poner(ventana, r)
    if (r.foco !== d.foco && c[r.foco]) activar(c[r.foco]!)
    return true
  }
  const alternarRef = useRef(alternarDerecha)
  alternarRef.current = alternarDerecha
  useEffect(() => {
    if (modo !== 'ventana' || telefono) return
    // En captura y deteniéndolo: en esta ventana ⌘B es de la columna antes que de la negrita del lienzo. Sin columna
    // derecha no se toca y la negrita sigue funcionando.
    const k = (e: KeyboardEvent) => {
      if (e.code !== 'KeyB' || !e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || e.isComposing) return
      if (e.repeat) { if (hayColumnaDerecha(normalizar(useDivisiones.getState().de(ventana), dentroRef.current).celdas)) { e.preventDefault(); e.stopPropagation() } return }
      if (alternarRef.current()) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [modo, telefono, ventana])
  // Dar el foco a una parte (clic dentro o en su «+»): lo nuevo que se abra cae en su grupo.
  const enfocarParte = (r: Ranura) => { useDivisiones.getState().poner(ventana, { foco: r }); const c = celdas[r]; if (c) activar(c) }
  const vistaDe = (clave: string) => clave === TAREAS ? <Tareas /> : clave === TALLER ? <TallerPanel /> : (() => { const f = fijadas.find(x => x.id === clave); return f ? <VistaFijada key={f.id} f={f} /> : null })()
  // La activa siempre a la vista en la tira (una vista recién abierta desde «+» o por Levy queda al final).
  useEffect(() => { if (actual) tiraRef.current?.querySelector(`[data-clave="${CSS.escape(actual)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [actual, tira.length])

  useHuecoEnTira(tiraRef)
  // Arrastrar: dentro de la tira reordena; sobre otra ventana la lleva ahí; a un lugar vacío, ventana nueva. Solo con puntero fino.
  // `deTira`: las pestañas de la tira donde está (la de la ventana o la de su grupo), para reordenar dentro de ella.
  const arrastrar = (clave: string, deTira: string[] = tira) => (e: React.PointerEvent<HTMLElement>) => arrastrarPestana(e, clave, s.fantasma, {
    ventana, alReordenar: i => reordenar(clave, indiceEnOrden(orden, deTira.filter(c => c !== TALLER), clave, i)),
    division: telefono ? undefined : { estado: dividido ? estadoDiv : null, visible: actual, tira: dentro, cortes: division.cortes, aplicar: colocarDivision, claseSombra: s.sombraDivision },
  })
  const sugerencia = (t: string) => `${t} · arrástrala para acomodarla, a otra ventana${puede ? ' o fuera para abrirla en una ventana nueva' : ''} · clic derecho: fijar · ⌥← ⌥→`
  const menuDe = (clave: string) => (e: React.MouseEvent) => { e.preventDefault(); setMenu({ clave, x: e.clientX, y: e.clientY }) }
  const teclas = (clave: string) => (e: React.KeyboardEvent) => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    moverUno(clave, e.key === 'ArrowLeft' ? -1 : 1)
    // Al moverse, el nodo cambia de lugar: el foco vuelve a la misma pestaña.
    requestAnimationFrame(() => tiraRef.current?.querySelector<HTMLElement>(`[data-clave="${CSS.escape(clave)}"] [role="tab"]`)?.focus())
  }
  // Cerrar la pestaña que ves a pantalla completa te regresa a donde estabas (chat + panel), nunca a otra pestaña a
  // pantalla completa ni fuera de Arbrain (5 oct 2026).
  const enfoque = useLayoutStore(st => st.enfoquePanel) && modo === 'lateral'
  const cerrarPestana = (clave: string) => { if (enfoque && clave === actual) salirPantallaCompleta(); cerrar(clave) }

  // Una pestaña de una tira (la de la ventana o la de un grupo). `activaAqui`: la que se ve en esa tira.
  const pestanaDe = (clave: string, activaAqui: boolean, deTira: string[], alElegir: () => void) => {
    const anclada = ancladas.includes(clave)
    if (clave === TAREAS) return <Pestana key={clave} clave={clave} activa={activaAqui} nombre="Tareas" icono={<ListChecks size={14} aria-hidden />} anclada={anclada}
      onElegir={alElegir} onCerrar={() => cerrarPestana(clave)} onArrastrar={arrastrar(clave, deTira)} onTeclas={teclas(clave)} onMenu={menuDe(clave)} sugerencia={sugerencia} />
    if (clave === TALLER) return <Pestana key={clave} clave={TALLER} activa={activaAqui} nombre="Taller" icono={<Hammer size={13} aria-hidden />} taller
      titulo="Taller: terminales, servidores, servicios y archivos" onElegir={alElegir} onCerrar={() => cerrarPestana(TALLER)}
      onArrastrar={arrastrar(TALLER, deTira)} onMenu={menuDe(TALLER)} sugerencia={t => `${t} · arrástrala a otra ventana${puede ? ' o fuera para abrirla en una ventana nueva' : ''}`} />
    const f = fijadas.find(x => x.id === clave)
    if (!f) return null
    return <Pestana key={clave} clave={clave} activa={activaAqui} nombre={nombrePestana(f)} icono={<IconoVista vista={f.input.vista} size={13} />} titulo={titulo(f.input)} anclada={anclada}
      onElegir={alElegir} onCerrar={() => cerrarPestana(clave)}
      onArrastrar={arrastrar(clave, deTira)} onTeclas={teclas(clave)} onMenu={menuDe(clave)} sugerencia={sugerencia} />
  }
  // Dividida (8 oct 2026, 19:43): cada parte lleva su propia cabecera, igual a la de la ventana (misma altura: las de
  // arriba quedan alineadas), con las pestañas de su grupo, su «+» y sus acciones; los controles de la ventana van en
  // la de arriba a la derecha.
  const arribaDerecha: Ranura = celdas[1] && !ocultaDerecha ? 1 : 0
  const columna = modo === 'ventana' && columnaDerecha ? { oculta: ocultaDerecha, alternar: () => { alternarDerecha() } } : undefined
  const cabeceraDe = (r: Ranura) => {
    const delGrupo = miembros(estadoDiv, r, dentro)
    const visibleAqui = celdas[r]
    const fijadaAqui = fijadas.find(f => f.id === visibleAqui)
    return <header className={s.cabecera} data-cabecera-grupo data-ranura={r}>
      {r === 0 && enfoque && <BotonVolver />}
      <nav className={s.pestanas} role="tablist" aria-label="Pestañas de esta parte" style={{ flex: '0 1 auto' }} data-tira>
        {delGrupo.filter(c => c !== TALLER).map(c => pestanaDe(c, c === visibleAqui, delGrupo, () => activar(c)))}
      </nav>
      <MenuSecciones />
      {fijadaAqui && <AccionesVista key={fijadaAqui.id} f={fijadaAqui} />}
      {delGrupo.includes(TALLER) && pestanaDe(TALLER, visibleAqui === TALLER, delGrupo, () => activar(TALLER))}
      {r === arribaDerecha && <ControlesPanel modo={modo} ventana={ventana} columna={columna} />}
    </header>
  }

  return (
    <div className={s.contenido}>
      {!dividido && <header className={s.cabecera}>
        {enfoque && <BotonVolver />}
        <nav ref={tiraRef} className={s.pestanas} role="tablist" aria-label="Qué ver" style={{ flex: '0 1 auto' }} data-tira>
          {tira.map(clave => {
            const anclada = ancladas.includes(clave)
            if (clave === TAREAS) return <Pestana key={clave} clave={clave} activa={actual === clave} nombre="Tareas" icono={<ListChecks size={14} aria-hidden />} anclada={anclada}
              onElegir={() => activar(clave)} onCerrar={() => cerrarPestana(clave)} onArrastrar={arrastrar(clave)} onTeclas={teclas(clave)} onMenu={menuDe(clave)} sugerencia={sugerencia} />
            const f = fijadas.find(x => x.id === clave)
            if (!f) return null
            return <Pestana key={clave} clave={clave} activa={actual === clave} nombre={nombrePestana(f)} icono={<IconoVista vista={f.input.vista} size={13} />} titulo={titulo(f.input)} anclada={anclada}
              onElegir={() => activar(clave)} onCerrar={() => cerrarPestana(clave)}
              onArrastrar={arrastrar(clave)} onTeclas={teclas(clave)} onMenu={menuDe(clave)} sugerencia={sugerencia} />
          })}
        </nav>
        {/* El «+» va justo después de las pestañas y fuera de la tira que se desplaza: en el teléfono siempre se ve. */}
        <MenuSecciones />
        {fijada && <AccionesVista key={fijada.id} f={fijada} />}
        {dentro.includes(TALLER) && <Pestana clave={TALLER} activa={actual === TALLER} nombre="Taller" icono={<Hammer size={13} aria-hidden />} taller
          titulo="Taller: terminales, servidores, servicios y archivos" onElegir={() => activar(TALLER)} onCerrar={() => cerrarPestana(TALLER)}
          onArrastrar={arrastrar(TALLER)} onMenu={menuDe(TALLER)} sugerencia={t => `${t} · arrástrala a otra ventana${puede ? ' o fuera para abrirla en una ventana nueva' : ''}`} />}
        <ControlesPanel modo={modo} ventana={ventana} />
      </header>}
      {menu && <MenuPestana {...menu} ventana={ventana} anclada={ancladas.includes(menu.clave)} puede={puede} enVentana={enVentana}
        onAnclar={si => anclar(menu.clave, si)} onCerrarPestana={() => cerrarPestana(menu.clave)} onListo={() => setMenu(null)} />}
      <div className={s.cuerpoZona} data-zona-division>
        {dividido
          ? <Division celdas={celdas} foco={division.foco} cortes={division.cortes} vista={vistaDe} cabecera={cabeceraDe}
            onFoco={enfocarParte} derechaOculta={ocultaDerecha}
            onCortes={(cortes, persistir) => useDivisiones.getState().poner(ventana, { cortes }, persistir)} />
          : <>
            {actual === TAREAS ? <Tareas />
              : actual === TALLER ? <TallerPanel />
              : fijada ? null
              : <PanelVacio />}
            {vivas.map(f => <VistaFijada key={f.id} f={f} oculta={f.id !== fijada?.id} />)}
          </>}
      </div>
    </div>
  )
}

/**
 * Lo que enseña el fantasma que cruza monitores (VentanaFantasma.tsx, 5 oct 2026): la pestaña como se ve en la tira
 * y el cuerpo vivo de su vista. El Taller no se duplica (sus terminales viven en un solo lugar): su ícono basta.
 */
export function PestanaDelFantasma({ clave }: { clave: string }) {
  const f = usePanelFijadas(st => st.fijadas.find(x => x.id === clave))
  const [nombre, icono] = clave === TAREAS ? ['Tareas', <ListChecks key="i" size={14} aria-hidden />]
    : clave === TALLER ? ['Taller', <Hammer key="i" size={13} aria-hidden />]
    : f ? [nombrePestana(f), <IconoVista key="i" vista={f.input.vista} size={13} />] : ['Pestaña', null]
  return <span className={`${s.pestana} ${s.pestanaDelFantasma}`} aria-hidden>{icono}<span>{nombre}</span></span>
}

export function CuerpoDelFantasma({ clave }: { clave: string }) {
  const f = usePanelFijadas(st => st.fijadas.find(x => x.id === clave))
  if (clave === TAREAS) return <Tareas />
  if (f) return <VistaFijada key={f.id} f={f} />
  return <div className={s.cuerpo}><div className={s.vacioPanel}><Hammer size={28} aria-hidden /></div></div>
}

/** Una pestaña: su botón y, al pasar el mouse, ×, como Chrome. Guardar vive en la cabecera de la vista (3 oct 2026).
 *  Anclada (5 oct 2026): solo su ícono, sin ×, primero en la tira; clic derecho para fijarla o quitarla. */
function Pestana({ clave, nombre, icono, titulo: t, activa, onElegir, onCerrar, onArrastrar, onTeclas, onMenu, sugerencia, taller, anclada }: {
  clave: string; nombre: string; icono: React.ReactNode; titulo?: string; activa: boolean
  onElegir: () => void; onCerrar: () => void; onMenu?: (e: React.MouseEvent) => void
  onArrastrar?: (e: React.PointerEvent<HTMLElement>) => void; onTeclas?: (e: React.KeyboardEvent) => void; sugerencia: (t: string) => string; taller?: boolean; anclada?: boolean
}) {
  return <span className={s.fijada} data-clave={clave} data-activa={activa || undefined} data-anclada={anclada || undefined}>
    <button role="tab" aria-selected={activa} aria-label={anclada ? `${nombre} (fijada)` : taller ? nombre : undefined} className={`${s.pestana}${taller ? ` ${s.pestanaTaller}` : ''}`} data-arrastrable={onArrastrar ? '' : undefined}
      onClick={onElegir} onPointerDown={onArrastrar} onKeyDown={onTeclas} onContextMenu={onMenu} title={sugerencia(t ?? nombre)}>
      {icono}<span>{nombre}</span>
    </button>
    {!anclada && <span className={s.accionesPestana}>
      <button className={s.soltar} onClick={onCerrar} aria-label={`Cerrar ${nombre}`} title="Cerrar (vuelve desde «+»)"><X size={11} /></button>
    </span>}
  </span>
}

/** Mientras otra ventana arrastra una pestaña sobre esta tira, las vecinas le abren hueco donde caería (5 oct 2026). */
function useHuecoEnTira(tiraRef: React.RefObject<HTMLElement | null>) {
  const { clave, indice, ancho } = useHueco()
  useLayoutEffect(() => {
    const t = tiraRef.current
    if (!t) return
    const hijas = Array.from(t.children).filter((h): h is HTMLElement => h instanceof HTMLElement && h.dataset.clave != null)
    let ranura = t.querySelector<HTMLElement>(':scope > [data-ranura]')
    if (!clave) { t.removeAttribute('data-hueco'); ranura?.remove(); hijas.forEach(h => { h.style.transform = '' }); return }
    t.setAttribute('data-hueco', '')
    hijas.forEach((h, i) => { h.style.transform = i >= indice ? `translateX(${ancho + 2}px)` : '' })
    // La ranura (contorno con el ancho real de la pestaña que viene): donde estaba la de `indice`, o tras la última.
    // offsetLeft es la caja de layout: vale aunque las vecinas estén corridas.
    if (!ranura) { ranura = document.createElement('span'); ranura.setAttribute('data-ranura', ''); ranura.setAttribute('aria-hidden', 'true'); t.appendChild(ranura) }
    const previa = hijas[indice - 1], en = hijas[indice]
    ranura.style.width = `${ancho}px`
    ranura.style.left = `${en ? en.offsetLeft : previa ? previa.offsetLeft + previa.offsetWidth + 2 : 0}px`
  }, [clave, indice, ancho, tiraRef])
}

/** Clic derecho en una pestaña: fijarla a la izquierda, llevarla a otra ventana o cerrarla (como Chrome). */
function MenuPestana({ clave, x, y, ventana, anclada, puede, enVentana, onAnclar, onCerrarPestana, onListo }: {
  clave: string; x: number; y: number; ventana: string; anclada: boolean; puede: boolean; enVentana: Record<string, string>
  onAnclar: (si: boolean) => void; onCerrarPestana: () => void; onListo: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fuera = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onListo() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onListo() } }
    window.addEventListener('pointerdown', fuera, true); window.addEventListener('keydown', esc, true); window.addEventListener('blur', onListo)
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    return () => { window.removeEventListener('pointerdown', fuera, true); window.removeEventListener('keydown', esc, true); window.removeEventListener('blur', onListo) }
  }, [onListo])
  const otras = [PRINCIPAL, ...ventanasCon(enVentana)].filter(v => v !== ventana && v !== ventanaDe(enVentana, clave))
  const hacer = (f: () => void) => () => { onListo(); f() }
  const z = zoomUI(), ancho = 230
  const left = aFijo(Math.min(x, window.innerWidth - ancho * z - 8), z), top = aFijo(Math.min(y, window.innerHeight - 200 * z), z)
  return createPortal(<div ref={ref} className={s.menuPestana} style={{ left, top, width: ancho }} role="menu" aria-label="Pestaña">
    {clave !== TALLER && <button role="menuitem" onClick={hacer(() => onAnclar(!anclada))}>{anclada ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}{anclada ? 'Desfijar pestaña' : 'Fijar pestaña'}</button>}
    {puede && <button role="menuitem" onClick={hacer(() => void sacarAVentanaNueva(clave))}><AppWindow size={14} aria-hidden />Mover a una ventana nueva</button>}
    {otras.map(v => <button key={v} role="menuitem" onClick={hacer(() => llevarA(clave, v))}><AppWindow size={14} aria-hidden />Mover {v === PRINCIPAL ? 'al panel principal' : `a la ${nombreVentana(v)}`}</button>)}
    {ventana !== PRINCIPAL && <button role="menuitem" onClick={hacer(() => devolverAlPanel(ventana))} title="⌘⌥B"><PanelRightClose size={14} aria-hidden />Devolver todas al panel principal</button>}
    <button role="menuitem" onClick={hacer(onCerrarPestana)}><X size={14} aria-hidden />Cerrar pestaña</button>
  </div>, document.body)
}

/** Lo que Levy puede cambiar al pedir de nuevo una vista que sigue montada: el calendario lee su periodo solo al nacer. */
const firmaDe = (f: Fijada) => f.input.vista === 'calendario' ? `${f.input.fecha ?? ''}|${f.input.alcance ?? ''}` : ''

/**
 * Lo que vivía en la cabecera de la vista, ahora en la barra de pestañas (5 oct 2026, Daniel: «el nombre ya está en la
 * pestaña»): Guardar, solo en lo que generó el agente (`guardable`). La pantalla completa ya está en la barra (⌘.).
 * En el teléfono Guardar vive en el menú de mantener presionada la pestaña (FilaPestanas.tsx).
 */
function AccionesVista({ f }: { f: Fijada }) {
  const { guardada, alternar, ocupado, error } = useGuardado(f)
  // Quitar el guardado no esconde el marcador: se queda para volver a guardar (4 oct 2026).
  const [conMarcador] = useState(() => guardable(f))
  return <>
    {(conMarcador || guardable(f)) && <GuardarVista guardada={guardada} ocupado={ocupado} onAlternar={() => void alternar()} />}
    {error && <p className={s.errorVentana} role="alert">{error}</p>}
  </>
}

/** Memo (6 oct 2026): la cabecera del panel se re-renderiza con cada lectura de sus fuentes; la vista (un calendario
 *  con FullCalendar, una pizarra) solo cuando cambia su fijada o si se oculta. */
export const VistaFijada = memo(function VistaFijada({ f, oculta = false }: { f: Fijada; oculta?: boolean }) {
  const nacimiento = useRef<Nacimiento | null>(null)
  nacimiento.current = siguienteNacimiento(nacimiento.current, f.en, firmaDe(f))
  const raiz = useRef<HTMLDivElement>(null)
  // Oculta no suena: un video o audio de la pestaña que se va se pausa (lo que no se ve no se oye).
  useEffect(() => { if (oculta) raiz.current?.querySelectorAll('video, audio').forEach(m => (m as HTMLMediaElement).pause()) }, [oculta])
  // Sin cabecera propia (5 oct 2026): el contenido empieza justo bajo las pestañas.
  return <div ref={raiz} className={s.cuerpo} data-vista role="tabpanel" data-fijada={f.id} style={oculta ? { display: 'none' } : undefined} aria-hidden={oculta || undefined} inert={oculta || undefined}>
    {f.input.enfoque && <p className={s.enfoque}>{f.input.enfoque}</p>}
    {/* Calendario y Lienzo son secciones vivas (2 oct 2026): se navegan dentro de la pestaña. */}
    {esSeccion(f) ? <CuerpoSeccion key={nacimiento.current.gen} f={f} /> : <div className={s.fijadaCuerpo}>{f.input.vista === 'documento' ? <><EscucharDocumento f={f} /><Cuerpo key={f.id + f.en} input={f.input} grande /></> : <ZoomDoc clave={`vista:${f.input.vista}`}><Cuerpo key={f.id + f.en} input={f.input} grande /></ZoomDoc>}</div>}
  </div>
})

/** Sin pestañas: las mismas opciones del «+», en grande. */
function PanelVacio() {
  return <div className={s.cuerpo} role="tabpanel">
    <div className={s.vacioPanel}>
      <h2>El panel está vacío</h2>
      <p>Abre lo que quieras tener a la vista mientras conversas. También puedes pedírselo a Levy.</p>
      <OpcionesPanel grande />
    </div>
  </div>
}

// ── Tareas: una sola lista, quien sea que la haga ──
const DUENO_AVISO: Record<string, string> = { agente: 'Levy', dinero: 'Levy', agenda: 'Levy' }
const harness = (t: Terminal) => { const h = (t.subagente?.harness ?? t.proc).toLowerCase(); return h === 'claude' ? 'Claude' : h === 'codex' ? 'Codex' : h }

export function Tareas() {
  const router = useRouter()
  const { trabajos, avisos, piden, sinLeer, marcarRevisado, marcarLeido } = usePendientes()
  // Todoist completo vive aquí desde el 5 oct 2026 (retiro de /todotask): Hoy · Próximas · Sin fecha · Hechas, con el detalle nuevo.
  const todoist = useTodoist(), ask = useAskLevy()
  const [detalle, setDetalle] = useState<number | null>(null)
  // Una pregunta sigue arriba hasta que se conteste o Daniel diga «Visto».
  const abrir = (t: Terminal) => setDetalle(t.id)

  if (detalle != null) return <div className={s.cuerpo} role="tabpanel"><DetalleTerminal id={detalle} onVolver={() => setDetalle(null)} /></div>

  const plan = todoist.planning
  const nada = !trabajos.data && !avisos.data && !plan.snapshot
  const decidir = piden.length + sinLeer.length
  return <div className={t.raiz}><div className={s.cuerpo} role="tabpanel">
    {nada ? <Cargando error={trabajos.error ?? plan.error ?? undefined} /> : <>
      <Resumen decidir={decidir} tuyas={todoist.cuentas.hoy} hechas={todoist.cuentas.hechasHoy} />

      {decidir > 0 && <Seccion titulo="Espera tu decisión" n={decidir} tono="oro">
        {piden.map(t => <Fila key={t.id}
          marca={<IconoTipo tipo={tipoTerminal(t)} estado="pregunta" />}
          titulo={nombreTerminal(t)} linea={`Te pregunta: ${resumenRespuesta(t) ?? 'ábrelo para contestarle'}`} lineaTono="oro"
          dueno={t.subagente ? 'Levy' : harness(t)} cuando={t.subagente ? hace(t.subagente.creado) : undefined} onClick={() => abrir(t)} flecha
          accion={<button className={s.accionFila} onClick={e => { e.stopPropagation(); marcarRevisado(firmaRevision(t)) }} title="Ya lo revisé">Visto</button>} />)}
        {sinLeer.map(a => <Fila key={a.id}
          marca={<span className={s.marcaAviso}><Bell size={12} /></span>}
          titulo={a.title} linea={lineaAviso(a.body)} dueno={DUENO_AVISO[a.kind] ?? 'Levy'} cuando={hace(a.created_at)} flecha={!!a.url}
          onClick={a.url ? () => a.url!.startsWith('/') ? router.push(a.url!) : void abrirEnNavegador(a.url!) : undefined}
          accion={<button className={s.accionFila} onClick={e => { e.stopPropagation(); void marcarLeido(a) }} title="Ya lo vi">Leído</button>} />)}
      </Seccion>}

      {/* Los agentes viven en la píldora junto a «Levy» y en el Taller (5 oct 2026): aquí no se repiten. */}
      <TareasTodoist todoist={todoist} onConversar={ask} />
      {trabajos.error && <p className={s.nota}>{sinRespuestaDelServidor().replace(/\.$/, '')}: {trabajos.error}.</p>}
    </>}
  </div></div>
}

function Resumen({ decidir, tuyas, hechas }: { decidir: number; tuyas: number; hechas: number }) {
  const partes = [decidir && `${decidir} ${decidir === 1 ? 'espera' : 'esperan'} tu decisión`, tuyas && `${tuyas} tuyas hoy`, hechas && `${hechas} ${hechas === 1 ? 'hecha' : 'hechas'}`].filter(Boolean)
  const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zonaDueno() })
  return <div className={s.resumen}><h2>{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</h2>{partes.length > 0 && <p>{partes.join(' · ')}</p>}</div>
}

function Seccion({ titulo, n, tono, children }: { titulo: string; n: number; tono?: 'oro'; children: React.ReactNode }) {
  return <section className={s.seccion} data-tono={tono} aria-label={titulo}>
    <h3 className={s.seccionTitulo}>{titulo}<small>{n}</small></h3>
    <div className={s.lista}>{children}</div>
  </section>
}

function Fila({ marca, titulo, linea, lineaTono, dueno, cuando, onClick, accion, flecha, hecha }: {
  marca: React.ReactNode; titulo: string; linea?: string | null; lineaTono?: 'oro'; dueno?: string; cuando?: string
  onClick?: () => void; accion?: React.ReactNode; flecha?: boolean; hecha?: boolean
}) {
  const cuerpo = <>
    <span className={s.filaTexto}>
      <span className={s.filaNombre}>{titulo}</span>
      {linea && <span className={s.filaLinea} data-tono={lineaTono}>{linea}</span>}
    </span>
    {(dueno || cuando) && <span className={s.filaLado}>
      {dueno && <span className={s.dueno} data-dueno={dueno === 'Tú' ? 'tu' : dueno === 'Levy' ? 'levy' : 'agente'}>{dueno}</span>}
      {cuando && <span className={s.cuando}>{cuando}</span>}
    </span>}
  </>
  return <div className={s.tarea} data-hecha={hecha || undefined} data-tocable={onClick ? '' : undefined}>
    <span className={s.marca}>{marca}</span>
    {onClick ? <button className={s.tareaBoton} onClick={onClick}>{cuerpo}</button> : <span className={s.tareaBoton}>{cuerpo}</span>}
    {accion}
    {flecha && <ChevronRight size={14} className={s.flecha} aria-hidden />}
  </div>
}

/** El cuerpo de un aviso en una línea legible: sin el encabezado en mayúsculas del cron ni rutas crudas. */
const resumenRespuesta = (t: Terminal) => primeraLinea(ultimaRespuesta(t)?.texto ?? null)
const lineaAviso = (t: string | null) => primeraLinea(t)?.replace(/^[A-ZÁÉÍÓÚÑ0-9 ]{6,}\s*·\s*/, '').replace(/\\/g, '/') ?? null
const primeraLinea = (t: string | null) => t ? t.replace(/[#*_`>]/g, '').split('\n').map(x => x.trim()).find(Boolean)?.slice(0, 160) ?? null : null

function Cargando({ error }: { error?: string }) {
  return <div className={s.cargando} aria-busy={!error}>
    {error ? <><b>{sinRespuestaDelServidor().replace(/\.$/, '')}</b><span>{error}</span></> : <><span className={s.brillo} /><span className={s.brillo} /><span className={s.brillo} /></>}
  </div>
}

function Pie({ leidoEn, error, data }: { leidoEn?: number; error?: string; data?: Trabajos }) {
  // Edición cliente (29 oct 2026): no hay motor ni Studio; la fuente es su propia Arbrain.
  const cliente = esEdicionCliente()
  const respaldo = !cliente && data && data.fuente && data.fuente !== 'motor'
  return <footer className={s.pie}>
    <span className={s.vivo} data-error={error ? '' : undefined} data-respaldo={respaldo || undefined} aria-hidden />
    <span>{error ? (cliente ? 'Sin conexión con tu Arbrain' : 'Sin conexión con el Studio') : leidoEn ? `En vivo · ${data ? fuenteEnPalabras(data, cliente) : cliente ? 'tu Arbrain' : 'Studio'} · leído ${hace(leidoEn)}` : 'Leyendo…'}</span>
  </footer>
}

// ── Un agente o terminal abierto: su terminal VIVA del motor, aquí dentro ──
function DetalleTerminal({ id, onVolver }: { id: number; onVolver: () => void }) {
  const lectura = useFuente<Trabajos>(urlPanel(false), 4000)
  const data = lectura.data ?? lecturaEnCache<Trabajos>(urlPanel(false))
  const t = data?.terminales.find(x => x.id === id)
  const [soloLectura, setSoloLectura] = useState(false)
  useEffect(() => {
    // Esc vuelve, salvo con el foco en la terminal: ahí Esc es del agente (interrumpir, cerrar menús).
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !(e.target as HTMLElement | null)?.closest?.('.xterm')) { e.preventDefault(); onVolver() } }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onVolver])

  const estado = !t ? (data ? 'Esta terminal ya se cerró.' : 'Leyendo…')
    : esperaALevy(t) ? 'Le preguntó a Levy: él la contesta (si no, te llega en unos minutos)'
    : preguntaAlgo(t) ? (t.subagente?.escaladoPor ? `Te pregunta algo (${t.subagente.escaladoPor.toLowerCase()}): contéstale abajo` : 'Te pregunta algo: contéstale abajo')
    : t.estado === 'trabajando' ? `Trabajando${lineaLimpia(t.actividad) ? ` · ${lineaLimpia(t.actividad)}` : ''}`
    : t.estado === 'esperando' ? 'Terminó' : 'Terminal lista'
  const quien = t ? (t.subagente ? `Lo lanzó Levy ${hace(t.subagente.creado)}` : esAgente(t) ? `${harness(t)} · tuya` : 'Tuya') : null
  return <div className={s.detalle} data-viva>
    <div className={s.fijadaCabecera}>
      <button className={s.icono} onClick={onVolver} aria-label="Volver" title="Volver (Esc)"><ArrowLeft size={15} /></button>
      {t && <IconoTipo tipo={tipoTerminal(t)} estado={estadoTerminal(t)} grande />}
      <div className={s.detalleTitulo}>
        <b>{t ? nombreTerminal(t) : 'Terminal'}</b>
        <span>{t ? `${NOMBRE_TIPO[tipoTerminal(t)]} · ${estado}` : estado}</span>
      </div>
    </div>
    {t && <p className={s.vivaMeta}>{[quien, t.cwd.split('/').filter(Boolean).at(-1), dondeVive(t)].filter(Boolean).join(' · ')}</p>}
    {t && esAgente(t) && <FichaConsumo t={t} />}
    {t?.subagente && <details className={s.encargoPlegado}><summary>Su encargo</summary><p>{t.subagente.encargo}</p></details>}
    {t?.subagente?.entrega && t.subagente.entrega !== 'entregado' && <p className={s.aviso}>{t.subagente.entrega === 'pendiente' ? 'El encargo se está entregando: el CLI aún arrancaba.' : `El encargo no se confirmó (${t.subagente.entregaNota ?? 'sin detalle'}). Pídele a Levy que lo retome.`}</p>}
    {t?.origen === 'sin-pantalla' ? <>
      {/* Sin pantalla (6 oct 2026): no hay PTY; desde el 7 oct se ve trabajar con su actividad leída de la bitácora. */}
      <ActividadViva agente={t.id} cwd={t.cwd} />
      {t.conversacion?.error && <p className={s.aviso}>{t.conversacion.error}</p>}
      <p className={s.vivaPie}><span>En vivo desde su bitácora: corre como proceso propio y termina al responder. Para entrar a mano, pídele a Levy que lo abra en interactivo.</span></p>
    </> : <>
    {(t || !data) && <TerminalViva id={id} onEstado={e => setSoloLectura(!!e.soloLectura)} />}
    <p className={s.vivaPie}>
      <span>{soloLectura ? 'Solo lectura: esta terminal no acepta escritura desde aquí.' : 'En vivo desde el motor de Arbrain. Escribe directo en la terminal.'}</span>
    </p>
    </>}
  </div>
}

// ── Detalle de una tarea interna de Levy: vive en InternaDetalle.tsx (2 oct 2026) ──

// ── Taller: para quien construye ──
// Registro (5 oct 2026, retiro de /ops): el rastro de turnos, errores y rutinas de `ops_events`.
// El segmento a la vista vive en taller-segmento.ts: `mostrar servidores` y /servidores lo cambian desde fuera.

/** Pone un segmento del Taller (aterrizaje `?panel=taller&taller=registro`, la ruta /servidores). */
export const recordarSegmentoTaller = pedirSegmentoTaller

export function TallerPanel() {
  const { segmento: vista, cargar: cargarSegmento, elegir: elegirSegmento } = useSegmentoTaller()
  useEffect(() => { cargarSegmento() }, [cargarSegmento])
  const [detalle, setDetalle] = useState<number | null>(null)
  const [interna, setInterna] = useState<string | null>(null)
  // Si el segmento cambia desde fuera (Levy, un aviso), se sale del detalle que estuviera abierto.
  useEffect(() => { setDetalle(null); setInterna(null) }, [vista])
  const elegir = (v: SegmentoTaller) => elegirSegmento(v)
  // El pulso responde en todas las pestañas: la lectura sigue aunque estés en Registro o Archivos.
  const lectura = useFuente<Trabajos>(urlPanel(false), 4000)
  const data = lectura.data
  const enDetalle = detalle != null || interna != null

  return <div className={`${s.cuerpo} ${w.taller}`} role="tabpanel">
    {!enDetalle && <PulsoTaller data={data} onIr={elegir} />}
    <SegmentosTaller vista={vista} elegir={elegir} data={data} segmentos={SEGMENTOS_TALLER} />
    {vista === 'memoria' ? <MemoriaTaller />
      // Historia (28 oct 2026): la del dueño arriba y el historial de git como VS Code debajo (historia/Historia.tsx, HistoriaTaller).
      : vista === 'historia' ? <div className={w.vista}><HistoriaTaller /></div>
      // Rutinas, la vista viva (10 oct 2026): una sola vista con «cómo van» y «qué rinde» juntas; lo programado del Studio, al fondo.
      // Edición cliente (T8, 29 oct 2026): las rutinas de SU daemon, con crear, pausar y borrar (features/rutinas/RutinasCliente.tsx).
      : vista === 'rutinas' && esEdicionCliente() ? <RutinasCliente />
      : vista === 'rutinas' ? <div className={w.rutinas}><VistaRutinasViva fondo={data && <div className={w.vista}><ProgramadosStudio lista={data.servicios} /><p className={w.nota}><button className={w.enlace} onClick={() => elegir('registro')}>Registro de turnos y errores</button></p></div>} /></div>
      // Edición cliente (T16, 29 oct 2026): SU computadora (memoria, disco, reposo, cerrar apps), no el Studio de Daniel.
      : vista === 'maquina' && esEdicionCliente() ? <ComputadoraCliente />
      : vista === 'maquina' ? <MaquinaTaller data={data} onRegistro={() => elegir('registro')} />
      // El registro ya no es pestaña (5 oct 2026): sus errores se ven donde ocurren; el rastro fino queda detrás de un enlace.
      : vista === 'registro' ? <><div className={w.registroVolver}><button className={w.enlace} onClick={() => elegir('maquina')}>← Volver a Computadora</button></div><Registro /></>
      : !data ? <Cargando error={lectura.error} />
      : detalle != null ? <DetalleTerminal id={detalle} onVolver={() => setDetalle(null)} /> : interna != null ? <DetalleInterna id={interna} onVolver={() => setInterna(null)} /> : <AgentesTaller data={data} onAbrir={setDetalle} onAbrirInterna={setInterna} />}
    {(vista === 'terminales' || (vista === 'maquina' && !esEdicionCliente())) && detalle == null && <Pie leidoEn={lectura.leidoEn} error={lectura.error} data={data} />}
  </div>
}
