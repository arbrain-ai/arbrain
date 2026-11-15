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
import { localeIntl, tr, trn } from '@/shared/i18n'

export { urlTrabajos }
const hace = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 1 ? tr('hace un momento') : m < 60 ? tr('hace {n} min', { n: m }) : tr('hace {n} h', { n: Math.round(m / 60) }) }
const corto = (label: string) => label.replace(/^com\.(claudeclaw|levy|arbrain)\./, '')
const tokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} M` : n >= 1000 ? tr('{n} mil', { n: Math.round(n / 1000) }) : String(n)
const hora = (iso: string) => new Date(iso).toLocaleTimeString(localeIntl(), { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })
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
  const detalle = t.estado === 'trabajando' && act ? tr('Ahora: {actividad}', { actividad: act }) : null
  const gasto = [c?.tokens != null ? `${tokens(c.tokens)} tokens` : null, c?.ctxPct != null ? tr('contexto {pct}%', { pct: Math.round(c.ctxPct) }) : null].filter(Boolean).join(' · ')
  const tecnico = [t.pid ? `pid ${t.pid}` : null, c?.harness ?? t.proc, modelo(c?.modelo ?? null), t.cwd].filter(Boolean).join(' · ')
  const max = grande ? 700 : 280
  const nombre = t.subagente?.nombre ?? t.titulo.replace(/^[◑◐●○✳]\s*/, '')
  return <article className={`${s.agente} ${enfocada ? s.enfocada : ''}`} data-estado={t.estado === 'esperando' && !pregunta ? 'termino' : t.estado} data-pregunta={pregunta ? 'si' : undefined}>
    <header>
      <i className={s.puntoEstado} aria-hidden />
      <b>{nombre}</b>
      <span className={s.etiquetaEstado}>{estado}</span>
      {t.subagente ? <span className={s.deLevy}>{tr('de Levy · {cuando}', { cuando: hace(t.subagente.creado) })}</span>
        : t.origen === 'sfterm-ptyd' ? <span className={s.origen} title={t.soloLectura ? tr('Sesión que abriste tú. Levy la lee pero no puede escribirle ni cerrarla.') : tr('Sesión que abriste tú.')}>{tr('tuya')}{t.soloLectura ? ` · ${tr('Levy solo la lee')}` : ''}</span> : null}
    </header>
    {gasto && <p className={s.gasto}>{gasto}</p>}
    {t.subagente ? <p className={s.encargo}>«{t.subagente.encargo.slice(0, 180)}{t.subagente.encargo.length > 180 ? '…' : ''}»</p>
      : pedido && grande ? <p className={s.encargo}>«{pedido.texto.slice(0, 180)}{pedido.texto.length > 180 ? '…' : ''}»</p> : null}
    {detalle && <p className={s.estadoClaro}>{detalle}</p>}
    {ultima ? <div className={s.respuesta}><span>{t.estado === 'trabajando' ? tr('Lo último que dijo') : pregunta ? tr('Te pregunta') : tr('Su respuesta')}</span><p>{enLinea(ultima.texto.slice(0, max))}{ultima.texto.length > max ? '…' : ''}</p></div>
      : t.ultimaAccion ? <p className={s.ultimaAccion}><span>{tr('Última acción')}</span>{t.ultimaAccion}</p> : null}
    {herramientas.length > 0 && <p className={s.herramientas}>{tr('Usó: {herramientas}', { herramientas: herramientas.join(' · ') })}</p>}
    {c?.error && <p className={s.fuente}>{tr('La conversación no se pudo leer ({error}); abajo está su terminal.', { error: c.error })}</p>}
    {t.subagente && <form className={s.responder} onSubmit={e => { e.preventDefault(); const m = mensaje.trim(); if (!m) return; pedir(tr('Retoma el subagente «{nombre}» (agenteId {id}) con este mensaje: «{mensaje}»', { nombre, id: t.id, mensaje: m })); setMensaje('') }}>
      <input value={mensaje} onChange={e => setMensaje(e.target.value)} placeholder={pregunta ? tr('Contéstale…') : tr('Escríbele algo más…')} aria-label={tr('Mensaje para {nombre}', { nombre })} />
      <button type="submit" disabled={!mensaje.trim()}>{tr('Enviar')}</button>
      <button type="button" className={s.cerrarAgente} onClick={() => pedir(tr('Cierra el subagente «{nombre}» (agenteId {id}).', { nombre, id: t.id }))}>{tr('Cerrar')}</button>
    </form>}
    {(grande || t.ultimas.length > 0) && <details className={s.verTerminal} open={grande && enfocada && !c}><summary>{tr('Detalles técnicos')}</summary><p className={s.agenteMeta}>{tecnico}</p>{t.ultimas.length > 0 && <pre className={s.salida}>{t.ultimas.join('\n')}</pre>}</details>}
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
  const cuenta = [agentes.length ? trn(agentes.length, '{n} agente', '{n} agentes') : null, procesos ? trn(procesos, '{n} proceso', '{n} procesos') : null].filter(Boolean).join(' · ')
  return <div role="group" aria-label={g.activa ? tr('Esta conversación: {titulo}', { titulo }) : titulo}>
    <div className={s.conversacion}>
      {g.activa ? <span className={s.conversacionActual} title={titulo}>{titulo}</span>
        : g.conversacion ? <button className={s.conversacionTitulo} onClick={() => abrir(g.conversacion)} title={tr('Abrir «{titulo}» en el chat', { titulo })}>{titulo}</button>
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
      <span className={s.etiquetaEstado}>{tr(ESTADO_INTERNA[t.estado])}</span>
      <span className={s.deLevy}>{tr('de Levy · {cuando}', { cuando: hace(t.desde) })}</span>
    </header>
    {linea && <p className={s.estadoClaro}>{linea}</p>}
    <p className={s.gasto}><DatosInterna t={t} /></p>
    <details className={s.verTerminal} onToggle={e => setAbierta((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{esAgente ? (trabajando ? tr('Ver lo último que dijo') : tr('Ver su resultado')) : tr('Ver lo que imprime')}</summary>
      {!salida.data ? <p className={s.fuente}>{salida.error ? tr(salida.error) : tr('Leyendo…')}</p>
        : esAgente && ultimo ? <>
          <div className={s.respuesta}><span>{trabajando ? tr('Lo último que dijo') : t.estado === 'falló' ? tr('Lo último que dijo') : tr('Resultado')}</span><p>{enLinea(ultimo.slice(0, 900))}{ultimo.length > 900 ? '…' : ''}</p></div>
          {det && det.herramientas.length > 0 && <p className={s.herramientas}>{tr('Usó: {herramientas}', { herramientas: herramientasEnPalabras(det.herramientas, 6) })}</p>}
        </>
        : <pre className={s.salida}>{salida.data.texto || tr('Sin salida todavía.')}</pre>}
    </details>
  </article>
}

/** Lo que corre en el Studio, leído del motor de Arbrain: agentes con su conversación
 *  real, subagentes de Levy con sus topes, servidores y servicios. Se relee cada 4 s
 *  solo mientras está a la vista. */
export function VistaTrabajos({ agenteId, grande }: { agenteId?: number; grande?: boolean }) {
  const { data, error } = useFuente<Datos>(urlTrabajos(grande ? 14 : 6), 4000)
  const activaId = useConversacionActiva()
  if (!data) return <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{tr(error)}</p> : tr('Mirando qué corre en el Studio…')}</div>
  // Con agenteId Levy enseña UN agente (Daniel, 3 oct: salían los de todas las conversaciones). Solo ese.
  if (agenteId != null) {
    const t = data.terminales.find(x => x.id === agenteId)
    return <div className={s.trabajos}>
      {t ? <Agente t={t} enfocada grande={grande} /> : <p className={s.fuente}>{tr('El agente {id} ya no está en el motor: terminó y se cerró.', { id: agenteId })}</p>}
      <p className={s.fuente}>{tr('Leído {hora} · {fuente}.', { hora: hora(data.leidoEn), fuente: fuenteEnPalabras(data) })}</p>
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
    {data.fuente && data.fuente !== 'motor' && <p className={s.aviso}>{tr('Terminales leídas de {fuente}.', { fuente: fuenteEnPalabras(data) })} {data.error ? `(${tr(data.error)})` : ''}</p>}
    {m && <div className={s.motorBarra}>
      <p className={s.motorLinea}><i aria-hidden /><b>{tr('Motor de Arbrain')}</b><span>{trn(m.propias, '{n} sesión propia', '{n} sesiones propias')}{m.adoptadas ? ` · ${tr('{n} abiertas por ti', { n: m.adoptadas })}` : ''}{m.sfterm === 'desconectado' ? ` · ${tr('tus terminales sin enlace')}` : ''} · {tr('vivo desde {hora}', { hora: hora(m.desde) })}{m.relevos ? ` · ${trn(m.relevos, '{n} relevo sin cortes', '{n} relevos sin cortes')}` : ''}</span></p>
      {tp && <div className={s.medidores}>
        <Medidor etiqueta={tr('Subagentes en paralelo')} usado={tp.paralelo.vivos} max={tp.paralelo.max} texto={tr('{n} de {max}', { n: tp.paralelo.vivos, max: tp.paralelo.max })} />
        {tp.paralelo.vivos >= tp.paralelo.max && <p className={s.topeLleno}>{tr('Tope lleno: Levy no lanza otro subagente hasta que cierres uno.')}</p>}
        <Medidor etiqueta={tr('Tokens de subagentes hoy')} usado={tp.tokens.hoy} max={tp.tokens.max} texto={`${tr('{n} de {max}', { n: tokens(tp.tokens.hoy), max: tokens(tp.tokens.max) })}${tp.tokens.sinMedir ? ` · ${tr('{n} sin medir', { n: tp.tokens.sinMedir })}` : ''}`} />
      </div>}
    </div>}
    <section aria-label={tr('Agentes')}>
      <h4 className={s.subtitulo}>{tr('Agentes')} <small>{tr('{n} trabajando', { n: agentes.filter(x => x.estado === 'trabajando').length })}{agentes.length > agentes.filter(x => x.estado === 'trabajando').length ? ` · ${tr('{n} te preguntan', { n: agentes.length - agentes.filter(x => x.estado === 'trabajando').length })}` : ''}{shells.length ? ` · ${trn(shells.length, '{n} terminal de shell', '{n} terminales de shell')}` : ''}</small></h4>
      {visibles.length === 0 && <p className={s.fuente}>{tr('Ningún agente trabajando ahora.')}</p>}
      {visibles.map(t => <Agente key={t.id} t={t} enfocada={t.id === agenteId} grande={grande} />)}
      {agentes.length > visibles.length && <p className={s.fuente}>{tr('+{n} más · «Ampliar» para verlos todos.', { n: agentes.length - visibles.length })}</p>}
      {grande && shells.length > 0 && <details className={s.verTerminal}><summary>{tr('Terminales de shell ({n})', { n: shells.length })}</summary>{shells.map(t => <p key={t.id} className={s.filaServicio}><i aria-hidden /><b>{t.cwd}</b><span>{t.origen === 'sfterm-ptyd' ? tr('tuya') : tr('motor')}</span></p>)}</details>}
    </section>
    {internas.length > 0 && <section aria-label={tr('Dentro de los turnos de Levy')}>
      <h4 className={s.subtitulo}>{tr('Dentro de los turnos de Levy')} <small>{tr('{n} trabajando', { n: internas.length })}</small></h4>
      {/* Por conversación (el dueño, 1 oct): se recorta primero por importancia y lo que queda se agrupa. Aquí las terminadas cuentan todas: el servidor ya manda solo las de hoy. */}
      {agruparInternas(grande ? internas : internas.slice(0, 4), { activaId, esHoy: () => true }).grupos.map(g => <ConversacionTrabajos key={g.conversacion || 'sin-conversacion'} g={g} />)}
      {!grande && internas.length > 4 && <p className={s.fuente}>{tr('+{n} más · «Ampliar» para verlas todas.', { n: internas.length - 4 })}</p>}
    </section>}
    {nTerminados > 0 && <section aria-label={tr('Terminados')}>
      <details className={s.terminados}>
        <summary className={s.subtitulo}><ChevronRight size={13} className={s.chevronT} aria-hidden />{tr('Terminados')} <small>{nTerminados}{falloT ? ` · ${trn(falloT, '{n} falló', '{n} fallaron')}` : ''}</small></summary>
        {agentesTerminados.slice(0, topeTerminados).map(t => <FilaTerminada key={`t${t.id}`} icono={<IconoTipo tipo={tipoTerminal(t)} estado="termino" />} nombre={nombreTerminal(t)} resumen={resumenTerminal(t)} cuando={t.subagente ? hace(t.subagente.creado) : tr('terminó')}>
          <Agente t={t} enfocada={t.id === agenteId} grande={grande} />
        </FilaTerminada>)}
        {terminadas.slice(0, topeTerminados).map(t => <FilaTerminada key={t.id} icono={<IconoTipo tipo={tipoInterna(t)} estado={estadoInterna(t)} />} nombre={tituloLegible(t)} resumen={resumenInterna(t)} cuando={hace(new Date(finDeInterna(t) || Date.now()).toISOString())} falla={t.estado === 'falló'}>
          <Interna t={t} />
        </FilaTerminada>)}
        {nTerminados > 2 * topeTerminados || agentesTerminados.length > topeTerminados || terminadas.length > topeTerminados ? <p className={s.fuente}>{tr('Se muestran los más recientes de cada tipo.')}</p> : null}
      </details>
    </section>}
    <details className={s.verTerminal} open={grande}><summary>{tr('Puertos y servicios del Studio · técnico')} ({tr('{n} puertos', { n: data.servidores.length })} · {tr('{n} servicios', { n: corriendo.length })}{fallaron.length ? ` · ${tr('{n} con falla', { n: fallaron.length })}` : ''})</summary>
    <p className={s.fuente}>{tr('¿Abre lo que usan tus miembros? Eso vive en Taller › Servidores, arriba de estos puertos.')}</p>
    <div className={s.dosColumnas}>
      <section aria-label={tr('Servidores')}>
        <h4 className={s.subtitulo}>{tr('Servidores')} <small>{tr('{n} puertos', { n: data.servidores.length })}</small></h4>
        {(grande ? data.servidores : conNombre).map(x => <p key={x.puerto} className={s.filaServidor}><i aria-hidden /><b>{x.puerto}</b><span>{x.nombre || x.proceso}</span></p>)}
        {!grande && data.servidores.length > conNombre.length && <p className={s.fuente}>{tr('+{n} sin nombre conocido', { n: data.servidores.length - conNombre.length })}</p>}
      </section>
      <section aria-label={tr('Servicios')}>
        <h4 className={s.subtitulo}>{tr('Servicios')} <small>{tr('{n} corriendo', { n: corriendo.length })} · {tr('{n} programados', { n: data.servicios.length - corriendo.length - fallaron.length })}</small></h4>
        {fallaron.map(x => <p key={x.label} className={`${s.filaServicio} ${s.falla}`}><i aria-hidden /><b>{corto(x.label)}</b><span>{tr('salió con {codigo}', { codigo: x.codigo })}</span></p>)}
        {corriendo.slice(0, grande ? 40 : 6).map(x => <p key={x.label} className={s.filaServicio}><i aria-hidden /><b>{corto(x.label)}</b><span>pid {x.pid}</span></p>)}
      </section>
    </div>
    </details>
    <p className={s.fuente}>{tr('Leído {hora} · terminales del {fuente} · sin variables de entorno ni secretos.', { hora: hora(data.leidoEn), fuente: fuenteEnPalabras(data) })}</p>
  </div>
}

export function resumenTrabajos(d: Datos | undefined) {
  if (!d) return null
  const agentes = d.terminales.filter(esAgente)
  const t = agentes.filter(x => x.estado === 'trabajando').length
  const term = agentes.filter(agenteTerminado).length
  const tope = d.topes ? ` · ${tr('{vivos}/{max} subagentes', { vivos: d.topes.paralelo.vivos, max: d.topes.paralelo.max })}` : ''
  const internas = (d.internas ?? []).filter(x => x.estado === 'trabajando').length
  return `${trn(t, '{n} agente trabajando', '{n} agentes trabajando')}${term ? ` · ${tr('{n} terminados', { n: term })}` : ''}${internas ? ` · ${tr('{n} tareas de Levy', { n: internas })}` : ''}${tope} · ${tr('{n} servidores', { n: d.servidores.length })}`
}
