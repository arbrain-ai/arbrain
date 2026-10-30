import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { recientesVisibles, registrarReciente } from '../../src/features/canvas/state/recientes-lienzos'

test('registrar: el último abierto al frente, sin repetirse, con tope', () => {
  assert.deepEqual(registrarReciente([], 'a'), ['a'])
  assert.deepEqual(registrarReciente(['a', 'b', 'c'], 'c'), ['c', 'a', 'b'])
  assert.deepEqual(registrarReciente(['a', 'b'], 'z', 2), ['z', 'a'])
})

test('visibles: sin el abierto, sin los borrados/archivados, con tope', () => {
  const vivos = new Set(['a', 'b', 'c', 'd'])
  assert.deepEqual(recientesVisibles(['a', 'x', 'b', 'c'], vivos, 'a'), ['b', 'c'])
  assert.deepEqual(recientesVisibles(['a', 'b', 'c', 'd'], vivos, null, 2), ['a', 'b'])
  assert.deepEqual(recientesVisibles([], vivos, null), [])
})
