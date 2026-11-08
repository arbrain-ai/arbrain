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
      if (!job) return { tono: 'sin-dato', texto: snap || crons.error ? 'Sin dato aquí' : 'Leyendo…' }
      const est = estado(job, snap!.runs)
      return { tono: est.tono, texto: est.ms ? `${est.texto} · ${hace(est.ms, ahora, snap!.timeZone)}` : est.texto }
    }
    return { tono: 'sin-dato', texto: 'Sin dato' }
  }

  return <div className={`${e.panel} ${grande ? e.grande : ''}`}>
    <header className={`${e.cabeza} ${mov.entra}`} style={escalon(0)}>
      <p className={e.ceja}>Tu negocio · <b>el sistema completo</b></p>
      <h3 className={e.titular}>{embudo.negocio}</h3>
      <p className={e.bajada}>
        {resumenGrupos(grupos)} · {embudo.etapas.length} etapas
        {cuello ? <> · cuello en <button className={e.enlaceTexto} onClick={() => irAEtapa(cuello.id)}>{cuello.nombre}</button></> : ' · sin cuello marcado'}
      </p>
      <p className={e.meta}><span>Revisado el {fechaCorta(embudo.generado)} · se edita solo el archivo del embudo, con Levy</span></p>
    </header>

    <div className={`${e.pestanas} ${mov.entra}`} style={escalon(1)} role="tablist" aria-label="Cómo ver el sistema">
      <button role="tab" aria-selected={parte === 'grafo'} onClick={() => setParte('grafo')}>El grafo</button>
      <button role="tab" aria-selected={parte === 'skills'} onClick={() => setParte('skills')}>Skills por etapa</button>
    </div>

    {parte === 'grafo' ? <div className={`${e.grafoZona} ${mov.entra}`} style={escalon(2)} data-o={modo} data-con-detalle={sel ? '' : undefined}>
      <ul className={e.leyenda} aria-label="Cómo leerlo">
        <li><i data-trazo="solido" aria-hidden />Opera hoy</li>
        <li><i data-trazo="punteado" aria-hidden />Por construir</li>
        <li><i data-trazo="cuello" aria-hidden />Cuello de botella</li>
        <li><i data-trazo="escalera" aria-hidden />Sube de piso</li>
      </ul>
      <GrafoEmbudo embudo={embudo} sel={sel} elegir={setSel} enfocar={enfocar} grande={grande} alCambiarModo={setModo} />
      {sel && <Detalle sel={sel} embudo={embudo} corrida={corrida} cerrar={() => setSel(null)} irAEtapa={irAEtapa} modo={modo} />}
      {!sel && <p className={e.pista}>Toca una etapa para ver su número, quién la mueve, sus skills y sus rutinas.</p>}
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
  const titulo = etapa ? nombreEmbudo(embudo, etapa.embudo) : grupo!.info.kicker ?? 'Embudo'
  return <aside className={e.detalle} data-o={modo} aria-label={etapa ? `Ficha de ${etapa.nombre}` : `Ficha de ${grupo!.info.nombre}`} data-testid="detalle-etapa">
    <div className={e.detalleBarra}>
      <span>{titulo}</span>
      <button type="button" className={e.cerrar} onClick={cerrar} aria-label="Cerrar la ficha"><X size={15} /></button>
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
    const verbo = hacia ? (a.tipo === 'upsell' ? 'Sube a' : a.tipo === 'volante' ? 'Vuelve a' : 'Sigue') : (a.tipo === 'flujo' ? 'Viene de' : a.tipo === 'volante' ? 'Regresa de' : 'Llega de')
    const fuera = otra.embudo !== etapa.embudo
    const I = hacia ? ArrowDownRight : ArrowUpLeft
    return <li key={`${a.desde}-${a.hacia}`}>
      <button type="button" className={e.conexion} data-por-construir={/construir/i.test(a.estado) || undefined} onClick={() => irAEtapa(otra.id)}>
        <I size={13} aria-hidden />
        <span><small>{verbo}</small><b>{fuera ? `${nombreEmbudo(embudo, otra.embudo)} · ` : ''}{otra.nombre}</b>{a.accion && a.tipo !== 'flujo' && <small>{a.accion}{/construir/i.test(a.estado) ? ' · por construir' : ''}</small>}</span>
        <ChevronRight size={13} aria-hidden />
      </button>
    </li>
  }
  return <div className={e.bloque}>
    <p className={e.etiqueta}>Conecta con</p>
    <ul className={e.conexiones}>{llega.map(a => fila(a, false))}{sale.map(a => fila(a, true))}</ul>
  </div>
}

function FichaEmbudo({ embudo, grupo, irAEtapa }: { embudo: Embudo; grupo: ReturnType<typeof agrupar>[number]; irAEtapa: (id: string) => void }) {
  const subidas = subidasDe(embudo, grupo)
  return <article className={e.etapa} data-hoy={grupo.info.estado !== 'por construir' || undefined}>
    <header>
      <p className={e.etapaCeja}>{grupo.info.tipo === 'piso' ? 'Piso' : 'Oferta'}{grupo.info.estado === 'por construir' && <span className={e.porConstruir}>Por construir</span>}</p>
      <h5 className={e.etapaNombre}>{grupo.info.nombre}</h5>
    </header>
    {grupo.info.frase && <p className={e.que}>{grupo.info.frase}</p>}
    <div className={e.bloque}>
      <p className={e.etiqueta}>Sus etapas</p>
      <ul className={e.conexiones}>{grupo.etapas.map(et => <li key={et.id}><button type="button" className={e.conexion} data-por-construir={!et.opera_hoy || undefined} onClick={() => irAEtapa(et.id)}>
        <span className={e.etapaNum} aria-hidden>{et.orden}</span><span><small>{et.etapa}</small><b>{et.nombre}</b></span><ChevronRight size={13} aria-hidden />
      </button></li>)}</ul>
    </div>
    {subidas.length > 0 && <div className={e.bloque}>
      <p className={e.etiqueta}>Sube a</p>
      <ul className={e.conexiones}>{subidas.map(({ arista: a, hacia }) => <li key={`${a.desde}-${a.hacia}`}><button type="button" className={e.conexion} data-por-construir={/construir/i.test(a.estado) || undefined} onClick={() => irAEtapa(a.hacia)}>
        <ArrowDownRight size={13} aria-hidden /><span><b>{hacia}</b><small>{a.accion ?? ''}{/construir/i.test(a.estado) ? ' · por construir' : a.estado === 'observada' ? ' · observado' : ''}</small></span><ChevronRight size={13} aria-hidden />
      </button></li>)}</ul>
    </div>}
  </article>
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
      <p className={e.fuente}>Se actualiza: {et.mide.frecuencia} · Lo mueve: <b className={e.dueno}>{quien(et.mide.dueno)}</b></p>
      {!et.mide.hay_numero && et.mide.como_medirlo && <p className={e.comoMedirlo}><b>Qué lo mediría:</b> {et.mide.como_medirlo}</p>}
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

function Vacio({ errores, ruta }: { errores?: string[]; ruta: string }) {
  const pedir = () => redactar(errores?.length ? `Corrige mi embudo (${ruta}): ` : 'Arma mi embudo completo en el estándar de Arbrain, con mis skills y rutinas en cada etapa.')
  return <div className={e.vacio}>
    {errores?.length
      ? <><p><b>Tu embudo tiene detalles por corregir.</b> Levy lo arregla en un momento:</p><ul>{errores.map(x => <li key={x}>{x}</li>)}</ul></>
      : <p><b>Tu embudo todavía no está dibujado.</b> Levy lo arma con lo que ya sabe de tu negocio y te pregunta lo que falte.</p>}
    <button className={e.accion} onClick={pedir}>{errores?.length ? 'Pedir la corrección' : 'Pedírselo a Levy'}</button>
  </div>
}
