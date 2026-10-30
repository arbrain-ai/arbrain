'use client'

/**
 * Canvas v4 — la pizarra.
 *
 * Vive aqui y no en `app/canvas-lab/page.tsx` desde el 2 oct 2026: la misma
 * pizarra es la sección Lienzo (`/lienzo?p=`, antes `/canvas-lab`) y la pestaña Lienzo del panel de Arbrain
 * desprendida a su ventana (`pagina` + `incrustada`). Una sola pizarra, dos
 * puertas: nada de un segundo editor que diverja.
 *
 * Orquesta: compilador (semantica → geometria), motor de dibujo, maquina de
 * punteros, historial, autoguardado y la interfaz. Nada de logica de dominio
 * vive aqui; esto cablea las piezas y decide QUE pasa cuando algo ocurre.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { render, medirTituloMarco } from '@/features/canvas/render/engine'
import { computeDpr, fitBounds, puntoLocal, sanitizeCamera, screenToWorld, worldToScreen, zoomAt, type Viewport } from '@/features/canvas/render/viewport'
import type { BackgroundKind } from '@/features/canvas/render/background'
import { onImageLoaded } from '@/features/canvas/render/images'
import { exportarPNG, descargar } from '@/features/canvas/render/export'
import { THEMES, resolveRadius, type ThemeName } from '@/features/canvas/theme/tokens'
import { waitForFonts, browserMeasureContext } from '@/features/canvas/text/metrics-browser'
import { PointerMachine, SHAPE_TOOLS, type Tool, type ShapeTool } from '@/features/canvas/input/pointers'
import { pick } from '@/features/canvas/input/hit'
import { handleAt, selectionBounds, resizeRect, applyResize, CURSOR, esGiro, type HandleId } from '@/features/canvas/input/handles'
import { ajustarAngulo, anguloHacia, normalizar } from '@/features/canvas/model/rotate'
import { portAt, aceptaPuertos, cercaDe, type PortId } from '@/features/canvas/input/ports'
import { snapToElements, type Guia } from '@/features/canvas/input/snap'
import { reconcile, origenDeRegion, trasladar } from '@/features/canvas/model/from-compiled'
import { createConnector, reroute, rerouteAll, connectorsHuerfanos, ladoDeConexion } from '@/features/canvas/model/connect'
import { anchorOn } from '@/features/canvas/layout/route'
import {
  createSticky, createText, createShape, createImage, readImageFile,
  createTable, createEmbed, createSection, createCode, hijosDeSeccion, relayoutBoundText, cajaFantasma, cajaEnDireccion, boundTextFor, escribirTexto } from '@/features/canvas/model/create'
import { Autosave, type AutosaveStatus, type SaveFn } from '@/features/canvas/state/autosave'
import { firmarAutoria } from '@/features/canvas/model/autoria'
import { saveLocal, loadLocal, leerCamaraLocal, guardarCamaraLocal } from '@/features/canvas/state/local-store'
import {
  AnimadorCamara, DetectorRueda, deltasEnPx, factorDeRueda, siguienteNivel, zoomA, accionZoomDeTecla, suaveDoble,
} from '@/features/canvas/input/navegacion'
import { Paginas, ANCHO_RIEL } from '@/features/canvas/ui/Paginas'
import { DocEmbed, esEmbedDoc } from '@/features/canvas/ui/DocEmbed'
import { leerLigaDoc, type LigaDoc } from '@/features/canvas/model/doc'
import { conInteraccion } from '@/features/canvas/model/vista-embed'
import { usePanelFijadas } from '@/features/cabina/panel/fijadas'
import { resolverDestino } from '@/features/cabina/panel/bus'
import { mostrarPanel } from '@/features/cabina/panel/ventanas'
import { destinoDeEnlace, pastillasDe, pastillaEn } from '@/features/canvas/model/enlace'
import * as Nube from '@/features/canvas/state/nube'
import { programarMiniatura } from '@/features/canvas/state/miniaturas'
import { guardarReciente } from '@/features/canvas/state/recientes-lienzos'
import { SelectorLienzo } from '@/features/canvas/ui/lienzos/SelectorLienzo'
import { EVENTO_SELECTOR_LIENZO } from '@/shared/navigation/atajos-ctrl'
import { factorPaneo, factorZoom } from '@/features/canvas/input/sensibilidad'
import { History } from '@/features/canvas/state/history'
import { TextEditor } from '@/features/canvas/editing/TextEditor'
import { Toolbar, TOOL_SHORTCUTS } from '@/features/canvas/ui/Toolbar'
import { StatusBar } from '@/features/canvas/ui/StatusBar'
import { BarraContextual } from '@/features/canvas/ui/BarraContextual'
import { filtrarPorCategoria } from '@/features/canvas/model/filtro-seleccion'
import { acomodar } from '@/features/canvas/model/acomodar'
import { MenuContextual, type AccionMenu } from '@/features/canvas/ui/MenuContextual'
import { Atajos } from '@/features/canvas/ui/Atajos'
import { objetivosDeArrastre } from '@/features/canvas/model/arrastre'
import { agrupar, desagrupar, expandirSeleccion, esGrupo, regionDe, haySeleccionAgrupada, miembrosDeGrupo } from '@/features/canvas/model/group'
import * as Ico from '@/features/canvas/ui/icons'
import { aplicarTipografia, estiloComun, tieneTexto, type TipografiaPatch } from '@/features/canvas/model/typography'
import { AlignBar } from '@/features/canvas/ui/AlignBar'
import { Minimap } from '@/features/canvas/ui/Minimap'
import { Capitulos } from '@/features/canvas/ui/Capitulos'
import { MostrarEnLienzo } from '@/features/canvas/ui/MostrarEnLienzo'
import { useMostrarEnLienzo } from '@/features/canvas/ui/useMostrarEnLienzo'
import { capitulosDe, cajaDeTodo, camaraDeCapitulo, bajarEnCapitulo, capituloBajo, vuelo, duracionDeVuelo, type Capitulo } from '@/features/canvas/layout/capitulos'
import { anotarCuadro, anotarReact } from '@/features/canvas/render/sonda'
import { useCamaraViva, ConCamara } from '@/features/canvas/ui/CamaraViva'
import { ordenPorZDesc } from '@/features/canvas/model/orden'
import { align, distribute } from '@/features/canvas/model/align'
import type { CanvasElement, Camera, ShapeKind } from '@/features/canvas/model/element'
import { bounds, visualBounds } from '@/features/canvas/model/element'
import { esEdicionCliente } from '@/lib/edicion'
import { useNervio } from '@/features/canvas/ui/useNervio'
import { NervioVisor, type VisorAbierto } from '@/features/canvas/ui/NervioVisor'
import { disposicionVisor } from '@/features/canvas/model/visor-disposicion'
import { abrirEnNavegador } from '@/lib/navegador'
import { claveFuente, claveMedio, leerNervio, type VivoNervio } from '@/features/canvas/model/nervio'
import type { Pastilla } from '@/features/canvas/model/enlace'

const EDICION_CLIENTE = esEdicionCliente()

// Diagrama de demostración del banco de pruebas: un negocio de ejemplo, sin datos de nadie (red team 2: antes era el
// modelo de negocio del autor, con sus precios, y lo veía cualquier instalación).
const SPEC = {
  title: 'Negocio de ejemplo — de dónde viene el dinero',
  layout: { rankSep: 96, nodeSep: 44 },
  nodes: [
    { id: 'yt', role: 'trigger' as const, title: 'Contenido', caption: 'El canal que trae a la gente.', chips: [{ text: 'DUEÑO' }] },
    { id: 'lt', role: 'module' as const, title: 'Oferta de entrada', caption: 'Califica, enseña y calienta.', items: ['Mensual', 'Anual'], chips: [{ text: 'VIVO' }] },
    { id: 'com', role: 'card' as const, title: 'La comunidad', caption: 'Donde el cliente madura.' },
    { id: 'ht', role: 'deliverable' as const, title: 'Oferta premium', caption: 'El servicio acompañado.', chips: [{ text: 'EN OBRA' }] },
    { id: 'maq', role: 'agent' as const, title: 'La máquina en frío', caption: 'Un segundo canal de adquisición.', items: ['Diagnóstico', 'El regalo', 'La llamada'] },
    { id: 'riesgo', role: 'risk' as const, title: 'Devaluar la entrada', caption: 'Si se abarata, deja de calificar.' },
  ],
  // Las aristas declaran QUE CLASE de relacion son, no solo a donde van: un
  // flujo que ya corre no es lo mismo que uno fragil, ni que uno que ejecuta un
  // agente, ni que uno declarado y todavia hueco.
  edges: [
    { from: 'yt', to: 'lt', label: 'adquiere' },
    { from: 'lt', to: 'com' },
    { from: 'lt', to: 'maq', label: 'le enseña' },
    { from: 'com', to: 'ht', label: 'madura', kind: 'hueco' as const },
    { from: 'maq', to: 'ht', label: 'alimenta', kind: 'agente' as const },
    { from: 'lt', to: 'riesgo', label: 'si se abarata', kind: 'fragil' as const },
  ],
}

/** Cuanto mueve cada flecha, en unidades de mundo por pulsacion. */
const FLECHAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

/** La llave del banco de pruebas en el autoguardado y en IndexedDB. */
const LAB = 'lab'

const TABLA_DEMO = [
  ['Frente', 'Sensor', 'Estado'],
  ['Cadencia', 'videos/semana', 'en marcha'],
  ['MRR', 'Polar', 'plano'],
  ['Comunidad', 'autores/sem', 'subiendo'],
]

interface JudgeInfo {
  ok: boolean
  stats: Record<string, number>
  findings: Array<{ metric: string; severity: string; message: string }>
}

export interface PizarraProps {
  /** Pagina a abrir. Sin ella manda `?p=` de la URL. */
  pagina?: string
  /** Zona del mundo a encuadrar al abrir (la que Levy encuadro en el panel). Mirar no guarda la camara. */
  encuadre?: { x: number; y: number; width: number; height: number } | null
  /** Dentro de otra superficie (la ventana del panel): no reescribe la URL de quien la aloja. */
  incrustada?: boolean
  /** Sigue el tema de la app (sección Lienzo): sin botón de tema propio, para que no convivan dos temas en una pantalla. */
  temaApp?: ThemeName
  /**
   * En la pestaña del panel, junto al chat (4 oct 2026): los atajos (Supr, ⌘Z, letras, espacio) solo actúan con el
   * foco dentro de la pizarra. Sin esto, Supr con el foco en el chat borraba lo seleccionado en el lienzo.
   */
  soloConFoco?: boolean
  /**
   * Que hacer con una liga `doc:` (⌘+clic). Sin ella, el documento se abre en
   * la vista documento del panel derecho, la misma que usa Levy: nada saca de
   * Arbrain.
   */
  alAbrirDoc?: (liga: LigaDoc) => void
  /** La pizarra cambió de lienzo por dentro (selector del título, riel): quien la aloja actualiza su pestaña, sin abrir otra. */
  alCambiarPagina?: (id: string, nombre: string | null) => void
}

/** Techo de DPR mientras la cámara se mueve (ver `pintarRef`). */
const DPR_GESTO = 2

/**
 * Abre la liga de un elemento DENTRO de Arbrain (8 oct 2026): documentos, lienzos y vistas internas (/masterclass,
 * /calendar…) nacen como pestaña del panel en la ventana de «Dónde abre Levy» (izquierda por defecto). Solo un sitio
 * de fuera va al navegador. Quien aloja la pizarra puede quedarse con los `doc:` (`alAbrirDoc`).
 * El navegador se abre por `abrirEnNavegador` (14 oct): en la app de escritorio `window.open` no hacía nada.
 */
function abrirEnlace(link: string, alAbrirDoc?: (liga: LigaDoc) => void) {
  const doc = leerLigaDoc(link)
  if (doc && alAbrirDoc) { alAbrirDoc(doc); return }
  const d = destinoDeEnlace(link, typeof window !== 'undefined' ? window.location.origin : undefined)
  if (!d) return
  if (d.tipo === 'fuera') { void abrirEnNavegador(d.url); return }
  void resolverDestino().then(destino => {
    const id = usePanelFijadas.getState().fijar(`enlace:${link}`, d.input, true, { ventana: destino.ventana })
    mostrarPanel(id)
  })
}

export function Pizarra({ pagina, encuadre, incrustada, alAbrirDoc, temaApp, soloConFoco, alCambiarPagina }: PizarraProps = {}) {
  anotarReact()
  const raizRef = useRef<HTMLDivElement>(null)
  const soloConFocoRef = useRef(!!soloConFoco)
  /** ¿Esta tecla es de la pizarra? Siempre, salvo en el panel con el foco fuera de ella. */
  const teclaMia = useCallback(() => !soloConFocoRef.current || !!raizRef.current?.contains(document.activeElement), [])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const [elements, setElements] = useState<CanvasElement[]>([])
  const [themeName, setThemeName] = useState<ThemeName>(temaApp ?? 'claro')
  useEffect(() => { if (temaApp) setThemeName(temaApp) }, [temaApp])
  const [background, setBackground] = useState<BackgroundKind>('puntos')
  // La cámara del gesto vive fuera de React (ver CamaraViva.tsx); `camera` es la ASENTADA.
  const [camera, camViva] = useCamaraViva({ x: 0, y: 0, zoom: 0.7 })
  const setCamera = camViva.fijar
  const [viewport, setViewport] = useState<Viewport>({ width: 800, height: 600, dpr: 1 })
  /** Pestaña angosta (teléfono, panel estrecho): el nombre ya está en su pestaña o en la cabecera; la píldora del título se compacta. */
  const compacta = !!incrustada && viewport.width < 720
  const [tool, setTool] = useState<Tool>('select')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [conectando, setConectando] = useState<{
    desde: { x: number; y: number }; hasta: { x: number; y: number }; sobre: boolean
    fantasma?: { x: number; y: number; width: number; height: number; shape: ShapeKind; radius: number } | null
  } | null>(null)
  const [guias, setGuias] = useState<Guia[]>([])
  /** La pastilla de enlace bajo el puntero (model/enlace.ts): se pinta viva, el cursor es la mano y su clic la abre. */
  const [enlaceVivo, setEnlaceVivo] = useState<{ id: string; link: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Embeds que se pueden tocar ahora. Estado de VISTA: nunca entra al documento (model/vista-embed.ts). */
  const [embedsActivos, setEmbedsActivos] = useState<ReadonlySet<string>>(() => new Set())
  const [rubber, setRubber] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [draft, setDraft] = useState<CanvasElement | null>(null)
  const [judgeInfo, setJudgeInfo] = useState<JudgeInfo | null>(null)
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus>({ kind: 'limpio', version: 0 })
  const [depth, setDepth] = useState({ undo: 0, redo: 0 })
  const [fontsReady, setFontsReady] = useState(false)
  const [toFit, setToFit] = useState<{ width: number; height: number; x?: number; y?: number } | null>(null)
  /**
   * ¿Ya se leyo lo guardado?
   *
   * Existe porque durante un rato el lienzo GUARDABA en IndexedDB y no LEIA
   * nunca: `loadLocal` no se llamaba desde ningun lado. La barra decia
   * "guardado v16" y el trabajo a mano no sobrevivia una recarga — un actuador
   * acusando exito con el lazo abierto. Tambien ORDENA el arranque: compilar
   * antes de leer haria que la region se materialice contra un lienzo vacio y
   * decida su origen encima de lo que si estaba guardado.
   */
  const [cargado, setCargado] = useState(false)
  const [imgTick, setImgTick] = useState(0)
  const [paginas, setPaginas] = useState<Nube.PaginaResumen[]>([])
  const [carpetas, setCarpetas] = useState<Nube.Carpeta[]>([])
  /**
   * ⚠️ SE LEE DE LA URL EN EL PRIMER RENDER, no en un efecto.
   *
   * Estaba en un efecto, y eso abrio una ventana devastadora: durante los
   * primeros renders `paginaId` era null, el compilador creia estar en el banco
   * de pruebas, inyectaba su diagrama de demostracion, y el autoguardado lo
   * escribia — DENTRO de la pagina de Daniel. Costo el contenido de una pagina
   * suya (134 elementos reemplazados por 29 de demo) antes de que nadie lo
   * viera.
   *
   * `searchParams` es SINCRONO. No habia ninguna razon para diferirlo.
   */
  const [paginaId, setPaginaId] = useState<string | null>(() => {
    if (pagina) return pagina
    if (typeof window === 'undefined') return null
    return new URL(window.location.href).searchParams.get('p')
  })
  const [railAbierto, setRailAbierto] = useState(false)
  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [espejo, setEspejo] = useState<{ estado: Nube.EstadoEspejo; detalle?: string } | null>(null)
  /** Ajustes del lapiz, elegidos ANTES de trazar. `color` ausente = tinta del tema. */
  const [tinta, setTinta] = useState<{ color?: string; size: number }>({ size: 4 })
  const [atajos, setAtajos] = useState(false)
  const [mostrar] = useMostrarEnLienzo()
  const [editandoNombre, setEditandoNombre] = useState(false)
  /** Pagina del canvas anterior, convertida al leer y AUN NO escrita. */
  const [sinConvertir, setSinConvertir] = useState<Nube.InformeMigracion | null>(null)
  /** Espacio abajo: la mano manda aunque la herramienta sea otra. */
  const [manoTemporal, setManoTemporal] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; sobre: string | null; world: { x: number; y: number } } | null>(null)
  /** Elemento bajo el puntero y, si lo hay, el puerto vivo del que los ofrece. Los puertos se derivan abajo. */
  const [puertos, setPuertos] = useState<{ elementId: string; activo?: PortId | null } | null>(null)

  const t = THEMES[themeName]

  // Referencias vivas: se leen desde callbacks que no deben recrearse en cada
  // frame — un listener re-suscrito por cada punto del trazo pierde eventos.
  const elementsRef = useRef<CanvasElement[]>([]); elementsRef.current = elements
  /** EL SISTEMA NERVIOSO (14 oct 2026, model/nervio.ts): estados y medios vivos de los nodos conectados de la página. */
  const vivo = useNervio(elements, !!paginaId)
  const vivoRef = useRef<VivoNervio>(vivo); vivoRef.current = vivo
  /** El visor que abrió un nodo con nervio (video pausado y silenciado, vista previa o último evento). */
  const [visor, setVisor] = useState<VisorAbierto | null>(null)
  useEffect(() => { setVisor(null) }, [paginaId])
  const themeNameRef = useRef(themeName); themeNameRef.current = themeName
  const camRef = camViva.ref
  const vpRef = useRef(viewport); vpRef.current = viewport
  const toolRef = useRef(tool); toolRef.current = tool
  const draftRef = useRef<CanvasElement | null>(null)
  const machineRef = useRef<PointerMachine | null>(null)
  const autosaveRef = useRef<Autosave | null>(null)
  const historyRef = useRef(new History())
  const prevElementsRef = useRef<CanvasElement[]>([])
  /** Ultima version confirmada por el servidor para esta pagina. */
  const versionNubeRef = useRef(0)
  /**
   * Lo ultimo que se sabe que tiene el SERVIDOR (leido, guardado o recibido).
   * Es la base de la fusion de tres vias: distingue lo que esta mano creo y aun
   * no viaja de lo que sfmap borro a proposito (state/nube.ts).
   */
  const baseNubeRef = useRef<CanvasElement[] | null>(null)
  /**
   * La fusion dejo algo que el servidor no tiene. 'ya': el proximo render lo
   * manda a guardar. 'esperar': tras un choque doble, solo se actualiza lo
   * pendiente y el reintento espera la vuelta del sondeo.
   */
  const guardarTrasFusionRef = useRef<false | 'ya' | 'esperar'>(false)
  const editingRef = useRef<string | null>(null)
  const alAbrirDocRef = useRef(alAbrirDoc); alAbrirDocRef.current = alAbrirDoc
  /** La camara tal como se leyo o se mando a guardar: moverla es un cambio, no mirarla. */
  const camaraGuardadaRef = useRef<Camera | null>(null)
  /**
   * Las cámaras que NO son un movimiento del usuario: la que se leyó al abrir y la del encuadre de mirar (zona de
   * Levy o de la sección). Sin esto, en una carga en frío el encuadre y la cámara leída llegaban al autoguardado en
   * ciclos distintos, una parecía «movida» respecto de la otra y la pizarra guardaba la cámara: abrir Claridad desde
   * la sección Lienzo subía su versión (3 oct 2026, reproducido con una copia: v2 → v3 solo con la cámara).
   */
  const camarasDeMirarRef = useRef<Set<Camera>>(new Set())
  const encuadreRef = useRef(encuadre ?? null)
  const encuadreSinGuardar = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const incrustadaRef = useRef(!!incrustada)
  /** Ids que ya estaban al abrir o llegaron de otro aparato: no son de esta mano (model/autoria.ts). */
  const conocidosRef = useRef<Set<string>>(new Set())
  const selRef = useRef<Set<string>>(new Set()); selRef.current = selectedIds
  /** Grupo al que se ENTRO con doble clic: sus miembros se eligen y se mueven sueltos. Esc vuelve al grupo. */
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null)
  const grupoAbiertoRef = useRef<string | null>(null); grupoAbiertoRef.current = grupoAbierto
  // El grupo abierto se cierra solo si la seleccion sale de el (recuadro, ⌘A, clic fuera).
  useEffect(() => {
    if (!grupoAbierto) return
    const miembros = miembrosDeGrupo(elementsRef.current, grupoAbierto)
    if (selectedIds.size === 0 || [...selectedIds].some(id => !miembros.has(id))) setGrupoAbierto(null)
  }, [selectedIds, grupoAbierto])
  editingRef.current = editingId
  const paginaIdRef = useRef<string | null>(null); paginaIdRef.current = paginaId
  const tintaRef = useRef(tinta); tintaRef.current = tinta
  // La maquina de punteros se construye UNA sola vez: todo lo que sus
  // callbacks lean tiene que venir por ref o se queda congelado en el primer
  // render. El tema es lo ultimo que entro a esa lista (lo pide el fantasma
  // del puerto, que necesita el radio de esquina del tema activo).
  const tRef = useRef(t); tRef.current = t
  const sinConvertirRef = useRef<Nube.InformeMigracion | null>(null); sinConvertirRef.current = sinConvertir
  /**
   * De QUE pagina son los elementos que hay ahora mismo en memoria.
   *
   * `null` = del banco de pruebas. Es la llave del cinturon de seguridad del
   * autoguardado: si no coincide con la pagina abierta, no se escribe.
   */
  const dueñoRef = useRef<string | null>(null)
  const espejoRef = useRef<unknown>(null)
  /**
   * PUERTOS AL CLIC (5 oct 2026, Daniel: «no me gustan estos botoncotes del hover; solo si le doy clic al
   * componente deberian aparecer»). Al pasar el raton solo hay un contorno sutil; los puertos los ofrece el
   * elemento seleccionado (uno solo) o, con la herramienta conector, el que esta bajo el puntero.
   */
  const puertosVista = useMemo(() => {
    let dueño: string | null = null
    if (tool === 'select' && selectedIds.size === 1) {
      const id = selectedIds.values().next().value as string
      const el = elements.find(e => e.id === id)
      if (el && !el.locked && aceptaPuertos(el)) dueño = id
    } else if (tool === 'connector') dueño = puertos?.elementId ?? null
    return dueño ? { elementId: dueño, activo: puertos?.elementId === dueño ? puertos.activo ?? null : null } : null
  }, [tool, selectedIds, elements, puertos])
  const hoverId = tool === 'select' && puertos?.elementId && puertos.elementId !== puertosVista?.elementId
    && !selectedIds.has(puertos.elementId) ? puertos.elementId : null
  const puertosRef = useRef<{ elementId: string; activo?: PortId | null } | null>(null); puertosRef.current = puertosVista
  // Estado del elemento ANTES de empezar a redimensionar. Sin la foto inicial,
  // cada frame escalaria sobre el resultado del anterior y el tamaño se iria
  // exponencialmente.
  const resizeBaseRef = useRef<{ rect: ReturnType<typeof selectionBounds>; els: CanvasElement[] } | null>(null)
  /** Foto del giro al empezar: centro, angulo del puntero y elementos. */
  const giroBaseRef = useRef<{ centro: { x: number; y: number }; anguloInicial: number; els: CanvasElement[] } | null>(null)
  /** Foto del codo que se esta moviendo: donde nacio y que codos ya habia. */
  const codoBaseRef = useRef<{ indice: number; punto: { x: number; y: number }; previos: Array<{ x: number; y: number }> } | null>(null)
  /** true mientras un gesto continuo corre: el historial no graba dentro. */
  const gestoRef = useRef(false)
  /** Foto del documento ANTES del gesto, para grabar una sola entrada. */
  const antesDelGestoRef = useRef<CanvasElement[] | null>(null)
  const setSelectedId = useCallback((id: string | null) => {
    // Tocar un miembro selecciona TODO su grupo. Es lo que la palabra promete;
    // seleccionar solo la pieza que quedo bajo el dedo haria del grupo un
    // adorno.
    const abierto = grupoAbiertoRef.current
    if (abierto && (!id || elementsRef.current.find(e => e.id === id)?.groupId !== abierto)) setGrupoAbierto(null)
    setSelectedIds(id ? expandirSeleccion(elementsRef.current, new Set([id]), abierto) : new Set())
  }, [])

  const siguienteZ = useCallback(
    () => elementsRef.current.reduce((m, e) => Math.max(m, e.zIndex), 0) + 1, [])

  // ── fuentes ────────────────────────────────────────────────────────────────
  // Medir en frio devuelve las metricas de la fuente de respaldo y TODO el
  // layout nace torcido. Se espera, siempre.
  useEffect(() => {
    waitForFonts([
      { family: 'montserrat', weight: 400, size: 20 },
      { family: 'montserrat', weight: 700, size: 24 },
      { family: 'roboto-slab', weight: 900, size: 24 },
    ]).then(() => setFontsReady(true))
  }, [])

  useEffect(() => onImageLoaded(() => setImgTick(n => n + 1)), [])

  // ── el arbol de lienzos ────────────────────────────────────────────────────
  const refrescarArbol = useCallback(async () => {
    const [ps, cs] = await Promise.all([Nube.listarPaginas(), Nube.listarCarpetas()])
    setPaginas(ps); setCarpetas(cs) // las archivadas (lienzo o carpeta) las separa la vista: pliegue «Archivados»
    return ps
  }, [])

  useEffect(() => {
    // La pagina abierta vive en la URL. Es lo que hace que "mandame ese
    // diagrama" sea un enlace y no una instruccion.
    const url = new URL(window.location.href)
    const pedida = pagina ?? url.searchParams.get('p')
    // Si la pagina pedida no existe, se sale del modo pagina en vez de quedarse
    // esperando un documento que nunca va a llegar.
    refrescarArbol()
      .then(ps => { if (pedida && !ps.some(x => x.id === pedida)) setPaginaId(null) })
      .catch(() => {})
  }, [refrescarArbol])

  // ── leer lo guardado ───────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true
    // El cajon local es SOLO del banco de pruebas. Las paginas de la nube
    // cargan de la nube; mezclarlas en la misma llave haria que abrir una
    // pintara los elementos de otra.
    if (pagina || new URL(window.location.href).searchParams.get('p')) { setCargado(true); return }
    loadLocal('lab')
      .then(g => {
        if (!vivo) return
        if (g && g.elements.length) {
          setElements(g.elements)
          prevElementsRef.current = g.elements
          setCamera(sanitizeCamera(g.camera, { x: 0, y: 0, zoom: 1 }))
        }
        dueñoRef.current = null   // del banco de pruebas
        setCargado(true)
      })
      .catch(() => setCargado(true))
    return () => { vivo = false }
  }, [])

  /**
   * Abrir una pagina de la nube.
   *
   * El compilador NO debe correr mientras esto pasa: si lo hiciera, decidiria
   * el origen de su region contra un lienzo a medio cargar. Por eso `cargado`
   * baja y vuelve a subir.
   */
  useEffect(() => {
    if (!paginaId) return
    let vivo = true
    setCargado(false)
    setEmbedsActivos(new Set())   // la vista es de la pagina que se deja
    Nube.cargarPagina(paginaId)
      .then(pag => {
        if (!vivo) return
        setElements(pag.elements)
        prevElementsRef.current = pag.elements
        dueñoRef.current = paginaId          // estos elementos son de ESTA pagina
        conocidosRef.current = new Set(pag.elements.map(e => e.id))
        historyRef.current = new History()   // el historial es POR lienzo
        setDepth({ undo: 0, redo: 0 })
        // La cámara de ESTE aparato manda sobre la de la nube (state/local-store.ts): se abre donde la dejaste aquí.
        const camAbrir = leerCamaraLocal(paginaId) ?? pag.camera
        if (camAbrir) { const c = sanitizeCamera(camAbrir, { x: 0, y: 0, zoom: 1 }); camaraGuardadaRef.current = c; camarasDeMirarRef.current = new Set([c]); setCamera(c) }
        versionNubeRef.current = pag.version
        baseNubeRef.current = pag.elements
        // Si viene del canvas anterior, la conversion es SOLO una lectura: se
        // marca para bloquear el autoguardado hasta que Daniel decida.
        setSinConvertir(pag.esV4 ? null : (pag.informe ?? null))
        // Se abre con el TEMA con el que se dibujo. Sus textos del v3 guardan
        // colores horneados: en el tema equivocado quedan blanco sobre blanco
        // y parece que la conversion perdio el contenido.
        if (!pag.esV4 && pag.tema) setThemeName(pag.tema)
        setCargado(true)
        // Copia nueva: si el mismo encuadre ya se había pedido antes de cargar, React no volvería a encuadrar
        // y quedaría la cámara guardada (pasaba al expandir a la sección Lienzo con zona).
        if (encuadreRef.current) { const e = { ...encuadreRef.current }; encuadreSinGuardar.current = e; setToFit(e); encuadreRef.current = null }
        if (incrustadaRef.current) return
        const url = new URL(window.location.href)
        url.searchParams.set('p', paginaId)
        window.history.replaceState(null, '', url.toString())
      })
      .catch(() => { if (vivo) setCargado(true) })
    return () => { vivo = false }
  }, [paginaId])

  /**
   * El espejo entre dispositivos.
   *
   * Se FUSIONA por elemento, jamas se reemplaza el documento: reemplazar hace
   * que el ultimo aparato en hablar pise lo que el otro acaba de dibujar. Y se
   * ignora el eco del propio guardado comparando la version.
   *
   * Dos entradas, una sola fusion (3 oct 2026): el canal (la web y Levy avisan
   * al guardar) y el SONDEO de version (sfmap guarda por REST y no avisa). Lo
   * que llega mientras la mano esta en un gesto, escribiendo o guardando se
   * deja para la vuelta siguiente: no se pisa lo que el usuario esta editando.
   */
  const ocupado = useCallback(() =>
    gestoRef.current || !!editingRef.current || !!draftRef.current
    || !!autosaveRef.current?.guardando(), [])

  const aplicarRemoto = useCallback((id: string, doc: { elements: CanvasElement[]; version: number }) => {
    if (paginaIdRef.current !== id || dueñoRef.current !== id) return   // llego tarde: ya es otra pagina
    if (doc.version <= versionNubeRef.current) return   // es mi propio eco
    versionNubeRef.current = doc.version
    // Lo que llega firmado ya dice de quien es; lo que llega sin firma lo puso otro (sfmap, Levy, otro aparato).
    for (const e of doc.elements) if (!e.autor) conocidosRef.current.add(e.id)
    const base = baseNubeRef.current
    baseNubeRef.current = doc.elements
    setElements(prev => {
      const r = Nube.fusionarConBase(base, prev, doc.elements)
      // El historial no registra lo que llego de fuera: deshacer debe
      // deshacer LO MIO, no revertir el trabajo de otro dispositivo.
      prevElementsRef.current = r.elements
      // Si el resultado lleva algo que el servidor no tiene (o habia un
      // guardado pendiente con la foto vieja), se guarda la FUSION. Si no,
      // recibir es mirar y no escribe.
      guardarTrasFusionRef.current = r.elements !== prev
        && (r.localAporta || !(autosaveRef.current?.isClean() ?? true)) ? 'ya' : false
      return r.elements
    })
  }, [])

  useEffect(() => {
    if (!paginaId) return
    return Nube.escuchar(paginaId, doc => {
      // Ocupado: el sondeo lo recoge en cuanto la mano suelte.
      if (ocupado()) return
      aplicarRemoto(paginaId, doc)
    }, (e, detalle) => { espejoRef.current = { estado: e, detalle }; setEspejo({ estado: e, detalle }) })
  }, [paginaId, ocupado, aplicarRemoto])

  /**
   * EL SONDEO (3 oct 2026). sfmap guarda por REST directo y el canal no se
   * entera; sin esto la pizarra web seguia enseñando lo de antes hasta
   * reabrir. Pregunta SOLO la version (dos campos), solo con la pestaña a la
   * vista, cada ~4.5 s como sfmap. Si subio y no fuimos nosotros, trae el
   * documento y lo fusiona. Nunca escribe por si mismo.
   */
  useEffect(() => {
    if (!paginaId) return
    let vivo = true
    let corriendo = false
    const vuelta = async () => {
      if (!vivo || corriendo || document.visibilityState !== 'visible') return
      if (dueñoRef.current !== paginaId) return            // todavia cargando
      corriendo = true
      try {
        const servidor = await Nube.versionDePagina(paginaId).catch(() => null)
        if (!vivo) return
        const que = Nube.decidirSondeo({ servidor, conocida: versionNubeRef.current, ocupado: ocupado() })
        if (que !== 'traer') return
        const pag = await Nube.cargarPagina(paginaId)
        if (!vivo || ocupado()) return
        aplicarRemoto(paginaId, { elements: pag.elements, version: pag.version })
      } catch { /* la red fallo: la proxima vuelta lo intenta */ }
      finally { corriendo = false }
    }
    const reloj = setInterval(() => void vuelta(), Nube.SONDEO_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') void vuelta() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      vivo = false
      clearInterval(reloj)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [paginaId, ocupado, aplicarRemoto])

  // ── compilar ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (viewport.width < 2 || !cargado) return
    // El diagrama de demostracion es del BANCO DE PRUEBAS, no de los lienzos de
    // Daniel. Compilarlo dentro de una pagina suya le inyectaria seis tarjetas
    // que el no pidio, en cada apertura.
    if (paginaId) return
    fetch('/api/canvas/compile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spec: SPEC, regionId: 'demo', theme: themeName,
        targetAspect: viewport.width / viewport.height,
      }),
    })
      .then(r => r.json())
      .then((d: { ok: boolean; elements?: CanvasElement[]; bounds?: { width: number; height: number }; judge?: JudgeInfo }) => {
        if (!d.ok) return
        // El compilador entrega coordenadas LOCALES. Antes de reconciliar hay
        // que decidir DONDE va la region, o el diagrama se pinta encima de lo
        // que la mano ya tenia en (0,0).
        const entrantes = d.elements ?? []
        const origen = origenDeRegion(elementsRef.current, entrantes, 'demo')
        const puestos = trasladar(entrantes, origen)
        // RECONCILIAR, no reemplazar: `setElements(compilado)` borraria todo lo
        // que puso la mano cada vez que el diagrama se recompila.
        const r = reconcile(elementsRef.current, puestos, 'demo')
        setElements(r.elements)
        setJudgeInfo(d.judge ?? null)
        if (d.bounds) setToFit({ ...d.bounds, x: origen.x, y: origen.y })
      })
      .catch(() => {})
  }, [themeName, viewport.width, viewport.height, cargado, paginaId])

  // ── viewport ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const medir = () => {
      const el = wrapRef.current
      if (!el) return
      const w = el.clientWidth, h = el.clientHeight
      const dpr = computeDpr(w, h, window.devicePixelRatio || 1)
      // Mismo tamaño y DPR = mismo estado: evita re-render en cadena con el observer.
      setViewport(v => (v.width === w && v.height === h && v.dpr === dpr ? v : { width: w, height: h, dpr }))
    }
    medir()
    window.addEventListener('resize', medir)
    // Auto-sanacion: el observer se pierde con HMR y el canvas queda cortado.
    document.addEventListener('visibilitychange', medir)
    // El contenedor cambia SIN que cambie la ventana (expandir el panel, arrastrar su borde, abrir/cerrar
    // el rail): sin esto el bitmap conserva su tamaño y el CSS 100%×100% lo estira («se pellizca, se jala»).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    if (wrapRef.current) ro?.observe(wrapRef.current)
    // El DPR cambia al mover la ventana entre pantallas o al hacer zoom de la app: no dispara `resize`
    // en todos los casos, pero sí este media query (se rearma con cada valor nuevo).
    let mq: MediaQueryList | null = null
    const armarDpr = () => {
      mq?.removeEventListener('change', alCambiarDpr)
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      mq.addEventListener('change', alCambiarDpr)
    }
    const alCambiarDpr = () => { medir(); armarDpr() }
    armarDpr()
    return () => {
      window.removeEventListener('resize', medir); document.removeEventListener('visibilitychange', medir)
      ro?.disconnect(); mq?.removeEventListener('change', alCambiarDpr)
    }
  }, [])

  /**
   * La sección Lienzo (3 oct 2026) aloja UNA pizarra viva: expandir otra página o zona desde el panel o el
   * chat cambia `pagina`/`encuadre` sin desmontarla. La página que la propia pizarra eligió en su rail ya
   * es la suya (llega de vuelta por la URL) y no hace nada. Mirar sigue sin guardar.
   */
  const encuadreClave = encuadre ? `${encuadre.x},${encuadre.y},${encuadre.width},${encuadre.height}` : ''
  const propsVistas = useRef(false)
  useEffect(() => {
    if (!propsVistas.current) { propsVistas.current = true; return }
    if (!pagina) return
    if (pagina !== paginaIdRef.current) { encuadreRef.current = encuadre ?? null; void irAPagina(pagina); return }
    if (encuadre) { encuadreSinGuardar.current = encuadre; setToFit(encuadre) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `encuadre` entra por su clave de valor
  }, [pagina, encuadreClave])

  useEffect(() => {
    if (!toFit || viewport.width <= 1) return
    const c = fitBounds(toFit, viewport, 48, CHROME)
    // El encuadre que llega del panel es MIRAR, no editar: no cuenta como cambio que guardar, tampoco
    // cuando se recalcula porque la ventana termino de medirse.
    if (toFit === encuadreSinGuardar.current) { camaraGuardadaRef.current = c; camarasDeMirarRef.current.add(c) }
    setCamera(c)
  }, [toFit, viewport])

  // ── autoguardado + historial ───────────────────────────────────────────────
  useEffect(() => {
    /**
     * DOS capas, una sola bandera de exito.
     *
     * Local (IndexedDB) es la que sobrevive sin red y hace que abrir sea
     * instantaneo. La nube es la que hace que el iPad vea lo mismo. Se escriben
     * las dos, pero el acuse que cuenta es el de la NUBE cuando hay pagina
     * abierta: decir "guardado" porque el disco local dijo que si, mientras el
     * servidor nunca recibio nada, es literalmente el bug D1 del v3.
     */
    const guardar: SaveFn = async payload => {
      // De QUE pagina es lo pendiente: lo sello `mark` al marcar. 'lab' = el banco de pruebas.
      const id = payload.pageId === LAB ? null : payload.pageId
      /**
       * Lo pendiente es de una pagina que YA NO esta abierta (se cambio de pagina o se borro la que tenia). No se
       * escribe ni se reintenta: reintentarlo esperaba 2 s, para entonces la pagina nueva ya habia cargado, el
       * cinturon de abajo pasaba y lo de la pagina VIEJA quedaba escrito en la NUEVA. Cambiar de pagina ya vacia
       * el autoguardado antes (`irAPagina`); esto es la red para lo que llegue tarde.
       */
      if (id !== paginaIdRef.current) return { ok: false, descartar: true }
      /**
       * CINTURON: solo se escribe en la pagina de la que salieron estos
       * elementos.
       *
       * No es redundante con el arreglo de arriba: es la defensa ESTRUCTURAL.
       * Cualquier camino que produzca elementos de un documento y los guarde en
       * otro —una carrera nueva, un cambio de pagina a medias, un compilador
       * disparando antes de tiempo— muere aqui, sin depender de que alguien se
       * acuerde del orden de los efectos.
       */
      if (dueñoRef.current !== id) {
        return { ok: false, error: 'los elementos no son de esta página; no se escribe' }
      }
      // El cajon local es del banco de pruebas: las paginas de la nube cargan de la nube. Escribir aqui cada
      // pagina (8-13 MB con imagenes) solo pisaba el banco con el contenido de la ultima pagina abierta.
      if (!id) return saveLocal(payload)

      try {
        const firmados = firmarAutoria(payload.elements, conocidosRef.current)
        // Encima de la version conocida: si sfmap (u otro) guardo mientras
        // tanto, el servidor dice 409 y se fusiona antes de escribir.
        const baseAntes = baseNubeRef.current
        const r = await Nube.guardarSinPisar({
          base: baseAntes, elements: firmados, baseVersion: versionNubeRef.current,
          guardar: (els, v) => Nube.guardarSobreVersion(id, els, payload.camera, v),
          traer: () => Nube.cargarPagina(id).then(p => ({ elements: p.elements, version: p.version })),
        })
        if (r.remoto && paginaIdRef.current === id) {
          // Lo que trajo el choque entra tambien a la PANTALLA, con la misma
          // fusion que el sondeo: lo que la mano hizo mientras tanto se queda.
          const remoto = r.remoto.elements
          for (const e of remoto) if (!e.autor) conocidosRef.current.add(e.id)
          setElements(prev => {
            const f = Nube.fusionarConBase(baseAntes, prev, remoto)
            prevElementsRef.current = f.elements
            guardarTrasFusionRef.current = r.ok ? 'ya' : 'esperar'
            return f.elements
          })
        }
        if (!r.ok) {
          versionNubeRef.current = r.remoto.version
          baseNubeRef.current = r.remoto.elements
          return { ok: false, transitorio: true, error: 'chocó con otro guardado: se reintenta en la siguiente vuelta', reintentaEn: Nube.SONDEO_MS }
        }
        versionNubeRef.current = r.version
        baseNubeRef.current = r.guardados
        // La miniatura de la lista se regenera con rebote tras el último guardado (6 oct 2026). Lo que se dibuje es lo que
        // haya EN ESE MOMENTO en este lienzo; si ya se cambió de página, no se toca la miniatura de otra.
        programarMiniatura(id, () => paginaIdRef.current === id ? { elements: elementsRef.current, theme: THEMES[themeNameRef.current] } : null)
        return { ok: true, version: r.version }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'no se pudo guardar en la nube' }
      }
    }
    const a = new Autosave(LAB, guardar, { debounceMs: 700, onStatus: setSaveStatus })
    autosaveRef.current = a

    // Lo dibujado en los ultimos 700ms se pierde si el rebote no alcanza a
    // disparar antes de que la pestaña se vaya. `pagehide` y no `beforeunload`:
    // iOS no entrega beforeunload al suspender una pestaña (hecho de
    // plataforma ya documentado para la limpieza de presencia — aplica igual
    // aqui). `visibilitychange` se escucha ademas porque en iOS llega ANTES.
    const volcar = () => { void a.flush() }
    const alOcultar = () => { if (document.hidden) volcar() }
    window.addEventListener('pagehide', volcar)
    document.addEventListener('visibilitychange', alOcultar)
    return () => {
      window.removeEventListener('pagehide', volcar)
      document.removeEventListener('visibilitychange', alOcultar)
      a.dispose()   // sin esto, un guardado fallido reintenta para siempre
    }
  }, [])

  useEffect(() => {
    // El guard viejo era `elements.length === 0`, y hacia que vaciar el lienzo
    // no se guardara nunca: al recargar reaparecia lo borrado. La condicion
    // correcta no es "hay algo", es "ya lei lo que habia".
    if (!fontsReady || !cargado) return
    const prev = prevElementsRef.current
    prevElementsRef.current = elements

    /**
     * UN GESTO = UNA ENTRADA DE HISTORIAL.
     *
     * Medido el 19 ago: arrastrar 120px producia DIEZ entradas —una por cada
     * `pointermove`— asi que ⌘Z devolvia el elemento un pixel y medio. El
     * historial estaba tecnicamente vivo y practicamente inservible; se vio
     * como "deshacer no hace nada", que es como se siente.
     *
     * Mientras un gesto corre no se graba nada; al soltar se graba UNA entrada
     * contra la foto de ANTES de empezar. El autoguardado si sigue marcando en
     * cada cuadro: perder trabajo por no guardar es peor que guardar de mas.
     */
    if (gestoRef.current) {
      if (!antesDelGestoRef.current) antesDelGestoRef.current = prev
    } else if (prev.length > 0 && historyRef.current.record('editar', prev, elements)) {
      setDepth(historyRef.current.depth())
    }
    /**
     * UNA PAGINA SIN CONVERTIR NO SE GUARDA, y no lo intenta.
     *
     * Se abrio convertida en memoria; escribirla sobrescribiria el documento
     * del v3 sin que nadie lo haya pedido. El autoguardado dispara a los 700ms
     * de mirar la pagina: sin este freno, ABRIR seria MIGRAR.
     *
     * Se frena AQUI y no dentro del guardado: dejar que lo intente y falle
     * enciende el reintento cada 2s para siempre, y pinta 'error al guardar'
     * en rojo cuando el sistema esta haciendo justo lo correcto.
     */
    if (sinConvertirRef.current) {
      setSaveStatus({ kind: 'bloqueado', motivo: 'Es del canvas anterior — conviértela para poder guardar' })
      return
    }
    /**
     * ABRIR NO ES ESCRIBIR (2 oct 2026). Recien cargada, o tras una fusion que
     * no cambio nada, el documento es el MISMO arreglo y la camara la misma que
     * se guardo: no hay nada que guardar. Antes cada apertura reescribia la
     * pagina entera (y con dos editores abiertos se rebotaban sin fin).
     */
    if (guardarTrasFusionRef.current) {
      const modo = guardarTrasFusionRef.current
      guardarTrasFusionRef.current = false
      // Lo fusionado ya ES lo del servidor (el reintento lo escribio): nada que guardar.
      if (baseNubeRef.current && Nube.mismoContenido(elements, baseNubeRef.current)) return
      camaraGuardadaRef.current = camera
      if (modo === 'esperar') autosaveRef.current?.reemplazar(elements, camera, dueñoRef.current ?? LAB)
      else autosaveRef.current?.mark(elements, camera, dueñoRef.current ?? LAB)
      return
    }
    // Una cámara que solo se leyó o se encuadró para mirar no es un cambio que guardar (ver camarasDeMirarRef).
    const soloMirar = camarasDeMirarRef.current.has(camera)
    if (!Nube.hayCambioQueGuardar({ prev, elements, camaraGuardada: soloMirar ? camera : camaraGuardadaRef.current, camera })) return
    if (!soloMirar) camaraGuardadaRef.current = camera
    /**
     * En una pagina de la nube, MOVERSE no sube el documento (5 oct 2026): la camara se recuerda en este aparato
     * (state/local-store.ts) y viaja a la nube con la siguiente edicion de verdad. El banco de pruebas sigue igual:
     * su guardado es local y barato.
     */
    const dueño = dueñoRef.current
    if (dueño && Nube.mismoContenido(prev, elements)) {
      if (!soloMirar) recordarCamara(dueño, camera)
      return
    }
    autosaveRef.current?.mark(elements, camera, dueño ?? LAB)
  }, [elements, camera, fontsReady, cargado])

  /** La camara de esta pagina en este aparato, con un respiro: una animacion son 60 cuadros, no 60 escrituras. */
  const camaraLocalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordarCamara = useCallback((pagina: string, c: Camera) => {
    if (camaraLocalRef.current) clearTimeout(camaraLocalRef.current)
    camaraLocalRef.current = setTimeout(() => guardarCamaraLocal(pagina, c), 250)
  }, [])

  /**
   * CAMBIAR DE PAGINA vacia antes el autoguardado de la que se deja.
   *
   * El rail y el panel cambiaban `paginaId` de golpe: lo editado en los ultimos 700 ms seguia esperando su rebote
   * y, al disparar, ya no sabia a donde iba (ver `guardar`). Vaciar primero lo escribe donde debe.
   */
  const irAPagina = useCallback(async (id: string | null) => {
    if (id === paginaIdRef.current) return
    await autosaveRef.current?.flush().catch(() => {})
    setPaginaId(id)
  }, [])

  // Ctrl+L (`useAtajosCtrl`): abre o cierra el selector de lienzos del título. La pizarra del panel solo lo toma con el foco
  // dentro (primera vuelta) o, si ninguna lo tomó, cuando se ve (segunda); una oculta nunca.
  useEffect(() => {
    const al = (e: Event) => {
      const alguna = !!(e as CustomEvent<{ alguna?: boolean }>).detail?.alguna
      if (!raizRef.current || raizRef.current.getClientRects().length === 0) return
      if (!alguna && !teclaMia()) return
      e.preventDefault()
      setSelectorAbierto(v => !v)
    }
    window.addEventListener(EVENTO_SELECTOR_LIENZO, al)
    return () => window.removeEventListener(EVENTO_SELECTOR_LIENZO, al)
  }, [teclaMia])

  // Cada lienzo que se abre queda en «recientes» (selector del título) y, si la pizarra está alojada en una pestaña, esta se entera
  // para seguir mostrando el lienzo que ahora hay (su título, el «abierta» de «¿Qué lienzo?»). Quien aloja ignora lo que ya sabe.
  const alCambiarRef = useRef(alCambiarPagina); alCambiarRef.current = alCambiarPagina
  const paginasRef = useRef(paginas); paginasRef.current = paginas
  useEffect(() => {
    if (!paginaId) return
    guardarReciente(paginaId)
    alCambiarRef.current?.(paginaId, paginasRef.current.find(x => x.id === paginaId)?.nombre ?? null)
  }, [paginaId])

  /** Abre y cierra un gesto para que el historial lo vea como UNO. */
  const abrirGesto = useCallback(() => { gestoRef.current = true }, [])
  const cerrarGesto = useCallback((etiqueta: string) => {
    gestoRef.current = false
    const antes = antesDelGestoRef.current
    antesDelGestoRef.current = null
    if (!antes) return
    if (historyRef.current.record(etiqueta, antes, elementsRef.current)) {
      setDepth(historyRef.current.depth())
    }
  }, [])

  /**
   * Encuadrar = enseñar LO QUE HAY, no la ultima region compilada.
   *
   * La primera version encuadraba `toFit`, que son los limites que devolvio el
   * compilador. Consecuencia medida: con una pizarra dibujada a mano y el
   * diagrama deshecho, pulsar "Encuadrar" no movia la camara ni un pixel —
   * seguia apuntando a un diagrama que ya no existia. Un encuadre que ignora el
   * documento es un encuadre que miente.
   *
   * Con seleccion encuadra la seleccion, que es lo que hace cualquier lienzo
   * serio; sin seleccion, todo. Si el lienzo esta vacio no hace nada: mover la
   * camara a la nada desorienta mas que quedarse quieto.
   */
  /**
   * Lo que ocupa la interfaz flotante encima del lienzo, en px de pantalla.
   *
   * Medido de los propios componentes: rail de herramientas a la izquierda,
   * cabecera con el nombre arriba, barra de estado abajo. Vive en UNA constante
   * porque los dos caminos que encuadran (el boton y el auto-encuadre tras
   * compilar) tienen que usar el mismo margen — dos numeros distintos aqui es
   * como el v3 acabo con tres geometrias de figura.
   */
  const CHROME = { left: 96, top: 76, bottom: 72, right: 16 }

  /**
   * La camara animada (5 oct 2026). Teclado, encuadrar, los botones de zoom y la rueda del raton llegan a su destino
   * en ~200 ms en vez de saltar: el ojo sigue lo que miraba. La mano directa (arrastrar, trackpad, pellizco) cancela.
   */
  const animRef = useRef<AnimadorCamara | null>(null)
  if (!animRef.current) animRef.current = new AnimadorCamara(c => setCamera(c), () => camRef.current)
  const irCamara = useCallback((c: Camera, ms = 200, curva?: (t: number) => number) => {
    animRef.current!.ir(sanitizeCamera(c, camRef.current), ms, curva)
  }, [])
  // ── capitulos ────────────────────────────────────────────────────────────
  /**
   * Leer el lienzo como un relato (6 oct 2026, `layout/capitulos.ts`). Los capitulos se recalculan cuando el
   * documento se ASIENTA, no en cada cuadro de un arrastre: agrupar islas recorre medio lienzo y no tiene por que
   * competir con la mano.
   */
  const [capitulos, setCapitulos] = useState<Capitulo[]>([])
  const capitulosRef = useRef(capitulos); capitulosRef.current = capitulos
  const [capitulo, setCapitulo] = useState<number | null>(null)
  const capituloRef = useRef(capitulo); capituloRef.current = capitulo
  const [vueloMs, setVueloMs] = useState(0)
  useEffect(() => {
    const r = setTimeout(() => setCapitulos(prev => {
      const nuevos = capitulosDe(elements)
      // Mismo relato = mismo arreglo: el velo no vuelve a viajar por una edicion que no movio ningun capitulo.
      const igual = nuevos.length === prev.length && nuevos.every((c, i) => c.id === prev[i].id && c.titulo === prev[i].titulo
        && c.caja.x === prev[i].caja.x && c.caja.y === prev[i].caja.y && c.caja.width === prev[i].caja.width && c.caja.height === prev[i].caja.height)
      return igual ? prev : nuevos
    }), 250)
    return () => clearTimeout(r)
  }, [elements])
  // Otra pagina, otro relato: se abre en la vista de siempre.
  useEffect(() => { setCapitulo(null) }, [paginaId])
  useEffect(() => { if (capitulo != null && capitulo >= capitulos.length) setCapitulo(null) }, [capitulo, capitulos.length])
  /** El indice vive encima de la barra de estado: el capitulo se encuadra sin quedar debajo de el. */
  const CHROME_CAPITULO = { ...CHROME, bottom: CHROME.bottom + 44 }
  const volarA = useCallback((destino: Camera) => {
    const vp = vpRef.current
    const a = animRef.current!.destino()
    const b = sanitizeCamera(destino, camRef.current)
    const ms = duracionDeVuelo(a, b, vp.width)
    setVueloMs(ms)
    animRef.current!.ir(b, ms, suaveDoble, (x, y, t) => vuelo(x, y, t, vp.width))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const irCapitulo = useCallback((i: number) => {
    const c = capitulosRef.current[i]
    if (!c) return
    setCapitulo(i)
    volarA(camaraDeCapitulo(c.caja, vpRef.current, CHROME_CAPITULO))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volarA])
  const verTodo = useCallback(() => {
    const caps = capitulosRef.current
    setCapitulo(null)
    if (caps.length) volarA(fitBounds(cajaDeTodo(caps), vpRef.current, 48, CHROME_CAPITULO))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volarA])
  /**
   * La mano tambien lee: si paneas hasta otro capitulo y te detienes, el capitulo abierto pasa a ser ese (la
   * ventana se desliza hasta el). Alejarte hasta ver el lienzo de lejos cierra el capitulo, sin pedirlo.
   */
  useEffect(() => {
    const i = capituloRef.current
    if (i == null || animRef.current?.animando()) return
    const caps = capitulosRef.current
    const c = caps[i]
    if (!c) return
    if (camera.zoom < camaraDeCapitulo(c.caja, vpRef.current, CHROME_CAPITULO).zoom * 0.45) { setCapitulo(null); return }
    const bajo = capituloBajo(camera, caps)
    if (bajo != null && bajo !== i) { setVueloMs(420); setCapitulo(bajo) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  /** Donde esta el puntero sobre el lienzo, si esta encima. El zoom de teclado se ancla ahi; si no, al centro. */
  const punteroRef = useRef<{ x: number; y: number } | null>(null)
  const anclaZoom = useCallback(() =>
    punteroRef.current ?? { x: vpRef.current.width / 2, y: vpRef.current.height / 2 }, [])
  /** Zoom a un nivel absoluto, desde el DESTINO pendiente: tres ⌘+ seguidos encadenan, no se pisan. */
  const zoomAnimado = useCallback((nivel: (z: number) => number, ancla = anclaZoom()) => {
    const d = animRef.current!.destino()
    irCamara(zoomA(d, vpRef.current, ancla, nivel(d.zoom)), 180)
  }, [irCamara, anclaZoom])

  /** `todo` ignora la seleccion (⌘1); `seleccion` exige una (⌘2); sin modo, la seleccion o todo (el boton). */
  const encuadrar = useCallback((modo?: 'todo' | 'seleccion') => {
    const todos = elementsRef.current
    const sel = selRef.current
    if (modo === 'seleccion' && sel.size === 0) return
    const objetivo = modo !== 'todo' && sel.size > 0 ? todos.filter(e => sel.has(e.id)) : todos
    if (objetivo.length === 0) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const e of objetivo) {
      // Misma razon que en el export: se encuadra lo que el OJO ve, y el pie de
      // una tarjeta cuelga fuera de su caja.
      const b = visualBounds(e)
      if (b.x < x0) x0 = b.x
      if (b.y < y0) y0 = b.y
      if (b.x + b.width > x1) x1 = b.x + b.width
      if (b.y + b.height > y1) y1 = b.y + b.height
    }
    irCamara(fitBounds({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, vpRef.current, 48, CHROME), 320, suaveDoble)
  }, [irCamara])

  /**
   * Tipografia sobre la seleccion. UNA puerta para la barra y para los atajos:
   * si cada uno aplicara por su cuenta, ⌘B y el boton de negrita acabarian
   * haciendo cosas distintas sobre una tarjeta compilada.
   */
  const aplicarTipo = useCallback((p: TipografiaPatch) => {
    setElements(prev => prev.map(el => {
      if (!selRef.current.has(el.id) || !tieneTexto(el)) return el
      const cambiado = aplicarTipografia(el, p)
      if (cambiado === el) return el
      // Cambiar de familia o de tamaño cambia DONDE cortan los renglones. Sin
      // re-maquetar, el motor pinta lineas cortadas para la fuente anterior.
      const remaquetado = relayoutBoundText(browserMeasureContext, cambiado)
      if (remaquetado.origin && !remaquetado.origin.pinned) {
        remaquetado.origin = { ...remaquetado.origin, pinned: true }
      }
      return remaquetado
    }))
  }, [])

  /**
   * Las operaciones de estructura, en UN lugar.
   *
   * El menu contextual, los atajos de teclado y el inspector llaman aqui. Si
   * cada superficie implementara la suya, "traer al frente" haria tres cosas
   * distintas — que es literalmente lo que le paso al v3 con la geometria.
   */
  const ops = useMemo(() => {
    const sel = () => selRef.current
    const mut = (f: (prev: CanvasElement[]) => CanvasElement[]) => setElements(f)
    return {
      borrar: () => {
        if (sel().size === 0) return
        mut(prev => {
          const quedan = prev.filter(el => !sel().has(el.id))
          const huerfanos = new Set(connectorsHuerfanos(quedan))
          return quedan.filter(el => !huerfanos.has(el.id))
        })
        setSelectedIds(new Set())
      },
      duplicar: () => {
        const copias = elementsRef.current.filter(el => sel().has(el.id)).map((el, i) => ({
          ...el, id: `${el.id}-copia-${Date.now().toString(36)}-${i}`,
          x: el.x + 24, y: el.y + 24, zIndex: siguienteZ() + i,
          origin: undefined, groupId: undefined,
        }))
        if (copias.length === 0) return
        mut(prev => [...prev, ...copias])
        setSelectedIds(new Set(copias.map(c => c.id)))
      },
      alFrente: () => mut(prev => {
        const top = prev.reduce((m, e) => Math.max(m, e.zIndex), 0)
        return prev.map(el => sel().has(el.id) ? { ...el, zIndex: top + 1 } : el)
      }),
      alFondo: () => mut(prev => {
        const min = prev.reduce((m, e) => Math.min(m, e.zIndex), 0)
        return prev.map(el => sel().has(el.id) ? { ...el, zIndex: min - 1 } : el)
      }),
      subir: () => mut(prev => prev.map(el => sel().has(el.id) ? { ...el, zIndex: el.zIndex + 1 } : el)),
      bajar: () => mut(prev => prev.map(el => sel().has(el.id) ? { ...el, zIndex: el.zIndex - 1 } : el)),
      bloquear: (v: boolean) => mut(prev => prev.map(el => sel().has(el.id) ? { ...el, locked: v } : el)),
      agrupar: () => { setGrupoAbierto(null); mut(prev => agrupar(prev, sel()) ?? prev) },
      desagrupar: () => { setGrupoAbierto(null); mut(prev => desagrupar(prev, sel()) ?? prev) },
      seleccionarRegion: (id: string) => setSelectedIds(regionDe(elementsRef.current, id)),
      // Un elemento compilado que la mano FIJO puede devolverse al compilador.
      // Sin esta puerta, fijar es irreversible y la unica salida es borrarlo.
      soltarAlCompilador: () => mut(prev => prev.map(el =>
        sel().has(el.id) && el.origin?.pinned ? { ...el, origin: { ...el.origin, pinned: false } } : el)),
    }
  }, [siguienteZ])

  const aplicarHistorial = useCallback((r: { elements: CanvasElement[] } | null) => {
    if (!r) return
    prevElementsRef.current = r.elements   // no re-grabar el deshacer como edicion
    setElements(r.elements)
    setDepth(historyRef.current.depth())
  }, [])
  const deshacer = useCallback(() => aplicarHistorial(historyRef.current.undo(elementsRef.current)), [aplicarHistorial])
  const rehacer = useCallback(() => aplicarHistorial(historyRef.current.redo(elementsRef.current)), [aplicarHistorial])

  // ── crear ──────────────────────────────────────────────────────────────────
  const crearEnPunto = useCallback((t: Tool, world: { x: number; y: number }) => {
    const z = siguienteZ()
    const nuevo =
      t === 'sticky' ? createSticky(browserMeasureContext, world, 'Nota nueva', z)
      : t === 'table' ? createTable(browserMeasureContext, world, TABLA_DEMO, z)
      // Ejemplo de embebido: el conectoma de muestra que viaja con la app, en el origen actual (sin puerto fijo).
      : t === 'embed' ? createEmbed(world, `${typeof window === 'undefined' ? '' : window.location.origin}/conectoma/index.html?g=vsm`, z)
      : t === 'code' ? createCode(world,
          'const moat = contexto   // el modelo es commodity\nfunction compilar(spec) {\n  const caja = medir(spec.titulo)\n  return distribuir(caja, 1.5)\n}',
          'ts', z)
      : createText(browserMeasureContext, world, 'Escribe aquí', z)
    setElements(prev => [...prev, nuevo])
    setSelectedId(nuevo.id)
    setTool('select')   // tras crear, se vuelve al puntero: nadie quiere 8 notas seguidas
  }, [siguienteZ])

  const insertarImagen = useCallback(async (file: File, world?: { x: number; y: number }) => {
    const leida = await readImageFile(file)
    const { width, height } = leida
    // Al documento va la URL del archivo subido, no la data URL (ver `subirImagen`).
    const src = await Nube.subirImagen(file, leida.src)
    const centro = world ?? { x: camRef.current.x, y: camRef.current.y }
    const el = createImage(centro, src, width, height, siguienteZ(), file.name)
    setElements(prev => [...prev, el])
    setSelectedId(el.id)
  }, [siguienteZ])

  // Portapapeles PROPIO, no el del sistema: serializar elementos al
  // portapapeles del sistema obliga a un formato de texto que cualquier app
  // puede corromper, y pegar entre pestañas distintas del mismo lienzo no
  // aporta nada aqui. El del sistema se sigue escuchando para IMAGENES.
  const portapapelesRef = useRef<CanvasElement[]>([])

  /**
   * Pega el portapapeles. Con `destino`, el grupo pegado se centra AHI.
   *
   * Sin destino se pega desplazado del original, que es lo correcto para ⌘V
   * (el ojo ya sabe donde estaba). Con destino —el "Pegar aquí" del menu— se
   * centra en el punto, porque ahi el usuario señalo un lugar y esperar que
   * aparezca en otro seria desobedecer.
   */
  const pegar = useCallback((destino?: { x: number; y: number }) => {
    const fuente = portapapelesRef.current
    if (fuente.length === 0) return
    const z0 = elementsRef.current.reduce((m, el) => Math.max(m, el.zIndex), 0)
    let dx = 28, dy = 28
    if (destino) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const el of fuente) {
        const b = bounds(el)
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y)
        x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height)
      }
      dx = destino.x - (x0 + x1) / 2
      dy = destino.y - (y0 + y1) / 2
    }
    const sello = Date.now().toString(36)
    const nuevos = fuente.map((el, i) => ({
      ...el,
      id: `${el.id}-copia-${sello}-${i}`,
      x: el.x + dx, y: el.y + dy, zIndex: z0 + 1 + i,
      origin: undefined,      // una copia es de la mano, no del compilador
      groupId: undefined,     // ni hereda la pertenencia del original
      ...(el.type === 'connector'
        ? { points: el.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) }
        : {}),
    })) as CanvasElement[]
    setElements(prev => [...prev, ...nuevos])
    setSelectedIds(new Set(nuevos.map(n => n.id)))
  }, [])
  const pegarEn = useCallback((w: { x: number; y: number }) => pegar(w), [pegar])
  // El listener del portapapeles se registra UNA vez y no debe recrearse en
  // cada render; lee la version viva por referencia.
  const pegarRef = useRef(pegar); pegarRef.current = pegar

  /**
   * ¿ESTE PORTAPAPELES ES DEL LIENZO? (5 oct 2026)
   *
   * Los tres listeners viven en `window`, y antes solo se apartaban cuando el lienzo editaba un texto.
   * Con la pizarra abierta en el panel, pegar una captura EN EL CHAT la metía también en la página
   * (así cayeron cuatro capturas de 5 000 px en el Customer Journey, 13 MB y «error al guardar»), y
   * ⌘X sobre texto del chat borraba lo seleccionado en el lienzo. Ahora el lienzo solo toma el
   * portapapeles si el foco está en él, o en ningún campo y el último clic fue dentro de él.
   */
  const ultimoClicDentroRef = useRef(false)
  useEffect(() => {
    const alPulsar = (e: PointerEvent) => { ultimoClicDentroRef.current = !!raizRef.current?.contains(e.target as Node) }
    document.addEventListener('pointerdown', alPulsar, true)
    return () => document.removeEventListener('pointerdown', alPulsar, true)
  }, [])
  const portapapelesMio = useCallback((): boolean => {
    const activo = document.activeElement as HTMLElement | null
    if (activo?.hasAttribute('data-canvas-editing')) return false
    if (activo && raizRef.current?.contains(activo)) return true
    const campo = !!activo && (activo.isContentEditable || /^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(activo.tagName))
    if (campo) return false
    return ultimoClicDentroRef.current && (!soloConFocoRef.current || activo === document.body || !activo)
  }, [])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!portapapelesMio()) return
      const file = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'))?.getAsFile()
      if (file) { e.preventDefault(); void insertarImagen(file); return }
      if (portapapelesRef.current.length === 0) return
      e.preventDefault()
      pegarRef.current()
    }
    const onCopy = (e: ClipboardEvent) => {
      if (!portapapelesMio()) return
      if (selRef.current.size === 0) return
      e.preventDefault()
      portapapelesRef.current = elementsRef.current.filter(el => selRef.current.has(el.id))
    }
    const onCut = (e: ClipboardEvent) => {
      if (!portapapelesMio()) return
      if (selRef.current.size === 0) return
      e.preventDefault()
      portapapelesRef.current = elementsRef.current.filter(el => selRef.current.has(el.id))
      setElements(prev => {
        const quedan = prev.filter(el => !selRef.current.has(el.id))
        const huerfanos = new Set(connectorsHuerfanos(quedan))
        return quedan.filter(el => !huerfanos.has(el.id))
      })
      setSelectedIds(new Set())
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
    }
  }, [insertarImagen, portapapelesMio])

  // ── maquina de punteros ────────────────────────────────────────────────────
  if (!machineRef.current && typeof window !== 'undefined') {
    machineRef.current = new PointerMachine({
      onCamera: setCamera,
      hitTest: (world, coarse) => pick(elementsRef.current, world, { coarse, zoom: camRef.current.zoom, medirTitulo: medirTituloMarco })?.id ?? null,
      esSeleccionado: id => selRef.current.has(id),
      estadoSeleccion: world => {
        const ids = selRef.current
        if (ids.size < 2) return { cantidad: ids.size, ancla: null, dentroDelRecuadro: false }
        const rect = selectionBounds(elementsRef.current, ids)
        const dentro = !!rect && world.x >= rect.x && world.x <= rect.x + rect.width && world.y >= rect.y && world.y <= rect.y + rect.height
        return { cantidad: ids.size, ancla: ids.values().next().value ?? null, dentroDelRecuadro: dentro }
      },
      onSelect: (id, conMeta) => {
        /*
         * ⌘ + CLIC ABRE EL ENLACE.
         *
         * El popover del enlace lo prometia por escrito y no existia: la marca
         * se pintaba en la esquina y no llevaba a ningun sitio. Prometer una
         * capacidad en la interfaz sin construirla es el pecado del v3 escrito
         * en otro idioma — ahi el contrato mentia, aqui mentia un tooltip.
         *
         * `noopener,noreferrer` porque el destino es una URL que la mano
         * escribio: la pestaña nueva no debe poder tocar esta.
         */
        if (conMeta && id) {
          const el = elementsRef.current.find(e => e.id === id)
          if (el?.link) { abrirEnlace(el.link, alAbrirDocRef.current); return }
          const doc = el?.type === 'embed' ? leerLigaDoc(el.url) : null
          if (doc) { abrirEnlace(`doc:${doc.ruta}`, alAbrirDocRef.current); return }
        }
        setSelectedId(id)
      },
      onToggleSelect: id => setSelectedIds(prev => {
        const n = new Set(prev)
        n.has(id) ? n.delete(id) : n.add(id)
        return n
      }),
      handleAt: (world, coarse) => {
        // UN CONECTOR no se redimensiona: se DOBLA. Sus manijas son los puntos
        // medios de cada tramo, y arrastrar uno mete un codo a mano que el
        // router respeta a partir de entonces. Sin esto, la unica ruta posible
        // es la que el algoritmo eligio — y cuando se equivoca no hay apelacion.
        const solo = selRef.current.size === 1
          ? elementsRef.current.find(e => e.id === [...selRef.current][0]) : null
        if (solo?.type === 'connector') {
          const r = (coarse ? 26 : 13) / camRef.current.zoom
          for (let i = 0; i + 1 < solo.points.length; i++) {
            const m = { x: (solo.points[i].x + solo.points[i + 1].x) / 2,
                        y: (solo.points[i].y + solo.points[i + 1].y) / 2 }
            if (Math.hypot(world.x - m.x, world.y - m.y) <= r) return `codo:${i}`
          }
          return null
        }
        const rect = selectionBounds(elementsRef.current, selRef.current)
        if (!rect) return null
        return handleAt(rect, world, camRef.current.zoom, coarse)
      },
      portAt: (world, coarse) => {
        // Solo el elemento que ya esta ofreciendo sus puertos puede iniciar el
        // gesto. Si se buscara en TODOS, un puerto invisible de un vecino
        // robaria el clic — el peor tipo de fallo: el que no se ve.
        const id = puertosRef.current?.elementId
        if (!id) return null
        const el = elementsRef.current.find(e => e.id === id)
        if (!el) return null
        const puerto = portAt(el, world, camRef.current.zoom, coarse)
        return puerto ? { id, puerto: puerto.id } : null
      },
      onResize: (h, delta, proporcional) => {
        abrirGesto()
        if (h.startsWith('codo:')) {
          // El codo se inserta UNA vez, al empezar, y despues solo se mueve. Si
          // se insertara en cada frame, un arrastre dejaria treinta codos.
          const tramo = Number(h.slice(5))
          setElements(prev => prev.map(el => {
            if (el.type !== 'connector' || !selRef.current.has(el.id)) return el
            const base = codoBaseRef.current ?? (codoBaseRef.current = {
              indice: tramo,
              punto: { x: (el.points[tramo].x + el.points[tramo + 1].x) / 2,
                       y: (el.points[tramo].y + el.points[tramo + 1].y) / 2 },
              previos: el.waypoints ?? [],
            })
            const movido = { x: base.punto.x + delta.x, y: base.punto.y + delta.y }
            // El indice del tramo cuenta desde el primer punto, que es el
            // anclaje: el codo va DESPUES de los codos previos que quedan antes
            // de ese tramo.
            const antes = base.previos.slice(0, Math.max(0, base.indice))
            const despues = base.previos.slice(Math.max(0, base.indice))
            return { ...el, waypoints: [...antes, movido, ...despues], updatedAt: Date.now() }
          }))
          return
        }
        if (!resizeBaseRef.current) {
          // Foto del estado inicial, una sola vez por gesto.
          resizeBaseRef.current = {
            rect: selectionBounds(elementsRef.current, selRef.current),
            els: elementsRef.current.filter(e => selRef.current.has(e.id) && !e.locked),
          }
        }
        const base = resizeBaseRef.current
        if (!base.rect) return
        const nuevo = resizeRect(base.rect, h as HandleId, delta, proporcional)
        const ids = new Set(base.els.map(e => e.id))
        setElements(prev => prev.map(el => {
          if (!ids.has(el.id)) return el
          const original = base.els.find(x => x.id === el.id)!
          const redimensionado = applyResize(original, base.rect!, nuevo)
          // Redimensionar tambien es tocar: si era compilado, queda fijado.
          if (redimensionado.origin && !redimensionado.origin.pinned) {
            redimensionado.origin = { ...redimensionado.origin, pinned: true }
          }
          // El texto ligado se re-ajusta al nuevo tamaño, o queda desbordado.
          return relayoutBoundText(browserMeasureContext, redimensionado)
        }))
      },
      onResizeEnd: () => {
        resizeBaseRef.current = null
        codoBaseRef.current = null
        setElements(prev => rerouteAll(prev))
        setTimeout(() => cerrarGesto('redimensionar'), 0)
      },
      onRotate: (world, shift) => {
        abrirGesto()
        if (!giroBaseRef.current) {
          const r = selectionBounds(elementsRef.current, selRef.current)
          if (!r) return
          const centro = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
          giroBaseRef.current = {
            centro,
            // El angulo de PARTIDA del puntero. Sin el, agarrar el tirador
            // desde cualquier lado teletransporta el elemento al angulo del
            // dedo en vez de girarlo desde donde estaba.
            anguloInicial: anguloHacia(centro, world),
            els: elementsRef.current.filter(e => selRef.current.has(e.id) && !e.locked),
          }
        }
        const base = giroBaseRef.current
        const delta = anguloHacia(base.centro, world) - base.anguloInicial
        const ids = new Set(base.els.map(e => e.id))
        setElements(prev => prev.map(el => {
          if (!ids.has(el.id)) return el
          const original = base.els.find(x => x.id === el.id)!
          const girado = {
            ...el,
            rotation: normalizar(ajustarAngulo(original.rotation + delta, shift)),
            updatedAt: Date.now(),
          }
          if (girado.origin && !girado.origin.pinned) girado.origin = { ...girado.origin, pinned: true }
          return girado
        }))
      },
      onRotateEnd: () => { giroBaseRef.current = null; setTimeout(() => cerrarGesto('girar'), 0) },
      onConnecting: (fromId, hasta) => {
        if (!fromId || !hasta) { setConectando(null); return }
        const el = elementsRef.current.find(e => e.id === fromId)
        if (!el) return
        const sobre = pick(elementsRef.current, hasta, { zoom: camRef.current.zoom, medirTitulo: medirTituloMarco })
        // LA LINEA DE PREVIO NACE EN EL BORDE, no en el centro.
        //
        // Salia del centro exacto de la tarjeta y se veia atravesarla entera
        // hasta el puntero. Es el gesto que MAS se mira —lo tienes delante todo
        // el rato que dura el arrastre— y prometia un anclaje que el conector
        // final no iba a tener. Ahora usa la misma boca cardinal que usara la
        // flecha de verdad al soltar: lo que ves mientras arrastras es lo que
        // te queda.
        const b = bounds(el)
        const boca = anchorOn({ id: el.id, x: b.x, y: b.y, width: b.width, height: b.height }, hasta, 0)
        const agarra = !!sobre && sobre.id !== fromId
        setConectando({
          desde: boca, hasta, sobre: agarra,
          // Sobre un elemento NO hay fantasma: ahi el gesto conecta, no crea.
          // Enseñar los dos a la vez prometeria dos cosas distintas del mismo
          // soltar, y una de las dos seria mentira.
          fantasma: agarra ? null : {
            ...cajaFantasma(el, hasta),
            shape: el.type === 'shape' ? el.shape : 'rect',
            radius: el.type === 'shape' ? resolveRadius(tRef.current, el.role, el.trazo)
                                        : tRef.current.roles.card.radius,
          },
        })
      },
      onConnect: (fromId, toId, punto, puerto, arrastre) => {
        setConectando(null)
        setPuertos(null)
        const origen = elementsRef.current.find(e => e.id === fromId)
        if (!origen) return

        if (toId) {
          setElements(prev => {
            const destino = prev.find(e => e.id === toId)
            /*
             * SE RECUERDA POR DONDE LA CONECTASTE.
             *
             * `puerto` es el lado del que tiraste; el del destino se deduce de
             * DONDE soltaste sobre el. A partir de aqui esos dos lados no se
             * mueven aunque muevas las cajas — que es lo que Daniel pidio.
             *
             * Solo pasa cuando lo hace la MANO. Lo que compila el agente sigue
             * con anclaje libre, porque ahi nadie eligio un lado y dejar que el
             * router elija el mejor es lo correcto.
             */
            const conn = createConnector(fromId, toId,
              prev.reduce((m, e) => Math.min(m, e.zIndex), 0) - 1,
              { fromPort: puerto ?? undefined,
                toPort: destino ? ladoDeConexion(destino, punto) : undefined })
            return rerouteAll([...prev, conn])
          })
          setTool('select')
          return
        }

        /*
         * SOLTAR EN EL VACIO CREA LA FIGURA, YA CONECTADA.
         *
         * Antes esto era `if (!toId) return`: el gesto mas natural del lienzo
         * —tirar de un puerto hacia donde quieres seguir— no hacia nada. Para
         * encadenar dos ideas habia que crear la figura, moverla, cambiar a la
         * herramienta de conector, apuntar, arrastrar y volver a seleccionar.
         * Seis pasos para lo que es UN gesto.
         *
         * Dos formas de invocarlo, y la diferencia importa:
         *   · ARRASTRAR → la figura nace donde la soltaste.
         *   · CLIC en el puerto (sin mover) → nace a una distancia estandar en
         *     esa direccion. Es el gesto de las flechitas direccionales, y es
         *     el que construye una cadena limpia sin apuntar a nada.
         */
        const caja = arrastre ? cajaFantasma(origen, punto) : cajaEnDireccion(origen, puerto)
        const z = siguienteZ()
        const nueva = createShape(
          browserMeasureContext,
          origen.type === 'shape' ? origen.shape : 'rect',
          caja, z, '',
          origen.type === 'shape' ? origen.role : 'card')
        // La flecha sale por el puerto del que tiraste y entra por el lado
        // OPUESTO de la figura nueva: es la unica combinacion que no obliga a
        // la linea a rodear la caja que acaba de nacer.
        const opuesto = { n: 's', s: 'n', e: 'w', w: 'e' } as const
        setElements(prev => rerouteAll([
          ...prev, nueva,
          createConnector(fromId, nueva.id, prev.reduce((m, e) => Math.min(m, e.zIndex), 0) - 1,
            puerto ? { fromPort: puerto, toPort: opuesto[puerto] } : undefined),
        ]))
        setSelectedIds(new Set([nueva.id]))
        setTool('select')
        // Y se abre para ESCRIBIR. Una figura nueva vacia es una pregunta sin
        // responder; Miro hace lo mismo y por eso encadenar ideas ahi se siente
        // como escribir, no como dibujar.
        setEditingId(nueva.id)
      },
      onMarquee: setMarquee,
      onMarqueeEnd: (box, aditivo) => {
        // Se selecciona por INTERSECCION, no por contencion total: exigir que
        // el elemento quepa entero obliga a rodear todo con precision y es lo
        // que hace sentir "duro" un lienzo.
        const tocados = elementsRef.current.filter(e => {
          const b = { x: e.x, y: e.y, width: e.width, height: e.height }
          return b.x < box.x + box.width && b.x + b.width > box.x
              && b.y < box.y + box.height && b.y + b.height > box.y
        }).map(e => e.id)
        setSelectedIds(prev => aditivo ? new Set([...prev, ...tocados]) : new Set(tocados))
      },
      // Activar/soltar un embed es VISTA: no toca el documento ni sube la version.
      onSelectOutside: () => setEmbedsActivos(prev => prev.size ? new Set() : prev),
      onActivate: id => {
        const el = elementsRef.current.find(e => e.id === id)
        if (!el) return
        // Doble clic sobre un miembro de un grupo ENTRA al grupo y deja solo ese miembro; el siguiente doble clic lo edita.
        if (el.groupId && grupoAbiertoRef.current !== el.groupId) {
          setGrupoAbierto(el.groupId)
          setSelectedIds(new Set([id]))
          return
        }
        if (el.type === 'text' || el.type === 'shape' || el.type === 'frame') { setEditingId(id); return }
        if (el.type === 'embed') {
          setEmbedsActivos(prev => prev.has(id) ? prev : new Set([...prev, id]))
        }
      },
      onDuplicarParaArrastrar: id => {
        const base = elementsRef.current.filter(el =>
          selRef.current.has(id) && selRef.current.size > 1 ? selRef.current.has(el.id) : el.id === id)
        if (base.length === 0) return null
        const sello = Date.now().toString(36)
        const mapa = new Map(base.map((el, i) => [el.id, `${el.id}-alt-${sello}-${i}`]))
        const z0 = elementsRef.current.reduce((m, el) => Math.max(m, el.zIndex), 0)
        const copias = base.map((el, i) => ({
          ...el, id: mapa.get(el.id)!, zIndex: z0 + 1 + i,
          origin: undefined, groupId: undefined,
          // Un conector duplicado apunta a las COPIAS de sus extremos si
          // tambien viajaron; si no, se queda enganchado a los originales, que
          // es lo unico que puede significar.
          ...(el.type === 'connector'
            ? { fromId: mapa.get(el.fromId) ?? el.fromId, toId: mapa.get(el.toId) ?? el.toId }
            : {}),
        })) as CanvasElement[]
        setElements(prev => [...prev, ...copias])
        setSelectedIds(new Set(copias.map(c => c.id)))
        return mapa.get(id) ?? null
      },
      onDragElement: (id, d) => { abrirGesto(); setElements(prev => {
        const arrastrado = prev.find(e => e.id === id)
        if (!arrastrado) return prev

        /**
         * QUE se mueve. Se deriva de los DATOS, no del estado de React.
         *
         * Antes se leia `selRef.current` para decidir, y ahi habia una carrera
         * medida el 19 ago: al tocar un miembro de un grupo, `onSelect` pide
         * expandir la seleccion al grupo entero, pero ese `setState` todavia no
         * llego cuando el primer `pointermove` pregunta — asi que el grupo se
         * rompia y solo viajaba la pieza tocada. La pertenencia vive en el
         * elemento, asi que preguntarsela a el no tiene carrera posible.
         */
        const objetivos = objetivosDeArrastre(prev, id, selRef.current, grupoAbiertoRef.current)
        if (objetivos.size === 0) return prev
        // IMANTADO: se calcula sobre la posicion YA desplazada, y el ajuste se
        // suma al delta. Calcularlo sobre la posicion vieja imanta a donde
        // estaba, no a donde va, y el elemento se siente pegajoso.
        const caja = { x: arrastrado.x + d.x, y: arrastrado.y + d.y, w: arrastrado.width, h: arrastrado.height }
        const s = snapToElements(caja, prev, camRef.current.zoom, objetivos)
        setGuias(s.guias)
        const dx = d.x + s.dx, dy = d.y + s.dy

        const actualizados = prev.map(el => {
          if (!objetivos.has(el.id)) return el
          const movido = el.type === 'connector'
            // Un conector SUELTO (sin extremos, dibujado a mano) se mueve por
            // sus puntos: su x/y no significan nada.
            ? { ...el, points: el.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })), updatedAt: Date.now() }
            : { ...el, x: el.x + dx, y: el.y + dy, updatedAt: Date.now() }
          // LA TESIS DE LAS DOS CAPAS: si la mano toca algo compilado, queda
          // FIJADO y el compilador deja de mandarlo — pero lo sigue esquivando.
          if (movido.origin && !movido.origin.pinned) {
            movido.origin = { ...movido.origin, pinned: true }
          }
          return movido
        })
        // Los conectores SIGUEN a sus extremos. Sin esto, mover una tarjeta
        // deja sus flechas flotando en el aire — el sintoma clasico de un
        // diagrama que se degrada con el uso.
        return reroute(actualizados, objetivos)
      }) },
      // Al SOLTAR se re-rutea todo: una tarjeta movida puede estorbar a una
      // flecha ajena. Hacerlo en cada frame haria saltar flechas lejanas sin
      // motivo aparente, asi que se corrige al final.
      onDragEnd: (id, movio) => {
        setGuias([])   // las guias son del gesto, no del estado
        // Un CLIC no mueve nada: re-rutear todo ahi era A* sobre cada conector (con 937 elementos, 13-23 s por clic
        // medido en WebKit y Chrome) y ademas reescribia `updatedAt` de todas las flechas, disparando el autoguardado.
        if (movio) setElements(prev => rerouteAll(prev, objetivosDeArrastre(prev, id, selRef.current, grupoAbiertoRef.current)))
        // En el siguiente tick: el rerouteAll de arriba todavia no llego.
        setTimeout(() => cerrarGesto('mover'), 0)
      },
      onCreateAt: crearEnPunto,
      onRubber: (_t, box) => setRubber(box),
      onCreateBox: (t, box) => {
        const nuevo = t === 'section'
          ? createSection(box)
          : t === 'text'
          // El arrastre define la COLUMNA del texto, no su caja: el alto lo
          // pone el contenido, porque un bloque de texto crece hacia abajo.
          ? createText(browserMeasureContext, box, 'Escribe aquí', siguienteZ(), box.width)
          : createShape(browserMeasureContext, t as ShapeTool, box, siguienteZ())
        setElements(prev => [...prev, nuevo])
        setSelectedId(nuevo.id)
        setTool('select')
        /*
         * SE ABRE PARA ESCRIBIR.
         *
         * Daniel, sobre la captura de Miro: *"al insertar un rectangulo el
         * texto aparece centrado"*. Lo que ese detalle esconde es que la
         * figura nace LISTA para recibir texto — no hay que descubrir que se
         * escribe con doble clic.
         *
         * Una seccion NO entra a edicion: su titulo es una etiqueta del
         * territorio, y abrir el cursor ahi al dibujar un area interrumpe el
         * gesto de acotar espacio, que es lo que estabas haciendo.
         */
        if (t !== 'section') setEditingId(nuevo.id)
      },
      onErase: world => {
        abrirGesto()
        const el = pick(elementsRef.current, world, { zoom: camRef.current.zoom, medirTitulo: medirTituloMarco })
        // EL CANDADO MANDA TAMBIEN AQUI. Una goma que se lleva por delante lo
        // que esta bloqueado hace del candado una sugerencia.
        if (!el || el.locked) return
        setElements(prev => {
          const quedan = prev.filter(x => x.id !== el.id)
          const huerfanos = new Set(connectorsHuerfanos(quedan))
          return quedan.filter(x => !huerfanos.has(x.id))
        })
        setSelectedIds(prev => { if (!prev.has(el.id)) return prev; const n = new Set(prev); n.delete(el.id); return n })
      },
      onEraseEnd: () => { setTimeout(() => cerrarGesto('borrar'), 0) },
      onDrawStart: p => {
        const marcador = toolRef.current === 'highlighter'
        const ajustes = tintaRef.current
        const ink: CanvasElement = {
          id: 'ink-' + Date.now().toString(36), type: 'ink',
          x: p.x, y: p.y, width: 0, height: 0, rotation: 0,
          zIndex: siguienteZ(), opacity: 1, locked: false, version: 1,
          createdAt: Date.now(), updatedAt: Date.now(),
          points: [{ x: 0, y: 0, pressure: p.pressure }],
          // SIN color elegido: la tinta la pone el TEMA al pintar. Guardar aqui
          // el color del tema activo es lo que hacia invisible en oscuro lo
          // dibujado en claro.
          color: marcador ? undefined : ajustes.color,
          size: marcador ? 22 : ajustes.size, highlighter: marcador,
        }
        draftRef.current = ink
        setDraft(ink)
      },
      onDrawPoint: p => {
        const d = draftRef.current
        if (!d || d.type !== 'ink') return
        // Puntos RELATIVOS al origen: los absolutos dejan cajas gigantes que
        // descuadran el encuadre y el minimapa.
        const next = { ...d, points: [...d.points, { x: p.x - d.x, y: p.y - d.y, pressure: p.pressure }] }
        draftRef.current = next
        setDraft(next)
      },
      onDrawEnd: () => {
        const d = draftRef.current
        draftRef.current = null
        setDraft(null)
        if (d && d.type === 'ink' && d.points.length >= 2) setElements(prev => [...prev, d])
      },
      onTap: () => {},
    })
  }

  useEffect(() => {
    const onHidden = () => { if (document.hidden) machineRef.current?.resetStuck() }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  // ── atajos ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /**
       * Mientras se ESCRIBE, el teclado no es del lienzo.
       *
       * El guard miraba solo el editor de texto del canvas, y para entonces no
       * habia otros campos. Ahora los hay: el buscador del rail, el nombre de
       * una pagina, la etiqueta de un conector. Escribir "r" en cualquiera de
       * ellos cambiaba la herramienta a rectangulo, y "?" abria la hoja de
       * atajos encima de lo que estabas escribiendo.
       *
       * Se pregunta por el TIPO de elemento enfocado, no por una marca nuestra:
       * asi cubre tambien el proximo campo que alguien agregue sin acordarse de
       * esto.
       */
      if (!teclaMia()) return
      // Editando, el teclado es del TEXTO aunque el foco no haya llegado al editor: en WKWebView el `focus()` hecho al
      // soltar el doble clic puede perderse y activeElement queda en body; sin esto Backspace borraba el ELEMENTO.
      if (editingRef.current) return
      const foco = document.activeElement as HTMLElement | null
      if (foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA'
                   || foco.isContentEditable || foco.hasAttribute('data-canvas-editing'))) return
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? rehacer() : deshacer()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selRef.current.size === 0) return
        e.preventDefault()
        setElements(prev => {
          const quedan = prev.filter(el => !selRef.current.has(el.id))
          // Un conector a un elemento borrado no representa nada: se va con el.
          const huerfanos = new Set(connectorsHuerfanos(quedan))
          return quedan.filter(el => !huerfanos.has(el.id))
        })
        setSelectedIds(new Set())
        return
      }
      if (mod && e.key.toLowerCase() === 'd' && selRef.current.size === 1) {
        e.preventDefault()
        const el = elementsRef.current.find(x => x.id === [...selRef.current][0])
        if (!el) return
        const copia = { ...el, id: el.id + '-copia-' + Date.now().toString(36),
          x: el.x + 24, y: el.y + 24, zIndex: siguienteZ(), origin: undefined }
        setElements(prev => [...prev, copia])
        setSelectedId(copia.id)
        return
      }
      // ⌘B / ⌘I / ⌘U. Con la seleccion vacia no hacen nada en vez de tragarse
      // el atajo del navegador.
      if (mod && !e.shiftKey && 'biu'.includes(e.key.toLowerCase()) && selRef.current.size > 0) {
        const conTexto = elementsRef.current.some(el => selRef.current.has(el.id) && tieneTexto(el))
        if (conTexto) {
          e.preventDefault()
          const comun = estiloComun(elementsRef.current.filter(el => selRef.current.has(el.id)))
          const k = e.key.toLowerCase()
          if (k === 'b') aplicarTipo({ weight: (comun.weight ?? 400) >= 600 ? 400 : 700 })
          if (k === 'i') aplicarTipo({ italic: !comun.italic })
          if (k === 'u') aplicarTipo({ underline: !comun.underline })
          return
        }
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSelectedIds(new Set(elementsRef.current.map(el => el.id)))
        return
      }
      if (e.key === 'Escape') {
        // Dentro de un grupo, Esc sale al grupo (no suelta la seleccion).
        const g = grupoAbiertoRef.current
        if (g && selRef.current.size > 0) { setGrupoAbierto(null); setSelectedIds(miembrosDeGrupo(elementsRef.current, g)); return }
        setSelectedIds(new Set()); setTool('select'); setMenu(null); return
      }
      // La hoja de atajos. `?` es la tecla que todo el mundo prueba.
      if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); setAtajos(v => !v); return }

      // AGRUPAR ⌘G · DESAGRUPAR ⌘⇧G
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        e.shiftKey ? ops.desagrupar() : ops.agrupar()
        return
      }
      // ORDEN Z. ⌘] un paso, ⌥⌘] hasta el frente — la convencion de siempre.
      if (mod && (e.key === ']' || e.key === '[')) {
        e.preventDefault()
        const alExtremo = e.altKey
        if (e.key === ']') alExtremo ? ops.alFrente() : ops.subir()
        else alExtremo ? ops.alFondo() : ops.bajar()
        return
      }
      // BLOQUEAR ⌘⇧L
      if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        const todosBloqueados = elementsRef.current.filter(el => selRef.current.has(el.id)).every(el => el.locked)
        ops.bloquear(!todosBloqueados)
        return
      }
      // SELECCIONAR EL DIAGRAMA ENTERO ⌘⇧A, desde cualquiera de sus piezas.
      if (mod && e.shiftKey && e.key.toLowerCase() === 'a' && selRef.current.size > 0) {
        e.preventDefault()
        ops.seleccionarRegion([...selRef.current][0])
        return
      }

      // EMPUJAR CON LAS FLECHAS. 1px de precision, 10 con Shift. Es como se
      // cierra el ultimo pixel de una alineacion: arrastrar con el raton nunca
      // acierta un desplazamiento de uno.
      if (!mod && FLECHAS[e.key] && selRef.current.size > 0) {
        e.preventDefault()
        const [ux, uy] = FLECHAS[e.key]
        const paso = e.shiftKey ? 10 : 1
        setElements(prev => reroute(prev.map(el => {
          if (!selRef.current.has(el.id)) return el
          const m = { ...el, x: el.x + ux * paso, y: el.y + uy * paso, updatedAt: Date.now() }
          if (m.origin && !m.origin.pinned) m.origin = { ...m.origin, pinned: true }
          return m
        }), selRef.current))
        return
      }

      if (mod) return
      const t = TOOL_SHORTCUTS[e.key.toLowerCase()]
      if (t) { e.preventDefault(); setTool(t) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deshacer, rehacer, siguienteZ, toFit, setSelectedId, aplicarTipo, ops])

  // ── teclado de camara ──────────────────────────────────────────────────────
  /**
   * ⌘+ ⌘− ⌘0 ⌘1 ⌘2 (y ⇧0 ⇧1 ⇧2, 0). Escucha en CAPTURA y corta la propagacion: dentro del lienzo estas teclas son
   * de su camara, no del zoom de toda la app (ZoomController) ni del navegador. Con el puntero encima basta: en el
   * panel, mirar el lienzo y pulsar ⌘+ debe acercarlo aunque el foco siga en el chat.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const accion = accionZoomDeTecla(e)
      if (!accion) return
      if (!teclaMia() && !punteroRef.current) return
      const foco = document.activeElement as HTMLElement | null
      const escribiendo = !!foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA'
        || foco.isContentEditable || foco.hasAttribute('data-canvas-editing'))
      // Escribiendo, solo las de ⌘ (las sueltas son texto) y nunca con el foco en un campo ajeno a la pizarra.
      if (escribiendo && (!(e.metaKey || e.ctrlKey) || !raizRef.current?.contains(foco))) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (accion === 'acercar') zoomAnimado(z => siguienteNivel(z, 1))
      else if (accion === 'alejar') zoomAnimado(z => siguienteNivel(z, -1))
      else if (accion === 'cien') zoomAnimado(() => 1)
      else encuadrar(accion)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [teclaMia, zoomAnimado, encuadrar])

  /**
   * Teclado de capitulos: ← → el vecino, 1–9 uno directo, ↓ ↑ dentro del capitulo, Esc la vista completa. Solo
   * sin seleccion (con algo seleccionado las flechas empujan) y sin modificadores (⌘1 y ⇧1 son de la camara).
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const caps = capitulosRef.current
      if (caps.length < 2 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (!teclaMia() && !punteroRef.current) return
      const foco = document.activeElement as HTMLElement | null
      if (foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA' || foco.tagName === 'SELECT'
                   || foco.isContentEditable || foco.hasAttribute('data-canvas-editing'))) return
      if (selRef.current.size > 0 || editingRef.current) return
      const i = capituloRef.current
      const d = /^(Digit|Numpad)([1-9])$/.exec(e.code)?.[2] ?? (/^[1-9]$/.test(e.key) ? e.key : null)
      let hecho = true
      if (d && Number(d) <= caps.length) irCapitulo(Number(d) - 1)
      else if (e.key === 'ArrowRight') irCapitulo(i == null ? 0 : Math.min(caps.length - 1, i + 1))
      else if (e.key === 'ArrowLeft') irCapitulo(i == null ? caps.length - 1 : Math.max(0, i - 1))
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && i != null) {
        const dest = bajarEnCapitulo(animRef.current!.destino(), caps[i].caja, vpRef.current, e.key === 'ArrowDown' ? 1 : -1, CHROME_CAPITULO)
        irCamara(dest, 420, suaveDoble)
      } else if (e.key === 'Escape' && i != null) verTodo()
      else hecho = false
      if (hecho) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teclaMia, irCapitulo, verTodo, irCamara])

  /** ⌘ abajo enseña la mano: ⌘+arrastrar mueve el lienzo (input/pointers.ts). */
  const [metaAbajo, setMetaAbajo] = useState(false)
  useEffect(() => {
    const cambia = (e: KeyboardEvent) => {
      // Solo la tecla sola: con ⌘ puesto, otra tecla es un atajo y la mano estorbaria su cursor.
      if (e.key === 'Meta' || e.key === 'Control') setMetaAbajo(e.type === 'keydown')
      else if (e.type === 'keydown') setMetaAbajo(false)
    }
    const soltar = () => setMetaAbajo(false)
    window.addEventListener('keydown', cambia)
    window.addEventListener('keyup', cambia)
    window.addEventListener('blur', soltar)
    return () => { window.removeEventListener('keydown', cambia); window.removeEventListener('keyup', cambia); window.removeEventListener('blur', soltar) }
  }, [])

  // ── la barra espaciadora es la mano ────────────────────────────────────────
  // Se escucha aparte del resto de atajos porque necesita el `keyup`, y porque
  // debe seguir funcionando mientras un gesto esta en curso.
  useEffect(() => {
    const abajo = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !teclaMia()) return
      // Escribiendo, el espacio es un espacio. Antes solo se miraba el editor del lienzo y el buscador del rail
      // (o el chat del panel, en la seccion Lienzo) se quedaba sin poder escribir espacios.
      const foco = document.activeElement as HTMLElement | null
      if (foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA' || foco.tagName === 'SELECT'
                   || foco.isContentEditable || foco.hasAttribute('data-canvas-editing'))) return
      // Sin esto la pagina hace scroll y el lienzo pega un brinco.
      e.preventDefault()
      machineRef.current?.setEspacio(true)
      setManoTemporal(true)
    }
    const arriba = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !machineRef.current?.espacioAbajo()) return
      // El boton que tenia el foco (la ultima herramienta o el tema) se "pulsa" con el keyup del espacio: soltar
      // la mano cambiaba el tema. Se lo come quien lo empezo.
      e.preventDefault()
      machineRef.current?.setEspacio(false)
      setManoTemporal(false)
    }
    // Si la ventana pierde el foco con el espacio abajo, el `keyup` nunca
    // llega y el lienzo se queda en modo mano para siempre.
    const soltar = () => { machineRef.current?.setEspacio(false); setManoTemporal(false) }
    window.addEventListener('keydown', abajo)
    window.addEventListener('keyup', arriba)
    window.addEventListener('blur', soltar)
    return () => {
      window.removeEventListener('keydown', abajo)
      window.removeEventListener('keyup', arriba)
      window.removeEventListener('blur', soltar)
    }
  }, [])

  // ── puente de depuracion ───────────────────────────────────────────────────
  // Sin esto, un agente que quiere arrastrar algo ADIVINA sus coordenadas de
  // pantalla — y adivina mal, porque el tamaño del screenshot no es el del
  // viewport real. Expone LECTURA, nunca mutacion: el harness pregunta donde
  // esta algo y despacha eventos DE VERDAD, probando el mismo camino que
  // recorre una mano.
  useEffect(() => {
    ;(window as unknown as { __canvasV4?: unknown }).__canvasV4 = {
      elementos: () => elementsRef.current.map(e => ({
        id: e.id, tipo: e.type,
        forma: e.type === 'shape' ? e.shape : undefined,
        rol: e.type === 'shape' ? e.role : undefined,
        // La caja REAL, no los campos crudos: para tinta w/h valen 0 a proposito
        // y quien lea el crudo concluye que el trazo no ocupa nada. El puente
        // existe para que un agente vea lo mismo que ve el motor.
        ...bounds(e),
        w: bounds(e).width, h: bounds(e).height,
        fijado: e.origin?.pinned === true, compilado: e.origin != null,
        giro: Math.round((e.rotation ?? 0) * 180 / Math.PI),
        bloqueado: e.locked === true, grupo: e.groupId ?? null,
      })),
      centroEnPantalla: (id: string) => {
        const el = elementsRef.current.find(e => e.id === id)
        if (!el) return null
        const c = camRef.current, v = vpRef.current
        return {
          x: (el.x + el.width / 2 - c.x) * c.zoom + v.width / 2,
          y: (el.y + el.height / 2 - c.y) * c.zoom + v.height / 2,
        }
      },
      camara: () => camRef.current,
      /** Las pastillas vivas (enlaces y nervios) en coordenadas del lienzo en pantalla: para medir el sistema nervioso. */
      pastillas: () => {
        const c = camRef.current, v = vpRef.current
        return pastillasDe(elementsRef.current, c.zoom, undefined, vivoRef.current).map(p => ({
          id: p.id, accion: p.accion ?? 'enlace', etiqueta: p.etiqueta, semaforo: p.semaforo ?? null,
          x: (p.x + p.width / 2 - c.x) * c.zoom + v.width / 2, y: (p.y + p.height / 2 - c.y) * c.zoom + v.height / 2,
        }))
      },
      espejo: () => espejoRef.current,
      viewport: () => vpRef.current,
      fijados: () => elementsRef.current.filter(e => e.origin?.pinned).length,
    }
  }, [])

  // ── pintar ─────────────────────────────────────────────────────────────────
  /**
   * UN RENDER POR CUADRO (5 oct 2026). Antes se pintaba dentro del efecto, en cada commit de React, y la cámara
   * llegaba por estado: cada evento de rueda era un render de React y un render del motor, aunque llegaran dos en
   * el mismo cuadro. Ahora el efecto solo deja listo QUÉ pintar y pide un cuadro; la cámara viva también pide
   * cuadro al moverse. `requestAnimationFrame` junta todo lo de un cuadro en una sola pasada.
   */
  const pintarRef = useRef<() => void>(() => {})
  const cuadroRef = useRef(0)
  const pedirCuadro = useCallback(() => {
    if (cuadroRef.current) return
    cuadroRef.current = requestAnimationFrame(() => { cuadroRef.current = 0; pintarRef.current() })
  }, [])
  useEffect(() => () => { if (cuadroRef.current) cancelAnimationFrame(cuadroRef.current) }, [])
  useEffect(() => camViva.suscribir(pedirCuadro), [camViva, pedirCuadro])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fontsReady) return
    // El elemento en edicion NO se pinta: el textarea ya lo muestra, y
    // pintarlo tambien deja el texto dos veces, desalineado.
    const visibles = conInteraccion(editingId ? elements.filter(e => e.id !== editingId) : elements, embedsActivos)
    pintarRef.current = () => {
      const t0 = performance.now()
      /**
       * NITIDO AL SOLTAR. Mientras la camara se mueve, el bitmap se pinta a DPR 2 como mucho: en una Retina
       * con zoom de pagina el lienzo pedia DPR ~4 (4096x2607 = 10,7 Mpx por cuadro) y el ojo no distingue
       * esa diferencia en movimiento. Al asentarse la camara (CamaraViva avisa) se vuelve a pintar completo.
       */
      const vp = camViva.enGesto() && viewport.dpr > DPR_GESTO ? { ...viewport, dpr: DPR_GESTO } : viewport
      const r = render(canvas, {
        elements: visibles,
        camera: camRef.current, theme: t, viewport: vp, background,
        draft: draft?.type === 'ink' ? draft : null,
        rubber,
        selectedIds: selectedIds.size ? selectedIds : undefined,
        grupoAbierto,
        marquee, conectando, guias,
        puertos: (tool === 'select' || tool === 'connector') && !editingId ? puertosVista : null,
        hover: editingId ? null : hoverId,
        enlaceVivo: enlaceVivo?.id ?? null,
        vivo,
        conManijas: tool === 'select' && !editingId,
      })
      anotarCuadro({ t: t0, ms: performance.now() - t0, drawn: r.drawn, dpr: vp.dpr })
    }
    pedirCuadro()
  }, [elements, t, viewport, fontsReady, draft, selectedIds, rubber, editingId, background, imgTick, marquee, tool, conectando, guias, puertosVista, hoverId, enlaceVivo, embedsActivos, pedirCuadro, camRef, camViva, grupoAbierto, vivo])

  // ── eventos ────────────────────────────────────────────────────────────────
  /**
   * EL RECT DEL LIENZO, UNA VEZ POR GESTO (5 oct 2026). Cada `pointermove` lo pedia cuatro veces y cada evento de
   * rueda una: tras el commit de React del cuadro anterior el layout esta sucio, y cada lectura obligaba al
   * navegador a recalcularlo ahi mismo (medido: 0,4-0,6 s de reflujos forzados en un gesto de 3 s). Se mide al
   * entrar el puntero, al bajarlo, al empezar una rafaga de rueda y cuando el contenedor cambia de tamaño.
   */
  const rectRef = useRef<DOMRect | null>(null)
  const rectoLienzo = useCallback((): DOMRect => {
    if (!rectRef.current && wrapRef.current) rectRef.current = wrapRef.current.getBoundingClientRect()
    return rectRef.current ?? new DOMRect()
  }, [])
  useEffect(() => {
    const olvidar = () => { rectRef.current = null }
    window.addEventListener('scroll', olvidar, true)
    window.addEventListener('resize', olvidar)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(olvidar) : null
    if (wrapRef.current) ro?.observe(wrapRef.current)
    return () => { window.removeEventListener('scroll', olvidar, true); window.removeEventListener('resize', olvidar); ro?.disconnect() }
  }, [])

  const sampleFrom = useCallback((e: React.PointerEvent) => {
    const rect = rectoLienzo()
    return {
      id: e.pointerId,
      type: (e.pointerType === 'pen' ? 'pen' : e.pointerType === 'touch' ? 'touch' : 'mouse') as 'pen' | 'touch' | 'mouse',
      ...puntoLocal(e.clientX, e.clientY, rect, vpRef.current.width, vpRef.current.height),
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      buttons: e.buttons,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey || e.ctrlKey,
    }
  }, [rectoLienzo])

  // El cursor anuncia la manija ANTES de tocarla. Sin eso, redimensionar es
  // adivinar donde empieza la zona sensible.
  const [cursorManija, setCursorManija] = useState<string | null>(null)
  /** Clic en una pastilla: un enlace va a su destino; un nodo con nervio abre su visor (otro clic en la misma lo cierra). */
  const activarPastilla = useCallback((p: Pastilla) => {
    if (!p.accion || p.accion === 'enlace') { abrirEnlace(p.link, alAbrirDocRef.current); return }
    const accion = p.accion
    const t0 = performance.now()
    let abre = true
    setVisor(v => { abre = !(v?.id === p.id && v.accion === accion); return abre ? { id: p.id, accion, t0 } : null })
    // El visor se acopla a la derecha: si el nodo quedaría debajo, la cámara se corre lo justo para dejarlo a la vista,
    // con el nervio entre los dos (180 ms, la mano manda: cualquier gesto la corta).
    const el = elementsRef.current.find(e => e.id === p.id)
    if (!abre || !el) return
    const c = camRef.current, vp = vpRef.current
    const derecha = (el.x + el.width - c.x) * c.zoom + vp.width / 2
    const disp = disposicionVisor(vp, accion)
    if (disp.forma === 'hoja') return
    const limite = disp.left - 56
    if (derecha <= limite) return
    const dx = (derecha - limite) / c.zoom, x0 = c.x, ini = performance.now()
    const paso = (t: number) => {
      const k = Math.min(1, (t - ini) / 180), e = 1 - Math.pow(1 - k, 3)
      setCamera(cam => ({ ...cam, x: x0 + dx * e }))
      if (k < 1 && camRef.current.zoom === c.zoom) requestAnimationFrame(paso)
    }
    requestAnimationFrame(paso)
  }, [setCamera])
  const pastillaBajo = useCallback((clientX: number, clientY: number) => {
    const world = screenToWorld(puntoLocal(clientX, clientY, rectoLienzo(), vpRef.current.width, vpRef.current.height), camRef.current, vpRef.current)
    return pastillaEn(pastillasDe(elementsRef.current, camRef.current.zoom, undefined, vivoRef.current), world)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /** Gesto en curso, publicado para poder medirlo desde fuera. */
  const [gestoActual, setGestoActual] = useState('none')
  const actualizarCursor = useCallback((e: React.PointerEvent) => {
    if (tool !== 'select' && tool !== 'connector') { setCursorManija(null); setPuertos(null); return }
    const rect = rectoLienzo()
    const world = screenToWorld(puntoLocal(e.clientX, e.clientY, rect, vpRef.current.width, vpRef.current.height), camRef.current, vpRef.current)
    const zoom = camRef.current.zoom
    const coarse = e.pointerType === 'touch'

    const r = tool === 'select' && selRef.current.size > 0 ? selectionBounds(elementsRef.current, selRef.current) : null
    const h = r ? handleAt(r, world, zoom, coarse) : null
    setCursorManija(esGiro(h) ? 'grab' : h?.startsWith('codo:') ? 'move' : h ? CURSOR[h as HandleId] : null)

    // Mientras un gesto corre, los puertos NO se recalculan: arrastrar un
    // conector por encima de otra caja no debe hacer que esa caja ofrezca los
    // suyos y parpadee media pantalla.
    const gesto = machineRef.current?.currentGesture()
    setGestoActual(gesto ?? 'none')
    if (gesto && gesto !== 'none') return

    if (h) { setPuertos(null); return }   // redimensionar manda sobre conectar

    // El candidato es el de mas arriba cuya zona viva contenga al puntero. Se
    // recorre por z descendente para que gane el que el ojo ve encima.
    let elegido: { elementId: string; activo?: PortId | null } | null = null
    const porZ = ordenPorZDesc(elementsRef.current)
    for (const el of porZ) {
      if (el.locked || !aceptaPuertos(el)) continue
      if (!cercaDe(el, world, zoom)) continue
      elegido = { elementId: el.id, activo: tool === 'connector' ? portAt(el, world, zoom, coarse)?.id ?? null : null }
      break
    }
    // Con seleccion, el puerto vivo es del SELECCIONADO aunque otro quede encima: es el unico que los ofrece.
    if (tool === 'select' && selRef.current.size === 1) {
      const id = selRef.current.values().next().value as string
      const sel = elementsRef.current.find(e => e.id === id)
      const vivo = sel && !sel.locked && aceptaPuertos(sel) ? portAt(sel, world, zoom, coarse) : null
      if (vivo) elegido = { elementId: id, activo: vivo.id }
    }
    setPuertos(prev =>
      prev?.elementId === elegido?.elementId && prev?.activo === elegido?.activo ? prev : elegido)
  }, [tool, rectoLienzo])

  /**
   * LA RUEDA, nativa y NO pasiva (5 oct 2026).
   *
   * Era un `onWheel` de React, y React registra la rueda como pasiva: no podia `preventDefault`. Consecuencia: el
   * pellizco del trackpad (que el navegador manda como ⌘/Ctrl+rueda) acercaba el lienzo Y tambien hacia zoom a la
   * pagina entera, y en el panel la rueda se escapaba al zoom de la pestaña. Dentro del lienzo la rueda es suya.
   *
   *   · trackpad: dos dedos = paneo directo; pellizco = zoom continuo bajo los dedos
   *   · raton: rueda = paneo vertical animado; ⇧ = horizontal; ⌘ = zoom a escalones animados bajo el cursor
   */
  const detectorRef = useRef(new DetectorRueda())
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let ultimaRueda = -Infinity
    const onWheel = (e: WheelEvent) => {
      // Un documento vivo (embed activado) se desplaza solo.
      if ((e.target as HTMLElement | null)?.closest?.('[data-canvas-scroll]')) return
      e.preventDefault()
      e.stopPropagation()
      const ahora = performance.now()
      if (ahora - ultimaRueda > 300) rectRef.current = null   // rafaga nueva: se vuelve a medir
      ultimaRueda = ahora
      const rect = rectoLienzo()
      const punto = puntoLocal(e.clientX, e.clientY, rect, vpRef.current.width, vpRef.current.height)
      const aparato = detectorRef.current.aparato(e, ahora)
      const anim = animRef.current!
      // Durante un pellizco de WebKit (abajo) el zoom ya lo lleva el gesto: un ⌘+rueda paralelo lo duplicaría.
      if (pellizcoWebKit && e.ctrlKey && !e.metaKey) return
      if (e.ctrlKey || e.metaKey) {
        // Sensibilidad del zoom (hoja «?»): exponente sobre el factor del gesto.
        const f = Math.pow(factorDeRueda(e.deltaY, aparato), factorZoom())
        if (aparato === 'trackpad') { anim.cancelar(); setCamera(c => zoomAt(c, vpRef.current, punto, f)) }
        else { const d = anim.destino(); irCamara(zoomAt(d, vpRef.current, punto, f), 160) }
        return
      }
      const enPx = deltasEnPx(e, vpRef.current.height)
      const k = factorPaneo()   // sensibilidad del paneo (hoja «?»)
      const dx = enPx.dx * k, dy = enPx.dy * k
      if (aparato === 'trackpad') {
        anim.cancelar()
        setCamera(c => sanitizeCamera({ ...c, x: c.x + dx / c.zoom, y: c.y + dy / c.zoom }, c))
      } else {
        const d = anim.destino()
        irCamara({ ...d, x: d.x + dx / d.zoom, y: d.y + dy / d.zoom }, 140)
      }
    }
    /**
     * EL PELLIZCO EN WEBKIT (5 oct 2026). Safari y la app de escritorio (WKWebView) no mandan el pellizco del trackpad
     * como Ctrl+rueda, como Chrome: mandan `gesturestart/gesturechange/gestureend` con la escala acumulada. Sin
     * escucharlos, en la app el pellizco no acercaba el lienzo hacia los dedos. Se ancla en el punto del gesto, igual
     * que la rueda; en iPad el pellizco táctil ya lo lleva la máquina de punteros y aquí se ignora (HECHO A2).
     */
    let pellizcoWebKit = false, escalaPrevia = 1
    type Gesto = Event & { scale?: number; clientX?: number; clientY?: number }
    const alEmpezarGesto = (e: Event) => {
      e.preventDefault()
      pellizcoWebKit = true; escalaPrevia = 1; rectRef.current = null
      animRef.current?.cancelar()
    }
    const alCambiarGesto = (ev: Event) => {
      const e = ev as Gesto
      e.preventDefault()
      if (machineRef.current?.isPinching()) return
      const escala = typeof e.scale === 'number' && Number.isFinite(e.scale) && e.scale > 0 ? e.scale : 1
      const f = Math.pow(escala / escalaPrevia, factorZoom())
      escalaPrevia = escala
      if (!Number.isFinite(f) || f <= 0 || f === 1) return
      const rect = rectoLienzo()
      const punto = typeof e.clientX === 'number' && typeof e.clientY === 'number'
        ? puntoLocal(e.clientX, e.clientY, rect, vpRef.current.width, vpRef.current.height)
        : { x: vpRef.current.width / 2, y: vpRef.current.height / 2 }
      setCamera(c => zoomAt(c, vpRef.current, punto, f))
    }
    const alTerminarGesto = (e: Event) => { e.preventDefault(); pellizcoWebKit = false; escalaPrevia = 1 }
    // El boton del medio: sin esto Windows y Linux abren el autodesplazamiento, y sobre un enlace abre pestaña.
    const sinAuto = (e: MouseEvent) => { if (e.button === 1) e.preventDefault() }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', alEmpezarGesto, { passive: false })
    el.addEventListener('gesturechange', alCambiarGesto, { passive: false })
    el.addEventListener('gestureend', alTerminarGesto, { passive: false })
    el.addEventListener('mousedown', sinAuto)
    el.addEventListener('auxclick', sinAuto)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', alEmpezarGesto)
      el.removeEventListener('gesturechange', alCambiarGesto)
      el.removeEventListener('gestureend', alTerminarGesto)
      el.removeEventListener('mousedown', sinAuto)
      el.removeEventListener('auxclick', sinAuto)
    }
  }, [irCamara, rectoLienzo])

  const editingEl = useMemo(
    () => (editingId ? elements.find(e => e.id === editingId) ?? null : null), [editingId, elements])
  const selectedEl = useMemo(
    () => (selectedIds.size === 1 ? elements.find(e => e.id === [...selectedIds][0]) ?? null : null),
    [selectedIds, elements])

  /**
   * TODA la seleccion, para la barra contextual.
   *
   * La barra edita a todos los seleccionados, no solo al primero. Editar solo
   * al primero es peor que no editar: pintas cinco tarjetas de rojo y tres se
   * quedan como estaban, sin decir por que.
   */
  const seleccionados = useMemo(
    () => elements.filter(e => selectedIds.has(e.id)), [elements, selectedIds])

  /**
   * Que ofrece el menu. Depende de sobre QUE se abrio, no de una lista fija con
   * la mitad en gris.
   */
  const accionesMenu = useCallback((m: { sobre: string | null; world: { x: number; y: number } }): AccionMenu[] => {
    const sel = selRef.current
    const seleccionados = elementsRef.current.filter(e => sel.has(e.id))
    if (!m.sobre) {
      // SOBRE EL VACIO: lo que se puede traer aqui.
      return [
        { id: 'nota', label: 'Nota', icon: Ico.IconSticky, onPick: () => crearEnPunto('sticky', m.world) },
        { id: 'texto', label: 'Bloque de texto', icon: Ico.IconText, onPick: () => crearEnPunto('text', m.world) },
        { id: 'tabla', label: 'Tabla', icon: Ico.IconTable, onPick: () => crearEnPunto('table', m.world) },
        { id: 'codigo', label: 'Bloque de código', icon: Ico.IconCode, onPick: () => crearEnPunto('code', m.world) },
        { id: 'pegar', label: 'Pegar aquí', atajo: '⌘V', icon: Ico.IconDuplicate, corte: true,
          onPick: () => pegarEn(m.world) },
        { id: 'todo', label: 'Seleccionar todo', atajo: '⌘A', icon: Ico.IconLayers, corte: true,
          onPick: () => setSelectedIds(new Set(elementsRef.current.map(el => el.id))) },
        { id: 'encuadrar', label: 'Encuadrar todo', atajo: '⌘1', icon: Ico.IconFit, onPick: () => encuadrar('todo') },
      ]
    }

    const el = elementsRef.current.find(e => e.id === m.sobre)
    const bloqueados = seleccionados.length > 0 && seleccionados.every(e => e.locked)
    const acciones: AccionMenu[] = []

    if (el && (el.type === 'text' || el.type === 'shape' || el.type === 'frame')) {
      acciones.push({ id: 'editar', label: 'Editar texto', atajo: '⏎', icon: Ico.IconPencilEdit,
        onPick: () => setEditingId(el.id) })
    }
    acciones.push({ id: 'dup', label: 'Duplicar', atajo: '⌘D', icon: Ico.IconDuplicate, onPick: ops.duplicar })

    // EL DIAGRAMA COMO PIEZA. Daniel: "poder seleccionar el diagrama".
    if (el?.origin?.regionId) {
      acciones.push({ id: 'region', label: 'Seleccionar el diagrama', atajo: '⌘⇧A', icon: Ico.IconLayers,
        corte: true, onPick: () => ops.seleccionarRegion(el.id) })
      if (seleccionados.some(e => e.origin?.pinned)) {
        acciones.push({ id: 'soltar', label: 'Devolver al compilador', icon: Ico.IconCloud,
          onPick: ops.soltarAlCompilador })
      }
    }

    if (sel.size > 1) {
      acciones.push(esGrupo(elementsRef.current, sel)
        ? { id: 'desagrupar', label: 'Desagrupar', atajo: '⌘⇧G', icon: Ico.IconGroup, corte: true, onPick: ops.desagrupar }
        : { id: 'agrupar', label: 'Agrupar', atajo: '⌘G', icon: Ico.IconGroup, corte: true, onPick: ops.agrupar })
    }

    acciones.push(
      { id: 'frente', label: 'Traer al frente', atajo: '⌥⌘]', icon: Ico.IconBringFront, corte: true, onPick: ops.alFrente },
      { id: 'subir', label: 'Subir un paso', atajo: '⌘]', onPick: ops.subir },
      { id: 'bajar', label: 'Bajar un paso', atajo: '⌘[', onPick: ops.bajar },
      { id: 'fondo', label: 'Enviar al fondo', atajo: '⌥⌘[', icon: Ico.IconSendBack, onPick: ops.alFondo },
      { id: 'lock', label: bloqueados ? 'Desbloquear' : 'Bloquear', atajo: '⌘⇧L', corte: true,
        icon: bloqueados ? Ico.IconUnlock : Ico.IconLock, onPick: () => ops.bloquear(!bloqueados) },
      { id: 'borrar', label: 'Eliminar', atajo: '⌫', icon: Ico.IconTrash, corte: true, peligro: true, onPick: ops.borrar },
    )
    return acciones
  }, [ops, crearEnPunto, encuadrar])

  /** Como se llama lo que esta abierto. Sin pagina, es el banco de pruebas. */
  const nombreLienzo = useMemo(
    () => paginas.find(x => x.id === paginaId)?.nombre ?? 'Banco de pruebas',
    [paginas, paginaId])

  /**
   * Escribe la conversion. Es el gesto explicito que la barra pide.
   *
   * La copia del original queda guardada dentro del mismo JSON por si algo
   * salio mal — una migracion sin copia es una apuesta.
   */
  const convertir = useCallback(async () => {
    const id = paginaIdRef.current
    if (!id) return
    try {
      await Nube.convertirPagina(id)
      setSinConvertir(null)
      // Se relee desde la nube para trabajar contra lo que quedo ESCRITO, no
      // contra la conversion que vivia en memoria.
      const pag = await Nube.cargarPagina(id)
      setElements(pag.elements)
      prevElementsRef.current = pag.elements
      dueñoRef.current = id
      versionNubeRef.current = pag.version
      baseNubeRef.current = pag.elements
      historyRef.current = new History()
      setDepth({ undo: 0, redo: 0 })
      await refrescarArbol()
    } catch (e) {
      setSaveStatus({ kind: 'error', mensaje: e instanceof Error ? e.message : 'no se pudo convertir', reintentaEn: 0 })
    }
  }, [refrescarArbol])

  /** Renombra el lienzo abierto. El rail se actualiza al instante. */
  const guardarNombre = useCallback(async (valor: string) => {
    const nombre = valor.trim()
    if (!nombre) return
    const id = paginaIdRef.current

    /*
     * PONERLE NOMBRE AL BANCO DE PRUEBAS LO CONVIERTE EN LIENZO.
     *
     * Daniel: *"ahora mismo tampoco puedo modificar el titulo, esto del banco
     * de pruebas"*. Era cierto, y el motivo real era que el banco no es una
     * pagina: no hay fila donde guardar un nombre. Pero "no se puede" es la
     * respuesta equivocada — nombrar algo SIGNIFICA quererlo guardar. Un
     * callejon sin salida se lee como que la app esta rota, aunque el codigo
     * este haciendo exactamente lo que dice.
     *
     * Asi que nombrarlo lo GUARDA: nace el lienzo con ese nombre, se lleva lo
     * que hay dentro, y la sesion pasa a trabajar sobre el.
     */
    if (!id) {
      const r = await fetch('/api/canvas/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre }),
      }).then(x => x.json()).catch(() => null)
      const nueva = r?.pagina?.id
      if (!nueva) return
      await fetch(`/api/canvas/pages/${nueva}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, elements: elementsRef.current, camera: camRef.current }),
      }).catch(() => {})
      // El dueño se marca ANTES de mover el puntero: el cinturon del autoguardado
      // compara contra el, y sin esto el primer guardado se rechazaria a si mismo.
      dueñoRef.current = nueva
      // El resumen se arma con lo que el servidor ACABA de devolver, no con un
      // objeto a medias: una fila inventada en la lista se veria distinta de la
      // que llega en el proximo refresco.
      if (r.pagina) setPaginas(prev => [{ ...r.pagina, nombre, elementos: elementsRef.current.length }, ...prev])
      setPaginaId(nueva)
      // La URL tambien: recargar tiene que caer en el lienzo nuevo, no en el banco.
      if (!incrustadaRef.current) window.history.replaceState(null, '', `?p=${nueva}`)
      return
    }

    setPaginas(prev => prev.map(x => x.id === id ? { ...x, nombre } : x))
    // Solo el nombre (3 oct 2026). Antes se mandaba el documento COMPLETO por
    // el PUT sin version base: un escritor mas que podia pisar a sfmap.
    await Nube.renombrarPagina(id, nombre).catch(() => {})
  }, [])

  const seleccionConTexto = useMemo(
    () => elements.filter(e => selectedIds.has(e.id) && tieneTexto(e)), [elements, selectedIds])

  const fails = judgeInfo?.findings.filter(f => f.severity === 'fail') ?? []
  const warns = judgeInfo?.findings.filter(f => f.severity === 'warn') ?? []
  const dibujando = tool === 'pen' || tool === 'highlighter' || tool === 'eraser'
  const creando = SHAPE_TOOLS.includes(tool as ShapeTool) || tool === 'section'

  return (
    <div ref={raizRef} tabIndex={soloConFoco ? -1 : undefined}
      /* El lienzo cancela el pointerdown para dibujar, así que el clic no mueve el foco: se lo damos a mano. */
      onPointerDownCapture={soloConFoco ? () => { if (!raizRef.current?.contains(document.activeElement)) raizRef.current?.focus({ preventScroll: true }) } : undefined}
      style={{ position: 'absolute', inset: 0, background: t.canvas, overflow: 'hidden', outline: 'none' }}>
      <div ref={wrapRef}
        /* Sondas de estado para poder MEDIR el lienzo desde fuera. Hermanas de
           `data-canvas-ready`, que ya existia por lo mismo: sin ellas, probar
           un gesto obliga a inferir el estado de los pixeles, y un pixel no
           distingue "el puerto no esta vivo" de "el puerto se dibujo distinto". */
        data-puertos={puertosVista?.elementId ?? ''}
        data-puerto-activo={puertosVista?.activo ?? ''}
        data-hover={hoverId ?? ''}
        data-enlace={enlaceVivo?.id ?? ''}
        data-gesto={gestoActual}
        style={{
          position: 'absolute', inset: 0, touchAction: 'none',
          // La mano: 'grabbing' mientras arrastra (sea con el medio, ⌘, espacio o la herramienta), 'grab' mientras
          // se ofrece (espacio o ⌘ abajo, herramienta mano).
          cursor: gestoActual === 'pan' ? 'grabbing'
            : manoTemporal || metaAbajo || gestoActual === 'pan-o-clic' ? 'grab'
            : enlaceVivo && tool === 'select' ? 'pointer'
            : cursorManija ?? (dibujando || creando ? 'crosshair' : tool === 'pan' ? 'grab' : 'default'),
        }}
        onPointerEnter={e => { rectRef.current = null; const r = rectoLienzo(); punteroRef.current = puntoLocal(e.clientX, e.clientY, r, vpRef.current.width, vpRef.current.height) }}
        onPointerLeave={() => { punteroRef.current = null; setEnlaceVivo(null) }}
        onPointerDown={e => {
          // La mano directa manda sobre cualquier animacion de camara en curso.
          animRef.current?.cancelar()
          rectRef.current = null   // gesto nuevo: el rect se mide una vez aqui
          // El boton del medio no debe enfocar ni autodesplazar: el gesto es solo de la mano.
          if (e.button === 1) e.preventDefault()
          // La pastilla de un enlace es un botón: su clic abre el destino y no selecciona ni arrastra la tarjeta.
          if (e.button === 0 && toolRef.current === 'select' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !editingRef.current) {
            const p = pastillaBajo(e.clientX, e.clientY)
            if (p) { e.preventDefault(); activarPastilla(p); return }
          }
          try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* sin captura, igual funciona */ }
          machineRef.current?.down(sampleFrom(e), toolRef.current, camRef.current, vpRef.current)
          // La sonda tambien aqui: sin esto, entre bajar el dedo y moverlo
          // seguia diciendo 'none' y era imposible saber QUE gesto empezo. Una
          // sonda que solo se refresca a veces es una sonda que miente a veces,
          // que es peor que no tenerla.
          setGestoActual(machineRef.current?.currentGesture() ?? 'none')
        }}
        onPointerMove={e => {
          const r = rectoLienzo()
          punteroRef.current = puntoLocal(e.clientX, e.clientY, r, vpRef.current.width, vpRef.current.height)
          actualizarCursor(e)
          {
            const libre = toolRef.current === 'select' && (machineRef.current?.currentGesture() ?? 'none') === 'none'
            const p = libre ? pastillaBajo(e.clientX, e.clientY) : null
            setEnlaceVivo(prev => (prev?.id === p?.id ? prev : p ? { id: p.id, link: p.link } : null))
          }
          machineRef.current?.move(sampleFrom(e), camRef.current, vpRef.current)
          // DESPUES de mover: el ⌘+clic se vuelve paneo en este movimiento y el cursor tiene que enterarse ya, no
          // en el siguiente (y con otra herramienta `actualizarCursor` ni lo mira).
          const g = machineRef.current?.currentGesture() ?? 'none'
          setGestoActual(prev => (prev === g ? prev : g))
        }}
        onPointerUp={e => {
          machineRef.current?.up(sampleFrom(e), camRef.current, vpRef.current)
          // La sonda se refrescaba solo al MOVER, asi que tras soltar seguia
          // diciendo 'connecting'. Una sonda pegada miente igual que un sensor
          // muerto — y esta existe justo para no tener que adivinar.
          setGestoActual(machineRef.current?.currentGesture() ?? 'none')
        }}
        onPointerCancel={e => machineRef.current?.cancel(sampleFrom(e), camRef.current, vpRef.current)}
        /* Respaldo del doble clic a mano (ventana de 350 ms): en WKWebView un cuelgue entre clics la pierde y el
           doble clic solo seleccionaba. `dblclick` lo decide el sistema operativo, con su propio intervalo. */
        onDoubleClick={e => {
          if (toolRef.current !== 'select' || editingRef.current) return
          const r = e.currentTarget.getBoundingClientRect()
          const world = screenToWorld(puntoLocal(e.clientX, e.clientY, r, vpRef.current.width, vpRef.current.height), camRef.current, vpRef.current)
          const el = pick(elementsRef.current, world, { zoom: camRef.current.zoom, medirTitulo: medirTituloMarco })
          if (el && (el.type === 'text' || el.type === 'shape' || el.type === 'frame')) { setSelectedId(el.id); setEditingId(el.id) }
        }}
        onContextMenu={e => {
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          const world = screenToWorld(puntoLocal(e.clientX, e.clientY, r, vpRef.current.width, vpRef.current.height), camRef.current, vpRef.current)
          const sobre = pick(elementsRef.current, world, { zoom: camRef.current.zoom, medirTitulo: medirTituloMarco })?.id ?? null
          // Clic derecho sobre algo NO seleccionado lo selecciona primero: si
          // no, el menu ofreceria acciones sobre una seleccion que no es la que
          // el dedo esta señalando.
          if (sobre && !selRef.current.has(sobre)) setSelectedId(sobre)
          if (!sobre) setSelectedIds(new Set())
          setMenu({ x: e.clientX, y: e.clientY, sobre, world })
        }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const file = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'))
          if (!file) return
          const r = e.currentTarget.getBoundingClientRect()
          void insertarImagen(file, screenToWorld(puntoLocal(e.clientX, e.clientY, r, vpRef.current.width, vpRef.current.height), camRef.current, vpRef.current))
        }}>

        {/* Los embeds viven DEBAJO del canvas; el motor perfora su ventana. */}
        <ConCamara viva={camViva}>{camera => conInteraccion(elements.filter(e => e.type === 'embed'), embedsActivos).map(e => {
          // `doc:` es un documento del repo (contrato de sfmap), no una URL.
          if (e.type === 'embed' && esEmbedDoc(e)) return <DocEmbed key={e.id} el={e} camera={camera} viewport={viewport} theme={t} />
          const tl = worldToScreen({ x: e.x, y: e.y }, camera, viewport)
          return (
            <iframe key={e.id} src={e.type === 'embed' ? e.url : ''} title={e.id}
              // Edición cliente (AUDITORIA, deseable): el embebido corre aislado, sin el origen de la app (no lee su
              // sesión ni llama su API). En la instalación de Daniel sigue igual.
              {...(EDICION_CLIENTE ? { sandbox: 'allow-scripts allow-popups allow-forms' } : {})}
              style={{
                position: 'absolute', left: tl.x, top: tl.y,
                width: e.width * camera.zoom, height: e.height * camera.zoom,
                border: 'none', borderRadius: 8,
                pointerEvents: e.type === 'embed' && e.interactive ? 'auto' : 'none',
              }} />
          )
        })}</ConCamara>

        <canvas ref={canvasRef}
          data-canvas-ready={fontsReady && elements.length > 0 ? 'true' : 'false'}
          style={{ width: '100%', height: '100%', display: 'block' }} />

        {editingEl && <ConCamara viva={camViva}>{camera => (
          <TextEditor
            element={editingEl} camera={camera} viewport={viewport} theme={t}
            onCancel={() => setEditingId(null)}
            onCommit={texto => {
              setEditingId(null)
              // UN SOLO CAMINO para escribir. Vivio suelto aqui y perdia datos
              // en dos casos distintos (figura vacia, tarjeta de varias partes);
              // ahora es `escribirTexto`, esta en el modelo y esta medido.
              setElements(prev => prev.map(el =>
                el.id === editingEl.id ? escribirTexto(browserMeasureContext, el, texto) : el))
            }} />
        )}</ConCamara>}
      </div>

      {visor && (() => {
        const el = elements.find(e => e.id === visor.id)
        if (!el) return null
        const n = leerNervio(el.nervio)
        return <ConCamara viva={camViva}>{camera => (
          <NervioVisor el={el} nervio={n} accion={visor.accion} t0={visor.t0}
            medio={n?.medio ? vivo.medios.get(claveMedio(n.medio)) : undefined}
            estado={n?.estado ? vivo.estados.get(claveFuente(n.estado)) : undefined}
            camera={camera} viewport={viewport} theme={t}
            onCerrar={() => setVisor(null)}
            abrir={(() => {
              const d = el.link ? destinoDeEnlace(el.link, window.location.origin) : null
              if (!d || !el.link) return undefined
              const link = el.link
              return { fuera: d.tipo === 'fuera', etiqueta: d.etiqueta, ir: () => abrirEnlace(link, alAbrirDocRef.current) }
            })()} />
        )}</ConCamara>
      })()}

      {capitulos.length >= 2 && (
        <Capitulos capitulos={capitulos} activo={capitulo} vueloMs={vueloMs} theme={t} camara={camViva}
          viewport={viewport} angosto={viewport.width < 720} indice={mostrar.capitulos} sobreBarra={mostrar.barraInferior} onIr={irCapitulo} onTodo={verTodo} />
      )}

      <Paginas
        theme={t} paginas={paginas} carpetas={carpetas} activa={paginaId}
        setPaginas={setPaginas} setCarpetas={setCarpetas}
        abierto={railAbierto} onAbrir={setRailAbierto}
        onElegir={id => { setRailAbierto(false); void irAPagina(id) }}
        onNuevaPagina={async folderId => {
          // Se VACIA el estado antes de que llegue la pagina nueva. Sin esto, el
          // autoguardado alcanza a escribir los elementos del lienzo anterior
          // dentro del recien creado — el bug D4 del v3, cambiar de pagina
          // rapido compitiendo con un guardado en vuelo.
          await autosaveRef.current?.flush()
          const pag = await Nube.crearPagina(undefined, folderId)
          setPaginas(prev => [pag, ...prev])
          setElements([]); prevElementsRef.current = []
          dueñoRef.current = pag.id
          setPaginaId(pag.id)
        }}
        onNuevaCarpeta={async madre => {
          const c = await Nube.crearCarpeta(madre ? 'Subcarpeta nueva' : undefined, madre)
          setCarpetas(prev => [...prev, c])
        }}
        onBorrada={id => {
          // El dueño vuelve al banco: si se quedara con la pagina borrada, lo que se dibuje despues en el banco se
          // descartaria por no ser de la pagina abierta.
          if (paginaId === id) { dueñoRef.current = null; setPaginaId(null); setElements([]); prevElementsRef.current = [] }
        }} />

      {selectorAbierto && <SelectorLienzo theme={t} paginas={paginas} carpetas={carpetas} setPaginas={setPaginas} setCarpetas={setCarpetas}
        activa={paginaId} izquierda={railAbierto ? ANCHO_RIEL + 14 : 14}
        onElegir={id => { setSelectorAbierto(false); void irAPagina(id) }} onCerrar={() => setSelectorAbierto(false)}
        onBorrada={id => { if (paginaId === id) { dueñoRef.current = null; setPaginaId(null); setElements([]); prevElementsRef.current = [] } }} />}

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                    transform: railAbierto ? `translateX(${ANCHO_RIEL}px)` : 'none', transition: 'transform .16s ease' }}>
        {mostrar.herramientas && <div style={{ pointerEvents: 'auto' }}>
          <Toolbar tool={tool} theme={t} onPick={setTool} tinta={tinta} onTinta={setTinta} />
        </div>}
      </div>

      {/* Angosto (la pestaña del panel, el teléfono): la barra de estado ocupa el pie y el minimapa quedaba debajo. */}
      {viewport.width >= 720 && <Minimap elements={elements} camara={camViva} viewport={viewport} theme={t}
        onJump={p => irCamara({ ...camRef.current, x: p.x, y: p.y }, 220)} />}

      {selectedIds.size > 1 && !editingId && (
        <AlignBar theme={t} cuantos={selectedIds.size}
          onAlign={a => setElements(prev => {
            const r = align(prev, selRef.current, a)
            // null = no habia nada que hacer. No se finge que si.
            return r ? rerouteAll(r) : prev
          })}
          onDistribute={a => setElements(prev => {
            const r = distribute(prev, selRef.current, a)
            return r ? rerouteAll(r) : prev
          })} />
      )}

      {seleccionados.length > 0 && !editingId && <ConCamara viva={camViva}>{camera => (
        <BarraContextual
          elementos={seleccionados} theme={t} camera={camera} viewport={viewport}
          estiloTexto={estiloComun(seleccionConTexto)}
          conTexto={seleccionConTexto.length > 0}
          onChange={(patch, solo) => setElements(prev => prev.map(el => {
            if (!selRef.current.has(el.id)) return el
            // Un control escribe SOLO donde su campo existe. Sin este filtro,
            // pintar de rojo tres figuras y sus flechas le dejaba un `color`
            // muerto a los conectores.
            if (solo && !solo(el)) return el
            const cambiado = { ...el, ...patch, updatedAt: Date.now() } as CanvasElement
            // TOCAR ALGO COMPILADO LO FIJA. La misma regla que ya rige el
            // arrastre y la tipografia: el compilador deja de mandarlo, pero
            // lo sigue viendo como obstaculo. Si esta regla viviera solo en
            // algunos caminos, recompilar borraria el trabajo hecho por el
            // camino que se olvido.
            if (cambiado.origin && !cambiado.origin.pinned) {
              cambiado.origin = { ...cambiado.origin, pinned: true }
            }
            return cambiado
          }))}
          onTipografia={aplicarTipo}
          onGestoInicio={abrirGesto}
          onGestoFin={etiqueta => setTimeout(() => cerrarGesto(etiqueta), 0)}
          onDelete={ops.borrar}
          onDuplicate={ops.duplicar}
          onFiltrar={cat => setSelectedIds(filtrarPorCategoria(seleccionados, cat))}
          onAgrupar={ops.agrupar} onDesagrupar={ops.desagrupar}
          hayGrupo={haySeleccionAgrupada(elements, selectedIds)}
          onFront={ops.alFrente}
          onBack={ops.alFondo}
          onAnclaje={fijar => setElements(prev => rerouteAll(prev.map(el => {
            if (el.type !== 'connector' || !selRef.current.has(el.id)) return el
            if (!fijar) return { ...el, fromPort: undefined, toPort: undefined, updatedAt: Date.now() }
            // FIJAR toma los lados por los que la flecha pasa AHORA MISMO, no
            // unos por defecto: lo que ves es lo que se congela.
            const a = prev.find(x => x.id === el.fromId)
            const b = prev.find(x => x.id === el.toId)
            if (!a || !b || el.points.length < 2) return el
            return { ...el, updatedAt: Date.now(),
              fromPort: ladoDeConexion(a, el.points[0]),
              toPort: ladoDeConexion(b, el.points[el.points.length - 1]) }
          })))}
          acomodarBloqueados={seleccionados.filter(e =>
            e.locked && e.type !== 'connector' && e.type !== 'ink').length}
          onAcomodar={
            // El boton aparece solo cuando hay algo que acomodar: dos o mas
            // figuras. Con una sola no hay grafo, y un boton que no puede
            // hacer nada no deberia poder pulsarse.
            seleccionados.filter(e => e.type !== 'connector' && e.type !== 'ink' && !e.locked).length >= 2
              ? () => setElements(prev => {
                  const r = acomodar(prev, selRef.current)
                  if (r.movidos === 0) return prev
                  return rerouteAll(r.elementos)
                })
              : undefined
          } />
      )}</ConCamara>}

      {/*
        LA BARRA DE CONVERSION.

        Aparece solo en paginas del canvas anterior. Dice tres cosas y ninguna
        es decorativa: que lo que se ve YA es la conversion, que todavia no se
        ha escrito nada, y cuanto entro. El boton es el unico camino que toca
        la fila.
      */}
      {sinConvertir && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 74, transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px 9px 14px',
          borderRadius: 12, zIndex: 40, maxWidth: 'min(760px, 92vw)',
          background: t.roles.card.fill, border: `1.5px solid ${t.accent}`,
          boxShadow: t.name === 'oscuro' ? '0 12px 36px rgba(0,0,0,.6)' : '0 12px 36px rgba(15,15,25,.16)',
          font: '600 12.5px CanvasSans, system-ui', color: t.text.body,
        }}>
          <span style={{ color: t.accent, display: 'grid' }}><Ico.IconCloud size={18} /></span>
          <div style={{ display: 'grid', gap: 2 }}>
            <strong style={{ color: t.text.title, font: '700 12.5px CanvasSans, system-ui' }}>
              Esto viene del canvas anterior
            </strong>
            <span style={{ color: t.text.caption, font: '500 12px CanvasSans, system-ui' }}>
              Lo que ves ya es la conversión — {sinConvertir.entraron} elementos.
              {sinConvertir.perdidos.length > 0 && ` ${sinConvertir.perdidos.length} no entraron.`}
              {' '}Nada se ha escrito todavía, y no se guardará hasta que conviertas.
            </span>
            {sinConvertir.aproximados.length > 0 && (
              <span style={{ color: t.text.caption, font: '500 11.5px CanvasSans, system-ui', opacity: .85 }}>
                {sinConvertir.aproximados.join(' · ')}
              </span>
            )}
          </div>
          <button data-convertir onClick={convertir}
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: t.accent, color: '#fff', font: '700 12.5px CanvasSans, system-ui',
            }}>
            Convertir
          </button>
        </div>
      )}

      {atajos && <Atajos theme={t} onClose={() => setAtajos(false)} />}

      {menu && (
        <MenuContextual x={menu.x} y={menu.y} theme={t} onClose={() => setMenu(null)}
          acciones={accionesMenu(menu)} />
      )}

      {mostrar.barraInferior && <StatusBar
        angosto={viewport.width < 720}
        theme={t} zoom={camera.zoom} camara={camViva} background={background} save={saveStatus}
        canUndo={depth.undo > 0} canRedo={depth.redo > 0}
        onZoom={f => zoomAnimado(z => siguienteNivel(z, f > 1 ? 1 : -1), { x: vpRef.current.width / 2, y: vpRef.current.height / 2 })}
        onZoomTo={z => zoomAnimado(() => z, { x: vpRef.current.width / 2, y: vpRef.current.height / 2 })}
        onFit={() => encuadrar()}
        onBackground={setBackground}
        onAtajos={() => setAtajos(true)}
        onTheme={temaApp ? undefined : () => setThemeName(n => (n === 'claro' ? 'oscuro' : 'claro'))}
        onUndo={deshacer} onRedo={rehacer}
        haySeleccion={selectedIds.size > 0}
        onExport={async soloSeleccion => {
          const blob = await exportarPNG(elementsRef.current, t, {
            escala: 2,
            soloIds: soloSeleccion ? selRef.current : undefined,
          })
          if (blob) descargar(blob, `canvas-${Date.now()}.png`)
        }} />}

      {/*
        LA BARRA DEL TITULO. Carpeta + nombre + estado, arriba a la izquierda.

        El dueño: *"el icono del folder ponlo a la izquierda del nombre, o sea del
        nombre del archivo... en la esquina superior izquierda"*. Antes eran dos
        objetos sueltos —una insignia con el nombre del producto y un boton de
        carpeta flotando debajo— y ninguno decia QUE archivo estaba abierto.

        El juicio del compilador viaja aqui tambien: un diagnostico que hay que
        ir a buscar a un log es un diagnostico que nadie mira.
      */}
      {/* Compacta (9 oct 2026, el dueño: «redundante ver tres veces Acompañamiento»): en una pestaña angosta (el teléfono, el
          panel estrecho) el nombre ya lo dicen la cabecera o la pestaña. Queda la carpeta, el engrane y el juicio solo si falla. */}
      <div style={{
        position: 'absolute', left: compacta ? 10 : 14, top: compacta ? 10 : 14, zIndex: 31,
        display: 'flex', alignItems: 'center', gap: 2, padding: 4, maxWidth: 'calc(100% - 28px)',
        borderRadius: 11,
        background: t.roles.card.fill, border: `1px solid ${t.roles.card.stroke.color}`,
        boxShadow: t.name === 'oscuro' ? '0 6px 20px rgba(0,0,0,.45)' : '0 6px 20px rgba(15,15,25,.08)',
        font: '600 12px CanvasSans, system-ui', color: t.text.caption,
        transform: railAbierto ? `translateX(${ANCHO_RIEL}px)` : 'none', transition: 'transform .16s ease',
      }}>
        <button onClick={() => setRailAbierto(v => !v)} aria-label="Lienzos"
          title={railAbierto ? 'Ocultar lienzos' : 'Lienzos'}
          style={{
            width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer',
            display: 'grid', placeItems: 'center',
            background: railAbierto ? t.accent : 'transparent',
            color: railAbierto ? '#fff' : t.text.body,
          }}
          onPointerEnter={e => { if (!railAbierto) e.currentTarget.style.background = t.roles.sticky.fill }}
          onPointerLeave={e => { if (!railAbierto) e.currentTarget.style.background = 'transparent' }}>
          <Ico.IconFolder size={16} />
        </button>
        {/*
          EL NOMBRE SE EDITA AQUI. El dueño: *"no puedo modificar el título"*.

          Doble clic —no clic simple— porque este texto tambien es la etiqueta
          que se lee de un vistazo, y un clic accidental que lo convierte en
          campo de escritura se siente roto.

          El BANCO DE PRUEBAS no se renombra y lo dice: no es un archivo, es el
          lienzo suelto de siempre. Fingir que se puede renombrar y perder el
          nombre al recargar seria peor que negarlo.
        */}
        {/* Sin `paginaId` tambien: nombrar el banco de pruebas es lo que lo
            convierte en lienzo. La condicion vieja exigia que la pagina YA
            existiera, que es justo el caso que no se podia resolver. */}
        {compacta ? null : editandoNombre ? (
          <input autoFocus defaultValue={nombreLienzo}
            onBlur={e => { guardarNombre(e.target.value); setEditandoNombre(false) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { guardarNombre((e.target as HTMLInputElement).value); setEditandoNombre(false) }
              if (e.key === 'Escape') setEditandoNombre(false)
              e.stopPropagation()
            }}
            style={{
              width: 210, padding: '2px 6px', borderRadius: 6, outline: 'none',
              border: `1px solid ${t.accent}`, background: t.canvas, color: t.text.title,
              font: '700 13px CanvasSans, system-ui',
            }} />
        ) : (
          <button type="button" data-selector-lienzo aria-haspopup="dialog" aria-expanded={selectorAbierto}
            onClick={() => setSelectorAbierto(v => !v)}
            onDoubleClick={() => { setSelectorAbierto(false); setEditandoNombre(true) }}
            title={paginaId ? 'Cambiar de lienzo (Ctrl+L) · doble clic para renombrar'
                            : 'Cambiar de lienzo (Ctrl+L) · doble clic para nombrarlo — se guarda como lienzo con lo que hay dentro'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 4px', maxWidth: 280, minWidth: 0, flexShrink: 1, border: 'none', borderRadius: 7,
              background: selectorAbierto ? t.roles.sticky.fill : 'transparent', cursor: 'pointer',
              font: '700 13px CanvasSans, system-ui', color: t.text.title,
            }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{nombreLienzo}</span>
            <span style={{ display: 'grid', opacity: .55, transform: selectorAbierto ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }}><Ico.IconChevron size={12} /></span>
          </button>
        )}
        {!compacta && <span style={{ opacity: .55 }}>·</span>}
        {!compacta && <span style={{ padding: '0 4px' }}>{elements.length}</span>}
        {(!compacta || fails.length > 0 || warns.length > 0) && <span title={fails.length ? fails.map(f => f.message).join('\n')
                     : warns.length ? warns.map(f => f.message).join('\n') : 'el compilador no encontro nada'}
          style={{
            padding: '0 6px', borderRadius: 6, cursor: fails.length || warns.length ? 'help' : 'default',
            color: fails.length ? t.roles.risk.stroke.color : warns.length ? '#d97706' : '#16a34a',
          }}>
          {fails.length ? `${fails.length} fail` : warns.length ? `${warns.length} warn` : 'ok'}
        </span>}
        <MostrarEnLienzo theme={t} />
      </div>
    </div>
  )
}
