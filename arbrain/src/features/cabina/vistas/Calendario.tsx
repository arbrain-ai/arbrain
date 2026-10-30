'use client'
import { useMemo, useState } from 'react'
import type { PlanningSnapshot } from '@/features/planning/types'
import { useFuente } from '../datos'
import { type Alcance, hoyCivil, rangoCalendario, isoMx, sumarDias, etiquetaDia, inicioMes, finMes as finMesCivil } from '../model'
import { type Item, type Banda, porDia } from './agenda'
import { VistaDia } from './Dia'
import { VistaSemana } from './Semana'
import s from '../cabina.module.css'
import l from '../luz.module.css'

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function urlCalendario(alcance: Alcance, fecha: string) {
  const { desde, hasta } = rangoCalendario(alcance, fecha)
  // El día cuenta lo que ya palomeaste hoy («3 hechas hoy»).
  return `/api/planning?${new URLSearchParams({ from: isoMx(desde), to: isoMx(hasta), ...(alcance === 'dia' ? { includeCompleted: 'true' } : {}) })}`
}

function BandaSemana({ bandas, desde }: { bandas: Banda[]; desde: string }) {
  // Las metas reales se enciman unos días (una termina el viernes, otra empieza
  // ese mismo viernes): la fila muestra la que MÁS días cubre, no las dos.
  const hasta = sumarDias(desde, 7)
  const cubre = (b: Banda) => { let n = 0; for (let d = desde; d < hasta; d = sumarDias(d, 1)) if (b.desde <= d && d < b.hasta) n++; return n }
  const aqui = bandas.map(b => ({ b, n: cubre(b) })).filter(x => x.n > 0).sort((x, y) => y.n - x.n).slice(0, 1).map(x => x.b)
  if (!aqui.length) return null
  return <div className={s.banda}>{aqui.map(b => <span key={b.id} title={b.titulo}><i style={{ background: b.color }} aria-hidden />{b.titulo}</span>)}</div>
}
const prioridad = (l: Item[]) => [...l.filter(i => !i.tarea)].sort((a, b) => a.peso - b.peso || a.orden - b.orden)

function Chip({ it, compacto }: { it: Item; compacto?: boolean }) {
  return <span className={`${s.chip} ${it.objetivo ? s.chipObjetivo : ''} ${it.peso >= 3 ? s.chipRutina : ''}`} title={`${it.hora ? it.hora + ' · ' : ''}${it.titulo}`}>
    <i style={{ background: it.color }} aria-hidden />{!compacto && <>{it.hora && <b>{it.hora}</b>}<span>{it.titulo}</span></>}
  </span>
}

export function VistaCalendario({ alcance = 'semana', fecha, grande }: { alcance?: Alcance; fecha?: string; grande?: boolean }) {
  const hoy = hoyCivil(), ancla = fecha ?? hoy
  const { data, error, cargando } = useFuente<PlanningSnapshot>(urlCalendario(alcance, ancla))
  const { mapa: dias, bandas, tramos } = useMemo(() => porDia(data), [data])
  const { desde, hasta } = rangoCalendario(alcance, ancla)
  const [elegido, setElegido] = useState<string | null>(null)
  const caidas = data?.health.filter(h => h.state !== 'fresh') ?? []

  if (!data) return <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{error}</p> : 'Leyendo tu calendario…'}</div>

  const aviso = <>{caidas.length > 0 && <p className={s.aviso}>{caidas.length === 1 ? 'Una fuente' : `${caidas.length} fuentes`} sin leer ahora; lo que ves puede estar incompleto.</p>}{error && <p className={s.aviso}>{error} Se muestra la última lectura.</p>}</>

  if (alcance === 'dia') return <div className={s.cal} data-refreshing={cargando || undefined}>{aviso}<VistaDia data={data} dia={ancla} /></div>
  if (alcance === 'semana') return <div className={s.cal} data-refreshing={cargando || undefined}>{aviso}<VistaSemana data={data} ancla={ancla} grande={grande} /></div>

  const lista: string[] = []
  for (let d = desde; d < hasta; d = sumarDias(d, 1)) lista.push(d)

  const mes = inicioMes(ancla).slice(0, 7), max = grande ? 5 : 3
  const sel = elegido ?? (lista.includes(hoy) && hoy.startsWith(mes) ? hoy : null)
  const semanas: string[][] = []
  for (let i = 0; i < lista.length; i += 7) semanas.push(lista.slice(i, i + 7))
  const multi = new Set(tramos.map(t => t.id))
  // En el mes solo se ve lo que NO se repite: la rutina queda como un conteo
  // tenue (el crítico ciego: la jerarquía sale de quitar, no de atenuar).
  const señal = (items: Item[]) => prioridad(items).filter(it => it.peso < 3 && !multi.has(it.id))
  const resumenMes = resumenCalendario(data, 'mes', ancla)
  return <div className={s.cal} data-refreshing={cargando || undefined}>{aviso}
    <div className={l.entra} style={{ marginBottom: 12 }}>
      <p className={l.ceja}>{etiquetaDia(inicioMes(ancla), { year: 'numeric' })}{resumenMes ? <> · {resumenMes}</> : null}</p>
      <h3 className={`${l.titular} ${l.serif}`} style={{ textTransform: 'capitalize' }}>{etiquetaDia(inicioMes(ancla), { month: 'long' })}</h3>
    </div>
    <div className={s.mes} role="grid" aria-label="Mes">
      <div className={s.filaDias}>{DIAS.map((d, i) => <span key={i} className={s.cabDia} role="columnheader">{d}</span>)}</div>
      {semanas.map(sem => {
        const fin = sumarDias(sem[0], 7)
        const barras = tramos.filter(t => t.desde < fin && t.hasta > sem[0])
        return <div key={sem[0]} className={s.semanaMes} role="row">
          <BandaSemana bandas={bandas} desde={sem[0]} />
          {barras.length > 0 && <div className={s.filaTramos}>{barras.map(t => { const ini = Math.max(0, lista.indexOf(t.desde < sem[0] ? sem[0] : t.desde) - lista.indexOf(sem[0])), ult = Math.min(7, t.hasta >= fin ? 7 : lista.indexOf(t.hasta) - lista.indexOf(sem[0]))
            return <div key={t.id} className={s.tramo} style={{ gridColumn: `${ini + 1} / ${ult + 1}`, ['--c' as string]: t.color }} title={t.titulo}><span>{t.titulo}</span></div> })}</div>}
          <div className={s.filaCeldas}>{sem.map(d => { const items = dias.get(d) ?? [], ev = señal(items), rutina = items.filter(i => !i.tarea && i.peso >= 3).length, tareas = items.filter(i => i.tarea).length
            return <button key={d} role="gridcell" aria-selected={sel === d} onClick={() => setElegido(d === sel ? null : d)}
              className={`${s.celda} ${d.startsWith(mes) ? '' : s.fuera} ${d === hoy ? s.hoy : ''} ${sel === d ? s.sel : ''} ${ev.length ? s.conSeñal : ''}`}>
              <span className={s.num}>{Number(d.slice(8))}</span>
              <span className={s.chips}>{ev.slice(0, max).map(it => <Chip key={it.id} it={it} />)}{ev.length > max && <span className={s.mas}>+{ev.length - max}</span>}</span>
              <span className={s.puntos} aria-hidden>{ev.slice(0, 3).map(it => <i key={it.id} style={{ background: it.color }} />)}</span>
              {tareas > 0 && <span className={s.rutina} title={`${tareas} ${tareas === 1 ? 'tarea' : 'tareas'}${rutina ? ` · ${rutina} bloques de rutina` : ''}`}>{tareas} {tareas === 1 ? 'tarea' : 'tareas'}</span>}
            </button> })}</div>
        </div> })}
    </div>
    <Destacados dias={lista.filter(d => d.startsWith(mes))} mapa={dias} tramos={tramos} multi={multi} />
    {sel && <div className={s.listaDia}><VistaDia data={data} dia={sel} /></div>}
  </div>
}

/** Lo inusual del mes con fecha y nombre. En el teléfono la celda solo cabe un
 *  punto: esta lista es la que dice QUÉ pasa el 15 y cuándo corre la ventana. */
function Destacados({ dias, mapa, tramos, multi }: { dias: string[]; mapa: Map<string, Item[]>; tramos: Banda[]; multi: Set<string> }) {
  const filas: { clave: string; cuando: string; titulo: string; color: string }[] = []
  const corta = (d: string) => etiquetaDia(d, { weekday: 'short', day: 'numeric' })
  for (const t of tramos) if (t.hasta > dias[0] && t.desde <= dias[dias.length - 1]) filas.push({ clave: t.desde + t.id, cuando: `${corta(t.desde)} – ${corta(sumarDias(t.hasta, -1))}`, titulo: t.titulo, color: t.color })
  for (const d of dias) for (const it of (mapa.get(d) ?? []).filter(i => !i.tarea && i.peso < 3 && !multi.has(i.id))) filas.push({ clave: d + it.id, cuando: `${corta(d)}${it.hora ? ` · ${it.hora}` : ''}`, titulo: it.titulo, color: it.color })
  filas.sort((a, b) => a.clave.localeCompare(b.clave))
  if (!filas.length) return null
  return <section className={s.destacados} aria-label="Lo que destaca del mes">
    <h4>Lo que destaca</h4>
    {filas.slice(0, 8).map(f => <p key={f.clave}><i style={{ background: f.color }} aria-hidden /><b>{f.cuando}</b><span>{f.titulo}</span></p>)}
  </section>
}

/** Lo que dice la vista dormida: humano, sin jerga («46 eventos (4 únicos)» no le sirve a nadie). */
export function resumenCalendario(snap: PlanningSnapshot | undefined, alcance: Alcance = 'semana', fecha = hoyCivil()) {
  if (!snap) return null
  const { desde, hasta } = alcance === 'mes' ? { desde: inicioMes(fecha), hasta: finMesCivil(fecha) } : rangoCalendario(alcance, fecha)
  const { mapa } = porDia(snap)
  let unicos = 0, tareas = 0
  for (const [d, items] of mapa) if (d >= desde && d < hasta) for (const it of items) { if (it.tarea) tareas++; else if (!it.recurrente && !it.objetivo) unicos++ }
  const partes = [unicos ? `${unicos} ${unicos === 1 ? 'compromiso' : 'compromisos'} fuera de la rutina` : 'solo rutina', tareas ? `${tareas} ${tareas === 1 ? 'tarea' : 'tareas'}` : 'sin tareas con fecha']
  return partes.join(' · ')
}
