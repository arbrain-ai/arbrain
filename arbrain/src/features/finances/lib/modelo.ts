/**
 * Modelo de la vista de Finanzas (8 oct 2026, v2). Lógica pura: sin React, sin red.
 *
 * Principio: cada número dice de dónde viene y de qué fecha es. Lo vivo y exacto va arriba; lo viejo o
 * estimado conserva su fecha y su confianza. Nada se inventa: un gasto que llegó como total del mes no se
 * reparte en días, y un mes al que le falta un estado de cuenta no se compara como si estuviera completo.
 */
import type {
  Aggregate, DayPoint, FinanceCoverage, FinancesPayload, FinanceRecurring, FinanceSnapshot, MonthTotal, PostCloseEvent,
} from '../types/finances'
import { diasEntre } from './finanzas'
import { nombreMes, MESES_CORTO, pagoTarjetaEn } from './granularidad'
import { capital, instalacion, NOMBRE_SEGUNDA, SEGUNDA } from '@/config'

export const CIERRE_VIEJO = 35

/** «Banco-Debito-Dueno» → «Banco débito». Las cuentas del banco salen con el nombre que usa la gente. */
export function nombreCuenta(c: string): string {
  // Los nombres de las cuentas propias viven en config/instalacion.ts › finanzas.
  return instalacion().finanzas.nombresCuentas[c] ?? c.replace(/-/g, ' ')
}

export const corto = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')} M`
  if (a >= 10_000) return `${s}$${Math.round(a / 1000)} mil`
  if (a >= 1_000) return `${s}$${(a / 1000).toFixed(1).replace(/\.0$/, '')} mil`
  return `${s}$${Math.round(a)}`
}

export function fechaCorta(iso: string, conAnio = false): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CORTO[m - 1]}${conAnio ? ` ${y}` : ''}`
}

export function hace(dias: number): string {
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 45) return `hace ${dias} días`
  const meses = Math.round(dias / 30.44)
  return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
}

const mesAnterior = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` }
const mesSiguiente = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }
export { mesAnterior, mesSiguiente }

// ── Frescura ────────────────────────────────────────────────────────────────────────────────────────────

export type Frescura = 'vivo' | 'al-corte' | 'viejo'

/** Un cierre con más de 35 días describe ese corte, no hoy. */
export function frescuraCierre(cierre: FinanceSnapshot | null, hoy: string): { frescura: Frescura; dias: number | null } {
  if (!cierre) return { frescura: 'viejo', dias: null }
  const dias = diasEntre(cierre.snapshot_date, hoy)
  return { frescura: dias <= 2 ? 'vivo' : dias > CIERRE_VIEJO ? 'viejo' : 'al-corte', dias }
}

// ── Cobertura de los gastos ─────────────────────────────────────────────────────────────────────────────

/** El corte de cada fuente de gastos, de la más reciente a la más atrasada: «Banco A 27 sep · Tarjeta B 11 sep…». */
export function cortesPorFuente(cov: FinanceCoverage | undefined): { cuenta: string; nombre: string; fecha: string }[] {
  const fuentes = cov?.sources?.length ? cov.sources : (cov?.statements ?? []).filter(s => s.last_date).map(s => ({ account: s.account, last_date: s.last_date! }))
  return fuentes.map(f => ({ cuenta: f.account, nombre: nombreCuenta(f.account), fecha: f.last_date })).sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** ¿Alguna fuente se queda antes del fin del rango (hoy)? Entonces lo gastado es un piso. */
export const hayCortePendiente = (cov: FinanceCoverage | undefined, hoy: string) => cortesPorFuente(cov).some(c => c.fecha < hoy)

export interface CorteGastos {
  /** Hasta cuándo se conocen TODOS los gastos: el estado de cuenta más atrasado. */
  hasta: string | null
  cuentaAtrasada: string | null
  porCuenta: { cuenta: string; ultimo: string | null; alDia: boolean }[]
}

export function corteGastos(cov: FinanceCoverage | undefined, hoy: string): CorteGastos {
  const ult = mesAnterior(hoy.slice(0, 7))
  const porCuenta = (cov?.statements ?? []).map(s => ({ cuenta: s.account, ultimo: s.last_date, alDia: !!s.last_period && s.last_period >= ult }))
  let hasta: string | null = null, cuentaAtrasada: string | null = null
  for (const c of porCuenta) if (c.ultimo && (hasta === null || c.ultimo < hasta)) { hasta = c.ultimo; cuentaAtrasada = c.cuenta }
  return { hasta, cuentaAtrasada, porCuenta }
}

/** ¿Este mes tiene el estado de cuenta de TODAS las cuentas? Si no, sus gastos son un piso, no el total. */
export function mesCubierto(ym: string, cov: FinanceCoverage | undefined): { completo: boolean; faltan: string[] } {
  const st = cov?.statements ?? []
  const faltan = st.filter(s => !s.periods.includes(ym) && s.periods.length > 0 && ym >= s.periods[0]).map(s => s.account)
  return { completo: st.length > 0 && faltan.length === 0, faltan }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

// ── La gráfica ──────────────────────────────────────────────────────────────────────────────────────────

export interface DiaGrafica {
  fecha: string
  entro: number // lo que entró ese día (registrado por día)
  salio: number
  usd: number
  /** Totales de periodo puestos en esta fecha. NO son de un solo día. */
  agrEntro: Aggregate[]
  agrSalio: Aggregate[]
}

export function diasGrafica(summary: { daily_series?: DayPoint[]; aggregates?: Aggregate[] }): DiaGrafica[] {
  const aggs = summary.aggregates ?? []
  return (summary.daily_series ?? []).map(p => ({
    fecha: p.date, entro: p.income_day_mxn, salio: p.expense_day_mxn, usd: p.income_day_usd,
    agrEntro: aggs.filter(a => a.date === p.date && a.type === 'ingreso'),
    agrSalio: aggs.filter(a => a.date === p.date && a.type === 'gasto'),
  }))
}

export const suma = (xs: { total_mxn: number }[]) => xs.reduce((n, x) => n + x.total_mxn, 0)

export interface Acumulado { entro: number[]; salio: number[]; saltoEntro: boolean[]; saltoSalio: boolean[] }

/** Acumulado día a día. Los totales de periodo suman en su fecha de corte y se marcan como salto. */
export function acumulado(dias: DiaGrafica[]): Acumulado {
  let e = 0, s = 0
  const out: Acumulado = { entro: [], salio: [], saltoEntro: [], saltoSalio: [] }
  for (const d of dias) {
    e += d.entro + suma(d.agrEntro); s += d.salio + suma(d.agrSalio)
    out.entro.push(e); out.salio.push(s)
    out.saltoEntro.push(d.agrEntro.length > 0); out.saltoSalio.push(d.agrSalio.length > 0)
  }
  return out
}

export interface MesGrafica {
  mes: string
  entro: number
  salio: number
  enCurso: boolean
  /** Falta algún estado de cuenta: los gastos de este mes son un piso. */
  gastoParcial: boolean
  faltan: string[]
  sinDatos: boolean
}

/** Los últimos `n` meses (el actual incluido), sin huecos en el eje. */
export function mesesGrafica(months: MonthTotal[], cov: FinanceCoverage | undefined, hoy: string, n: number): MesGrafica[] {
  const actual = hoy.slice(0, 7)
  const lista: string[] = []
  for (let ym = actual, i = 0; i < n; ym = mesAnterior(ym), i++) lista.unshift(ym)
  return lista.map(ym => {
    const t = months.find(x => x.month === ym)
    const c = mesCubierto(ym, cov)
    const enCurso = ym === actual
    return { mes: ym, entro: t?.income_mxn ?? 0, salio: t?.expense_mxn ?? 0, enCurso, gastoParcial: enCurso || !c.completo, faltan: c.faltan, sinDatos: !t || (t.income_mxn === 0 && t.expense_mxn === 0) }
  })
}

export function mesesDelRango(dias: number): number { return dias <= 30 ? 3 : dias <= 90 ? 4 : dias <= 180 ? 7 : 13 }

// ── Cobros fijos ────────────────────────────────────────────────────────────────────────────────────────

export function diaDelCobro(r: Pick<FinanceRecurring, 'periodicity' | 'charge_day' | 'charge_month'>): string {
  return r.periodicity === 'anual' && r.charge_month ? `${r.charge_day} ${MESES_CORTO[r.charge_month - 1]}` : `día ${r.charge_day}`
}

// ── Lo que pasó después de la foto ──────────────────────────────────────────────────────────────────────

/** Por cuenta: lo que cambió después del cierre y la foto no sabe (p. ej. «un acreedor liquidó lo que se le debía»). */
export function despuesDeLaFoto(eventos: PostCloseEvent[] | undefined): Map<string, PostCloseEvent[]> {
  const m = new Map<string, PostCloseEvent[]>()
  for (const e of eventos ?? []) for (const c of [e.account, e.counter_account]) if (c) m.set(c, [...(m.get(c) ?? []), e])
  return m
}

// ── Nombres de categorías, en palabras de gente ─────────────────────────────────────────────────────────

const CATEGORIAS: Record<string, string> = {
  'viaje-hospedaje': 'Viaje: hospedaje', 'viaje-transporte': 'Transporte y viajes', comida: 'Comida', despensa: 'Despensa', 'health-gym': 'Salud y gym',
  suscripciones: 'Suscripciones', 'equipo-tech': 'Equipo y tecnología', vivienda: 'Casa y renta', [SEGUNDA()]: capital(NOMBRE_SEGUNDA()), familia: 'Familia',
  'inversion-conocimiento': 'Aprender', 'negocio-ops': 'Operar el negocio', personal: 'Personal (ropa y trámites)', otros: 'Sin clasificar',
}
export const nombreCategoria = (c: string) => CATEGORIAS[c] ?? c
/** «Sin clasificar» es lo que nadie ha puesto en su lugar: se pinta rayado, como todo lo que no se sabe. */
export const sinClasificar = (c: string) => c === 'otros'
export const nombreFuente = (c: string) => ({ Polar: 'Polar (ventas)', otros: 'Otros depósitos', USDT: 'USDT', 'HT-cierre': 'Cierres de alto ticket' } as Record<string, string>)[c] ?? c

// ── Movimientos agrupados ───────────────────────────────────────────────────────────────────────────────

export interface GrupoMov {
  clave: string
  fecha: string // la más reciente del grupo
  mes: string
  titulo: string
  detalle: string | null
  /** MXN, con signo para pintarlo: + entra, − sale, 0 no cambia el total. */
  monto: number
  usd: number
  /** Lo que dice el movimiento en SU divisa (los de «mueve» no suman a nada). */
  cantidad: number
  moneda: string
  tipo: 'ingreso' | 'gasto' | 'mueve'
  mesCompleto: boolean
  items: { fecha: string; texto: string; monto: number; usd: number }[]
  /** Texto del botón que abre el desglose. */
  desglose?: string
}

/** Decenas de «Revenue Polar del día» son UN renglón por mes; lo que es un total de periodo lo dice. Nada se pierde. */
export function agruparMovimientos(
  movs: { id: string; date: string; type: string; amount: number; currency: string; category: string | null; note: string | null; registered_by: string; is_correction: boolean; account_name?: string; counter_account_name?: string }[],
  aMxn: (monto: number, moneda: string) => number,
  clasificar: (m: { type: any; date: string; note: string | null; category: string | null; registered_by: string }) => { granularidad: 'dia' | 'mes'; label: string; detail: string | null; source: string | null; account: string | null; period: string | null; category: string | null },
): GrupoMov[] {
  const out: GrupoMov[] = []
  const polar = new Map<string, GrupoMov>()
  const estados = new Map<string, GrupoMov>()
  for (const m of [...movs].sort((a, b) => b.date.localeCompare(a.date))) {
    if (m.is_correction) continue
    const mxn = aMxn(m.amount, m.currency)
    const mes = m.date.slice(0, 7)
    const c = clasificar(m)
    if (m.type === 'ingreso' && m.category === 'Polar' && c.granularidad === 'dia') {
      let g = polar.get(mes)
      if (!g) { g = { clave: `polar-${mes}`, fecha: m.date, mes, titulo: 'Ventas de Polar', detalle: null, monto: 0, usd: 0, cantidad: 0, moneda: 'USD', tipo: 'ingreso', mesCompleto: false, items: [] }; polar.set(mes, g); out.push(g) }
      g.monto += mxn; g.usd += m.currency === 'USD' ? m.amount : 0; g.cantidad = g.usd
      g.items.push({ fecha: m.date, texto: 'Ventas del día', monto: mxn, usd: m.currency === 'USD' ? m.amount : 0 })
      g.detalle = `${g.items.length} ${g.items.length === 1 ? 'día con ventas' : 'días con ventas'}`; g.desglose = 'Ver cada día'
      continue
    }
    const nombre = (n?: string) => (n ? nombreCuenta(n) : '')
    if ((m.type === 'gasto' || m.type === 'ingreso') && c.source && (c.source === 'estado-de-cuenta' || c.source === 'depositos-banco') && c.account && c.period) {
      // Un estado de cuenta llega en pedazos (uno por categoría): se muestra como UN estado, con su desglose.
      const clave = `${c.source}-${c.account}-${c.period}-${m.type}`
      let g = estados.get(clave)
      if (!g) {
        g = { clave, fecha: m.date, mes, tipo: m.type, monto: 0, usd: 0, cantidad: 0, moneda: 'MXN', mesCompleto: true, items: [], desglose: 'Ver el desglose',
          titulo: `${m.type === 'gasto' ? 'Estado de cuenta' : 'Depósitos'} de ${nombreCuenta(c.account)} · ${nombreMes(c.period)}`, detalle: null }
        estados.set(clave, g); out.push(g)
      }
      g.monto += m.type === 'gasto' ? -mxn : mxn
      g.items.push({ fecha: m.date, texto: `${m.type === 'gasto' ? nombreCategoria(c.category ?? 'otros') : nombreFuente(c.category ?? 'otros')}${c.detail ? `: ${c.detail}` : ''}`, monto: m.type === 'gasto' ? -mxn : mxn, usd: 0 })
      g.detalle = `${g.items.length} ${g.items.length === 1 ? 'categoría' : 'categorías'}`
      continue
    }
    if (m.type === 'gasto' || m.type === 'ingreso') {
      const mes_ = c.granularidad === 'mes'
      out.push({ clave: m.id, fecha: m.date, mes, tipo: m.type, monto: m.type === 'gasto' ? -mxn : mxn, usd: m.currency === 'USD' ? m.amount : 0, cantidad: m.amount, moneda: m.currency, mesCompleto: mes_,
        titulo: mes_ ? c.label : m.type === 'gasto' ? nombreCategoria(m.category ?? 'otros') : `Ingreso · ${nombreFuente(m.category ?? 'otros')}`,
        detalle: mes_ ? c.detail : (m.note ?? null), items: [] })
    } else {
      const etiqueta = ({ transferencia: 'Transferencia', prestamo: 'Préstamo', pago_deuda: 'Pago de deuda', ajuste: 'Ajuste' } as Record<string, string>)[m.type] ?? m.type
      out.push({ clave: m.id, fecha: m.date, mes, tipo: 'mueve', monto: 0, usd: 0, cantidad: m.amount, moneda: m.currency, mesCompleto: false,
        titulo: `${etiqueta}${m.account_name || m.counter_account_name ? `: ${nombre(m.account_name)} → ${nombre(m.counter_account_name)}` : ''}`,
        detalle: m.note ?? null, items: [] })
    }
  }
  return out
}

/** Un monto en SU divisa, sin ambigüedad: US$105.50, €10.40, $3,450. */
export function montoDe(n: number, moneda: string): string {
  const f = (d: number) => n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })
  return moneda === 'USD' ? `US$${f(Number.isInteger(n) ? 0 : 2)}` : moneda === 'EUR' ? `€${f(Number.isInteger(n) ? 0 : 2)}` : `$${f(Number.isInteger(n) ? 0 : 2)}`
}

// ── Lo que falta por completar (v3): acompaña a los números, no los sustituye ───────────────────────────

export interface Pendiente { clave: string; texto: string }

/** Advertencias de calidad del rango visible. Cada una dice qué número afecta. */
export function pendientes(d: Pick<FinancesPayload, 'summary'>, hoy: string, cierre: FinanceSnapshot | null): Pendiente[] {
  const { summary } = d
  const out: Pendiente[] = []
  const corte = corteGastos(summary.coverage, hoy)
  const atrasadas = corte.porCuenta.filter(c => !c.alDia)
  if (atrasadas.length) out.push({ clave: 'estados', texto: `Gastado: cada fuente llega hasta su corte (${cortesPorFuente(summary.coverage).map(c => `${c.nombre} ${fechaCorta(c.fecha)}`).join(' · ')}). Lo posterior todavía no está, así que ese tramo es un piso.` })
  const burn = summary.burn_range_mxn
  if (burn > 0) {
    const tarjeta = (summary.aggregates ?? []).filter(a => a.type === 'gasto').reduce((n, a) => n + pagoTarjetaEn(a.detail), 0)
    if (tarjeta / burn >= 0.25) out.push({ clave: 'tarjeta', texto: `Gastado: ${pesos(tarjeta)} (${Math.round((tarjeta / burn) * 100)}%) son pagos de la tarjeta Nu. Se ve cuánto se pagó, no en qué se gastó: falta el estado de la tarjeta.` })
    const pareja = summary.burn_by_category.find(c => c.category === SEGUNDA())?.total_mxn ?? 0
    if (pareja / burn >= 0.1) out.push({ clave: SEGUNDA(), texto: `Gastado: ${pesos(pareja)} (${Math.round((pareja / burn) * 100)}%) están en la categoría ${capital(NOMBRE_SEGUNDA())}. Si son movimientos entre ustedes, no son gasto: hay que reclasificarlos como transferencia.` })
    const otros = summary.burn_by_category.find(c => c.category === 'otros')?.total_mxn ?? 0
    if (otros / burn >= 0.2) out.push({ clave: 'otros', texto: `En qué se va: ${Math.round((otros / burn) * 100)}% del gasto está sin clasificar.` })
  }
  const f = frescuraCierre(cierre, hoy)
  if (!cierre) out.push({ clave: 'foto', texto: 'Patrimonio: todavía no hay una foto de saldos. Dicta tus saldos a Levy.' })
  else if (f.frescura === 'viejo') out.push({ clave: 'foto', texto: `Patrimonio: es la foto del ${fechaCorta(cierre.snapshot_date)}, ${hace(f.dias!)}. Dicta tus saldos a Levy y se pone al día.` })
  return out
}
