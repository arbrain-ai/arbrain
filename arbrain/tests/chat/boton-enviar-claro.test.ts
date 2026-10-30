import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sinLenguaje } from '../diseno/sin-lenguaje'

const css = sinLenguaje(readFileSync(new URL('../../src/features/chat/components/boton-enviar.module.css', import.meta.url), 'utf8'))

// 25 oct 2026, 08:54, Daniel: en tema claro, enviar deja la tecla oscura y vuelve a la cara de titanio clara con volumen, en morado.
test('enviar en claro: titanio claro con volumen en morado de marca; en oscuro sigue ámbar; detener no cambia', () => {
  const claro = css.match(/:global\(:root:not\(\.dark\)\) \.enviar:not\(\.detener\) \{([^}]*)\}/)?.[1] ?? ''
  assert.match(claro, /--luz-rgb: var\(--brand-rgb\)/)
  assert.match(claro, /--cara-clara: linear-gradient\(180deg, #a870ff, #6512c0\)/)
  assert.doesNotMatch(claro, /--placa-arriba: #35353e/, 'sin la tecla oscura en claro')
  assert.match(css, /\.enviar \{\n  --luz-rgb: var\(--gold-rgb\);/, 'la base (oscuro) sigue en ámbar')
  assert.match(css, /\.detener \{\n  --luz-rgb: var\(--brand-rgb\);[^}]*--cara-clara: linear-gradient\(180deg, #a870ff, #6512c0\);/)
})
