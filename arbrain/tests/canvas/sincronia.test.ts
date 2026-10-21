import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { decidirSondeo, fusionarConBase } from '../../src/features/canvas/state/nube'
import type { CanvasElement } from '../../src/features/canvas/model/element'

const el = (id: string, x = 0, updatedAt = 1): CanvasElement => ({
  id, type: 'shape', x, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1,
  createdAt: 1, updatedAt,
} as unknown as CanvasElement)

test('sondeo: solo trae si el servidor va adelante; ocupado espera sin perder la vuelta', () => {
  assert.equal(decidirSondeo({ servidor: null, conocida: 4, ocupado: false }), 'nada')
  assert.equal(decidirSondeo({ servidor: 4, conocida: 4, ocupado: false }), 'nada')   // mi propio eco
  assert.equal(decidirSondeo({ servidor: 3, conocida: 4, ocupado: false }), 'nada')
  assert.equal(decidirSondeo({ servidor: 5, conocida: 4, ocupado: false }), 'traer')
  assert.equal(decidirSondeo({ servidor: 5, conocida: 4, ocupado: true }), 'esperar')
})

test('tres vías: nada nuevo = el MISMO arreglo y sin aporte (mirar no escribe)', () => {
  const base = [el('a'), el('b')]
  const local = base
  const r = fusionarConBase(base, local, base.map(e => ({ ...e })))
  assert.equal(r.elements, local)
  assert.equal(r.localAporta, false)
})

test('tres vías: lo que sfmap cambió entra; lo que sfmap agregó entra', () => {
  const base = [el('a'), el('b')]
  const remoto = [el('a', 50, 2), el('b'), el('c', 0, 2)]
  const r = fusionarConBase(base, base, remoto)
  assert.deepEqual(r.elements.map(e => [e.id, e.x]), [['a', 50], ['b', 0], ['c', 0]])
  assert.equal(r.localAporta, false)
})

test('tres vías: lo creado aquí que aún no viaja SOBREVIVE aunque sea más viejo que el guardado de sfmap', () => {
  const base = [el('a')]
  const local = [el('a'), el('nuevo', 0, 1)]          // updatedAt viejo a propósito
  const remoto = [el('a', 9, 99)]                      // sfmap guardó después, sin conocerlo
  const r = fusionarConBase(base, local, remoto)
  assert.deepEqual(r.elements.map(e => e.id).sort(), ['a', 'nuevo'])
  assert.equal(r.elements.find(e => e.id === 'a')!.x, 9)
  assert.equal(r.localAporta, true)                    // hay que guardar la fusión
})

test('tres vías: lo que sfmap borró se va; si aquí se editó después, se queda', () => {
  const base = [el('a'), el('b'), el('c')]
  const local = [el('a'), el('b', 7, 5), el('c')]
  const remoto = [el('a')]
  const r = fusionarConBase(base, local, remoto)
  assert.deepEqual(r.elements.map(e => e.id), ['a', 'b'])
})

test('tres vías: lo borrado aquí no resucita, salvo que sfmap lo haya editado', () => {
  const base = [el('a'), el('b')]
  const local = [el('a')]
  assert.deepEqual(fusionarConBase(base, local, [el('a'), el('b')]).elements.map(e => e.id), ['a'])
  assert.deepEqual(fusionarConBase(base, local, [el('a'), el('b', 3, 9)]).elements.map(e => e.id), ['a', 'b'])
})

test('tres vías: lo que el usuario está editando no se pisa (cambio solo local gana aunque su reloj sea viejo)', () => {
  const base = [el('a', 0, 10)]
  const local = [el('a', 30, 5)]           // reloj del aparato atrasado
  const remoto = [el('a', 0, 10)]          // alla nadie lo toco
  const r = fusionarConBase(base, local, remoto)
  assert.equal(r.elements[0].x, 30)
  // Los dos lo cambiaron: gana el updatedAt más alto; empate, lo local.
  assert.equal(fusionarConBase(base, [el('a', 30, 20)], [el('a', 40, 20)]).elements[0].x, 30)
  assert.equal(fusionarConBase(base, [el('a', 30, 20)], [el('a', 40, 21)]).elements[0].x, 40)
})

test('mismo contenido: un arreglo nuevo con lo mismo no es edición; un cambio real sí', async () => {
  const { mismoContenido } = await import('../../src/features/canvas/state/nube')
  const a = [el('a'), el('b')]
  assert.equal(mismoContenido(a, a.map(e => ({ ...e }))), true)
  assert.equal(mismoContenido(a, [a[0], el('b', 3)]), false)
  assert.equal(mismoContenido(a, [a[0]]), false)
  assert.equal(mismoContenido(a, a.map(e => ({ ...e })), 1), false)   // pasó el tope: se da por cambiado
})
