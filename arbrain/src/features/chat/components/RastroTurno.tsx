'use client'
/**
 * El razonamiento del turno de Levy (25 oct 2026). Principio: el rastro es para AUDITAR, no para leer.
 *   · Un toggle simple «Razonamiento» ARRIBA de la respuesta, plegado por defecto. Al abrirse: el razonamiento y las
 *     herramientas intercalados en el orden en que ocurrieron (lib/rastro · lineaDeTiempo).
 *   · Trabajando: el mismo renglón es la línea viva en español + reloj. Los agentes se mencionan («N agentes
 *     trabajando ›») y su detalle vive en el Taller. La línea fija sobre el composer repite la línea viva fuera de vista.
 * Todo con data-tts-exclude: voz, lector y copiar leen solo la respuesta.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { ChevronRight, Bot } from 'lucide-react'
import type { ChatMessage } from '../hooks/useChat'
import { agruparHerramientas, agentesTrabajando, contarPasos, delegadosDe, lineaDeTiempo, lineaViva, separarRazonamiento, textoAgentes, textoDelegados, textoPasos } from '../lib/rastro'
import { inicioTurno } from '../lib/duracion-turno'
import { etiquetaFila } from '../lib/fila-turno'
import { useEsperaExplicada } from '../lib/espera-explicada'
import { BotonReintentar } from './BotonReintentar'
import { abrirTallerDelPanel } from '../lib/abrir-taller'
import { esViva } from '../lib/tareas-turno'
import { GruposHerramientas, NotasInyectadas } from './ToolCallCard'
import { TodoListWidget } from './TodoListWidget'
import { AgentTaskCards } from './AgentTaskCard'
import { RelojTurno } from './RelojTurno'
import h from './herramientas.module.css'

type Conexion = 'online' | 'offline' | 'reconnecting'

/** Qué dice la línea viva: los estados de espera del chat mandan; si no, lo que deriva lib/rastro. */
export function etiquetaViva(msg: ChatMessage, connection: Conexion = 'online', grupos = agruparHerramientas(msg)): string {
  if (connection === 'offline') return 'Sin conexión · Levy sigue trabajando en el servidor'
  if (connection === 'reconnecting') return 'Reconectando con el servidor'
  if (msg.status === 'esperando_tareas' && !msg.content) return 'En fila · sale cuando terminen las tareas de Levy'
  if (msg.status === 'en_fila_turno' && !msg.content) return etiquetaFila(msg.fila)
  return lineaViva(msg, grupos)
}

/** ¿El turno espera algo (pregunta, fila, red) en vez de trabajar? Entonces el giro se queda quieto. */
const enEspera = (msg: ChatMessage, connection: Conexion) =>
  !!msg.questionPrompts?.some(q => q.status === 'pending') || connection !== 'online' || (msg.status === 'en_fila_turno' && !msg.content) || (msg.status === 'esperando_tareas' && !msg.content)

/** Mención compacta de los agentes que trabajan para este turno: abre el Taller, donde vive su detalle. */
function MencionAgentes({ msg }: { msg: ChatMessage }) {
  // Con tareas del SDK, AgentTaskCards ya reconcilia con el panel (no promete «trabajando» de una tarea cerrada).
  if (msg.tasks?.some(esViva)) return <AgentTaskCards tasks={msg.tasks} soloVivas />
  const n = agentesTrabajando(msg)
  if (!n) return null
  return <button type="button" onClick={abrirTallerDelPanel} title="Verlos en el Taller" className={h.agentes}>
    <Bot size={13} aria-hidden />{textoAgentes(n)}<ChevronRight size={13} aria-hidden />
  </button>
}

/**
 * Lo que Levy delegó en este turno, en UNA línea sutil del rastro (27 oct 2026, Daniel: «eso se ve en prima de tool
 * usage dentro de tu razonamiento»): «Lanzó 2 subagentes · Goal UX, Harness», punto de estado y clic al Taller, donde
 * vive el detalle. Visible con el razonamiento plegado; la tarjeta grande de Trabajos ya no sale sola tras delegar.
 */
function LineaDelegados({ msg }: { msg: ChatMessage }) {
  const d = useMemo(() => delegadosDe(msg), [msg])
  if (!d) return null
  return <button type="button" onClick={abrirTallerDelPanel} title="Verlos en el Taller" className={h.delegados} data-delegados={d.estado}>
    <span className={h.puntoEstado} data-estado={d.estado} aria-hidden />
    <span className={h.abrirTexto}>{textoDelegados(d)}</span>
    <ChevronRight size={13} aria-hidden />
  </button>
}

/**
 * La línea de tiempo del turno, abierta: pensamiento → herramientas → pensamiento… en el orden real (lib/rastro ·
 * lineaDeTiempo). Cada tramo de herramientas conserva la agrupación por intención; el plan, las tareas y los resúmenes
 * del SDK van al final.
 */
function LineaDeTiempo({ msg, tareas }: { msg: ChatMessage; tareas?: ChatMessage['tasks'] }) {
  const tramos = useMemo(() => lineaDeTiempo(msg), [msg])
  return <>
    {tramos.map((t, i) => t.tipo === 'pensamiento'
      ? <div key={`p${i}`} className={h.razonamiento} data-tramo="pensamiento">{t.texto}</div>
      : <div key={`h${i}`} data-tramo="herramientas"><GruposHerramientas grupos={t.grupos} /></div>)}
    {!!msg.todos?.length && <TodoListWidget todos={msg.todos} />}
    {!!tareas?.length && <AgentTaskCards tasks={tareas} />}
    {!!msg.toolSummaries?.length && <p className={h.resumenes}>{msg.toolSummaries.join(' · ')}</p>}
  </>
}

/** ¿Hay algo detrás del toggle? Razonamiento, herramientas, plan, tareas o resúmenes. */
const hayRazonamiento = (msg: ChatMessage) =>
  !!separarRazonamiento(msg).razonamiento || contarPasos(msg) > 0 || !!msg.todos?.length || !!msg.tasks?.length || !!msg.toolSummaries?.length

/**
 * Toggle «Razonamiento» ARRIBA de la respuesta (Daniel, 25 oct 08:39), plegado por defecto. Terminado: un renglón
 * simple «Razonamiento ›». Trabajando: el mismo renglón dice qué hace Levy ahora, en español, con su reloj. Al abrirse:
 * la línea de tiempo. Los agentes vivos se mencionan aparte («N agentes trabajando ›» abre el Taller).
 */
export function Razonamiento({ msg, connection = 'online' }: { msg: ChatMessage; connection?: Conexion }) {
  const [abierto, setAbierto] = useState(false)
  const id = useId()
  const vivo = !!msg.streaming
  const quieto = enEspera(msg, connection)
  const pasos = contarPasos(msg)
  const { razonamiento } = separarRazonamiento(msg)
  // «Preparando…» sin señales más de 25 s: se dice qué pasa (resiliencia, 12 oct 2026).
  const espera = useEsperaExplicada(vivo && !quieto && !razonamiento && !pasos && !msg.content)
  if (!vivo && !hayRazonamiento(msg)) return null
  const conReloj = vivo && msg.status !== 'en_fila_turno' && msg.status !== 'esperando_tareas'
  return (
    <div className={h.rastro} data-rastro {...(vivo ? { 'data-rastro-vivo': msg.id, 'data-chat-activity': '' } : {})} data-tts-exclude>
      <button type="button" className={`${h.abrir} ${vivo ? h.abrirVivo : ''}`} aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto(a => !a)}>
        {vivo && <span className={h.giro} data-quieto={quieto ? '' : undefined} aria-hidden />}
        <span className={vivo ? h.linea : h.abrirTexto} {...(vivo ? { role: 'status', 'aria-live': 'polite' as const } : {})}>
          {vivo ? etiquetaViva(msg, connection) : 'Razonamiento'}
        </span>
        {conReloj && <span className={h.fijaMeta}><RelojTurno inicio={inicioTurno(msg)} /></span>}
        <ChevronRight aria-hidden className={h.flecha} />
      </button>
      {espera && <p role="status" data-espera-explicada className="-mt-1 mb-2 text-[12px] text-muted">{espera.texto}{espera.reintentar && <> <BotonReintentar className="ml-1 align-baseline" /></>}</p>}
      {abierto && <div id={id} role="region" aria-label="Razonamiento y herramientas de Levy" className={h.cuerpo}>
        <LineaDeTiempo msg={msg} tareas={vivo ? msg.tasks?.filter(t => !esViva(t)) : msg.tasks} />
        {vivo && !razonamiento && !pasos && <p className={h.resumenes}>Todavía no hay razonamiento ni herramientas.</p>}
      </div>}
      <LineaDelegados msg={msg} />
      {vivo && (msg.tasks?.some(esViva) || !delegadosDe(msg)) && <MencionAgentes msg={msg} />}
      {vivo && <NotasInyectadas notas={msg.inyectados} />}
    </div>
  )
}

/**
 * Línea de estado FIJA sobre el composer mientras Levy trabaja (qué hace · N pasos · tiempo). Solo aparece cuando la
 * línea viva del turno quedó fuera de la vista (Daniel subió en el hilo); tocarla lleva de vuelta al turno.
 * `siempre` la deja visible (laboratorio).
 */
export function LineaFija({ msg, connection = 'online', siempre = false }: { msg: ChatMessage | null | undefined; connection?: Conexion; siempre?: boolean }) {
  const vivo = !!msg && msg.role === 'assistant' && !!msg.streaming
  const [aLaVista, setALaVista] = useState(false)
  const idTurno = msg?.id
  useEffect(() => {
    if (!vivo || !idTurno || siempre || typeof IntersectionObserver === 'undefined') return
    let io: IntersectionObserver | null = null
    let el: Element | null = null
    // La línea viva del turno puede montarse después (mensaje perezoso): se busca hasta encontrarla.
    const buscar = () => {
      const nuevo = document.querySelector(`[data-rastro-vivo="${CSS.escape(idTurno)}"]`)
      if (nuevo === el) return
      io?.disconnect(); el = nuevo
      if (!el) { setALaVista(false); return }
      io = new IntersectionObserver(([e]) => setALaVista(e.isIntersecting), { threshold: 0.5 })
      io.observe(el)
    }
    buscar()
    const t = window.setInterval(buscar, 1500)
    return () => { window.clearInterval(t); io?.disconnect() }
  }, [vivo, idTurno, siempre])
  if (!vivo || !msg || (aLaVista && !siempre)) return null
  const pasos = contarPasos(msg)
  const conReloj = msg.status !== 'en_fila_turno' && msg.status !== 'esperando_tareas'
  const irAlTurno = () => document.querySelector(`[data-rastro-vivo="${CSS.escape(msg.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return (
    <button type="button" className={h.fija} onClick={irAlTurno} data-linea-fija data-tts-exclude aria-label={`Levy: ${etiquetaViva(msg, connection)}. Ir al turno`}>
      <span className={h.giro} data-quieto={enEspera(msg, connection) ? '' : undefined} aria-hidden />
      <span className={h.linea}>{etiquetaViva(msg, connection)}</span>
      {pasos > 0 && <span className={h.fijaMeta}>· {textoPasos(pasos)}</span>}
      {conReloj && <span className={h.fijaMeta}><RelojTurno inicio={inicioTurno(msg)} /></span>}
    </button>
  )
}
