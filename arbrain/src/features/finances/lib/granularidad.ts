/**
 * Granularidad de lo registrado (8 oct 2026, finanzas v2).
 *
 * No todo movimiento ocurrió «ese día». Los estados de cuenta que carga la socia entran como UN total por
 * mes, cuenta y categoría puesto en la fecha de corte (`[edo-cuenta:YYYY-MM:cuenta:cat]`); las ventas de
 * Polar anteriores al sync diario, y las renovaciones que el sync no veía, entran como un total del mes.
 * Pintarlos como «el gasto del 31» fabrica escalones y un día que nunca existió. Aquí se separan, sin
 * tocar un solo dato: es solo lectura de la nota y de quién lo registró. Puro y sin dependencias para
 * usarlo en el GET y en la vista.
 */
import type { Aggregate, FinanceMovement, Granularidad } from '../types/finances'

/** Desde aquí el sync diario de Polar lee las órdenes reales (altas + renovaciones). finance-os, deuda #1. */
export const POLAR_EXACTO_DESDE = '2026-10-04'

export const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «2026-09» → «septiembre» (con año si `conAnio`). */
export function nombreMes(ym: string, conAnio = false, corto = false): string {
  const [y, m] = ym.split('-').map(Number)
  const n = (corto ? MESES_CORTO : MESES_LARGO)[m - 1] ?? ym
  return conAnio ? `${n} de ${y}` : n
}

const RE_EDO = /\[edo-cuenta:(\d{4}-\d{2}):([^:\]]+):([^\]]+)\]/
const RE_EDO_ING = /\[edo-cuenta-ingreso:(\d{4}-\d{2}):([^\]]+)\]/
/** Cargo individual leído de un estado de cuenta (8 oct 2026): ocurrió ese día, y además su mes queda cubierto
 *  para esa cuenta. `parcial` = el mes solo está cubierto en parte (falta un estado), no cuenta como cubierto. */
const RE_EDO_CARGO = /\[edo-cuenta-cargo:([^:\]]+):(\d{4}-\d{2}|parcial)\]/
const RE_POLAR_MES = /\[polar-mensual:(\d{4}-\d{2})\]/
const RE_AJUSTE_POLAR = /renovaciones|complemento|no capturadas/i

export interface Clasificacion {
  granularidad: Granularidad
  source: Aggregate['source'] | null
  period: string | null
  account: string | null
  category: string | null
  label: string
  detail: string | null
  /** Mes que este movimiento deja cubierto en la matriz de estados de cuenta (cargos individuales). */
  covers?: { account: string; period: string } | null
}

const DIA: Clasificacion = { granularidad: 'dia', source: null, period: null, account: null, category: null, label: '', detail: null }

/** Lo que trae el estado de cuenta tras «Principales:», sin la etiqueta final. */
function principales(note: string): string | null {
  const m = /Principales:\s*(.+?)\s*(?:\[[a-z-]+:|$)/i.exec(note)
  return m ? m[1].replace(/\s+$/, '') : null
}

export function clasificar(m: Pick<FinanceMovement, 'type' | 'date' | 'note' | 'category' | 'registered_by'>): Clasificacion {
  const note = m.note ?? ''
  const edo = RE_EDO.exec(note)
  if (edo) {
    const [, period, cuenta, cat] = edo
    return { granularidad: 'mes', source: 'estado-de-cuenta', period, account: cuenta, category: cat,
      label: `Estado de cuenta · ${cuenta} · ${nombreMes(period, false, true)}`, detail: principales(note) }
  }
  const cargo = RE_EDO_CARGO.exec(note)
  if (cargo) {
    const [, cuenta, periodo] = cargo
    return { ...DIA, covers: periodo === 'parcial' ? null : { account: cuenta, period: periodo } }
  }
  const dep = RE_EDO_ING.exec(note)
  if (dep) {
    const [, period, cuenta] = dep
    return { granularidad: 'mes', source: 'depositos-banco', period, account: cuenta, category: m.category,
      label: `Depósitos · ${cuenta} · ${nombreMes(period, false, true)}`, detail: principales(note) }
  }
  const mensual = RE_POLAR_MES.exec(note)
  if (mensual) {
    return { granularidad: 'mes', source: 'polar-mensual', period: mensual[1], account: 'Polar', category: m.category,
      label: `Polar · ventas de ${nombreMes(mensual[1])}`, detail: null }
  }
  if (m.type === 'ingreso' && m.category === 'Polar' && m.registered_by !== 'polar-sync' && RE_AJUSTE_POLAR.test(note)) {
    // Ajuste que completa lo que el sync diario no veía (renovaciones). Casi siempre cae en el último día del mes.
    const rango = /(\d{1,2})\s*-\s*(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/i.exec(note)
    const period = m.date.slice(0, 7)
    return { granularidad: 'mes', source: 'ajuste-polar', period: rango ? null : period, account: 'Polar', category: 'Polar',
      label: rango ? `Polar · renovaciones del ${rango[1]} al ${rango[2]} de ${rango[3].toLowerCase()}` : `Polar · renovaciones de ${nombreMes(period)}`, detail: null }
  }
  return DIA
}

/** La cuenta (tal como la nombra la etiqueta) de la que viene este movimiento si salió de un estado de cuenta, completo o parcial. */
export function fuenteEstado(note: string | null | undefined): string | null {
  const n = note ?? ''
  return RE_EDO.exec(n)?.[2] ?? RE_EDO_ING.exec(n)?.[2] ?? RE_EDO_CARGO.exec(n)?.[1] ?? null
}

/** ¿Este movimiento ocurrió el día que dice su fecha? */
export const esDelDia = (m: Pick<FinanceMovement, 'type' | 'date' | 'note' | 'category' | 'registered_by'>) => clasificar(m).granularidad === 'dia'

/** Pago a la tarjeta de crédito Nu que viene dentro de «Principales:» (sin desglose de lo que se compró con ella). */
export function pagoTarjetaEn(detalle: string | null | undefined): number {
  if (!detalle) return 0
  let suma = 0
  const re = /pago a tarjeta de cr[eé]dito[^$,]*\$\s*(-?[\d,]+(?:\.\d+)?)/gi
  for (let r = re.exec(detalle); r; r = re.exec(detalle)) suma += Number(r[1].replace(/,/g, ''))
  return suma
}
