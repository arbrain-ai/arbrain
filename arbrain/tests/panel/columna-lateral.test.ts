import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { alternarColumna, colocar, hayColumnaDerecha, revelaColumna, type Celdas } from '../../src/features/cabina/panel/division'

// 9 oct 2026: ⌘B esconde y muestra la columna derecha de una ventana dividida sin mover sus pestañas.
const tira = ['lienzo', 'archivos', 'notas']
const mitades = colocar({ celdas: [null, null, null, null], grupos: {} }, 'archivos', 'der', 'lienzo', tira)

test('mitad y mitad: hay columna derecha; una sola vista no', () => {
  assert.deepEqual(mitades.celdas, ['lienzo', 'archivos', null, null])
  assert.equal(hayColumnaDerecha(mitades.celdas), true)
  assert.equal(hayColumnaDerecha(['lienzo', null, null, null]), false)
})

test('sin columna derecha ⌘B no hace nada (la negrita del lienzo sigue libre)', () => {
  assert.equal(alternarColumna(['lienzo', null, null, null], 0, false), null)
})

test('esconder deja el foco a la izquierda; mostrar lo respeta', () => {
  assert.deepEqual(alternarColumna(mitades.celdas, 1, false), { oculta: true, foco: 0 })
  assert.deepEqual(alternarColumna(mitades.celdas, 0, false), { oculta: true, foco: 0 })
  assert.deepEqual(alternarColumna(mitades.celdas, 0, true), { oculta: false, foco: 0 })
  // Abajo a la derecha → abajo a la izquierda si existe; si no, arriba.
  const cuartos: Celdas = ['a', 'b', 'c', 'd']
  assert.deepEqual(alternarColumna(cuartos, 3, false), { oculta: true, foco: 2 })
  assert.deepEqual(alternarColumna(['a', 'b', null, 'd'], 3, false), { oculta: true, foco: 0 })
})

test('esconder no toca grupos ni celdas: al volver todo está igual', () => {
  const antes = JSON.stringify(mitades)
  alternarColumna(mitades.celdas, 1, false)
  assert.equal(JSON.stringify(mitades), antes)
})

test('escondida, lo que se pide en la derecha la vuelve a mostrar; lo de la izquierda no', () => {
  assert.equal(revelaColumna(mitades.celdas, true, 'archivos'), true)
  assert.equal(revelaColumna(mitades.celdas, true, 'lienzo'), false)
  assert.equal(revelaColumna(mitades.celdas, false, 'archivos'), false)
  assert.equal(revelaColumna(mitades.celdas, true, null), false)
})
