/** Menú de Contenido (19 nov 2026): los enlaces viejos `?tab=…` siguen abriendo su sección. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { pestanaDe, tabDe } from '../../src/features/contenido/secciones'

test('enlaces viejos y nuevos llegan a su sección; lo desconocido, a Inicio', () => {
  const casos: [string, string][] = [['aprender', 'aprender'], ['inicio', 'aprender'], ['radar', 'radar'], ['intel', 'radar'], ['ideas', 'ideas'], ['production', 'ideas'],
    ['canal', 'canal'], ['results', 'canal'], ['contenido', 'canal'], ['despues', 'despues'], ['watch-later', 'despues'], ['guardados', 'guardados'], ['saved', 'guardados'],
    ['descargas', 'descargas'], ['bandeja', 'inbox'], ['comments', 'inbox'], ['leads', 'inbox'], ['comentarios', 'inbox'], ['cualquier-cosa', 'aprender'], ['', 'aprender']]
  for (const [raw, esperado] of casos) assert.equal(pestanaDe(raw), esperado, raw)
})

test('cada sección tiene su dirección y vuelve a sí misma', () => {
  for (const id of ['aprender', 'radar', 'ideas', 'canal', 'despues', 'guardados', 'descargas', 'inbox'] as const) assert.equal(pestanaDe(tabDe(id)), id)
  assert.equal(tabDe('inbox'), 'bandeja')
})
