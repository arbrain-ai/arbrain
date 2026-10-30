import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { MOSTRAR_POR_DEFECTO, igual, interpretar, serializar } from '../../src/features/canvas/state/mostrar-en-lienzo'

test('por defecto: sin herramientas ni barra inferior, con capítulos', () => {
  assert.deepEqual(MOSTRAR_POR_DEFECTO, { herramientas: false, barraInferior: false, capitulos: true })
  assert.deepEqual(interpretar(null), MOSTRAR_POR_DEFECTO)
  assert.deepEqual(interpretar(''), MOSTRAR_POR_DEFECTO)
})

test('lo guardado vuelve igual (ida y vuelta)', () => {
  for (const m of [
    { herramientas: true, barraInferior: true, capitulos: false },
    { herramientas: false, barraInferior: true, capitulos: true },
  ]) assert.deepEqual(interpretar(serializar(m)), m)
})

test('JSON roto o de otro tipo cae a los valores por defecto', () => {
  assert.deepEqual(interpretar('{no es json'), MOSTRAR_POR_DEFECTO)
  assert.deepEqual(interpretar('42'), MOSTRAR_POR_DEFECTO)
  assert.deepEqual(interpretar('[]'), MOSTRAR_POR_DEFECTO)
  assert.deepEqual(interpretar('null'), MOSTRAR_POR_DEFECTO)
})

test('cada campo cae a su valor por defecto por separado', () => {
  assert.deepEqual(interpretar('{"herramientas":true}'), { herramientas: true, barraInferior: false, capitulos: true })
  assert.deepEqual(interpretar('{"capitulos":"no","barraInferior":1,"herramientas":true}'), { herramientas: true, barraInferior: false, capitulos: true })
  assert.deepEqual(interpretar('{"capitulos":false,"extra":9}'), { herramientas: false, barraInferior: false, capitulos: false })
})

test('igual compara por contenido', () => {
  assert.ok(igual(interpretar('{"herramientas":true}'), { herramientas: true, barraInferior: false, capitulos: true }))
  assert.ok(!igual(MOSTRAR_POR_DEFECTO, { ...MOSTRAR_POR_DEFECTO, capitulos: false }))
})
