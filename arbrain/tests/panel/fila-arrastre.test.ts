import test from 'node:test'
import assert from 'node:assert/strict'
import { destinoEnFila, indiceParaReordenar, ordenTrasSoltar, velocidadAutoScroll, BORDE_AUTO, VELOCIDAD_AUTO } from '../../src/features/cabina/panel/fila-arrastre'

// Tres pestañas de 80 px con 4 px de hueco: centros 40, 124, 208.
const centros = [40, 124, 208]

test('fila del teléfono: la levantada cae donde pasa la mitad de la vecina', () => {
  assert.equal(destinoEnFila(centros, 40, 0, false, 0), 0, 'sin moverse, en su lugar')
  assert.equal(destinoEnFila(centros, 120, 0, false, 0), 0, 'aún no pasa el centro de la segunda')
  assert.equal(destinoEnFila(centros, 130, 0, false, 0), 1)
  assert.equal(destinoEnFila(centros, 400, 0, false, 0), 2, 'más allá de la última: al final')
  assert.equal(destinoEnFila(centros, -50, 2, false, 0), 0, 'antes de la primera: al principio')
})

test('fila del teléfono: una anclada solo cae entre ancladas y una suelta no las rebasa', () => {
  assert.equal(destinoEnFila(centros, 400, 0, true, 1), 1, 'la anclada no sale de su tramo')
  assert.equal(destinoEnFila(centros, -50, 2, false, 1), 1, 'la suelta se queda tras la anclada')
})

test('fila del teléfono: soltar guarda el mismo acomodo global que el escritorio (el Taller sigue fijo a la derecha)', () => {
  const orden = ['tareas', 'v1', 'v2']
  const claves = [...orden, 'taller']
  assert.deepEqual(ordenTrasSoltar(orden, claves, 'tareas', 2, []), ['v1', 'v2', 'tareas'])
  assert.deepEqual(ordenTrasSoltar(orden, claves, 'v2', 0, []), ['v2', 'tareas', 'v1'])
  assert.deepEqual(ordenTrasSoltar(orden, claves, 'v1', 1, []), orden, 'soltar en su lugar no cambia nada')
  assert.equal(indiceParaReordenar(orden, claves, 'tareas', 2), 2, 'el Taller no cuenta como lugar')
  assert.deepEqual(ordenTrasSoltar(['v1', 'tareas', 'v2'], ['v1', 'tareas', 'v2', 'taller'], 'v2', 0, ['v1']), ['v1', 'v2', 'tareas'], 'las ancladas siguen primero')
})

test('fila del teléfono: junto a los bordes la tira se desplaza sola, más rápido cuanto más al borde', () => {
  assert.equal(velocidadAutoScroll(200, 10, 350), 0, 'en medio, quieta')
  assert.ok(velocidadAutoScroll(10 + BORDE_AUTO - 1, 10, 350) < 0)
  assert.equal(velocidadAutoScroll(0, 10, 350), -VELOCIDAD_AUTO, 'fuera del borde, al máximo')
  assert.ok(velocidadAutoScroll(350 - 5, 10, 350) > velocidadAutoScroll(350 - BORDE_AUTO + 5, 10, 350))
  assert.equal(velocidadAutoScroll(30, 0, 60), 0, 'una tira mínima no se desplaza')
})
