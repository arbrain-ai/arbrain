import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { herramientasEnOrden, snapshotMessage } from '../../src/features/chat/lib/durable-recovery'

// runtimeSnapshot.tools es JSONB por toolId: Postgres devuelve las llaves reordenadas (largo, luego bytes).
test('una sesión recargada pinta las herramientas en el orden en que corrieron, no en el de sus ids', () => {
  const recargado = {
    toolu_01A: { name: 'Bash', status: 'completed', orden: 2 },
    toolu_01B: { name: 'Read', status: 'completed', orden: 0 },
    toolu_01C: { name: 'Grep', status: 'completed', orden: 1 },
  }
  assert.deepEqual(snapshotMessage({ tools: recargado }).toolCalls?.map(t => t.toolName), ['Read', 'Grep', 'Bash'])
})

test('turnos viejos sin `orden` conservan el orden de sus llaves; los que no lo traen van al final, estables', () => {
  const viejo = { b: { name: 'Uno' }, a: { name: 'Dos' }, c: { name: 'Tres' } }
  assert.deepEqual(herramientasEnOrden(viejo).map(([id]) => id), ['b', 'a', 'c'])
  const mixto = { x: { name: 'sin' }, y: { name: 'segundo', orden: 1 }, z: { name: 'primero', orden: 0 }, w: { name: 'sin2' } }
  assert.deepEqual(herramientasEnOrden(mixto).map(([id]) => id), ['z', 'y', 'x', 'w'])
  assert.deepEqual(herramientasEnOrden(undefined), [])
})
