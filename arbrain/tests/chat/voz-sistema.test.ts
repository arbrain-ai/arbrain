import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mejorVozEspanol } from '../../src/features/chat/lib/chat-speech'
import { consejoSinVozEspanol, DICTADO_BPS_LIGERO, dictadoLigero, idiomaDeRespaldo, idiomaPreferido, lineaDictado, opcionesGrabacion } from '../../src/features/chat/lib/voz-sistema'

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

// ── Dictado ligero (12 nov 2026): datos móviles del teléfono ─────────────────────────────────────────────────────────
test('el dictado va a 32 kbps solo en un cliente remoto fuera de la app de escritorio', () => {
  assert.equal(DICTADO_BPS_LIGERO, 32_000)
  assert.equal(dictadoLigero('servidor.ejemplo.lan', false), true) // el teléfono desde fuera
  assert.equal(dictadoLigero('localhost', false), false)
  assert.equal(dictadoLigero('127.0.0.1', false), false)
  assert.equal(dictadoLigero('tauri.localhost', false), false)
  assert.equal(dictadoLigero('servidor.ejemplo.lan', true), false) // la app de la Mac, aunque sea remota
  assert.deepEqual(opcionesGrabacion('audio/mp4', true), { mimeType: 'audio/mp4', audioBitsPerSecond: 32_000 })
  assert.deepEqual(opcionesGrabacion('audio/mp4', false), { mimeType: 'audio/mp4' })
  assert.deepEqual(opcionesGrabacion(undefined, true), { audioBitsPerSecond: 32_000 })
  assert.equal(opcionesGrabacion(undefined, false), undefined)
})

test('la bitácora del dictado: peso, duración y bitrate; nunca el texto', () => {
  const j = JSON.parse(lineaDictado({ bytes: 120_000, tipo: 'audio/mp4', segundos: '30.004', bps_pedido: '32000', bps_real: '32000', ligero: '1' }, 'iPhone', new Date('2026-11-12T18:00:00Z')))
  assert.equal(j.bytes, 120_000)
  assert.equal(j.segundos, 30)
  assert.equal(j.kbps_efectivo, 32)
  assert.equal(j.bps_real, 32_000)
  assert.equal(j.ligero, true)
  const sin = JSON.parse(lineaDictado({ bytes: 5000, tipo: 'audio/webm', segundos: 'x', bps_real: undefined }, '', new Date()))
  assert.equal(sin.segundos, null)
  assert.equal(sin.kbps_efectivo, null)
  assert.equal(sin.bps_pedido, null)
  assert.equal(sin.ligero, false)
})
