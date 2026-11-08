// Lo que tienes (5 nov 2026; aparte desde el 6 nov): la foto de saldos + lo que movió Polar después. Cifras inventadas.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { fotoVigente, tienesHoy } from '../../src/features/finances/lib/tienes'
import type { FinanceAccount, FinanceMovement, FinanceSnapshot } from '../../src/features/finances/types/finances'

const FX = { usd_mxn: 20, eur_mxn: 22, eur_usd: 1.1 }
const cuenta = (id: string, kind: FinanceAccount['kind'], currency: FinanceAccount['currency'] = 'MXN'): FinanceAccount =>
  ({ id, name: id, owner: 'pareja', kind, currency, is_active: true, notes: null, created_at: '', updated_at: '' })
const CUENTAS = [cuenta('Banco', 'banco'), cuenta('Cobros', 'revenue', 'USD'), cuenta('Cripto', 'wallet', 'USD'), cuenta('Tarjeta', 'credito'), cuenta('Amigo', 'por_cobrar')]

const foto = (fecha: string, liquid: number, balances = [
  { account: 'Banco', currency: 'MXN' as const, balance: 10_000 },
  { account: 'Cobros', currency: 'USD' as const, balance: 100 },
  { account: 'Cripto', currency: 'USD' as const, balance: 50 },
  { account: 'Tarjeta', currency: 'MXN' as const, balance: -1_000 },
  { account: 'Amigo', currency: 'MXN' as const, balance: 5_000 },
]): FinanceSnapshot => ({
  id: fecha, snapshot_date: fecha, balances, fx: FX, liquid_mxn: liquid, liquid_usd: null, net_worth_mxn: null, net_worth_usd: null,
  delta_liquid_mxn: null, delta_net_worth_mxn: null, notes: null, created_at: '',
})

const mov = (o: Partial<FinanceMovement>): FinanceMovement => ({
  id: Math.random().toString(36), date: '2026-01-10', type: 'ingreso', account_id: 'Cobros', counter_account_id: null, currency: 'USD', amount: 10,
  counter_currency: null, counter_amount: null, category: null, note: null, registered_by: 'test', is_correction: false, corrects_movement_id: null, created_at: '', ...o,
})

test('lo que tienes: líquido de la foto al FX de hoy (sin lo que te deben) + lo que entró a cobros después de la foto', () => {
  const r = tienesHoy(foto('2026-01-05', 0), CUENTAS, [
    mov({ date: '2026-01-05', amount: 999 }), // el día de la foto ya está en la foto
    mov({ date: '2026-01-07', amount: 10 }), // venta: +200
    mov({ date: '2026-01-08', amount: 5, is_correction: true }), // corrección: no cuenta
    mov({ date: '2026-01-09', type: 'gasto', account_id: 'Banco', currency: 'MXN', amount: 400 }), // gasto del banco: no se toca (no es de cobros)
    mov({ date: '2026-02-01', amount: 1000 }), // futuro: no cuenta
  ], FX, '2026-01-10')!
  // 10,000 + 100×20 + 50×20 − 1,000 = 12,000; + 200 de la venta
  assert.equal(r.mxn, 12_200)
  assert.equal(r.cobros_despues_mxn, 200)
  assert.equal(r.cobros_hasta, '2026-01-07')
  assert.equal(r.al_dia, false)
  assert.equal(r.cierre, '2026-01-05')
})

test('un payout de cobros al banco no cambia lo que tienes salvo la diferencia cambiaria; un préstamo sí lo baja', () => {
  const payout = mov({ date: '2026-01-07', type: 'transferencia', account_id: 'Cobros', counter_account_id: 'Banco', amount: 100, counter_currency: 'MXN', counter_amount: 1_950 })
  const r = tienesHoy(foto('2026-01-05', 0), CUENTAS, [payout], FX, '2026-01-10')!
  assert.equal(r.cobros_despues_mxn, -50) // salen 2,000 a FX de hoy, llegan 1,950
  const prestamo = mov({ date: '2026-01-07', type: 'prestamo', account_id: 'Cobros', counter_account_id: 'Amigo', amount: 10 })
  assert.equal(tienesHoy(foto('2026-01-05', 0), CUENTAS, [prestamo], FX, '2026-01-10')!.cobros_despues_mxn, -200)
  assert.equal(tienesHoy(null, CUENTAS, [], FX, '2026-01-10'), null)
  assert.equal(tienesHoy(foto('2026-01-10', 0), CUENTAS, [], FX, '2026-01-10')!.al_dia, true)
})

test('la foto vigente es la más reciente que no es del futuro', () => {
  assert.equal(fotoVigente([foto('2026-01-05', 0), foto('2026-02-01', 0), foto('2026-03-01', 0)], '2026-02-15')!.snapshot_date, '2026-02-01')
  assert.equal(fotoVigente([foto('2026-03-01', 0)], '2026-02-15'), null)
})
