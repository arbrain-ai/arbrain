'use client'
/**
 * Rutinas en el panel (4 oct 2026, pedido de Daniel: «no tenemos las rutinas aquí mismo en el panel»):
 * versión compacta de la sección /rutinas, lo que corre solo, cuándo y cómo le fue. Lee la misma
 * fuente (/api/planning/crons) y usa la misma lógica (`estado`, `cuando`, `hace` de features/rutinas);
 * aquí no se opera nada. «Expandir» lleva a la sección completa.
 */
import type { CronSnapshot } from '@/features/planning/types'
import { nombreRutina } from '@/features/rutinas/catalogo'
import { cuando, estado, hace, type Estado } from '@/features/rutinas/model'
import { useFuente } from '../datos'
import s from '../cabina.module.css'
import l from '../luz.module.css'
import r from './rutinas.module.css'

const DIAS = 8
/** La ventana se redondea a la hora: la URL es la clave de la caché compartida y no debe cambiar en cada render. */
export function urlRutinas() {
  const to = Math.ceil(Date.now() / 3_600_000) * 3_600_000
  return `/api/planning/crons?${new URLSearchParams({ from: new Date(to - DIAS * 86_400_000).toISOString(), to: new Date(to).toISOString() })}`
}
const ICONO: Record<Estado['tono'], string> = { ok: '✓', error: '!', curso: '•', pausada: 'Ⅱ', 'sin-dato': '–' }
const MAX_FILAS = 8

function filasDe(d: CronSnapshot) {
  const todas = d.jobs.map(job => ({ job, e: estado(job, d.runs) }))
  return { activas: todas.filter(f => f.e.tono !== 'pausada'), pausadas: todas.filter(f => f.e.tono === 'pausada').length, atencion: todas.filter(f => f.e.tono === 'error') }
}

export function VistaRutinas({ grande }: { grande?: boolean }) {
  const { data, error } = useFuente<CronSnapshot>(urlRutinas())
  if (!data) return <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{error}</p> : 'Leyendo tus rutinas…'}</div>
  const { activas, pausadas, atencion } = filasDe(data), now = Date.now(), tz = data.timeZone
  const resto = activas.filter(f => f.e.tono !== 'error'), tope = grande ? resto.length : MAX_FILAS
  const fila = (f: (typeof activas)[number]) => <li key={f.job.id} className={r.fila} data-tono={f.e.tono}>
    <b className={r.marca} aria-hidden="true">{ICONO[f.e.tono]}</b>
    <span className={r.texto}><strong>{nombreRutina(f.job.id)}</strong><small>{cuando(f.job.schedule)} · {f.e.texto.toLowerCase()} {hace(f.e.ms, now, tz)}</small></span>
  </li>
  return <div>
    <p className={`${l.ceja} ${l.entra}`}>Sistema · <b>lo que corre solo</b></p>
    {(error || data.scheduleError) && <p className={l.aviso}>{error ?? data.scheduleError}</p>}
    <div className={r.resumen} role="status">
      <div><strong>{activas.length}</strong><span>trabajando</span></div>
      <div data-tono={atencion.length ? 'error' : 'ok'}><strong>{atencion.length}</strong><span>{atencion.length === 1 ? 'necesita atención' : 'necesitan atención'}</span></div>
      <div><strong>{pausadas}</strong><span>en pausa</span></div>
    </div>
    {atencion.length > 0 && <><div className={l.seccion}><h4>Necesitan atención</h4></div><ul className={r.lista}>{atencion.map(fila)}</ul></>}
    {resto.length > 0 && <><div className={l.seccion}><h4>Corren solas</h4></div><ul className={r.lista}>{resto.slice(0, tope).map(fila)}</ul>
      {resto.length > tope && <p className={l.fuente}>y {resto.length - tope} más en la sección completa (expandir).</p>}</>}
    {!data.jobs.length && <p className={l.vacio}>No hay rutinas en la lectura del scheduler.</p>}
  </div>
}

export function resumenRutinas(d: CronSnapshot | undefined) {
  if (!d) return null
  const { activas, atencion } = filasDe(d)
  return `${activas.length} ${activas.length === 1 ? 'rutina' : 'rutinas'}${atencion.length ? `, ${atencion.length} con atención` : ', todas sin fallos'}`
}
