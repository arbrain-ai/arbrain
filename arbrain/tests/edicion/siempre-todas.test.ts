// «Permitir siempre» en todas las tarjetas rutinarias y el camino a Autónomo cuando no se puede (un fundador en Windows, 29 oct
// 2026: «no me sale la opción de siempre»). La lógica vive en el daemon (arbrain/server/src/cliente/siempre-todas.test.ts);
// aquí, lo que la tarjeta pinta y que no rompa sus reglas: solo un clic humano aprueba y el navegador no manda el patrón.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cuerpoDecision, sugerenciaModo } from '../../src/features/permisos/lib/confirmacion'

const leer = (r: string) => readFileSync(new URL(r, import.meta.url), 'utf8')
const AVISO = (modo: string) => `para que no te pregunte esto, en Ajustes › Permisos y seguridad elige «${modo}»`

test('sin «siempre», la tarjeta ofrece el modo que sugirió el daemon; con «siempre» o en «Córrelo tú», nada', () => {
  assert.equal(sugerenciaModo({ avisos: ['esta conversación leyó contenido de afuera (x)', AVISO('Autónomo')] }), 'Autónomo')
  assert.equal(sugerenciaModo({ avisos: [AVISO('Automático en mi carpeta')] }), 'Automático en mi carpeta')
  assert.equal(sugerenciaModo({ avisos: [AVISO('Autónomo')], patron: '.claude/memory/**' }), null)
  assert.equal(sugerenciaModo({ avisos: [AVISO('Autónomo')], tipo: 'manos' }), null)
  assert.equal(sugerenciaModo({ avisos: ['una dirección nueva puede llevarse en su ruta datos de esta conversación'] }), null)
  assert.equal(sugerenciaModo({}), null)
})

test('el botón de modo solo abre Ajustes › Permisos: no aprueba ni manda nada al daemon', () => {
  const tc = leer('../../src/features/chat/components/TarjetaComando.tsx')
  const i = tc.indexOf('data-sugerencia-modo')
  assert.ok(i > 0, 'la tarjeta pinta el botón de modo')
  const bloque = tc.slice(i, tc.indexOf('</p>', i))
  assert.match(bloque, /useAjustes\.getState\(\)\.abrir\('seguridad'\)/)
  assert.doesNotMatch(bloque, /alClic|decidir|fetch\(/, 'el botón de modo no resuelve la confirmación')
  assert.match(bloque, /Que no me pregunte: modo/)
  // El aviso de la regla de memoria se ve junto al «siempre».
  assert.match(tc, /c\.patronAviso && <p className=\{s\.pie\} data-patron-aviso/)
})

test('el navegador nunca manda el patrón: el cuerpo de «siempre» solo lleva id, decisión, alcance y comentario', () => {
  const cuerpo = cuerpoDecision('cf_x', 'permitir', { alcance: 'siempre', comentario: '' }) as Record<string, unknown>
  assert.equal('patron' in cuerpo, false)
  assert.ok(Object.keys(cuerpo).every(k => ['id', 'decision', 'alcance', 'comentario'].includes(k)), Object.keys(cuerpo).join(','))
})

test('Ajustes › Permisos muestra cada regla con su frase y su patrón, y se quita con un clic', () => {
  const r = leer('../../src/features/permisos/components/ReglasSiempre.tsx')
  assert.match(r, /Lo que ya no te pregunta/)
  assert.match(r, /r\.frase/)
  assert.match(r, /\{r\.patron\}/)
  assert.match(r, /quitar: id/)
})
