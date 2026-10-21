import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { effortLabel, stopLabel, DEFAULT_EFFORT } from '../../src/features/chat/lib/effort-labels'

test('esfuerzo: etiquetas en español como Claude Desktop y default medium, nunca «Default»', () => {
  assert.deepEqual(['low', 'medium', 'high', 'xhigh', 'max'].map(effortLabel), ['Bajo', 'Medio', 'Alto', 'Muy alto', 'Máximo'])
  assert.equal(DEFAULT_EFFORT, 'medium')
  assert.equal(effortLabel(null), 'Esfuerzo', 'sin nivel confirmado no se inventa uno')
  assert.equal(effortLabel(undefined), 'Esfuerzo')
  assert.equal(effortLabel('  '), 'Esfuerzo')
  assert.equal(effortLabel('turbo'), 'Turbo', 'un nivel nuevo del SDK se muestra tal cual, no se oculta')
  assert.ok(!['null', 'low', 'medium', 'xhigh'].some(level => effortLabel(level).toLowerCase() === 'default'))
})

test('esfuerzo: el chip suma Ultracode', () => {
  assert.equal(stopLabel('xhigh', false), 'Muy alto')
  assert.equal(stopLabel('xhigh', true), 'Muy alto · Ultracode')
  assert.equal(stopLabel(null, false), 'Esfuerzo')
  assert.equal(stopLabel(null, true), 'Ultracode')
})
