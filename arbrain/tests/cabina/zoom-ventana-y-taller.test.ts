import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { acotarZoom, claveZoomVentana, siguienteZoom } from '../../src/shared/components/ZoomController'
import { aSegmento, esSegmentoTaller, SEGMENTOS_TALLER } from '../../src/features/cabina/panel/taller-segmento'
import { EN_TALLER } from '../../src/features/cabina/panel/fijadas'
import { ordenarMenu } from '../../src/features/cabina/panel/menu-orden'
import { rutaDe, seccionDe } from '../../src/features/cabina/model'

test('zoom de ventana aparte: ⌘+ ⌘− ⌘0 con los mismos pasos y topes que la principal', () => {
  assert.equal(siguienteZoom(1, '='), 1.1); assert.equal(siguienteZoom(1, '+'), 1.1)
  assert.equal(siguienteZoom(1, '-'), 0.9); assert.equal(siguienteZoom(1.5, '0'), 1)
  assert.equal(siguienteZoom(1.8, '='), 1.8); assert.equal(siguienteZoom(0.6, '-'), 0.6)
  assert.equal(siguienteZoom(1, 'a'), null)
  assert.equal(acotarZoom(9), 1.8); assert.equal(acotarZoom(0.1), 0.6)
})
test('cada ventana recuerda su zoom aparte de la principal', () => {
  assert.notEqual(claveZoomVentana('1'), 'mc-ui-zoom')
  assert.notEqual(claveZoomVentana('1'), claveZoomVentana('2'))
})
test('el Taller son cinco pestañas (Historia desde el 28 oct 2026) y los ids viejos llegan a su lugar (5 oct 2026, 18:11)', () => {
  assert.deepEqual(SEGMENTOS_TALLER.map(t => t.etiqueta), ['Agentes', 'Historia', 'Rutinas', 'Memoria', 'Computadora'])
  assert.ok(SEGMENTOS_TALLER.every(t => t.pregunta.endsWith('?')))
  assert.equal(aSegmento('servidores'), 'maquina'); assert.equal(aSegmento('servicios'), 'maquina')
  assert.equal(aSegmento('archivos'), 'memoria'); assert.equal(aSegmento('rutinas'), 'rutinas')
  assert.equal(aSegmento('registro'), 'registro'); assert.equal(aSegmento('otra'), null)
  assert.ok(esSegmentoTaller('servidores') && !esSegmentoTaller('calendario'))
  for (const v of ['servidores', 'rutinas', 'memoria'] as const) assert.equal(seccionDe({ vista: v }), null)
  assert.equal(rutaDe({ destino: 'servidores' }), '/servidores')
})
test('Rutinas, Memoria y Servidores no se fijan como pestaña: abren el Taller', () => {
  assert.equal(EN_TALLER.get('servidores'), 'maquina'); assert.equal(EN_TALLER.get('rutinas'), 'rutinas'); assert.equal(EN_TALLER.get('memoria'), 'memoria')
  assert.equal(EN_TALLER.has('calendario'), false)
})
test('un orden del «+» guardado con Servidores la suelta sin mover lo demás', () => {
  const porDefecto = ['calendario', 'tareas', 'rutinas', 'memoria', 'taller']
  assert.deepEqual(ordenarMenu(porDefecto, ['taller', 'servidores', 'calendario', 'tareas', 'rutinas', 'memoria']), ['taller', 'calendario', 'tareas', 'rutinas', 'memoria'])
})
