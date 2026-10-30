// Teclado del iPhone (19 oct 2026, Daniel: «con el teclado abierto no se ve la caja de texto»). El foco puede salir del
// composer y volver sin que el teclado se cierre; no llega ningún resize del visualViewport. Un focusout que borra
// --app-h a ciegas deja el shell a 100dvh con el composer debajo del teclado. Prueba de navegador completa:
// docs/builds/movil-teclado-2026-10-19/teclado.mjs.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const shell = readFileSync(join(import.meta.dirname, '../../src/app/(main)/dashboard-shell.tsx'), 'utf8')

test('el focusout vuelve a medir el viewport y no borra --app-h a ciegas', () => {
  assert.match(shell, /document\.addEventListener\('focusout', onFocusOut\)/)
  assert.match(shell, /document\.addEventListener\('focusin', resyncSoon\)/)
  const cuerpo = shell.slice(shell.indexOf('const onFocusOut'), shell.indexOf("vv.addEventListener('resize', sync)"))
  assert.ok(cuerpo.length > 0)
  assert.doesNotMatch(cuerpo, /removeProperty\('--app-h'\)/)
  assert.doesNotMatch(cuerpo, /classList\.remove\('keyboard-open'\)/)
})
