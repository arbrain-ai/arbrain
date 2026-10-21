import assert from 'node:assert/strict'
import test from 'node:test'
import { AGENTES, ORDEN_AGENTES, contextoDeAgente, esAgenteId } from '../../src/features/live/agents'

test('Levy va fijado primero y sin enfoque extra: su turno queda igual que siempre', () => {
  assert.deepEqual(ORDEN_AGENTES, ['levy', 'trinity', 'sensei'])
  assert.equal(contextoDeAgente('levy'), undefined)
})

test('Trinity y Sensei son caras del mismo cerebro: enfoque propio, misma memoria', () => {
  for (const id of ['trinity', 'sensei'] as const) {
    const ctx = contextoDeAgente(id)
    assert.ok(ctx && /mismo cerebro de Levy/.test(ctx) && /misma memoria/.test(ctx), id)
  }
  assert.match(contextoDeAgente('trinity')!, /Gmail, Calendario, Drive/)
  assert.match(contextoDeAgente('sensei')!, /código/)
})

test('cada agente trae avatar, retrato y voz propios', () => {
  const modelos = new Set(ORDEN_AGENTES.map(id => AGENTES[id].modelo))
  assert.equal(modelos.size, 3)
  for (const id of ORDEN_AGENTES) assert.equal(AGENTES[id].voz, id)
})

test('esAgenteId rechaza lo ajeno (estado guardado corrupto vuelve a Levy)', () => {
  assert.equal(esAgenteId('trinity'), true)
  assert.equal(esAgenteId('grok'), false)
  assert.equal(esAgenteId(null), false)
})
