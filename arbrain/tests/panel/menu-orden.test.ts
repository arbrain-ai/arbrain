import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  desplazamientosVerticales, esPorDefecto, indiceVertical, moverEnMenu, moverVisible, normalizarAjustes, ordenarMenu, OCULTAS_POR_DEFECTO, recienOcultas, SECCIONES_MENU, visibles,
} from '../../src/features/cabina/panel/menu-orden'

const BASE = ['calendario', 'tareas', 'lienzo', 'negocio', 'taller']

test('sin recuerdo (o roto) el orden de siempre', () => {
  assert.deepEqual(ordenarMenu(BASE, null), BASE)
  assert.deepEqual(ordenarMenu(BASE, 'x'), BASE)
  assert.deepEqual(ordenarMenu(BASE, [3, null]), BASE)
})

test('el orden de Daniel manda; lo que ya no existe se tira y lo nuevo entra tras su vecina de siempre', () => {
  assert.deepEqual(ordenarMenu(BASE, ['taller', 'lienzo', 'calendario', 'tareas', 'negocio']), ['taller', 'lienzo', 'calendario', 'tareas', 'negocio'])
  assert.deepEqual(ordenarMenu(BASE, ['negocio', 'viejo', 'calendario', 'negocio']), ['negocio', 'taller', 'calendario', 'tareas', 'lienzo'])
  assert.deepEqual(ordenarMenu(['a', 'b'], ['b']), ['a', 'b'])
})

test('mover, índice vertical y saber si es el de siempre', () => {
  assert.deepEqual(moverEnMenu(BASE, 'taller', 0), ['taller', 'calendario', 'tareas', 'lienzo', 'negocio'])
  assert.deepEqual(moverEnMenu(BASE, 'calendario', 9), ['tareas', 'lienzo', 'negocio', 'taller', 'calendario'])
  assert.deepEqual(moverEnMenu(BASE, 'zz', 0), BASE)
  assert.equal(indiceVertical([10, 30, 50, 70], 60, 0), 2)
  assert.equal(indiceVertical([10, 30, 50, 70], 5, 3), 0)
  assert.ok(esPorDefecto([...BASE], BASE) && !esPorDefecto(moverEnMenu(BASE, 'taller', 0), BASE))
})

// ── Ajustes del panel (6 oct 2026) ──

test('las secciones del menú son las mismas que las del servidor (panel-ajustes.ts)', () => {
  const fuente = readFileSync(join(process.cwd(), 'server/src/cabina/panel-ajustes.ts'), 'utf8')
  const lista = (re: RegExp) => [...(fuente.match(re)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map(m => m[1])
  assert.deepEqual(lista(/export const SECCIONES = \[([^\]]*)\]/), SECCIONES_MENU)
  assert.deepEqual(lista(/export const OCULTAS_POR_DEFECTO: Seccion\[\] = \[([^\]]*)\]/), OCULTAS_POR_DEFECTO)
})

test('Equipo y «Lo que llegó» nacen fuera del «+»', () => {
  assert.deepEqual(OCULTAS_POR_DEFECTO, ['equipo', 'reporte'])
  assert.ok(!visibles(SECCIONES_MENU, OCULTAS_POR_DEFECTO).includes('equipo'))
  assert.ok(!visibles(SECCIONES_MENU, OCULTAS_POR_DEFECTO).includes('reporte'))
  assert.ok(visibles(SECCIONES_MENU, OCULTAS_POR_DEFECTO).includes('contenido'), 'Contenido sigue visible')
  assert.equal(visibles(SECCIONES_MENU, OCULTAS_POR_DEFECTO).length, SECCIONES_MENU.length - 2)
})

test('normalizarAjustes: nunca rompe ni inventa ids', () => {
  assert.deepEqual(normalizarAjustes(null), { rev: 0, orden: SECCIONES_MENU, ocultas: ['equipo', 'reporte'], donde: 'izquierda' })
  assert.equal(normalizarAjustes({ donde: 'derecha' }).donde, 'derecha')
  assert.equal(normalizarAjustes({ donde: 'arriba' }).donde, 'izquierda')
  const a = normalizarAjustes({ rev: 4, orden: ['taller', 'xx', 'calendario'], ocultas: ['tareas', 'zz', 'tareas'] })
  assert.equal(a.rev, 4)
  assert.equal(a.orden[0], 'taller')
  assert.equal(a.orden.length, SECCIONES_MENU.length)
  assert.deepEqual(a.ocultas, ['tareas'])
  assert.equal(normalizarAjustes({ rev: -3 }).rev, 0)
})

test('moverVisible: mueve entre las visibles y las ocultas no se mueven de su lugar', () => {
  const orden = ['calendario', 'tareas', 'lienzo', 'negocio', 'taller'], ocultas = ['tareas']
  // visibles: calendario, lienzo, negocio, taller → lienzo al principio
  assert.deepEqual(moverVisible(orden, ocultas, 'lienzo', 0), ['lienzo', 'tareas', 'calendario', 'negocio', 'taller'])
  assert.deepEqual(moverVisible(orden, ocultas, 'calendario', 3), ['lienzo', 'tareas', 'negocio', 'taller', 'calendario'])
  assert.deepEqual(moverVisible(orden, ocultas, 'tareas', 0), orden)
})

test('recienOcultas: solo lo que pasó a oculto cierra su pestaña', () => {
  assert.deepEqual(recienOcultas(['equipo'], ['equipo', 'tareas']), ['tareas'])
  assert.deepEqual(recienOcultas(['equipo'], ['equipo']), [])
  assert.deepEqual(recienOcultas(['tareas'], []), [])
})

test('desplazamientosVerticales: el hueco se abre con alturas distintas y la fila tomada va al lugar que dejaron', () => {
  // tres filas de 40, 70 (Calendario, con su línea de alcances) y 40, separadas 6 px
  const cajas = [{ top: 0, height: 40 }, { top: 46, height: 70 }, { top: 122, height: 40 }]
  assert.deepEqual(desplazamientosVerticales(cajas, 0, 0), [0, 0, 0])
  // la primera baja al final: la tomada recorre 122 px y las otras suben 46 (lo que mide ella más el hueco)
  assert.deepEqual(desplazamientosVerticales(cajas, 0, 2), [122, -46, -46])
  // la última sube al principio: las otras bajan lo que mide ella más el hueco
  assert.deepEqual(desplazamientosVerticales(cajas, 2, 0), [46, 46, -122])
  assert.deepEqual(desplazamientosVerticales(cajas, 9, 0), [0, 0, 0])
  assert.deepEqual(desplazamientosVerticales([], 0, 0), [])
})

test('indiceVertical con el centro de la fila tomada (no el cursor): bajar por encima de la mitad de la vecina la aparta', () => {
  const centros = [20, 66, 142]
  assert.equal(indiceVertical(centros, 20 + 50, 0), 1) // pasó el centro de la 2.ª (66) pero no el de la 3.ª
  assert.equal(indiceVertical(centros, 20 + 100, 0), 1)
  assert.equal(indiceVertical(centros, 20 + 130, 0), 2)
})
