'use client'
import { memo, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2 } from 'lucide-react'
import { buildYear, intensity, yearLoad } from './year'
import type { PlanEvent } from './types'
import styles from './planning.module.css'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Doce meses compactos; cada día lleva su carga. Clic en un día: ese día en vista Día. */
export const YearView = memo(function YearView({ year, events, today, loading, failed, onPick, onRetry }: {
  year: number; events: readonly PlanEvent[]; today: string; loading: boolean; failed: boolean
  onPick: (day: string) => void; onRetry: () => void
}) {
  const months = useMemo(() => buildYear(year), [year])
  const { load, max } = useMemo(() => yearLoad(events), [events])
  return <div className={styles.year} aria-label={`Año ${year}`}>
    <p className={styles.yearLegend}>Cada día se pinta por sus eventos, sin contar las rutinas que se repiten; el tono más fuerte es tu día más cargado del año.</p>
    {(loading || failed) && <div className={styles.yearStatus} role="status">{loading ? <><Loader2 size={13} className={styles.spin} /> Leyendo tu año…</> : <>Faltan algunos meses. <button className={styles.textButton} onClick={onRetry}>Reintentar</button></>}</div>}
    <div className={styles.yearGrid}>{months.map(m => <section key={m.month} className={styles.yearMonth} aria-label={format(new Date(year, m.month, 1), 'LLLL', { locale: es })}>
      <h3>{format(new Date(year, m.month, 1), 'LLLL', { locale: es })}</h3>
      <div className={styles.yearDays}>
        {WEEKDAYS.map((w, i) => <span key={i} className={styles.yearWeekday} aria-hidden="true">{w}</span>)}
        {m.days.map(d => d.inMonth
          ? <button key={d.key} className={styles.yearDay} data-today={d.key === today || undefined} data-load={intensity(load.get(d.key) ?? 0, max)} data-day={d.key}
              aria-label={`${format(parseISO(d.key), "EEEE d 'de' MMMM", { locale: es })}${load.get(d.key) ? `, ${load.get(d.key)} ${load.get(d.key) === 1 ? 'evento' : 'eventos'}` : ''}`} onClick={() => onPick(d.key)}>{d.day}</button>
          : <span key={d.key} className={styles.yearDay} data-out="true" aria-hidden="true" />)}
      </div>
    </section>)}</div>
  </div>
})
