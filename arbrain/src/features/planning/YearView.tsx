'use client'
import { memo, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { buildYear, intensity, yearLoad } from './year'
import type { PlanEvent } from './types'
import { tr, trn } from '@/shared/i18n'
import { localeFechas } from '@/shared/i18n/fechas'
import styles from './planning.module.css'

/** Las iniciales de lunes a domingo en el idioma activo («L M M J V S D» o «M T W T F S S»). */
const weekdays = () => ([1, 2, 3, 4, 5, 6, 0] as const).map(d => localeFechas().localize.day(d, { width: 'narrow' }).toUpperCase())

/** Doce meses compactos; cada día lleva su carga. Clic en un día: ese día en vista Día. */
export const YearView = memo(function YearView({ year, events, today, loading, failed, onPick, onRetry }: {
  year: number; events: readonly PlanEvent[]; today: string; loading: boolean; failed: boolean
  onPick: (day: string) => void; onRetry: () => void
}) {
  const months = useMemo(() => buildYear(year), [year])
  const { load, max } = useMemo(() => yearLoad(events), [events])
  return <div className={styles.year} aria-label={tr('Año {year}', { year })}>
    <p className={styles.yearLegend}>{tr('Cada día se pinta por sus eventos, sin contar las rutinas que se repiten; el tono más fuerte es tu día más cargado del año.')}</p>
    {(loading || failed) && <div className={styles.yearStatus} role="status">{loading ? <><Loader2 size={13} className={styles.spin} /> {tr('Leyendo tu año…')}</> : <>{tr('Faltan algunos meses.')} <button className={styles.textButton} onClick={onRetry}>{tr('Reintentar')}</button></>}</div>}
    <div className={styles.yearGrid}>{months.map(m => <section key={m.month} className={styles.yearMonth} aria-label={format(new Date(year, m.month, 1), 'LLLL', { locale: localeFechas() })}>
      <h3>{format(new Date(year, m.month, 1), 'LLLL', { locale: localeFechas() })}</h3>
      <div className={styles.yearDays}>
        {weekdays().map((w, i) => <span key={i} className={styles.yearWeekday} aria-hidden="true">{w}</span>)}
        {m.days.map(d => d.inMonth
          ? <button key={d.key} className={styles.yearDay} data-today={d.key === today || undefined} data-load={intensity(load.get(d.key) ?? 0, max)} data-day={d.key}
              aria-label={`${format(parseISO(d.key), tr("EEEE d 'de' MMMM"), { locale: localeFechas() })}${load.get(d.key) ? `, ${trn(load.get(d.key)!, '1 evento', '{n} eventos')}` : ''}`} onClick={() => onPick(d.key)}>{d.day}</button>
          : <span key={d.key} className={styles.yearDay} data-out="true" aria-hidden="true" />)}
      </div>
    </section>)}</div>
  </div>
})
