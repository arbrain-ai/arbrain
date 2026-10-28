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
import { Check, Code2, Eye, FileText, GitCompare, Maximize2, Pencil, RotateCcw, X } from 'lucide-react'
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
      {data.editable && !editando && <button className={d.editar} onClick={() => setEditando({ texto, base: data.hash! })}><Pencil size={13} aria-hidden />Editar</button>}
    </div>
    {editando ? <Editor ruta={input.ruta!} url={url} inicial={editando} enDisco={data.hash!} onSalir={() => setEditando(null)} />
      : actual === 'previa' && destino ? <Previa destino={destino} doc={data} />
      : actual === 'cambios' ? <Cambios doc={data} />
      : data.tipo === 'txt' ? <Txt texto={texto} />
      : <Markdown texto={texto} />}
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
  useEffect(() => { enviar({ tipo: 'arbrain-zoom', zoom }) }, [zoom])
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
  const pantalla = usePantallaCompleta(caja, marco, enviar)
  return <div ref={caja} className={d.htmlMarco} data-grande={grande || undefined} data-pantalla={pantalla.activa || undefined} data-pantalla-marco={pantalla.activa || undefined}>
    <iframe ref={marco} className={d.html} data-lector src={`${url}?tema=${inicial.current}`} sandbox="allow-scripts" title={titulo}
      onLoad={() => { enviar({ tipo: 'arbrain-tema', tema }); enviar({ tipo: 'arbrain-zoom', zoom }); enviar({ tipo: 'arbrain-pantalla', on: pantalla.activa }) }} />
    {pantalla.activa
      ? <button type="button" className={d.salirPantalla} onClick={pantalla.salir} aria-label="Salir de pantalla completa"><X size={18} aria-hidden /></button>
      : <button type="button" className={d.pantallaBtn} onClick={pantalla.entrar} title="Pantalla completa (gira el teléfono para verlo horizontal)"><Maximize2 size={14} aria-hidden /><span>Pantalla completa</span></button>}
  </div>
}

/** Pantalla completa del HTML (28 oct 2026: «un botón para expandir todo viendo horizontal para poder
 *  estudiarla bien»). Fullscreen API donde exista (escritorio, Android); en el iPhone no hay API para un div, así que el
 *  marco se fija a todo el viewport por CSS, encima de la barra de la app. Girar el teléfono solo cambia el viewport y el
 *  documento se re-escala. Dentro, el script inyectado (tema-html.ts) pasa láminas con toque y swipe. El iframe no se
 *  remonta: el deck conserva la lámina en la que iba. */
function usePantallaCompleta(caja: React.RefObject<HTMLDivElement | null>, marco: React.RefObject<HTMLIFrameElement | null>, enviar: (m: object) => void) {
  const [activa, setActiva] = useState(false)
  const nativa = useRef(false)
  type ConWebkit = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
  type DocWebkit = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
  const entrar = () => {
    setActiva(true)
    const el = caja.current as ConWebkit | null
    nativa.current = false
    try {
      if (el?.requestFullscreen) { nativa.current = true; el.requestFullscreen().catch(() => { nativa.current = false }) }
      else if (el?.webkitRequestFullscreen) { nativa.current = true; el.webkitRequestFullscreen() }
    } catch { nativa.current = false }
  }
  const salir = () => {
    setActiva(false)
    const doc = document as DocWebkit
    if (doc.fullscreenElement) doc.exitFullscreen().catch(() => {})
    else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.()
  }
  useEffect(() => {
    enviar({ tipo: 'arbrain-pantalla', on: activa })
    if (!activa) return
    marco.current?.focus()
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Sin API nativa (iPhone): el resto de la app se oculta (sus barras no pintan encima aunque tengan su propio z-index) y
    // los ancestros que harían de caja del `fixed` (transform, filter, contain) se neutralizan mientras dure.
    document.documentElement.dataset.pantallaDoc = ''
    const neutralizados: { el: HTMLElement; css: string }[] = []
    for (let el = caja.current?.parentElement; el && el !== document.body; el = el.parentElement) {
      const c = getComputedStyle(el)
      if (c.transform !== 'none' || c.filter !== 'none' || c.backdropFilter !== 'none' || /transform|filter/.test(c.willChange) || /paint|layout|strict|content/.test(c.contain)) {
        neutralizados.push({ el, css: el.style.cssText })
        el.style.setProperty('transform', 'none', 'important'); el.style.setProperty('filter', 'none', 'important'); el.style.setProperty('backdrop-filter', 'none', 'important')
        el.style.setProperty('will-change', 'auto', 'important'); el.style.setProperty('contain', 'none', 'important')
      }
    }
    const doc = document as DocWebkit
    // Si el sistema sale del fullscreen nativo (Esc, gesto), el modo se apaga con él.
    const cambio = () => { if (nativa.current && !doc.fullscreenElement && !doc.webkitFullscreenElement) { nativa.current = false; setActiva(false) } }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') salir()
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); enviar({ tipo: 'arbrain-nav', paso: e.key === 'ArrowRight' ? 1 : -1 }) }
    }
    const mensaje = (e: MessageEvent) => { if (e.source === marco.current?.contentWindow && e.data?.tipo === 'arbrain-salir') salir() }
    document.addEventListener('fullscreenchange', cambio); document.addEventListener('webkitfullscreenchange', cambio)
    window.addEventListener('keydown', tecla); window.addEventListener('message', mensaje)
    return () => {
      document.body.style.overflow = previo
      delete document.documentElement.dataset.pantallaDoc
      for (const { el, css } of neutralizados) el.style.cssText = css
      document.removeEventListener('fullscreenchange', cambio); document.removeEventListener('webkitfullscreenchange', cambio)
      window.removeEventListener('keydown', tecla); window.removeEventListener('message', mensaje)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa])
  return { activa, entrar, salir }
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
