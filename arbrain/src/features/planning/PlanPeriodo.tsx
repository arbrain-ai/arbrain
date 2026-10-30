'use client'
import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, Circle, MessageCircle, Plus } from 'lucide-react'
import { useGoals } from '@/features/goals/useGoals'
import { periodTitle, statusLabels } from '@/features/goals/model'
import { focusFor } from '@/features/goals/hoy-model'
import { hasTime } from './model'
import { ESCALAS, type AlcanceObjetivos } from './accesos'
import { HORIZONTE, objetivosDelPeriodo, TITULO_OBJETIVO, TITULO_VACIO } from './plan-periodo'
import type { CalendarMode, PlanTask, PlanningSnapshot } from './types'
import styles from './planning.module.css'

/** Cuántas tareas caben antes de «Ver todas»: el periodo corto pide menos filas. */
const CABEN: Record<AlcanceObjetivos, number> = { dia: 4, semana: 5, mes: 5 }

/**
 * Lo de ARRIBA de la vista unificada Calendario + Objetivos (4 oct 2026, pedido de Daniel): en las tres escalas, la misma estructura.
 * 1) el objetivo del periodo (el registro de objetivos de la vista Objetivos), 2) las tareas del periodo (Todoist, las mismas fuentes
 * del calendario). El calendario y el reporte los pone PlanningCalendar debajo. Sin fuentes nuevas.
 */
export function PlanPeriodo({ alcance, fecha, tareas, snapshot, cargando, ocupado, todoistCaido, modo, onModo, onAbrirTarea, onCompletar, onNueva, onConversar }: {
  alcance: AlcanceObjetivos; fecha: string; tareas: PlanTask[]; snapshot: PlanningSnapshot | null; cargando: boolean; ocupado: boolean; todoistCaido: boolean
  /** Con `onModo` el bloque lleva el selector Día · 4 días · Semana · Mes (en el ancho angosto la barra solo trae el título). */
  modo: CalendarMode; onModo?: (modo: CalendarMode) => void
  onAbrirTarea: (t: PlanTask) => void; onCompletar: (t: PlanTask) => void; onNueva: () => void; onConversar?: (borrador: string) => void
}) {
  const goals = useGoals()
  const [todas, setTodas] = useState(false)
  const propias = useMemo(() => goals.data ? objetivosDelPeriodo(goals.data.goals, alcance, fecha) : [], [goals.data, alcance, fecha])
  // Sin objetivo en el registro, vale el evento del calendario «Objetivo del dia/semana/mes» (Google) de ese periodo.
  const delCalendario = useMemo(() => goals.data && !propias.length
    ? focusFor(goals.data.goals, snapshot, fecha, HORIZONTE[alcance]).filter(f => f.origin === 'calendario') : [], [goals.data, snapshot, fecha, alcance, propias.length])
  // Un día sin objetivo propio lo manda la semana (o el mes): se dice cuál, no un hueco.
  const manda = useMemo(() => {
    if (alcance !== 'dia' || !goals.data || propias.length || delCalendario.length) return null
    return [...focusFor(goals.data.goals, snapshot, fecha, 'week'), ...focusFor(goals.data.goals, snapshot, fecha, 'month')][0] ?? null
  }, [alcance, goals.data, snapshot, fecha, propias.length, delCalendario.length])
  const caben = CABEN[alcance], visibles = todas ? tareas : tareas.slice(0, caben)
  const etiqueta = (t: PlanTask) => {
    const d = parseISO(t.due!)
    return alcance === 'dia' ? (hasTime(t.due) ? format(d, 'HH:mm') : 'Hoy') : `${format(d, 'EEE d', { locale: es }).replace('.', '')}${hasTime(t.due) ? ` · ${format(d, 'HH:mm')}` : ''}`
  }
  const conversar = () => onConversar?.(`Planifiquemos ${periodTitle(HORIZONTE[alcance], fecha)}. Lee los objetivos vigentes con mc-event.py planning (objectives-read), las tareas y el calendario. Quiero definir o ajustar este período contigo. No des por acordado un borrador; confirma conmigo el resultado antes de registrarlo.`)

  return <section className={styles.plan} data-alcance={alcance} aria-label="Objetivo y tareas del periodo">
    {onModo && <div className={styles.escalas} role="group" aria-label="Escala del calendario">
      {ESCALAS.map(e => <button key={e.modo} aria-pressed={modo === e.modo} onClick={() => onModo(e.modo)}>{e.etiqueta}</button>)}
    </div>}
    <div className={styles.planBloques}>
      <div className={styles.planBloque} data-bloque="objetivo">
        <header><h2>{TITULO_OBJETIVO[alcance]}</h2>{onConversar && <button className={styles.planAccion} onClick={conversar} aria-label="Conversar este periodo con Levy"><MessageCircle size={13} aria-hidden /><span>Conversar</span></button>}</header>
        {!goals.data ? <p className={styles.planVacio}>{goals.error ? 'No se pudo leer el plan.' : 'Leyendo objetivos…'}</p>
          : propias.length ? <ul className={styles.objetivos}>{propias.map(g => <li key={g.id} data-state={g.status}>
            <span className={styles.objetivoMarca} aria-hidden>{g.status === 'completed' ? <Check size={11} /> : '•'}</span>
            <span className={styles.objetivoTexto}><b>{g.title}</b>{g.success && alcance !== 'dia' && <small>{g.success}</small>}</span>
            {g.status !== 'agreed' && <em>{statusLabels[g.status]}</em>}
          </li>)}</ul>
          : delCalendario.length ? <ul className={styles.objetivos}>{delCalendario.map(f => <li key={f.id}>
            <span className={styles.objetivoMarca} aria-hidden>•</span>
            <span className={styles.objetivoTexto}><b>{f.title}</b></span><em>Calendario</em>
          </li>)}</ul>
          : manda ? <p className={styles.planVacio}>Sin objetivo propio: manda <b>{manda.title}</b>.</p> : <p className={styles.planVacio}>{TITULO_VACIO[alcance]}</p>}
      </div>
      <div className={styles.planBloque} data-bloque="tareas">
        <header><h2>Tareas</h2>{tareas.length > 0 && <small>{tareas.length}</small>}
          <button className={styles.planAccion} onClick={onNueva} disabled={!snapshot || ocupado} aria-label="Tarea nueva"><Plus size={14} aria-hidden /></button></header>
        {tareas.length === 0 ? <p className={styles.planVacio}>{cargando && !snapshot ? 'Leyendo Todoist…' : todoistCaido ? 'Todoist no se pudo leer.' : 'Sin tareas con fecha en este periodo.'}</p>
          : <ul className={styles.tareas}>{visibles.map(t => <li key={t.id} data-p1={t.priority === 1 || undefined}>
            <button className={styles.tareaCheck} aria-label={`Completar ${t.title}`} disabled={ocupado} onClick={() => onCompletar(t)}><Circle size={22} strokeWidth={2} aria-hidden /></button>
            <button className={styles.tareaCuerpo} onClick={() => onAbrirTarea(t)} title={t.title}><span>{t.title}</span><time>{etiqueta(t)}</time></button>
          </li>)}</ul>}
        {tareas.length > caben && <button className={styles.planMas} onClick={() => setTodas(v => !v)} aria-expanded={todas}>{todas ? 'Ver menos' : `Ver las ${tareas.length}`}</button>}
      </div>
    </div>
  </section>
}
