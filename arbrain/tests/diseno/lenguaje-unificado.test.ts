// Lenguaje unificado (27 oct 2026): las superficies no tienen colores sueltos y el estilo actual queda intacto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { sueltos } from '../../scripts/diseno/colores-sueltos.mjs'
import { parsear, contraste, sobre } from '../../scripts/diseno/colores.mjs'

const lenguaje = readFileSync(new URL('../../src/app/lenguaje.css', import.meta.url), 'utf8')

test('ninguna superficie tiene colores sueltos', () => {
  const h = sueltos() as { archivo: string; linea: number; color: string }[]
  assert.equal(h.length, 0, h.slice(0, 10).map(x => `${x.archivo}:${x.linea} ${x.color}`).join('\n'))
})

test('los tokens --l-* solo existen con html[data-estilo=unificado]', () => {
  const sinEstilo = lenguaje.split('\n').filter(l => /^[^/\s*][^{]*\{/.test(l) && !/data-estilo='unificado'/.test(l) && !/^@(layer|media)/.test(l))
  assert.deepEqual(sinEstilo, [])
})

test('la tinta morada del estilo unificado pasa AA sobre negro y sobre blanco', () => {
  const oscuro = lenguaje.match(/html\.dark\[data-estilo='unificado'\] \{[\s\S]*?--l-tinta-morado: (#[0-9a-f]{6})/i)?.[1]
  const claro = lenguaje.match(/:not\(\.dark\) \{[\s\S]*?--l-tinta-morado: (#[0-9a-f]{6})/i)?.[1]
  assert.ok(oscuro && claro)
  for (const fondo of ['#09090b', '#141418', '#1c1c22']) assert.ok(contraste(parsear(oscuro), parsear(fondo)) >= 4.5, `${oscuro} sobre ${fondo}`)
  assert.ok(contraste(parsear(claro), parsear('#ffffff')) >= 4.5)
  // también sobre el velo neutro más fuerte que usa una tarjeta (12 %)
  assert.ok(contraste(parsear(oscuro), sobre({ r: 190, g: 190, b: 205, a: 0.12 }, parsear('#141418'))) >= 4.5)
})

test('todo token --l-* que usa la app está definido en lenguaje.css (si no, el unificado caería en silencio al estilo actual)', () => {
  const raiz = new URL('../../src/', import.meta.url)
  const usados = new Set<string>()
  for (const f of readdirSync(raiz, { recursive: true }).map(String).filter(f => /\.(css|tsx?)$/.test(f) && !f.endsWith('lenguaje.css'))) {
    for (const m of readFileSync(new URL(f, raiz), 'utf8').matchAll(/var\((--l-[a-z0-9-]+)/g)) usados.add(m[1])
  }
  const definidos = new Set([...lenguaje.matchAll(/(--l-[a-z0-9-]+):/g)].map(m => m[1]))
  assert.deepEqual([...usados].filter(t => !definidos.has(t)), [])
})
