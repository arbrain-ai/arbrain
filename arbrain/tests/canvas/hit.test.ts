import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { pick } from '../../src/features/canvas/input/hit'
import type { CanvasElement } from '../../src/features/canvas/model/element'

const marco = (id: string, title = '') =>
  ({ id, type: 'frame', x: 0, y: 0, width: 1000, height: 800, rotation: 0, zIndex: -30, title, role: 'tray' }) as unknown as CanvasElement
const texto = (id: string, x: number, y: number) =>
  ({ id, type: 'text', x, y, width: 200, height: 30, rotation: 0, zIndex: 1, text: id, lines: [id], style: { family: 'montserrat', weight: 700, size: 20 }, align: 'left' }) as unknown as CanvasElement

const opts = { zoom: 0.2 }

test('un clic en el cuerpo de un marco de fondo cae en vacío (no lo selecciona)', () => {
  assert.equal(pick([marco('fondo')], { x: 500, y: 400 }, opts), null)
})

test('el marco se agarra por su borde', () => {
  assert.equal(pick([marco('fondo')], { x: 2, y: 400 }, opts)?.id, 'fondo')
  assert.equal(pick([marco('fondo')], { x: 500, y: 798 }, opts)?.id, 'fondo')
})

test('el marco se agarra por su título (cartucho sobre el borde superior)', () => {
  // Cartucho: x 10.., y -22..-4 a zoom de lectura; fuera de la caja del marco.
  assert.equal(pick([marco('fondo', 'Oferta')], { x: 30, y: -12 }, { zoom: 1 })?.id, 'fondo')
  assert.equal(pick([marco('fondo', 'Oferta')], { x: 900, y: -12 }, { zoom: 1 }), null)
})

test('lo que está dentro del marco sigue ganándole al marco', () => {
  const els = [marco('fondo'), texto('titulo', 100, 100)]
  assert.equal(pick(els, { x: 150, y: 110 }, opts)?.id, 'titulo')
  assert.equal(pick(els, { x: 700, y: 500 }, opts), null)
})
