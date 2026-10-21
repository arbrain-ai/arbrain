/**
 * El cálculo v2 del GET de /api/finanzas (8 oct 2026), aparte para poder probarlo sin Supabase.
 * Solo AGREGA campos al `summary`: lo registrado por día, los totales de periodo, los meses con su cobertura y lo que
 * pasó después del último cierre. No escribe nada y no cambia los números que ya devolvía el GET.
 */
import type { Aggregate, DayPoint, FinanceCoverage, FinanceFx, FinanceMovement, MonthTotal, PostCloseEvent, StatementCoverage } from '../types/finances'
import { clasificar, fuenteEstado, pagoTarjetaEn, POLAR_EXACTO_DESDE } from './granularidad'

const aMxn = (amount: number, currency: string, fx: FinanceFx) => currency === 'USD' ? amount * fx.usd_mxn : currency === 'EUR' ? amount * fx.eur_mxn : amount

export interface EntradaV2 {
  /** Los movimientos de los últimos 13 meses (o del rango, si es más largo), con `account_name` ya unido. */
  context: FinanceMovement[]
  /** Los del rango elegido. */
  range: FinanceMovement[]
  days: number
  /** Primer día de la ventana. */
  windowStart: Date
  fx: FinanceFx
  closeDate: string | null
}

export function calcularV2({ context: contextMovements, range: rangeMovements, days, windowStart, fx, closeDate }: EntradaV2) {
  const toMxn = (amount: number, currency: string) => aMxn(amount, currency, fx)
  const dayMap = new Map<string, DayPoint>()
  for (let i = 0; i < days; i++) {
    const d = new Date(windowStart)
    d.setUTCDate(d.getUTCDate() + i)
    const key = d.toISOString().slice(0, 10)
    dayMap.set(key, { date: key, income_day_mxn: 0, expense_day_mxn: 0, income_day_usd: 0 })
  }
  const aggregates: Aggregate[] = []
  for (const m of rangeMovements) {
    if (m.is_correction || (m.type !== 'gasto' && m.type !== 'ingreso')) continue
    const c = clasificar(m)
    const mxn = toMxn(m.amount, m.currency)
    if (c.granularidad === 'mes') {
      aggregates.push({
        id: m.id, date: m.date, type: m.type, total_mxn: Math.round(mxn), currency: m.currency, amount: m.amount,
        source: c.source!, period: c.period, account: c.account, category: c.category, label: c.label, detail: c.detail,
      })
      continue
    }
    const day = dayMap.get(m.date)
    if (!day) continue
    if (m.type === 'ingreso') {
      day.income_day_mxn += mxn
      if (m.currency === 'USD') day.income_day_usd += m.amount
    } else day.expense_day_mxn += mxn
  }
  const dailySeries: DayPoint[] = [...dayMap.values()].map((d) => ({
    ...d, income_day_mxn: Math.round(d.income_day_mxn), expense_day_mxn: Math.round(d.expense_day_mxn), income_day_usd: Number(d.income_day_usd.toFixed(2)),
  }))

  // Meses (13) con su cobertura: nada de esto depende del rango.
  const monthMap = new Map<string, MonthTotal>()
  const stmtPeriods = new Map<string, Set<string>>()
  const stmtLastDate = new Map<string, string>()
  const fuenteUltimo = new Map<string, string>()
  const polarMonths = new Set<string>()
  let polarLastDay: string | null = null
  for (const m of contextMovements) {
    if (m.is_correction) continue
    const c = clasificar(m)
    if (c.source === 'estado-de-cuenta' && c.account && c.period) {
      const set = stmtPeriods.get(c.account) ?? new Set<string>()
      set.add(c.period)
      stmtPeriods.set(c.account, set)
      if (m.date > (stmtLastDate.get(c.account) ?? '')) stmtLastDate.set(c.account, m.date)
    }
    // Último movimiento de cada fuente (estado de cuenta completo o parcial): hasta ahí llegan los gastos de esa cuenta.
    const fuente = fuenteEstado(m.note)
    if (fuente && m.date > (fuenteUltimo.get(fuente) ?? '')) fuenteUltimo.set(fuente, m.date)
    if (c.covers) {
      const set = stmtPeriods.get(c.covers.account) ?? new Set<string>()
      set.add(c.covers.period)
      stmtPeriods.set(c.covers.account, set)
      if (m.date > (stmtLastDate.get(c.covers.account) ?? '')) stmtLastDate.set(c.covers.account, m.date)
    }
    if (m.type === 'ingreso' && m.category === 'Polar') {
      polarMonths.add(c.period ?? m.date.slice(0, 7))
      if (c.granularidad === 'dia' && m.date > (polarLastDay ?? '')) polarLastDay = m.date
    }
    if (m.type !== 'gasto' && m.type !== 'ingreso') continue
    // El mes al que pertenece un total de periodo es su periodo; un movimiento del día, el mes de su fecha.
    const ym = c.period ?? m.date.slice(0, 7)
    const t = monthMap.get(ym) ?? { month: ym, income_mxn: 0, expense_mxn: 0, income_polar_mxn: 0, expense_card_payment_mxn: 0, has_daily_expense: false }
    const mxn = toMxn(m.amount, m.currency)
    if (m.type === 'ingreso') {
      t.income_mxn += mxn
      if (m.category === 'Polar') t.income_polar_mxn += mxn
    } else {
      t.expense_mxn += mxn
      t.expense_card_payment_mxn += pagoTarjetaEn(c.detail)
      if (c.granularidad === 'dia') t.has_daily_expense = true
    }
    monthMap.set(ym, t)
  }
  const months: MonthTotal[] = [...monthMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((t) => ({ ...t, income_mxn: Math.round(t.income_mxn), expense_mxn: Math.round(t.expense_mxn), income_polar_mxn: Math.round(t.income_polar_mxn), expense_card_payment_mxn: Math.round(t.expense_card_payment_mxn) }))
  const statements: StatementCoverage[] = [...stmtPeriods.entries()]
    .map(([account, set]) => {
      const periods = [...set].sort()
      return { account, periods, last_period: periods.at(-1) ?? null, last_date: stmtLastDate.get(account) ?? null }
    })
    .sort((a, b) => a.account.localeCompare(b.account))

  // Movimientos que la última foto de saldos no conoce (un préstamo cobrado, una transferencia).
  const postClose: PostCloseEvent[] = closeDate
    ? contextMovements
        .filter((m) => m.date > closeDate && ['transferencia', 'prestamo', 'pago_deuda'].includes(m.type))
        .map((m) => ({
          id: m.id, date: m.date, type: m.type, account: m.account_name ?? null, counter_account: m.counter_account_name ?? null,
          amount: m.amount, currency: m.currency, note: m.note,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : []

  return {
    daily_series: dailySeries,
    aggregates,
    months,
    coverage: { sources: [...fuenteUltimo.entries()].map(([account, last_date]) => ({ account, last_date })).sort((a, b) => a.account.localeCompare(b.account)), statements, polar_months: [...polarMonths].sort(), polar_last_day: polarLastDay, polar_exact_from: POLAR_EXACTO_DESDE } satisfies FinanceCoverage,
    post_close: postClose,
  }
}
