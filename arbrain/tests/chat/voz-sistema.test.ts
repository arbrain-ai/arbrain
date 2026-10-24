import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mejorVozEspanol } from '../../src/features/chat/lib/chat-speech'

// Grupal del 23 oct 2026: «la voz por defecto en Windows es fea». Fuera de Apple se elige la mejor voz en español.
const v = (name: string, lang: string, extra: { default?: boolean } = {}) => ({ name, lang, localService: true, ...extra })

test('Windows con Edge/WebView2: gana la voz Natural es-MX sobre la de escritorio y la de España', () => {
  const voces = [
    v('Microsoft VozUno - English (United States)', 'en-US', { default: true }),
    v('Microsoft VozDos - Spanish (Spain)', 'es-ES'),
    v('Microsoft VozTres - Spanish (Mexico)', 'es-MX'),
    v('Microsoft VozCuatro Online (Natural) - Spanish (Spain)', 'es-ES'),
    v('Microsoft VozCinco Online (Natural) - Spanish (Mexico)', 'es-MX'),
  ]
  assert.equal(mejorVozEspanol(voces)?.name, 'Microsoft VozCinco Online (Natural) - Spanish (Mexico)')
})

test('sin voces naturales: Google antes que la robótica, México antes que España', () => {
  assert.equal(mejorVozEspanol([v('Microsoft VozDos - Spanish (Spain)', 'es-ES'), v('Google español de Estados Unidos', 'es-US')])?.name, 'Google español de Estados Unidos')
  assert.equal(mejorVozEspanol([v('Microsoft VozDos - Spanish (Spain)', 'es-ES'), v('Microsoft VozTres - Spanish (Mexico)', 'es-MX')])?.name, 'Microsoft VozTres - Spanish (Mexico)')
  assert.equal(mejorVozEspanol([v('espeak', 'es_419')])?.name, 'espeak')
})

test('ninguna en español: null (el sistema decide con lang es-MX), nunca una voz en inglés', () => {
  assert.equal(mejorVozEspanol([v('Microsoft VozUno - English (United States)', 'en-US', { default: true })]), null)
  assert.equal(mejorVozEspanol([]), null)
})
