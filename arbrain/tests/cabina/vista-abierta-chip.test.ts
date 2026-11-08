import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fijadaDe, type Fijada } from '../../src/features/cabina/panel/fijadas'

// 5 nov 2026, Daniel 07:47: «es molesto porque ya lo abri en la pantalla izquierda!». Si la misma vista (misma vista +
// sección o ruta) ya vive en una pestaña del panel, el hilo no la vuelve a pintar entera: VistaViva pinta el chip
// «Abierta a la izquierda · Ir», que enfoca esa pestaña. El chip sale cuando fijadaDe encuentra su pestaña; el e2e
// (tests/cabina/e2e/vista-scroll, caso chip) prueba el chip y el «Ir» en WebKit.

const pestana = (id: string, input: Fijada['input']): Fijada => ({ id, input, en: 0 })

test('«Tu negocio» abierto desde el «+» y Levy lo muestra en el chat: es la misma pestaña', () => {
  const fijadas = [pestana('mano-negocio', { vista: 'negocio' })]
  assert.equal(fijadaDe(fijadas, 'toolu_1', { vista: 'negocio', titulo: 'Tu negocio completo', enfoque: 'El cuello está en Casos' })?.id, 'mano-negocio')
})

test('otra sección del negocio no es la misma vista: se pinta en el hilo', () => {
  const fijadas = [pestana('mano-negocio', { vista: 'negocio' })]
  assert.equal(fijadaDe(fijadas, 'toolu_1', { vista: 'negocio', seccion: 'oferta' }), undefined)
  assert.equal(fijadaDe([pestana('f1', { vista: 'negocio', seccion: 'oferta' })], 'toolu_1', { vista: 'negocio', seccion: 'oferta' })?.id, 'f1')
})

test('un documento es su ruta: abierto a la izquierda, en el hilo va el chip', () => {
  const fijadas = [pestana('f-doc', { vista: 'documento', ruta: 'docs/business-os/oferta.md' })]
  assert.equal(fijadaDe(fijadas, 'toolu_2', { vista: 'documento', ruta: 'docs/business-os/oferta.md', titulo: 'Oferta' })?.id, 'f-doc')
  assert.equal(fijadaDe(fijadas, 'toolu_2', { vista: 'documento', ruta: 'docs/business-os/avatar.md' }), undefined)
})

test('la invocación que Daniel fijó con el alfiler también cuenta como abierta', () => {
  assert.equal(fijadaDe([pestana('toolu_3', { vista: 'finanzas' })], 'toolu_3', { vista: 'finanzas' })?.id, 'toolu_3')
})

test('sin pestaña de esa vista, el hilo la pinta completa', () => {
  assert.equal(fijadaDe([pestana('mano-calendario', { vista: 'calendario' })], 'toolu_4', { vista: 'negocio' }), undefined)
})
