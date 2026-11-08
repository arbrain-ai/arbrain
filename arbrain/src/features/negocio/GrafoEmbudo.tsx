'use client'
/**
 * Tu negocio › El sistema, como grafo (5 nov 2026). Daniel: «podemos utilizar mejor tecnología diseñada precisamente para
 * sistemas». React Flow (@xyflow/react, MIT) pinta lo que calcula `grafo.ts`: cada embudo es un marco, cada etapa un
 * nodo, la escalera de valor y el giro de vuelta son aristas por los pasillos. Lo que no opera hoy va punteado; el cuello
 * es el único foco ámbar. Tocar una etapa (o la cabeza de un embudo) abre su detalle; el panel lo pinta PanelEmbudo.
 *
 * Dos modos según el ancho de SU contenedor, no de la ventana:
 *  · ancho (Ampliar, escritorio): embudos en filas, alto fijo; se recorre arrastrando o con dos dedos y se acerca
 *    pellizcando o con los botones.
 *  · estrecho (el panel, el teléfono a 390 px): embudos en columna y el grafo entero a lo ancho; la página sigue
 *    bajando con el dedo («quieto»). Al acercar con «+» el grafo se suelta para arrastrarlo; «encuadrar» lo regresa.
 */
import {
  Background, BackgroundVariant, ControlButton, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, useStore,
  type Edge, type EdgeProps, type Node, type NodeProps, type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Repeat, Wand2 } from 'lucide-react'
import type { Embudo } from './embudo'
import { cajaEtiqueta, construirGrafo, orientacionPara, trazoSvg, type Grafo, type NodoEmbudo, type NodoEtapa, type Orientacion, type Punto, type Trazo } from './grafo'
import e from './panel-embudo.module.css'

export type Seleccion = { tipo: 'etapa' | 'embudo'; id: string } | null

type NodoEtapaRF = Node<{ n: NodoEtapa; o: Orientacion }, 'etapa'>
type NodoEmbudoRF = Node<{ b: NodoEmbudo; o: Orientacion }, 'embudo'>
type AristaRF = Edge<{ t: Trazo }, 'trazo'>

const Eleccion = createContext<{ sel: Seleccion; elegir: (s: Seleccion) => void; alEnfocar: (id: string) => void }>({ sel: null, elegir: () => {}, alEnfocar: () => {} })

/** Aire alrededor del dibujo, en px de pantalla. */
const AIRE = 10
const ZOOM_MIN = 0.3
const ZOOM_MAX = 2

function VistaEtapa({ data }: NodeProps<NodoEtapaRF>) {
  const { sel, elegir, alEnfocar } = useContext(Eleccion)
  const et = data.n.etapa
  const elegida = sel?.tipo === 'etapa' && sel.id === et.id
  return <>
    <Handle type="target" position={Position.Top} className={e.asa} isConnectable={false} />
    <button
      type="button" className={e.nodo} data-o={data.o} data-hoy={et.opera_hoy || undefined} data-cuello={et.cuello.es || undefined}
      data-elegida={elegida || undefined} aria-pressed={elegida}
      aria-label={`${et.etapa}: ${et.nombre}${et.cuello.es ? ', cuello de botella' : ''}${et.opera_hoy ? '' : ', por construir'}`}
      onClick={() => elegir(elegida ? null : { tipo: 'etapa', id: et.id })} onFocus={() => alEnfocar(et.id)}
    >
      <span className={e.nodoCeja}>{et.orden} · {et.etapa}{et.cuello.es && <i className={e.luz} aria-hidden />}</span>
      <span className={e.nodoNombre}>{et.nombre}</span>
      <span className={e.nodoPie} aria-hidden>
        {et.skills.length > 0 && <span><Wand2 size={11} />{et.skills.length}</span>}
        {et.rutinas.length > 0 && <span><Repeat size={11} />{et.rutinas.length}</span>}
        {!et.opera_hoy && <span className={e.porConstruir}>por construir</span>}
      </span>
    </button>
    <Handle type="source" position={Position.Bottom} className={e.asa} isConnectable={false} />
  </>
}

function VistaMarco({ data }: NodeProps<NodoEmbudoRF>) {
  const { sel, elegir } = useContext(Eleccion)
  const b = data.b
  const elegido = sel?.tipo === 'embudo' && sel.id === b.id
  return <div className={e.marco} data-o={data.o} data-piso={b.piso || undefined} data-por-construir={b.porConstruir || undefined} data-elegido={elegido || undefined}>
    <button type="button" className={e.marcoCabeza} aria-pressed={elegido} onClick={() => elegir(elegido ? null : { tipo: 'embudo', id: b.id })} title={b.info.frase}>
      {b.info.kicker && <span className={e.marcoCeja}>{b.info.kicker}</span>}
      <span className={e.marcoNombre}>{b.info.nombre}</span>
      {b.porConstruir && <span className={e.porConstruir}>Por construir</span>}
    </button>
  </div>
}

/** La punta de flecha al final del trazo, en la dirección del último tramo. */
function punta(p: Punto[], l = 7): string {
  const a = p[p.length - 2], b = p[p.length - 1]
  const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y)
  const nx = -dy, ny = dx
  return `M ${b.x} ${b.y} L ${b.x - dx * l + nx * l * 0.55} ${b.y - dy * l + ny * l * 0.55} L ${b.x - dx * l - nx * l * 0.55} ${b.y - dy * l - ny * l * 0.55} Z`
}

function VistaArista({ data }: EdgeProps<AristaRF>) {
  const t = data!.t
  const observada = t.arista.estado === 'observada'
  const caja = t.ancla && t.etiqueta ? cajaEtiqueta(t.etiqueta, t.ancla) : null
  return <g className={e.arista} data-tipo={t.tipo} data-por-construir={t.porConstruir || undefined} data-observada={observada || undefined}>
    <path className={e.aristaLinea} d={trazoSvg(t.puntos)} fill="none" />
    <path className={e.aristaPunta} d={punta(t.puntos)} />
    {caja && <g className={e.aristaEtiqueta}>
      <rect x={caja.x} y={caja.y} width={caja.w} height={caja.h} rx={caja.h / 2} />
      <text x={t.ancla!.x} y={t.ancla!.y} textAnchor="middle" dominantBaseline="central">{t.etiqueta}</text>
    </g>}
  </g>
}

export const TIPOS_NODO = { etapa: VistaEtapa, embudo: VistaMarco }
export const TIPOS_ARISTA = { trazo: VistaArista }

/** Los nodos y aristas de React Flow a partir del grafo. Posición absoluta: los marcos van detrás, las aristas en medio
 *  y las etapas encima, para que una arista que entra a su etapa se vea sobre el marco. */
export function elementosFlow(g: Grafo): { nodos: Node[]; aristas: AristaRF[] } {
  const marcos: NodoEmbudoRF[] = g.embudos.map(b => ({
    id: `embudo:${b.id}`, type: 'embudo', position: { x: b.rect.x, y: b.rect.y }, data: { b, o: g.orientacion },
    width: b.rect.w, height: b.rect.h, style: { width: b.rect.w, height: b.rect.h }, zIndex: 0, selectable: false, draggable: false, focusable: false,
  }))
  const etapas: NodoEtapaRF[] = g.etapas.map(n => ({
    id: n.id, type: 'etapa', position: { x: n.rect.x, y: n.rect.y }, data: { n, o: g.orientacion },
    width: n.rect.w, height: n.rect.h, style: { width: n.rect.w, height: n.rect.h }, zIndex: 2, selectable: false, draggable: false, focusable: false,
    // Las asas declaradas: la arista se pinta sin esperar a medirlas (también en el servidor). El trazo real sale de
    // `grafo.ts`; las asas solo dicen a React Flow que la arista existe.
    handles: [
      { type: 'target', position: Position.Top, x: n.rect.w / 2, y: 0, width: 1, height: 1 },
      { type: 'source', position: Position.Bottom, x: n.rect.w / 2, y: n.rect.h, width: 1, height: 1 },
    ],
  }))
  const aristas: AristaRF[] = g.aristas.map(t => ({ id: t.id, source: t.desde, target: t.hacia, type: 'trazo', data: { t }, zIndex: 1, selectable: false, focusable: false }))
  return { nodos: [...marcos, ...etapas], aristas }
}

/** El grafo a zoom 1, sin medir el contenedor ni moverse: lo que React Flow pinta en el servidor. Lo usa la prueba que
 *  comprueba que cada etapa, marco y arista salen en el HTML (tests/negocio/grafo.test.ts). */
export function GrafoFijo({ grafo }: { grafo: Grafo }) {
  const { nodos, aristas } = elementosFlow(grafo)
  return <ReactFlow nodes={nodos} edges={aristas} nodeTypes={TIPOS_NODO} edgeTypes={TIPOS_ARISTA} width={Math.ceil(grafo.limites.w)} height={Math.ceil(grafo.limites.h)} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />
}

interface Props {
  embudo: Embudo
  sel: Seleccion
  elegir: (s: Seleccion) => void
  /** Etapa que hay que traer a la vista (Habilidades › «Ver en tu negocio», el enlace del cuello). Cambia `n` para repetir. */
  enfocar?: { id: string; n: number } | null
  grande?: boolean
  /** El modo en que quedó, para que el panel acomode el detalle. */
  alCambiarModo?: (o: Orientacion) => void
}

export function GrafoEmbudo(props: Props) {
  const caja = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => setAncho(Math.round(el.getBoundingClientRect().width))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return <div ref={caja} className={e.grafoCaja}>
    {ancho > 0 ? <ReactFlowProvider><Lienzo {...props} ancho={ancho} /></ReactFlowProvider> : <div className={e.grafoEspera} aria-busy="true" />}
  </div>
}

function Lienzo({ embudo, sel, elegir, enfocar, grande, alCambiarModo, ancho }: Props & { ancho: number }) {
  const o = orientacionPara(ancho)
  const grafo = useMemo(() => construirGrafo(embudo, o), [embudo, o])
  const { nodos, aristas } = useMemo(() => elementosFlow(grafo), [grafo])
  const { setViewport, getViewport } = useReactFlow()
  const zoom = useStore(s => s.transform[2])
  useEffect(() => { alCambiarModo?.(o) }, [o, alCambiarModo])

  // El encuadre: estrecho, todo a lo ancho (el alto sale de ahí); ancho, todo adentro de un alto razonable.
  const L = grafo.limites
  // Ancho: los botones de zoom viven abajo a la izquierda; el encuadre les deja su franja para no tapar una cabeza.
  const reserva = o === 'ancho' ? 46 : 0
  const zAncho = Math.min(1, (ancho - 2 * AIRE - reserva) / L.w)
  // Ancho: que el grafo quepa en la pantalla con la cabeza encima (una laptop de 900 px lo ve entero sin bajar).
  const altoMax = Math.min(grande ? 760 : 620, Math.max(420, (typeof window === 'undefined' ? 900 : window.innerHeight) - 140))
  const alto = o === 'estrecho' ? Math.ceil(L.h * zAncho + 2 * AIRE) : Math.round(Math.min(altoMax, Math.max(420, L.h * zAncho + 2 * AIRE)))
  const zEncuadre = o === 'estrecho' ? zAncho : Math.max(ZOOM_MIN, Math.min(zAncho, (alto - 2 * AIRE) / L.h))
  const encuadre = useMemo<Viewport>(() => ({ x: reserva + (ancho - reserva - L.w * zEncuadre) / 2, y: AIRE, zoom: zEncuadre }), [ancho, reserva, L.w, zEncuadre])
  const encuadrar = useCallback(() => setViewport(encuadre, { duration: 240 }), [encuadre, setViewport])
  useEffect(() => { setViewport(encuadre) }, [encuadre, setViewport])

  // Estrecho y sin acercar: quieto, la página baja con el dedo. Acercado: suelto, se arrastra.
  const suelto = o === 'ancho' || zoom > zEncuadre * 1.04

  const raiz = useRef<HTMLDivElement>(null)
  const nodoDom = useCallback((id: string) => raiz.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`) ?? null, [])

  // Traer una etapa a la vista. Estrecho y quieto: la página baja hasta ella (arriba, para que el detalle que aparece
  // abajo no la tape). Si no: el lienzo se corre sin cambiar el zoom y deja libre la franja derecha del detalle.
  const traer = useCallback((id: string, suave = true) => {
    const n = grafo.etapas.find(x => x.id === id)
    if (!n) return
    const vp = getViewport()
    if (o === 'estrecho' && vp.zoom <= zEncuadre * 1.04) {
      const el = nodoDom(id)
      const r = el?.getBoundingClientRect()
      if (el && r && (r.top < 0 || r.bottom > window.innerHeight * 0.4)) el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
      return
    }
    // Lo justo para que la etapa quede entera a la vista (y a la izquierda del detalle): el resto del dibujo no se mueve
    // más de lo necesario, para no perder el contexto.
    const libre = o === 'ancho' ? Math.max(240, ancho - Math.min(380, ancho * 0.4) - 24) : ancho
    const m = 28, x1 = n.rect.x * vp.zoom + vp.x, x2 = (n.rect.x + n.rect.w) * vp.zoom + vp.x
    const y1 = n.rect.y * vp.zoom + vp.y, y2 = (n.rect.y + n.rect.h) * vp.zoom + vp.y
    const dx = x2 > libre - m ? libre - m - x2 : x1 < m ? m - x1 : 0
    const dy = y2 > alto - m ? alto - m - y2 : y1 < m ? m - y1 : 0
    if (!dx && !dy) return
    setViewport({ zoom: vp.zoom, x: vp.x + dx, y: vp.y + dy }, { duration: suave ? 320 : 0 })
  }, [grafo, getViewport, setViewport, nodoDom, o, zEncuadre, ancho, alto])
  useEffect(() => { if (enfocar) { const t = setTimeout(() => traer(enfocar.id), 60); return () => clearTimeout(t) } }, [enfocar, traer])
  useEffect(() => { if (sel?.tipo === 'etapa') traer(sel.id) }, [sel, traer])

  const contexto = useMemo(() => ({ sel, elegir, alEnfocar: (id: string) => { if (o === 'ancho') traer(id, false) } }), [sel, elegir, o, traer])

  return <Eleccion.Provider value={contexto}>
    <div ref={raiz} className={e.grafo} data-o={o} data-quieto={!suelto || undefined} style={{ height: alto }} role="group" aria-label={`El sistema de ${embudo.negocio}: ${grafo.embudos.length} embudos y ${grafo.etapas.length} etapas`}>
      <ReactFlow
        nodes={nodos} edges={aristas} nodeTypes={TIPOS_NODO} edgeTypes={TIPOS_ARISTA}
        defaultViewport={encuadre} minZoom={ZOOM_MIN} maxZoom={ZOOM_MAX}
        nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} elementsSelectable={false}
        panOnDrag={suelto} panOnScroll={o === 'ancho'} zoomOnScroll={false} zoomOnPinch={suelto} zoomOnDoubleClick={false} preventScrolling={suelto}
        onPaneClick={() => elegir(null)}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        <Controls showInteractive={false} showFitView={false} position="bottom-left" aria-label="Acercar, alejar y encuadrar">
          <ControlButton onClick={encuadrar} title="Encuadrar todo" aria-label="Encuadrar todo"><Maximize size={13} /></ControlButton>
        </Controls>
      </ReactFlow>
    </div>
  </Eleccion.Provider>
}
