import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sinNulos } from '../../src/lib/sin-nulos'

test('quita NUL de cadenas a cualquier profundidad, también en llaves', () => {
  const sucio = { a: 'x\u0000y', b: [{ c: '\u0000z' }], ['k\u0000']: 1, n: 3, nada: null }
  assert.deepEqual(sinNulos(sucio), { a: 'xy', b: [{ c: 'z' }], k: 1, n: 3, nada: null })
})

test('un sustituto suelto se vuelve el carácter de reemplazo', () => {
  assert.equal(sinNulos('a\ud83db'), 'a�b')
  assert.equal(sinNulos('ok 😀'), 'ok 😀')
})

test('lo limpio pasa igual', () => {
  const limpio = { t: 'hola', l: [1, 'dos'] }
  assert.deepEqual(sinNulos(limpio), limpio)
})
