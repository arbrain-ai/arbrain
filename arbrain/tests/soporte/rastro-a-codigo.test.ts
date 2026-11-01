/** Del rastro de errores-pantalla.jsonl al código (scripts/soporte/rastro-a-codigo.mjs, 31 oct 2026). */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { fragmento, literalesCerca, pasosDelStack } from '../../scripts/soporte/rastro-a-codigo.mjs'

test('pasosDelStack: Chrome/WebView2 y Safari, con o sin origen y con ?dpl=', () => {
  const stack = [
    "TypeError: Cannot read properties of undefined (reading 'id')",
    '    at Ab (http://127.0.0.1:4310/_next/static/chunks/5013-d96d566be22b32c0.js:1:63396)',
    '    at http://127.0.0.1:4310/_next/static/chunks/app/(main)/chat/page-697900523f9edca7.js?dpl=x:2:15',
    'ab@/_next/static/chunks/main-5f2ffc5905a70474.js:1:99',
  ].join('\n')
  assert.deepEqual(pasosDelStack(stack), [
    { archivo: '/_next/static/chunks/5013-d96d566be22b32c0.js', linea: 1, columna: 63396 },
    { archivo: '/_next/static/chunks/app/(main)/chat/page-697900523f9edca7.js', linea: 2, columna: 15 },
    { archivo: '/_next/static/chunks/main-5f2ffc5905a70474.js', linea: 1, columna: 99 },
  ])
  assert.deepEqual(pasosDelStack(undefined), [])
})

test('fragmento marca la columna y literalesCerca prefiere texto de interfaz, el más cercano primero', () => {
  const linea = 'x("aria-label");y("button");const a=f.g?"Mirando tu Arbrain…":"Mirando el Studio…";h(t.id);z("Nadie trabaja ahora")'
  const col = linea.indexOf('t.id') + 1
  assert.match(fragmento(linea, 1, col, 10), /⟦aquí⟧t\.id/)
  const lits = literalesCerca(linea, 1, col)
  assert.equal(lits[0], 'Nadie trabaja ahora')
  assert.ok(lits.includes('Mirando el Studio…'))
  assert.ok(!lits.includes('aria-label') && !lits.includes('button'))
})
