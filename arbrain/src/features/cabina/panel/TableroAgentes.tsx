'use client'
/**
 * Tablero de agentes por estado (27 oct 2026, BRECHA §2, 1:3:1 #2 opción B; ronda 2 con el crítico ciego y Claude Duet
 * de referente). Responde de un vistazo «¿quién trabaja para mí, qué me espera y qué entregó?» para los subagentes que
 * Levy lanzó con `delegar` (la única vía).
 *
 *  · Renglones escaneables, no tarjetas: forma de estado, nombre, qué está haciendo en español (su último paso, sin
 *    salida cruda) y cuánto lleva. Diez a quince por pantalla.
 *  · Dos vistas: «Ahora» (te espera, trabajando, falló, murió) y «Hecho» (listo para revisar, con lo que entregó y el
 *    veredicto del juez separado). Esperar a un agente no significa que terminó: solo pasa a «Hecho» cuando su turno
 *    cerró, y el juez dice si cumple lo pedido.
 *  · Color solo donde significa algo: estado en morado claro con forma (anillo que late, palomita, X, punteado), rojo
 *    solo en peligro (detener), «le faltó algo» neutro con ícono, y una sola acción principal: «Responder», cuando un agente te espera. Lo demás vive en «⋯».
 *  · El modelo, el latido técnico y la conversación de origen van al detalle del renglón.
 *  · `demo`: datos de ejemplo SOLO para capturas (`?demo-tablero=1`), rotulado en pantalla y sin botones activos.
 *
 * Ronda 3 (crítico ciego: «se contradice en sus números»): un solo diseño y una sola cuenta. Aquí viven también las
 * tareas internas de los turnos de Levy y las sesiones abiertas por ti (antes, tarjetas por conversación y el pliegue
 * «Terminados hoy» con otra forma y otra cuenta). Todos los números salen de `cuentas()`. En «Hecho» la forma del
 * renglón es el veredicto del juez: palomita neutra = cumple, X roja = no cumple, reloj gris = no verificable.
 *
 * Ronda 4 (crítico ciego: «demasiadas categorías técnicas»; referente: Tasks de bb en Cloudroom): sin pestañas
 * Ahora/Hecho. Tres grupos a la vista, Te espera, Trabajando y Listo, y una sola fila plegada «Más actividad» con lo
 * demás. Cada renglón de «Te espera» dice qué te toca con su botón: «Responder», «Ver qué pasó» o «¿Lo retomo?».
 *
 * Por conversación (29 oct 2026, Daniel: «antes yo ya categorizaba los subagentes por conversaciones, y eso se perdió»):
 * los grupos de estado ceden a un grupo por la conversación que lanzó a sus agentes (`tablero-por-conversacion.ts`), la
 * abierta primero y marcada, «Sin conversación» al final. Dentro, el orden por estado de la ronda 4. Cada grupo dice en
 * una línea qué tiene («2 trabajando · 1 te espera») y dibuja su línea de tiempo; se pliega y recuerda el pliegue.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Check, ChevronDown, ChevronRight, ChevronsUp, CircleAlert, CirclePause, Clock, Copy, Ellipsis, ExternalLink, GitBranch, GitCommitHorizontal, GitCompare, FileText, Hourglass, MessageCircleQuestionMark, MessageSquarePlus, NotebookPen, Play, Reply, RotateCcw, Square, UserRoundCheck, X, type LucideIcon } from 'lucide-react'
import { escalon, mov } from '@/shared/movimiento'
import { releer } from '../datos'
import { useAbrirConversacion, useConversacionActiva, useTituloConversacion } from '../conversaciones'
import {
  COLUMNA, DEMO_TITULOS, PERFIL_EN_PALABRAS, SIN_REVISAR, VEREDICTO, VEREDICTO_POR_QUE, armarTablero, cambiosEnPalabras, cuentas, demoTablero, esfuerzoEnPalabras, esfuerzoReintento, laten, latidoEnPalabras, senal, tiempoDe, totalTablero,
  type Entregable, type FilaTablero,
} from '../tablero-modelo'
import { agruparPorConversacion, claveFila, type GrupoConversacion } from '../tablero-por-conversacion'
import type { PlanPendiente, Veredicto } from '../trabajos-modelo'
import { abrirSeccion } from './Secciones'
import { hace, urlPanel, type Trabajos } from './datos'
import t from './tablero.module.css'
import { AgenteRespira } from './AgenteRespira'
import { pedirSegmentoTaller } from './taller-segmento'
import { pedirCarrilHistoria } from '@/features/historia/carril-pedido'

const modelo = (f: FilaTablero) => {
  // «claude-opus-5-5» → «Opus 5.5»; los ids de otros proveedores se dejan como los publica su CLI
  const m = /^claude-/.test(f.modelo ?? '') ? f.modelo!.replace(/^claude-/, '').replace(/-(\d)-(\d)$/, ' $1.$2').replace(/^./, c => c.toUpperCase()) : f.modelo ?? ''
  const h = f.harness === 'claude' ? 'Claude' : f.harness === 'codex' ? 'Codex' : f.harness
  const e = esfuerzoEnPalabras(f.coherencia)
  return [m ? `${h} · ${m}` : h, e].filter(Boolean).join(' · ')
}

/** El primer documento que entregó (ruta absoluta o relativa a su carpeta), para comentarlo. Solo lo que el panel lee. */
const archivoEntregado = (f: FilaTablero): string | null => {
  const e = f.entregables.find(x => x.tipo === 'archivo' && /\.(md|txt)$/i.test(x.valor))
  if (!e) return null
  return /^[/~]/.test(e.valor) ? e.valor : `${f.cwd.replace(/\/+$/, '')}/${e.valor}`
}

/** «Ver cambios»: Taller › Historia con el carril de su rama elegido. */
const verCambios = (rama: string) => { pedirCarrilHistoria(rama); pedirSegmentoTaller('historia') }

/** `?demo-tablero=1` en la URL: modo de demostración explícito (capturas). Nunca se activa solo. */
export function useDemoTablero(): Trabajos | null {
  const [demo, setDemo] = useState<Trabajos | null>(null)
  useEffect(() => { if (new URLSearchParams(window.location.search).get('demo-tablero') === '1') setDemo(demoTablero()) }, [])
  return demo
}

/** Los datos del Taller con el demo encima: los agentes del ejemplo reemplazan a los reales en TODO el Taller
 *  (encabezado, pestaña y tablero), para que el demo no mezcle cuentas reales con renglones de ejemplo. */
export function useDatosTaller(data: Trabajos | undefined): { datos: Trabajos | undefined; demo: boolean } {
  const demo = useDemoTablero()
  if (!demo) return { datos: data, demo: false }
  return { datos: data && { ...data, terminales: demo.terminales, internas: demo.internas, planes: demo.planes }, demo: true }
}

/** Reloj para «lleva 12 min»: cada 15 s basta (la lectura del panel también repinta cada 4 s). */
function useAhora(ms = 15_000) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const i = setInterval(() => setAhora(Date.now()), ms); return () => clearInterval(i) }, [ms])
  return ahora
}

async function accion(que: 'detener' | 'responder', agente: number, texto?: string, esfuerzo?: string): Promise<string> {
  const r = await fetch(`/api/cabina/${que}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agente, ...(texto ? { texto } : {}), ...(esfuerzo ? { esfuerzo } : {}) }), signal: AbortSignal.timeout(50_000) })
  const b = await r.json().catch(() => ({})) as { texto?: string; error?: string }
  if (!r.ok) throw new Error(b.error ?? 'El Studio no respondió.')
  void releer(urlPanel(false))
  return b.texto ?? 'Hecho.'
}

/** Retomar un agente que se detuvo: la misma vía que «Responder», con un mensaje fijo. */
export const MENSAJE_RETOMAR = 'Retoma donde te quedaste y termina el encargo. Si algo te lo impide, dime qué.'

export function TableroAgentes({ data, onAbrir, onAbrirInterna, demo = false }: { data: Trabajos | undefined; onAbrir: (id: number) => void; onAbrirInterna: (id: string) => void; demo?: boolean }) {
  const ahora = useAhora()
  const activa = useConversacionActiva()
  const tablero = armarTablero(data, undefined, ahora)
  const planes = data?.planes ?? []
  if (!totalTablero(tablero) && !planes.length) return null
  const n = cuentas(tablero)
  const abrir = (f: FilaTablero) => typeof f.id === 'number' ? onAbrir(f.id) : onAbrirInterna(f.id)
  const filas = (lista: FilaTablero[], quieto = false) => <div className={t.lista}>{lista.map(f => <Renglon key={claveFila(f)} f={f} onAbrir={abrir} demo={demo} ahora={ahora} quieto={quieto} />)}</div>
  // 29 oct 2026: por conversación (la lógica del 1 y 3 oct, sobre el tablero de hoy). Misma cuenta, otra forma de juntar.
  // En el demo, «Plan de la semana 1» hace de conversación abierta.
  const grupos = agruparPorConversacion(tablero, { activa: demo ? 'demo-cohorte' : activa, ahora })
  // Lo plegado: cuatro listas que no son trabajo para ti ahora mismo, en una sola fila.
  const mas = [
    { clave: 'procesos', titulo: 'Comandos corriendo en segundo plano', lista: tablero.procesos },
    { clave: 'cortas', titulo: 'Tareas rápidas de Levy y sesiones tuyas', lista: tablero.cortas },
    { clave: 'comandos', titulo: 'Comandos que terminaron', lista: tablero.comandosHechos },
    { clave: 'anteriores', titulo: 'Hace más de un día', lista: tablero.anteriores },
  ].filter(x => x.lista.length)
  return <div className={t.tablero} aria-label="Agentes de Levy por conversación">
    {demo && <p className={t.demo} role="note">Modo demostración: datos de ejemplo para la captura. Los botones no hacen nada.</p>}
    {planes.length > 0 && <PlanesPorCorrer planes={planes} demo={demo} />}
    {grupos.map((g, k) => <GrupoConversacionVista key={g.conversacion || 'sin-conversacion'} g={g} i={k + 1} demo={demo} ahora={ahora} onAbrir={abrir} />)}
    {!grupos.length && <p className={t.vacio}>Nadie trabaja ni te espera ahora.</p>}
    {mas.length > 0 && <details className={t.pliegue} data-grupo="mas">
      <summary><ChevronRight size={13} aria-hidden />Más actividad<small>{n.mas}</small></summary>
      {mas.map(x => <div key={x.clave} className={t.subgrupo} data-columna={x.clave}>
        <h5 className={t.subgrupoCabeza}>{x.titulo}<small>{x.lista.length}</small></h5>
        {filas(x.lista, true)}
      </div>)}
    </details>}
    {n.listos > 0 && <p className={t.honesto}>Algo pasa a «Listo» solo cuando terminó, y otro agente que no vio el trabajo revisa si cumple lo pedido.</p>}
  </div>
}

/** Lo que el dueño plegó o desplegó a mano, por conversación. Sin elección, manda `plegadoInicial`. */
const CLAVE_PLEGADOS = 'arbrain.taller.gruposPlegados'
function leerPlegados(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CLAVE_PLEGADOS) ?? '{}') as Record<string, boolean> } catch { return {} }
}
function guardarPlegado(id: string, plegado: boolean) {
  try { localStorage.setItem(CLAVE_PLEGADOS, JSON.stringify({ ...leerPlegados(), [id]: plegado })) } catch { /* sin almacenamiento */ }
}

/**
 * Un grupo por conversación (29 oct 2026): título que abre la conversación, «Esta conversación» si es la abierta, el
 * resumen en una línea con su línea de tiempo y los renglones por estado. Se pliega con el chevrón o tocando el
 * resumen; el pliegue se recuerda. Pasar el cursor por un tramo de la línea resalta su renglón, y al revés.
 */
function GrupoConversacionVista({ g, i, demo, ahora, onAbrir }: { g: GrupoConversacion; i: number; demo: boolean; ahora: number; onAbrir: (f: FilaTablero) => void }) {
  const tituloVivo = useTituloConversacion(g.conversacion && !demo ? g.conversacion : '')
  const titulo = !g.conversacion ? 'Sin conversación' : demo ? DEMO_TITULOS[g.conversacion] ?? tituloVivo : tituloVivo
  const abrirConv = useAbrirConversacion()
  const id = g.conversacion || '-'
  const cuerpo = useId()
  const [elegido, setElegido] = useState<boolean | null>(() => typeof window === 'undefined' ? null : leerPlegados()[id] ?? null)
  const plegado = elegido ?? g.plegadoInicial
  // Desplegado y quieto: la lista deja de recortar (el menú «⋯» del último renglón se sale de la caja). Mientras se
  // abre o se cierra, recorta: así el pliegue no derrama renglones sobre el grupo de abajo.
  const [asentado, setAsentado] = useState(!plegado)
  useEffect(() => {
    if (plegado) { setAsentado(false); return }
    const r = setTimeout(() => setAsentado(true), 420)
    return () => clearTimeout(r)
  }, [plegado])
  const [resaltado, setResaltado] = useState<string | null>(null)
  const alternar = () => { const v = !plegado; setElegido(v); guardarPlegado(id, v) }
  return <section className={`${t.conv} ${mov.entra}`} style={escalon(i)} data-activa={g.activa || undefined} data-plegado={plegado || undefined} aria-label={g.activa ? `Esta conversación: ${titulo}` : titulo}>
    <div className={t.convCabeza}>
      <button type="button" className={t.convPliegue} aria-expanded={!plegado} aria-controls={cuerpo} aria-label={`${plegado ? 'Desplegar' : 'Plegar'} «${titulo}»`} onClick={alternar}><ChevronRight size={13} aria-hidden /></button>
      {g.conversacion
        ? <button type="button" className={t.convTitulo} onClick={() => { if (!demo) abrirConv(g.conversacion) }} title={g.activa ? `«${titulo}»: la conversación que tienes abierta` : `Abrir «${titulo}» en el chat`}>
          <span className={t.convTituloTexto}>{titulo}</span>{!g.activa && <ArrowUpRight size={12} className={t.convIr} aria-hidden />}
        </button>
        : <span className={t.convTitulo} data-sin title="Crons, sesiones que abriste a mano y registros sin conversación"><span className={t.convTituloTexto}>{titulo}</span></span>}
      {g.activa && <span className={t.convAqui}>Esta conversación</span>}
      <span className={t.convCuenta} title={`${g.filas.length} ${g.filas.length === 1 ? 'agente' : 'agentes'} en este grupo`}>{g.filas.length}</span>
    </div>
    <div className={t.convResumen} onClick={alternar}>
      <span className={t.convPartes}>{g.resumen.map(p => <span key={p.parte} className={t.convParte} data-parte={p.parte}><i aria-hidden />{p.texto}</span>)}</span>
      <LineaGrupo linea={g.linea} resaltado={resaltado} onResaltar={setResaltado} />
    </div>
    <div id={cuerpo} className={`${mov.pliega} ${t.convCuerpo}`} data-plegada={plegado || undefined} data-asentado={asentado || undefined}>
      <div inert={plegado || undefined}>
        <div className={t.lista}>{g.filas.map((f, k) => <Renglon key={claveFila(f)} f={f} onAbrir={onAbrir} demo={demo} ahora={ahora} entrada={k}
          resaltado={resaltado === claveFila(f)} onResaltar={on => setResaltado(on ? claveFila(f) : null)} />)}</div>
      </div>
    </div>
  </section>
}

/** La línea de tiempo del grupo: un carril por agente, de su arranque a su última señal (o a ahora). Solo con dos o más. */
function LineaGrupo({ linea, resaltado, onResaltar }: { linea: GrupoConversacion['linea']; resaltado: string | null; onResaltar: (clave: string | null) => void }) {
  if (linea.tramos.length < 2) return null
  return <span className={t.linea} role="img" aria-label={linea.titulo} title={linea.titulo} onClick={e => e.stopPropagation()}>
    <small className={t.lineaEscala} aria-hidden>{linea.escala}</small>
    <span className={t.carriles}>{linea.tramos.map(x => <span key={x.clave} className={t.carril}>
      <i className={t.tramo} data-columna={x.columna} data-abierto={x.abierto || undefined} data-resaltado={resaltado === x.clave || undefined}
        style={{ left: `${x.x * 100}%`, width: `${x.ancho * 100}%` }} title={`${x.nombre} · ${COLUMNA[x.columna].singular}`}
        onPointerEnter={() => onResaltar(x.clave)} onPointerLeave={() => onResaltar(null)} />
    </span>)}</span>
    {linea.ocultos > 0 && <small className={t.lineaMas}>+{linea.ocultos}</small>}
  </span>
}

/** La forma del estado: se lee sin color. En un encargo terminado, la forma ES el veredicto del juez. */
const FORMA: Record<FilaTablero['columna'], LucideIcon | null> = { trabajando: null, 'te-espera': MessageCircleQuestionMark, listo: Check, 'falló': CircleAlert, 'murió': CirclePause }
const FORMA_VEREDICTO: Record<Veredicto | 'pendiente', LucideIcon> = { cumple: Check, 'no-cumple': X, 'no-verificable': Clock, 'sin-dod': UserRoundCheck, pendiente: Hourglass }
const veredictoDe = (f: FilaTablero): Veredicto | 'pendiente' | null => f.tipo === 'encargo' && f.columna === 'listo' ? f.juicio?.veredicto ?? 'pendiente' : null
function Forma({ f, ahora }: { f: FilaTablero; ahora: number }) {
  const ver = veredictoDe(f)
  const Icono = ver ? FORMA_VEREDICTO[ver] : FORMA[f.columna]
  if (!Icono) return <AgenteRespira tam={12} late={laten(f, ahora)} />
  return <Icono size={16} className={t.forma} data-veredicto={ver ?? undefined} aria-hidden />
}

function Insignia({ f }: { f: FilaTablero }) {
  if (!f.juicio) return <span className={t.insignia} data-veredicto="pendiente" title="Otro agente todavía no revisa si cumple lo pedido">{SIN_REVISAR}</span>
  return <span className={t.insignia} data-veredicto={f.juicio.veredicto} title={`${VEREDICTO_POR_QUE[f.juicio.veredicto]} ${f.juicio.razon}`}>
    {f.juicio.veredicto === 'no-cumple' && <CircleAlert size={12} aria-hidden />}{VEREDICTO[f.juicio.veredicto]}
  </span>
}

function Pieza({ e, demo, onNota }: { e: Entregable; demo: boolean; onNota: (texto: string) => void }) {
  if (e.tipo === 'enlace') return <a className={t.pieza} href={demo ? undefined : e.valor} target="_blank" rel="noopener noreferrer" title={e.valor} onClick={ev => ev.stopPropagation()}><ExternalLink size={11} aria-hidden /><span className={t.piezaTexto}>{e.etiqueta}</span></a>
  const Icono = e.tipo === 'commit' ? GitCommitHorizontal : FileText
  return <button type="button" className={t.pieza} title={e.tipo === 'commit' ? `Sus cambios quedaron guardados (${e.valor}) · clic para copiar la referencia` : `${e.valor} · clic para copiar`} onClick={ev => {
    ev.stopPropagation()
    void navigator.clipboard?.writeText(e.valor).then(() => onNota(e.tipo === 'commit' ? 'Referencia copiada.' : 'Ruta copiada.'), () => onNota(e.valor))
  }}><Icono size={11} aria-hidden /><span className={t.piezaTexto}>{e.etiqueta}</span><Copy size={10} className={t.copiar} aria-hidden /></button>
}

/** `quieto`: renglón dentro de «Más actividad» (no te toca ahora): sin botón visible; sus acciones siguen en «⋯». */
function Renglon({ f, onAbrir, demo, ahora, quieto = false, entrada, resaltado, onResaltar }: {
  f: FilaTablero; onAbrir: (f: FilaTablero) => void; demo: boolean; ahora: number; quieto?: boolean
  /** Índice de entrada al grupo: un renglón que llega (o cambia de conversación) sube escalonado una vez. */
  entrada?: number; resaltado?: boolean; onResaltar?: (on: boolean) => void
}) {
  const desde = useTituloConversacion(f.origen && !demo ? f.origen : '')
  const [modo, setModo] = useState<'nada' | 'responder' | 'detener' | 'detalle' | 'retomar'>('nada')
  const [menu, setMenu] = useState(false)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [nota, setNota] = useState<{ texto: string; error?: boolean } | null>(null)
  const caja = useRef<HTMLTextAreaElement>(null)
  const raiz = useRef<HTMLElement>(null)
  useEffect(() => { if (modo === 'responder') caja.current?.focus() }, [modo])
  useEffect(() => {
    if (!menu) return
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setMenu(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc) }
  }, [menu])
  const tiempo = tiempoDe(f, ahora)
  const sinSenal = senal(f, ahora)
  const encargo = f.tipo === 'encargo' && typeof f.id === 'number'
  const teEspera = encargo && f.columna === 'te-espera' && !f.conLevy
  const sinTerminar = encargo && !quieto && (f.columna === 'falló' || f.columna === 'murió')
  const correr = async (que: 'detener' | 'responder', fijo?: string, esfuerzo?: string) => {
    if (demo || typeof f.id !== 'number') { setModo('nada'); return }
    setOcupado(true); setNota(null)
    try { setNota({ texto: await accion(que, f.id, que === 'responder' ? fijo ?? texto.trim() : undefined, esfuerzo) }); setTexto(''); setModo('nada') }
    catch (e) { setNota({ texto: e instanceof Error ? e.message : 'No se pudo.', error: true }) }
    finally { setOcupado(false) }
  }
  const elegir = (m: typeof modo) => { setMenu(false); setNota(null); setModo(x => x === m ? 'nada' : m) }
  // Un turno nuevo en la misma sesión, un nivel de esfuerzo arriba: para lo que falló o no cumplió lo pedido
  const subir = encargo && (f.columna === 'falló' || f.juicio?.veredicto === 'no-cumple') ? esfuerzoReintento(f) : null
  const desajuste = encargo ? f.coherencia?.desajuste ?? null : null
  const opciones: { etiqueta: string; icono: LucideIcon; hacer: () => void; peligro?: boolean }[] = [
    { etiqueta: encargo ? 'Abrir su conversación' : 'Ver lo que hizo', icono: ArrowUpRight, hacer: () => { setMenu(false); onAbrir(f) } },
    ...(teEspera || !encargo ? [] : [{ etiqueta: 'Mandarle un mensaje', icono: Reply, hacer: () => elegir('responder') }]),
    ...(f.columna === 'falló' && encargo ? [{ etiqueta: 'Que lo intente otra vez', icono: RotateCcw, hacer: () => { setMenu(false); void correr('responder', MENSAJE_RETOMAR) } }] : []),
    ...(subir ? [{ etiqueta: `Reintentar con más esfuerzo (${subir})`, icono: ChevronsUp, hacer: () => { setMenu(false); void correr('responder', MENSAJE_RETOMAR, subir) } }] : []),
    ...(f.cambios ? [{ etiqueta: 'Ver cambios', icono: GitBranch, hacer: () => { setMenu(false); verCambios(f.cambios!.rama) } }] : []),
    // Comentar el entregable (29 oct 2026): el documento que entregó (párrafo por párrafo) o su diff (línea por línea); el
    // lote le llega junto por la misma vía que «Responder».
    ...(encargo && archivoEntregado(f) ? [{ etiqueta: 'Comentar su entregable', icono: MessageSquarePlus, hacer: () => { setMenu(false); abrirSeccion({ vista: 'documento', ruta: archivoEntregado(f)!, titulo: `Entregable · ${f.nombre}` }) } }] : []),
    ...(f.cambios && encargo ? [{ etiqueta: 'Comentar sus cambios', icono: MessageSquarePlus, hacer: () => { setMenu(false); verCambios(f.cambios!.rama) } }] : []),
    { etiqueta: modo === 'detalle' ? 'Ocultar detalles' : 'Ver detalles', icono: ChevronDown, hacer: () => elegir('detalle') },
    ...(f.puedeDetener ? [{ etiqueta: 'Detener este paso', icono: Square, hacer: () => elegir('detener'), peligro: true }] : []),
  ]
  const segunda: ReactNode = f.columna === 'listo' && encargo
    ? <span className={t.entrega}><Insignia f={f} />{f.entregables.map(e => <Pieza key={e.valor} e={e} demo={demo} onNota={x => setNota({ texto: x })} />)}{!f.entregables.length && <span className={t.paso}>{f.paso}</span>}</span>
    : <span className={t.paso}>{f.paso}{sinSenal && <span className={t.sinSenal}> · {sinSenal}</span>}</span>
  return <article ref={raiz} className={`${t.renglon}${entrada != null ? ` ${mov.entra}` : ''}`} style={entrada != null ? escalon(entrada) : undefined}
    data-columna={f.columna} data-abierto={modo !== 'nada' || undefined} data-resaltado={resaltado || undefined}
    onPointerEnter={onResaltar && (() => onResaltar(true))} onPointerLeave={onResaltar && (() => onResaltar(false))}>
    <div className={t.fila}>
      <button type="button" className={t.principal} onClick={() => onAbrir(f)} title={`${f.nombre} · ${encargo ? 'ver su conversación' : 'ver lo que hizo'}`}>
        <span className={t.marca}><Forma f={f} ahora={ahora} /></span>
        <span className={t.textos}>
          <span className={t.nombreLinea}><span className={t.nombre}>{f.nombre}</span>{desajuste && <span className={t.desajuste} title="Su CLI reporta que corre otra cosa que lo que se pidió">{desajuste}</span>}</span>
          {segunda}
        </span>
      </button>
      <span className={t.tiempo} title={tiempo.titulo}>{tiempo.texto}</span>
      {teEspera && <button type="button" className={t.responderAmbar} onClick={() => elegir('responder')} title="Contestarle (por la misma vía que Levy)">Responder</button>}
      {sinTerminar && f.columna === 'falló' && <button type="button" className={t.accionSuave} onClick={() => elegir('detalle')} aria-expanded={modo === 'detalle'}>Ver qué pasó</button>}
      {sinTerminar && f.columna === 'murió' && <button type="button" className={t.accionSuave} onClick={() => elegir('retomar')} aria-expanded={modo === 'retomar'}>¿Lo retomo?</button>}
      <div className={t.menuCaja}>
        <button type="button" className={t.mas} aria-haspopup="menu" aria-expanded={menu} aria-label={`Más acciones para ${f.nombre}`} onClick={() => setMenu(x => !x)}><Ellipsis size={15} aria-hidden /></button>
        {menu && <div className={`${t.menu} ${mov.aparece}`} role="menu">
          {opciones.map(o => <button key={o.etiqueta} type="button" role="menuitem" className={t.menuItem} data-peligro={o.peligro || undefined} onClick={o.hacer}><o.icono size={13} aria-hidden />{o.etiqueta}</button>)}
        </div>}
      </div>
    </div>
    {modo === 'detalle' && <dl className={`${t.detalle} ${mov.aparece}`}>
      <div><dt>{f.columna === 'falló' ? 'Qué pasó' : 'Estado'}</dt><dd>{!encargo ? f.motivo : f.conLevy && f.columna === 'te-espera' ? `Con Levy · ${f.motivo}` : f.columna === 'falló' ? f.motivo : `${COLUMNA[f.columna].titulo} · ${f.motivo}`}</dd></div>
      <div><dt>Empezó</dt><dd>{hace(f.creado)}{!demo && desde && f.origen ? ` · desde «${desde}»` : ''}</dd></div>
      <div><dt>Quién</dt><dd>{f.tipo === 'interna' ? 'Tarea dentro de un turno de Levy' : f.tipo === 'tuya' ? 'Sesión abierta por ti' : f.tipo === 'proceso' ? 'Comando en segundo plano' : modelo(f)}</dd></div>
      {desajuste && <div><dt>Ojo</dt><dd className={t.ambar}>{desajuste}. Lo reportó su CLI: corre con eso, no con lo pedido.</dd></div>}
      {f.perfil && <div><dt>Permisos</dt><dd>{PERFIL_EN_PALABRAS[f.perfil]}</dd></div>}
      {f.plan && <div><dt>Plan</dt><dd className={t.cambios}><span>{f.plan.ruta.split('/').pop()}{f.plan.commit ? ` · aprobado en ${f.plan.commit.slice(0, 7)}` : ''}</span>
        <button type="button" className={t.enlace} onClick={() => abrirSeccion({ vista: 'documento', ruta: f.plan!.ruta, titulo: `Plan · ${f.nombre}` })}><NotebookPen size={12} aria-hidden />Ver lo pedido</button></dd></div>}
      {f.cambios && <div><dt>Cambios</dt><dd className={t.cambios}><span>{cambiosEnPalabras(f.cambios)}</span><button type="button" className={t.enlace} onClick={() => verCambios(f.cambios!.rama)}><GitBranch size={12} aria-hidden />Ver cambios</button></dd></div>}
      {latidoEnPalabras(f, ahora) && <div><dt>Señal</dt><dd>{latidoEnPalabras(f, ahora)}</dd></div>}
      {f.juicio && <div><dt>Revisión</dt><dd>{VEREDICTO[f.juicio.veredicto]} · {f.juicio.razon}</dd></div>}
      {f.linea && f.linea !== f.paso && <div><dt>Dijo</dt><dd>{f.linea}</dd></div>}
      {f.cwd && <div><dt>Carpeta</dt><dd>{f.cwd}</dd></div>}
    </dl>}
    {modo === 'responder' && <form className={t.responder} onSubmit={e => { e.preventDefault(); if (texto.trim()) void correr('responder') }}>
      <label htmlFor={`resp-${f.id}`}>Mensaje para el agente</label>
      <textarea id={`resp-${f.id}`} ref={caja} rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Ej.: usa la rama B y vuelve a correr las pruebas"
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (texto.trim()) void correr('responder') } if (e.key === 'Escape') { e.preventDefault(); setModo('nada') } }} />
      <div className={t.acciones}>
        <button type="button" className={t.boton} onClick={() => setModo('nada')} disabled={ocupado}>Cancelar</button>
        <button type="submit" className={t.botonFuerte} disabled={ocupado || !texto.trim()}>{ocupado ? 'Enviando…' : 'Enviar'}</button>
      </div>
    </form>}
    {modo === 'detalle' && f.columna === 'falló' && encargo && <div className={`${t.acciones} ${t.accionesDetalle}`}>
      <button type="button" className={t.boton} onClick={() => onAbrir(f)}><ArrowUpRight size={12} aria-hidden />Abrir su conversación</button>
      {subir && <button type="button" className={t.boton} onClick={() => void correr('responder', MENSAJE_RETOMAR, subir)} disabled={ocupado} title={`Un turno nuevo en su misma sesión, con esfuerzo ${subir}`}><ChevronsUp size={12} aria-hidden />Reintentar con más esfuerzo</button>}
      <button type="button" className={t.botonFuerte} onClick={() => void correr('responder', MENSAJE_RETOMAR)} disabled={ocupado}><RotateCcw size={12} aria-hidden />{ocupado ? 'Enviando…' : 'Que lo intente otra vez'}</button>
    </div>}
    {modo === 'retomar' && <div className={t.confirma} role="group" aria-label="Confirmar retomar">
      <span>Le pido que retome donde se quedó y termine el encargo.</span>
      <div className={t.acciones}>
        <button type="button" className={t.boton} onClick={() => setModo('nada')} disabled={ocupado}>Ahora no</button>
        <button type="button" className={t.botonFuerte} onClick={() => void correr('responder', MENSAJE_RETOMAR)} disabled={ocupado}>{ocupado ? 'Enviando…' : 'Sí, retómalo'}</button>
      </div>
    </div>}
    {modo === 'detener' && <div className={t.confirma} role="group" aria-label="Confirmar detener">
      <span>¿Lo detengo? Su sesión sigue y un mensaje lo reanuda.</span>
      <div className={t.acciones}>
        <button type="button" className={t.boton} onClick={() => setModo('nada')} disabled={ocupado}>No</button>
        <button type="button" className={t.botonPeligro} onClick={() => void correr('detener')} disabled={ocupado}>{ocupado ? 'Deteniendo…' : 'Sí, detener'}</button>
      </div>
    </div>}
    {nota && <p className={`${t.nota} ${mov.aparece}`} data-error={nota.error || undefined} role="status">{nota.texto}</p>}
  </article>
}

/** Planes por correr (29 oct 2026, agent-server `cabina/plan.ts`): Levy escribió el encargo como archivo y espera tu «va».
 *  Abrirlo te deja leerlo y editarlo; «Correr» lanza el subagente con la versión que quedó (commit «aprobado») y el juez lo
 *  revisa contra esa Definición de Terminado. Descartar lo marca en el archivo; nunca se borra. */
function PlanesPorCorrer({ planes, demo }: { planes: PlanPendiente[]; demo: boolean }) {
  const [nota, setNota] = useState<Record<string, { texto: string; error?: boolean }>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [descartar, setDescartar] = useState<string | null>(null)
  const abrir = (p: PlanPendiente, comparar?: boolean) => abrirSeccion({ vista: 'documento', ruta: p.abs, titulo: `Plan · ${p.nombre}`, ...(comparar ? { compararCon: 'HEAD' } : {}) })
  const hacer = async (que: 'correr-plan' | 'descartar-plan', p: PlanPendiente) => {
    if (demo) { setNota(n => ({ ...n, [p.ruta]: { texto: 'Ejemplo: aquí correría el plan.' } })); return }
    setOcupado(p.ruta)
    try {
      const r = await fetch(`/api/cabina/${que}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruta: p.ruta }), signal: AbortSignal.timeout(60_000) })
      const b = await r.json().catch(() => ({})) as { texto?: string; error?: string }
      if (!r.ok) throw new Error(b.error ?? 'El Studio no respondió.')
      setNota(n => ({ ...n, [p.ruta]: { texto: b.texto ?? 'Hecho.' } })); void releer(urlPanel(false))
    } catch (e) { setNota(n => ({ ...n, [p.ruta]: { texto: e instanceof Error ? e.message : 'No se pudo.', error: true } })) } finally { setOcupado(null); setDescartar(null) }
  }
  return <section className={t.grupo} data-grupo="planes" aria-label="Planes por correr">
    <h4 className={t.grupoCabeza}>Planes por correr<small>{planes.length}</small></h4>
    <div className={t.planes}>{planes.map(p => <article key={p.ruta} className={t.plan} data-plan>
      <div className={t.planCabeza}>
        <NotebookPen size={14} aria-hidden className={t.planIcono} />
        <div className={t.planTexto}>
          <button type="button" className={t.planNombre} onClick={() => abrir(p)} title="Abrir para leerlo o editarlo">{p.nombre}</button>
          <p className={t.planResumen}>{p.resumen}</p>
          <p className={t.planMeta}>{p.harness} · {PERFIL_EN_PALABRAS[p.perfil].split(':')[0]}{p.propuesto ? ` · propuesto ${hace(p.propuesto)}` : ''}</p>
        </div>
      </div>
      <div className={t.planAcciones}>
        <button type="button" className={t.botonFuerte} disabled={ocupado === p.ruta} onClick={() => void hacer('correr-plan', p)}><Play size={12} aria-hidden />{ocupado === p.ruta ? 'Lanzando…' : 'Correr'}</button>
        <button type="button" className={t.boton} onClick={() => abrir(p)}><NotebookPen size={12} aria-hidden />Leer y editar</button>
        <button type="button" className={t.boton} onClick={() => abrir(p, true)} title="Lo que cambiaste contra lo que propuso Levy"><GitCompare size={12} aria-hidden />Tus cambios</button>
        {descartar === p.ruta
          ? <><button type="button" className={t.botonPeligro} onClick={() => void hacer('descartar-plan', p)}>Sí, descartar</button><button type="button" className={t.boton} onClick={() => setDescartar(null)}>No</button></>
          : <button type="button" className={t.accionSuave} onClick={() => setDescartar(p.ruta)}>Descartar</button>}
      </div>
      {nota[p.ruta] && <p className={t.planNota} data-error={nota[p.ruta].error || undefined} role="status">{nota[p.ruta].texto}</p>}
    </article>)}</div>
  </section>
}
