'use client'
/**
 * Una tarea de «Tuyas hoy» abierta (panel-claridad Fase 2, 1 oct 2026).
 * Lee de Todoist lo que el snapshot no trae (descripción completa, proyecto,
 * etiquetas, subtareas, comentarios) y escribe por la pluma de siempre
 * (`/api/planning`): completar, reprogramar y cambiar prioridad.
 */
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Check, MessageSquare } from 'lucide-react'
import type { PlanTask, PlanMutation, MutationResult } from '@/features/planning/types'
import { mutationFor } from '@/features/planning/model'
import { MarkdownMessage } from '@/features/chat/components/MarkdownMessage'
import { useFuente, refrescarCabina } from '../datos'
import { hoyCivil, sumarDias } from '../model'
import { sinEmoji, diaDe } from '../vistas/agenda'
import { abrirEnNavegador, hace } from './datos'
import s from './panel.module.css'

interface Detalle {
  id: string; titulo: string; descripcion: string; prioridad: number; fecha: string | null; recurrente: boolean; repite: string | null
  proyecto: string | null; etiquetas: string[]; hecha: boolean; url: string
  subtareas: { id: string; titulo: string; hecha: boolean }[]; comentarios: { id: string; texto: string; en: string }[]
}

const PRIORIDAD: Record<number, string> = { 1: 'Urgente', 2: 'Alta', 3: 'Media', 4: 'Normal' }
const diaCivil = (f: string) => f.includes('T') ? diaDe.format(new Date(f)) : f.slice(0, 10)
function fechaLegible(f: string | null, hoy: string) {
  if (!f) return 'Sin fecha'
  const d = diaCivil(f), hora = f.includes('T') ? ` · ${new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City' })}` : ''
  if (d === hoy) return `Hoy${hora}`
  if (d === sumarDias(hoy, 1)) return `Mañana${hora}`
  const txt = new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${d < hoy ? 'Venció ' : ''}${txt}${hora}`
}
/** El lunes que viene, en días civiles de México. */
function proximoLunes(hoy: string) { const dia = new Date(hoy + 'T12:00:00Z').getUTCDay(); return sumarDias(hoy, ((8 - dia) % 7) || 7) }

export function DetalleTarea({ tarea, ownerId, onVolver, onHecha }: { tarea: PlanTask; ownerId: string | undefined; onVolver: () => void; onHecha: (t: PlanTask) => void }) {
  const hoy = hoyCivil()
  const lectura = useFuente<Detalle>(`/api/cabina/tarea/${encodeURIComponent(tarea.externalId)}`)
  const [t, setT] = useState(tarea)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [otraFecha, setOtraFecha] = useState(false)
  const d = lectura.data
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onVolver() } }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onVolver])

  const escribir = async (que: string, op: PlanMutation) => {
    if (!ownerId) return
    setGuardando(que); setError(null)
    try {
      const r = await fetch('/api/planning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op), signal: AbortSignal.timeout(100_000) })
      const b = await r.json().catch(() => ({})) as Partial<MutationResult> & { error?: string }
      if (!r.ok) throw new Error(b.error ?? 'Todoist no confirmó el cambio.')
      if (b.task) setT(b.task)
      refrescarCabina(1200)
      return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Todoist no confirmó el cambio.'); return false }
    finally { setGuardando(null) }
  }
  const reprogramar = (fecha: string) => { setOtraFecha(false); void escribir('fecha', mutationFor(t, ownerId ?? '', { title: t.title, due: fecha })) }
  const priorizar = (p: number) => { if (p !== t.priority) void escribir('prioridad', mutationFor(t, ownerId ?? '', { title: t.title, priority: p })) }
  const completar = async () => { if (await escribir('completar', mutationFor(t, ownerId ?? '', {}, 'complete'))) { onHecha(t); onVolver() } }

  const descripcion = (d?.descripcion ?? t.description ?? '').trim()
  const recurrente = d?.recurrente ?? t.recurring
  return <div className={s.detalle}>
    <div className={s.fijadaCabecera}>
      <button className={s.icono} onClick={onVolver} aria-label="Volver a Tareas" title="Volver (Esc)"><ArrowLeft size={15} /></button>
      <div className={s.detalleTitulo}>
        <b title={t.title}>{sinEmoji(t.title)}</b>
        <span>{[d?.proyecto, fechaLegible(t.due, hoy), recurrente ? (d?.repite ? `se repite ${d.repite}` : 'se repite') : null].filter(Boolean).join(' · ')}</span>
      </div>
      <button className={s.icono} onClick={() => void abrirEnNavegador(d?.url ?? t.url ?? `https://app.todoist.com/app/task/${t.externalId}`)} title="Abrir en Todoist" aria-label="Abrir en Todoist"><ArrowUpRight size={15} /></button>
    </div>

    <div className={s.tareaAcciones}>
      <button className={s.tareaCompletar} onClick={() => void completar()} disabled={!ownerId || !!guardando}><Check size={14} aria-hidden />{guardando === 'completar' ? 'Completando…' : 'Completar'}</button>
    </div>
    {error && <p className={s.aviso}>{error}</p>}

    <section className={s.tareaBloque} aria-label="Fecha">
      <h4>Fecha</h4>
      <div className={s.opciones}>
        <button data-activa={t.due && diaCivil(t.due) === hoy || undefined} onClick={() => reprogramar(hoy)} disabled={!!guardando}>Hoy</button>
        <button data-activa={t.due && diaCivil(t.due) === sumarDias(hoy, 1) || undefined} onClick={() => reprogramar(sumarDias(hoy, 1))} disabled={!!guardando}>Mañana</button>
        <button onClick={() => reprogramar(proximoLunes(hoy))} disabled={!!guardando}>El lunes</button>
        {otraFecha
          ? <input type="date" className={s.fechaInput} min={hoy} autoFocus onChange={e => e.target.value && reprogramar(e.target.value)} aria-label="Otra fecha" />
          : <button onClick={() => setOtraFecha(true)} disabled={!!guardando}>Otra…</button>}
      </div>
      {guardando === 'fecha' && <small className={s.guardando}>Guardando en Todoist…</small>}
    </section>

    <section className={s.tareaBloque} aria-label="Prioridad">
      <h4>Prioridad</h4>
      <div className={s.opciones}>
        {[1, 2, 3, 4].map(p => <button key={p} data-activa={t.priority === p || undefined} data-prioridad={p} onClick={() => priorizar(p)} disabled={!!guardando}><i aria-hidden />{PRIORIDAD[p]}</button>)}
      </div>
      {guardando === 'prioridad' && <small className={s.guardando}>Guardando en Todoist…</small>}
    </section>

    {descripcion && <section className={s.tareaBloque} aria-label="Descripción"><h4>Descripción</h4><div className={s.lecturaCorta}><MarkdownMessage content={descripcion} /></div></section>}
    {!!d?.etiquetas.length && <section className={s.tareaBloque} aria-label="Etiquetas"><h4>Etiquetas</h4><div className={s.etiquetas}>{d.etiquetas.map(e => <span key={e}>{e}</span>)}</div></section>}
    {!!d?.subtareas.length && <section className={s.tareaBloque} aria-label="Subtareas"><h4>Subtareas · {d.subtareas.filter(x => x.hecha).length}/{d.subtareas.length}</h4>
      <ul className={s.subtareas}>{d.subtareas.map(x => <li key={x.id} data-hecha={x.hecha || undefined}><span className={x.hecha ? s.checkHecho : s.checkVacio}>{x.hecha && <Check size={10} strokeWidth={3} />}</span>{x.titulo}</li>)}</ul></section>}
    {!!d?.comentarios.length && <section className={s.tareaBloque} aria-label="Comentarios"><h4>Comentarios · {d.comentarios.length}</h4>
      {d.comentarios.map(c => <div key={c.id} className={s.comentario}><MessageSquare size={12} aria-hidden /><div><MarkdownMessage content={c.texto} /><small>{c.en ? hace(c.en) : ''}</small></div></div>)}</section>}
    {lectura.error && <p className={s.nota}>No pude leer el detalle completo de Todoist ({lectura.error}). Lo de arriba sale del calendario.</p>}
    {!d && !lectura.error && <p className={s.nota}>Leyendo el detalle en Todoist…</p>}
  </div>
}
