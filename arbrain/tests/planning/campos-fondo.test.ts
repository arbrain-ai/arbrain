// Campos de fondo del calendario (28 oct 2026): las zonas de mi vida (trabajo profundo, gym, comida, noche, sueño, mañana), sin crear eventos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { franjasDelDia, horas, minutos, minutosTapados, resumenCampo, tituloZona } from '../../src/features/planning/campos-fondo'
import { INSTALACION } from '../../src/config/instalacion'
import { INSTALACION as PLANTILLA } from '../../src/config/instalacion.plantilla'

const CAMPOS = INSTALACION.camposFondo

test('la instalación de Daniel trae sus seis zonas, cada una con su categoría', () => {
  assert.deepEqual(CAMPOS.map(c => [c.clave, c.categoria, c.forma]), [
    ['manana', 'vida', 'bloque'], ['profundo', 'construir', 'bloque'], ['gym', 'vida', 'bloque'],
    ['comida', 'vida', 'ventana'], ['noche', 'vida', 'bloque'], ['sueno', 'vida', 'bloque'],
  ])
  const miercoles = franjasDelDia(CAMPOS, '2026-10-28')
  assert.deepEqual(miercoles.filter(f => f.clave === 'comida').map(f => [f.desde, f.hasta]), [[540, 1020]])
  assert.equal(miercoles.filter(f => f.clave === 'profundo').reduce((s, f) => s + f.hasta - f.desde, 0), 8 * 60)
  assert.deepEqual(miercoles.filter(f => f.clave === 'gym').map(f => [f.desde, f.hasta]), [[570, 720]])
  assert.deepEqual(miercoles.filter(f => f.clave === 'noche').map(f => [f.desde, f.hasta]), [[1230, 1260]])
  const sabado = franjasDelDia(CAMPOS, '2026-10-31')
  assert.ok(!sabado.some(f => f.clave === 'profundo'), 'el fin de semana no hay trabajo profundo')
  assert.deepEqual(PLANTILLA.camposFondo, [], 'el alumno no hereda las zonas de Daniel')
})

test('el sueño cruza la medianoche: su noche en el día en que empieza y su madrugada en el siguiente', () => {
  const sueno = franjasDelDia(CAMPOS, '2026-10-28').filter(f => f.clave === 'sueno')
  assert.deepEqual(sueno.map(f => [f.desde, f.hasta]), [[0, 330], [1260, 1440]])
  assert.equal(sueno[0].horario, '21:00–5:30')
  assert.equal(tituloZona(sueno[0]), 'Sueño · 21:00–5:30')
  // Con días: una noche de viernes pone su madrugada en el sábado; la del domingo no existe si solo es lun a vie.
  const viernes = [{ clave: 'x', titulo: 'X', categoria: 'vida', forma: 'bloque', dias: [5], franjas: [['23:00', '01:00']] }] as const
  assert.deepEqual(franjasDelDia(viernes, '2026-10-30').map(f => [f.desde, f.hasta]), [[1380, 1440]])
  assert.deepEqual(franjasDelDia(viernes, '2026-10-31').map(f => [f.desde, f.hasta]), [[0, 60]])
  assert.deepEqual(franjasDelDia(viernes, '2026-10-29'), [])
})

test('la llamada gana y el campo lo dice, sin contar dos veces lo encimado', () => {
  const f = franjasDelDia(CAMPOS, '2026-10-28')
  assert.equal(resumenCampo(f, 'profundo', [])!.texto, 'Trabajo profundo · 8 h')
  // Diagnóstico 14:00–15:00 y otro encimado 14:30–15:45 (15:00–15:30 no es trabajo profundo).
  const r = resumenCampo(f, 'profundo', [{ desde: 840, hasta: 900 }, { desde: 870, hasta: 945 }])!
  assert.equal(r.tapado, 60 + 15)
  assert.equal(r.texto, 'Trabajo profundo · 6 h 45 · 1 h 15 con llamadas')
  assert.equal(tituloZona(f.find(x => x.clave === 'profundo')!, r), 'Trabajo profundo · 6:00–9:00, 13:00–15:00, 15:30–18:30 · 6 h 45 · 1 h 15 con llamadas')
  assert.equal(resumenCampo(f, 'nada', []), null)
})

test('minutos, horas y franjas inválidas', () => {
  assert.equal(minutos('06:00'), 360); assert.equal(minutos('25:00'), null); assert.equal(minutos('x'), null)
  assert.equal(horas(45), '45 min'); assert.equal(horas(90), '1 h 30')
  assert.equal(minutosTapados(0, 100, [{ desde: -10, hasta: 20 }, { desde: 90, hasta: 200 }]), 30)
  assert.deepEqual(franjasDelDia([{ clave: 'x', titulo: 'X', categoria: 'vida', forma: 'bloque', dias: [], franjas: [['10:00', '10:00'], ['nada', '10:00']] }], '2026-10-28'), [])
})
