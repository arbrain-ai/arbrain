import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { buildGraph, getNodeDetail } from '../../src/features/cerebro/server/graph'
import { existsSync } from 'node:fs'

// Lee el cerebro real del repo (memoria, skills y documentos). Sin red; solo disco y git.
process.env.BUSINESS_OS_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')

// Estas dos miden el cerebro completo del repo de origen; la copia del alumno trae un cerebro vacío y se saltan.
const CEREBRO_COMPLETO = existsSync(path.join(process.env.BUSINESS_OS_ROOT!, 'docs', 'business-os', 'system-map.md'))
const SIN_CEREBRO = { skip: !CEREBRO_COMPLETO && 'cerebro de plantilla (copia del alumno)' }

test('el grafo base lee memorias, skills y documentos, conectados entre capas, sin credenciales', SIN_CEREBRO, async () => {
  const g = await buildGraph(true)
  assert.equal(g.ok, true)
  assert.ok((g.meta.capas?.memoria ?? 0) > 100)
  assert.ok((g.meta.capas?.skills ?? 0) >= 20)
  assert.ok((g.meta.capas?.documentos ?? 0) >= 10)
  assert.equal(g.meta.capas?.knowledge, undefined)
  assert.ok(!g.nodes.some((n) => /credenciales/.test(n.id)))
  const entreCapas = g.edges.filter((e) => e.source.split('/')[0] !== e.target.split('/')[0])
  assert.ok(entreCapas.length > 50, `aristas entre capas: ${entreCapas.length}`)
  assert.ok(g.nodes.find((n) => n.id === 'skills/habit-system/SKILL.md')!.degree > 3)
})

test('el detalle abre skills y documentos y niega lo vetado', SIN_CEREBRO, async () => {
  const skill = await getNodeDetail('skills/habit-system/SKILL.md')
  assert.equal(skill?.sourcePath, '.claude/skills/habit-system/SKILL.md')
  const doc = await getNodeDetail('docs/business-os/system-map.md')
  assert.equal(doc?.sourcePath, 'docs/business-os/system-map.md')
  assert.equal(await getNodeDetail('memory/reference/credenciales-operativas.md'), null)
  assert.equal(await getNodeDetail('docs/business-os/../../.env.md'), null)
})
