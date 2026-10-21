import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { urlDeCarga } from '../../src/features/canvas/render/images'
import { GREEKING_PX, anchoGreeking, enGreeking } from '../../src/features/canvas/render/greeking'

test('texto estático: bajo ~6,5 px en pantalla es greeking; a tamaño de lectura, no; lo grande se lee de lejos', () => {
  assert.equal(enGreeking(20, 0.3), true)   // 6 px
  assert.equal(enGreeking(20, GREEKING_PX / 20), false)
  assert.equal(enGreeking(34, 0.1), true)   // título de tarjeta (34 u) a 10 %: 3,4 px, ya no se infla
  assert.equal(enGreeking(150, 0.1), false) // palabra de escala de mapa (150 u) a 10 %: 15 px, se lee
})

test('el greeking estima el ancho por caracteres, sin medir, y no pasa de su caja', () => {
  assert.equal(anchoGreeking('hola', 20, 500), 40)
  assert.equal(anchoGreeking('un renglón larguísimo de texto', 20, 100), 100)
})

test('las rutas del disco se piden al servidor; las web no se tocan', () => {
  assert.equal(urlDeCarga('/Users/tu-usuario/x/logo.png'), '/api/canvas/imagen?ruta=%2FUsers%2Ftu-usuario%2Fx%2Flogo.png')
  assert.equal(urlDeCarga('~/x.png'), '/api/canvas/imagen?ruta=~%2Fx.png')
  assert.equal(urlDeCarga('/img/x.png'), '/img/x.png')
  assert.equal(urlDeCarga('https://a.b/x.png'), 'https://a.b/x.png')
})

test('sensibilidad: 1× por defecto, acotada y sin almacenamiento no truena', async () => {
  const s = await import('../../src/features/canvas/input/sensibilidad')
  s._olvidarSensibilidad()
  assert.deepEqual(s.leerSensibilidad(), { paneo: 1, zoom: 1 })
  assert.equal(s.guardarSensibilidad({ paneo: 99 }).paneo, s.SENSIBILIDAD_MAX)
  assert.equal(s.guardarSensibilidad({ zoom: 0 }).zoom, s.SENSIBILIDAD_MIN)
  assert.equal(s.factorPaneo(), s.SENSIBILIDAD_MAX)
  s._olvidarSensibilidad()
})
