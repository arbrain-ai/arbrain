import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describirEquipo } from '../../src/features/cabina/panel/equipo-ua'

const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'

test('dice aparato, navegador y desde dónde llegó, en una pista legible', () => {
  assert.equal(describirEquipo(CHROME_MAC, '127.0.0.1:3300'), 'Mac · Chrome · local')
  assert.equal(describirEquipo(CHROME_MAC, 'estudio.ejemplo.ts.net'), 'Mac · Chrome · por estudio.ejemplo.ts.net')
  assert.equal(describirEquipo(SAFARI_IPHONE, 'localhost:3300'), 'iPhone · Safari · local')
  assert.equal(describirEquipo(null, null), 'aparato desconocido · local')
})
