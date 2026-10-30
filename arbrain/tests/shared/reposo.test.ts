import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { FACTOR_SIN_FOCO, tocaLeer } from '../../src/shared/lib/reposo'

test('oculta nunca sondea', () => {
  assert.equal(tocaLeer(4000, 0, 1e9, 'oculta'), false)
})

test('activa lee una vez por intervalo, aunque varios relojes compartan la fuente', () => {
  assert.equal(tocaLeer(4000, undefined, 10_000, 'activa'), true)
  assert.equal(tocaLeer(4000, 10_000, 11_500, 'activa'), false) // el segundo reloj llega 1.5 s después: no relee
  assert.equal(tocaLeer(4000, 10_000, 13_300, 'activa'), true)  // el desfase y la latencia caben en el 0.8
})

test('sin foco sondea más lento, no se apaga', () => {
  const cada = 1200, leido = 0
  assert.equal(tocaLeer(cada, leido, cada, 'sin-foco'), false)
  assert.equal(tocaLeer(cada, leido, cada * FACTOR_SIN_FOCO, 'sin-foco'), true)
})
