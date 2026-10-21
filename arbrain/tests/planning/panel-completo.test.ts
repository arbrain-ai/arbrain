import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

// El calendario de la sección es el mismo de la pestaña del panel (4 oct 2026): se adapta a SU ancho.
test('el calendario responde al ancho de su contenedor, no al de la ventana', () => {
  const css = readFileSync(new URL('../../src/features/planning/planning.module.css', import.meta.url), 'utf8')
  assert.match(css, /\.root \{ container:planning \/ inline-size;/)
  assert.doesNotMatch(css, /@media\s*\(max-width/)
})

test('la pestaña Calendario del panel monta el editor de la sección', () => {
  const src = readFileSync(new URL('../../src/features/cabina/panel/Secciones.tsx', import.meta.url), 'utf8')
  assert.match(src, /<PlanningCalendar donde="panel"/)
})
