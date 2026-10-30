import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { formatoRunway, proximoCobro, proximosCobros, ultimoCierre, esRango, urlFinanzas } from '../../src/features/finances/lib/finanzas'
import type { FinanceRecurring, FinanceSnapshot } from '../../src/features/finances/types/finances'

test('el runway se pinta con el decimal de la API, igual en panel y sección (17.7, no 18)', () => {
  assert.equal(formatoRunway(17.7), '17.7 meses')
  assert.equal(formatoRunway(18), '18 meses')
  assert.equal(formatoRunway(1), '1 mes')
  assert.equal(formatoRunway(12.04), '12 meses')
  assert.equal(formatoRunway(null), null)
  assert.equal(formatoRunway(undefined), null)
})

const fijo = (o: Partial<FinanceRecurring>): FinanceRecurring => ({
  id: o.name ?? 'x', name: 'x', category: 'software', periodicity: 'mensual', charge_day: 1, charge_month: null, currency: 'MXN', amount: 100,
  account_id: null, is_active: true, notes: null, created_at: '', updated_at: '', ...o,
})

test('próximo cobro: mensual, fin de mes corto y anual', () => {
  assert.equal(proximoCobro(fijo({ charge_day: 10 }), '2026-10-04'), '2026-10-10')
  assert.equal(proximoCobro(fijo({ charge_day: 2 }), '2026-10-04'), '2026-11-02')
  assert.equal(proximoCobro(fijo({ charge_day: 31 }), '2026-11-05'), '2026-11-30')
  assert.equal(proximoCobro(fijo({ charge_day: 3 }), '2026-12-20'), '2027-01-03')
  assert.equal(proximoCobro(fijo({ periodicity: 'anual', charge_month: 3, charge_day: 15 }), '2026-10-04'), '2027-03-15')
})

test('próximos cobros: solo activos, dentro de la ventana y en orden', () => {
  const lista = [fijo({ name: 'b', charge_day: 20 }), fijo({ name: 'a', charge_day: 6 }), fijo({ name: 'pausado', charge_day: 7, is_active: false }), fijo({ name: 'lejos', charge_day: 3 })]
  assert.deepEqual(proximosCobros(lista, '2026-10-04', 14).map(x => x.r.name), ['a'])
  assert.deepEqual(proximosCobros(lista, '2026-10-04', 31).map(x => x.r.name), ['a', 'b', 'lejos'])
})

test('último cierre sin depender del orden de la API', () => {
  const c = (d: string) => ({ id: d, snapshot_date: d } as FinanceSnapshot)
  assert.equal(ultimoCierre([c('2026-08-01'), c('2026-09-01'), c('2026-07-01')])?.id, '2026-09-01')
  assert.equal(ultimoCierre([]), null)
})

test('rangos válidos y URL única de la fuente', () => {
  assert.ok(esRango('3m')); assert.ok(!esRango('2y')); assert.ok(!esRango(undefined))
  assert.equal(urlFinanzas(), '/api/finanzas?range=30d')
})
