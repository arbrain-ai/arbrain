import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mejorVozEspanol } from '../../src/features/chat/lib/chat-speech'
import { consejoSinVozEspanol, idiomaDeRespaldo, idiomaPreferido } from '../../src/features/chat/lib/voz-sistema'

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

// 29 oct 2026, un fundador en Windows 11 (España): «en Windows las cosas funcionan diferentes… lo de la voz por ejemplo».
test('Windows en España: con el mismo nivel de calidad gana la voz de su región (es-ES), no la de México', () => {
  const voces = [
    v('Microsoft Zira - English (United States)', 'en-US', { default: true }),
    v('Microsoft Sabina - Spanish (Mexico)', 'es-MX'),
    v('Microsoft Helena - Spanish (Spain)', 'es-ES'),
  ]
  assert.equal(mejorVozEspanol(voces, idiomaPreferido(['es-ES', 'es', 'en']))?.name, 'Microsoft Helena - Spanish (Spain)')
  // Sin su idioma, el orden de siempre (México primero).
  assert.equal(mejorVozEspanol(voces)?.name, 'Microsoft Sabina - Spanish (Mexico)')
  // Una voz Natural sigue ganando a la de escritorio aunque sea de otra región.
  assert.equal(mejorVozEspanol([...voces, v('Microsoft VozSeis Online (Natural) - Spanish (Mexico)', 'es-MX')], 'es-ES')?.name, 'Microsoft VozSeis Online (Natural) - Spanish (Mexico)')
})

test('idioma del sistema: el primer español con región; sin él, la frase sale en es-MX', () => {
  assert.equal(idiomaPreferido(['es-ES', 'en-US']), 'es-ES')
  assert.equal(idiomaPreferido(['en-US', 'es_mx']), 'es-MX')
  assert.equal(idiomaPreferido(['es-419']), 'es-419')
  assert.equal(idiomaPreferido(['es', 'en-US']), null)
  assert.equal(idiomaDeRespaldo(['es-ES']), 'es-ES')
  assert.equal(idiomaDeRespaldo(['en-US']), 'es-MX')
  assert.equal(idiomaDeRespaldo(undefined), 'es-MX')
})

test('sin voz en español, Ajustes › Voz dice dónde instalarla en SU sistema', () => {
  assert.match(consejoSinVozEspanol('windows'), /Configuración › Hora e idioma › Voz/)
  assert.match(consejoSinVozEspanol('mac'), /Contenido hablado/)
  assert.doesNotMatch(consejoSinVozEspanol('windows'), /macOS|Mac\b/)
})
