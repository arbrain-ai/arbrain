'use client'
/**
 * Una tarea interna de Levy (agente, comando o flujo de un turno) para un dueño de negocio, 2 oct 2026.
 *
 * Daniel: «el Taller es para un dueño de negocio; quiere claridad […] Le doy clic y lo abro y la
 * verdad no entiendo qué está pasando». La fila dice QUÉ tarea es (la descripción con la que Levy la
 * lanzó), qué hace ahora en español y tres datos reales: tiempo, contexto y modelo. El detalle abre
 * con una ficha, lo último que dijo (o su resultado, si ya terminó) y deja el registro técnico
 * plegado al final, con las herramientas contadas y no una línea por uso. Todo sale de
 * `internas-lectura.ts` (puro, con pruebas) y de `/api/cabina/salida` (transcripción del agente).
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { ArrowLeft, ChevronRight, Clock, Cpu, Gauge } from 'lucide-react'
import { MarkdownMessage } from '@/features/chat/components/MarkdownMessage'
import { useFuente, lecturaEnCache } from '../datos'
import { useAbrirConversacion, useTituloConversacion } from '../conversaciones'
import { useAhora } from '../useAhora'
import { accionEnPalabras, actividadLegible, contextoDe, datosInterna, duracionCorta, herramientasEnPalabras, lineaDeFila, modeloLegible, resultadoCorto, tiempoDe, tiempoRotulo, tituloLegible, TIPO_LEGIBLE, tokensCortos } from '../internas-lectura'
import { ESTADO_INTERNA, urlSalida, type Salida, type TareaInterna, type Trabajos } from '../trabajos-modelo'
import { hace, urlPanel } from './datos'
import { IconoTipo, estadoInterna, tipoInterna } from './Tipo'
import s from './panel.module.css'
import i from './internas.module.css'

const ICONO_DATO = { tiempo: Clock, contexto: Gauge, modelo: Cpu } as const

/** Tiempo, contexto y modelo en una línea, cada uno con su ícono y su ayuda; lo que no se sabe no sale. */
export function DatosInterna({ t }: { t: TareaInterna }) {
  const ahora = useAhora(t.estado === 'trabajando')
  const datos = datosInterna(t, ahora)
  if (datos.length === 0) return null
  return <span className={i.datos}>{datos.map(d => {
    const Icono = ICONO_DATO[d.clave]
    return <span key={d.clave} title={d.ayuda}><Icono size={11} aria-hidden />{d.texto}</span>
  })}</span>
}

/** Una fila de la lista: título, qué hace ahora y los datos. Tocarla abre el detalle. */
export function FilaInterna({ t, onAbrir }: { t: TareaInterna; onAbrir: (id: string) => void }) {
  const estado = estadoInterna(t)
  const linea = lineaDeFila(t)
  return (
    <button className={s.fila} data-estado={estado} onClick={() => onAbrir(t.id)} title="Ver qué está haciendo">
      <span className={s.marca}><IconoTipo tipo={tipoInterna(t)} estado={estado} /></span>
      <span className={s.filaTexto}>
        <span className={i.nombre}>{tituloLegible(t)}</span>
        {linea && <span className={i.actividad} data-vivo={t.estado === 'trabajando' || undefined}>{linea}</span>}
        <DatosInterna t={t} />
      </span>
      <span className={`${s.filaEstado} ${i.estado}`} data-falla={t.estado === 'falló' || undefined}>{ESTADO_INTERNA[t.estado]}</span>
      <ChevronRight size={14} className={s.flecha} aria-hidden />
    </button>
  )
}

/** Dónde se lo pidió Daniel a Levy: el título de la conversación abre el chat. */
function Origen({ t }: { t: TareaInterna }) {
  const titulo = useTituloConversacion(t.conversacion)
  const abrir = useAbrirConversacion()
  return <p className={i.origen}>
    Lo lanzó Levy {hace(t.desde)}{t.conversacion ? <> en <button onClick={() => abrir(t.conversacion)} title={`Abrir «${titulo}» en el chat`}>{titulo}</button></> : null}.
  </p>
}

function Plegado({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <details className={i.plegado}>
    <summary><ChevronRight size={12} aria-hidden />{titulo}</summary>
    <div className={i.cuerpo}>{children}</div>
  </details>
}

export function DetalleInterna({ id, onVolver }: { id: string; onVolver: () => void }) {
  const lista = useFuente<Trabajos>(urlPanel(false), 4000)
  const t = (lista.data ?? lecturaEnCache<Trabajos>(urlPanel(false)))?.internas?.find(x => x.id === id)
  const trabajando = t?.estado === 'trabajando'
  const salida = useFuente<Salida>(urlSalida(id, 120), trabajando ? 2500 : undefined)
  const ahora = useAhora(trabajando)
  const pre = useRef<HTMLPreElement>(null)
  useLayoutEffect(() => { const el = pre.current; if (el) el.scrollTop = el.scrollHeight }, [salida.data?.texto])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onVolver() } }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onVolver])

  const det = salida.data?.detalle
  const titulo = t ? tituloLegible(t) : salida.data?.descripcion ?? 'Tarea de Levy'
  const esAgente = t?.tipo === 'subagente'
  const actividad = t && trabajando ? actividadLegible(t) : null
  const ms = t ? tiempoDe(t, ahora) : null
  const contexto = t ? (det?.contexto ?? contextoDe(t)) : null
  const modelo = t ? modeloLegible(t, det?.modelo) : null
  // Lo que dijo al terminar: su último mensaje; si no hay transcripción, el resumen del SDK o lo que devolvió.
  const final = !trabajando ? (det?.final ?? t?.resumen ?? (salida.data && salida.data.fuente !== 'archivo' ? salida.data.texto : null)) : null
  const dicho = (det?.dicho ?? []).filter(x => x !== det?.final || trabajando).slice(-3)
  const sinTranscripcion = !det

  return <div className={s.detalle}>
    <div className={s.fijadaCabecera}>
      <button className={s.icono} onClick={onVolver} aria-label="Volver" title="Volver (Esc)"><ArrowLeft size={15} /></button>
      {t && <IconoTipo tipo={tipoInterna(t)} estado={estadoInterna(t)} grande />}
      <div className={s.detalleTitulo}>
        <b className={i.titulo} title={titulo}>{titulo}</b>
        <span>{t ? `${TIPO_LEGIBLE[t.tipo]} de Levy` : 'Leyendo…'}</span>
      </div>
    </div>

    {t && <dl className={i.ficha}>
      <div><dt>Estado</dt><dd>{ESTADO_INTERNA[t.estado]}</dd></div>
      <div><dt>{tiempoRotulo(t)}</dt><dd>{ms != null ? duracionCorta(ms) : 'sin dato'}</dd></div>
      {esAgente
        ? <>
          <div><dt>Contexto</dt><dd data-sin={contexto ? undefined : true} title={contexto ? `${contexto.toLocaleString('es-MX')} tokens` : undefined}>{contexto ? `${tokensCortos(contexto)} tokens` : 'sin dato'}</dd></div>
          <div><dt>Modelo</dt><dd data-sin={modelo ? undefined : true}>{modelo ?? 'sin dato'}</dd></div>
        </>
        : <div><dt>Dónde</dt><dd>{t.segundoPlano ? 'Segundo plano' : 'En el turno'}</dd></div>}
    </dl>}
    {t && <Origen t={t} />}
    {!t && <p className={s.nota}>{lista.data || lecturaEnCache<Trabajos>(urlPanel(false)) ? 'Esta tarea ya no está en el registro de hoy.' : 'Leyendo…'}</p>}

    {actividad && <p className={i.ahora}><i className={s.punto} data-estado="trabajando" aria-hidden />Ahora: {actividad}</p>}
    {t && (t.estado === 'falló' || t.estado === 'detenida') && (t.nota || t.estado === 'falló') && <p className={i.aviso} data-falla={t.estado === 'falló' || undefined}>{t.nota ?? resultadoCorto(t.resumen) ?? 'Falló sin dejar un motivo.'}</p>}

    {esAgente && trabajando && dicho.length > 0 && <section className={i.bloque} aria-label="Lo último que dijo">
      <h4>Lo último que dijo</h4>
      <div className={i.dicho}>{dicho.map((x, k) => <div key={k}><MarkdownMessage content={x} /></div>)}</div>
    </section>}
    {esAgente && !trabajando && final && <section className={i.bloque} aria-label="Resultado">
      <h4>{t?.estado === 'falló' ? 'Lo último que dijo' : 'Resultado'}</h4>
      <div className={i.resultado}><MarkdownMessage content={final} /></div>
    </section>}
    {esAgente && trabajando && dicho.length === 0 && !salida.error && <p className={s.nota}>{salida.data ? 'Todavía no ha dicho nada: está leyendo y preparando.' : 'Leyendo lo que ha dicho…'}</p>}

    {det?.encargo && <Plegado titulo="Su encargo completo"><p className={i.encargo}>{det.encargo}</p></Plegado>}

    {/* Un comando no «dice» nada: lo que imprime es lo que importa, a la vista. */}
    {t && !esAgente && <section className={i.bloque} aria-label="Salida">
      <h4>Lo que va imprimiendo</h4>
      <pre ref={pre} className={s.terminal} style={{ margin: 0 }}>{salida.data?.texto || (salida.error ? `Sin salida: ${salida.error}` : 'Leyendo la salida…')}</pre>
    </section>}

    {esAgente && <Plegado titulo="Ver detalle técnico">
      {det
        ? <>
          <p className={i.herramientas}>{herramientasEnPalabras(det.herramientas) || 'Aún no ha usado herramientas.'}{det.usos ? ` · ${det.usos} en total${det.parcial ? ' (solo las últimas)' : ''}` : ''}</p>
          {det.acciones.length > 0 && <ul className={i.acciones} aria-label="Sus últimas acciones">{det.acciones.slice(-8).map((a, k) => <li key={k} title={accionEnPalabras(a)}>{accionEnPalabras(a)}</li>)}</ul>}
        </>
        : <pre ref={pre} className={`${s.terminal} ${i.salida}`}>{salida.data?.texto || (salida.error ? `Sin salida: ${salida.error}` : 'Leyendo la salida…')}</pre>}
      <p className={i.pie}>
        {sinTranscripcion ? (salida.data?.fuente === 'resultado' ? 'Lo que devolvió al terminar.' : 'Su transcripción no está en disco: esto es lo que reportó al terminar.') : 'Sacado de su transcripción, sin secretos.'}
        {trabajando ? ' Se relee cada 2.5 s.' : ''}
      </p>
    </Plegado>}
  </div>
}
