/**
 * Lo que tienes (5 nov 2026; aparte desde el 6 nov). Lógica pura: sin React, sin red. La usa la API y la prueban los tests.
 *
 * La última foto de saldos (líquido: sin lo que te deben) al tipo de cambio de hoy, más lo que entró o salió de las cuentas
 * de cobro (Polar) después de la foto. Los gastos posteriores a la foto NO se restan: la foto nueva lo corrige.
 * Sin foto no es 0: es null y la vista dice «sin foto».
 */
import type { FinanceAccount, FinanceFx, FinanceMovement, FinanceSnapshot, LoQueTienes } from '../types/finances'
import { aMxn, pesosDe } from './finanzas'

/**
 * Lo que tienes hoy: la foto de saldos (líquido) al tipo de cambio de hoy + lo que movieron las cuentas de cobro después
 * de la foto. Un payout de Polar al banco no cambia el total (sale de una cuenta líquida y entra a otra); una venta sí.
 */
export function tienesHoy(cierre: FinanceSnapshot | null, accounts: FinanceAccount[], movements: FinanceMovement[], fx: FinanceFx, hoy: string): LoQueTienes | null {
  if (!cierre) return null
  const tipo = new Map(accounts.map(a => [a.id, a.kind]))
  const tipoPorNombre = new Map(accounts.map(a => [a.name, a.kind]))
  const liquida = (id: string | null) => !!id && tipo.has(id) && tipo.get(id) !== 'por_cobrar'
  const cobro = (id: string | null) => !!id && tipo.get(id) === 'revenue'

  let mxn = 0
  for (const b of cierre.balances ?? []) if (tipoPorNombre.get(b.account) !== 'por_cobrar') mxn += aMxn(Number(b.balance) || 0, b.currency, fx)

  let despues = 0
  let hasta: string | null = null
  for (const m of movements) {
    if (m.is_correction || m.date <= cierre.snapshot_date || m.date > hoy) continue
    if (!cobro(m.account_id) && !cobro(m.counter_account_id)) continue
    const sale = aMxn(m.amount, m.currency, fx)
    const entra = m.counter_amount != null && m.counter_currency ? aMxn(m.counter_amount, m.counter_currency, fx) : sale
    // Un ingreso o un gasto vale lo que valió en pesos su día (contraparte MXN), no al dólar de hoy.
    const delDia = pesosDe(m, fx)
    let efecto = 0
    if (m.type === 'ingreso') efecto = liquida(m.account_id) ? delDia : 0
    else if (m.type === 'gasto') efecto = liquida(m.account_id) ? -delDia : 0
    else if (m.type === 'transferencia' || m.type === 'prestamo' || m.type === 'pago_deuda') {
      efecto = (liquida(m.counter_account_id) ? entra : 0) - (liquida(m.account_id) ? sale : 0)
    } // 'ajuste' no tiene signo propio: no se adivina.
    despues += efecto
    if (!hasta || m.date > hasta) hasta = m.date
  }
  return { mxn: Math.round(mxn + despues), cierre: cierre.snapshot_date, al_dia: cierre.snapshot_date >= hoy, cobros_despues_mxn: Math.round(despues), cobros_hasta: hasta }
}

/** La foto más reciente que no es del futuro. */
export function fotoVigente(snapshots: FinanceSnapshot[], hoy: string): FinanceSnapshot | null {
  return [...snapshots].filter(s => s.snapshot_date <= hoy).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)).at(-1) ?? null
}
