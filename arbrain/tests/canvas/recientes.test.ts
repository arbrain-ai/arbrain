import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { recientesConRelleno, recientesVisibles, registrarReciente } from '../../src/features/canvas/state/recientes-lienzos'

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

test('con relleno: primero los abiertos aquí; si faltan, los editados hace menos (7 nov 2026)', () => {
  const vivos = ['e', 'd', 'c', 'b', 'a'].map(id => ({ id })) // del más reciente al más viejo
  assert.deepEqual(recientesConRelleno(['b', 'x'], vivos, null), ['b', 'e', 'd', 'c', 'a'])
  assert.deepEqual(recientesConRelleno([], vivos, 'e', 3), ['d', 'c', 'b'])
  assert.deepEqual(recientesConRelleno(['a', 'b', 'c', 'd', 'e', 'f'], vivos, null), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(recientesConRelleno(['a'], [], null), [])
})
