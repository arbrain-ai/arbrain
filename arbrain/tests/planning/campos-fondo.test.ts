// Campos de fondo del calendario (28 oct 2026): ventana de comida del ayuno 16:8 y trabajo profundo de 8 h, sin crear eventos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { franjasDelDia, horas, minutos, minutosTapados, resumenCampo } from '../../src/features/planning/campos-fondo'
import { INSTALACION } from '../../src/config/instalacion'
import { INSTALACION as PLANTILLA } from '../../src/config/instalacion.plantilla'

const CAMPOS = INSTALACION.camposFondo

test('la instalación de Daniel trae comida 9–17 todos los días y 8 h de trabajo profundo de lunes a viernes', () => {
  const miercoles = franjasDelDia(CAMPOS, '2026-10-28')
  const comida = miercoles.filter(f => f.clave === 'comida')
  assert.deepEqual(comida.map(f => [f.desde, f.hasta]), [[540, 1020]])
  const profundo = miercoles.filter(f => f.clave === 'profundo')
  assert.equal(profundo.reduce((s, f) => s + f.hasta - f.desde, 0), 8 * 60)
  const sabado = franjasDelDia(CAMPOS, '2026-10-31')
  assert.deepEqual(sabado.map(f => f.clave), ['comida'], 'el fin de semana solo la comida')
  assert.deepEqual(PLANTILLA.camposFondo, [], 'el alumno no hereda los campos de Daniel')
})

test('la llamada gana y el campo lo dice, sin contar dos veces lo encimado', () => {
  const f = franjasDelDia(CAMPOS, '2026-10-28')
  assert.equal(resumenCampo(f, 'profundo', [])!.texto, 'Trabajo profundo · 8 h')
  // Diagnóstico 14:00–15:00 y otro encimado 14:30–15:45 (15:00–15:30 no es trabajo profundo).
  const r = resumenCampo(f, 'profundo', [{ desde: 840, hasta: 900 }, { desde: 870, hasta: 945 }])!
  assert.equal(r.tapado, 60 + 15)
  assert.equal(r.texto, 'Trabajo profundo · 6 h 45 · 1 h 15 con llamadas')
  assert.equal(resumenCampo(f, 'nada', []), null)
})

test('minutos, horas y franjas inválidas', () => {
  assert.equal(minutos('06:00'), 360); assert.equal(minutos('25:00'), null); assert.equal(minutos('x'), null)
  assert.equal(horas(45), '45 min'); assert.equal(horas(90), '1 h 30')
  assert.equal(minutosTapados(0, 100, [{ desde: -10, hasta: 20 }, { desde: 90, hasta: 200 }]), 30)
  assert.deepEqual(franjasDelDia([{ clave: 'x', titulo: 'X', tipo: 'trabajo', dias: [], franjas: [['10:00', '09:00'], ['nada', '10:00']] }], '2026-10-28'), [])
})
