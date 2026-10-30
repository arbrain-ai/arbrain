'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useFuente, refrescarCabina } from '../datos'
import type { Alcance } from '../model'
import s from '../cabina.module.css'

const MarkdownMessage = dynamic(() => import('@/features/chat/components/MarkdownMessage').then(m => m.MarkdownMessage), { loading: () => <p className={s.vacio}>…</p> })

interface Reporte { runId: string; jobId: string; at: string; reentrega: boolean; texto: string; avisoId: string | null; leido: boolean }
interface Aviso { id: string; created_at: string; kind: string; source: string; title: string; body: string | null; url: string | null }
interface Datos { alcance: string; avisos: Aviso[]; reportes: Reporte[]; sinLeer: number; leidoEn: string }

const NOMBRE: Record<string, string> = { 'morning-briefing': 'Reporte diario', 'evening-reflection': 'Cierre del día', 'business-council': 'Reporte semanal', 'monthly-review': 'Reporte mensual' }
const TIPO: Record<string, string> = { agenda: 'Agenda', dinero: 'Dinero', agente: 'Agente', persona: 'Persona', alerta: 'Alerta', otro: 'Aviso' }
const cuando = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const urlReporte = (a?: Alcance) => `/api/cabina/reporte?alcance=${a === 'dia' ? 'hoy' : a === 'semana' ? 'semana' : 'pendiente'}`

async function marcar(ids: string[]) {
  await fetch('/api/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
  refrescarCabina(0)
}

/** Lo principal de un reporte: el primer punto de «Atención» (o la primera
 *  frase en negritas). Sale del texto del reporte, no se inventa. */
export function principal(texto: string): string | null {
  const l = texto.split('\n')
  const iAt = l.findIndex(x => /atenci[oó]n/i.test(x))
  const zona = iAt >= 0 ? l.slice(iAt + 1) : l
  const item = zona.find(x => /^\s*(\d+\.|[-*])\s+\S/.test(x)) ?? zona.find(x => /\*\*[^*]{4,}\*\*/.test(x))
  if (!item) return null
  const t = item.replace(/^\s*(\d+\.|[-*])\s+/, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim()
  return t.length > 180 ? t.slice(0, 180).replace(/\s\S*$/, '') + '…' : t
}

function atender(r: Reporte, top: string | null) {
  const nombre = `${NOMBRE[r.jobId] ?? r.jobId} del ${cuando(r.at)}`
  window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto: `Atiende el ${nombre}${top ? `: empieza por «${top}»` : ''}. Dime qué propones antes de tocar nada.` } }))
}

function Tarjeta({ r }: { r: Reporte }) {
  const [abierto, setAbierto] = useState(false)
  const top = principal(r.texto)
  return <article className={`${s.reporte} ${r.leido ? s.reporteLeido : ''}`}>
    <header>
      <span className={s.reporteTipo}>{NOMBRE[r.jobId] ?? r.jobId}</span>
      <span className={s.reporteCuando}>{cuando(r.at)}</span>
      {r.reentrega && <span className={s.reentrega} title="Se generó a su hora pero no llegó; se reentregó">reentrega</span>}
    </header>
    {top && <p className={s.principal} title={top}>{top}</p>}
    {abierto && <div className={s.reporteTexto}><MarkdownMessage content={r.texto} /></div>}
    <footer>
      <button className={s.accionSec} onClick={() => setAbierto(v => !v)}>{abierto ? 'Contraer' : 'Leer completo'}</button>
      <button className={s.accionSec} onClick={() => atender(r, top)}>Atiéndelo con Levy</button>
      {!r.leido && r.avisoId && <button className={s.accionSec} onClick={() => void marcar([r.avisoId!])}>Marcar leído</button>}
    </footer>
  </article>
}

/** Lo que llegó: reportes de los crons con su texto y los demás avisos sin leer. */
export function VistaReporte({ alcance }: { alcance?: Alcance; grande?: boolean }) {
  const { data, error } = useFuente<Datos>(urlReporte(alcance))
  if (!data) return <div className={s.cargando} aria-busy="true">{error ? <p className={s.aviso}>{error}</p> : 'Revisando lo que llegó…'}</div>
  const pendientes = [...data.reportes.filter(r => !r.leido && r.avisoId).map(r => r.avisoId!), ...data.avisos.map(a => a.id)]
  const sinLeer = data.reportes.filter(r => !r.leido), leidos = data.reportes.filter(r => r.leido)
  return <div className={s.llegado}>
    {error && <p className={s.aviso}>{error} Se muestra la última lectura.</p>}
    <p className={s.llegadoResumen}>
      {data.sinLeer ? <><strong>{data.sinLeer}</strong> sin leer</> : 'Nada pendiente'}
      {pendientes.length > 1 && <button className={s.accionSec} onClick={() => void marcar(pendientes)}>Marcar todo leído</button>}
    </p>
    {sinLeer.map(r => <Tarjeta key={r.runId} r={r} />)}
    {leidos.length > 0 && <details className={s.anteriores}>
      <summary>{leidos.length} {leidos.length === 1 ? 'anterior' : 'anteriores'}</summary>
      <div>{leidos.map(r => <Tarjeta key={r.runId} r={r} />)}</div>
    </details>}
    {data.avisos.length > 0 && <section className={s.otrosAvisos} aria-label="Otros avisos">
      <h4>También llegó</h4>
      {data.avisos.map(a => <p key={a.id}>
        <span className={s.avisoTipo}>{TIPO[a.kind] ?? a.kind}</span>
        <span><b>{a.title}</b>{a.body && <small>{a.body.replace(/\s+/g, ' ').slice(0, 160)}</small>}</span>
        <em>{cuando(a.created_at)}</em>
      </p>)}
    </section>}
    {!sinLeer.length && !data.avisos.length && <p className={s.vacio}>Todo lo que llegó ya está leído.</p>}
  </div>
}

export function resumenReporte(d: Datos | undefined) {
  return d ? (d.sinLeer ? `${d.sinLeer} sin leer` : 'nada pendiente') : null
}
