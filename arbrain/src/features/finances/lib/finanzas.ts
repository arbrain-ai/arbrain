/**
 * Núcleo único de Finanzas (4 oct 2026, «el panel es la experiencia completa»).
 *
 * El panel y la sección pintan el MISMO componente y leen el MISMO cálculo de la API
 * (`/api/finanzas`). Aquí solo vive el formato y lo que se deriva en el cliente, una vez:
 * antes el panel redondeaba el runway (18) y la sección lo mostraba con decimal (17.7).
 */
import type { FinanceRecurring, FinanceSnapshot, FinanceRange } from '../types/finances'

export const RANGOS: { id: FinanceRange; label: string; word: string }[] = [
  { id: '30d', label: '30D', word: '30 días' },
  { id: '3m', label: '3M', word: '3 meses' },
  { id: '6m', label: '6M', word: '6 meses' },
  { id: '12m', label: '12M', word: '12 meses' },
  // Desde el primer movimiento registrado (5 nov 2026): la historia completa, mes por mes.
  { id: 'todo', label: 'Todo', word: 'toda la historia' },
]

export const esRango = (v: unknown): v is FinanceRange => RANGOS.some(r => r.id === v)
export const urlFinanzas = (rango: FinanceRange = '30d') => `/api/finanzas?range=${rango}`

export const dinero = (n: number, moneda = 'MXN') =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda, maximumFractionDigits: moneda === 'MXN' ? 0 : 2 }).format(n)
export const mxn = (n: number) => dinero(n, 'MXN')

/** El runway tal cual lo da la API (un decimal): «17.7 meses». Nunca se redondea a entero. */
export function formatoRunway(meses: number | null | undefined): string | null {
  if (meses == null || !Number.isFinite(meses)) return null
  const n = Number(meses.toFixed(1))
  return `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} ${n === 1 ? 'mes' : 'meses'}`
}

export const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86_400_000)
const diasDelMes = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

/** Próxima fecha civil de un cobro fijo (mensual o anual), desde hoy inclusive. */
export function proximoCobro(r: Pick<FinanceRecurring, 'charge_day' | 'charge_month' | 'periodicity'>, hoy: string): string {
  const [y, m] = hoy.split('-').map(Number), mes = m - 1
  const fecha = (yy: number, mm: number) => { const d = Math.min(r.charge_day, diasDelMes(yy, mm)); return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  if (r.periodicity === 'anual' && r.charge_month) {
    const esteAno = fecha(y, r.charge_month - 1)
    return esteAno >= hoy ? esteAno : fecha(y + 1, r.charge_month - 1)
  }
  const este = fecha(y, mes)
  return este >= hoy ? este : mes === 11 ? fecha(y + 1, 0) : fecha(y, mes + 1)
}

/** Los cobros fijos activos que caen en los próximos `dias`, en orden de fecha. */
export function proximosCobros<R extends FinanceRecurring>(recurrentes: R[], hoy: string, dias: number) {
  return recurrentes.filter(r => r.is_active)
    .map(r => ({ r, fecha: proximoCobro(r, hoy) }))
    .filter(x => diasEntre(hoy, x.fecha) <= dias)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export const aMxn = (monto: number, moneda: string, fx: { usd_mxn: number; eur_mxn: number }) =>
  moneda === 'USD' ? monto * fx.usd_mxn : moneda === 'EUR' ? monto * fx.eur_mxn : monto

/**
 * Un movimiento retirado (`is_correction`, 6 nov 2026) ya no cuenta en nada: ni en las sumas, ni en la lista, ni en el
 * conteo. Se separan una vez al leer; los retirados solo viajan a quien los pide (`retirados=1`, el dedup del sync de Polar).
 */
export function separarRetirados<T extends { is_correction: boolean }>(movs: T[]): { vivos: T[]; retirados: T[] } {
  const vivos: T[] = [], retirados: T[] = []
  for (const m of movs) (m.is_correction ? retirados : vivos).push(m)
  return { vivos, retirados }
}

/** Lo mínimo de un movimiento para saber cuánto valió en pesos. */
export interface ConPesos { amount: number; currency: string; counter_currency?: string | null; counter_amount?: number | string | null }

/**
 * Cuánto valió un movimiento en pesos EL DÍA QUE OCURRIÓ (5 nov 2026). Si trae su contraparte en MXN
 * (`counter_currency='MXN'` + `counter_amount`: el tipo de cambio de su día, o lo que de verdad llegó al banco), esa es su
 * cifra y la historia ya no se mueve con el dólar de hoy. Sin ese dato, cae al tipo de cambio que se le pase (el vivo).
 */
export function pesosDe(m: ConPesos, fx: { usd_mxn: number; eur_mxn: number } | ((monto: number, moneda: string) => number)): number {
  const amount = Number(m.amount)
  if (m.currency === 'MXN') return amount
  const contraparte = m.counter_amount == null || m.counter_amount === '' ? NaN : Number(m.counter_amount)
  if (m.counter_currency === 'MXN' && Number.isFinite(contraparte)) return contraparte
  return typeof fx === 'function' ? fx(amount, m.currency) : aMxn(amount, m.currency, fx)
}

/** El cierre más reciente (la API los manda ordenados; no se confía en ello). */
export const ultimoCierre = (cierres: FinanceSnapshot[]) =>
  [...cierres].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0] ?? null

/** Un cierre con más de 35 días describe ese corte, no hoy. */
export const CIERRE_VIEJO_DIAS = 35
