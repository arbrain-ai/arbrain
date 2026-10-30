import test from 'node:test'
import assert from 'node:assert/strict'
import { accesosDe, alcanceDeModo, planDelMes, tituloAngosto } from '../../src/features/planning/accesos'

test('cada escala ofrece el reporte de su periodo; el mes suma el plan', () => {
  assert.deepEqual(accesosDe('day').map(a => [a.etiqueta, a.job]), [['Reporte diario', 'morning-briefing']])
  assert.deepEqual(accesosDe('fourDays').map(a => a.etiqueta), ['Reporte diario'])
  assert.deepEqual(accesosDe('week').map(a => [a.etiqueta, a.job]), [['Reporte semanal', 'business-council']])
  assert.deepEqual(accesosDe('agenda').map(a => a.etiqueta), ['Reporte semanal'])
  assert.deepEqual(accesosDe('month').map(a => a.etiqueta), ['Reporte mensual', 'Plan del mes'])
  assert.equal(accesosDe('month')[0].job, 'monthly-review')
  assert.deepEqual(accesosDe('year'), [])
  assert.deepEqual(accesosDe('crons'), [])
  assert.equal(alcanceDeModo('fourDays'), 'dia')
  assert.equal(alcanceDeModo('agenda'), 'semana')
  assert.equal(alcanceDeModo('crons'), null)
})

test('el plan del mes apunta a docs/guardados/plan-<mes>-<año>', () => {
  assert.equal(planDelMes(new Date(2026, 9, 1)).ruta, 'docs/guardados/plan-octubre-2026/index.html')
  assert.equal(planDelMes(new Date(2026, 10, 1)).ruta, 'docs/guardados/plan-noviembre-2026/index.html')
})

test('el título angosto cabe en una línea y omite el año actual', () => {
  const hoy = new Date(2026, 9, 4)
  assert.equal(tituloAngosto('month', new Date(2026, 9, 1), { from: '', to: '' }, hoy), 'octubre')
  assert.equal(tituloAngosto('month', new Date(2027, 0, 1), { from: '', to: '' }, hoy), 'enero 2027')
  assert.equal(tituloAngosto('day', new Date(2026, 9, 4), { from: '', to: '' }, hoy), 'dom 4 oct')
  assert.equal(tituloAngosto('week', new Date(2026, 8, 28), { from: new Date(2026, 8, 28).toISOString(), to: new Date(2026, 9, 5).toISOString() }, hoy), '28 sep – 4 oct')
  assert.equal(tituloAngosto('week', new Date(2026, 9, 5), { from: new Date(2026, 9, 5).toISOString(), to: new Date(2026, 9, 12).toISOString() }, hoy), '5 – 11 oct')
})
