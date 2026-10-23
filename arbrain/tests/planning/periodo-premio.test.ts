import test from 'node:test'
import assert from 'node:assert/strict'
import { diaDelPeriodo, rangoCorto, temporadaDeHabitos, textoFaltan, textoPeriodo } from '../../src/features/planning/periodo-premio'
import { INSTALACION } from '../../src/config/instalacion'
import { INSTALACION as GENERICA } from '../../src/config/instalacion.plantilla'

const P = { desde: '2026-10-22', hasta: '2026-11-20' }

test('del jue 22 oct a la salida del vie 20 nov son 29 días: hoy es el día 1', () => {
  const d = diaDelPeriodo('2026-10-22', P)
  assert.deepEqual([d.estado, d.dia, d.total, d.faltan], ['en-curso', 1, 29, 29])
  assert.equal(textoPeriodo(d), 'Día 1 de 29')
  assert.equal(textoFaltan(d), 'Faltan 29 días')
})

test('cruza el mes y llega al día 29 la víspera de la salida', () => {
  assert.equal(textoPeriodo(diaDelPeriodo('2026-11-01', P)), 'Día 11 de 29')
  const ultimo = diaDelPeriodo('2026-11-19', P)
  assert.equal(textoPeriodo(ultimo), 'Día 29 de 29')
  assert.equal(textoFaltan(ultimo), 'Mañana se cierra')
})

test('antes, el día del cierre y después', () => {
  assert.equal(textoPeriodo(diaDelPeriodo('2026-10-21', P)), 'Empieza mañana')
  assert.equal(textoPeriodo(diaDelPeriodo('2026-10-19', P)), 'Empieza en 3 días')
  assert.equal(textoPeriodo(diaDelPeriodo('2026-11-20', P)), 'Hoy se cierra')
  assert.equal(textoFaltan(diaDelPeriodo('2026-11-20', P)), null)
  assert.equal(diaDelPeriodo('2026-11-30', P).estado, 'pasado')
})

test('las fechas del viaje se leen cortas', () => {
  assert.equal(rangoCorto('2026-11-20', '2026-11-25'), '20–25 nov')
  assert.equal(rangoCorto('2026-11-28', '2026-12-02'), '28 nov – 2 dic')
})

test('el periodo vive en un solo lugar y nunca nombra el hábito privado', () => {
  const p = INSTALACION.periodo!
  assert.equal(diaDelPeriodo(p.desde, p).total, 29)
  assert.equal(p.hasta, '2026-11-20', 'cierra el día de salida, no al volver')
  assert.equal(rangoCorto(p.viaje!.desde, p.viaje!.hasta), '20–25 nov')
  assert.equal(p.viaje!.firmado, false)
  assert.equal(p.premio, 'Monterrey')
  assert.equal(p.cumplir.length, 3)
  assert.ok(!/\bm[o]ta\b/i.test(JSON.stringify(p)), 'sin la sustancia de su diario')
  assert.equal(GENERICA.periodo, undefined, 'el alumno nace sin periodo')
})

test('la temporada de hábitos no tiene fecha propia: cierre y premio salen del periodo', () => {
  const t = INSTALACION.temporadaHabitos!
  assert.deepEqual(Object.keys(t).sort(), ['arranque', 'nombre'], 'sin desde/hasta/premio duplicados')
  const temporada = temporadaDeHabitos(t, INSTALACION.periodo)!
  assert.equal(temporada.hasta, INSTALACION.periodo!.hasta)
  assert.equal(temporada.desde, INSTALACION.periodo!.desde)
  assert.equal(temporada.premio, INSTALACION.periodo!.premio)
  assert.equal(temporada.arranque, '2026-10-23')
  assert.equal(temporadaDeHabitos(t, undefined), null, 'sin periodo no hay temporada')
  assert.equal(temporadaDeHabitos(undefined, INSTALACION.periodo), null)
})
