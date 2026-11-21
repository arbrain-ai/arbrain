/**
 * El MRR de la meta (15 nov 2026): UNA definición en todas partes. El dueño: «la meta firmada es "100K USD mensuales
 * RECURRENTES, bajo + alto ticket". Las cuotas del plan de 3 pagos del Acompañamiento no son recurrentes: terminan solas…
 * Contarlas infla el avance y luego se cae».
 *
 *   MRR recurrente = suscripciones de Polar que se renuevan (`active` o `trialing`): mensuales a su precio y anuales ÷ 12
 *   (entero hacia abajo, por suscripción). El alto ticket entra solo si es recurrente de verdad (una mensualidad); las
 *   cuotas de un programa (metadata `product_type: ht_membership`, el plan «3-pagos») NO entran.
 *
 * Es el mismo cálculo que el conciliador nocturno (`polar_reconcile.py › calculate_metrics_from_polar`, la serie `mrr` del
 * BI que lee la barra de la meta), que el reporte de la mañana (`reportes_matutinos.py`) y que `polar.py`. Las cuotas se
 * dicen aparte, en una línea honesta: «+ $X USD/mes en cuotas del Acompañamiento (no recurrente, terminan en <mes>)».
 * No es lo que entra a la cuenta: para caja, lo cobrado.
 *
 * Puro (tests/negocio/mrr.test.ts); la ruta es /api/negocio/mrr (Polar en vivo, solo del autor).
 */
export const URL_MRR = '/api/negocio/mrr'

/** Una suscripción de Polar, lo que el cálculo necesita. */
export interface SubPolar {
  status: string; amount?: number | null; recurring_interval?: string | null
  metadata?: Record<string, unknown> | null; started_at?: string | null; ends_at?: string | null
}

const VIVA = new Set(['active', 'trialing'])

/** ¿Es la cuota de un programa (no recurrente)? El mismo criterio que `billing_access_policy.is_ht_subscription`. */
export const esCuota = (s: SubPolar) => s.metadata?.product_type === 'ht_membership'

/** Lo que vale al mes una suscripción: mensual a su precio, anual ÷ 12 hacia abajo (como el conciliador). */
const alMes = (s: SubPolar) => (s.recurring_interval === 'year' ? Math.floor((s.amount ?? 0) / 12) : (s.amount ?? 0))

/** Cuándo deja de cobrarse una cuota: su `ends_at` si Polar lo fijó; si no, 3 meses después de empezar (plan «3-pagos»). */
export function finCuota(s: SubPolar): string | null {
  if (s.ends_at) return s.ends_at.slice(0, 10)
  const plan = typeof s.metadata?.plan === 'string' ? s.metadata.plan : ''
  const n = /^(\d+)-pagos$/.exec(plan)?.[1]
  if (!n || !s.started_at) return null
  const d = new Date(s.started_at)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCMonth(d.getUTCMonth() + Number(n))
  return d.toISOString().slice(0, 10)
}

export interface Cuotas { centavos: number; n: number; fin: { desde: string; hasta: string } | null }
export interface MrrPolar { recurrente: { centavos: number; vivas: number }; cuotas: Cuotas }

export function mrrDePolar(subs: readonly SubPolar[]): MrrPolar {
  const vivas = subs.filter(s => VIVA.has(s.status))
  const rec = vivas.filter(s => !esCuota(s)), cuo = vivas.filter(esCuota)
  const fines = cuo.map(finCuota).filter((x): x is string => !!x).sort()
  return {
    recurrente: { centavos: rec.reduce((a, s) => a + alMes(s), 0), vivas: rec.length },
    cuotas: { centavos: cuo.reduce((a, s) => a + alMes(s), 0), n: cuo.length, fin: fines.length ? { desde: fines[0], hasta: fines.at(-1)! } : null },
  }
}

/** «$7,764 USD»: dólares enteros. */
export const usd = (centavos: number) => `$${Math.floor(centavos / 100).toLocaleString('es-MX')} USD`

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mes = (f: string) => MES[Number(f.slice(5, 7)) - 1] ?? f

/** La línea aparte: «+ $4,000 USD/mes en cuotas del Acompañamiento (no recurrente, terminan entre nov y ene)». */
export function textoCuotas(c: Cuotas): string | null {
  if (!c.n || !c.centavos) return null
  const cuando = !c.fin ? '' : mes(c.fin.desde) === mes(c.fin.hasta) ? `, terminan en ${mes(c.fin.hasta)}` : `, terminan entre ${mes(c.fin.desde)} y ${mes(c.fin.hasta)}`
  return `+ ${usd(c.centavos)}/mes en cuotas del Acompañamiento (no recurrente${cuando})`
}

/** Respuesta de /api/negocio/mrr. */
export type RespuestaMrr =
  | { activo: false }
  | { activo: true; oculto: true }
  | { activo: true; oculto?: false; recurrente: { centavos: number; cifra: string; vivas: number }; cuotas: Cuotas & { texto: string | null }; leidoEn: string; error?: undefined }
  | { activo: true; oculto?: false; error: string }
