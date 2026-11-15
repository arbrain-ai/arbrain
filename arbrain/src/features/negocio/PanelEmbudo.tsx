'use client'
/**
 * Tu negocio › El sistema (4 nov 2026, prototipo detrás de ARBRAIN_PANEL_NEGOCIO=1). Daniel: «en lugar de utilizar un
 * Miro, si esto lo vamos a estandarizar, ¿por qué no lo hacemos en un HTML?… ¿quizás sea un panel más?».
 *
 * 5 nov, la vista única: «tenemos dos sistemas… qué te parece en lugar de ser los dos tuviéramos sólo uno… ya todo lo
 * edito con inteligencia artificial». El embudo que Levy escribe en la memoria (docs/embudo/README.md) se pinta como
 * grafo (GrafoEmbudo, React Flow + dagre): los pisos que traen gente arriba, cada oferta debajo de lo que sube a ella,
 * la escalera de valor y el giro de vuelta como aristas. Tocar una etapa abre su ficha: el número (con su fuente, cada
 * cuánto y quién lo mueve), quién la mueve, sus skills y sus rutinas con la última corrida real. La segunda pestaña,
 * «Skills por etapa», categoriza todas las skills: de qué etapa cuelga cada una y cuáles no cuelgan de ninguna.
 * El lienzo «Mi negocio» se archivó ese día; este panel ya no lo enlaza. Sin cifras inventadas: «sin dato».
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpLeft, Bot, ChevronRight, FileText, Repeat, UserRound, Wand2, X, type LucideIcon } from 'lucide-react'
import type { CronSnapshot } from '@/features/planning/types'
import { estado, hace } from '@/features/rutinas/model'
import { useFuente } from '@/features/cabina/datos'
import { urlRutinas } from '@/features/cabina/vistas/Rutinas'
import { abrirSeccion } from '@/features/cabina/panel/Secciones'
import { abrirHabilidad, escucharPedido, EVENTO_ETAPA_NEGOCIO, LLAVE_ETAPA_NEGOCIO, tomarPedido } from '@/shared/navigation/ir-a'
import { escalon, mov } from '@/shared/movimiento'
import {
  agrupar, corridaInactiva, corridaLaunchd, cuelloDe, fechaCorta, motorDe, nombreEmbudo, numero, quien, resumenGrupos, rolDe,
  subidasDe, type Arista, type Corrida, type Ejecutor, type Embudo, type Etapa, type RespuestaEmbudo, type Rutina,
} from './embudo'
import { conexiones, type Orientacion } from './grafo'
import { GrafoEmbudo, type Seleccion } from './GrafoEmbudo'
import { SkillsPorEtapa } from './SkillsPorEtapa'
import e from './panel-embudo.module.css'
import { tr } from '@/shared/i18n'
import { trNodos } from '@/shared/i18n'

type Encendido = Extract<RespuestaEmbudo, { activo: true }>
type Parte = 'grafo' | 'skills'

const ICONO_QUIEN: Record<Ejecutor['tipo'], LucideIcon> = { levy: Bot, rutina: Repeat, persona: UserRound }

/** Escribe en la caja del chat (o la deja lista para cuando se abra): pedirle algo a Levy sin enviarlo. */
function redactar(cita: string) {
  if (window.location.pathname.startsWith('/chat')) window.dispatchEvent(new CustomEvent('cabina:redactar', { detail: { texto: cita } }))
  else { try { sessionStorage.setItem('cabina:redactar', cita) } catch { /* modo privado */ } window.location.assign('/chat') }
}

export function PanelEmbudo({ datos, grande }: { datos: Encendido; grande?: boolean }) {
  const embudo = datos.embudo
  const crons = useFuente<CronSnapshot>(embudo?.etapas.some(et => et.rutinas.some(r => r.activa && motorDe(r) === 'scheduler')) ? urlRutinas() : null)
  const [parte, setParte] = useState<Parte>('grafo')
  const [sel, setSel] = useState<Seleccion>(null)
  const [enfocar, setEnfocar] = useState<{ id: string; n: number } | null>(null)
  const [modo, setModo] = useState<Orientacion>('estrecho')

  // Llevar a una etapa: el grafo, la etapa elegida y traída a la vista. Lo usan Habilidades › «Ver en tu negocio» (llave
  // si la vista no estaba montada, evento si ya lo estaba), el cuello de la cabeza y la vista de skills.
  const irAEtapa = useCallback((id: string) => {
    setParte('grafo'); setSel({ tipo: 'etapa', id }); setEnfocar(f => ({ id, n: (f?.n ?? 0) + 1 }))
  }, [])
  useEffect(() => { const p = tomarPedido(LLAVE_ETAPA_NEGOCIO); if (p) irAEtapa(p) }, [irAEtapa])
  useEffect(() => escucharPedido(EVENTO_ETAPA_NEGOCIO, id => { tomarPedido(LLAVE_ETAPA_NEGOCIO); irAEtapa(id) }), [irAEtapa])

  const grupos = useMemo(() => embudo ? agrupar(embudo) : [], [embudo])
  if (!embudo) return <Vacio errores={datos.errores} ruta={datos.ruta} />

  const cuello = cuelloDe(embudo)
  const ahora = Date.now()
  const corrida = (r: Rutina): Corrida => {
    if (!r.activa) return corridaInactiva(r)
    const m = motorDe(r)
    if (m === 'launchd') return corridaLaunchd(datos.launchd[r.id!])
    if (m === 'scheduler') {
      const snap = crons.data
      const job = snap?.jobs.find(j => j.id === r.id)
      if (!job) return { tono: 'sin-dato', texto: snap || crons.error ? tr('Sin dato aquí') : tr('Leyendo…') }
      const est = estado(job, snap!.runs)
      return { tono: est.tono, texto: est.ms ? `${est.texto} · ${hace(est.ms, ahora, snap!.timeZone)}` : est.texto }
    }
    return { tono: 'sin-dato', texto: tr('Sin dato') }
  }

  return <div className={`${e.panel} ${grande ? e.grande : ''}`}>
    <header className={`${e.cabeza} ${mov.entra}`} style={escalon(0)}>
      <p className={e.ceja}>{trNodos('Tu negocio · {sistema}', { sistema: <b>{tr('el sistema completo')}</b> })}</p>
      <h3 className={e.titular}>{embudo.negocio}</h3>
      <p className={e.bajada}>
        {resumenGrupos(grupos)} · {tr('{n} etapas', { n: embudo.etapas.length })}
        {cuello ? <> · {trNodos('cuello en {etapa}', { etapa: <button className={e.enlaceTexto} onClick={() => irAEtapa(cuello.id)}>{cuello.nombre}</button> })}</> : ` · ${tr('sin cuello marcado')}`}
      </p>
      <p className={e.meta}><span>{tr('Revisado el {fecha} · se edita solo el archivo del embudo, con Levy', { fecha: fechaCorta(embudo.generado) })}</span></p>
    </header>

    <div className={`${e.pestanas} ${mov.entra}`} style={escalon(1)} role="tablist" aria-label={tr('Cómo ver el sistema')}>
      <button role="tab" aria-selected={parte === 'grafo'} onClick={() => setParte('grafo')}>{tr('El grafo')}</button>
      <button role="tab" aria-selected={parte === 'skills'} onClick={() => setParte('skills')}>{tr('Skills por etapa')}</button>
    </div>

    {parte === 'grafo' ? <div className={`${e.grafoZona} ${mov.entra}`} style={escalon(2)} data-o={modo} data-con-detalle={sel ? '' : undefined}>
      <ul className={e.leyenda} aria-label={tr('Cómo leerlo')}>
        <li><i data-trazo="solido" aria-hidden />{tr('Opera hoy')}</li>
        <li><i data-trazo="punteado" aria-hidden />{tr('Por construir')}</li>
        <li><i data-trazo="cuello" aria-hidden />{tr('Cuello de botella')}</li>
        <li><i data-trazo="escalera" aria-hidden />{tr('Sube de piso')}</li>
      </ul>
      <GrafoEmbudo embudo={embudo} sel={sel} elegir={setSel} enfocar={enfocar} grande={grande} alCambiarModo={setModo} />
      {sel && <Detalle sel={sel} embudo={embudo} corrida={corrida} cerrar={() => setSel(null)} irAEtapa={irAEtapa} modo={modo} />}
      {!sel && <p className={e.pista}>{tr('Toca una etapa para ver su número, quién la mueve, sus skills y sus rutinas.')}</p>}
    </div>
      : <SkillsPorEtapa embudo={embudo} inventario={datos.skills} alElegirEtapa={irAEtapa} pedirALevy={redactar} />}
  </div>
}

/** La ficha de lo que se tocó en el grafo: una etapa (su tarjeta y por dónde le llega y sale la gente) o un embudo. */
function Detalle({ sel, embudo, corrida, cerrar, irAEtapa, modo }: { sel: NonNullable<Seleccion>; embudo: Embudo; corrida: (r: Rutina) => Corrida; cerrar: () => void; irAEtapa: (id: string) => void; modo: Orientacion }) {
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') cerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [cerrar])
  const etapa = sel.tipo === 'etapa' ? embudo.etapas.find(et => et.id === sel.id) : null
  const grupo = sel.tipo === 'embudo' ? agrupar(embudo).find(g => g.info.id === sel.id) : null
  if (!etapa && !grupo) return null
  const titulo = etapa ? nombreEmbudo(embudo, etapa.embudo) : grupo!.info.kicker ?? tr('Embudo')
  return <aside className={e.detalle} data-o={modo} aria-label={tr('Ficha de {nombre}', { nombre: etapa ? etapa.nombre : grupo!.info.nombre })} data-testid="detalle-etapa">
    <div className={e.detalleBarra}>
      <span>{titulo}</span>
      <button type="button" className={e.cerrar} onClick={cerrar} aria-label={tr('Cerrar la ficha')}><X size={15} /></button>
    </div>
    {etapa ? <>
      <TarjetaEtapa et={etapa} corrida={corrida} enfocada={false} />
      <Conexiones embudo={embudo} etapa={etapa} irAEtapa={irAEtapa} />
    </> : <FichaEmbudo embudo={embudo} grupo={grupo!} irAEtapa={irAEtapa} />}
  </aside>
}

function Conexiones({ embudo, etapa, irAEtapa }: { embudo: Embudo; etapa: Etapa; irAEtapa: (id: string) => void }) {
  const { llega, sale } = conexiones(embudo, etapa.id)
  if (!llega.length && !sale.length) return null
  const nombre = (id: string) => embudo.etapas.find(et => et.id === id)
  const fila = (a: Arista, hacia: boolean) => {
    const otra = nombre(hacia ? a.hacia : a.desde)
    if (!otra) return null
    const verbo = hacia ? (a.tipo === 'upsell' ? tr('Sube a') : a.tipo === 'volante' ? tr('Vuelve a') : tr('Sigue')) : (a.tipo === 'flujo' ? tr('Viene de') : a.tipo === 'volante' ? tr('Regresa de') : tr('Llega de'))
    const fuera = otra.embudo !== etapa.embudo
    const I = hacia ? ArrowDownRight : ArrowUpLeft
    return <li key={`${a.desde}-${a.hacia}`}>
      <button type="button" className={e.conexion} data-por-construir={/construir/i.test(a.estado) || undefined} onClick={() => irAEtapa(otra.id)}>
        <I size={13} aria-hidden />
        <span><small>{verbo}</small><b>{fuera ? `${nombreEmbudo(embudo, otra.embudo)} · ` : ''}{otra.nombre}</b>{a.accion && a.tipo !== 'flujo' && <small>{a.accion}{/construir/i.test(a.estado) ? ` · ${tr('por construir')}` : ''}</small>}</span>
        <ChevronRight size={13} aria-hidden />
      </button>
    </li>
  }
  return <div className={e.bloque}>
    <p className={e.etiqueta}>{tr('Conecta con')}</p>
    <ul className={e.conexiones}>{llega.map(a => fila(a, false))}{sale.map(a => fila(a, true))}</ul>
  </div>
}

function FichaEmbudo({ embudo, grupo, irAEtapa }: { embudo: Embudo; grupo: ReturnType<typeof agrupar>[number]; irAEtapa: (id: string) => void }) {
  const subidas = subidasDe(embudo, grupo)
  return <article className={e.etapa} data-hoy={grupo.info.estado !== 'por construir' || undefined}>
    <header>
      <p className={e.etapaCeja}>{grupo.info.tipo === 'piso' ? tr('Piso') : tr('Oferta')}{grupo.info.estado === 'por construir' && <span className={e.porConstruir}>{tr('Por construir')}</span>}</p>
      <h5 className={e.etapaNombre}>{grupo.info.nombre}</h5>
    </header>
    {grupo.info.frase && <p className={e.que}>{grupo.info.frase}</p>}
    <div className={e.bloque}>
      <p className={e.etiqueta}>{tr('Sus etapas')}</p>
      <ul className={e.conexiones}>{grupo.etapas.map(et => <li key={et.id}><button type="button" className={e.conexion} data-por-construir={!et.opera_hoy || undefined} onClick={() => irAEtapa(et.id)}>
        <span className={e.etapaNum} aria-hidden>{et.orden}</span><span><small>{tr(et.etapa)}</small><b>{et.nombre}</b></span><ChevronRight size={13} aria-hidden />
      </button></li>)}</ul>
    </div>
    {subidas.length > 0 && <div className={e.bloque}>
      <p className={e.etiqueta}>{tr('Sube a')}</p>
      <ul className={e.conexiones}>{subidas.map(({ arista: a, hacia }) => <li key={`${a.desde}-${a.hacia}`}><button type="button" className={e.conexion} data-por-construir={/construir/i.test(a.estado) || undefined} onClick={() => irAEtapa(a.hacia)}>
        <ArrowDownRight size={13} aria-hidden /><span><b>{hacia}</b><small>{a.accion ?? ''}{/construir/i.test(a.estado) ? ` · ${tr('por construir')}` : a.estado === 'observada' ? ` · ${tr('observado')}` : ''}</small></span><ChevronRight size={13} aria-hidden />
      </button></li>)}</ul>
    </div>}
  </article>
}

function TarjetaEtapa({ et, corrida, enfocada }: { et: Etapa; corrida: (r: Rutina) => Corrida; enfocada: boolean }) {
  const n = numero(et.mide)
  return <article className={e.etapa} data-etapa={et.id} data-hoy={et.opera_hoy || undefined} data-cuello={et.cuello.es || undefined} data-enfocada={enfocada || undefined} aria-label={`${tr(et.etapa)}: ${et.nombre}`}>
    <header className={e.etapaCabeza}>
      <span className={e.etapaNum} aria-hidden>{et.orden}</span>
      <div>
        <p className={e.etapaCeja}>{tr(et.etapa)}{!et.opera_hoy && <span className={e.porConstruir}>{tr('Por construir')}</span>}</p>
        <h5 className={e.etapaNombre}>{et.nombre}</h5>
      </div>
    </header>
    <p className={e.que}>{et.que_pasa}</p>

    {et.cuello.es && <div className={e.cuello} role="note">
      <p className={e.cuelloEtiqueta}><i className={e.luz} aria-hidden />{tr('Cuello de botella')}</p>
      {et.cuello.frase && <p className={e.cuelloFrase}>{et.cuello.frase}</p>}
      {et.cuello.evidencia && <button className={e.evidencia} onClick={() => abrirSeccion({ vista: 'documento', ruta: et.cuello.evidencia!.ruta, titulo: tr('Evidencia del cuello') })}>
        <FileText size={12} aria-hidden />{tr('Evidencia: {detalle}', { detalle: et.cuello.evidencia.detalle ?? fechaCorta(et.cuello.evidencia.fecha) })}
      </button>}
    </div>}

    <div className={e.numero}>
      <p className={e.etiqueta}>{et.mide.nombre}</p>
      <p className={e.cifra} data-sin-dato={n.sinDato || undefined}>{n.texto}</p>
      <p className={e.fuente}>{tr('Fuente: {fuente}', { fuente: et.mide.fuente })}{n.cuando ? ` · ${n.cuando}` : ''}</p>
      <p className={e.fuente}>{trNodos('Se actualiza: {frecuencia} · Lo mueve: {quien}', { frecuencia: et.mide.frecuencia, quien: <b className={e.dueno}>{quien(et.mide.dueno)}</b> })}</p>
      {!et.mide.hay_numero && et.mide.como_medirlo && <p className={e.comoMedirlo}><b>{tr('Qué lo mediría:')}</b> {et.mide.como_medirlo}</p>}
    </div>

    <div className={e.bloque}>
      <p className={e.etiqueta}>{tr('Quién la mueve')}</p>
      <ul className={e.chips}>{et.ejecuta.map((q, i) => { const I = ICONO_QUIEN[q.tipo]; const rol = rolDe(q); return <li key={i} className={e.chip} data-tipo={q.tipo}><I size={12} aria-hidden />{quien(q)}{rol && <small>{rol}</small>}</li> })}</ul>
    </div>

    {et.skills.length > 0 && <div className={e.bloque}>
      <p className={e.etiqueta}>{tr('Habilidades')}</p>
      <ul className={e.chips}>{et.skills.map(s => <li key={s.ruta}><button className={e.skill} onClick={() => abrirHabilidad(s.ruta)} title={tr('Abrir en Habilidades')}><Wand2 size={12} aria-hidden />{s.nombre}</button></li>)}</ul>
    </div>}

    {et.rutinas.length > 0 && <div className={e.bloque}>
      <p className={e.etiqueta}>{tr('Rutinas')}</p>
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

function Vacio({ errores, ruta }: { errores?: string[]; ruta: string }) {
  const pedir = () => redactar(errores?.length ? tr('Corrige mi embudo ({ruta}): ', { ruta }) : tr('Arma mi embudo completo en el estándar de Arbrain, con mis skills y rutinas en cada etapa.'))
  return <div className={e.vacio}>
    {errores?.length
      ? <><p><b>{tr('Tu embudo tiene detalles por corregir.')}</b> {tr('Levy lo arregla en un momento:')}</p><ul>{errores.map(x => <li key={x}>{x}</li>)}</ul></>
      : <p><b>{tr('Tu embudo todavía no está dibujado.')}</b> {tr('Levy lo arma con lo que ya sabe de tu negocio y te pregunta lo que falte.')}</p>}
    <button className={e.accion} onClick={pedir}>{errores?.length ? tr('Pedir la corrección') : tr('Pedírselo a Levy')}</button>
  </div>
}
