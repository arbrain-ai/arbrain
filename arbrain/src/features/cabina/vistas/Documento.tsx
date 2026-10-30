'use client'
/**
 * Vista «documento» (3 oct 2026, pedido de Daniel): un archivo como pestaña con nombre propio.
 * «renderizar MD, HTML, mermaid; a mí no me interesa ver el código; como mucho modificar los md y txt».
 *
 *  · .md con sus diagramas mermaid · .txt para leer · .html aislado (iframe sin mismo origen) con sus
 *    assets · .mmd como diagrama · imágenes · video pausado y sin sonido · código: nunca.
 *  · Visor único (8 oct 2026): también .pdf (VisorPdf), video con versiones y marcas (VisorVideo), audio con forma de onda
 *    (VisorAudio), imágenes con su carpeta y comparador (Galeria) y una CARPETA como entrega (VisorEntrega). Todo en ./visor/.
 *  · Se relee cada 3 s mientras está montada; un cambio en disco se ve solo.
 *  · Editar .md/.txt con guarda de concurrencia: si el archivo cambió mientras editabas, no se pisa.
 *  · `destino:` en el frontmatter abre «Así se verá» (hoy feed-sfc); `compararCon` abre los cambios marcados.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Code2, Eye, FileText, GitCompare, Maximize2, MessageSquarePlus, Pencil, RotateCcw, X } from 'lucide-react'
import { useTheme } from '@/shared/contexts/theme-context'
import { MarkdownMessage } from '@/features/chat/components/MarkdownMessage'
import { MermaidDiagram, useIsTouchDevice, useZoom } from '@/features/chat/components/MermaidDiagram'
import { releer, useFuente } from '../datos'
import { useZoomPestana } from '../panel/zoom-pestana'
import type { MostrarInput } from '../model'
import { DESTINOS, enUnaLinea, esDestino, partirFrontmatter, parrafos, postDelFeed, type DestinoDocumento, type Trozo } from '../documento/frontmatter'
import { contarCambios, diffPalabras, plegar } from '../documento/diff'
import type { TipoDocumento } from '../documento/ruta'
import { ImagenRapida } from '@/shared/components/ImagenRapida'
import { anchoVariante, urlVariante, type MetaImagen } from '@/lib/imagenes/variantes'
import { VisorPdf } from './visor/VisorPdf'
import { VisorVideo, type VersionVideo } from './visor/VisorVideo'
import { VisorAudio } from './visor/VisorAudio'
import { VisorEntrega, type Entrega } from './visor/VisorEntrega'
import { Galeria, type ImagenItem } from './visor/Galeria'
import { Codigo } from './visor/Codigo'
import d from './documento.module.css'
import { Bandeja, Redactor, useAgentesAbiertos, type Objetivo } from '../documento/ComentariosEntregable'
import { lineaDeCita, useComentarios, type AgenteAbierto } from '../documento/comentarios'
import cc from '../documento/comentarios.module.css'
import { capital, instalacion, NOMBRE_DUENO } from '@/config'

interface Doc {
  ruta: string; archivo: string; tipo: TipoDocumento; editable: boolean
  texto?: string; hash?: string; mtime?: string; url?: string
  frontmatter?: Record<string, string>; portada?: string | null
  /** Ficha para servirla optimizada (5 oct 2026); null si es GIF/SVG o sharp no pudo: se pinta por `url`. */
  imagen?: MetaImagen | null; portadaImagen?: MetaImagen | null
  comparado?: { texto: string; etiqueta: string } | { error: string }
  /** Video (visor único): la versión pedida primero y las que se comparan con ella. */
  versiones?: VersionVideo[]
  /** Imagen: las de su carpeta (ventana de 25), cuántas hay en total y la segunda para deslizar. */
  hermanas?: ImagenItem[]; totalHermanas?: number
  comparada?: { ruta: string; archivo: string; url: string; imagen: MetaImagen | null } | { error: string }
  /** Carpeta de entrega. */
  items?: Entrega['items']; recortado?: boolean; manifiesto?: Entrega['manifiesto']
  /** Código o texto sin formato conocido pedido desde el explorador que resultó ser binario. */
  binario?: boolean; bytes?: number
}
type Modo = 'previa' | 'texto' | 'cambios'

export const urlDocumento = (ruta: string, comparar?: string, versiones?: string[], codigo?: boolean) =>
  `/api/cabina/documento?ruta=${encodeURIComponent(ruta)}${comparar ? `&comparar=${encodeURIComponent(comparar)}` : ''}${(versiones ?? []).map(x => `&version=${encodeURIComponent(x)}`).join('')}${codigo ? '&codigo=1' : ''}`

export function VistaDocumento({ input, grande }: { input: MostrarInput; grande?: boolean }) {
  const url = urlDocumento(input.ruta!, input.compararCon, input.versiones, !!input.explorador)
  const { data, error } = useFuente<Doc>(url, 3000)
  const fm = data?.frontmatter ?? {}
  const destino = esDestino(fm.destino) ? fm.destino : null
  const [modo, setModo] = useState<Modo | null>(null)
  const [editando, setEditando] = useState<{ texto: string; base: string } | null>(null)
  const actual: Modo = modo ?? (input.compararCon ? 'cambios' : destino ? 'previa' : 'texto')

  if (!data) return <div className={d.cargando} aria-busy="true">{error ? <p className={d.aviso}>{error}</p> : 'Abriendo el documento…'}</div>
  // Desde el explorador de archivos (8 oct 2026), el código y el texto sin formato conocido se leen: solo lectura, con color.
  if ((data.tipo === 'codigo' || data.tipo === 'otro') && input.explorador && data.texto != null) return <ZoomDoc clave={`doc:${input.ruta}`}><Codigo texto={data.texto} archivo={data.archivo} bytes={data.bytes} /></ZoomDoc>
  if (data.binario) return <p className={d.codigo}><Code2 size={15} aria-hidden />Es un archivo binario: no se puede leer como texto.</p>
  if (data.tipo === 'codigo' || data.tipo === 'otro') return <p className={d.codigo}><Code2 size={15} aria-hidden />{data.tipo === 'codigo' ? 'Es código: aquí no se enseña. Pídeselo a Levy en palabras.' : 'Este formato no se puede mostrar en el panel.'}</p>
  if (data.tipo === 'imagen') return <Imagen data={data} nombre={input.titulo ?? data.archivo} />
  if (data.tipo === 'pdf') return <VisorPdf key={data.ruta} url={data.url!} archivo={data.archivo} ruta={input.ruta!} grande={grande} />
  if (data.tipo === 'audio') return <VisorAudio url={data.url!} ruta={input.ruta!} archivo={data.archivo} tiempoInicial={input.tiempo} clave={input.ruta!} />
  // Nunca autoplay con sonido: arranca pausado y silenciado; Daniel le da play si quiere.
  if (data.tipo === 'video') return <VisorVideo versiones={data.versiones ?? []} tiempoInicial={input.tiempo} grande={grande} clave={input.ruta!} />
  if (data.tipo === 'carpeta') return <VisorEntrega data={{ archivo: data.archivo, ruta: input.ruta!, items: data.items ?? [], recortado: !!data.recortado, manifiesto: data.manifiesto ?? null }} grande={grande}
    abrir={sub => <VistaDocumento input={sub} grande={grande} />} />
  if (data.tipo === 'html') return <MarcoHtml key={data.hash} clave={`doc:${input.ruta}`} url={data.url!} titulo={input.titulo ?? data.archivo} grande={grande} />
  if (data.tipo === 'mermaid') return <ZoomDoc clave={`doc:${input.ruta}`}><div className={d.lienzo}><MermaidDiagram code={data.texto ?? ''} /></div></ZoomDoc>

  const texto = data.texto ?? ''
  return <ZoomDoc clave={`doc:${input.ruta}`}><CuerpoTexto data={data} input={input} url={url} destino={destino} actual={actual} setModo={setModo} editando={editando} setEditando={setEditando} /></ZoomDoc>
}

/** Texto, markdown y mermaid: el zoom de la pestaña escala el contenedor (la letra y el diagrama). */
export function ZoomDoc({ clave, children }: { clave: string; children: React.ReactNode }) {
  const caja = useRef<HTMLDivElement>(null)
  const { zoom } = useZoomPestana(clave, caja)
  return <div ref={caja} className={d.zoomable} style={zoom !== 1 ? { zoom } : undefined}>{children}</div>
}

function CuerpoTexto({ data, input, url, destino, actual, setModo, editando, setEditando }: {
  data: Doc; input: MostrarInput; url: string; destino: DestinoDocumento | null; actual: Modo; setModo: (m: Modo) => void
  editando: { texto: string; base: string } | null; setEditando: (e: { texto: string; base: string } | null) => void
}) {
  const texto = data.texto ?? ''
  // Comentar el entregable (29 oct 2026): se toca un párrafo, se escribe, y el lote se manda junto al agente.
  const [comentando, setComentando] = useState(false)
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null)
  const demo = useDemoComentarios()
  const mios = useComentarios().filter(x => x.ruta === input.ruta)
  // la lista de agentes solo se lee mientras se comenta o hay comentarios por mandar
  const agentes = useAgentesAbiertos(demo ?? (comentando || mios.length ? undefined : SIN_AGENTES))
  const cuerpo = useRef<HTMLDivElement>(null)
  const tocar = (e: React.MouseEvent) => {
    if (!comentando) return
    const el = (e.target as HTMLElement).closest('p, li, h1, h2, h3, h4, blockquote, pre, td')
    if (!el || !cuerpo.current?.contains(el) || el.closest('[data-redactor], [data-bandeja-comentarios]')) return
    const cita = (el.textContent ?? '').trim()
    if (!cita) return
    setObjetivo({ ruta: input.ruta!, cita, ...(lineaDeCita(texto, cita) ? { linea: lineaDeCita(texto, cita) } : {}) })
  }
  // los párrafos ya comentados se marcan (misma cita al inicio)
  useEffect(() => {
    const raiz = cuerpo.current
    if (!raiz) return
    raiz.querySelectorAll('[data-comentado]').forEach(x => x.removeAttribute('data-comentado'))
    if (!comentando && !mios.length) return
    const blo = Array.from(raiz.querySelectorAll('p, li, h1, h2, h3, h4, blockquote, pre, td'))
    for (const m of mios) { const c = (m.cita ?? '').replace(/\s+/g, ' ').trim().slice(0, 60); const el = c && blo.find(b => (b.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(c)); if (el) el.setAttribute('data-comentado', '') }
  })
  const opciones: { modo: Modo; nombre: string; Icono: typeof Eye }[] = [
    ...(destino ? [{ modo: 'previa' as const, nombre: 'Así se verá', Icono: Eye }] : []),
    { modo: 'texto', nombre: 'Texto', Icono: FileText },
    ...(input.compararCon ? [{ modo: 'cambios' as const, nombre: 'Cambios', Icono: GitCompare }] : []),
  ]
  return <div className={d.doc}>
    <div className={d.barra}>
      {opciones.length > 1 && !editando && <div className={d.conmutador} role="tablist" aria-label="Cómo verlo">
        {opciones.map(o => <button key={o.modo} role="tab" aria-selected={actual === o.modo} onClick={() => setModo(o.modo)}><o.Icono size={13} aria-hidden />{o.nombre}</button>)}
      </div>}
      {destino && actual === 'previa' && !editando && <span className={d.destino}>{DESTINOS[destino].nombre} · borrador, no publicado</span>}
      {/* «Comentar» a la izquierda de «Editar»: la esquina la ocupa el botón flotante de «Escuchar» */}
      {!editando && actual !== 'previa' && <button className={d.editar} aria-pressed={comentando} data-comentar onClick={() => { setComentando(!comentando); setObjetivo(null) }}
        title="Toca un párrafo para comentarlo; los comentarios se mandan juntos al agente"><MessageSquarePlus size={13} aria-hidden />{comentando ? 'Listo' : 'Comentar'}</button>}
      {data.editable && !editando && <button className={d.editar} style={actual !== 'previa' ? { marginLeft: 0 } : undefined} onClick={() => setEditando({ texto, base: data.hash! })}><Pencil size={13} aria-hidden />Editar</button>}
    </div>
    {comentando && !objetivo && <p className={d.meta}><span>Toca el párrafo que quieres comentar.</span></p>}
    {editando ? <Editor ruta={input.ruta!} url={url} inicial={editando} enDisco={data.hash!} onSalir={() => setEditando(null)} />
      : actual === 'previa' && destino ? <Previa destino={destino} doc={data} />
      : actual === 'cambios' ? <Cambios doc={data} />
      : <div ref={cuerpo} className={comentando ? cc.comentable : undefined} onClick={tocar}>{data.tipo === 'txt' ? <Txt texto={texto} /> : <Markdown texto={texto} />}</div>}
    {objetivo && <Redactor objetivo={objetivo} agentes={agentes} onCerrar={() => setObjetivo(null)} />}
    {!editando && <Bandeja agentes={agentes} solo={x => x.ruta === input.ruta} demo={!!demo} />}
  </div>
}

/** HTML aislado que sigue el tema de la app: nace con `?tema=` y, si cambia (a mano o por hora), recibe
 *  `postMessage` sin recargarse. El servidor le inyecta `html[data-tema]` (documento/tema-html.ts). */
function MarcoHtml({ clave, url, titulo, grande }: { clave: string; url: string; titulo: string; grande?: boolean }) {
  const { resolvedTheme } = useTheme()
  const tema = resolvedTheme === 'light' ? 'claro' : 'oscuro'
  const inicial = useRef(tema)
  const marco = useRef<HTMLIFrameElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const { zoom, rueda, tecla, pinza } = useZoomPestana(clave, caja)
  const enviar = (m: object) => marco.current?.contentWindow?.postMessage(m, '*')
  useEffect(() => { enviar({ tipo: 'arbrain-tema', tema }) }, [tema])
  // La rueda y las teclas ⌘ dentro del iframe aislado no llegan aquí: el script inyectado las reenvía.
  useEffect(() => {
    const al = (e: MessageEvent) => {
      if (e.source !== marco.current?.contentWindow) return
      if (e.data?.tipo === 'arbrain-rueda' && typeof e.data.dy === 'number') rueda(e.data.dy)
      else if (e.data?.tipo === 'arbrain-pinza' && ['ini', 'mov', 'fin'].includes(e.data.fase)) pinza(e.data.fase, typeof e.data.ratio === 'number' ? e.data.ratio : 1)
      else if (e.data?.tipo === 'arbrain-tecla' && ['+', '-', '0'].includes(e.data.tecla)) tecla(e.data.tecla)
      // Ctrl+D/X/W/M/Q (useAtajosCtrl): se repite la tecla en esta ventana para que la atienda el mismo escuchador.
      else if (e.data?.tipo === 'arbrain-ctrl' && /^Key[DXWMQ]$/.test(e.data.code)) window.dispatchEvent(new KeyboardEvent('keydown', { code: e.data.code, ctrlKey: true, cancelable: true }))
    }
    window.addEventListener('message', al); return () => window.removeEventListener('message', al)
  }, [rueda, tecla, pinza])
  const pantalla = usePantallaCompleta(caja, marco, enviar, zoom)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pantalla.activa) enviar({ tipo: 'arbrain-zoom', zoom }) }, [zoom])
  // Cada cambio de tamaño del marco (girar el teléfono, entrar o salir de pantalla completa) se le avisa al documento: en
  // el iPhone el iframe no siempre recibe su propio `resize` al girar y el deck se quedaba con la escala de la vertical.
  useEffect(() => {
    const el = caja.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => enviar({ tipo: 'arbrain-medida' }))
    ro.observe(el); return () => ro.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const salida = <button type="button" className={d.salirPantalla} onClick={pantalla.salir} aria-label="Salir de pantalla completa" title="Salir (desliza hacia abajo o doble toque arriba)"
    data-pantalla-marco data-llamada={pantalla.llamada || undefined}><X size={22} strokeWidth={2.5} aria-hidden /></button>
  return <>
    <div ref={caja} className={d.htmlMarco} data-grande={grande || undefined} data-pantalla={pantalla.activa || undefined} data-pantalla-marco={pantalla.activa || undefined}>
      <iframe ref={marco} className={d.html} data-lector src={`${url}?tema=${inicial.current}`} sandbox="allow-scripts" title={titulo}
        onLoad={() => { enviar({ tipo: 'arbrain-tema', tema }); enviar({ tipo: 'arbrain-zoom', zoom: pantalla.activa ? 1 : zoom }); enviar({ tipo: 'arbrain-pantalla', on: pantalla.activa }) }} />
      {!pantalla.activa && <button type="button" className={d.pantallaBtn} onClick={pantalla.entrar} title="Pantalla completa (o gira el teléfono)"><Maximize2 size={14} aria-hidden /><span>Pantalla completa</span></button>}
      {pantalla.activa && pantalla.nativa && salida}
    </div>
    {/* Sin API nativa (iPhone) la X vive en <body>, fuera de cualquier ancestro que la recorte: nunca queda atrapado. */}
    {pantalla.activa && !pantalla.nativa && createPortal(salida, document.body)}
  </>
}

type ConWebkit = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type DocWebkit = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
const TACTIL = '(pointer: coarse)'

/** ¿Este ancestro sería la caja de un `position: fixed` descendiente? En WebKit lo son transform/translate/rotate/scale,
 *  perspective, filter, backdrop-filter, will-change de esos, contain de layout o paint y `container-type` (29 oct 2026:
 *  `.fijadaCuerpo` del panel es `container-type: inline-size` y por eso el marco quedaba bajo la barra de la app). */
function encierraFixed(c: CSSStyleDeclaration) {
  const v = (k: string) => c.getPropertyValue(k)
  const algo = (k: string) => { const x = v(k); return !!x && x !== 'none' }
  return algo('transform') || algo('translate') || algo('rotate') || algo('scale') || algo('perspective') || algo('filter') || algo('backdrop-filter')
    || algo('-webkit-backdrop-filter') || /transform|filter|perspective|translate|rotate|scale|contain/.test(v('will-change'))
    || /paint|layout|strict|content|size/.test(v('contain')) || (!!v('container-type') && v('container-type') !== 'normal') || /auto|hidden/.test(v('content-visibility'))
}
const LIBRE: [string, string][] = [['transform', 'none'], ['translate', 'none'], ['rotate', 'none'], ['scale', 'none'], ['perspective', 'none'], ['filter', 'none'],
  ['backdrop-filter', 'none'], ['-webkit-backdrop-filter', 'none'], ['will-change', 'auto'], ['contain', 'none'], ['container-type', 'normal'], ['content-visibility', 'visible']]

/** Pantalla completa del HTML (28 oct 2026: «un botón para expandir todo viendo horizontal para poder estudiarla bien»;
 *  29 oct, tras probarlo en el iPhone: «no ocupa bien los márgenes de la pantalla horizontal, no se adaptó cuando cambié
 *  de vertical a horizontal, y cuando quise salir no vi ningún botón»).
 *  - Fullscreen API donde exista (escritorio, Android). En el iPhone no hay API para un div: el marco se fija al viewport
 *    VISIBLE medido (visualViewport) por CSS, encima de la barra de la app y del chat, y se vuelve a medir al girar.
 *  - Girar el teléfono a horizontal con un deck a la vista entra solo.
 *  - Salir: X fija arriba a la derecha (en <body>, fuera de todo recorte), deslizar hacia abajo, doble toque arriba, Escape.
 *  - El iframe no se remonta: el deck conserva la lámina en la que iba. */
function usePantallaCompleta(caja: React.RefObject<HTMLDivElement | null>, marco: React.RefObject<HTMLIFrameElement | null>, enviar: (m: object) => void, zoom: number) {
  const [activa, setActiva] = useState(false)
  const [nativa, setNativa] = useState(false)
  const [llamada, setLlamada] = useState(false)
  const cabe = useRef(false)
  const entrar = () => {
    const el = caja.current as ConWebkit | null
    let api = false
    try {
      if (el?.requestFullscreen) { api = true; el.requestFullscreen().catch(() => setNativa(false)) }
      else if (el?.webkitRequestFullscreen) { api = true; el.webkitRequestFullscreen() }
    } catch { api = false }
    setNativa(api); setActiva(true)
  }
  const salir = () => {
    setActiva(false); setNativa(false)
    const doc = document as DocWebkit
    if (doc.fullscreenElement) doc.exitFullscreen().catch(() => {})
    else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.()
  }
  // El documento dice si cabe en su ventana (un deck) o se desplaza (un texto largo): solo un deck entra solo al girar.
  useEffect(() => {
    const al = (e: MessageEvent) => { if (e.source === marco.current?.contentWindow && e.data?.tipo === 'arbrain-cabe') cabe.current = !!e.data.cabe }
    window.addEventListener('message', al); return () => window.removeEventListener('message', al)
  }, [marco])
  useEffect(() => {
    if (activa || !window.matchMedia(TACTIL).matches) return
    const horizontal = window.matchMedia('(orientation: landscape)')
    const girar = () => {
      const el = caja.current
      if (!horizontal.matches || !cabe.current || !el || !el.getClientRects().length || el.closest('[inert]')) return
      entrar()
    }
    horizontal.addEventListener('change', girar); return () => horizontal.removeEventListener('change', girar)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa])
  useEffect(() => {
    enviar({ tipo: 'arbrain-pantalla', on: activa })
    // Dentro, el deck a su tamaño natural: el zoom de la pestaña (pinza) no lo encoge.
    enviar({ tipo: 'arbrain-zoom', zoom: activa ? 1 : zoom })
    if (!activa) return
    marco.current?.focus()
    const raiz = document.documentElement
    raiz.dataset.pantallaDoc = ''
    // Ancestros que harían de caja del `fixed`: se liberan mientras dure, y otra vez tras cada giro (React pudo repintarlos).
    const originales = new Map<HTMLElement, string>()
    const liberar = () => {
      for (let el = caja.current?.parentElement; el && el !== document.body; el = el.parentElement) {
        if (!originales.has(el) && !encierraFixed(getComputedStyle(el))) continue
        if (!originales.has(el)) originales.set(el, el.style.cssText)
        for (const [k, v] of LIBRE) el.style.setProperty(k, v, 'important')
      }
    }
    let cuadro = 0
    const medir = () => {
      cancelAnimationFrame(cuadro)
      cuadro = requestAnimationFrame(() => {
        liberar()
        const vv = window.visualViewport
        raiz.style.setProperty('--pantalla-w', `${Math.round(vv?.width ?? window.innerWidth)}px`)
        raiz.style.setProperty('--pantalla-h', `${Math.round(vv?.height ?? window.innerHeight)}px`)
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
        enviar({ tipo: 'arbrain-medida' })
      })
    }
    medir()
    // iOS termina de acomodar el viewport unos cuadros después de `orientationchange`: se vuelve a medir.
    const tardes: number[] = []
    const girado = () => { medir(); for (const ms of [120, 350, 700]) tardes.push(window.setTimeout(medir, ms)) }
    const doc = document as DocWebkit
    // Si el sistema sale del fullscreen nativo (Esc, gesto), el modo se apaga con él.
    const cambio = () => { if (nativa && !doc.fullscreenElement && !doc.webkitFullscreenElement) salir() }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') salir()
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); enviar({ tipo: 'arbrain-nav', paso: e.key === 'ArrowRight' ? 1 : -1 }) }
    }
    let apagar = 0
    const mensaje = (e: MessageEvent) => {
      if (e.source !== marco.current?.contentWindow) return
      if (e.data?.tipo === 'arbrain-salir') salir()
      else if (e.data?.tipo === 'arbrain-toque-arriba') { setLlamada(true); clearTimeout(apagar); apagar = window.setTimeout(() => setLlamada(false), 900) }
    }
    window.addEventListener('resize', medir); window.addEventListener('orientationchange', girado); window.visualViewport?.addEventListener('resize', medir)
    document.addEventListener('fullscreenchange', cambio); document.addEventListener('webkitfullscreenchange', cambio)
    window.addEventListener('keydown', tecla); window.addEventListener('message', mensaje)
    return () => {
      cancelAnimationFrame(cuadro); tardes.forEach(clearTimeout); clearTimeout(apagar)
      delete raiz.dataset.pantallaDoc
      raiz.style.removeProperty('--pantalla-w'); raiz.style.removeProperty('--pantalla-h')
      for (const [el, css] of originales) el.style.cssText = css
      window.removeEventListener('resize', medir); window.removeEventListener('orientationchange', girado); window.visualViewport?.removeEventListener('resize', medir)
      document.removeEventListener('fullscreenchange', cambio); document.removeEventListener('webkitfullscreenchange', cambio)
      window.removeEventListener('keydown', tecla); window.removeEventListener('message', mensaje)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa])
  return { activa, nativa, llamada, entrar, salir }
}

/** Texto plano en párrafos (los separa una línea en blanco), cada uno con sus saltos: así «Escuchar» los lee y salta de uno a otro. */
function Txt({ texto }: { texto: string }) {
  const partes = useMemo(() => texto.split(/\n{2,}/).filter(p => p.trim()), [texto])
  return <div className={d.txtDoc} data-lector-dom>{partes.map((p, i) => <p key={i} className={d.txt}>{p}</p>)}</div>
}

/** Imagen que se amplía al tocarla (Daniel, 3 oct 2026: «en el phone le doy clic y no se expande»).
 *  Pantalla completa con pellizco/rueda para zoom y arrastre, mismo motor que los diagramas.
 *  En el panel va la variante a su ancho (5 oct 2026, una lámina de 6.9 MB tardaba en una cafetería); el visor
 *  abre la original completa. Desde el 8 oct: las demás de su carpeta a un lado (← →) y, con `compararCon`, un deslizador. */
function Imagen({ data, nombre }: { data: Doc; nombre: string }) {
  const [abierta, setAbierta] = useState<ImagenItem | null>(null)
  const unica: ImagenItem = { nombre: data.archivo, ruta: data.ruta, url: data.url!, imagen: data.imagen ?? null }
  const hermanas = data.hermanas?.length ? data.hermanas : [unica]
  return <figure className={d.medio}>
    <Galeria hermanas={hermanas} total={data.totalHermanas ?? hermanas.length} rutaActual={hermanas.find(h => h.nombre === data.archivo)?.ruta ?? data.ruta} comparada={data.comparada} abrirGrande={setAbierta} />
    {abierta && <VisorImagen url={abierta.url} meta={abierta.imagen} nombre={abierta.nombre === data.archivo ? nombre : abierta.nombre} onCerrar={() => setAbierta(null)} />}
  </figure>
}

/** La original llega por partes en una red lenta: debajo va la variante optimizada (y antes el placeholder), así lo
 *  que aún no baja se ve nítido en vez de vacío. La caja tiene la proporción de la imagen desde el primer pintado. */
function fondoDeVisor(meta: MetaImagen | null): React.CSSProperties | undefined {
  if (!meta) return undefined
  const px = typeof window === 'undefined' ? 1600 : Math.min(window.innerWidth, 1600) * Math.min(window.devicePixelRatio || 1, 2)
  return { width: 'auto', height: 'auto', backgroundColor: meta.color, backgroundImage: `url(${urlVariante(meta.hash, anchoVariante(px, meta.ancho), 'webp')}), url(${meta.placeholder})`, backgroundSize: '100% 100%' }
}

function VisorImagen({ url, meta, nombre, onCerrar }: { url: string; meta: MetaImagen | null; nombre: string; onCerrar: () => void }) {
  const marco = useRef<HTMLDivElement>(null)
  const zoom = useZoom(marco)
  const tactil = useIsTouchDevice()
  useEffect(() => {
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', k)
    return () => { document.body.style.overflow = previo; window.removeEventListener('keydown', k) }
  }, [onCerrar])
  return createPortal(<div className={d.visor} role="dialog" aria-modal="true" aria-label={nombre}>
    <div className={d.visorBarra}>
      <span>{nombre}</span>
      <div>
        {zoom.scale !== 1 && <button type="button" onClick={zoom.reset} aria-label="Restablecer zoom"><RotateCcw size={16} aria-hidden /></button>}
        <button type="button" onClick={onCerrar} aria-label="Cerrar"><X size={20} aria-hidden /></button>
      </div>
    </div>
    <div ref={marco} className={d.visorLienzo} style={{ touchAction: 'none', cursor: zoom.scale > 1 ? 'grab' : 'zoom-in' }}
      onClick={e => { if (e.target === e.currentTarget && zoom.scale === 1) onCerrar() }}>
      <div ref={zoom.targetRef} style={{ willChange: 'transform', transformOrigin: 'center center' }}>
        <img src={url} alt={nombre} draggable={false} width={meta?.ancho} height={meta?.alto} style={fondoDeVisor(meta)} />
      </div>
    </div>
    <p className={d.visorPie}>{tactil ? 'Pellizca para zoom · arrastra para mover · doble toque restablece' : 'Rueda para zoom · arrastra para mover · Esc cierra'}</p>
  </div>, document.body)
}

function Markdown({ texto }: { texto: string }) {
  const { datos, cuerpo } = partirFrontmatter(texto)
  const claves = Object.keys(datos)
  return <div className={d.md} data-lector-dom>
    {claves.length > 0 && <p className={d.meta} data-no-leer>{claves.map(k => <span key={k}><b>{k}</b> {datos[k]}</span>)}</p>}
    <MarkdownMessage content={cuerpo} />
  </div>
}

/** Editor simple (no IDE). Guarda solo si el disco sigue como cuando empezaste a editar. */
function Editor({ ruta, url, inicial, enDisco, onSalir }: { ruta: string; url: string; inicial: { texto: string; base: string }; enDisco: string; onSalir: () => void }) {
  const [texto, setTexto] = useState(inicial.texto)
  const [estado, setEstado] = useState<'listo' | 'guardando' | 'conflicto' | { error: string }>('listo')
  const cambioFuera = enDisco !== inicial.base
  const guardar = async () => {
    setEstado('guardando')
    try {
      const r = await fetch('/api/cabina/documento', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruta, texto, base: inicial.base }) })
      const body = await r.json().catch(() => ({}))
      if (r.status === 409) { setEstado('conflicto'); return }
      if (!r.ok) { setEstado({ error: body.error ?? `No se pudo guardar (${r.status}).` }); return }
      await releer(url); onSalir()
    } catch (e) { setEstado({ error: e instanceof Error ? e.message : 'No se pudo guardar.' }) }
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void guardar() } }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  const conflicto = estado === 'conflicto' || cambioFuera
  return <div className={d.editor}>
    {conflicto && <p className={d.aviso}>Cambió mientras editabas (lo tocó Levy u otra ventana). Guardar no pisa su versión.
      <button className={d.enlace} onClick={() => { void releer(url).then(onSalir) }}><RotateCcw size={12} aria-hidden />Recargar (pierdes lo que escribiste aquí)</button></p>}
    {typeof estado === 'object' && <p className={d.aviso}>{estado.error}</p>}
    <textarea value={texto} onChange={e => setTexto(e.target.value)} spellCheck lang="es" autoFocus aria-label="Texto del documento" />
    <div className={d.pieEditor}>
      <button className={d.guardar} onClick={() => void guardar()} disabled={estado === 'guardando' || texto === inicial.texto}><Check size={13} aria-hidden />{estado === 'guardando' ? 'Guardando…' : 'Guardar'}</button>
      <button className={d.cancelar} onClick={onSalir}>Cancelar</button>
      <small>⌘S guarda</small>
    </div>
  </div>
}

function Cambios({ doc }: { doc: Doc }) {
  const c = doc.comparado
  const piezas = useMemo(() => c && 'texto' in c ? diffPalabras(c.texto, doc.texto ?? '') : null, [c, doc.texto])
  if (!c) return <p className={d.aviso}>Sin versión para comparar.</p>
  if ('error' in c) return <p className={d.aviso}>{c.error}</p>
  const n = contarCambios(piezas!)
  return <div className={d.cambios}>
    <p className={d.meta}><span>{n === 0 ? `Sin cambios contra ${c.etiqueta}.` : `${n} ${n === 1 ? 'cambio' : 'cambios'} contra ${c.etiqueta}`}</span><span className={d.leyenda}><del>quitado</del> <ins>agregado</ins></span></p>
    <div className={d.diff}>{plegar(piezas!).map((p, i) => p.tipo === 'pliegue' ? <span key={i} className={d.pliegue}>… {p.omitido.toLocaleString('es-MX')} caracteres sin cambios …</span>
      : p.tipo === 'quitado' ? <del key={i}>{p.texto}</del> : p.tipo === 'agregado' ? <ins key={i}>{p.texto}</ins> : <span key={i}>{p.texto}</span>)}</div>
  </div>
}

// ── Así se verá ──
const PREVIAS: Record<DestinoDocumento, (p: { doc: Doc }) => React.ReactNode> = { 'feed-sfc': PreviaFeed }
function Previa({ destino, doc }: { destino: DestinoDocumento; doc: Doc }) { const C = PREVIAS[destino]; return <C doc={doc} /> }

/** Quién firma en el feed (config/instalacion.ts › firmaFeed). Sin firma: la inicial, sin foto. */
const FIRMA = instalacion().firmaFeed ?? { nombre: capital(NOMBRE_DUENO()), foto: '' }

function Trozos({ trozos }: { trozos: Trozo[] }) {
  return <>{trozos.map((t, i) => 'salto' in t ? <br key={i} /> : t.negrita ? <strong key={i}>{t.texto}</strong> : <span key={i}>{t.texto}</span>)}</>
}

/** Copia de la tarjeta del feed (PostCard.tsx) y del post abierto (PostCardContent.tsx) de
 *  saas-factory-community, en su tema oscuro por defecto. Maqueta: no publica nada. */
function PreviaFeed({ doc }: { doc: Doc }) {
  const { datos, cuerpo } = partirFrontmatter(doc.texto ?? '')
  const post = postDelFeed(datos, cuerpo)
  const cabeza = (grande: boolean) => <div className={d.sfcAutor}>
    {FIRMA.foto ? <img src={FIRMA.foto} alt="" className={d.sfcFoto} /> : <span className={d.sfcFoto} aria-hidden />}
    <div className={d.sfcQuien}>
      <b>{FIRMA.nombre}</b>
      <span>ahora · <i className={grande ? d.sfcCategoriaGrande : d.sfcCategoria}>{post.categoria.emoji} {grande ? post.categoria.nombre : post.categoria.nombre.toUpperCase()}</i></span>
    </div>
  </div>
  return <div className={d.sfc}>
    <p className={d.sfcEtiqueta}>En el feed</p>
    <article className={d.sfcTarjeta}>
      {cabeza(false)}
      <div className={d.sfcFila}>
        <div className={d.sfcTexto}>
          <h3 className={d.sfcTitulo}>{post.titulo || 'Sin título'}</h3>
          <p className={d.sfcResumen}>{enUnaLinea(post.contenido)}</p>
        </div>
        {doc.portada && <span className={d.sfcMini}>{doc.portadaImagen ? <ImagenRapida meta={doc.portadaImagen} alt="" ajuste="cover" style={{ width: '100%', height: '100%' }} /> : <img src={doc.portada} alt="" />}</span>}
      </div>
      <div className={d.sfcAcciones}><span>👍 0</span><span>💬 0</span><span className={d.sfcNuevo}>Nuevo</span></div>
    </article>
    <p className={d.sfcEtiqueta}>Al abrirlo</p>
    <article className={`${d.sfcTarjeta} ${d.sfcAbierto}`}>
      {cabeza(true)}
      <h2 className={d.sfcTituloAbierto}>{post.titulo || 'Sin título'}</h2>
      <div className={d.sfcCuerpo}>{parrafos(post.contenido).map((p, i) => <p key={i}><Trozos trozos={p} /></p>)}</div>
      {doc.portada && <span className={d.sfcPortada}>{doc.portadaImagen ? <ImagenRapida meta={doc.portadaImagen} alt="Portada del post" altoMax="250px" style={{ borderRadius: 8 }} /> : <img src={doc.portada} alt="Portada del post" />}</span>}
      {!doc.portada && doc.frontmatter?.imagen && <p className={d.aviso}>No encontré la imagen «{doc.frontmatter.imagen}».</p>}
      <div className={d.sfcPie}><span>👍 Like</span><span>💬 0 comments</span><span>🔖 Guardar</span></div>
    </article>
  </div>
}

const SIN_AGENTES: AgenteAbierto[] = []

/** `?demo-comentarios=1`: un agente de ejemplo dueño del documento abierto, SOLO para capturas (el envío no sale). */
function useDemoComentarios(): AgenteAbierto[] | undefined {
  const [demo, setDemo] = useState<AgenteAbierto[] | undefined>(undefined)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('demo-comentarios') === '1') setDemo([{ id: 900321, nombre: q.get('demo-agente') ?? 'escribir el reporte de Warp', cwd: q.get('demo-cwd') ?? '~/Developer' }])
  }, [])
  return demo
}
