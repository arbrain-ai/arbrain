import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { abiertosAlCambiar, alternar } from '../../src/features/canvas/state/panel-capitulos'

test('minipanel: al cambiar de tema solo queda abierto el activo; en la vista completa se conserva lo abierto', () => {
  assert.deepEqual([...abiertosAlCambiar(new Set([0, 2]), 1)], [1])
  assert.deepEqual([...abiertosAlCambiar(new Set([0, 2]), null)].sort(), [0, 2])
})

test('minipanel: tocar el nombre de otro tema lo abre o lo pliega; el activo queda abierto', () => {
  assert.deepEqual([...alternar(new Set([1]), 2)].sort(), [1, 2])
  assert.deepEqual([...alternar(new Set([1, 2]), 1)], [2])
  assert.deepEqual([...alternar(new Set([1]), 1, 1)], [1])
})
