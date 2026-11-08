import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { cambioDe, leerOrden, unirSinRepetir } from '../../src/features/cabina/conversaciones-orquesta'
import { decidirCliente } from '../../src/lib/proxy-cliente'

const ID = 'd2348403-f5ef-4953-9271-1bfcded6b97b'

test('ruta: valida lo que manda el agent-server', () => {
  assert.deepEqual(leerOrden({ accion: 'listar', ownerId: ' p1 ' }), { accion: 'listar', ownerId: 'p1', limite: 40 })
  assert.deepEqual(leerOrden({ accion: 'listar', ownerId: 'p1', limite: 200 }), { accion: 'listar', ownerId: 'p1', limite: 200 })
  assert.deepEqual(leerOrden({ accion: 'listar', ownerId: 'p1', ids: [ID] }), { accion: 'listar', ownerId: 'p1', ids: [ID], limite: 5 })
  assert.deepEqual(leerOrden({ accion: 'renombrar', ownerId: 'p1', id: ID, titulo: '  Clases   3 ' }), { accion: 'renombrar', ownerId: 'p1', id: ID, titulo: 'Clases 3' })
  assert.deepEqual(leerOrden({ accion: 'fijar', ownerId: 'p1', id: ID }), { accion: 'fijar', ownerId: 'p1', id: ID })
  for (const malo of [
    null, { accion: 'listar' }, { accion: 'listar', ownerId: 'p1', limite: 0 }, { accion: 'listar', ownerId: 'p1', limite: 201 },
    { accion: 'listar', ownerId: 'p1', ids: [] }, { accion: 'listar', ownerId: 'p1', ids: ['x'] }, { accion: 'listar', ownerId: 'p1', ids: Array(6).fill(ID) },
    { accion: 'borrar', ownerId: 'p1', id: ID }, { accion: 'archivar', ownerId: 'p1', id: ID }, { accion: 'enviar', ownerId: 'p1', id: ID },
    { accion: 'fijar', ownerId: 'p1', id: 'd2348403' }, { accion: 'renombrar', ownerId: 'p1', id: ID }, { accion: 'renombrar', ownerId: 'p1', id: ID, titulo: 'x'.repeat(81) },
  ]) assert.ok('error' in leerOrden(malo), JSON.stringify(malo))
})

test('ruta: el cambio es el mismo del menú «⋯» y no escribe si ya estaba así', () => {
  const r = leerOrden({ accion: 'renombrar', ownerId: 'p1', id: ID, titulo: 'Nuevo' }) as Parameters<typeof cambioDe>[0]
  assert.deepEqual(cambioDe(r, { title: 'Viejo' }), { title: 'Nuevo' })
  assert.equal(cambioDe(r, { title: 'Nuevo' }), null)
  const fijar = { accion: 'fijar' as const, ownerId: 'p1', id: ID }
  assert.deepEqual(cambioDe(fijar, { is_favorite: false }), { is_favorite: true, pinned_position: null })
  assert.equal(cambioDe(fijar, { is_favorite: true }), null)
  const desfijar = { accion: 'desfijar' as const, ownerId: 'p1', id: ID }
  assert.deepEqual(cambioDe(desfijar, { is_favorite: true }), { is_favorite: false, pinned_position: null, is_starred: false })
  assert.equal(cambioDe(desfijar, { is_favorite: false }), null)
})

test('ruta: fijadas y recientes sin repetir, fijadas primero', () => {
  assert.deepEqual(unirSinRepetir([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map(x => x.id), ['a', 'b', 'c'])
})

test('edición cliente (v0.2.24): la ruta existe y la llama SU daemon sin cookie (la ruta compara su Bearer)', () => {
  assert.deepEqual(decidirCliente('/api/cabina/conversaciones', false), { tipo: 'pasa' })
})
