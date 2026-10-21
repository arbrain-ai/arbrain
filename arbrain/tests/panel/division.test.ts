import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { alActivar, colocar, miembros, normalizar, quitar, rectDeClave, zonaDeDivision, VACIAS, type EstadoDivision } from '../../src/features/cabina/panel/division'

const R = { left: 0, top: 0, right: 1000, bottom: 800 }
const tira = ['acomp', 'master', 'preguntas', 'pendientes']
const sola: EstadoDivision = { celdas: VACIAS, grupos: {} }

test('zonas: la mitad derecha es la principal; las esquinas son cuartos', () => {
  assert.equal(zonaDeDivision({ x: 700, y: 400 }, R), 'der')
  assert.equal(zonaDeDivision({ x: 520, y: 100 }, R), 'der')
  assert.equal(zonaDeDivision({ x: 300, y: 400 }, R), 'izq')
  assert.equal(zonaDeDivision({ x: 50, y: 50 }, R), 0)
  assert.equal(zonaDeDivision({ x: 950, y: 50 }, R), 1)
  assert.equal(zonaDeDivision({ x: 50, y: 750 }, R), 2)
  assert.equal(zonaDeDivision({ x: 950, y: 750 }, R), 3)
})

test('a la mitad derecha: la pestaña abre su propio grupo y las demás se quedan en el izquierdo', () => {
  const e = colocar(sola, 'master', 'der', 'acomp', tira)
  assert.deepEqual(e.celdas, ['acomp', 'master', null, null])
  assert.deepEqual(miembros(e, 0, tira), ['acomp', 'preguntas', 'pendientes'])
  assert.deepEqual(miembros(e, 1, tira), ['master'])
})

test('arrastrar la única que se veía a la derecha: su vecina toma la izquierda', () => {
  assert.deepEqual(colocar(sola, 'acomp', 'der', 'acomp', tira).celdas, ['master', 'acomp', null, null])
})

test('con una sola pestaña no hay nada que dividir', () => {
  assert.deepEqual(colocar(sola, 'acomp', 'der', 'acomp', ['acomp']).celdas, ['acomp', null, null, null])
})

test('a la izquierda sin columna derecha: lo que se veía (con su grupo) se corre a la derecha', () => {
  const e = colocar(sola, 'master', 'izq', 'acomp', tira)
  assert.deepEqual(e.celdas, ['master', 'acomp', null, null])
  assert.deepEqual(miembros(e, 1, tira), ['acomp', 'preguntas', 'pendientes'])
})

test('soltar sobre la tira de otro grupo: se une a ese grupo y se ve ahí', () => {
  let e = colocar(sola, 'master', 'der', 'acomp', tira)
  e = colocar(e, 'preguntas', { grupo: 1 }, null, tira)
  assert.deepEqual(e.celdas, ['acomp', 'preguntas', null, null])
  assert.deepEqual(miembros(e, 1, tira), ['master', 'preguntas'])
  // La última de un grupo que se va a otro: el grupo desaparece.
  e = colocar(e, 'acomp', { grupo: 1 }, null, ['acomp', 'master', 'preguntas'])
  assert.deepEqual(e.celdas, ['acomp', null, null, null])
})

test('cuatro cuartos: las esquinas parten la columna', () => {
  let e = colocar(sola, 'master', 'der', 'acomp', tira)
  e = colocar(e, 'preguntas', 3, null, tira)
  assert.deepEqual(e.celdas, ['acomp', 'master', null, 'preguntas'])
  e = colocar(e, 'pendientes', 2, null, tira)
  assert.deepEqual(e.celdas, ['acomp', 'master', 'pendientes', 'preguntas'])
  // Esquina de arriba con la de abajo libre: el grupo que estaba baja.
  const f = colocar(colocar(sola, 'master', 'der', 'acomp', tira), 'preguntas', 0, null, tira)
  assert.deepEqual(f.celdas, ['preguntas', 'master', 'acomp', null])
  assert.deepEqual(miembros(f, 2, tira), ['acomp', 'pendientes'])
})

test('normalizar: la que se cerró deja ver otra de su grupo; un grupo vacío desaparece', () => {
  const e = normalizar({ celdas: ['acomp', 'master', null, null], grupos: { master: 1, preguntas: 1 } }, ['acomp', 'preguntas', 'pendientes'])
  assert.deepEqual(e.celdas, ['acomp', 'preguntas', null, null])
  const f = normalizar({ celdas: ['acomp', 'master', null, null], grupos: { master: 1 } }, ['acomp', 'preguntas'])
  assert.deepEqual(f.celdas, ['acomp', null, null, null])
  assert.deepEqual(f.grupos, {})
})

test('activar: lo que ya se ve toma el foco; una pestaña va a su grupo; una nueva, al grupo con el foco', () => {
  const e = colocar(sola, 'master', 'der', 'acomp', tira)
  assert.equal(alActivar(e, 0, 'master').foco, 1)
  const g = alActivar(e, 1, 'preguntas')
  assert.deepEqual(g.estado.celdas, ['preguntas', 'master', null, null])
  assert.equal(g.foco, 0)
  const n = alActivar(e, 1, 'nueva')
  assert.deepEqual(n.estado.celdas, ['acomp', 'nueva', null, null])
})

test('quitar una parte: sus pestañas se unen a la que queda', () => {
  const e = quitar(colocar(sola, 'master', 'der', 'acomp', tira), 1, tira)
  assert.deepEqual(e.celdas, ['acomp', null, null, null])
})

test('la sombra dice dónde queda la pestaña', () => {
  assert.deepEqual(rectDeClave('master', ['acomp', 'master', null, null]), { x: 0.5, y: 0, w: 0.5, h: 1 })
  assert.deepEqual(rectDeClave('p', ['acomp', 'master', null, 'p']), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 })
  assert.equal(rectDeClave('nada', ['acomp', null, null, null]), null)
})
