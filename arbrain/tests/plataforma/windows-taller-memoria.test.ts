/**
 * Taller › Memoria en Windows (16 nov 2026, un fundador: «en habilidades, tampoco me aparece ninguna»). La ruta
 * /api/cabina/archivos armaba las rutas con `path.join` (en Windows, `\`): Habilidades salía vacío y abrir un documento o
 * MEMORY.md respondía «Ese archivo no es del cerebro». La primera prueba reproduce lo que hacía Windows con `path.win32`.
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { esEntradaSkill, limpiarPedida, unirRel, VETADO } from '../../src/features/cabina/archivos-cerebro'

const WEB = path.resolve(import.meta.dirname, '../..')

test('Windows: las skills del cerebro se reconocen aunque la ruta venga con «\\»', () => {
  const comoWindows = path.win32.join('.claude/skills', 'presentaciones', 'SKILL.md')
  assert.equal(comoWindows, '.claude\\skills\\presentaciones\\SKILL.md')
  assert.equal(comoWindows.endsWith('/SKILL.md'), false) // por esto Habilidades salía vacío
  assert.equal(esEntradaSkill(comoWindows), true)
  assert.equal(esEntradaSkill(unirRel('.claude/skills/presentaciones', 'SKILL.md')), true)
  assert.equal(esEntradaSkill('.claude/skills/presentaciones/references/SKILL.md'), false) // una referencia no es entrada
  assert.equal(unirRel('.claude\\skills\\', 'x'), '.claude/skills/x')
})

test('Windows: abrir memoria, instrucciones y documentos con «\\» o «/» da la misma ruta relativa', () => {
  assert.equal(limpiarPedida('.claude\\memory\\MEMORY.md'), '.claude/memory/MEMORY.md')
  assert.equal(limpiarPedida('.claude/memory/user/yo.md'), '.claude/memory/user/yo.md')
  assert.equal(limpiarPedida('./CLAUDE.md'), 'CLAUDE.md')
  assert.equal(limpiarPedida('..\\..\\secreto.md'), 'secreto.md') // no sube; luego no está en las carpetas permitidas
  assert.ok(VETADO.test('.claude\\memory\\secretos.md'))
  assert.ok(VETADO.test('.claude/memory/credenciales.md'))
})

test('la ruta del Taller usa estas reglas (no vuelve a path.join ni a comparar con «/» a mano)', () => {
  const s = readFileSync(path.join(WEB, 'src/app/api/cabina/archivos/route.ts'), 'utf8')
  assert.doesNotMatch(s, /const rel = path\.join\(dir, e\.name\)/)
  assert.doesNotMatch(s, /path\.normalize\(pedida\)/)
  assert.match(s, /rutas\.filter\(esEntradaSkill\)/)
  assert.match(s, /limpiarPedida\(pedida\)/)
})
