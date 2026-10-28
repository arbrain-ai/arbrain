'use client'
import { useEffect, useRef, useState } from 'react'
import { Check, X, Minus, Undo2 } from 'lucide-react'
import { habitDisplayName, realHabitName } from '@/features/sistema/habit-presentation'
import { NombreHabito } from '@/features/sistema/NombreHabito'
import { HABIT_SHORTCUTS, habitKey, isHabitTypingTarget } from '@/features/sistema/habit-shortcuts'
import { shiftDay } from '@/features/sistema/calendar-days'
import type { useHabitRecords } from '@/features/sistema/useHabitRecords'
import styles from './todotask.module.css'
export type HabitController = ReturnType<typeof useHabitRecords>
const label = (state: boolean | null | undefined) => state === true ? 'Cumplido' : state === false ? 'No cumplido' : 'Sin registro'
function Mark({ state }: { state: boolean | null | undefined }) { return state === true ? <Check size={14}/> : state === false ? <X size={14}/> : <Minus size={10}/> }

/** `acepta` (4 oct 2026): con Objetivos en la sección y en el panel a la vez, cada uno decide qué teclas son suyas. */
export function HabitKeys({ habits, today, enabled, acepta }: { habits:HabitController; today:string; enabled:boolean; acepta?: (target: EventTarget | null) => boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!enabled || !habits.data || habits.loading || document.querySelector('[role="dialog"], dialog[open]') || isHabitTypingTarget(event.target) || (acepta && !acepta(event.target))) return
      const key = habitKey(event)
      if (!key || !habits.data.habitos.some(h => h.clave === key)) return
      event.preventDefault(); habits.toggle(today, key, 'keyboard')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, habits.data, habits.loading, habits.toggle, today, acepta])
  return null
}
export function HabitFeedback({ habits }: { habits:HabitController }) {
  return <div className={styles.feedback} aria-live="polite">
    <span>{habits.error ?? (habits.saving ? 'Guardando…' : habits.notice)}</span>
    {habits.pending.length > 0 && !habits.saving && <button onClick={() => void habits.retry()}>Reintentar marca</button>}
    {habits.canUndo && <button onClick={habits.undoLast}><Undo2 size={13}/> Deshacer</button>}
  </div>
}
export function HabitStrip({ habits, today }: { habits:HabitController; today:string }) {
  return <section className={styles.habitSection} aria-label="Hábitos de hoy">
    <div className={styles.sectionHeading}><h2>Los hábitos, hoy</h2><a href="/todotask?view=habits">Ver continuidad ↗</a></div>
    <p className={styles.shortcutHint}>Usa la tecla de cada hábito. Pulsa de nuevo para retirar la marca.</p>
    {!habits.data ? <p className={styles.muted}>{habits.loading ? 'Leyendo hábitos…' : 'No se pudieron cargar los hábitos.'}</p> :
      <div className={styles.habitStrip}>{habits.data.habitos.map(h => {
        const state = habits.record(today,h.clave)?.hecho
        const displayName = habitDisplayName(h,today)
        return <button key={h.clave} className={styles.habitChip} data-state={state === true ? 'done' : state === false ? 'missed' : 'empty'}
          aria-label={`${displayName}: ${label(state)}`} aria-pressed={state === true} onClick={() => habits.toggle(today,h.clave)}>
          <span className={styles.check}><Mark state={state}/></span><NombreHabito clave={h.clave} nombre={realHabitName(h,today)} tocable={false}/><kbd>{HABIT_SHORTCUTS[h.clave]}</kbd>
        </button>
      })}</div>}
    <HabitFeedback habits={habits}/>
  </section>
}

export function HabitGrid({ habits, from, to, today }: { habits:HabitController; from:string; to:string; today:string }) {
  const [cell,setCell] = useState<{date:string;clave:string} | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!cell) return
    opener.current = document.activeElement as HTMLElement
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (e:KeyboardEvent) => {
      if (e.key === 'Escape') setCell(null)
      if (e.key === 'Tab') {
        const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        const first=buttons[0], last=buttons.at(-1)
        if (e.shiftKey && document.activeElement===first) {e.preventDefault();last?.focus()}
        else if (!e.shiftKey && document.activeElement===last) {e.preventDefault();first?.focus()}
      }
    }
    window.addEventListener('keydown',onKey)
    return () => {window.removeEventListener('keydown',onKey);opener.current?.focus()}
  }, [cell])
  const days:string[]=[]
  for(let d=from;d<=to;d=shiftDay(d,1)) days.push(d)
  const catalog = (habits.data?.catalog ?? []).filter(h => h.activo || habits.data?.records.some(r => r.habito_clave === h.clave && r.fecha >= from && r.fecha <= to))
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = scroll.current
      if (!node) return
      const current = node.querySelector<HTMLElement>('thead [data-today=true]')
      const sticky = node.querySelector<HTMLElement>('th')?.getBoundingClientRect().width ?? 0
      node.scrollLeft = current ? current.getBoundingClientRect().left - node.getBoundingClientRect().left + node.scrollLeft - sticky - (node.clientWidth - sticky) / 2 : 0
    })
    return () => cancelAnimationFrame(frame)
  }, [from, to, today, catalog.length])
  const selected = cell && habits.record(cell.date,cell.clave)
  return <>
    <div className={styles.gridLegend}><span>✓ Cumplido</span><span>× No cumplido</span><span>– Sin registro</span><span>Los huecos no cuentan como fallos.</span></div>
    {from<=today&&to>=today&&<p className={styles.shortcutHint}>Las teclas junto a cada hábito marcan hoy. Para otra fecha, selecciona su casilla.</p>}
    <div ref={scroll} className={styles.habitGridScroll}><table className={styles.habitGrid}>
      <thead><tr><th>Hábito</th>{days.map(day=><th key={day} data-today={day===today}><span>{new Date(`${day}T12:00:00`).toLocaleDateString('es-MX',{weekday:'narrow'})}</span>{Number(day.slice(-2))}</th>)}</tr></thead>
      <tbody>{catalog.map(h=><tr key={h.clave} data-inactive={!h.activo}><th><NombreHabito clave={h.clave} nombre={h.nombre}/>{!h.activo && <small>Inactivo · historia conservada</small>}{h.activo && <kbd>{HABIT_SHORTCUTS[h.clave]}</kbd>}</th>{days.map(day=>{
        const state=habits.record(day,h.clave)?.hecho
        return <td key={day} data-today={day===today} data-future={day>today}><button disabled={day>today} data-state={state===true?'done':state===false?'missed':'empty'} aria-label={`${habitDisplayName(h,day)}, ${day}: ${day>today?'Día futuro':label(state)}`} onClick={()=>setCell({date:day,clave:h.clave})}>{day<=today&&<Mark state={state}/>}</button></td>
      })}</tr>)}</tbody>
    </table></div>
    {!habits.loading && !catalog.length && <p className={styles.muted}>No se pudo cargar el catálogo.</p>}
    {habits.data && !habits.loading && <div className={styles.periodSummary}><strong>Este período</strong>{(()=>{
      const observed=habits.data.records.filter(r=>r.fecha>=from&&r.fecha<=to&&r.hecho!==null)
      return observed.length?<><span>{new Set(observed.map(r=>r.fecha)).size} días con registro</span><span>{observed.filter(r=>r.hecho===true).length} cumplidos</span><span>{observed.filter(r=>r.hecho===false).length} no cumplidos</span></>:<span>Sin observaciones registradas. El pasado queda abierto, no marcado como fallo.</span>
    })()}</div>}
    <HabitFeedback habits={habits}/>
    {cell && <div className={styles.backdrop} onClick={()=>setCell(null)}><div ref={dialog} className={styles.cellDialog} role="dialog" aria-modal="true" aria-label="Registro de hábito" onClick={e=>e.stopPropagation()}>
      <div className={styles.sectionHeading}><h2>{(()=>{const h=catalog.find(h=>h.clave===cell.clave);return h?<NombreHabito clave={h.clave} nombre={h.nombre}/>:null})()}</h2><button aria-label="Cerrar registro" onClick={()=>setCell(null)}><X size={18}/></button></div>
      <p>{new Date(`${cell.date}T12:00:00`).toLocaleDateString('es-MX',{dateStyle:'full'})}</p>
      <strong>{label(selected?.hecho)}</strong>
      <p className={styles.muted}>{selected?.source === 'legacy' ? 'Registro histórico · procedencia no disponible' : selected ? `Origen: ${selected.source}` : 'Aún no hay una observación de este día.'}</p>
      {selected?.updated_at && <small>{new Date(selected.updated_at).toLocaleString('es-MX')}</small>}
      {selected?.evidence && <p className={styles.muted}>{selected.evidence}</p>}
      <div className={styles.cellActions}>{([[true,'Cumplido'],[false,'No cumplido'],[null,'Sin registro']] as const).map(([state,title])=><button key={title} onClick={()=>{habits.mark(cell.date,cell.clave,state);setCell(null)}}>{title}</button>)}</div>
    </div></div>}
  </>
}
