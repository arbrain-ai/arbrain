// Idioma de la interfaz (13 nov 2026, «Arbrain en inglés»): un solo catálogo inglés, `server/src/i18n/en.json`, cuya
// llave es el texto español. Cada texto que el código marca (`tr`, `trn`, `trNodos`, `trMarca`, `trMarcas`) tiene su
// inglés, con las mismas variables `{x}`; ningún `tr()` recibe una plantilla con `${}` (no tendría llave fija).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extraerLlaves, leerCatalogo, listarArchivos, problemasPar, RAIZ } from '../../scripts/i18n/lib.mjs'

type Llaves = { llaves: Map<string, string[]>; plantillas: Array<{ archivo: string; linea: number; texto: string }> }

const { llaves, plantillas } = extraerLlaves(listarArchivos(['src', 'server/src'])) as Llaves
const catalogo = leerCatalogo() as Record<string, string>

test('el catálogo inglés es JSON válido, sin traducciones vacías', () => {
  const crudo = JSON.parse(readFileSync(join(RAIZ, 'server/src/i18n/en.json'), 'utf8')) as Record<string, unknown>
  for (const [es, en] of Object.entries(crudo)) assert.ok(typeof en === 'string' && en.trim(), `vacía: ${es}`)
})

test('cada texto marcado en el código tiene su inglés', () => {
  const faltan = [...llaves].filter(([es]) => !(es in catalogo)).map(([es, donde]) => `${JSON.stringify(es)} (${donde[0]})`)
  assert.deepEqual(faltan.slice(0, 30), [], `${faltan.length} sin inglés; corre node scripts/i18n/revisar.mjs`)
})

test('las variables {x} son las mismas en español y en inglés', () => {
  const malos = Object.entries(catalogo).flatMap(([es, en]) => problemasPar(es, en).map((p: string) => `${JSON.stringify(es)}: ${p}`))
  assert.deepEqual(malos, [])
})

test('ningún tr() recibe una plantilla con ${}', () => {
  assert.deepEqual(plantillas.map((p) => `${p.archivo}:${p.linea} ${p.texto}`), [])
})
