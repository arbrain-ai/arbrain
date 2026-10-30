import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { debeRecargar } from '../../src/lib/desfase-version'

test('servidor con otro build = recargar; mismo build = bug real, no recarga', () => {
  assert.equal(debeRecargar({ buildMio: 'aaa', buildServidor: 'bbb', yaIntentado: null }), true)
  assert.equal(debeRecargar({ buildMio: 'bbb', buildServidor: 'bbb', yaIntentado: null }), false)
})

test('una sola recarga por build del servidor: sin bucles', () => {
  assert.equal(debeRecargar({ buildMio: 'aaa', buildServidor: 'bbb', yaIntentado: 'bbb' }), false)
  assert.equal(debeRecargar({ buildMio: 'aaa', buildServidor: 'ccc', yaIntentado: 'bbb' }), true)
})

test('sin lectura del servidor o sin build propio no se inventa un deploy', () => {
  assert.equal(debeRecargar({ buildMio: 'aaa', buildServidor: null, yaIntentado: null }), false)
  assert.equal(debeRecargar({ buildMio: undefined, buildServidor: 'bbb', yaIntentado: null }), false)
})
