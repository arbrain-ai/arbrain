import { SEGUNDA } from '@/config'
export type FinanceCurrency = 'MXN' | 'USD' | 'EUR'
type FinanceAccountKind = 'banco' | 'credito' | 'wallet' | 'efectivo' | 'revenue' | 'por_cobrar'
export type FinanceMovementType = 'gasto' | 'ingreso' | 'transferencia' | 'prestamo' | 'pago_deuda' | 'ajuste'

/** Categorías canónicas de gasto. La de la segunda persona usa su clave (config/instalacion.ts › personas). */
export const EXPENSE_CATEGORIES: readonly string[] = [
  'viaje-hospedaje',
  'viaje-transporte',
  'comida',
  'despensa',
  'health-gym',
  'suscripciones',
  'equipo-tech',
  'vivienda',
  SEGUNDA(),
  'familia',
  'inversion-conocimiento',
  'negocio-ops',
  'personal',
  'otros',
]

export const INCOME_SOURCES = ['Polar', 'USDT', 'HT-cierre', 'otros'] as const

export interface FinanceAccount {
  id: string
  name: string
  /** `DUENO()`, `SEGUNDA()` o 'pareja' (config/instalacion.ts › personas). */
  owner: string
  kind: FinanceAccountKind
  currency: FinanceCurrency
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FinanceMovement {
  id: string
  date: string
  type: FinanceMovementType
  account_id: string
  counter_account_id: string | null
  currency: FinanceCurrency
  amount: number
  counter_currency: FinanceCurrency | null
  counter_amount: number | null
  category: string | null
  note: string | null
  registered_by: string
  is_correction: boolean
  corrects_movement_id: string | null
  created_at: string
  // joined server-side
  account_name?: string
  counter_account_name?: string
}

export interface SnapshotBalance {
  account: string
  currency: FinanceCurrency
  balance: number
}

export interface FinanceFx {
  usd_mxn: number
  eur_mxn: number
  eur_usd: number
}

export interface FinanceSnapshot {
  id: string
  snapshot_date: string
  balances: SnapshotBalance[]
  fx: FinanceFx
  liquid_mxn: number | null
  liquid_usd: number | null
  net_worth_mxn: number | null
  net_worth_usd: number | null
  delta_liquid_mxn: number | null
  delta_net_worth_mxn: number | null
  notes: string | null
  created_at: string
}

export interface FinanceRecurring {
  id: string
  name: string
  category: string
  periodicity: 'mensual' | 'anual'
  charge_day: number
  charge_month: number | null
  currency: FinanceCurrency
  amount: number
  account_id: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  account_name?: string
}

export interface CategoryTotal {
  category: string
  total_mxn: number
  count: number
}

export type FinanceRange = '30d' | '3m' | '6m' | '12m'

// Punto de la curva: ingresos y gastos ACUMULADOS al día `date` dentro del rango.
export interface SeriesPoint {
  date: string // YYYY-MM-DD
  income_mxn: number // acumulado
  expense_mxn: number // acumulado
}

/** Lo registrado con su granularidad real: `dia` = ocurrió ese día; `mes` = un total del periodo puesto en la fecha de corte. */
export type Granularidad = 'dia' | 'mes'

/** Un día de la ventana con SOLO lo que se registró ese día (nada de totales mensuales repartidos). */
export interface DayPoint {
  date: string // YYYY-MM-DD
  income_day_mxn: number
  expense_day_mxn: number
  income_day_usd: number // la parte del ingreso que entró en dólares (Polar), para decirlo en su divisa
}

/** Un registro que NO es de un día: total de un periodo (estado de cuenta, ventas mensuales de Polar, ajuste de renovaciones). */
export interface Aggregate {
  id: string
  date: string // día de corte donde está registrado
  type: 'gasto' | 'ingreso'
  total_mxn: number
  currency: FinanceCurrency
  amount: number // en su divisa original
  source: 'estado-de-cuenta' | 'depositos-banco' | 'polar-mensual' | 'ajuste-polar'
  period: string | null // YYYY-MM al que pertenece el total
  account: string | null
  category: string | null
  label: string // «Estado de cuenta · Banco-A · sep»
  detail: string | null // lo principal que trae el estado de cuenta
}

export interface MonthTotal {
  month: string // YYYY-MM
  income_mxn: number
  expense_mxn: number
  income_polar_mxn: number
  expense_card_payment_mxn: number // pagos a la tarjeta de crédito Nu dentro del gasto (sin desglose de compras)
  has_daily_expense: boolean // true si algún gasto del mes se registró por día
}

export interface StatementCoverage {
  account: string
  periods: string[] // meses YYYY-MM con estado de cuenta cargado
  last_period: string | null
  last_date: string | null // fecha de corte del último estado cargado
}

export interface FinanceCoverage {
  /** Hasta cuándo llega cada fuente de gastos: su último movimiento con nota de estado de cuenta (completo o parcial). */
  sources?: { account: string; last_date: string }[]
  statements: StatementCoverage[]
  polar_months: string[] // meses con ingresos de Polar
  polar_last_day: string | null // último día con venta diaria de Polar
  polar_exact_from: string // desde aquí el sync diario lee las órdenes reales (altas + renovaciones)
}

/** Un movimiento que cambia saldos y ocurrió DESPUÉS del último cierre (la foto no lo sabe). */
export interface PostCloseEvent {
  id: string
  date: string
  type: FinanceMovementType
  account: string | null
  counter_account: string | null
  amount: number
  currency: FinanceCurrency
  note: string | null
}

export interface FinanceSummary {
  range: FinanceRange
  days: number
  fx: FinanceFx
  fx_at: string | null // ISO timestamp del FX usado (null = fallback)
  fx_stale: boolean // true si se cayó al FX de respaldo (no vivo)
  burn_range_mxn: number
  income_range_mxn: number
  cashflow_range_mxn: number
  burn_by_category: CategoryTotal[]
  income_by_source: CategoryTotal[]
  series: SeriesPoint[] // curva diaria acumulada del rango
  monthly_burn_mxn: number // tasa de burn mensual proyectada del rango
  runway_months: number | null
  runway_low_confidence: boolean // true si el runway se calculó con pocos datos
  recurring_monthly_mxn: number
  // ── Agregados en 2026-10-08 (finanzas v2). Solo se AGREGAN campos: `series` y los demás siguen igual. ──
  daily_series?: DayPoint[] // un punto por día de la ventana, solo lo registrado por día
  aggregates?: Aggregate[] // totales de periodo dentro de la ventana
  months?: MonthTotal[] // últimos 13 meses, sin importar el rango
  coverage?: FinanceCoverage
  post_close?: PostCloseEvent[]
}

export interface FinancesPayload {
  accounts: FinanceAccount[]
  movements: FinanceMovement[]
  snapshots: FinanceSnapshot[]
  recurring: FinanceRecurring[]
  summary: FinanceSummary
}
