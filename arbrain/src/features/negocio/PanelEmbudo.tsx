'use client'
/**
 * Tu negocio › El sistema (4 nov 2026, prototipo detrás de ARBRAIN_PANEL_NEGOCIO=1). Daniel: «en lugar de utilizar un
 * Miro, si esto lo vamos a estandarizar, ¿por qué no lo hacemos en un HTML?… ¿quizás sea un panel más?».
 *
 * El embudo completo que Levy escribió en la memoria (docs/embudo/README.md): cada embudo como un moño que se estrecha
 * hasta el pago y se abre después, y cada etapa con su número (y su fuente), quién la mueve, sus habilidades y sus
 * rutinas con la última corrida real. Un solo foco ámbar: el cuello de botella con evidencia. Lo que no opera hoy va
 * punteado. Sin cifras inventadas: lo que no viene del archivo o de una lectura real dice «sin dato».
 */
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Bot, FileText, Repeat, Shapes, UserRound, Wand2, type LucideIcon } from 'lucide-react'
import type { CronSnapshot } from '@/features/planning/types'
import { estado, hace } from '@/features/rutinas/model'
import { useFuente } from '@/features/cabina/datos'
import { urlRutinas } from '@/features/cabina/vistas/Rutinas'
import { rutaDe } from '@/features/cabina/model'
import { abrirSeccion } from '@/features/cabina/panel/Secciones'
import { abrirHabilidad, escucharPedido, EVENTO_ETAPA_NEGOCIO, LLAVE_ETAPA_NEGOCIO, tomarPedido } from '@/shared/navigation/ir-a'
import { escalon, mov } from '@/shared/movimiento'
import {
  agrupar, corridaInactiva, corridaLaunchd, cuelloDe, fechaCorta, motorDe, numero, puentes, quien, rolDe,
  type Corrida, type Ejecutor, type Etapa, type RespuestaEmbudo, type Rutina,
} from './embudo'
import e from './panel-embudo.module.css'

type Encendido = Extract<RespuestaEmbudo, { activo: true }>

/** El moño: alto de cada tramo, de la entrada (ancho) al pago (estrecho) y de vuelta. */
const ALTO = [100, 82, 64, 64, 82, 100]

const ICONO_QUIEN: Record<Ejecutor['tipo'], LucideIcon> = { levy: Bot, rutina: Repeat, persona: UserRound }

export function PanelEmbudo({ datos, grande }: { datos: Encendido; grande?: boolean }) {
  const embudo = datos.embudo
  const crons = useFuente<CronSnapshot>(embudo?.etapas.some(et => et.rutinas.some(r => r.activa && motorDe(r) === 'scheduler')) ? urlRutinas() : null)
  const [foco, setFoco] = useState<string | null>(null)
  const raiz = useRef<HTMLDivElement>(null)

  // Habilidades › «Ver en tu negocio» trae a esta etapa (llave si la vista no estaba montada, evento si ya lo estaba).
  useEffect(() => { const p = tomarPedido(LLAVE_ETAPA_NEGOCIO); if (p) setFoco(p) }, [])
  useEffect(() => escucharPedido(EVENTO_ETAPA_NEGOCIO, id => { tomarPedido(LLAVE_ETAPA_NEGOCIO); setFoco(id) }), [])
  useEffect(() => {
    if (!foco || !embudo) return
    const el = raiz.current?.querySelector<HTMLElement>(`[data-etapa="${CSS.escape(foco)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const t = setTimeout(() => setFoco(null), 2600)
    return () => clearTimeout(t)
  }, [foco, embudo])

  const grupos = useMemo(() => embudo ? agrupar(embudo) : [], [embudo])
  if (!embudo) return <Vacio errores={datos.errores} ruta={datos.ruta} />

  const cuello = cuelloDe(embudo)
  const { upsell, volante } = puentes(embudo)
  const ahora = Date.now()
  const corrida = (r: Rutina): Corrida => {
    if (!r.activa) return corridaInactiva(r)
    const m = motorDe(r)
    if (m === 'launchd') return corridaLaunchd(datos.launchd[r.id!])
    if (m === 'scheduler') {
      const snap = crons.data
      const job = snap?.jobs.find(j => j.id === r.id)
      if (!job) return { tono: 'sin-dato', texto: snap || crons.error ? 'Sin dato aquí' : 'Leyendo…' }
      const est = estado(job, snap!.runs)
      return { tono: est.tono, texto: est.ms ? `${est.texto} · ${hace(est.ms, ahora, snap!.timeZone)}` : est.texto }
    }
    return { tono: 'sin-dato', texto: 'Sin dato' }
  }
  const irAEtapa = (id: string) => setFoco(id)

  return <div ref={raiz} className={`${e.panel} ${grande ? e.grande : ''}`}>
    <header className={`${e.cabeza} ${mov.entra}`} style={escalon(0)}>
      <p className={e.ceja}>Tu negocio · <b>el sistema completo</b></p>
      <h3 className={e.titular}>{embudo.negocio}</h3>
      <p className={e.bajada}>
        {grupos.length === 1 ? 'Un embudo' : `${grupos.length} embudos encadenados`} · {embudo.etapas.length} etapas
        {cuello ? <> · cuello en <button className={e.enlaceTexto} onClick={() => irAEtapa(cuello.id)}>{cuello.nombre}</button></> : ' · sin cuello marcado'}
      </p>
      <p className={e.meta}>
        <span>Revisado el {fechaCorta(embudo.generado)}</span>
        {embudo.lienzo?.page_id && <Link className={e.accion} href={rutaDe({ destino: 'lienzo', paginaId: embudo.lienzo.page_id })}><Shapes size={13} aria-hidden />Ver el lienzo</Link>}
      </p>
      <ul className={e.leyenda} aria-label="Cómo leerlo">
        <li><i data-trazo="solido" aria-hidden />Opera hoy</li>
        <li><i data-trazo="punteado" aria-hidden />Por construir</li>
        <li><i data-trazo="cuello" aria-hidden />Cuello de botella</li>
      </ul>
    </header>

    {grupos.map((g, gi) => {
      const sube = upsell.find(a => g.etapas.some(et => et.id === a.desde))
      return <div key={g.info.id} className={e.grupo}>
        <section className={`${e.embudo} ${mov.entra}`} style={escalon(gi + 1)} aria-label={g.info.nombre}>
          <div className={e.embudoCabeza}>
            {g.info.kicker && <p className={e.kicker}>{g.info.kicker}</p>}
            <h4 className={e.embudoNombre}>{g.info.nombre}</h4>
            {g.info.frase && <p className={e.frase}>{g.info.frase}</p>}
          </div>
          <ol className={e.mono} aria-label={`Etapas de ${g.info.nombre}`}>
            {g.etapas.map((et, i) => <li key={et.id} style={{ ['--alto' as string]: `${ALTO[i] ?? 100}%` }}>
              <button className={e.tramo} data-hoy={et.opera_hoy || undefined} data-cuello={et.cuello.es || undefined} onClick={() => irAEtapa(et.id)} aria-label={`${et.orden}. ${et.etapa}: ${et.nombre}${et.cuello.es ? ' (cuello de botella)' : ''}`}>
                <span className={e.tramoBarra} aria-hidden>{et.cuello.es && <i className={e.luz} />}</span>
                <span className={e.tramoNum}>{et.orden}</span>
                <span className={e.tramoNombre}>{et.nombre}</span>
              </button>
            </li>)}
          </ol>
          <div className={e.etapas}>
            {g.etapas.map(et => <TarjetaEtapa key={et.id} et={et} corrida={corrida} enfocada={foco === et.id} />)}
          </div>
        </section>
        {sube && <Puente texto={sube.accion ?? 'La gente sube al siguiente embudo'} estado={sube.estado} fecha={sube.evidencia?.fecha} />}
      </div>
    })}

    {volante.map(v => <Puente key={`${v.desde}-${v.hacia}`} texto={v.accion ?? 'De vuelta al inicio'} estado={v.estado} nota={v.nota} vuelta />)}
  </div>
}

function TarjetaEtapa({ et, corrida, enfocada }: { et: Etapa; corrida: (r: Rutina) => Corrida; enfocada: boolean }) {
  const n = numero(et.mide)
  return <article className={e.etapa} data-etapa={et.id} data-hoy={et.opera_hoy || undefined} data-cuello={et.cuello.es || undefined} data-enfocada={enfocada || undefined} aria-label={`${et.etapa}: ${et.nombre}`}>
    <header className={e.etapaCabeza}>
      <span className={e.etapaNum} aria-hidden>{et.orden}</span>
      <div>
        <p className={e.etapaCeja}>{et.etapa}{!et.opera_hoy && <span className={e.porConstruir}>Por construir</span>}</p>
        <h5 className={e.etapaNombre}>{et.nombre}</h5>
      </div>
    </header>
    <p className={e.que}>{et.que_pasa}</p>

    {et.cuello.es && <div className={e.cuello} role="note">
      <p className={e.cuelloEtiqueta}><i className={e.luz} aria-hidden />Cuello de botella</p>
      {et.cuello.frase && <p className={e.cuelloFrase}>{et.cuello.frase}</p>}
      {et.cuello.evidencia && <button className={e.evidencia} onClick={() => abrirSeccion({ vista: 'documento', ruta: et.cuello.evidencia!.ruta, titulo: 'Evidencia del cuello' })}>
        <FileText size={12} aria-hidden />Evidencia: {et.cuello.evidencia.detalle ?? fechaCorta(et.cuello.evidencia.fecha)}
      </button>}
    </div>}

    <div className={e.numero}>
      <p className={e.etiqueta}>{et.mide.nombre}</p>
      <p className={e.cifra} data-sin-dato={n.sinDato || undefined}>{n.texto}</p>
      <p className={e.fuente}>Fuente: {et.mide.fuente}{n.cuando ? ` · ${n.cuando}` : ''}</p>
    </div>

    <div className={e.bloque}>
      <p className={e.etiqueta}>Quién la mueve</p>
      <ul className={e.chips}>{et.ejecuta.map((q, i) => { const I = ICONO_QUIEN[q.tipo]; const rol = rolDe(q); return <li key={i} className={e.chip} data-tipo={q.tipo}><I size={12} aria-hidden />{quien(q)}{rol && <small>{rol}</small>}</li> })}</ul>
    </div>

    {et.skills.length > 0 && <div className={e.bloque}>
      <p className={e.etiqueta}>Habilidades</p>
      <ul className={e.chips}>{et.skills.map(s => <li key={s.ruta}><button className={e.skill} onClick={() => abrirHabilidad(s.ruta)} title="Abrir en Habilidades"><Wand2 size={12} aria-hidden />{s.nombre}</button></li>)}</ul>
    </div>}

    {et.rutinas.length > 0 && <div className={e.bloque}>
      <p className={e.etiqueta}>Rutinas</p>
      <ul className={e.rutinas}>{et.rutinas.map((r, i) => { const c = corrida(r); return <li key={r.id ?? i} className={e.rutina} data-activa={r.activa || undefined}>
        <span className={e.punto} data-tono={c.tono} aria-hidden />
        <span className={e.rutinaTexto}>
          <b>{r.que_hace}</b>
          <small>{[r.activa ? r.horario : null, c.texto].filter(Boolean).join(' · ')}</small>
        </span>
      </li> })}</ul>
    </div>}
  </article>
}

function Puente({ texto, estado, fecha, nota, vuelta }: { texto: string; estado: string; fecha?: string; nota?: string; vuelta?: boolean }) {
  const porConstruir = /construir/i.test(estado)
  return <div className={e.puente} data-por-construir={porConstruir || undefined} data-vuelta={vuelta || undefined}>
    <ArrowDown size={14} aria-hidden className={vuelta ? e.flechaVuelta : undefined} />
    <div>
      <p className={e.puenteTexto}><b>{vuelta ? 'El giro de vuelta' : 'Sube al siguiente'}</b> · {texto}</p>
      <p className={e.puenteMeta}>{porConstruir ? 'Por construir' : estado === 'observada' ? 'Observado' : 'Opera'}{fecha ? ` · ${fechaCorta(fecha)}` : ''}{nota ? ` · ${nota}` : ''}</p>
    </div>
  </div>
}

function Vacio({ errores, ruta }: { errores?: string[]; ruta: string }) {
  const pedir = () => {
    const cita = errores?.length ? `Corrige mi embudo (${ruta}): ` : 'Arma mi embudo completo en el estándar de Arbrain, con mis skills y rutinas en cada etapa.'
    if (window.location.pathname.startsWith('/chat')) window.dispatchEvent(new CustomEvent('cabina:redactar', { detail: { texto: cita } }))
    else { try { sessionStorage.setItem('cabina:redactar', cita) } catch { /* modo privado */ } window.location.assign('/chat') }
  }
  return <div className={e.vacio}>
    {errores?.length
      ? <><p><b>Tu embudo tiene detalles por corregir.</b> Levy lo arregla en un momento:</p><ul>{errores.map(x => <li key={x}>{x}</li>)}</ul></>
      : <p><b>Tu embudo todavía no está dibujado.</b> Levy lo arma con lo que ya sabe de tu negocio y te pregunta lo que falte.</p>}
    <button className={e.accion} onClick={pedir}>{errores?.length ? 'Pedir la corrección' : 'Pedírselo a Levy'}</button>
  </div>
}
