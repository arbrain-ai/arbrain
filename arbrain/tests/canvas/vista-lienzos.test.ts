import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { armarVista, carpetaArchivada, conSubcarpetas, destinosDeCarpeta, destinosDePagina, type PaginaVista } from '../../src/features/canvas/state/vista-lienzos'
import type { CarpetaPlana } from '../../src/features/canvas/state/carpetas'

const c = (id: string, nombre: string, madre: string | null = null, archivada: string | null = null, orden = 0): CarpetaPlana => ({ id, nombre, orden, madre, archivada })
const pg = (id: string, nombre: string, folderId: string | null = null, o: Partial<PaginaVista> = {}): PaginaVista =>
  ({ id, nombre, folderId, actualizado: '2026-10-01', fijado: null, archivado: null, ...o })
const ids = (ps: { id: string }[]) => ps.map(x => x.id)

const CARPETAS = [c('neg', 'Negocio'), c('ht', 'Lanzamiento HT', 'neg'), c('per', 'Personal')]

test('la carpeta fijada sube a «Fijados» y sale de su madre; no hay lista «Todos» plana', () => {
  const v = armarVista(CARPETAS, [pg('a', 'Claridad', 'ht'), pg('b', 'Otra', 'neg'), pg('c', 'Suelta')])
  assert.deepEqual(v.fijados.carpetas.map(n => n.carpeta.id), ['ht'])
  assert.deepEqual(ids(v.fijados.carpetas[0].paginas), ['a'])
  assert.deepEqual(v.raiz.map(n => n.carpeta.id), ['neg', 'per'])
  assert.deepEqual(v.raiz[0].hijas, [])
  assert.deepEqual(ids(v.raiz[0].paginas), ['b'])
  assert.deepEqual(ids(v.sueltas), ['c'])
})

test('un lienzo fijado a mano va arriba y solo ahí; en carpeta fijada manda la carpeta', () => {
  const f = { grupo: 'Fijados', orden: 0 }
  const v = armarVista(CARPETAS, [pg('m', 'Mi favorita', 'neg', { fijado: f }), pg('a', 'Claridad', 'ht', { fijado: f })])
  assert.deepEqual(ids(v.fijados.paginas), ['m'])
  assert.deepEqual(ids(v.raiz[0].paginas), [])
  assert.deepEqual(ids(v.fijados.carpetas[0].paginas), ['a'])
})

test('dentro de una carpeta, lo más reciente primero', () => {
  const v = armarVista(CARPETAS, [pg('v', 'Vieja', 'neg', { actualizado: '2026-09-01' }), pg('n', 'Nueva', 'neg', { actualizado: '2026-10-05' })])
  assert.deepEqual(ids(v.raiz[0].paginas), ['n', 'v'])
})

test('carpeta archivada: se oculta con todo lo suyo, aunque el lienzo no lleve marca; sus subcarpetas la siguen', () => {
  const cs = [c('con', 'Contenido', null, '2026-10-06'), c('cur', 'Curso', 'con'), ...CARPETAS]
  const v = armarVista(cs, [pg('x', 'Dentro', 'con'), pg('y', 'En subcarpeta', 'cur'), pg('z', 'Viva', 'neg')])
  assert.deepEqual(v.raiz.map(n => n.carpeta.id), ['neg', 'per'])
  assert.deepEqual(v.archivados.carpetas.map(n => n.carpeta.id), ['con'])
  assert.deepEqual(ids(v.archivados.carpetas[0].paginas), ['x'])
  assert.deepEqual(v.archivados.carpetas[0].hijas.map(n => ids(n.paginas)), [['y']])
  assert.equal(carpetaArchivada(cs, 'cur'), true)
  assert.equal(carpetaArchivada(cs, 'neg'), false)
  assert.equal(v.archivados.cuenta, 1 + 1 + 2)
})

test('lienzo archivado suelto va a Archivados; uno archivado dentro de carpeta viva también', () => {
  const v = armarVista(CARPETAS, [pg('e', 'Prueba', null, { archivado: '2026-10-05T00:00:00Z' }), pg('f', 'Vieja en Negocio', 'neg', { archivado: '2026-10-05T00:00:00Z' })])
  assert.deepEqual(ids(v.archivados.paginas).sort(), ['e', 'f'])
  assert.deepEqual(ids(v.raiz[0].paginas), [])
  assert.equal(v.sueltas.length, 0)
})

test('buscar: solo lo que coincide, sin carpetas vacías ni acentos que estorben', () => {
  const v = armarVista(CARPETAS, [pg('a', 'Claridad', 'ht'), pg('b', 'Mapa', 'neg'), pg('c', 'Línea del mundo', 'per')], 'linea')
  assert.deepEqual(v.fijados.carpetas, [])
  assert.deepEqual(v.raiz.map(n => n.carpeta.id), ['per'])
  assert.deepEqual(ids(v.raiz[0].paginas), ['c'])
})

test('destinos: un lienzo no puede caer en una carpeta archivada; una carpeta respeta el único nivel', () => {
  const cs = [c('con', 'Contenido', null, '2026-10-06'), ...CARPETAS]
  assert.deepEqual(destinosDePagina(cs).map(d => d.etiqueta), ['Sin carpeta', 'Negocio', 'Negocio › Lanzamiento HT', 'Personal'])
  // «Personal» (sin hijas, en la raíz) puede ir dentro de Negocio; no dentro de «Lanzamiento HT» (ya es subcarpeta) ni de la archivada
  assert.deepEqual(destinosDeCarpeta(cs, 'per').map(d => d.id), ['neg'])
  // «Lanzamiento HT» ya está en Negocio: solo puede salir a la raíz (o ir a Personal)
  assert.deepEqual(destinosDeCarpeta(cs, 'ht').map(d => d.id), [null, 'per'])
})

test('conSubcarpetas: la carpeta y sus hijas', () => {
  assert.deepEqual(conSubcarpetas(CARPETAS, 'neg').sort(), ['ht', 'neg'])
  assert.deepEqual(conSubcarpetas(CARPETAS, 'per'), ['per'])
})
