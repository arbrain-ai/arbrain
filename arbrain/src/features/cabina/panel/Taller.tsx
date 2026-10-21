'use client'
/**
 * El Taller minimalista (5 oct 2026, Daniel: «quiero hacerlo lo más minimalista: quitar cosas que yo como dueño no debería
 * ver… que sea bonito, como el Calendario y la vista Salud»). La sala de máquinas responde en 3 segundos a
 * «¿qué está trabajando para mí y hay algo roto?»:
 *
 *  · Pulso      una frase arriba: cuántos agentes trabajan y, si algo pide atención, qué (falla, huérfanos, pregunta).
 *               Cada parte lleva a su pestaña. Solo late cuando algo trabaja.
 *  · Agentes    solo lo vivo, por conversación, con su nombre humano y su avance. Lo terminado y las terminales crudas,
 *               en pliegues discretos. Fuera el contador del motor.
 *  · Servidores arriba el semáforo de lo que usan tus miembros; abajo solo lo que tiene DUEÑO (agent-server
 *               `cabina/procesos.ts`): huérfanos con «Apagar» (se confirma y el Studio re-verifica), lo que levantó cada
 *               conversación, la Casa en una sola tarjeta y los servicios por área. Lo del sistema operativo no se ve.
 *  · Servicios  con falla arriba y explicada en español llano; corriendo por área con nombre humano; programados plegados.
 *
 * El movimiento es el de la casa (shared/movimiento): entra escalonado una vez, las cifras cuentan una vez, solo late lo vivo,
 * lo que se apaga se pliega.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  AppWindow, ArrowUpRight, AudioLines, Bot, BrainCircuit, Check, ChevronRight, CircleAlert, Database, Hand, HeartPulse,
  House, LayoutGrid, Loader2, Plus, Power, Repeat, ScrollText, Server, Sparkles, SquareTerminal, Waypoints, type LucideIcon,
} from 'lucide-react'
import { Cifra, escalon, mov } from '@/shared/movimiento'
import { releer, useFuente } from '../datos'
import type { CronSnapshot } from '@/features/planning/types'
import { estado as estadoRutina } from '@/features/rutinas/model'
import { urlRutinas } from '../vistas/Rutinas'
import { useAbrirConversacion, useConversacionActiva, useTituloConversacion } from '../conversaciones'
import { agruparInternas, separarProcesos, type GrupoInternas } from '../internas-por-conversacion'
import { agenteTerminado, partirTerminales, resumenTerminal } from '../terminados'
import { esperaALevy, esProceso, lineaLimpia, preguntaAlgo, type TareaInterna } from '../trabajos-modelo'
import { abrirEnNavegador, accionLegible, agrupar, esAgente, hace, nombreTerminal, servicioCorto, urlPanel, type AreaServicio, type Proceso, type Servicio, type Terminal, type Trabajos } from './datos'
import { FilaInterna } from './InternaDetalle'
import { LineaConsumo } from './GastoAgente'
import { IconoTipo, estadoTerminal, tipoTerminal } from './Tipo'
import type { SegmentoTaller } from './taller-segmento'
import { VistaServidores } from '../vistas/Servidores'
import { RecursosTaller } from './RecursosTaller'
import { Reordenables } from './Reordenables'
import { useOrdenTaller } from './orden-taller'
import { arrastrarFila } from './arrastre-lista'
import s from './panel.module.css'
import w from './taller.module.css'
import { capital, NOMBRE_DUENO } from '@/config'

// ── Íconos de las pestañas y de las áreas ──
export const ICONO_SEGMENTO: Record<SegmentoTaller, LucideIcon> = { terminales: Bot, rutinas: Repeat, memoria: BrainCircuit, maquina: Server, registro: ScrollText }
const ICONO_AREA: Record<AreaServicio, LucideIcon> = { Levy: Sparkles, Arbrain: LayoutGrid, Casa: House, Voz: AudioLines, Salud: HeartPulse, 'Túneles': Waypoints, Datos: Database, Manos: Hand, Apps: AppWindow }
const ORDEN_AREAS: AreaServicio[] = ['Levy', 'Arbrain', 'Casa', 'Voz', 'Salud', 'Túneles', 'Datos', 'Manos', 'Apps']
const QUE_AREA: Record<AreaServicio, string> = {
  Levy: 'Su chat, sus crons y su agenda', Arbrain: 'La app, su motor y su mantenimiento', Casa: 'El set físico', Voz: 'Cómo hablan los agentes',
  Salud: 'Lo que llega de tu reloj', 'Túneles': 'Las salidas hacia internet', Datos: 'Bases y respaldos', Manos: 'Cómo Levy usa tu computadora', Apps: 'Apps independientes',
}

// ── Cuentas del Taller (una sola regla para el pulso y las pestañas) ──
export interface CuentasTaller { trabajando: number; procesos: number; preguntan: number; huerfanos: number; fallas: number; fallasMenores: number; servicios: number; rutinasFallidas: number }
export function cuentasTaller(d: Trabajos | undefined, rutinas?: CronSnapshot): CuentasTaller | null {
  if (!d) return null
  const vivos = d.terminales.filter(t => !agenteTerminado(t))
  // `trabajando` cuenta solo agentes (sesiones y subagentes); los comandos en segundo plano van aparte (14 oct 2026).
  const internasVivas = d.internas?.filter(x => x.estado === 'trabajando') ?? []
  const procesos = internasVivas.filter(esProceso).length
  const trabajando = vivos.filter(t => esAgente(t) && t.estado === 'trabajando').length + internasVivas.length - procesos
  const preguntan = vivos.filter(t => preguntaAlgo(t) && !esperaALevy(t)).length
  const procs = d.procesos ?? []
  const fallas = d.servicios.filter(x => x.estado === 'falló')
  return {
    trabajando, procesos, preguntan, huerfanos: procs.filter(p => p.clase === 'huerfano').length,
    fallas: fallas.filter(x => !x.menor).length, fallasMenores: fallas.filter(x => x.menor).length,
    servicios: d.servicios.filter(x => x.estado === 'corriendo').length,
    rutinasFallidas: rutinasFallidas(rutinas),
  }
}

// ── Pulso: la respuesta de 3 segundos ──
/** Rutinas cuya última corrida falló (las pausadas no cuentan): la misma regla que la vista Rutinas. */
export function rutinasFallidas(d: CronSnapshot | undefined) {
  return (d?.jobs ?? []).filter(j => estadoRutina(j, d?.runs ?? []).tono === 'error').length
}

export function PulsoTaller({ data, onIr }: { data: Trabajos | undefined; onIr: (v: SegmentoTaller) => void }) {
  const rutinas = useFuente<CronSnapshot>(urlRutinas()).data
  const n = cuentasTaller(data, rutinas)
  if (!n) return <div className={w.pulso} data-tono="cargando" aria-busy="true"><span className={w.pulsoLuz} /><div><p className={w.pulsoTitular}>Mirando el Studio…</p></div></div>
  const alertas: { texto: string; ir: SegmentoTaller; tono: 'falla' | 'atencion' | 'oro' }[] = []
  if (n.fallas) alertas.push({ texto: `${n.fallas} ${n.fallas === 1 ? 'servicio con falla' : 'servicios con falla'}`, ir: 'maquina', tono: 'falla' })
  if (n.rutinasFallidas) alertas.push({ texto: `${n.rutinasFallidas} ${n.rutinasFallidas === 1 ? 'rutina falló' : 'rutinas fallaron'}`, ir: 'rutinas', tono: 'falla' })
  if (n.preguntan) alertas.push({ texto: `${n.preguntan} ${n.preguntan === 1 ? 'agente te pregunta' : 'agentes te preguntan'}`, ir: 'terminales', tono: 'oro' })
  if (n.huerfanos) alertas.push({ texto: `${n.huerfanos} ${n.huerfanos === 1 ? 'huérfano encendido' : 'huérfanos encendidos'}`, ir: 'maquina', tono: 'atencion' })
  if (n.fallasMenores) alertas.push({ texto: `${n.fallasMenores} ${n.fallasMenores === 1 ? 'aviso menor' : 'avisos menores'}`, ir: 'maquina', tono: 'atencion' })
  const tono = n.fallas || n.rutinasFallidas ? 'falla' : alertas.length ? 'atencion' : 'ok'
  return <div className={`${w.pulso} ${mov.entra}`} style={escalon(0)} data-tono={tono} role="status">
    <span className={`${w.pulsoLuz}${n.trabajando + n.procesos ? ` ${mov.late}` : ''}`} data-vivo={n.trabajando + n.procesos > 0 || undefined} aria-hidden />
    <div className={w.pulsoTexto}>
      <p className={w.pulsoTitular}>
        {n.trabajando
          ? <button type="button" className={w.pulsoIr} onClick={() => onIr('terminales')} title="Ver quién trabaja · Taller › Agentes"><Cifra valor={n.trabajando} clave="taller-trabajando" formato={x => String(Math.round(x))} /> {n.trabajando === 1 ? 'agente trabajando' : 'agentes trabajando'} para ti{n.procesos > 0 && <> · {cuantosProcesos(n.procesos)}</>}</button>
          : n.procesos ? `${cuantosProcesos(n.procesos)} en segundo plano` : 'Nadie trabaja ahora'}
      </p>
      <p className={w.pulsoLinea}>
        {alertas.length
          ? alertas.map((a, i) => <button key={a.texto} className={w.alerta} data-tono={a.tono} onClick={() => onIr(a.ir)} style={escalon(i + 1)}><i aria-hidden />{a.texto}</button>)
          : <span className={w.enOrden}><Check size={13} aria-hidden />Todo en orden · {n.servicios} servicios corriendo</span>}
      </p>
    </div>
  </div>
}

const cuantosProcesos = (n: number) => `${n} ${n === 1 ? 'proceso' : 'procesos'}`
const cuantosAgentes = (n: number) => `${n} ${n === 1 ? 'agente' : 'agentes'}`

// ── Pestañas con ícono ──
export function SegmentosTaller({ vista, elegir, data, segmentos: base }: { vista: SegmentoTaller; elegir: (v: SegmentoTaller) => void; data: Trabajos | undefined; segmentos: { id: SegmentoTaller; etiqueta: string; pregunta: string }[] }) {
  const n = cuentasTaller(data, useFuente<CronSnapshot>(urlRutinas()).data)
  // Las pestañas también se acomodan (15 oct 2026): arrastrar una pestaña o Alt + ←/→ con el foco en ella.
  const { orden, mover } = useOrdenTaller('pestanas', base.map(t => t.id))
  const segmentos = orden.map(id => base.find(t => t.id === id)!).filter(Boolean)
  const fila = useRef<HTMLDivElement>(null)
  // Solo cuenta lo que trabaja: cuántos puertos o servicios hay no le dice nada al dueño (los puntos sí: algo pide atención).
  const cuenta = (id: SegmentoTaller) => !n ? null : id === 'terminales' ? n.trabajando || null : null
  const alerta = (id: SegmentoTaller) => !n ? undefined : id === 'maquina' && n.fallas ? 'falla' : id === 'rutinas' && n.rutinasFallidas ? 'falla' : id === 'maquina' && (n.huerfanos || n.fallasMenores) ? 'atencion' : id === 'terminales' && n.preguntan ? 'oro' : undefined
  const enfocarSel = (e: React.KeyboardEvent) => requestAnimationFrame(() => (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
  // ← → (y Inicio/Fin) con el foco en las pestañas: el patrón de una lista de pestañas, en la hoja de atajos. Con Alt, la mueve.
  const teclas = (e: React.KeyboardEvent) => {
    const i = segmentos.findIndex(t => t.id === vista), k = segmentos.length
    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const a = i + (e.key === 'ArrowRight' ? 1 : -1)
      e.preventDefault()
      if (i >= 0 && a >= 0 && a < k) { mover(vista, a); enfocarSel(e) }
      return
    }
    const a = e.key === 'ArrowRight' ? (i + 1) % k : e.key === 'ArrowLeft' ? (i - 1 + k) % k : e.key === 'Home' ? 0 : e.key === 'End' ? k - 1 : null
    if (a == null) return
    e.preventDefault(); elegir(segmentos[a].id)
    enfocarSel(e)
  }
  return <div ref={fila} className={w.segmentos} role="tablist" aria-label="Taller" onKeyDown={teclas}>
    {segmentos.map((t, i) => {
      const Icono = ICONO_SEGMENTO[t.id], k = cuenta(t.id), a = alerta(t.id)
      return <button key={t.id} role="tab" aria-selected={vista === t.id} tabIndex={vista === t.id ? 0 : -1} className={w.segmento} onClick={() => elegir(t.id)} title={`${t.etiqueta} · ${t.pregunta} (arrástrala para moverla)`}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        onPointerDown={e => { if (fila.current && e.pointerType !== 'touch') arrastrarFila(e, { lista: fila.current, selector: ':scope > [role="tab"]', desde: i, eje: 'x', alSoltar: d => mover(t.id, d) }) }}>
        <span className={w.segIcono}><Icono size={15} aria-hidden />{a && <i className={w.segAlerta} data-tono={a} aria-label="pide atención" />}</span>
        <span className={w.segEtiqueta}>{t.etiqueta}</span>
        {k != null && <small className={w.segCuenta}>{k}</small>}
      </button>
    })}
  </div>
}

// ── Agentes: solo lo vivo, por conversación ──
const ESTADO = { trabajando: 'Trabajando', esperando: 'Terminó', terminal: 'Lista' } as const
const harness = (t: Terminal) => { const h = (t.subagente?.harness ?? t.proc).toLowerCase(); return h === 'claude' ? 'Claude' : h === 'codex' ? 'Codex' : h }

export function AgentesTaller({ data, onAbrir, onAbrirInterna }: { data: Trabajos; onAbrir: (id: number) => void; onAbrirInterna: (id: string) => void }) {
  const activaId = useConversacionActiva()
  const { vivos, terminados } = partirTerminales(data.terminales)
  const { tuyas } = agrupar(vivos)
  const sesiones = tuyas.filter(esAgente), shells = tuyas.filter(t => !esAgente(t))
  const { grupos } = agruparInternas(data.internas ?? [], { activaId, agentes: data.terminales.filter(t => t.subagente) })
  // Lo vivo arriba, por conversación; lo terminado de todas, en un solo pliegue abajo.
  const vivosPorConversacion = grupos.filter(g => g.corriendo.length + g.agentes.length > 0)
  const agentesTerminados = grupos.flatMap(g => g.agentesTerminados)
  const internasTerminadas = grupos.flatMap(g => g.terminadas)
  const tusTerminados = terminados.filter(t => !t.subagente)
  const nTerminados = agentesTerminados.length + internasTerminadas.length + tusTerminados.length
  let i = 1
  return <div className={w.vista}>
    <div className={w.cabecera}>
      <h3 className={w.ceja}>Trabajando para ti</h3>
      <NuevoAgente />
    </div>
    {!vivosPorConversacion.length && !sesiones.length && <div className={`${w.calma} ${mov.entra}`} style={escalon(1)}>
      <Bot size={22} aria-hidden />
      <p><b>Nadie trabaja ahora.</b> Cuando Levy lance un agente, lo verás aquí con su conversación y su avance.</p>
    </div>}
    {vivosPorConversacion.map(g => <ConversacionViva key={g.conversacion || 'sin'} g={g} i={i++} onAbrir={onAbrir} onAbrirInterna={onAbrirInterna} />)}
    {sesiones.length > 0 && <section className={`${w.tarjeta} ${mov.entra}`} style={escalon(i++)} aria-label="Abiertas por ti">
      <div className={w.tarjetaCabeza}><span className={w.tarjetaTitulo}>Abiertas por ti</span><span className={w.tarjetaCuenta}>{sesiones.length}</span></div>
      <div className={s.lista}>{sesiones.map(t => <FilaTerminal key={t.id} t={t} onAbrir={onAbrir} />)}</div>
    </section>}
    {nTerminados > 0 && <details className={w.pliegue}>
      <summary><ChevronRight size={12} aria-hidden />Terminados hoy<small>{nTerminados}</small></summary>
      <div className={s.lista}>
        {agentesTerminados.map(t => <FilaTerminal key={`a${t.id}`} t={t} onAbrir={onAbrir} resumen={resumenTerminal(t)} />)}
        {tusTerminados.map(t => <FilaTerminal key={t.id} t={t} onAbrir={onAbrir} resumen={resumenTerminal(t)} />)}
        {internasTerminadas.map(t => <FilaInterna key={t.id} t={t} onAbrir={onAbrirInterna} />)}
      </div>
    </details>}
    {shells.length > 0 && <details className={w.pliegue}>
      <summary><ChevronRight size={12} aria-hidden /><SquareTerminal size={12} aria-hidden />Terminales<small>{shells.length}</small></summary>
      <div className={s.lista}>{shells.map(t => <FilaTerminal key={t.id} t={t} onAbrir={onAbrir} />)}</div>
    </details>}
  </div>
}

function ConversacionViva({ g, i, onAbrir, onAbrirInterna }: { g: GrupoInternas; i: number; onAbrir: (id: number) => void; onAbrirInterna: (id: string) => void }) {
  const tituloVivo = useTituloConversacion(g.conversacion)
  const titulo = g.conversacion ? tituloVivo : 'Sin conversación'
  const abrir = useAbrirConversacion()
  const { agentes, procesosDe, sueltos, procesos } = separarProcesos(g.corriendo)
  const nAgentes = agentes.length + g.agentes.length
  const cuenta = [nAgentes ? cuantosAgentes(nAgentes) : null, procesos ? cuantosProcesos(procesos) : null].filter(Boolean).join(' · ')
  return <section className={`${w.tarjeta} ${mov.entra}`} style={escalon(i)} data-activa={g.activa || undefined} aria-label={titulo}>
    <div className={w.tarjetaCabeza}>
      {g.conversacion && !g.activa
        ? <button className={w.tarjetaTituloBoton} onClick={() => abrir(g.conversacion)} title={`Abrir «${titulo}» en el chat`}>{titulo}</button>
        : <span className={w.tarjetaTitulo} title={titulo}>{titulo}</span>}
      <span className={w.tarjetaCuenta}>{cuenta}</span>
    </div>
    <div className={s.lista}>
      {g.agentes.map(t => <FilaTerminal key={`a${t.id}`} t={t} onAbrir={onAbrir} />)}
      {agentes.map(t => <Fragment key={t.id}>
        <FilaInterna t={t} onAbrir={onAbrirInterna} />
        <ProcesosDe lista={procesosDe.get(t.id)} onAbrir={onAbrirInterna} />
      </Fragment>)}
      <ProcesosDe lista={sueltos} onAbrir={onAbrirInterna} deLevy={agentes.length + g.agentes.length > 0} />
    </div>
  </section>
}

/** Los comandos en segundo plano de un agente, plegados bajo él: se ven como procesos, no como otros agentes.
 *  `deLevy`: los que no cuelgan de un agente visible (los lanzó Levy en el chat, o su agente ya no se ve). */
function ProcesosDe({ lista, onAbrir, deLevy }: { lista: TareaInterna[] | undefined; onAbrir: (id: string) => void; deLevy?: boolean }) {
  if (!lista?.length) return null
  return <details className={`${w.pliegue} ${w.procesos}`}>
    <summary><ChevronRight size={12} aria-hidden />{cuantosProcesos(lista.length)} en segundo plano{deLevy && <small>de Levy</small>}</summary>
    <div className={s.lista}>{lista.map(t => <FilaInterna key={t.id} t={t} onAbrir={onAbrir} />)}</div>
  </details>
}

function FilaTerminal({ t, onAbrir, resumen }: { t: Terminal; onAbrir: (id: number) => void; resumen?: string }) {
  const linea = resumen ?? (t.estado === 'trabajando' ? (lineaLimpia(t.actividad) ?? lineaLimpia(accionLegible(t.ultimaAccion))) : lineaLimpia(accionLegible(t.ultimaAccion)) ?? (t.estado === 'terminal' ? t.ultimas.at(-1) ?? null : null))
  return (
    <button className={s.fila} data-estado={t.estado} onClick={() => onAbrir(t.id)} title="Ver su terminal">
      <span className={s.marca}><IconoTipo tipo={tipoTerminal(t)} estado={estadoTerminal(t)} /></span>
      <span className={s.filaTexto}>
        <span className={s.filaNombre}>{nombreTerminal(t)}</span>
        <span className={s.filaMeta}>{t.subagente ? `Empezó ${hace(t.subagente.creado)}` : harness(t)} · {t.cwd.split('/').filter(Boolean).at(-1) ?? t.cwd}</span>
        {esAgente(t) && <LineaConsumo t={t} />}
        {linea && <span className={s.filaMono}>{linea}</span>}
      </span>
      <span className={s.filaEstado} data-tono={esperaALevy(t) ? undefined : preguntaAlgo(t) ? 'oro' : t.estado === 'esperando' ? 'tenue' : undefined}>{esperaALevy(t) ? 'Con Levy' : preguntaAlgo(t) ? 'Espera' : ESTADO[t.estado]}</span>
      <ChevronRight size={14} className={s.flecha} aria-hidden />
    </button>
  )
}

/** «Nuevo agente»: Daniel describe la tarea y Levy la recibe en el chat; el botón no lanza nada por su cuenta. */
function NuevoAgente() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviado, setEnviado] = useState(false)
  const caja = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (abierto) caja.current?.focus() }, [abierto])
  const pasar = () => {
    const tarea = texto.trim(); if (!tarea) return
    const mensaje = `${capital(NOMBRE_DUENO())} quiere un agente para: ${tarea}`
    if (window.location.pathname.startsWith('/chat')) window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto: mensaje } }))
    else { try { sessionStorage.setItem('cabina:pendiente', mensaje) } catch { /* sin almacenamiento */ } router.push('/chat') }
    setTexto(''); setAbierto(false); setEnviado(true)
    setTimeout(() => setEnviado(false), 6000)
  }
  if (!abierto) return enviado
    ? <span className={`${w.nuevoListo} ${mov.aparece}`}><Check size={12} aria-hidden />Levy lo recibió en el chat</span>
    : <button className={w.nuevo} onClick={() => { setAbierto(true); setEnviado(false) }}><Plus size={13} aria-hidden />Nuevo agente</button>
  return <form className={`${s.nuevoCaja} ${w.nuevoCaja} ${mov.aparece}`} onSubmit={e => { e.preventDefault(); pasar() }}>
    <label htmlFor="nuevo-agente">¿Qué quieres que haga?</label>
    <textarea id="nuevo-agente" ref={caja} value={texto} onChange={e => setTexto(e.target.value)} rows={3}
      placeholder="Ej.: revisa los comentarios de YouTube de esta semana y dime cuáles contestar"
      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); pasar() } if (e.key === 'Escape') { e.preventDefault(); setAbierto(false) } }} />
    <p>Se lo pasas a Levy en el chat. Él arma el encargo y lanza el agente.</p>
    <div className={s.nuevoAcciones}>
      <button type="button" className={s.nuevoCancelar} onClick={() => setAbierto(false)}>Cancelar</button>
      <button type="submit" className={s.nuevoEnviar} disabled={!texto.trim()}>Pasárselo a Levy</button>
    </div>
  </form>
}

// ── Servidores: el semáforo de los miembros y, debajo, solo lo que tiene dueño ──
const nombreServicio = (x: Servicio) => x.nombre ?? servicioCorto(x.label)
const areaServicio = (x: Servicio): AreaServicio => x.area ?? 'Arbrain'

/**
 * Máquina · ¿está todo prendido? (5 oct 2026, fusión de Servidores y de lo «corriendo / con falla» de Servicios).
 * Arriba el semáforo de los miembros; luego lo roto (servicios con falla, explicados) y los huérfanos; después lo que
 * levantó cada conversación, la Casa y el sistema por área. Un servicio que ya se ve como proceso con puerto no se
 * repite; los que corren sin puerto (Vigía de OBS, Despliegue automático…) se suman a su área como una línea.
 */
export function MaquinaTaller({ data, onRegistro }: { data: Trabajos | undefined; onRegistro: () => void }) {
  const procs = data?.procesos
  const [apagados, setApagados] = useState<Set<string>>(() => new Set())
  const visibles = useMemo(() => (procs ?? []).filter(p => p.clase !== 'oculto' && !apagados.has(p.firma)), [procs, apagados])
  const huerfanos = visibles.filter(p => p.clase === 'huerfano')
  const deConversaciones = visibles.filter(p => p.clase === 'conversacion')
  const casa = visibles.filter(p => p.clase === 'casa'), sistema = visibles.filter(p => p.clase === 'sistema')
  const porDueno = useMemo(() => {
    const m = new Map<string, Proceso[]>()
    for (const p of deConversaciones) { const k = p.dueno?.conversacion ?? p.dueno?.sesion ?? p.dueno?.nombre ?? '?'; m.set(k, [...(m.get(k) ?? []), p]) }
    return [...m.values()]
  }, [deConversaciones])
  const servicios = data?.servicios ?? []
  const fallaron = servicios.filter(x => x.estado === 'falló').sort((p, q) => Number(!!p.menor) - Number(!!q.menor))
  const conPuerto = new Set((procs ?? []).map(p => p.pid))
  const sinPuerto = servicios.filter(x => x.estado === 'corriendo' && x.pid != null && !conPuerto.has(x.pid))
  const casaSinPuerto = sinPuerto.filter(x => areaServicio(x) === 'Casa')
  const porArea = ORDEN_AREAS.filter(a => a !== 'Casa').map(a => ({ area: a, lista: sistema.filter(p => (p.area ?? 'Arbrain') === a), solos: sinPuerto.filter(x => areaServicio(x) === a) })).filter(x => x.lista.length || x.solos.length)
  const nSistema = porArea.reduce((n, x) => n + x.lista.length + x.solos.length, 0)
  const marcar = (firma: string) => setApagados(prev => new Set(prev).add(firma))
  let i = 2
  // Las secciones se acomodan a gusto del dueño (15 oct 2026): «El taller hoy» arriba por defecto; cada una con su manija.
  const cargando = <div className={s.cargando} aria-busy><span className={s.brillo} /><span className={s.brillo} /></div>
  return <div className={w.vista}>
    <Reordenables lista="maquina" items={[
      { id: 'taller', nombre: 'El taller hoy', nodo: <RecursosTaller /> },
      { id: 'miembros', nombre: 'Lo que usan tus miembros', nodo: <div className={w.semaforo}><VistaServidores grande soloMiembros /></div> },
      { id: 'encendido', nombre: 'Encendido en el Studio', nodo: !data ? cargando : <>
        <h3 className={w.titular}>Encendido en el Studio</h3>
        {fallaron.map(x => <FallaServicio key={x.label} x={x} i={i++} />)}
        {!procs && <p className={w.nota}>El Studio todavía no sabe de quién es cada puerto (su servidor es de antes del 5 oct). Se verá al desplegarse.</p>}
        {huerfanos.length > 0 && <Huerfanos lista={huerfanos} onApagado={marcar} i={i++} />}
        {porDueno.map(l => <TarjetaDueno key={l[0].firma} lista={l} i={i++} />)}
        {!fallaron.length && !huerfanos.length && !porDueno.length && <p className={w.nota}>Ninguna conversación tiene nada encendido ahora.</p>}
      </> },
      { id: 'casa', nombre: 'La Casa', nodo: data && (casa.length > 0 || casaSinPuerto.length > 0) ? <section className={`${w.tarjeta} ${mov.entra}`} style={escalon(i++)} aria-label="La Casa">
        <div className={w.tarjetaCabeza}><span className={w.areaIcono} data-area="Casa"><House size={14} aria-hidden /></span><span className={w.tarjetaTitulo}>La Casa</span><span className={w.tarjetaCuenta}>{casa.length + casaSinPuerto.length} encendidos</span></div>
        <div className={w.chips}>
          {casa.map(p => <Chip key={p.firma} p={p} />)}
          {casaSinPuerto.map(x => <span key={x.label} className={w.chip} title={x.label}><i className={w.chipLuz} aria-hidden /><span>{nombreServicio(x)}</span></span>)}
        </div>
      </section> : null },
      { id: 'sistema', nombre: 'Del sistema', nodo: data && porArea.length > 0 ? <section className={`${w.tarjeta} ${mov.entra}`} style={escalon(i++)} aria-label="Servicios del sistema">
        <div className={w.tarjetaCabeza}><span className={w.tarjetaTitulo}>Del sistema</span><span className={w.tarjetaCuenta}>{nSistema} corriendo</span></div>
        <div className={w.areas}>{porArea.map(({ area, lista, solos }) => {
          const Icono = ICONO_AREA[area]
          return <div key={area} className={w.area}>
            <p className={w.areaNombre}><span className={w.areaIcono} data-area={area}><Icono size={13} aria-hidden /></span>{area}</p>
            {lista.map(p => <FilaProceso key={p.firma} p={p} />)}
            {solos.length > 0 && <ul className={w.solos}>{solos.map(x => <li key={x.label} title={`${x.label} · pid ${x.pid}`}><i aria-hidden />{nombreServicio(x)}</li>)}</ul>}
          </div>
        })}</div>
      </section> : null },
    ]} />
    {data && <p className={w.nota}>Solo se muestra lo que tiene dueño: una conversación, un agente, la Casa o un servicio. Lo del sistema operativo queda fuera. Acomoda las secciones con su manija (a la izquierda, al pasar el cursor). <button className={w.enlace} onClick={onRegistro}>Registro de turnos y errores</button></p>}
  </div>
}

function FallaServicio({ x, i }: { x: Servicio; i: number }) {
  return <section className={`${w.tarjeta} ${w.falla} ${mov.entra}`} style={escalon(i)} data-menor={x.menor || undefined} aria-label={`${nombreServicio(x)} con falla`}>
    <div className={w.tarjetaCabeza}>
      <span className={w.areaIcono} data-tono={x.menor ? 'atencion' : 'falla'}><CircleAlert size={14} aria-hidden /></span>
      <span className={w.tarjetaTitulo}>{nombreServicio(x)}</span>
      <span className={w.fallaEtiqueta}>{x.menor ? 'Aviso menor' : 'Con falla'} · {areaServicio(x)}</span>
    </div>
    <p className={w.explicacion}>{x.explicacion ?? (x.codigo != null ? `Terminó con el código ${x.codigo}.` : 'Se detuvo.')}</p>
    <details className={w.tecnico}>
      <summary><ChevronRight size={11} aria-hidden />Detalle técnico</summary>
      <dl><div><dt>servicio</dt><dd>{x.label}</dd></div><div><dt>salida</dt><dd>{x.codigo ?? '—'}</dd></div>{x.detalle && <div><dt>último log</dt><dd>{x.detalle}</dd></div>}</dl>
    </details>
  </section>
}

const puertos = (p: Proceso) => p.puertos.map(x => `:${x}`).join(' ')
const abrir = (p: Proceso) => void abrirEnNavegador(`http://127.0.0.1:${p.puertos[0]}`)

function FilaProceso({ p, lado }: { p: Proceso; lado?: ReactNode }) {
  const cuerpo = <>
    <span className={w.procTexto}>
      <span className={w.procNombre}>{p.nombre}{p.publicado && <i className={w.publico} title="Lo publica Tailscale hacia afuera">público</i>}</span>
      {p.que && <span className={w.procQue}>{p.que}</span>}
    </span>
    <code className={w.puerto}>{puertos(p)}</code>
    {p.web ? <ArrowUpRight size={14} className={w.procFlecha} aria-hidden /> : <span className={w.procFlechaVacia} />}
  </>
  if (lado) return <div className={w.proc} data-estatico>
    {p.web ? <button className={w.procAbrir} onClick={() => abrir(p)} title={`Verlo antes: abrir http://127.0.0.1:${p.puertos[0]}`}>
      <span className={w.procTexto}><span className={w.procNombre}>{p.nombre}</span>{p.que && <span className={w.procQue}>{p.que}</span>}</span>
      <code className={w.puerto}>{puertos(p)}</code>
    </button> : <><span className={w.procTexto}><span className={w.procNombre}>{p.nombre}</span>{p.que && <span className={w.procQue}>{p.que}</span>}</span><code className={w.puerto}>{puertos(p)}</code></>}
    {lado}
  </div>
  return p.web
    ? <button className={w.proc} onClick={() => abrir(p)} title={`Abrir http://127.0.0.1:${p.puertos[0]} en el navegador`}>{cuerpo}</button>
    : <div className={w.proc} data-estatico>{cuerpo}</div>
}

function Chip({ p }: { p: Proceso }) {
  const contenido = <><i className={w.chipLuz} aria-hidden /><span>{p.nombre}</span><code>{puertos(p)}</code></>
  return p.web
    ? <button className={w.chip} onClick={() => abrir(p)} title={`${p.que ?? p.nombre} · abrir en el navegador`}>{contenido}</button>
    : <span className={w.chip} title={p.que}>{contenido}</span>
}

function TarjetaDueno({ lista, i }: { lista: Proceso[]; i: number }) {
  const d = lista[0].dueno!
  // Una conversación de Levy se nombra con su título vivo; una sesión de Claude Code, con el título que leyó el Studio.
  const titulo = useTituloConversacion(d.conversacion ?? (d.tipo === 'levy' ? d.sesion ?? '' : ''))
  const nombre = d.conversacion || (d.tipo === 'levy' && d.sesion) ? titulo : d.nombre
  const abrirConv = useAbrirConversacion()
  const tipo = d.tipo === 'agente' ? 'Agente' : d.tipo === 'levy' ? 'Levy' : d.tipo === 'worktree' ? 'Worktree' : d.tipo === 'terminal' ? 'Terminal' : 'Sesión'
  return <section className={`${w.tarjeta} ${mov.entra}`} style={escalon(i)} aria-label={nombre}>
    <div className={w.tarjetaCabeza}>
      <span className={w.duenoVivo} aria-hidden />
      {d.conversacion
        ? <button className={w.tarjetaTituloBoton} onClick={() => abrirConv(d.conversacion!)} title={`Abrir «${nombre}» en el chat`}>{nombre}</button>
        : <span className={w.tarjetaTitulo} title={nombre}>{nombre}</span>}
      <span className={w.duenoTipo}>{tipo}{d.tipo === 'agente' && d.conversacion && d.nombre !== nombre ? ` · ${d.nombre}` : ''}</span>
    </div>
    <div className={s.lista}>{lista.map(p => <FilaProceso key={p.firma} p={p} />)}</div>
  </section>
}

type Fase = { tipo: 'preguntando' } | { tipo: 'apagando' } | { tipo: 'apagado' } | { tipo: 'error'; texto: string }

async function apagarProceso(firma: string): Promise<string | null> {
  try {
    const r = await fetch('/api/cabina/apagar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firma }), cache: 'no-store' })
    if (r.ok) return null
    return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `El Studio respondió ${r.status}.`
  } catch (e) { return e instanceof Error ? e.message : 'No se pudo llegar al Studio.' }
}

/** Huérfanos iguales (mismo programa, mismo dueño) van en una sola fila: cinco «Chrome invisible» de una misma prueba son uno. */
function juntar(lista: Proceso[]): Proceso[][] {
  const m = new Map<string, Proceso[]>()
  for (const p of lista) { const k = `${p.nombre}|${p.que ?? ''}|${p.dueno?.tipo}:${p.dueno?.nombre}`; m.set(k, [...(m.get(k) ?? []), p]) }
  return [...m.values()]
}

function Huerfanos({ lista, onApagado, i }: { lista: Proceso[]; onApagado: (firma: string) => void; i: number }) {
  const [todos, setTodos] = useState<'no' | 'preguntando' | 'apagando'>('no')
  const [fallos, setFallos] = useState<string[]>([])
  const [fases, setFases] = useState<Record<string, Fase>>({})
  const grupos = juntar(lista)
  const fijar = (k: string, f: Fase | null) => setFases(prev => { const n = { ...prev }; if (f) n[k] = f; else delete n[k]; return n })
  /** Apaga un grupo proceso por proceso; el Studio re-verifica cada uno. Devuelve cuántos no se pudieron. */
  const apagarGrupo = async (g: Proceso[]) => {
    const k = g[0].firma
    fijar(k, { tipo: 'apagando' })
    const errores: string[] = []
    for (const p of g) { const e = await apagarProceso(p.firma); if (e) errores.push(e); else onApagadoLuego(p.firma) }
    if (errores.length) { fijar(k, { tipo: 'error', texto: errores[0] }); return false }
    fijar(k, { tipo: 'apagado' })
    return true
  }
  // Se pliega (380 ms) y después sale del árbol; la relectura confirma que ya no escucha.
  const onApagadoLuego = (firma: string) => setTimeout(() => { onApagado(firma); void releer(urlPanel(false)) }, 420)
  const apagarTodos = async () => {
    setTodos('apagando'); setFallos([])
    const malos: string[] = []
    for (const g of grupos) if (!(await apagarGrupo(g))) malos.push(g[0].nombre)
    setFallos(malos); setTodos('no')
  }
  return <section className={`${w.tarjeta} ${w.huerfanos} ${mov.entra}`} style={escalon(i)} aria-label="Huérfanos">
    <div className={w.tarjetaCabeza}>
      <span className={w.areaIcono} data-tono="atencion"><Power size={13} aria-hidden /></span>
      <span className={w.tarjetaTitulo}>Huérfanos</span>
      <span className={w.tarjetaCuenta}>{lista.length} sin dueño</span>
      {lista.length > 1 && todos === 'no' && <button className={w.apagarTodos} onClick={() => setTodos('preguntando')}>Apagar los {lista.length}</button>}
    </div>
    <p className={w.huerfanosNota}>Quien los encendió ya cerró. Apagarlos no afecta a nada vivo: el Studio vuelve a comprobarlo antes de cada uno.</p>
    {todos !== 'no' && <div className={`${w.confirmar} ${mov.aparece}`} role="alertdialog" aria-label="Confirmar apagar todos">
      <span>{todos === 'apagando' ? 'Apagando uno por uno…' : `¿Apagar los ${lista.length} huérfanos?`}</span>
      {todos === 'preguntando' && <><button className={w.confirmarSi} onClick={() => void apagarTodos()}>Sí, apagarlos</button><button className={w.confirmarNo} onClick={() => setTodos('no')}>Cancelar</button></>}
      {todos === 'apagando' && <Loader2 size={14} className={w.gira} aria-hidden />}
    </div>}
    {fallos.length > 0 && <p className={w.error}>No se apagaron: {fallos.join(', ')}. Mira la razón en cada uno.</p>}
    <div className={s.lista}>{grupos.map(g => {
      const p = g[0], f = fases[p.firma], varios = g.length > 1
      const fila: Proceso = varios ? { ...p, nombre: `${p.nombre} ×${g.length}`, puertos: g.flatMap(x => x.puertos) } : p
      return <div key={p.firma} className={mov.pliega} data-plegada={f?.tipo === 'apagado' || undefined}>
        <div className={w.huerfano}>
          <FilaProceso p={fila} lado={
            f?.tipo === 'preguntando' ? <span className={w.confirmarFila}>
              <button className={w.confirmarSi} onClick={() => void apagarGrupo(g)} autoFocus>{varios ? `Apagar ${g.length}` : 'Apagar'}</button>
              <button className={w.confirmarNo} onClick={() => fijar(p.firma, null)}>Cancelar</button>
            </span>
            : f?.tipo === 'apagando' || todos === 'apagando' ? <span className={w.apagando}><Loader2 size={13} className={w.gira} aria-hidden />Apagando</span>
            : <button className={w.apagar} onClick={() => fijar(p.firma, { tipo: 'preguntando' })} disabled={todos !== 'no'} title={`Apagar ${fila.nombre} (${puertos(fila)})`}><Power size={12} aria-hidden />Apagar</button>
          } />
          <p className={w.razon}>{p.razon}</p>
          {f?.tipo === 'error' && <p className={w.error}>{f.texto}</p>}
        </div>
      </div>
    })}</div>
  </section>
}

// ── Rutinas del Studio: lo de launchd que espera su hora (los «programados» de Servicios, 5 oct 2026) ──
export function ProgramadosStudio({ lista }: { lista: Servicio[] }) {
  const programados = lista.filter(x => x.estado === 'programado')
  if (!programados.length) return null
  const porArea = ORDEN_AREAS.map(a => ({ area: a, lista: programados.filter(x => areaServicio(x) === a).sort((p, q) => nombreServicio(p).localeCompare(nombreServicio(q), 'es')) })).filter(x => x.lista.length)
  return <details className={w.pliegue}>
    <summary><ChevronRight size={12} aria-hidden />Tareas programadas del Studio<small>{programados.length}</small><span className={w.pliegueNota}>esperan su hora, no están caídas</span></summary>
    <div className={w.rejillaAreas}>{porArea.map(({ area: a, lista: l }) => <TarjetaArea key={a} area={a} lista={l} nombre={nombreServicio} quieto />)}</div>
  </details>
}

function TarjetaArea({ area, lista, nombre, i, quieto }: { area: AreaServicio; lista: Servicio[]; nombre: (x: Servicio) => string; i?: number; quieto?: boolean }) {
  const Icono = ICONO_AREA[area]
  return <section className={`${w.tarjeta} ${w.tarjetaArea}${i != null ? ` ${mov.entra}` : ''}`} style={i != null ? escalon(i) : undefined} aria-label={area}>
    <div className={w.tarjetaCabeza}>
      <span className={w.areaIcono} data-area={area}><Icono size={13} aria-hidden /></span>
      <span className={w.tarjetaTitulo}>{area}</span>
      <span className={w.tarjetaCuenta}>{lista.length}</span>
    </div>
    {!quieto && <p className={w.areaQue}>{QUE_AREA[area]}</p>}
    <ul className={w.servicios}>{lista.map(x => <li key={x.label} data-quieto={quieto || undefined} title={`${x.label}${x.pid ? ` · pid ${x.pid}` : ''}`}><i aria-hidden />{nombre(x)}</li>)}</ul>
  </section>
}
