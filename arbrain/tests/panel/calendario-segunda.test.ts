import test from 'node:test'
import assert from 'node:assert/strict'
import { acomodoSegunda, ID_CALENDARIO_INICIAL, type Fijada } from '../../src/features/cabina/panel/fijadas'
import { esCorreoSegunda } from '../../src/features/cabina/panel/segunda'

// 2 nov 2026: el panel de la segunda persona nacía con «Tareas» (el Todoist del dueño, un 403 que decía «calendario») y
// ella creía que su calendario no estaba listo. Su panel: sin Tareas y con su Calendario primero.
const f = (id: string, vista: string): Fijada => ({ id, input: { vista } as Fijada['input'], en: 1 })

test('panel de fábrica (Tareas a la vista): se va Tareas y su Calendario de la semana queda primero y a la vista', () => {
  const r = acomodoSegunda({ fijadas: [], orden: ['tareas'], ancladas: [], activa: 'tareas' }, false)
  assert.deepEqual(r?.orden, [ID_CALENDARIO_INICIAL])
  assert.equal(r?.activa, ID_CALENDARIO_INICIAL)
  assert.deepEqual(r?.fijadas[0].input, { vista: 'calendario', alcance: 'semana' })
})

test('ya tenía su calendario abierto: no se duplica; si Tareas estaba a la vista, pasa a su calendario', () => {
  const r = acomodoSegunda({ fijadas: [f('mano-cal', 'calendario')], orden: ['tareas', 'mano-cal'], ancladas: [], activa: 'tareas' }, false)
  assert.equal(r?.fijadas.length, 1)
  assert.deepEqual(r?.orden, ['mano-cal'])
  assert.equal(r?.activa, 'mano-cal')
})

test('ya sembrado y sin Tareas: no cambia nada (si cerró su calendario, se respeta)', () => {
  assert.equal(acomodoSegunda({ fijadas: [f('l', 'lienzo')], orden: ['l'], ancladas: [], activa: 'l' }, true), null)
})

test('sembrado antes pero Tareas volvió (otra versión): se quita sin volver a sembrar', () => {
  const r = acomodoSegunda({ fijadas: [], orden: ['tareas'], ancladas: [], activa: 'tareas' }, true)
  assert.deepEqual(r?.orden, [])
  assert.equal(r?.fijadas.length, 0)
  assert.equal(r?.activa, 'taller')
})

test('quién es la segunda: su correo sin importar mayúsculas; nunca en la edición cliente ni sin correo', () => {
  assert.equal(esCorreoSegunda('Zutana@Ejemplo.com ', 'zutana@ejemplo.com', false), true)
  assert.equal(esCorreoSegunda('fulano@ejemplo.com', 'zutana@ejemplo.com', false), false)
  assert.equal(esCorreoSegunda('zutana@ejemplo.com', 'zutana@ejemplo.com', true), false)
  assert.equal(esCorreoSegunda(null, 'zutana@ejemplo.com', false), false)
  assert.equal(esCorreoSegunda('', '', false), false)
})
