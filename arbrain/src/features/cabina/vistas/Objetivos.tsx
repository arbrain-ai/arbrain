'use client'
/**
 * El plan en el hilo (Cabina v2). Mes: la meta como titular, una pista con sus
 * semanas y el hoy en oro, y debajo la línea de tiempo de las semanas (la actual
 * respira; tocar una abre su criterio de éxito completo). Semana: la meta, a qué
 * meta del mes sirve y en qué día de los siete vas. Día: las metas del día.
 */
import { useState } from 'react'
import type { Goal, GoalSnapshot } from '@/features/goals/model'
import { statusLabels } from '@/features/goals/model'
import { useFuente } from '../datos'
import { type Alcance, hoyCivil, rangoCalendario, etiquetaDia, sumarDias, inicioMes, finMes } from '../model'
import { escalon } from '../movimiento'
import s from '../cabina.module.css'
import l from '../luz.module.css'

export const URL_OBJETIVOS = '/api/planning/objectives'
const SCOPE: Record<Alcance, Goal['scope']> = { dia: 'day', semana: 'week', mes: 'month' }
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)
const corta = (d: string) => etiquetaDia(d, { day: 'numeric', month: 'short' }).replace('.', '')
const OK = <svg viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>

function Estado({ g }: { g: Goal }) { return <span className={l.estado} data-status={g.status}>{statusLabels[g.status]}</span> }

/** Pista del mes: un tramo por semana (proporcional a sus días dentro del mes) y el hoy. */
function Pista({ desde, hasta, semanas, hoy }: { desde: string; hasta: string; semanas: [string, Goal[]][]; hoy: string }) {
  const total = diasEntre(desde, hasta)
  const tramos = semanas.map(([inicio, gs]) => {
    const a = inicio < desde ? desde : inicio, fin = sumarDias(inicio, 7), b = fin > hasta ? hasta : fin
    const actual = hoy >= inicio && hoy < fin, hecha = gs.every(g => g.status === 'completed')
    const pct = actual ? Math.round((diasEntre(inicio, hoy) + 0.5) / 7 * 100) : 0
    return { inicio, dias: Math.max(1, diasEntre(a, b)), actual, hecha, pct, titulo: gs[0]?.title ?? '' }
  })
  const dentro = hoy >= desde && hoy < hasta
  return <div className={`${l.pista} ${l.entra}`} style={escalon(2)}>
    <div className={l.pistaBarras} aria-hidden>
      {tramos.map(t => <span key={t.inicio} style={{ ['--dias' as string]: t.dias }} data-actual={t.actual || undefined} data-hecha={t.hecha || undefined}>
        {t.actual && <i className={l.relleno} style={{ ['--pct' as string]: `${t.pct}%` }} />}
      </span>)}
    </div>
    {dentro && <span className={l.pistaHoy} style={{ left: `${(diasEntre(desde, hoy) + 0.5) / total * 100}%` }} aria-hidden />}
    <div className={l.pistaEtiquetas}>
      {tramos.map((t, i) => <span key={t.inicio} style={{ ['--dias' as string]: t.dias }} data-actual={t.actual || undefined} title={t.titulo}>S{i + 1} · {corta(t.inicio)}</span>)}
    </div>
  </div>
}

function Nodo({ g, inicio, hoy, i, grande }: { g: Goal; inicio: string; hoy: string; i: number; grande?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const fin = sumarDias(inicio, 6), actual = hoy >= inicio && hoy <= fin
  const largo = (g.success?.length ?? 0) > 140
  return <div className={`${l.nodo} ${l.entra}`} style={escalon(4 + i)} data-status={g.status} data-actual={actual || undefined}>
    <span className={`${l.punto} ${actual ? l.nodoActual : ''}`} aria-hidden>{g.status === 'completed' && OK}</span>
    <div className={l.nodoCuerpo}>
      <button className={l.nodoBoton} onClick={() => setAbierto(v => !v)} aria-expanded={abierto || grande || !largo} disabled={!largo || grande}>
        <span className={l.nodoCab}><small>Semana {i + 1} · {corta(inicio)} – {corta(fin)}</small>{actual && <span className={l.etiqueta}>en curso</span>}{g.status === 'draft' && <Estado g={g} />}</span>
        <span className={l.nodoCab}><h5>{g.title}</h5></span>
      </button>
      {g.success && <p className={l.nodoExito} data-corto={(!abierto && !grande && largo) || undefined}>{g.success}</p>}
      {g.status === 'completed' && g.completionNote && <p className={l.nodoExito}>{g.completionNote}</p>}
    </div>
  </div>
}

/** Metas del periodo y, para un mes, sus semanas: el plan de un vistazo. */
export function VistaObjetivos({ alcance = 'mes', fecha, grande }: { alcance?: Alcance; fecha?: string; grande?: boolean }) {
  const hoy = hoyCivil(), ancla = fecha ?? hoy
  const { data, error } = useFuente<GoalSnapshot>(URL_OBJETIVOS)
  if (!data) return <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{error}</p> : 'Leyendo tus objetivos…'}</div>

  const scope = SCOPE[alcance]
  const { desde, hasta } = alcance === 'mes' ? { desde: inicioMes(ancla), hasta: finMes(ancla) } : rangoCalendario(alcance, ancla)
  const propias = data.goals.filter(g => g.scope === scope && g.start >= desde && g.start < hasta)
  const aviso = error && <p className={l.aviso}>{error} Se muestra la última lectura.</p>

  if (alcance === 'mes') {
    const semanas = data.goals.filter(g => g.scope === 'week' && g.start < hasta && g.end > desde).sort((a, b) => a.start.localeCompare(b.start))
    const grupos = new Map<string, Goal[]>()
    for (const g of semanas) { const l0 = grupos.get(g.start) ?? []; l0.push(g); grupos.set(g.start, l0) }
    const entradas = [...grupos.entries()]
    const total = diasEntre(desde, hasta)
    const cuenta = hoy < desde ? <>Empieza {diasEntre(hoy, desde) === 1 ? <strong>mañana</strong> : <>en <strong>{diasEntre(hoy, desde)} días</strong></>} · {total} días</>
      : hoy >= hasta ? <>Terminó el {corta(sumarDias(hasta, -1))}</>
      : <>Día <strong>{diasEntre(desde, hoy) + 1}</strong> de {total} · quedan {diasEntre(hoy, hasta) - 1} días</>
    const cerradas = semanas.filter(g => g.status === 'completed').length, borrador = semanas.filter(g => g.status === 'draft').length
    return <div>
      {aviso}
      <p className={`${l.ceja} ${l.entra}`} style={escalon(0)}>{etiquetaDia(desde, { month: 'long', year: 'numeric' })} · <b>meta del mes</b></p>
      {propias.length ? propias.map((g, i) => <div key={g.id} className={`${l.meta} ${l.entra}`} style={escalon(1 + i)}>
        <div className={l.cabMeta}><h3 className={`${l.metaTitulo} ${l.serif}`}>{g.title}</h3><Estado g={g} /></div>
        {g.success && <p className={l.metaExito}>{g.success}</p>}
      </div>) : <p className={l.vacio}>Sin meta acordada para {etiquetaDia(desde, { month: 'long' })} todavía.</p>}
      {entradas.length > 0 && <Pista desde={desde} hasta={hasta} semanas={entradas} hoy={hoy} />}
      <p className={`${l.cuentaAtras} ${l.entra}`} style={escalon(3)}>{cuenta}{entradas.length > 0 && <> · {entradas.length} semanas{cerradas ? `, ${cerradas} cumplidas` : ''}{borrador ? `, ${borrador} en planificación` : ''}</>}</p>
      {entradas.length > 0 && <div className={l.linea}>
        {entradas.slice(0, grande ? 8 : 6).map(([inicio, gs], i) => gs.map(g => <Nodo key={g.id} g={g} inicio={inicio} hoy={hoy} i={i} grande={grande} />))}
      </div>}
      {!entradas.length && propias.length > 0 && <p className={l.vacio}>Todavía sin metas semanales dentro del mes.</p>}
    </div>
  }

  if (alcance === 'semana') {
    const dias: string[] = []; for (let d = desde; d < hasta; d = sumarDias(d, 1)) dias.push(d)
    const padres = new Map(data.goals.map(g => [g.id, g]))
    return <div>
      {aviso}
      <p className={`${l.ceja} ${l.entra}`} style={escalon(0)}>Semana del {corta(desde)} al {corta(sumarDias(hasta, -1))} · <b>{dias.includes(hoy) ? `día ${dias.indexOf(hoy) + 1} de 7` : hoy < desde ? 'por empezar' : 'terminada'}</b></p>
      {propias.length ? propias.map((g, i) => { const padre = g.parentId ? padres.get(g.parentId) : data.goals.find(m => m.scope === 'month' && m.start <= g.start && g.start < m.end)
        return <div key={g.id} className={`${l.meta} ${l.entra}`} style={escalon(1 + i)}>
          <div className={l.cabMeta}><h3 className={`${l.metaTitulo} ${l.serif}`}>{g.title}</h3><Estado g={g} /></div>
          {g.success && <p className={l.metaExito}>{g.success}</p>}
          {padre && <p className={l.padre} style={{ marginTop: 10 }}>Sirve a: <b>{padre.title}</b></p>}
        </div> }) : <p className={l.vacio}>Sin meta para esta semana todavía.</p>}
      <div className={`${l.diasSemana} ${l.entra}`} style={escalon(3)} aria-hidden>
        {dias.map(d => <span key={d} data-hoy={d === hoy || undefined} data-pasado={d < hoy || undefined}>{etiquetaDia(d, { weekday: 'short' }).replace('.', '')}<i /></span>)}
      </div>
    </div>
  }

  return <div>
    {aviso}
    <p className={`${l.ceja} ${l.entra}`} style={escalon(0)}>{etiquetaDia(ancla, { weekday: 'long', day: 'numeric', month: 'long' })} · <b>metas del día</b></p>
    {propias.length ? propias.map((g, i) => <div key={g.id} className={`${l.meta} ${l.entra}`} style={escalon(1 + i)}>
      <div className={l.cabMeta}><h3 className={`${l.metaTitulo} ${l.serif}`}>{g.title}</h3><Estado g={g} /></div>
      {g.success && <p className={l.metaExito}>{g.success}</p>}
    </div>) : <p className={l.vacio}>Sin metas para este día. Pídemelas y las dejamos escritas.</p>}
  </div>
}

export function resumenObjetivos(snap: GoalSnapshot | undefined, alcance: Alcance = 'mes', fecha = hoyCivil()) {
  if (!snap) return null
  const desde = alcance === 'mes' ? inicioMes(fecha) : rangoCalendario(alcance, fecha).desde
  const propias = snap.goals.filter(g => g.scope === SCOPE[alcance] && g.start === desde)
  if (!propias.length) return 'sin metas todavía'
  return propias.length === 1 ? `«${propias[0].title.slice(0, 70)}${propias[0].title.length > 70 ? '…' : ''}» · ${statusLabels[propias[0].status].toLowerCase()}` : `${propias.length} metas`
}
