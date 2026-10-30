import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { arbolCarpetas, puedeAnidar, puedeSerMadre, type CarpetaPlana } from '../../src/features/canvas/state/carpetas'

const c = (id: string, madre: string | null = null, orden = 0, nombre = id): CarpetaPlana => ({ id, nombre, orden, madre })
const p = (id: string, folderId: string | null) => ({ id, folderId })

test('árbol: un nivel, en orden, con sus páginas', () => {
  const carpetas = [c('B', null, 2), c('A', null, 1), c('A2', 'A', 2), c('A1', 'A', 1)]
  const { raiz, sueltas } = arbolCarpetas(carpetas, [p('x', 'A1'), p('y', 'A'), p('z', null)])
  assert.deepEqual(raiz.map(n => n.carpeta.id), ['A', 'B'])
  assert.deepEqual(raiz[0].hijas.map(n => n.carpeta.id), ['A1', 'A2'])
  assert.deepEqual(raiz[0].hijas[0].paginas.map(x => x.id), ['x'])
  assert.deepEqual(raiz[0].paginas.map(x => x.id), ['y'])
  assert.deepEqual(sueltas.map(x => x.id), ['z'])
})

test('árbol: lo que no encaja se enseña en la raíz, nunca se esconde', () => {
  // madre borrada en otro aparato; cadena de dos niveles escrita a mano; página en carpeta inexistente
  const carpetas = [c('huerfana', 'no-existe'), c('A'), c('A1', 'A'), c('A1x', 'A1')]
  const { raiz, sueltas } = arbolCarpetas(carpetas, [p('perdida', 'fantasma')])
  assert.deepEqual(raiz.map(n => n.carpeta.id).sort(), ['A', 'A1x', 'huerfana'])
  assert.deepEqual(raiz.find(n => n.carpeta.id === 'A')!.hijas.map(n => n.carpeta.id), ['A1'])
  assert.deepEqual(sueltas.map(x => x.id), ['perdida'])
})

test('anidar: la regla de un nivel de sfmap', () => {
  const carpetas = [c('A'), c('A1', 'A'), c('B'), c('C')]
  assert.equal(puedeAnidar(carpetas, 'B', 'A'), null)
  assert.equal(puedeAnidar(carpetas, 'A1', null), null)            // sacar a la raíz siempre
  assert.match(puedeAnidar(carpetas, 'B', 'B')!, /sí misma/)
  assert.match(puedeAnidar(carpetas, 'B', 'A1')!, /un nivel/)       // destino ya es hija
  assert.match(puedeAnidar(carpetas, 'A', 'C')!, /subcarpetas/)     // A tiene hijas
  assert.match(puedeAnidar(carpetas, 'B', 'nada')!, /no existe/)
  assert.equal(puedeSerMadre(carpetas, 'A'), true)
  assert.equal(puedeSerMadre(carpetas, 'A1'), false)
})
