'use client'
import { useState, type ReactNode } from 'react'
import { useFuente } from '../datos'
import s from '../cabina.module.css'
import { agruparInternas, separarProcesos, type GrupoInternas } from '../internas-por-conversacion'
import { useAbrirConversacion, useConversacionActiva, useTituloConversacion } from '../conversaciones'
import { herramientasEnPalabras, lineaDeFila, tituloLegible } from '../internas-lectura'
import { DatosInterna } from '../panel/InternaDetalle'
import { nombreTerminal } from '../panel/datos'
import { agenteTerminado, partirInternas, partirTerminales, resumenInterna, resumenTerminal, finDeInterna } from '../terminados'
import { ChevronRight } from 'lucide-react'
import { IconoTipo, estadoInterna, tipoInterna, tipoTerminal } from '../panel/Tipo'
import { esAgente, estadoEnPalabras, preguntaAlgo, ultimaRespuesta, urlSalida, urlTrabajos, lineaLimpia, ESTADO_INTERNA, fuenteEnPalabras, type TareaInterna, type Terminal, type Trabajos as Datos, type Salida } from '../trabajos-modelo'

export { urlTrabajos }
const hace = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h` }
const corto = (label: string) => label.replace(/^com\.(claudeclaw|levy|arbrain)\./, '')
const tokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} M` : n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n)
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })
/** Markdown en línea del agente (negritas y código) sin HTML crudo: el texto llega tachado. */
function enLinea(texto: string) {
  return texto.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((t, i) =>
    t.startsWith('**') && t.endsWith('**') && t.length > 4 ? <b key={i}>{t.slice(2, -2)}</b>
      : t.startsWith('`') && t.endsWith('`') && t.length > 2 ? <code key={i}>{t.slice(1, -1)}</code> : t)
}
const modelo = (m: string | null) => m ? m.replace(/^claude-/, '').replace(/-\d{8}$/, '') : null

function Medidor({ etiqueta, usado, max, texto }: { etiqueta: string; usado: number; max: number; texto: string }) {
  const pct = Math.min(100, Math.round((usado / Math.max(1, max)) * 100))
  return <div className={s.medidor} data-lleno={pct >= 100 ? 'si' : pct >= 80 ? 'casi' : 'no'} role="meter" aria-label={etiqueta} aria-valuenow={usado} aria-valuemin={0} aria-valuemax={max}>
    <span className={s.medidorEtiqueta}>{etiqueta}</span>
    <b>{texto}</b>
    <i aria-hidden><em style={{ width: `${pct}%` }} /></i>
  </div>
}

/** Pedirle algo a Levy sobre un subagente: el chat lo recibe como mensaje del dueño. */
const pedir = (texto: string) => window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto } }))
/** El spinner trae basura de la terminal («└ Runn… (14s · timeout 2m)»): queda la palabra. */
const actividadLimpia = (a: string | null) => lineaLimpia(a)?.replace(/…$/, '') ?? null

function Agente({ t, enfocada, grande }: { t: Terminal; enfocada: boolean; grande?: boolean }) {
  const [mensaje, setMensaje] = useState('')
  const c = t.conversacion
  const ultima = ultimaRespuesta(t)
  const pedido = c ? [...c.mensajes].reverse().find(m => m.rol === 'user') : undefined
  const herramientas = c?.mensajes.flatMap(m => m.herramientas).slice(-2) ?? []
  const pregunta = preguntaAlgo(t)
  const act = actividadLimpia(t.actividad)
  // un solo estado en palabras (el crítico: «Esperando» a secas era ambiguo)
  const estado = estadoEnPalabras(t)
  const detalle = t.estado === 'trabajando' && act ? `Ahora: ${act}` : null
  const gasto = [c?.tokens != null ? `${tokens(c.tokens)} tokens` : null, c?.ctxPct != null ? `contexto ${Math.round(c.ctxPct)}%` : null].filter(Boolean).join(' · ')
  const tecnico = [t.pid ? `pid ${t.pid}` : null, c?.harness ?? t.proc, modelo(c?.modelo ?? null), t.cwd].filter(Boolean).join(' · ')
  const max = grande ? 700 : 280
  const nombre = t.subagente?.nombre ?? t.titulo.replace(/^[◑◐●○✳]\s*/, '')
  return <article className={`${s.agente} ${enfocada ? s.enfocada : ''}`} data-estado={t.estado === 'esperando' && !pregunta ? 'termino' : t.estado} data-pregunta={pregunta ? 'si' : undefined}>
    <header>
      <i className={s.puntoEstado} aria-hidden />
      <b>{nombre}</b>
      <span className={s.etiquetaEstado}>{estado}</span>
      {t.subagente ? <span className={s.deLevy}>de Levy · {hace(t.subagente.creado)}</span>
        : t.origen === 'sfterm-ptyd' ? <span className={s.origen} title={t.soloLectura ? 'Sesión que abriste tú. Levy la lee pero no puede escribirle ni cerrarla.' : 'Sesión que abriste tú.'}>tuya{t.soloLectura ? ' · Levy solo la lee' : ''}</span> : null}
    </header>
    {gasto && <p className={s.gasto}>{gasto}</p>}
    {t.subagente ? <p className={s.encargo}>«{t.subagente.encargo.slice(0, 180)}{t.subagente.encargo.length > 180 ? '…' : ''}»</p>
      : pedido && grande ? <p className={s.encargo}>«{pedido.texto.slice(0, 180)}{pedido.texto.length > 180 ? '…' : ''}»</p> : null}
    {detalle && <p className={s.estadoClaro}>{detalle}</p>}
    {ultima ? <div className={s.respuesta}><span>{t.estado === 'trabajando' ? 'Lo último que dijo' : pregunta ? 'Te pregunta' : 'Su respuesta'}</span><p>{enLinea(ultima.texto.slice(0, max))}{ultima.texto.length > max ? '…' : ''}</p></div>
      : t.ultimaAccion ? <p className={s.ultimaAccion}><span>Última acción</span>{t.ultimaAccion}</p> : null}
    {herramientas.length > 0 && <p className={s.herramientas}>Usó: {herramientas.join(' · ')}</p>}
    {c?.error && <p className={s.fuente}>La conversación no se pudo leer ({c.error}); abajo está su terminal.</p>}
    {t.subagente && <form className={s.responder} onSubmit={e => { e.preventDefault(); const m = mensaje.trim(); if (!m) return; pedir(`Retoma el subagente «${nombre}» (agenteId ${t.id}) con este mensaje: «${m}»`); setMensaje('') }}>
      <input value={mensaje} onChange={e => setMensaje(e.target.value)} placeholder={pregunta ? 'Contéstale…' : 'Escríbele algo más…'} aria-label={`Mensaje para ${nombre}`} />
      <button type="submit" disabled={!mensaje.trim()}>Enviar</button>
      <button type="button" className={s.cerrarAgente} onClick={() => pedir(`Cierra el subagente «${nombre}» (agenteId ${t.id}).`)}>Cerrar</button>
    </form>}
    {(grande || t.ultimas.length > 0) && <details className={s.verTerminal} open={grande && enfocada && !c}><summary>Detalles técnicos</summary><p className={s.agenteMeta}>{tecnico}</p>{t.ultimas.length > 0 && <pre className={s.salida}>{t.ultimas.join('\n')}</pre>}</details>}
  </article>
}

/** Una fila de «Terminados»: una línea (quién, qué resultó, cuándo); tocarla abre la tarjeta completa con su conversación. */
function FilaTerminada({ icono, nombre, resumen, cuando, falla, children }: { icono: ReactNode; nombre: string; resumen: string; cuando: string; falla?: boolean; children: ReactNode }) {
  return <details className={s.terminado} data-falla={falla ? 'si' : undefined}>
    <summary>{icono}<b>{nombre}</b><span className={s.terminadoResumen}>{resumen}</span><time>{cuando}</time></summary>
    <div className={s.terminadoCuerpo}>{children}</div>
  </details>
}

/** Las tareas internas de UNA conversación bajo su título (tocarlo abre el chat); la abierta va como «Esta conversación». */
function ConversacionTrabajos({ g }: { g: GrupoInternas }) {
  const titulo = useTituloConversacion(g.conversacion)
  const abrir = useAbrirConversacion()
  // Agentes y procesos (comandos en segundo plano) se cuentan aparte (14 oct 2026).
  const { agentes, procesos } = separarProcesos(g.corriendo)
  const cuenta = [agentes.length ? `${agentes.length} ${agentes.length === 1 ? 'agente' : 'agentes'}` : null, procesos ? `${procesos} ${procesos === 1 ? 'proceso' : 'procesos'}` : null].filter(Boolean).join(' · ')
  return <div role="group" aria-label={g.activa ? `Esta conversación: ${titulo}` : titulo}>
    <div className={s.conversacion}>
      {g.activa ? <span className={s.conversacionActual} title={titulo}>{titulo}</span>
        : g.conversacion ? <button className={s.conversacionTitulo} onClick={() => abrir(g.conversacion)} title={`Abrir «${titulo}» en el chat`}>{titulo}</button>
        : <span className={s.conversacionActual}>{titulo}</span>}
      <small>{cuenta}</small>
    </div>
    {g.corriendo.map(t => <Interna key={t.id} t={t} />)}
  </div>
}

/** Un agente o comando interno de un turno de Levy, para un dueño de negocio (2 oct 2026): qué tarea es
 *  (la descripción con la que Levy la lanzó), qué hace ahora y tiempo, contexto y modelo reales. Lo
 *  último que dijo, o su resultado, a un toque (se relee mientras trabaja). */
function Interna({ t }: { t: TareaInterna }) {
  const [abierta, setAbierta] = useState(false)
  const salida = useFuente<Salida>(abierta ? urlSalida(t.id, 40) : null, t.estado === 'trabajando' ? 3000 : undefined)
  const trabajando = t.estado === 'trabajando'
  const linea = lineaDeFila(t)
  const det = salida.data?.detalle
  const esAgente = t.tipo === 'subagente'
  const ultimo = trabajando ? det?.dicho.at(-1) : (det?.final ?? t.resumen)
  return <article className={s.agente} data-estado={trabajando ? 'trabajando' : t.estado === 'falló' ? 'falla' : 'termino'}>
    <header>
      <IconoTipo tipo={tipoInterna(t)} estado={estadoInterna(t)} />
      <b>{tituloLegible(t)}</b>
      <span className={s.etiquetaEstado}>{ESTADO_INTERNA[t.estado]}</span>
      <span className={s.deLevy}>de Levy · {hace(t.desde)}</span>
    </header>
    {linea && <p className={s.estadoClaro}>{linea}</p>}
    <p className={s.gasto}><DatosInterna t={t} /></p>
    <details className={s.verTerminal} onToggle={e => setAbierta((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{esAgente ? (trabajando ? 'Ver lo último que dijo' : 'Ver su resultado') : 'Ver lo que imprime'}</summary>
      {!salida.data ? <p className={s.fuente}>{salida.error ?? 'Leyendo…'}</p>
        : esAgente && ultimo ? <>
          <div className={s.respuesta}><span>{trabajando ? 'Lo último que dijo' : t.estado === 'falló' ? 'Lo último que dijo' : 'Resultado'}</span><p>{enLinea(ultimo.slice(0, 900))}{ultimo.length > 900 ? '…' : ''}</p></div>
          {det && det.herramientas.length > 0 && <p className={s.herramientas}>Usó: {herramientasEnPalabras(det.herramientas, 6)}</p>}
        </>
        : <pre className={s.salida}>{salida.data.texto || 'Sin salida todavía.'}</pre>}
    </details>
  </article>
}

/** Lo que corre en el Studio, leído del motor de Arbrain: agentes con su conversación
 *  real, subagentes de Levy con sus topes, servidores y servicios. Se relee cada 4 s
 *  solo mientras está a la vista. */
export function VistaTrabajos({ agenteId, grande }: { agenteId?: number; grande?: boolean }) {
  const { data, error } = useFuente<Datos>(urlTrabajos(grande ? 14 : 6), 4000)
  const activaId = useConversacionActiva()
  if (!data) return <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{error}</p> : 'Mirando qué corre en el Studio…'}</div>
  // Con agenteId Levy enseña UN agente (Daniel, 3 oct: salían los de todas las conversaciones). Solo ese.
  if (agenteId != null) {
    const t = data.terminales.find(x => x.id === agenteId)
    return <div className={s.trabajos}>
      {t ? <Agente t={t} enfocada grande={grande} /> : <p className={s.fuente}>El agente {agenteId} ya no está en el motor: terminó y se cerró.</p>}
      <p className={s.fuente}>Leído {hora(data.leidoEn)} · {fuenteEnPalabras(data)}.</p>
    </div>
  }
  const orden = (a: Terminal, b: Terminal) => Number(b.id === agenteId) - Number(a.id === agenteId) || Number(!!b.subagente) - Number(!!a.subagente) || Number(b.estado === 'trabajando') - Number(a.estado === 'trabajando') || Number(!!b.conversacion) - Number(!!a.conversacion)
  const todos = data.terminales.filter(esAgente).sort(orden)
  const { vivos: agentes, terminados: agentesTerminados } = partirTerminales(todos)
  const shells = data.terminales.filter(t => !esAgente(t))
  const visibles = grande ? agentes : agentes.slice(0, agenteId != null ? 3 : 4)
  const corriendo = data.servicios.filter(x => x.estado === 'corriendo'), fallaron = data.servicios.filter(x => x.estado === 'falló')
  const conNombre = data.servidores.filter(x => x.nombre)
  const m = data.motor, tp = data.topes
  const { vivas, terminadas } = partirInternas(data.internas ?? [])
  const internas = vivas.sort((a, b) => Date.parse(b.actualizado) - Date.parse(a.actualizado))
  const nTerminados = agentesTerminados.length + terminadas.length
  const topeTerminados = grande ? 40 : 8
  const falloT = terminadas.filter(x => x.estado === 'falló').length
  return <div className={s.trabajos}>
    {data.fuente && data.fuente !== 'motor' && <p className={s.aviso}>Terminales leídas de {fuenteEnPalabras(data)}. {data.error ? `(${data.error})` : ''}</p>}
    {m && <div className={s.motorBarra}>
      <p className={s.motorLinea}><i aria-hidden /><b>Motor de Arbrain</b><span>{m.propias} {m.propias === 1 ? 'sesión propia' : 'sesiones propias'}{m.adoptadas ? ` · ${m.adoptadas} abiertas por ti` : ''}{m.sfterm === 'desconectado' ? ' · tus terminales sin enlace' : ''} · vivo desde {hora(m.desde)}{m.relevos ? ` · ${m.relevos} relevo${m.relevos > 1 ? 's' : ''} sin cortes` : ''}</span></p>
      {tp && <div className={s.medidores}>
        <Medidor etiqueta="Subagentes en paralelo" usado={tp.paralelo.vivos} max={tp.paralelo.max} texto={`${tp.paralelo.vivos} de ${tp.paralelo.max}`} />
        {tp.paralelo.vivos >= tp.paralelo.max && <p className={s.topeLleno}>Tope lleno: Levy no lanza otro subagente hasta que cierres uno.</p>}
        <Medidor etiqueta="Tokens de subagentes hoy" usado={tp.tokens.hoy} max={tp.tokens.max} texto={`${tokens(tp.tokens.hoy)} de ${tokens(tp.tokens.max)}${tp.tokens.sinMedir ? ` · ${tp.tokens.sinMedir} sin medir` : ''}`} />
      </div>}
    </div>}
    <section aria-label="Agentes">
      <h4 className={s.subtitulo}>Agentes <small>{agentes.filter(x => x.estado === 'trabajando').length} trabajando{agentes.length > agentes.filter(x => x.estado === 'trabajando').length ? ` · ${agentes.length - agentes.filter(x => x.estado === 'trabajando').length} te preguntan` : ''}{shells.length ? ` · ${shells.length} terminal${shells.length > 1 ? 'es' : ''} de shell` : ''}</small></h4>
      {visibles.length === 0 && <p className={s.fuente}>Ningún agente trabajando ahora.</p>}
      {visibles.map(t => <Agente key={t.id} t={t} enfocada={t.id === agenteId} grande={grande} />)}
      {agentes.length > visibles.length && <p className={s.fuente}>+{agentes.length - visibles.length} más · «Ampliar» para verlos todos.</p>}
      {grande && shells.length > 0 && <details className={s.verTerminal}><summary>Terminales de shell ({shells.length})</summary>{shells.map(t => <p key={t.id} className={s.filaServicio}><i aria-hidden /><b>{t.cwd}</b><span>{t.origen === 'sfterm-ptyd' ? 'tuya' : 'motor'}</span></p>)}</details>}
    </section>
    {internas.length > 0 && <section aria-label="Dentro de los turnos de Levy">
      <h4 className={s.subtitulo}>Dentro de los turnos de Levy <small>{internas.length} trabajando</small></h4>
      {/* Por conversación (el dueño, 1 oct): se recorta primero por importancia y lo que queda se agrupa. Aquí las terminadas cuentan todas: el servidor ya manda solo las de hoy. */}
      {agruparInternas(grande ? internas : internas.slice(0, 4), { activaId, esHoy: () => true }).grupos.map(g => <ConversacionTrabajos key={g.conversacion || 'sin-conversacion'} g={g} />)}
      {!grande && internas.length > 4 && <p className={s.fuente}>+{internas.length - 4} más · «Ampliar» para verlas todas.</p>}
    </section>}
    {nTerminados > 0 && <section aria-label="Terminados">
      <details className={s.terminados}>
        <summary className={s.subtitulo}><ChevronRight size={13} className={s.chevronT} aria-hidden />Terminados <small>{nTerminados}{falloT ? ` · ${falloT} ${falloT === 1 ? 'falló' : 'fallaron'}` : ''}</small></summary>
        {agentesTerminados.slice(0, topeTerminados).map(t => <FilaTerminada key={`t${t.id}`} icono={<IconoTipo tipo={tipoTerminal(t)} estado="termino" />} nombre={nombreTerminal(t)} resumen={resumenTerminal(t)} cuando={t.subagente ? hace(t.subagente.creado) : 'terminó'}>
          <Agente t={t} enfocada={t.id === agenteId} grande={grande} />
        </FilaTerminada>)}
        {terminadas.slice(0, topeTerminados).map(t => <FilaTerminada key={t.id} icono={<IconoTipo tipo={tipoInterna(t)} estado={estadoInterna(t)} />} nombre={tituloLegible(t)} resumen={resumenInterna(t)} cuando={hace(new Date(finDeInterna(t) || Date.now()).toISOString())} falla={t.estado === 'falló'}>
          <Interna t={t} />
        </FilaTerminada>)}
        {nTerminados > 2 * topeTerminados || agentesTerminados.length > topeTerminados || terminadas.length > topeTerminados ? <p className={s.fuente}>Se muestran los más recientes de cada tipo.</p> : null}
      </details>
    </section>}
    <details className={s.verTerminal} open={grande}><summary>Puertos y servicios del Studio · técnico ({data.servidores.length} puertos · {corriendo.length} servicios{fallaron.length ? ` · ${fallaron.length} con falla` : ''})</summary>
    <p className={s.fuente}>¿Abre lo que usan tus miembros? Eso vive en Taller › Servidores, arriba de estos puertos.</p>
    <div className={s.dosColumnas}>
      <section aria-label="Servidores">
        <h4 className={s.subtitulo}>Servidores <small>{data.servidores.length} puertos</small></h4>
        {(grande ? data.servidores : conNombre).map(x => <p key={x.puerto} className={s.filaServidor}><i aria-hidden /><b>{x.puerto}</b><span>{x.nombre || x.proceso}</span></p>)}
        {!grande && data.servidores.length > conNombre.length && <p className={s.fuente}>+{data.servidores.length - conNombre.length} sin nombre conocido</p>}
      </section>
      <section aria-label="Servicios">
        <h4 className={s.subtitulo}>Servicios <small>{corriendo.length} corriendo · {data.servicios.length - corriendo.length - fallaron.length} programados</small></h4>
        {fallaron.map(x => <p key={x.label} className={`${s.filaServicio} ${s.falla}`}><i aria-hidden /><b>{corto(x.label)}</b><span>salió con {x.codigo}</span></p>)}
        {corriendo.slice(0, grande ? 40 : 6).map(x => <p key={x.label} className={s.filaServicio}><i aria-hidden /><b>{corto(x.label)}</b><span>pid {x.pid}</span></p>)}
      </section>
    </div>
    </details>
    <p className={s.fuente}>Leído {hora(data.leidoEn)} · terminales del {fuenteEnPalabras(data)} · sin variables de entorno ni secretos.</p>
  </div>
}

export function resumenTrabajos(d: Datos | undefined) {
  if (!d) return null
  const agentes = d.terminales.filter(esAgente)
  const t = agentes.filter(x => x.estado === 'trabajando').length
  const term = agentes.filter(agenteTerminado).length
  const tope = d.topes ? ` · ${d.topes.paralelo.vivos}/${d.topes.paralelo.max} subagentes` : ''
  const internas = (d.internas ?? []).filter(x => x.estado === 'trabajando').length
  return `${t} ${t === 1 ? 'agente trabajando' : 'agentes trabajando'}${term ? ` · ${term} terminados` : ''}${internas ? ` · ${internas} tareas de Levy` : ''}${tope} · ${d.servidores.length} servidores`
}
