/**
 * Finanzas v2 (8 oct 2026): lo registrado por día no se mezcla con los totales de periodo, el mes de la lectura es el
 * último con TODOS los estados de cuenta, y el cálculo del GET solo agrega campos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clasificar, pagoTarjetaEn } from '../../src/features/finances/lib/granularidad'
import { calcularV2 } from '../../src/features/finances/lib/agregados'
import { acumulado, corteGastos, diasGrafica, pendientes, mesCubierto, mesesGrafica, agruparMovimientos } from '../../src/features/finances/lib/modelo'
// La categoría de la segunda persona sale de la configuración de la instalación.
import { SEGUNDA } from '../../src/config'
import { esEdicionCliente } from '../../src/lib/edicion'

// Los nombres legibles de las cuentas salen de instalacion().finanzas; la plantilla del alumno no trae cuentas, así que
// las pruebas que los afirman se saltan en la edición cliente. Las cuentas de la prueba son las dos primeras que declara
// la instalación (así se prueba su nombre legible sin escribir aquí ningún banco); sin cuentas, nombres neutros.
const SOLO_ORIGINAL = (esEdicionCliente() || Object.keys(instalacion().finanzas.nombresCuentas).length === 0) && 'instalación sin cuentas configuradas'
import type { FinanceMovement, FinanceSnapshot } from '../../src/features/finances/types/finances'
import { instalacion } from '../../src/config'
const CUENTAS = Object.keys(instalacion().finanzas.nombresCuentas)
const CUENTA_A = CUENTAS[1] ?? 'Banco-A'   // la que tiene estado de septiembre
const CUENTA_B = CUENTAS[0] ?? 'Debito-B'  // la que se quedó en agosto
const TARJETA = 'Tarjeta-C'
const legible = (c: string) => instalacion().finanzas.nombresCuentas[c] ?? c.replace(/-/g, ' ')

const fx = { usd_mxn: 18, eur_mxn: 20, eur_usd: 1.1 }
let id = 0
const mov = (o: Partial<FinanceMovement>): FinanceMovement => ({ id: `m${++id}`, date: '2026-09-01', type: 'gasto', account_id: 'a', counter_account_id: null, currency: 'MXN', amount: 100, counter_currency: null, counter_amount: null,
  category: 'otros', note: null, registered_by: 'levy', is_correction: false, corrects_movement_id: null, created_at: '', account_name: CUENTA_A, ...o })
const edo = (date: string, cuenta: string, periodo: string, monto: number, nota = 'Principales: Anthropic $100') => mov({ date, amount: monto, category: 'suscripciones', registered_by: 'estado-de-cuenta', account_name: cuenta, note: `Estado de cuenta ${cuenta} ${periodo}: 1 cargos. ${nota} [edo-cuenta:${periodo}:${cuenta}:suscripciones]` })
const polarDia = (date: string, usd: number) => mov({ date, type: 'ingreso', currency: 'USD', amount: usd, category: 'Polar', registered_by: 'polar-sync', account_name: 'Polar', note: `Revenue Polar del día [polar-daily:${date}]` })
const ajuste = (date: string, usd: number) => mov({ date, type: 'ingreso', currency: 'USD', amount: usd, category: 'Polar', registered_by: 'levy', account_name: 'Polar', note: 'Renovaciones Polar no capturadas por el sync (ajuste de prueba).' })

describe('finanzas · granularidad', () => {
  it('un estado de cuenta, un ajuste de renovaciones y las ventas mensuales son totales de periodo; lo del día no', () => {
    assert.equal(clasificar(edo('2026-09-27', CUENTA_A, '2026-09', 500)).granularidad, 'mes')
    assert.equal(clasificar(ajuste('2026-09-30', 1000)).granularidad, 'mes')
    assert.equal(clasificar(mov({ type: 'ingreso', category: 'Polar', note: 'Ventas netas Polar 2026-03 [polar-mensual:2026-03]' })).period, '2026-03')
    assert.equal(clasificar(polarDia('2026-10-05', 26)).granularidad, 'dia')
    assert.equal(clasificar(mov({ type: 'ingreso', category: 'HT-cierre', note: 'Anticipo de un cliente' })).granularidad, 'dia')
  })
  it('lee el pago a la tarjeta de crédito que viene dentro de «Principales»', () => {
    assert.equal(pagoTarjetaEn('Pago a tarjeta de crédito $12,345, Otro $100'), 12345)
    assert.equal(pagoTarjetaEn('Proveedor $1,234'), 0)
  })
})

describe('finanzas · cargos individuales de un estado de cuenta', () => {
  const cargo = (date: string, monto: number, periodo: string) => mov({ date, amount: monto, account_name: TARJETA, registered_by: 'estado-de-cuenta', note: `${TARJETA} crédito: Amazon [edo-cuenta-cargo:${TARJETA}:${periodo}]` })
  const todo = [cargo('2026-08-14', 300, '2026-08'), cargo('2026-09-03', 50, 'parcial')]
  const v2 = calcularV2({ context: todo, range: todo, days: 40, windowStart: new Date('2026-08-01T12:00:00Z'), fx, closeDate: null })
  it('van en su día, no como total de periodo', () => {
    assert.equal(clasificar(todo[0]).granularidad, 'dia')
    assert.equal(v2.aggregates.length, 0)
    assert.equal(v2.daily_series.find(d => d.date === '2026-08-14')!.expense_day_mxn, 300)
  })
  it('cubren su mes para la cuenta; un mes parcial no cuenta como cubierto', () => {
    assert.deepEqual(v2.coverage.statements.map(s => [s.account, s.periods]), [[TARJETA, ['2026-08']]])
    assert.equal(v2.months.find(m => m.month === '2026-09')!.expense_mxn, 50)
  })
})

describe('finanzas · cálculo v2 del GET', () => {
  const todo = [
    edo('2026-08-31', CUENTA_A, '2026-08', 1000), edo('2026-08-31', CUENTA_B, '2026-08', 2000, 'Principales: Pago a tarjeta de crédito $1,500'),
    edo('2026-09-27', CUENTA_A, '2026-09', 700), polarDia('2026-09-10', 10), polarDia('2026-10-05', 20), ajuste('2026-09-30', 100),
    mov({ date: '2026-09-01', type: 'pago_deuda', amount: 5000, account_name: 'Acreedor', counter_account_name: CUENTA_A }),
  ]
  const windowStart = new Date('2026-09-09T12:00:00Z')
  const v2 = calcularV2({ context: todo, range: todo.filter(m => m.date >= '2026-09-09'), days: 30, windowStart, fx, closeDate: '2026-07-05' })
  it('separa lo del día de los totales de periodo y no reparte el estado de cuenta en días', () => {
    assert.equal(v2.daily_series.length, 30)
    assert.equal(v2.daily_series.reduce((n, d) => n + d.expense_day_mxn, 0), 0, 'ningún gasto se inventó por día')
    assert.equal(v2.daily_series.find(d => d.date === '2026-09-10')!.income_day_mxn, 180)
    assert.equal(v2.aggregates.filter(a => a.type === 'gasto').length, 1)
    assert.equal(v2.aggregates.find(a => a.source === 'ajuste-polar')!.total_mxn, 1800)
  })
  it('da los meses con su cobertura y qué pasó después de la foto', () => {
    assert.deepEqual(v2.coverage.statements.map(s => [s.account, s.last_period]), [[CUENTA_A, '2026-09'], [CUENTA_B, '2026-08']])
    assert.equal(v2.months.find(m => m.month === '2026-08')!.expense_card_payment_mxn, 1500)
    assert.equal(v2.months.find(m => m.month === '2026-09')!.income_mxn, 180 + 1800)
    assert.equal(v2.post_close.length, 1)
  })
  it('las cosas por completar acompañan al número que afectan: estados faltantes, pagos de tarjeta, transferencias, foto vieja', { skip: SOLO_ORIGINAL }, () => {
    const summary = { coverage: v2.coverage, aggregates: v2.aggregates, burn_range_mxn: 3000, burn_by_category: [{ category: SEGUNDA(), total_mxn: 600, count: 1 }, { category: 'otros', total_mxn: 1500, count: 1 }] }
    const snap = { id: 's', snapshot_date: '2026-07-05' } as FinanceSnapshot
    const p = pendientes({ summary: summary as never }, '2026-10-08', snap)
    assert.deepEqual(p.map(x => x.clave), ['estados', SEGUNDA(), 'otros', 'foto'])
    assert.ok(p[0].texto.includes(`${legible(CUENTA_A)} 27 sep · ${legible(CUENTA_B)} 31 ago`), p[0].texto)
    assert.deepEqual(mesCubierto('2026-09', v2.coverage), { completo: false, faltan: [CUENTA_B] })
    assert.equal(corteGastos(v2.coverage, '2026-10-08').hasta, '2026-08-31')
    const alDia = pendientes({ summary: { ...summary, burn_range_mxn: 0, coverage: { ...v2.coverage, statements: [] } } as never }, '2026-10-08', { ...snap, snapshot_date: '2026-10-07' })
    assert.deepEqual(alDia, [])
  })
  it('el acumulado marca el salto del total de periodo y los meses no tienen huecos en el eje', () => {
    const dias = diasGrafica({ daily_series: v2.daily_series, aggregates: v2.aggregates })
    const a = acumulado(dias), i = dias.findIndex(d => d.fecha === '2026-09-27')
    assert.equal(a.saltoSalio[i], true); assert.equal(a.salio[i], 700); assert.equal(a.salio.at(-1), 700)
    assert.equal(mesesGrafica(v2.months, v2.coverage, '2026-10-08', 3).map(m => m.mes).join(), '2026-08,2026-09,2026-10')
  })
  it('los movimientos se agrupan sin perder nada: un estado es un renglón con su desglose', { skip: SOLO_ORIGINAL }, () => {
    const g = agruparMovimientos(todo, (a, m) => (m === 'USD' ? a * 18 : a), clasificar)
    const polar = g.find(x => x.titulo === 'Ventas de Polar' && x.mes === '2026-09')!
    assert.equal(polar.items.length, 1)
    assert.equal(g.filter(x => x.titulo.startsWith(`Estado de cuenta de ${legible(CUENTA_A)}`)).length, 2)
  })
})
