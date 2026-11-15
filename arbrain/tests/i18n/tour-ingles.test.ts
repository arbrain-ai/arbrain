// El recorrido de bienvenida en inglés (13 nov 2026, «Arbrain en inglés»): con Ajustes › Idioma en English, la app
// entrega el guion inglés (guion.en.md de la copia del dueño, o el incorporado), con los mismos ids, paneles y huecos que
// el español: lo visto cuenta igual en los dos idiomas y los botones que nombra existen con ese nombre.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parsearGuion } from '../../src/features/primer-arranque/lib/tour'
import { GUION_INCORPORADO } from '../../src/features/primer-arranque/textos/tour-guion'
import { GUION_INCORPORADO_EN } from '../../src/features/primer-arranque/textos/tour-guion-en'
import { leerGuion, RUTA_GUION_EN } from '../../src/features/primer-arranque/lib/tour-servidor'
import { traduccionEn } from '../../src/shared/i18n/tr'

const PLANTILLA_EN = new URL('../../empaquetado/plantillas/skills/tour-bienvenida/guion.en.md', import.meta.url)

test('el guion inglés de la plantilla es el incorporado, con los mismos capítulos, paneles y huecos que el español', () => {
  assert.equal(GUION_INCORPORADO_EN, readFileSync(PLANTILLA_EN, 'utf8'))
  const es = parsearGuion(GUION_INCORPORADO), en = parsearGuion(GUION_INCORPORADO_EN)
  assert.deepEqual(en.capitulos.map(c => c.id), es.capitulos.map(c => c.id))
  assert.deepEqual(en.capitulos.map(c => c.mostrar), es.capitulos.map(c => c.mostrar))
  assert.deepEqual(en.conocidos, es.conocidos)
  assert.equal(en.version, es.version)
  for (const [i, c] of en.capitulos.entries()) {
    const huecos = (t: string) => [...t.matchAll(/\{\{\w+\}\}/g)].map(m => m[0]).sort().join()
    assert.equal(huecos(c.texto), huecos(es.capitulos[i].texto), `${c.id}: mismos {{huecos}}`)
    assert.ok(c.texto.length < 1100, `${c.id} es largo (${c.texto.length})`)
    assert.doesNotMatch(c.texto, /[áéíóúñ¿¡]/i, `${c.id}: quedó español`)
  }
  // Los botones que nombra el capítulo de rutinas son los de la app en inglés.
  const rutinas = en.capitulos.find(c => c.id === 'rutinas')!.texto
  assert.ok(rutinas.includes(`**${traduccionEn('Activar')}**`) && rutinas.includes(`**${traduccionEn('Probar una vez')}**`))
})

test('con English la app lee guion.en.md de la copia; sin él, el incorporado en inglés; con Español, el de siempre', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'tour-en-'))
  assert.equal(leerGuion(raiz, 'en').capitulos[0].titulo, 'Before we start')
  assert.equal(leerGuion(raiz, 'es').capitulos[0].titulo, 'Antes de empezar')
  mkdirSync(join(raiz, '.claude', 'skills', 'tour-bienvenida'), { recursive: true })
  writeFileSync(join(raiz, RUTA_GUION_EN), '## inicio · Hello from my own script\n\nEdited by the owner.\n')
  assert.equal(leerGuion(raiz, 'en').capitulos[0].titulo, 'Hello from my own script')
  assert.equal(leerGuion(raiz, 'es').capitulos[0].titulo, 'Antes de empezar')
})
