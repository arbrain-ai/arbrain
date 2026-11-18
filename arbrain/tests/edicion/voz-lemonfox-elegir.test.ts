// Elegir la voz de LemonFox en Ajustes › Voz: solo pasan las voces en español que LemonFox publica, la lista coincide
// con la que valida el daemon, la ruta del lector las reenvía y el selector se ve con la llave guardada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { VOCES_LEMONFOX, vozLemonfoxValida } from '../../src/features/primer-arranque/lib/voz-lemonfox'

const fuente = (ruta: string) => readFileSync(join(__dirname, '..', '..', ruta), 'utf8')

test('solo pasan las voces en español de LemonFox', () => {
  assert.deepEqual(VOCES_LEMONFOX.map(v => v.id), ['alex', 'dora'])
  assert.equal(vozLemonfoxValida('noel'), null, 'no confirmada en LemonFox')
  assert.equal(vozLemonfoxValida('dora'), 'dora')
  assert.equal(vozLemonfoxValida('heart'), null)
  assert.equal(vozLemonfoxValida('dora; x=1'), null)
  assert.equal(vozLemonfoxValida(undefined), null)
})

test('la web y el daemon validan la misma lista, y la ruta la reenvía', () => {
  assert.match(fuente('server/src/cliente/voz.ts'), /VOCES_LEMONFOX = \['alex', 'dora'\] as const/)
  assert.match(fuente('src/app/api/chat/tts/route.ts'), /\.\.\.\(voz \? \{ voz \} : \{\}\)/)
})

test('Ajustes › Voz muestra el selector con la llave de LemonFox guardada (en español)', () => {
  assert.match(fuente('src/features/primer-arranque/components/PanelVoz.tsx'), /\{vozLemonfox && !enIngles\(\) && <div className="basis-full"><ElegirVozLemonfox \/><\/div>\}/)
})

test('Ajustes › Mejoras: el selector y la voz elegida solo cuentan con la mejora prendida', () => {
  assert.match(fuente('src/features/primer-arranque/components/PanelVoz.tsx'), /const vozLemonfox = useMejora\('voz-lemonfox'\)/)
  // Apagada, el daemon ignora la voz pedida y suena la de siempre.
  assert.match(fuente('server/src/server.ts'), /mejoraActiva\('voz-lemonfox'\) \? parsed\['voz'\] : undefined/)
})
