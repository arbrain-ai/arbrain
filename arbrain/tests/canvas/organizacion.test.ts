import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { conArchivado, conFijado, enCarpetaFijada, leerOrganizacion, ordenAlFinal, type ConOrg } from '../../src/features/canvas/state/organizacion'

const CARPETAS = [{ id: 'neg', nombre: 'Negocio' }, { id: 'ht', nombre: 'Lanzamiento HT' }]
const pg = (id: string, nombre: string, s: unknown = null, actualizado = '2026-10-01', folderId: string | null = null): ConOrg =>
  ({ id, nombre, actualizado, folderId, ...leerOrganizacion(s) })

test('fijar a mano da su grupo y orden; desfijar lo quita y limpia el desfijado viejo', () => {
  assert.equal(leerOrganizacion({}).fijado, null)
  assert.deepEqual(leerOrganizacion(conFijado({}, true, 'Fijados', 2)).fijado, { grupo: 'Fijados', orden: 2 })
  assert.equal(leerOrganizacion(conFijado({ fijado: { grupo: 'Fijados', orden: 0 }, desfijado: true }, false)).fijado, null)
  assert.deepEqual(conFijado({ otro: 1, desfijado: true }, false), { otro: 1 })
})

test('settings basura no rompe', () => {
  for (const s of [undefined, 3, 'x', [], { fijado: 5 }, { fijado: { grupo: '' } }, { archivado: 7 }]) assert.doesNotThrow(() => leerOrganizacion(s))
  assert.equal(leerOrganizacion({ archivado: 7 }).archivado, null)
})

test('fijar y archivar conservan el resto de los settings', () => {
  assert.deepEqual(conArchivado({ otro: 1 }, true, new Date('2026-10-05T12:00:00Z')), { otro: 1, archivado: '2026-10-05T12:00:00.000Z' })
  assert.deepEqual(conArchivado({ otro: 1, archivado: 'x' }, false), { otro: 1 })
  assert.deepEqual(conFijado({ otro: 1 }, true, 'Fijados', 1), { otro: 1, fijado: { grupo: 'Fijados', orden: 1 } })
})

test('enCarpetaFijada', () => {
  assert.equal(enCarpetaFijada('ht', CARPETAS), true)
  assert.equal(enCarpetaFijada('neg', CARPETAS), false)
  assert.equal(enCarpetaFijada(null, CARPETAS), false)
})

test('ordenAlFinal', () => {
  assert.equal(ordenAlFinal([]), 0)
  assert.equal(ordenAlFinal([pg('f', 'x', conFijado({}, true, 'Fijados', 4))]), 5)
})

test('la sección no abre una archivada por defecto', async () => {
  const { paginaPorDefecto } = await import('../../src/features/canvas/state/pagina-por-defecto')
  const ps = [{ id: 'a', actualizado: '2026-10-05', archivado: '2026-10-05' }, { id: 'b', actualizado: '2026-10-01', archivado: null }]
  assert.equal(paginaPorDefecto(ps, null), 'b')
  assert.equal(paginaPorDefecto(ps, 'a'), 'b')
})

test('la sección tampoco abre un lienzo de una carpeta archivada por defecto', async () => {
  const { paginaPorDefecto } = await import('../../src/features/canvas/state/pagina-por-defecto')
  const ps = [{ id: 'a', actualizado: '2026-10-05', folderId: 'arch' }, { id: 'b', actualizado: '2026-10-01', folderId: null }]
  const cs = [{ id: 'arch', nombre: 'Contenido', orden: 0, madre: null, archivada: '2026-10-06' }]
  assert.equal(paginaPorDefecto(ps, null, cs), 'b')
  assert.equal(paginaPorDefecto(ps, 'a', cs), 'b')
})
