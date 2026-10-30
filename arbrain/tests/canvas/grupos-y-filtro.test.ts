import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { agrupar, desagrupar, expandirSeleccion, gruposCompletos, haySeleccionAgrupada, miembrosDeGrupo } from '../../src/features/canvas/model/group'
import { categoriaDe, contarPorCategoria, esSeleccionMixta, filtrarPorCategoria, textoObjetos } from '../../src/features/canvas/model/filtro-seleccion'
import type { CanvasElement } from '../../src/features/canvas/model/element'

const el = (id: string, type: string, x = 0, extra: object = {}) =>
  ({ id, type, x, y: 0, width: 50, height: 20, rotation: 0, zIndex: 1, points: [], ...extra }) as unknown as CanvasElement
const mezcla = [el('a', 'shape'), el('n', 'shape', 60, { role: 'sticky' }), el('t', 'text', 120), el('c', 'connector'), el('i', 'image', 180), el('m', 'frame', 240)]

test('categorias: nota, figura, texto, conector, imagen, marco', () => {
  assert.deepEqual(mezcla.map(categoriaDe), ['figura', 'nota', 'texto', 'conector', 'imagen', 'marco'])
})
test('seleccion mixta solo con mas de un tipo', () => {
  assert.equal(esSeleccionMixta(mezcla), true)
  assert.equal(esSeleccionMixta([el('a', 'shape'), el('b', 'shape')]), false)
  assert.equal(esSeleccionMixta([el('a', 'shape')]), false)
})
test('filtro reduce la seleccion a un tipo y cuenta por tipo', () => {
  assert.deepEqual([...filtrarPorCategoria(mezcla, 'nota')], ['n'])
  assert.equal(contarPorCategoria(mezcla).length, 6)
  assert.equal(textoObjetos(1), '1 objeto'); assert.equal(textoObjetos(182), '182 objetos')
})
test('agrupar / desagrupar y expansion al grupo', () => {
  const g = agrupar(mezcla, new Set(['a', 't', 'i']))!
  assert.ok(g.filter(e => e.groupId).length === 3)
  assert.deepEqual([...expandirSeleccion(g, new Set(['a']))].sort(), ['a', 'i', 't'])
  assert.equal(haySeleccionAgrupada(g, new Set(['a'])), true)
  assert.equal(haySeleccionAgrupada(mezcla, new Set(['a'])), false)
  const d = desagrupar(g, new Set(['a']))!
  assert.equal(d.filter(e => e.groupId).length, 0)
  assert.equal(agrupar(mezcla, new Set(['a'])), null)
})
test('grupo abierto: sus miembros se eligen sueltos', () => {
  const g = agrupar(mezcla, new Set(['a', 't', 'i']))!
  const gid = g.find(e => e.id === 'a')!.groupId!
  assert.deepEqual([...expandirSeleccion(g, new Set(['a']), gid)], ['a'])
  assert.deepEqual([...miembrosDeGrupo(g, gid)].sort(), ['a', 'i', 't'])
})
test('gruposCompletos: un recuadro por grupo con todos sus miembros seleccionados, y su caja', () => {
  const g = agrupar(mezcla, new Set(['a', 't']))!
  const gid = g.find(e => e.id === 'a')!.groupId!
  const r = gruposCompletos(g, new Set(['a', 't']))
  assert.equal(r.length, 1); assert.deepEqual(r[0].caja, { x: 0, y: 0, width: 170, height: 20 })
  assert.equal(gruposCompletos(g, new Set(['a'])).length, 0)          // grupo incompleto: sin recuadro
  assert.equal(gruposCompletos(g, new Set(['a', 't']), gid).length, 0) // abierto: sin recuadro
})
