import test from 'node:test'
import assert from 'node:assert/strict'
import { ESTABLE_MS, listoParaAplazar } from '../src/features/chat/hooks/useFueraDeVista'

// 11 oct 2026: un mensaje medido antes de tener su contenido final reservaba 129 px para 1734 reales.
test('no se aplaza un mensaje cuyo alto acaba de cambiar', () => {
  assert.equal(listoParaAplazar(1734, ESTABLE_MS - 1, false), false)
  assert.equal(listoParaAplazar(1734, ESTABLE_MS, false), true)
})

test('no se aplaza un mensaje en streaming aunque su alto esté quieto', () => {
  assert.equal(listoParaAplazar(900, ESTABLE_MS * 10, true), false)
})

test('no se aplaza un mensaje sin pintar (alto cero, panel oculto)', () => {
  assert.equal(listoParaAplazar(0, ESTABLE_MS * 10, false), false)
})
