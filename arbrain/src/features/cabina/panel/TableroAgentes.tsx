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
 *
 * Recibido, Cerrar y Ver resultados (11 nov 2026, Daniel: «aquellos que terminaron su encargo… un botón de eliminar para
 * que no se acumulen o un botón de palomita como recibido, un visor de sus resultados»): cada encargo terminado lleva a la
 * vista la palomita (lo pasa a «Recibidos», reversible) y la X (la herramienta `cerrar` de la Cabina: libera su lugar, su
 * conversación queda en disco, nunca borra archivos). «Ver resultados» abre el visor de su evidencia (VisorResultados).
 * `?ver-resultados=<agente>&cwd=<carpeta>` abre el visor directo (capturas y enlaces de Levy).
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Check, ChevronDown, Images, Undo2, ChevronRight, ChevronsUp, CircleAlert, CirclePause, Clock, Copy, Ellipsis, ExternalLink, GitBranch, GitCommitHorizontal, GitCompare, FileText, Hourglass, MessageCircleQuestionMark, MessageSquarePlus, NotebookPen, Play, Reply, RotateCcw, Square, UserRoundCheck, X, type LucideIcon } from 'lucide-react'
import { escalon, mov } from '@/shared/movimiento'
import { releer } from '../datos'
import { useAbrirConversacion, useConversacionActiva, useTituloConversacion } from '../conversaciones'
import {
  COLUMNA, DEMO_TITULOS, PERFIL_EN_PALABRAS, SIN_REVISAR, VEREDICTO, VEREDICTO_POR_QUE, armarTablero, cambiosEnPalabras, cuentas, demoTablero, esfuerzoEnPalabras, esfuerzoReintento, estaRecibido, laten, latidoEnPalabras, modeloCorto, senal, terminoSuEncargo, tiempoDe, totalTablero,
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
import { sinRespuestaDelServidor } from '@/lib/edicion'
import { VisorResultados, type PedidoVisor } from './VisorResultados'
import { tr, trn } from '@/shared/i18n'

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

async function accion(que: 'detener' | 'responder' | 'cerrar' | 'recibido', agente: number, texto?: string, esfuerzo?: string, si?: boolean): Promise<string> {
  const r = await fetch(`/api/cabina/${que}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agente, ...(texto ? { texto } : {}), ...(esfuerzo ? { esfuerzo } : {}), ...(si != null ? { si } : {}) }), signal: AbortSignal.timeout(50_000) })
  const b = await r.json().catch(() => ({})) as { texto?: string; error?: string }
  if (!r.ok) throw new Error(b.error ?? sinRespuestaDelServidor())
  void releer(urlPanel(false))
  return b.texto ? tr(b.texto) : tr('Hecho.')
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
  // El que todavía prepara su copia no tiene conversación que abrir: su renglón solo dice que está naciendo.
  const abrir = (f: FilaTablero) => f.tipo === 'preparando' ? undefined : typeof f.id === 'number' ? onAbrir(f.id) : onAbrirInterna(f.id)
  const filas = (lista: FilaTablero[], quieto = false) => <div className={t.lista}>{lista.map(f => <Renglon key={claveFila(f)} f={f} onAbrir={abrir} demo={demo} ahora={ahora} quieto={quieto} />)}</div>
  // 29 oct 2026: por conversación (la lógica del 1 y 3 oct, sobre el tablero de hoy). Misma cuenta, otra forma de juntar.
  // En el demo, «Plan de la semana 1» hace de conversación abierta.
  const grupos = agruparPorConversacion(tablero, { activa: demo ? 'demo-cohorte' : activa, ahora })
  // Lo plegado: cuatro listas que no son trabajo para ti ahora mismo, en una sola fila.
  const mas = [
    { clave: 'procesos', titulo: tr('Comandos corriendo en segundo plano'), lista: tablero.procesos },
    { clave: 'cortas', titulo: tr('Tareas rápidas de Levy y sesiones tuyas'), lista: tablero.cortas },
    { clave: 'comandos', titulo: tr('Comandos que terminaron'), lista: tablero.comandosHechos },
    { clave: 'anteriores', titulo: tr('Hace más de un día'), lista: tablero.anteriores },
    { clave: 'recibidos', titulo: tr('Recibidos'), lista: tablero.recibidos },
  ].filter(x => x.lista.length)
  return <div className={t.tablero} aria-label={tr('Agentes de Levy por conversación')}>
    {demo && <p className={t.demo} role="note">{tr('Modo demostración: datos de ejemplo para la captura. Los botones no hacen nada.')}</p>}
    {planes.length > 0 && <PlanesPorCorrer planes={planes} demo={demo} />}
    {grupos.map((g, k) => <GrupoConversacionVista key={g.conversacion || 'sin-conversacion'} g={g} i={k + 1} demo={demo} ahora={ahora} onAbrir={abrir} />)}
    {!grupos.length && <p className={t.vacio}>{tr('Nadie trabaja ni te espera ahora.')}</p>}
    {mas.length > 0 && <details className={t.pliegue} data-grupo="mas">
      <summary><ChevronRight size={13} aria-hidden />{tr('Más actividad')}<small>{n.mas}</small></summary>
      {mas.map(x => <div key={x.clave} className={t.subgrupo} data-columna={x.clave}>
        <h5 className={t.subgrupoCabeza}>{x.titulo}<small>{x.lista.length}</small></h5>
        {filas(x.lista, true)}
      </div>)}
    </details>}
    {n.listos > 0 && <p className={t.honesto}>{tr('Algo pasa a «Listo» solo cuando terminó, y otro agente que no vio el trabajo revisa si cumple lo pedido.')}</p>}
    <VisorPorEnlace />
  </div>
}

/** `?ver-resultados=<agente>&cwd=<carpeta>[&nombre=…]`: el visor abierto directo, también para un agente que ya se cerró. */
function VisorPorEnlace() {
  const [pedido, setPedido] = useState<PedidoVisor | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const agente = Number(q.get('ver-resultados'))
    if (!Number.isInteger(agente) || agente <= 0) return
    setPedido({ agente, cwd: q.get('cwd') ?? '', nombre: q.get('nombre') ?? tr('Agente {n}', { n: agente }) })
  }, [])
  return pedido && <VisorResultados pedido={pedido} onCerrar={() => setPedido(null)} />
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
  const titulo = !g.conversacion ? tr('Sin conversación') : demo ? DEMO_TITULOS[g.conversacion] ?? tituloVivo : tituloVivo
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
  return <section className={`${t.conv} ${mov.entra}`} style={escalon(i)} data-activa={g.activa || undefined} data-plegado={plegado || undefined} aria-label={g.activa ? tr('Esta conversación: {titulo}', { titulo }) : titulo}>
    <div className={t.convCabeza}>
      <button type="button" className={t.convPliegue} aria-expanded={!plegado} aria-controls={cuerpo} aria-label={plegado ? tr('Desplegar «{titulo}»', { titulo }) : tr('Plegar «{titulo}»', { titulo })} onClick={alternar}><ChevronRight size={13} aria-hidden /></button>
      {g.conversacion
        ? <button type="button" className={t.convTitulo} onClick={() => { if (!demo) abrirConv(g.conversacion) }} title={g.activa ? tr('«{titulo}»: la conversación que tienes abierta', { titulo }) : tr('Abrir «{titulo}» en el chat', { titulo })}>
          <span className={t.convTituloTexto}>{titulo}</span>{!g.activa && <ArrowUpRight size={12} className={t.convIr} aria-hidden />}
        </button>
        : <span className={t.convTitulo} data-sin title={tr('Crons, sesiones que abriste a mano y registros sin conversación')}><span className={t.convTituloTexto}>{titulo}</span></span>}
      {g.activa && <span className={t.convAqui}>{tr('Esta conversación')}</span>}
      <span className={t.convCuenta} title={trn(g.filas.length, '{n} agente en este grupo', '{n} agentes en este grupo')}>{g.filas.length}</span>
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
        style={{ left: `${x.x * 100}%`, width: `${x.ancho * 100}%` }} title={`${x.nombre} · ${tr(COLUMNA[x.columna].singular)}`}
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
  if (!f.juicio) return <span className={t.insignia} data-veredicto="pendiente" title={tr('Otro agente todavía no revisa si cumple lo pedido')}>{tr(SIN_REVISAR)}</span>
  return <span className={t.insignia} data-veredicto={f.juicio.veredicto} title={`${tr(VEREDICTO_POR_QUE[f.juicio.veredicto])} ${f.juicio.razon}`}>
    {f.juicio.veredicto === 'no-cumple' && <CircleAlert size={12} aria-hidden />}{tr(VEREDICTO[f.juicio.veredicto])}
  </span>
}

function Pieza({ e, demo, onNota }: { e: Entregable; demo: boolean; onNota: (texto: string) => void }) {
  if (e.tipo === 'enlace') return <a className={t.pieza} href={demo ? undefined : e.valor} target="_blank" rel="noopener noreferrer" title={e.valor} onClick={ev => ev.stopPropagation()}><ExternalLink size={11} aria-hidden /><span className={t.piezaTexto}>{e.etiqueta}</span></a>
  const Icono = e.tipo === 'commit' ? GitCommitHorizontal : FileText
  return <button type="button" className={t.pieza} title={e.tipo === 'commit' ? tr('Sus cambios quedaron guardados ({ref}) · clic para copiar la referencia', { ref: e.valor }) : tr('{ruta} · clic para copiar', { ruta: e.valor })} onClick={ev => {
    ev.stopPropagation()
    void navigator.clipboard?.writeText(e.valor).then(() => onNota(e.tipo === 'commit' ? tr('Referencia copiada.') : tr('Ruta copiada.')), () => onNota(e.valor))
  }}><Icono size={11} aria-hidden /><span className={t.piezaTexto}>{e.etiqueta}</span><Copy size={10} className={t.copiar} aria-hidden /></button>
}

/** `quieto`: renglón dentro de «Más actividad» (no te toca ahora): sin botón visible; sus acciones siguen en «⋯». */
function Renglon({ f, onAbrir, demo, ahora, quieto = false, entrada, resaltado, onResaltar }: {
  f: FilaTablero; onAbrir: (f: FilaTablero) => void; demo: boolean; ahora: number; quieto?: boolean
  /** Índice de entrada al grupo: un renglón que llega (o cambia de conversación) sube escalonado una vez. */
  entrada?: number; resaltado?: boolean; onResaltar?: (on: boolean) => void
}) {
  const desde = useTituloConversacion(f.origen && !demo ? f.origen : '')
  const [modo, setModo] = useState<'nada' | 'responder' | 'detener' | 'detalle' | 'retomar' | 'cerrar'>('nada')
  const [visor, setVisor] = useState(false)
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
  // Lo que terminó su encargo: Recibido y Cerrar siempre a la vista; «Ver resultados» a la vista si está listo.
  const cierre = terminoSuEncargo(f)
  const recibido = estaRecibido(f)
  const correr = async (que: 'detener' | 'responder' | 'cerrar' | 'recibido', fijo?: string, esfuerzo?: string, si?: boolean) => {
    if (demo || typeof f.id !== 'number') { setModo('nada'); if (demo && (que === 'cerrar' || que === 'recibido')) setNota({ texto: tr('Ejemplo: aquí se marcaría.') }); return }
    setOcupado(true); setNota(null)
    try { setNota({ texto: await accion(que, f.id, que === 'responder' ? fijo ?? texto.trim() : undefined, esfuerzo, si) }); setTexto(''); setModo('nada') }
    catch (e) { setNota({ texto: e instanceof Error ? e.message : tr('No se pudo.'), error: true }) }
    finally { setOcupado(false) }
  }
  const verResultados = () => { setMenu(false); setVisor(true) }
  const elegir = (m: typeof modo) => { setMenu(false); setNota(null); setModo(x => x === m ? 'nada' : m) }
  // Un turno nuevo en la misma sesión, un nivel de esfuerzo arriba: para lo que falló o no cumplió lo pedido
  const subir = encargo && (f.columna === 'falló' || f.juicio?.veredicto === 'no-cumple') ? esfuerzoReintento(f) : null
  const desajuste = encargo ? f.coherencia?.desajuste ?? null : null
  // El modelo a la vista, bajo el tiempo (17 nov 2026): discreto y en la misma columna en todos los renglones.
  const corto = modeloCorto(f)
  const opciones: { etiqueta: string; icono: LucideIcon; hacer: () => void; peligro?: boolean }[] = [
    { etiqueta: encargo ? tr('Abrir su conversación') : tr('Ver lo que hizo'), icono: ArrowUpRight, hacer: () => { setMenu(false); onAbrir(f) } },
    ...(cierre ? [{ etiqueta: tr('Ver resultados'), icono: Images, hacer: verResultados }] : []),
    ...(teEspera || !encargo ? [] : [{ etiqueta: tr('Mandarle un mensaje'), icono: Reply, hacer: () => elegir('responder') }]),
    ...(f.columna === 'falló' && encargo ? [{ etiqueta: tr('Que lo intente otra vez'), icono: RotateCcw, hacer: () => { setMenu(false); void correr('responder', MENSAJE_RETOMAR) } }] : []),
    ...(subir ? [{ etiqueta: tr('Reintentar con más esfuerzo ({nivel})', { nivel: subir }), icono: ChevronsUp, hacer: () => { setMenu(false); void correr('responder', MENSAJE_RETOMAR, subir) } }] : []),
    ...(f.cambios ? [{ etiqueta: tr('Ver cambios'), icono: GitBranch, hacer: () => { setMenu(false); verCambios(f.cambios!.rama) } }] : []),
    // Comentar el entregable (29 oct 2026): el documento que entregó (párrafo por párrafo) o su diff (línea por línea); el
    // lote le llega junto por la misma vía que «Responder».
    ...(encargo && archivoEntregado(f) ? [{ etiqueta: tr('Comentar su entregable'), icono: MessageSquarePlus, hacer: () => { setMenu(false); abrirSeccion({ vista: 'documento', ruta: archivoEntregado(f)!, titulo: tr('Entregable · {nombre}', { nombre: f.nombre }) }) } }] : []),
    ...(f.cambios && encargo ? [{ etiqueta: tr('Comentar sus cambios'), icono: MessageSquarePlus, hacer: () => { setMenu(false); verCambios(f.cambios!.rama) } }] : []),
    { etiqueta: modo === 'detalle' ? tr('Ocultar detalles') : tr('Ver detalles'), icono: ChevronDown, hacer: () => elegir('detalle') },
    ...(f.puedeDetener ? [{ etiqueta: tr('Detener este paso'), icono: Square, hacer: () => elegir('detener'), peligro: true }] : []),
  ]
  const segunda: ReactNode = f.columna === 'listo' && encargo
    ? <span className={t.entrega}><Insignia f={f} />{f.entregables.map(e => <Pieza key={e.valor} e={e} demo={demo} onNota={x => setNota({ texto: x })} />)}{!f.entregables.length && <span className={t.paso}>{f.paso}</span>}</span>
    : <span className={t.paso}>{f.paso}{sinSenal && <span className={t.sinSenal}> · {sinSenal}</span>}</span>
  return <article ref={raiz} className={`${t.renglon}${entrada != null ? ` ${mov.entra}` : ''}`} style={entrada != null ? escalon(entrada) : undefined}
    data-columna={f.columna} data-abierto={modo !== 'nada' || undefined} data-resaltado={resaltado || undefined}
    onPointerEnter={onResaltar && (() => onResaltar(true))} onPointerLeave={onResaltar && (() => onResaltar(false))}>
    <div className={t.fila}>
      <button type="button" className={t.principal} onClick={() => onAbrir(f)} title={`${f.nombre} · ${encargo ? tr('ver su conversación') : tr('ver lo que hizo')}`}>
        <span className={t.marca}><Forma f={f} ahora={ahora} /></span>
        <span className={t.textos}>
          <span className={t.nombreLinea}><span className={t.nombre}>{f.nombre}</span>{desajuste && <span className={t.desajuste} title={tr('Su CLI reporta que corre otra cosa que lo que se pidió')}>{desajuste}</span>}</span>
          {segunda}
        </span>
      </button>
      <span className={t.meta}>
        <span className={t.tiempo} title={tiempo.titulo}>{tiempo.texto}</span>
        {corto && <span className={t.modeloCorto} data-sin-medir={!corto.medido || undefined} title={corto.medido ? modelo(f) : `${modelo(f)} · ${tr('pedido, sin medir')}`}>{corto.texto}</span>}
      </span>
      {teEspera && <button type="button" className={t.responderAmbar} onClick={() => elegir('responder')} title={tr('Contestarle (por la misma vía que Levy)')}>{tr('Responder')}</button>}
      {sinTerminar && f.columna === 'falló' && <button type="button" className={t.accionSuave} onClick={() => elegir('detalle')} aria-expanded={modo === 'detalle'}>{tr('Ver qué pasó')}</button>}
      {sinTerminar && f.columna === 'murió' && <button type="button" className={t.accionSuave} onClick={() => elegir('retomar')} aria-expanded={modo === 'retomar'}>{tr('¿Lo retomo?')}</button>}
      {cierre && f.columna === 'listo' && <button type="button" className={`${t.accionSuave} ${t.accionConIcono}`} onClick={verResultados} title={tr('Lo que entregó: imágenes, videos, documentos y gráficas')}><Images size={13} aria-hidden />{tr('Ver resultados')}</button>}
      {cierre && (recibido
        ? <button type="button" className={t.accionIconoBoton} onClick={() => void correr('recibido', undefined, undefined, false)} disabled={ocupado} aria-label={tr('Devolver {nombre} a su lista', { nombre: f.nombre })} title={tr('Devolverlo a su lista')}><Undo2 size={14} aria-hidden /></button>
        : <button type="button" className={t.accionIconoBoton} data-accion="recibido" onClick={() => void correr('recibido', undefined, undefined, true)} disabled={ocupado} aria-label={tr('Recibido: {nombre}', { nombre: f.nombre })} title={tr('Recibido: sale de «Trabajando para ti» y queda en «Recibidos» (se puede devolver)')}><Check size={15} aria-hidden /></button>)}
      {cierre && <button type="button" className={t.accionIconoBoton} data-accion="cerrar" onClick={() => elegir('cerrar')} aria-expanded={modo === 'cerrar'} aria-label={tr('Cerrar {nombre}', { nombre: f.nombre })} title={tr('Cerrarlo: sale de la lista y libera su lugar. Su conversación y sus archivos quedan en disco.')}><X size={15} aria-hidden /></button>}
      <div className={t.menuCaja}>
        <button type="button" className={t.mas} aria-haspopup="menu" aria-expanded={menu} aria-label={tr('Más acciones para {nombre}', { nombre: f.nombre })} onClick={() => setMenu(x => !x)}><Ellipsis size={15} aria-hidden /></button>
        {menu && <div className={`${t.menu} ${mov.aparece}`} role="menu">
          {opciones.map(o => <button key={o.etiqueta} type="button" role="menuitem" className={t.menuItem} data-peligro={o.peligro || undefined} onClick={o.hacer}><o.icono size={13} aria-hidden />{o.etiqueta}</button>)}
        </div>}
      </div>
    </div>
    {modo === 'detalle' && <dl className={`${t.detalle} ${mov.aparece}`}>
      <div><dt>{f.columna === 'falló' ? tr('Qué pasó') : tr('Estado')}</dt><dd>{!encargo ? f.motivo : f.conLevy && f.columna === 'te-espera' ? tr('Con Levy · {motivo}', { motivo: f.motivo }) : f.columna === 'falló' ? f.motivo : `${tr(COLUMNA[f.columna].titulo)} · ${f.motivo}`}</dd></div>
      <div><dt>{tr('Empezó')}</dt><dd>{hace(f.creado)}{!demo && desde && f.origen ? ` · ${tr('desde «{conversacion}»', { conversacion: desde })}` : ''}</dd></div>
      <div><dt>{tr('Quién')}</dt><dd>{f.tipo === 'preparando' ? tr('Encargo de Levy que todavía prepara su copia') : f.tipo === 'interna' ? tr('Tarea dentro de un turno de Levy') : f.tipo === 'tuya' ? tr('Sesión abierta por ti') : f.tipo === 'proceso' ? tr('Comando en segundo plano') : modelo(f)}</dd></div>
      {desajuste && <div><dt>{tr('Ojo')}</dt><dd className={t.ambar}>{tr('{desajuste}. Lo reportó su CLI: corre con eso, no con lo pedido.', { desajuste })}</dd></div>}
      {f.perfil && <div><dt>{tr('Permisos')}</dt><dd>{tr(PERFIL_EN_PALABRAS[f.perfil])}</dd></div>}
      {f.plan && <div><dt>{tr('Plan')}</dt><dd className={t.cambios}><span>{f.plan.ruta.split('/').pop()}{f.plan.commit ? ` · ${tr('aprobado en {commit}', { commit: f.plan.commit.slice(0, 7) })}` : ''}</span>
        <button type="button" className={t.enlace} onClick={() => abrirSeccion({ vista: 'documento', ruta: f.plan!.ruta, titulo: tr('Plan · {nombre}', { nombre: f.nombre }) })}><NotebookPen size={12} aria-hidden />{tr('Ver lo pedido')}</button></dd></div>}
      {f.cambios && <div><dt>{tr('Cambios')}</dt><dd className={t.cambios}><span>{cambiosEnPalabras(f.cambios)}</span><button type="button" className={t.enlace} onClick={() => verCambios(f.cambios!.rama)}><GitBranch size={12} aria-hidden />{tr('Ver cambios')}</button></dd></div>}
      {latidoEnPalabras(f, ahora) && <div><dt>{tr('Señal')}</dt><dd>{latidoEnPalabras(f, ahora)}</dd></div>}
      {f.juicio && <div><dt>{tr('Revisión')}</dt><dd>{tr(VEREDICTO[f.juicio.veredicto])} · {f.juicio.razon}</dd></div>}
      {f.linea && f.linea !== f.paso && <div><dt>{tr('Dijo')}</dt><dd>{f.linea}</dd></div>}
      {f.cwd && <div><dt>{tr('Carpeta')}</dt><dd>{f.cwd}</dd></div>}
    </dl>}
    {modo === 'responder' && <form className={t.responder} onSubmit={e => { e.preventDefault(); if (texto.trim()) void correr('responder') }}>
      <label htmlFor={`resp-${f.id}`}>{tr('Mensaje para el agente')}</label>
      <textarea id={`resp-${f.id}`} ref={caja} rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder={tr('Ej.: usa la rama B y vuelve a correr las pruebas')}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (texto.trim()) void correr('responder') } if (e.key === 'Escape') { e.preventDefault(); setModo('nada') } }} />
      <div className={t.acciones}>
        <button type="button" className={t.boton} onClick={() => setModo('nada')} disabled={ocupado}>{tr('Cancelar')}</button>
        <button type="submit" className={t.botonFuerte} disabled={ocupado || !texto.trim()}>{ocupado ? tr('Enviando…') : tr('Enviar')}</button>
      </div>
    </form>}
    {modo === 'detalle' && f.columna === 'falló' && encargo && <div className={`${t.acciones} ${t.accionesDetalle}`}>
      <button type="button" className={t.boton} onClick={() => onAbrir(f)}><ArrowUpRight size={12} aria-hidden />{tr('Abrir su conversación')}</button>
      {subir && <button type="button" className={t.boton} onClick={() => void correr('responder', MENSAJE_RETOMAR, subir)} disabled={ocupado} title={tr('Un turno nuevo en su misma sesión, con esfuerzo {nivel}', { nivel: subir })}><ChevronsUp size={12} aria-hidden />{tr('Reintentar con más esfuerzo')}</button>}
      <button type="button" className={t.botonFuerte} onClick={() => void correr('responder', MENSAJE_RETOMAR)} disabled={ocupado}><RotateCcw size={12} aria-hidden />{ocupado ? tr('Enviando…') : tr('Que lo intente otra vez')}</button>
    </div>}
    {modo === 'retomar' && <div className={t.confirma} role="group" aria-label={tr('Confirmar retomar')}>
      <span>{tr('Le pido que retome donde se quedó y termine el encargo.')}</span>
      <div className={t.acciones}>
        <button type="button" className={t.boton} onClick={() => setModo('nada')} disabled={ocupado}>{tr('Ahora no')}</button>
        <button type="button" className={t.botonFuerte} onClick={() => void correr('responder', MENSAJE_RETOMAR)} disabled={ocupado}>{ocupado ? tr('Enviando…') : tr('Sí, retómalo')}</button>
      </div>
    </div>}
    {modo === 'cerrar' && <div className={t.confirma} role="group" aria-label={tr('Confirmar cerrar')}>
      <span>{tr('¿Lo cierro? Sale de la lista y libera su lugar. Su conversación y sus archivos quedan en disco; no se borra nada.')}</span>
      <div className={t.acciones}>
        <button type="button" className={t.boton} onClick={() => setModo('nada')} disabled={ocupado}>{tr('No')}</button>
        <button type="button" className={t.botonFuerte} onClick={() => void correr('cerrar')} disabled={ocupado} autoFocus>{ocupado ? tr('Cerrando…') : tr('Sí, cerrarlo')}</button>
      </div>
    </div>}
    {visor && typeof f.id === 'number' && <VisorResultados pedido={{ agente: demo ? null : f.id, cwd: f.cwd, nombre: f.nombre, respuesta: f.respuesta, fila: f }} onCerrar={() => setVisor(false)}
      recibido={recibido} onRecibido={recibido ? undefined : () => correr('recibido', undefined, undefined, true).then(() => setVisor(false))} />}
    {modo === 'detener' && <div className={t.confirma} role="group" aria-label={tr('Confirmar detener')}>
      <span>{tr('¿Lo detengo? Su sesión sigue y un mensaje lo reanuda.')}</span>
      <div className={t.acciones}>
        <button type="button" className={t.boton} onClick={() => setModo('nada')} disabled={ocupado}>{tr('No')}</button>
        <button type="button" className={t.botonPeligro} onClick={() => void correr('detener')} disabled={ocupado}>{ocupado ? tr('Deteniendo…') : tr('Sí, detener')}</button>
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
  const abrir = (p: PlanPendiente, comparar?: boolean) => abrirSeccion({ vista: 'documento', ruta: p.abs, titulo: tr('Plan · {nombre}', { nombre: p.nombre }), ...(comparar ? { compararCon: 'HEAD' } : {}) })
  const hacer = async (que: 'correr-plan' | 'descartar-plan', p: PlanPendiente) => {
    if (demo) { setNota(n => ({ ...n, [p.ruta]: { texto: tr('Ejemplo: aquí correría el plan.') } })); return }
    setOcupado(p.ruta)
    try {
      const r = await fetch(`/api/cabina/${que}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruta: p.ruta }), signal: AbortSignal.timeout(60_000) })
      const b = await r.json().catch(() => ({})) as { texto?: string; error?: string }
      if (!r.ok) throw new Error(b.error ?? sinRespuestaDelServidor())
      setNota(n => ({ ...n, [p.ruta]: { texto: b.texto ? tr(b.texto) : tr('Hecho.') } })); void releer(urlPanel(false))
    } catch (e) { setNota(n => ({ ...n, [p.ruta]: { texto: e instanceof Error ? e.message : tr('No se pudo.'), error: true } })) } finally { setOcupado(null); setDescartar(null) }
  }
  return <section className={t.grupo} data-grupo="planes" aria-label={tr('Planes por correr')}>
    <h4 className={t.grupoCabeza}>{tr('Planes por correr')}<small>{planes.length}</small></h4>
    <div className={t.planes}>{planes.map(p => <article key={p.ruta} className={t.plan} data-plan>
      <div className={t.planCabeza}>
        <NotebookPen size={14} aria-hidden className={t.planIcono} />
        <div className={t.planTexto}>
          <button type="button" className={t.planNombre} onClick={() => abrir(p)} title={tr('Abrir para leerlo o editarlo')}>{p.nombre}</button>
          <p className={t.planResumen}>{p.resumen}</p>
          <p className={t.planMeta}>{p.harness} · {tr(PERFIL_EN_PALABRAS[p.perfil]).split(':')[0]}{p.propuesto ? ` · ${tr('propuesto {cuando}', { cuando: hace(p.propuesto) })}` : ''}</p>
        </div>
      </div>
      <div className={t.planAcciones}>
        <button type="button" className={t.botonFuerte} disabled={ocupado === p.ruta} onClick={() => void hacer('correr-plan', p)}><Play size={12} aria-hidden />{ocupado === p.ruta ? tr('Lanzando…') : tr('Correr')}</button>
        <button type="button" className={t.boton} onClick={() => abrir(p)}><NotebookPen size={12} aria-hidden />{tr('Leer y editar')}</button>
        <button type="button" className={t.boton} onClick={() => abrir(p, true)} title={tr('Lo que cambiaste contra lo que propuso Levy')}><GitCompare size={12} aria-hidden />{tr('Tus cambios')}</button>
        {descartar === p.ruta
          ? <><button type="button" className={t.botonPeligro} onClick={() => void hacer('descartar-plan', p)}>{tr('Sí, descartar')}</button><button type="button" className={t.boton} onClick={() => setDescartar(null)}>{tr('No')}</button></>
          : <button type="button" className={t.accionSuave} onClick={() => setDescartar(p.ruta)}>{tr('Descartar')}</button>}
      </div>
      {nota[p.ruta] && <p className={t.planNota} data-error={nota[p.ruta].error || undefined} role="status">{nota[p.ruta].texto}</p>}
    </article>)}</div>
  </section>
}
