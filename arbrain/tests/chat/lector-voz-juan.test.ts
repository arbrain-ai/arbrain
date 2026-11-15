import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { debeRecuperarVoz, mejorVozEspanol } from '../../src/features/chat/lib/chat-speech'
import { esVozNovedad, idiomaDeRespaldo } from '../../src/features/chat/lib/voz-sistema'

// 12 nov 2026, 07:41, Daniel: «wtf porque se cambio la voz a voz de vieja si tenia la de juan haha, resuelve y que no
// vuelva a pasar». lector.jsonl: 07:36:23 `falla · contexto suspendido · servidor: false` → voz del navegador. En la app
// (WKWebView) el lector no fija voz y manda `lang`; con el `es-419` del macOS de Daniel, WebKit eligió una voz compacta
// femenina (medido: 23.5 s contra 29.1 s de Juan en el mismo texto). Con `es-MX`, Juan.

const fuente = readFileSync(new URL('../../src/features/chat/lib/chat-speech.ts', import.meta.url), 'utf8')

test('en Apple el respaldo pide es-MX (Juan) aunque el sistema esté en es-419, es-US o sin español', () => {
  assert.equal(idiomaDeRespaldo(['es-419'], true), 'es-MX')
  assert.equal(idiomaDeRespaldo(['es-US', 'en-US'], true), 'es-MX')
  assert.equal(idiomaDeRespaldo(['en-US'], true), 'es-MX')
  assert.equal(idiomaDeRespaldo(undefined, true), 'es-MX')
  // Un fundador en España conserva su voz.
  assert.equal(idiomaDeRespaldo(['es-ES'], true), 'es-ES')
  // Fuera de Apple no cambia nada (Windows elige voz por nombre; el lang solo es el último respaldo).
  assert.equal(idiomaDeRespaldo(['es-419']), 'es-419')
})

test('el lector de la app usa el respaldo de Apple (no el es-419 crudo del sistema)', () => {
  assert.match(fuente, /idiomaDeRespaldo\(idiomasSistema\(\), esApple\)/)
  assert.doesNotMatch(fuente, /idiomaDeRespaldo\(idiomasSistema\(\)\)/)
})

test('las voces novedad de Apple nunca son respaldo: Abuela, Grandma, Eddy, Flo, Reed, Rocko, Sandy, Shelley…', () => {
  for (const name of ['Grandma', 'Grandpa', 'Abuela', 'Abuelo', 'Eddy', 'Flo', 'Reed', 'Rocko', 'Sandy', 'Shelley',
    'Grandma (Español (México))', 'Eddy (Spanish (Mexico))', 'Zarvox', 'Bad News', 'Whisper'])
    assert.ok(esVozNovedad({ name }), name)
  assert.ok(esVozNovedad({ name: 'X', voiceURI: 'com.apple.eloquence.es-MX.Grandma' }))
  for (const name of ['Juan (Enhanced)', 'Juan (mejorada)', 'Paulina', 'Microsoft Sabina - Spanish (Mexico)', 'Google español de Estados Unidos'])
    assert.ok(!esVozNovedad({ name }), name)
})

test('mejorVozEspanol salta las voces novedad aunque sean las únicas «mejoradas» o la de su región', () => {
  const v = (name: string, lang: string) => ({ name, lang, localService: true })
  assert.equal(mejorVozEspanol([v('Grandma (Español (México))', 'es-MX'), v('Paulina', 'es-MX')])?.name, 'Paulina')
  assert.equal(mejorVozEspanol([v('Eddy (Español (México))', 'es-MX'), v('Shelley (Español (México))', 'es-MX')]), null)
  assert.equal(mejorVozEspanol([v('Flo (Español (España))', 'es-ES'), v('Juan (Enhanced)', 'es-MX')], 'es-ES')?.name, 'Juan (Enhanced)')
})

test('un toque devuelve la voz del servidor solo si la caída fue del audio local', () => {
  assert.equal(debeRecuperarVoz(true, false), true) // contexto suspendido: el toque lo desbloquea
  assert.equal(debeRecuperarVoz(false, false), false) // servidor caído: vuelve por el sondeo, no en cada toque
  assert.equal(debeRecuperarVoz(true, true), false) // ya está con la voz del servidor
})

test('todo toque (tap, reanudar, salto) pasa por la recuperación, y la falla local queda marcada', () => {
  assert.match(fuente, /private marcarToque\(tipo: string\) \{\s*this\.toque = \{ t: this\.now\(\), tipo \}\s*this\.recuperaVozEnToque\(\)/)
  for (const t of ['reanudar', 'tap', 'salto']) assert.match(fuente, new RegExp(`this\\.marcarToque\\('${t}'\\)`))
  assert.match(fuente, /this\.fallaLocal = !o\.servidor/)
  assert.match(fuente, /recuperaVozEnToque\(\) \{[\s\S]{0,200}this\.voz\.reintentar\(\)\s*this\.voz\.desbloquear\(\)/)
})
