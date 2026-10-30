'use client'
/**
 * El día en el hilo (Cabina v2). Pedido de Daniel (30 sep): «qué tareas tengo
 * hoy… tarjetitas o minimalista como un post-it». Arriba la fecha en la serif de
 * Levy y el reloj con lo que sigue; el riel dibuja la forma del día con el ahora
 * en oro; la agenda atenúa lo que ya pasó; las tareas son post-its que se
 * palomean aquí mismo (Todoist por la pluma del calendario, con deshacer).
 */
import { useEffect, useMemo, useState } from 'react'
import type { PlanningSnapshot, PlanTask } from '@/features/planning/types'
import { etiquetaDia, hoyCivil } from '../model'
import { escalon } from '../movimiento'
import { type Item, porDia, bandaDe, tareasDe, atrasada, minutosCiviles, duracion, faltan, mutarTarea, sinEmoji } from './agenda'
import l from '../luz.module.css'
import { zonaDueno } from '@/shared/lib/zona-dueno'

function useAhora(activo: boolean) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    if (!activo) return
    const t = setInterval(() => setAhora(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [activo])
  return ahora
}

/** Reloj en la zona del dueño (instalación original: México; alumno: la suya). */
const relojFmt = { format: (d: Date | number) => new Intl.DateTimeFormat('es-MX', { timeZone: zonaDueno(), hour: '2-digit', minute: '2-digit', hour12: false }).format(d) }

export function Reloj({ eventos, ahora }: { eventos: Item[]; ahora: number }) {
  const actual = eventos.find(e => e.inicio! <= ahora && ahora < e.fin!)
  const sigue = eventos.find(e => e.inicio! > ahora)
  let linea: React.ReactNode = eventos.length ? 'Tu agenda de hoy terminó.' : 'Nada agendado hoy.'
  if (actual) linea = <>Ahora · <em>{sinEmoji(actual.titulo)}</em> · quedan {duracion(Math.max(1, Math.round((actual.fin! - ahora) / 60000)))}</>
  else if (sigue) linea = <>Sigue · <em>{sinEmoji(sigue.titulo)}</em> {faltan(Math.round((sigue.inicio! - ahora) / 60000))}</>
  return <div className={`${l.reloj} ${l.entra}`} style={escalon(1)}><strong>{relojFmt.format(ahora)}</strong><span>{linea}</span></div>
}

/** La forma del día: tramos agendados sobre un riel y el ahora en oro. */
export function Riel({ eventos, dia, hoy, ahora }: { eventos: Item[]; dia: string; hoy: string; ahora: number }) {
  if (!eventos.length) return null
  const ini = Math.min(6 * 60, ...eventos.map(e => minutosCiviles(e.inicio!)))
  const finDia = Math.max(22 * 60, ...eventos.map(e => { const m = minutosCiviles(e.fin!); return m < minutosCiviles(e.inicio!) ? 24 * 60 : m }))
  const desde = Math.floor(ini / 60) * 60, hasta = Math.min(24 * 60, Math.ceil(finDia / 60) * 60), span = hasta - desde
  const pct = (m: number) => `${Math.max(0, Math.min(100, ((m - desde) / span) * 100))}%`
  const ahoraMin = dia === hoy ? minutosCiviles(ahora) : dia < hoy ? hasta : desde
  const marcas = [0, 1, 2, 3, 4].map(i => desde + Math.round((span * i) / 4 / 60) * 60)
  return <div className={`${l.entra}`} style={escalon(2)} aria-hidden>
    <div className={l.riel}>
      <span className={l.rielBase} />
      {ahoraMin > desde && <span className={`${l.rielPasado} ${l.barraLlena}`} style={{ width: pct(ahoraMin) }} />}
      {eventos.map(e => { const a = minutosCiviles(e.inicio!), b0 = minutosCiviles(e.fin!), b = b0 < a ? 24 * 60 : b0
        return <span key={e.id} className={l.tramoRiel} title={`${e.hora} · ${e.titulo}`} data-pasado={b <= ahoraMin || undefined}
          style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})`, ['--c' as string]: e.color }} /> })}
      {dia === hoy && ahoraMin > desde && ahoraMin < hasta && <span className={l.puntoAhora} style={{ left: pct(ahoraMin) }} />}
    </div>
    <div className={l.horasRiel}>{marcas.map(m => <span key={m}>{String(Math.floor(m / 60) % 24).padStart(2, '0')}:00</span>)}</div>
  </div>
}

export function Agenda({ eventos, dia, hoy, ahora }: { eventos: Item[]; dia: string; hoy: string; ahora: number }) {
  const esHoy = dia === hoy, pasado = dia < hoy
  const actual = esHoy ? eventos.find(e => e.inicio! <= ahora && ahora < e.fin!) : undefined
  const sigue = esHoy && !actual ? eventos.find(e => e.inicio! > ahora) : undefined
  // Hoy, con 3+ bloques ya terminados, se pliegan en una línea (como Hoy en el teléfono y
  // Things): lo que queda manda. Un toque los despliega.
  const terminados = esHoy ? eventos.filter(e => e.fin! <= ahora && e !== actual) : []
  const [verTerminados, setVerTerminados] = useState(false)
  const plegar = terminados.length >= 3 && !verTerminados
  const filas: React.ReactNode[] = []
  if (terminados.length >= 3) filas.push(<button key="terminados" type="button" className={`${l.plegados} ${l.entra}`} style={escalon(3)} aria-expanded={verTerminados} onClick={() => setVerTerminados(v => !v)}>
    {verTerminados ? 'Ocultar lo terminado' : `${terminados.length} bloques terminados`}<span aria-hidden>{verTerminados ? '−' : '+'}</span>
  </button>)
  let lineaPuesta = !esHoy || !!actual
  eventos.forEach((e, i) => {
    if (plegar && terminados.includes(e)) return
    if (!lineaPuesta && e.inicio! > ahora) {
      lineaPuesta = true
      filas.push(<p key="ahora" className={`${l.lineaAhora} ${l.entra}`} style={escalon(3 + i)}>{relojFmt.format(ahora)}</p>)
    }
    const yaPaso = pasado || (esHoy && e.fin! <= ahora)
    filas.push(<p key={e.id} className={`${l.fila} ${l.entra}`} style={{ ...escalon(3 + i), ['--c' as string]: e.color }}
      data-pasado={yaPaso || undefined} data-ahora={e === actual || undefined}>
      <b>{e.hora}</b><i aria-hidden /><span title={e.titulo}>{e.titulo}{e === actual && <span className={l.etiqueta}>ahora</span>}{e === sigue && <span className={`${l.etiqueta} ${l.etiquetaSigue}`}>sigue</span>}</span>
      <small>{duracion(Math.round((e.fin! - e.inicio!) / 60000))}</small>
    </p>)
  })
  if (!lineaPuesta && eventos.length) filas.push(<p key="ahora" className={`${l.lineaAhora} ${l.entra}`} style={escalon(3 + eventos.length)}>{relojFmt.format(ahora)}</p>)
  return <div className={l.agenda}>{filas}</div>
}

const CHECK = <svg viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>

/** Post-its de tareas que se palomean aquí. Optimista, con deshacer y sin perder el
 *  estado si Todoist rechaza (la tarjeta vuelve y se dice por qué). */
export function PostIts({ tareas, dia, ownerId, proyectos, compacto }: { tareas: PlanTask[]; dia: string; ownerId?: string; proyectos: Map<string, string>; compacto?: boolean }) {
  const [hechas, setHechas] = useState<Record<string, 'enviando' | 'hecha'>>({})
  const [ultima, setUltima] = useState<PlanTask | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (!ultima) return; const t = setTimeout(() => setUltima(null), 7000); return () => clearTimeout(t) }, [ultima])
  const visibles = tareas.filter(t => hechas[t.id] !== 'hecha' || t.id === ultima?.id)
  async function palomear(t: PlanTask) {
    if (!ownerId || hechas[t.id]) return
    setError(null); setHechas(h => ({ ...h, [t.id]: 'enviando' }))
    try { await mutarTarea(t, ownerId, 'complete'); setHechas(h => ({ ...h, [t.id]: 'hecha' })); setUltima(t) }
    catch (e) { setHechas(h => { const n = { ...h }; delete n[t.id]; return n }); setError(e instanceof Error ? e.message : 'Todoist no confirmó el cambio.') }
  }
  async function deshacer(t: PlanTask) {
    setUltima(null)
    try { await mutarTarea(t, ownerId!, 'reopen'); setHechas(h => { const n = { ...h }; delete n[t.id]; return n }) }
    catch (e) { setError(e instanceof Error ? e.message : 'No pude reabrirla; ábrela en Todoist.') }
  }
  if (!tareas.length) return <p className={l.vacio}>Sin tareas con fecha {compacto ? 'ese día' : 'para hoy'}.</p>
  return <>
    {error && <p className={l.aviso} role="alert">{error}</p>}
    <div className={l.postits}>
      {visibles.map((t, i) => { const estado = hechas[t.id], proyecto = t.projectId ? proyectos.get(t.projectId) : undefined
        return <article key={t.id} className={`${l.postit} ${estado ? l.postitHecho : ''} ${l.entra}`} style={escalon(i)} data-prio={t.priority && t.priority < 3 ? t.priority : undefined}>
          <button className={l.check} onClick={() => void palomear(t)} disabled={!ownerId || !!estado} aria-label={`Completar «${t.title}»`} title={ownerId ? 'Completar en Todoist' : 'Sin identidad para escribir'}>{CHECK}</button>
          <p className={l.postitTitulo}>{t.url ? <a href={t.url} target="_blank" rel="noreferrer">{t.title}</a> : t.title}</p>
          <p className={l.postitMeta}>
            {t.priority && t.priority < 3 && <span className={l.prio} data-prio={t.priority}>P{t.priority}</span>}
            {proyecto && <span>{proyecto}</span>}
            {atrasada(t, dia) && <span className={l.atrasada}>atrasada</span>}
            {t.recurring && <span title={t.recurrenceText ?? 'Se repite'}>↻</span>}
          </p>
        </article> })}
    </div>
    {ultima && <p className={l.deshacer} role="status"><span>Hecha: «{ultima.title}»{ultima.recurring ? ' · su próxima repetición quedó programada' : ''}</span>
      {!ultima.recurring && <button className={l.enlace} onClick={() => void deshacer(ultima)}>Deshacer</button>}</p>}
  </>
}

export function VistaDia({ data, dia }: { data: PlanningSnapshot; dia: string }) {
  const hoy = hoyCivil(), esHoy = dia === hoy
  const ahora = useAhora(esHoy)
  const { mapa, bandas } = useMemo(() => porDia(data), [data])
  const items = mapa.get(dia) ?? []
  const eventos = items.filter(i => !i.tarea && i.inicio != null)
  const todoElDia = items.filter(i => !i.tarea && i.inicio == null)
  const meta = bandaDe(bandas, dia, 1)
  const tareas = useMemo(() => tareasDe(data, dia, hoy), [data, dia, hoy])
  const proyectos = useMemo(() => new Map(data.projects.map(p => [p.id, p.title])), [data.projects])
  const hechasHoy = esHoy ? (data.completedTasks ?? []).filter(t => t.completedAt && hoyCivil(new Date(t.completedAt)) === dia).length : 0
  const relativo = esHoy ? 'Hoy' : dia === hoyCivil(new Date(Date.now() + 86400000)) ? 'Mañana' : dia === hoyCivil(new Date(Date.now() - 86400000)) ? 'Ayer' : etiquetaDia(dia, { weekday: 'long' })
  return <div>
    <div className={l.heroe}>
      <div className={l.entra} style={escalon(0)}>
        <p className={l.ceja}>{relativo === etiquetaDia(dia, { weekday: 'long' }) ? relativo : <><b>{relativo}</b> · {etiquetaDia(dia, { weekday: 'long' })}</>}</p>
        <h3 className={`${l.titular} ${l.serif}`}>{etiquetaDia(dia, { day: 'numeric' })} <small>de {etiquetaDia(dia, { month: 'long' })}</small></h3>
      </div>
      {esHoy && <Reloj eventos={eventos} ahora={ahora} />}
    </div>
    <Riel eventos={eventos} dia={dia} hoy={hoy} ahora={ahora} />
    {(meta || todoElDia.length > 0) && <div className={`${l.todoElDia} ${l.entra}`} style={escalon(3)}>
      {meta && <span className={l.pastilla} title={meta.titulo}><i aria-hidden /><span>{meta.titulo}</span></span>}
      {todoElDia.map(e => <span key={e.id} className={l.pastilla} title={e.titulo}><i aria-hidden style={{ background: e.color }} /><span>{e.titulo}</span></span>)}
    </div>}
    <div className={l.diaCuerpo}>
      <section aria-label="Agenda">
        {eventos.length ? <Agenda eventos={eventos} dia={dia} hoy={hoy} ahora={ahora} /> : <p className={l.vacio}>Nada agendado {esHoy ? 'hoy' : 'ese día'}.</p>}
      </section>
      <section aria-label="Tareas">
        <div className={l.seccion}><h4>{esHoy ? 'Tareas de hoy' : 'Tareas del día'}</h4><small>{tareas.length || ''}</small>{hechasHoy > 0 && <small className={l.derecha}>{hechasHoy} {hechasHoy === 1 ? 'hecha' : 'hechas'} hoy</small>}</div>
        <PostIts tareas={tareas} dia={dia} ownerId={data.ownerId} proyectos={proyectos} />
      </section>
    </div>
  </div>
}
