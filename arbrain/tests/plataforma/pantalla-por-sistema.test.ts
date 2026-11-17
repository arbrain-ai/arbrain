/**
 * /pantalla sin pantalla virtual (16 nov 2026): en Windows y Mac ya no pide correr un comando de Linux.
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { textoSinPantalla } from '../../src/features/pantalla/sin-pantalla'

const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

test('Windows y Mac: sin comando de Linux; dice que no hay nada que instalar', () => {
  for (const ua of [WIN, MAC]) {
    const t = textoSinPantalla(ua)
    assert.doesNotMatch(t, /bash|nube\.sh/)
    assert.match(t, /no hay nada que instalar/)
  }
})

test('Linux (servidor): sigue diciendo cómo se instala', () => {
  assert.match(textoSinPantalla(LINUX), /nube\.sh pantalla/)
})

test('la vista usa el texto por sistema', () => {
  const s = readFileSync(path.resolve(import.meta.dirname, '../../src/features/pantalla/VistaPantalla.tsx'), 'utf8')
  assert.match(s, /fase === 'sin_pantalla' && textoSinPantalla\(/)
})
