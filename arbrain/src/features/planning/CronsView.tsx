'use client'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type FullCalendar from '@fullcalendar/react'
import type { RefObject } from 'react'
import { cronDisplayName } from '@/features/calendar/utils/cronProjection'
import type { CronSchedule, CronSnapshot } from './types'
import styles from './planning.module.css'
import { CronTimeline } from './CronTimeline'

function timestamp(value: string | number | null, timeZone?: string) {
  if (!value) return 'Sin registro'
  return new Date(typeof value === 'number' ? value * 1000 : value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone })
}

function resultLabel(status: string, error: string | null) {
  if (error || ['error', 'failed'].includes(status)) return 'Con error'
  if (['success', 'completed', 'ok', 'done'].includes(status)) return 'Completado'
  if (['running', 'in_progress'].includes(status)) return 'En curso'
  if (status === 'pending') return 'Pendiente'
  return 'Sin resultado confirmado'
}

export function CronsView({ range, onRangeChange, calendarRef, reloadKey }: { range: { from: string; to: string }; onRangeChange:(range:{from:string;to:string})=>void; calendarRef:RefObject<FullCalendar|null>; reloadKey:number }) {
  const [data, setData] = useState<CronSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<CronSchedule | null>(null)
  const [output,setOutput]=useState<{id:string;response:string|null;error:string|null}|null>(null)
  const [outputError,setOutputError]=useState<string|null>(null)
  const [selectedRunId,setSelectedRunId]=useState<string|null>(null)
  const selectJob=(job:CronSchedule,runId?:string)=>{setSelectedRunId(runId??null);setSelected(job)}
  const dialog = useRef<HTMLElement>(null)
  useEffect(()=>{
    setOutput(null);setOutputError(null)
    if(!selectedRunId)return
    const controller=new AbortController()
    fetch(`/api/planning/crons/result?${new URLSearchParams({id:selectedRunId})}`,{signal:controller.signal,cache:'no-store'})
      .then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error??'No se pudo cargar la salida.');return body})
      .then(setOutput).catch(e=>{if(!controller.signal.aborted)setOutputError(e.message)})
    return()=>controller.abort()
  },[selectedRunId])

  useEffect(() => {
    if (!selected) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector('button')?.focus()
    return () => previous?.focus()
  }, [selected?.id])
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) setReload(n => n + 1) }, 30_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/planning/crons?${new URLSearchParams(range)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error ?? 'Crons no disponible.'); return body })
      .then(body => { setData(body); setError(null) })
      .catch(err => { if (!controller.signal.aborted) setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [range.from, range.to, reload, reloadKey])
  const runs = data?.runs ?? []
  return <div className={styles.cronSurface} data-cron-surface>
    <CronTimeline data={data} range={range} onRangeChange={onRangeChange} onSelect={selectJob} calendarRef={calendarRef}/>
    {loading && !data && <span className={styles.cronReadNotice} role="status">Cargando crons…</span>}
    {(error || data?.scheduleError || data?.historyError) && <span className={styles.cronReadNotice} role="alert">{error ?? data?.scheduleError ?? data?.historyError}</span>}
    {selected && createPortal(<div className={styles.editorBackdrop}><button className={styles.dismiss} onClick={() => setSelected(null)} aria-label="Cerrar historial" /><section ref={dialog} className={styles.editor} role="dialog" aria-modal="true" aria-label="Historial de automatización" onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSelected(null) }
      if(e.key==='Tab'){const buttons=[...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])];const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
    }}>
      <header className={styles.editorHeader}><div><span className={styles.eyebrow}>AUTOMATIZACIÓN</span><h2>{cronDisplayName(selected.id)}</h2></div><button className={styles.iconButton} onClick={() => setSelected(null)} aria-label="Cerrar"><X size={18} /></button></header>
      <div className={styles.editorForm}><p className={styles.note}>Próxima: {selected.status === 'paused' ? 'Pausada' : timestamp(selected.next_run, data?.timeZone)}</p>
        <h3>{selectedRunId?'Ejecución seleccionada':'Historial del período'}</h3>{selectedRunId&&<button className={styles.secondary} onClick={()=>setSelectedRunId(null)}>Ver historial completo</button>}
        {data?.historyError ? <p className={styles.error}>{data.historyError}</p> : runs.filter(r => r.job_id === selected.id).length === 0 ? <p className={styles.note}>No hay ejecuciones registradas en este período. No implica que nunca haya corrido.</p> : runs.filter(r => r.job_id === selected.id && (!selectedRunId||r.id===selectedRunId)).map(r => <article key={r.id} className={styles.run}>
          <strong>{timestamp(r.created_at)} · {resultLabel(r.status, r.error)}</strong>
          <p className={styles.note}>Duración: {r.duration_ms == null ? 'sin dato' : `${Math.round(r.duration_ms / 1000)} s`}</p>
          {selectedRunId ? <pre>{outputError ?? (output?.id===r.id ? output.error ?? output.response ?? 'Sin salida registrada.' : 'Cargando resultado…')}</pre> : <><p className={styles.note}>{r.error}</p><button className={styles.secondary} onClick={()=>setSelectedRunId(r.id)}>Ver resultado</button></>}
        </article>)}
      </div>
    </section></div>, document.querySelector('[data-planning-calendar]') ?? document.body)}
  </div>
}
