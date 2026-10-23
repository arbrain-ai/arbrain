import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vozNoAcelera } from '../../src/features/chat/lib/chat-speech'

// Muestras reales del 22 oct 2026 (lector del chat, frases de ~100 caracteres, volumen 0).
test('a 1.75x la voz que acelera no se marca: Chrome 25 car/s y WebKit 42 car/s', () => {
  assert.equal(vozNoAcelera(100, 4000, 1.75), false)
  assert.equal(vozNoAcelera(100, 2380, 1.75), false)
  assert.equal(vozNoAcelera(100, 3400, 2), false)
})

test('a 1.75x una voz a ritmo de 1x (14 car/s) se marca como que no acelera', () => {
  assert.equal(vozNoAcelera(100, 7140, 1.75), true)
  assert.equal(vozNoAcelera(100, 6000, 2), true)
})

test('sin muestra útil no se juzga: frase corta, rate bajo o duración mínima', () => {
  assert.equal(vozNoAcelera(30, 3000, 1.75), null)
  assert.equal(vozNoAcelera(100, 7000, 1.5), null)
  assert.equal(vozNoAcelera(100, 7000, 1), null)
  assert.equal(vozNoAcelera(60, 900, 1.75), null)
})
