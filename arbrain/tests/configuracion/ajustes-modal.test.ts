import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { GRUPOS, SECCIONES, buscarAjustes, seccionDeUrl } from '../../src/features/configuracion/secciones'

const ids = (q: string) => buscarAjustes(q).flatMap((g) => g.secciones.map((s) => s.seccion.id))

test('la nav agrupa: El negocio primero, luego Tú, Arbrain, Esta computadora', () => {
  assert.deepEqual(GRUPOS.map((g) => [g.titulo, g.secciones.join(',')]), [
    ['El negocio', 'norte,equipo,clientes,oferta,embudo'],
    ['Tú', 'cuenta,apariencia,avisos'],
    ['Arbrain', 'modelo,panel,atajos'],
    ['Esta computadora', 'mac'],
  ])
  assert.deepEqual(GRUPOS.flatMap((g) => g.secciones).sort(), SECCIONES.map((s) => s.id).sort())
})

test('?seccion= resuelve ids, alias viejos y desconocidos', () => {
  assert.equal(seccionDeUrl('panel'), 'panel')
  assert.equal(seccionDeUrl('norte'), 'norte')
  assert.equal(seccionDeUrl('permisos'), 'mac')
  assert.equal(seccionDeUrl('modelos'), 'modelo')
  assert.equal(seccionDeUrl('nada'), 'cuenta')
  assert.equal(seccionDeUrl(null), 'cuenta')
})

test('buscador: sin consulta devuelve todo; filtra secciones y ajustes sin acentos', () => {
  assert.equal(ids('').length, SECCIONES.length)
  assert.deepEqual(ids('camara'), ['mac'])
  assert.deepEqual(ids('organigrama'), ['equipo'])
  // Daniel (6 oct): el buscador debe encontrar misión, visión, avatar, oferta y organigrama.
  assert.deepEqual(ids('misión'), ['norte'])
  assert.deepEqual(ids('vision'), ['norte'])
  assert.deepEqual(ids('avatar'), ['clientes'])
  assert.deepEqual(ids('oferta'), ['oferta'])
  assert.deepEqual(ids('embudo'), ['embudo'])
  assert.equal(buscarAjustes('equipo')[0].grupo.id, 'negocio')
  assert.deepEqual(ids('MODO OSCURO'), ['apariencia'])
  assert.deepEqual(ids('zzzz'), [])
  const [g] = buscarAjustes('micro')
  assert.equal(g.grupo.id, 'computadora')
  assert.deepEqual(g.secciones[0].coincidencias, ['Micrófono'])
})

test('buscar por nombre de grupo muestra sus secciones enteras', () => {
  assert.deepEqual(ids('esta computadora'), ['mac'])
})
