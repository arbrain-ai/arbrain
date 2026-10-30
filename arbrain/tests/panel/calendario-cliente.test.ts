import test from 'node:test'
import assert from 'node:assert/strict'
import { ID_CALENDARIO_INICIAL, siembraCalendario, type Fijada } from '../../src/features/cabina/panel/fijadas'

// 22 oct 2026: el calendario de la edición cliente vive en el panel (no en la cabecera del chat): se siembra una vez.
const f = (id: string, vista: string): Fijada => ({ id, input: { vista } as Fijada['input'], en: 1 })

test('cliente sin calendario: nace la pestaña en Día', () => {
  const s = siembraCalendario([f('a', 'lienzo')], true, false)
  assert.equal(s?.id, ID_CALENDARIO_INICIAL)
  assert.deepEqual(s?.input, { vista: 'calendario', alcance: 'dia' })
})

test('no se siembra en la instalación de Daniel, ni dos veces, ni si ya hay calendario (u objetivos, que es el mismo)', () => {
  assert.equal(siembraCalendario([], false, false), null)
  assert.equal(siembraCalendario([], true, true), null)
  assert.equal(siembraCalendario([f('c', 'calendario')], true, false), null)
  assert.equal(siembraCalendario([f('o', 'objetivos')], true, false), null)
})
