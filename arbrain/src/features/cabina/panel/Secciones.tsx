'use client'
/**
 * Las secciones como pestañas del panel (2 oct 2026, pedido de Daniel: «unificar sfmap acá, así
 * como sfcal… esto debe ser agent-first»). Él no usa la barra de íconos: habla con Levy y Levy le
 * abre lo que hace falta. Aquí vive lo que lo hace posible a mano también:
 *
 *  · IconoVista   el ícono de la vista, en pestaña y ventana: el mismo de la barra izquierda (3 oct 2026, sin
 *                 submarcas: Calendario y Lienzo ya no llevan el logo de sfcal y sfmap).
 *  · MenuSecciones el «+» de la tira de pestañas: la entrada manual para abrir cualquier pestaña
 *                 (Tareas y Taller incluidas) y, debajo, «Guardadas» (el archivero, 3 oct 2026).
 *  · CuerpoSeccion lo que pinta la pestaña de Calendario o de Lienzo: la vista viva, no la del chat. El Calendario
 *                 es el MISMO editor de la sección (4 oct 2026, «el panel es la experiencia completa»).
 *  · Expandir     vive en la cabecera de la vista (AbrirCompleto, Cabina.tsx): lleva a la sección de la barra izquierda
 *                 en la misma fecha, página o zona. Sacarla a su propia ventana sigue con ⌘⌥B o arrastrando la pestaña.
 */
import { useAccesosCasa } from '@/shared/components/AccesosCasa'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as TeclaReact, type PointerEvent as PunteroReact } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Bookmark, FolderPlus, GripVertical, Hammer, ListChecks, Plus, Shapes, SlidersHorizontal, X } from 'lucide-react'
import { ICONO } from '../Cabina'
import { hoyCivil, NOMBRE, type Alcance, type MostrarInput, type Vista } from '../model'
import { useTituloConversacion } from '../conversaciones'
import { reabrir, sacarDelArchivero, useArchivero, type Entrada } from './archivero'
import { releer, useFuente } from '../datos'
import { useAccionesLienzos } from '@/features/canvas/state/acciones-lienzos'
import type { Carpeta, PaginaResumen as NubeResumen } from '@/features/canvas/state/nube'
import { THEMES } from '@/features/canvas/theme/tokens'
import { ArbolLienzos } from '@/features/canvas/ui/lienzos/ArbolLienzos'
import { useTheme } from '@/shared/contexts/theme-context'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { EVENTO_IR_CALENDARIO } from '@/features/planning/eventos'
import type { CalendarMode } from '@/features/planning/types'
import { useAskLevy } from '@/shared/hooks/useAskLevy'
import { esHoy, usePanelFijadas, ventanaPropia, type Fijada } from './fijadas'
import { PRINCIPAL } from './pestanas-fuera'
import { mostrarPanel } from './ventanas'
import { moverVisible, visibles } from './menu-orden'
import { arrastrarFila } from './arrastre-lista'
import { usePanelAjustes } from './panel-ajustes'
import { useAjustes } from '@/shared/stores/ajustes-store'
import { bajoElAncla, zoomUI } from '@/shared/lib/zoom-ui'
import p from './secciones.module.css'
import { zonaDueno } from '@/shared/lib/zona-dueno'

// El calendario (FullCalendar) y la pizarra (motor del lienzo) solo cargan al abrir su pestaña (6 oct 2026): este
// archivo lo importa el layout de toda la app y los arrastraba a cada ruta aunque nadie abriera esas pestañas.
const PlanningCalendar = dynamic(() => import('@/features/planning/PlanningCalendar').then(m => m.PlanningCalendar), { ssr: false })
const VistaPerro = dynamic(() => import('@/features/perro/VistaPerro').then(m => m.VistaPerro), { ssr: false })
const PizarraEmbebida = dynamic(() => import('../vistas/PizarraEmbebida').then(m => m.PizarraEmbebida), { ssr: false })

/** Ancho del menú «+» en px CSS (el mismo de `.menu` en secciones.module.css). */
const ANCHO_MENU = 340

export function IconoVista({ vista, size = 14 }: { vista: Vista; size?: number }) {
  // Segunda capa (27 oct 2026): si una vista desconocida se cuela, la pestaña lleva un ícono genérico y la app sigue en pie.
  const Icono = ICONO[vista] ?? Shapes
  return <Icono size={size} aria-hidden />
}

/** Lo que el «+» ofrece, en el orden en que Daniel las usa (Calendario arriba, 5 oct 2026). Tareas y Taller también: ninguna pestaña es obligatoria (3 oct 2026). */
type Opcion = { vista: Vista; nota: string } | { casa: 'tareas' | 'taller'; nota: string }
const OPCIONES: Opcion[] = [
  { vista: 'calendario', nota: 'Objetivo, tareas y agenda del día, la semana o el mes' },
  { casa: 'tareas', nota: 'Lo que espera tu decisión y tus tareas de hoy' },
  // Cohorte (18 oct 2026, Daniel: «¿pudiéramos tener un panel para toda esta data?»): la venta y la entrega de la cohorte fundadora.
  { vista: 'cohorte', nota: 'Cupos, cobros, llamadas y la Semana 1 de cada fundador' },
  { vista: 'lienzo', nota: 'Tus mapas y pizarras' },
  { vista: 'negocio', nota: 'Avatar, oferta, embudo y sistema' },
  // Masterclass sale del «+» (11 oct 2026): vive en Guardadas, abajo; Levy la abre con `mostrar {vista:'masterclass'}`.
  { vista: 'reporte', nota: 'Avisos y reportes de los crons' },
  { vista: 'centro', nota: 'Abre Finanzas · Lo que entra' },
  { vista: 'equipo', nota: 'Organigrama: qué le llega a cada quien y su último movimiento' },
  { vista: 'salud', nota: 'Tu cuerpo hoy desde el reloj, contra tu propio normal' },
  { vista: 'contenido', nota: 'Videos del mes contra la meta' },
  { vista: 'finanzas', nota: 'Lo que entra (Polar), lo registrado y runway' },
  // La historia de tu cerebro (27 oct 2026) salió del «+» el 28 oct: vive en Taller › Historia.
  // Explorador de archivos (8 oct 2026, Daniel: «principalmente por control»). Visible por defecto; quien no lo quiera lo apaga en Ajustes › Panel.
  { vista: 'explorador', nota: 'El árbol del repo: abre cualquier archivo en solo lectura' },
  // El «+» queda solo con negocio y vida (5 oct 2026, Daniel 18:11): Rutinas, Memoria y Servidores viven en el Taller.
  // Casa salió de aquí el 27 oct 2026 (Daniel: «porque esta este de casa arriba… todo bien organizado»): su único hogar en el
  // «+» es «Entorno físico», al pie, junto con Perro.
  { casa: 'taller', nota: 'Tu cerebro por dentro: agentes, historia, rutinas, memoria y máquina' },
]
const idOpcion = (o: Opcion) => 'casa' in o ? o.casa : o.vista
// Las ids del «+» son las de SECCIONES_MENU (menu-orden.ts); un test vigila que no se separen de las del servidor.
const OPCION_DE = new Map<string, Opcion>(OPCIONES.map(o => [idOpcion(o), o]))

/** Nombre, ícono y nota de una sección del «+», para el menú y para Ajustes › Panel (6 oct 2026). */
export const nombreSeccion = (id: string) => { const o = OPCION_DE.get(id); return !o ? id : 'casa' in o ? (o.casa === 'tareas' ? 'Tareas' : 'Taller') : NOMBRE[o.vista] }
export const notaSeccion = (id: string) => OPCION_DE.get(id)?.nota ?? ''
export function IconoSeccion({ id, size = 16 }: { id: string; size?: number }) {
  const o = OPCION_DE.get(id)
  if (!o) return null
  return 'casa' in o ? (o.casa === 'tareas' ? <ListChecks size={size} aria-hidden /> : <Hammer size={size - 1} aria-hidden />) : <IconoVista vista={o.vista} size={size} />
}

const ALCANCES_CAL: { id: Alcance; nombre: string }[] = [{ id: 'dia', nombre: 'Día' }, { id: 'semana', nombre: 'Semana' }, { id: 'mes', nombre: 'Mes' }]

type PaginaResumen = NubeResumen

/** Abre (o trae al frente) una sección como pestaña del panel: queda en la barra, al final (3 oct 2026). */
export function abrirSeccion(input: MostrarInput) {
  const id = usePanelFijadas.getState().fijar(`mano-${input.vista}-${Date.now().toString(36)}`, input)
  aEstaVentana(id)
  mostrarPanel(id)
  return id
}

/** Tareas o Taller de vuelta a la barra. */
export function abrirCasa(clave: 'tareas' | 'taller') {
  usePanelFijadas.getState().abrirCasa(clave)
  aEstaVentana(clave)
  mostrarPanel(clave)
}

/** Lo que se abre desde el «+» de una ventana aparte se queda en ESA ventana (5 oct 2026). */
function aEstaVentana(clave: string) {
  const v = ventanaPropia()
  if (v !== PRINCIPAL) usePanelFijadas.getState().moverAVentana(clave, v)
}

/** `clase`: el botón con otro vestido (en la cabecera del teléfono, el de sus vecinos). */
export function MenuSecciones({ clase }: { clase?: string } = {}) {
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const cerrar = () => setAbierto(false)
  useEffect(() => {
    if (!abierto) return
    const r = boton.current?.getBoundingClientRect()
    // Alineado al borde derecho del «+», pero siempre dentro de la pantalla (en el teléfono el «+» va casi al centro).
    // Medido en px de pantalla y convertido con el zoom de la UI: sin eso, a ⌘+ el menú salía por la derecha (3 oct 2026).
    const z = zoomUI(), ancho = Math.min(ANCHO_MENU * z, window.innerWidth - 16)
    if (r) setPos(bajoElAncla(r, ancho, { ancho: window.innerWidth }, { z }))
    const fuera = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) cerrar() }
    // Escape durante un arrastre cancela solo el arrastre (arrastre-lista.ts), no cierra el menú.
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[data-arrastrando]')) { e.preventDefault(); e.stopPropagation(); cerrar() } }
    window.addEventListener('pointerdown', fuera, true); window.addEventListener('keydown', esc, true)
    return () => { window.removeEventListener('pointerdown', fuera, true); window.removeEventListener('keydown', esc, true) }
  }, [abierto])
  return <>
    <button ref={boton} className={clase ?? p.mas} onClick={() => abierto ? cerrar() : setAbierto(true)} aria-haspopup="menu" aria-expanded={abierto}
      aria-label="Abrir una pestaña en el panel" title="Abrir una pestaña o algo guardado"><Plus size={15} /></button>
    {abierto && pos && createPortal(<div ref={menu} className={p.menu} style={{ top: pos.top, left: pos.left }} role="menu" aria-label="Abrir en el panel">
      <OpcionesPanel onElegido={cerrar} />
    </div>, document.body)}
  </>
}

/** Lo que ofrece el «+» (y, en grande, el panel vacío): las vistas y, debajo, lo guardado. */
export function OpcionesPanel({ grande, onElegido }: { grande?: boolean; onElegido?: () => void }) {
  const [paso, setPaso] = useState<'secciones' | 'lienzos'>('secciones')
  const fijadas = usePanelFijadas(st => st.fijadas)
  const orden = usePanelFijadas(st => st.orden)
  const taller = usePanelFijadas(st => st.taller)
  const listo = () => { setPaso('secciones'); onElegido?.() }
  const abierta = (o: Opcion) => 'casa' in o ? (o.casa === 'taller' ? taller : orden.includes('tareas')) : fijadas.some(f => f.input.vista === o.vista)
  const elegir = (o: Opcion, alcance?: Alcance) => {
    if ('casa' in o) { abrirCasa(o.casa); listo(); return }
    if (o.vista === 'lienzo') { setPaso('lienzos'); return }
    abrirSeccion(alcance ? { vista: o.vista, alcance } : { vista: o.vista }); listo()
  }
  // La config del «+» vive en el servidor (panel-ajustes.ts): orden y ocultas, las mismas que ve Levy y que Daniel toca en Ajustes › Panel.
  const ajustes = usePanelAjustes(st => st.ajustes), cargarAjustes = usePanelAjustes(st => st.cargar), guardarAjustes = usePanelAjustes(st => st.guardar)
  useEffect(() => { cargarAjustes() }, [cargarAjustes])
  const ordenMenu = visibles(ajustes.orden, ajustes.ocultas)
  const opciones = ordenMenu.map(id => OPCION_DE.get(id)!).filter(Boolean)
  const cajaRef = useRef<HTMLDivElement>(null)
  const mover = (id: string, destino: number) => { void guardarAjustes({ orden: moverVisible(ajustes.orden, ajustes.ocultas, id, destino) }) }
  const enfocarManija = (id: string) => requestAnimationFrame(() => cajaRef.current?.querySelector<HTMLElement>(`[data-opcion="${id}"] [data-manija]`)?.focus())
  // Arrastre con la manija (arrastre-lista.ts): el DOM no se toca durante el gesto; la fila sigue al cursor, las vecinas abren hueco con resorte.
  const arrastrar = (id: string) => (e: PunteroReact<HTMLButtonElement>) => {
    if (!cajaRef.current) return
    arrastrarFila(e, { lista: cajaRef.current, selector: '[data-opcion]', desde: ordenMenu.indexOf(id), alSoltar: destino => mover(id, destino) })
  }
  const teclas = (id: string) => (e: TeclaReact<HTMLButtonElement>) => {
    const i = ordenMenu.indexOf(id)
    const a = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ordenMenu.length - 1 : null
    if (a == null) return
    e.preventDefault(); e.stopPropagation()
    if (a >= 0 && a < ordenMenu.length && a !== i) { mover(id, a); enfocarManija(id) }
  }
  if (paso === 'lienzos') return <ElegirLienzo onVolver={() => setPaso('secciones')} onElegir={pg => { abrirSeccion({ vista: 'lienzo', paginaId: pg.id, titulo: pg.nombre }); listo() }} />
  return <div ref={cajaRef} className={p.opciones} data-grande={grande || undefined}>
    {!grande && <p className={p.menuCeja}>Abrir en el panel</p>}
    {opciones.map(o => {
      const nombre = nombreSeccion(idOpcion(o))
      const icono = <IconoSeccion id={idOpcion(o)} />
      const yaEsta = abierta(o)
      const id = idOpcion(o)
      return <div key={nombre} className={p.menuFilaCaja} data-opcion={id}>
        <button className={p.manija} data-manija onPointerDown={arrastrar(id)} onKeyDown={teclas(id)} onClick={e => e.stopPropagation()}
          aria-label={`Mover ${nombre} (flechas arriba y abajo)`} title="Arrastra para acomodar · ↑ ↓ con el teclado"><GripVertical size={14} aria-hidden /></button>
        <button role="menuitem" className={p.menuFila} onClick={() => elegir(o)}>
          <span className={p.menuIcono}>{icono}</span>
          <span className={p.menuTexto}><b>{nombre}{yaEsta && <i className={p.yaAbierta}>abierta</i>}</b><small>{o.nota}</small></span>
        </button>
        {'vista' in o && o.vista === 'calendario' && <span className={p.alcances} role="group" aria-label="Abrir el calendario en">
          {ALCANCES_CAL.map(a => <button key={a.id} role="menuitem" onClick={() => elegir(o, a.id)} title={`Calendario · ${a.nombre}`}>{a.nombre}</button>)}
        </span>}
      </div>
    })}
    <button type="button" className={p.ajustesPanel} onClick={() => { onElegido?.(); useAjustes.getState().abrir('panel') }} title="Elegir qué secciones salen aquí, su orden y el organigrama del Equipo">
      <SlidersHorizontal size={12} aria-hidden /> Ajustes del panel
    </button>
    <Guardadas onElegido={listo} />
    <EntornoFisico onElegido={listo} />
    {!grande && <p className={p.menuPie}>O pídeselo a Levy: «ábreme el perro en el panel».</p>}
  </div>
}

/**
 * «Entorno físico» (27 oct 2026, Daniel: «ese botón pudiera estar dentro de un panel, hasta abajo tipo "entorno-físico"»).
 * Hasta abajo del «+», en escritorio y teléfono: Perro y Casa. Desde la tarde del 27 se abren como pestañas del panel
 * (Daniel: «todo esto puede abrirse en los paneles de la derecha??»); «Expandir» dentro de cada una lleva a /perro o /casa.
 */
function EntornoFisico({ onElegido }: { onElegido: () => void }) {
  const { visibles } = useAccesosCasa()
  const fijadas = usePanelFijadas(st => st.fijadas)
  if (!visibles.length) return null
  return <section className={p.guardadas} aria-label="Entorno físico" data-entorno-fisico>
    <p className={p.menuCeja}>Entorno físico</p>
    {visibles.map(({ vista, label, nota, icon: Icono }) => <div key={vista} className={p.menuFilaCaja} data-entorno={vista}>
      <button role="menuitem" className={p.menuFila} onClick={() => { abrirSeccion({ vista }); onElegido() }} title={`Abrir ${label} en el panel`}>
        <span className={p.menuIcono}><Icono size={16} aria-hidden /></span>
        <span className={p.menuTexto}><b>{label}{fijadas.some(f => f.input.vista === vista) && <i className={p.yaAbierta}>abierta</i>}</b><small>{nota}</small></span>
      </button>
    </div>)}
  </section>
}

/** «Guardadas»: el archivero (lo comparten la app y Levy). Un clic la reabre como pestaña. */
function Guardadas({ onElegido }: { onElegido: () => void }) {
  const { data, error } = useArchivero()
  const [quitando, setQuitando] = useState<string | null>(null)
  const entradas = data?.entradas ?? []
  return <section className={p.guardadas} aria-label="Guardadas">
    <p className={p.menuCeja}><Bookmark size={11} aria-hidden /> Guardadas{entradas.length > 0 && <small>{entradas.length}</small>}</p>
    {error && !data && <p className={p.menuPie}>No se pudo leer el archivero: {error}</p>}
    {data && !entradas.length && <p className={p.menuPie}>Nada guardado. Pasa el mouse por una pestaña y toca el marcador para guardarla aquí.</p>}
    {entradas.map(e => <div key={e.id} className={p.menuFilaCaja}>
      <button role="menuitem" className={p.menuFila} onClick={() => { reabrir(e); onElegido() }} title={e.input.vista === 'documento' ? e.input.ruta : undefined}>
        <span className={p.menuIcono}><IconoVista vista={e.input.vista} size={15} /></span>
        <span className={p.menuTexto}><b>{e.nombre}</b><small><OrigenGuardada e={e} /></small></span>
      </button>
      <button className={p.quitarGuardada} disabled={quitando === e.id} onClick={() => { setQuitando(e.id); void sacarDelArchivero(e.id).finally(() => setQuitando(null)) }}
        aria-label={`Quitar ${e.nombre} de Guardadas`} title="Quitar de Guardadas (no borra el archivo)"><X size={12} /></button>
    </div>)}
  </section>
}

function OrigenGuardada({ e }: { e: Entrada }) {
  const fecha = new Date(e.guardadaEn).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: zonaDueno() })
  return <>{e.conversacion ? <TituloDe id={e.conversacion} /> : 'Sin conversación'} · {fecha}</>
}
function TituloDe({ id }: { id: string }) { return <>{useTituloConversacion(id)}</> }

/**
 * «¿Qué lienzo?» (6 oct 2026): el MISMO árbol que la sección Lienzo (`ArbolLienzos`): Fijados (la carpeta fijada primero),
 * carpetas plegables, «Sin carpeta» y el pliegue «Archivados». Cada lienzo con su miniatura y su menú ⋯ (abrir, renombrar,
 * mover, duplicar, fijar, archivar, eliminar). Todo vive en la base de lienzos; nada se borra de golpe.
 * Un lienzo que ya está abierto como pestaña NO se oculta: lleva la etiqueta «abierta» (la del menú «+») y tocarlo activa su
 * pestaña (una pestaña por lienzo desde el 14 oct 2026: `abrirSeccion` reusa la de ese lienzo; otro lienzo abre otra).
 */
function ElegirLienzo({ onVolver, onElegir }: { onVolver: () => void; onElegir: (p: PaginaResumen) => void }) {
  const url = '/api/canvas/pages', urlCarpetas = '/api/canvas/folders'
  const { data, error } = useFuente<{ paginas: PaginaResumen[] }>(url)
  const { data: dc } = useFuente<{ carpetas: Carpeta[] }>(urlCarpetas)
  // La lectura compartida manda; las acciones cambian aquí al instante y confirman con la base (luego se relee).
  const [paginas, setPaginas] = useState<PaginaResumen[]>([])
  const [carpetas, setCarpetas] = useState<Carpeta[]>([])
  useEffect(() => { if (data) setPaginas(data.paginas) }, [data])
  useEffect(() => { if (dc) setCarpetas(dc.carpetas) }, [dc])
  const { resolvedTheme } = useTheme()
  const a = useAccionesLienzos({
    paginas, carpetas, setPaginas, setCarpetas,
    alTerminar: () => { void releer(url); void releer(urlCarpetas) },
    miniaturas: { activo: true, tema: THEMES[resolvedTheme === 'dark' ? 'oscuro' : 'claro'] },
  })
  const fijadas = usePanelFijadas(st => st.fijadas)
  const abiertas = useMemo(() => new Set(fijadas.flatMap(f => f.input.vista === 'lienzo' && f.input.paginaId ? [f.input.paginaId] : [])), [fijadas])

  return <>
    <div className={p.menuCabecera}>
      <button className={p.menuVolver} onClick={onVolver} aria-label="Volver a las secciones"><ArrowLeft size={14} /></button>
      <IconoVista vista="lienzo" size={14} /><b>¿Qué lienzo?</b>
      <button className={`${p.lienzoAccion} ${p.lienzoSiempre}`} style={{ marginLeft: 'auto' }} onClick={() => a.nuevaCarpeta()} aria-label="Carpeta nueva" title="Carpeta nueva"><FolderPlus size={14} aria-hidden /></button>
    </div>
    <div className={p.lienzos}>
      <ArbolLienzos variante="panel" autoFoco paginas={paginas} carpetas={carpetas} a={a} abiertas={abiertas} onAbrir={onElegir}
        estado={!data ? (error ?? 'Leyendo tus lienzos…') : null} />
    </div>
  </>
}

/** El cuerpo de la pestaña Calendario, Lienzo o Perro; null para las demás vistas (pintan su vista del chat). */
export function CuerpoSeccion({ f }: { f: Fijada }) {
  const actualizar = usePanelFijadas(st => st.actualizar)
  const router = useRouter(), ask = useAskLevy()
  // Perro (27 oct 2026): el mando completo a lo alto de la pestaña, con el STOP fijo abajo fuera del scroll.
  if (f.input.vista === 'perro') return <div className={`${p.seccionLlena} ${p.editor}`}><VistaPerro llena /></div>
  // Lienzo (4 oct 2026): el editor completo de la sección, no solo mirar. Sus atajos, solo con el foco dentro.
  if (f.input.vista === 'lienzo' && f.input.paginaId) return <div className={`${p.seccionLlena} ${p.editor}`}>
    <PizarraEmbebida paginaId={f.input.paginaId} zona={f.input.zona} soloConFoco
      // Cambió de lienzo por dentro (selector del título, Ctrl+L): ESTA pestaña pasa a mostrar el nuevo, sin abrir otra (6 oct 2026).
      alCambiarPagina={(id, nombre) => { if (id !== f.input.paginaId) { const { zona: _zona, titulo: _titulo, ...resto } = f.input; actualizar(f.id, { ...resto, paginaId: id, ...(nombre ? { titulo: nombre } : {}) }) } }} />
  </div>
  // Calendario y Objetivos son UNA vista (4 oct 2026): objetivo, tareas y calendario del día, la semana o el mes. «objetivos» llega
  // normalizado a «calendario» (fijadas.ts, `alias`), así que esta pestaña es la de los dos.
  if (f.input.vista === 'calendario') return <div className={`${p.seccionLlena} ${p.editor}`}>
    <PlanningCalendar donde="panel" inicio={{ fecha: f.input.fecha, modo: MODO_DE[f.input.alcance ?? 'semana'] }}
      onConversar={ask}
      onAbrirDocumento={(ruta, titulo) => abrirSeccion({ vista: 'documento', ruta, titulo })} onNavegar={url => router.push(url)}
      onCambio={(dia, modo) => {
        // En el periodo de hoy la pestaña no guarda fecha: así mañana abre en mañana (5 oct 2026, el «Hoy» que no avanzaba).
        const alcance = ALCANCE_DE[modo] ?? f.input.alcance, fecha = esHoy(alcance, dia) ? undefined : dia
        if (fecha !== f.input.fecha || alcance !== f.input.alcance) { const { fecha: _vieja, ...resto } = f.input; actualizar(f.id, { ...resto, alcance, ...(fecha ? { fecha } : {}) }) }
      }} />
  </div>
  return null
}

const MODO_DE: Record<Alcance, CalendarMode> = { dia: 'day', semana: 'week', mes: 'month' }
/** La pestaña recuerda día, semana o mes; 4 días y agenda cuentan como semana y el año como mes (Expandir abre ahí). */
const ALCANCE_DE: Partial<Record<CalendarMode, Alcance>> = { day: 'dia', fourDays: 'semana', week: 'semana', agenda: 'semana', month: 'mes', year: 'mes' }

/** «Abrir en su sección» (opción secundaria; Expandir es el modo enfoque, 4 oct 2026): la pestaña NO se cierra, nada del panel se pierde. Con la sección del calendario ya abierta, el Link a la misma
 *  ruta no la remonta: se le avisa la fecha y vista para que se ponga igual. */
export function alExpandir(f: Fijada) {
  if (f.input.vista === 'calendario' || f.input.vista === 'objetivos') window.dispatchEvent(new CustomEvent(EVENTO_IR_CALENDARIO, { detail: { fecha: f.input.fecha ?? hoyCivil(), modo: MODO_DE[f.input.alcance ?? 'semana'] } }))
}

export const esSeccion = (f: Fijada) => f.input.vista === 'perro' || f.input.vista === 'calendario' || f.input.vista === 'objetivos' || (f.input.vista === 'lienzo' && !!f.input.paginaId)
