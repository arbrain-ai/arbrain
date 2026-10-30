import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  OCIO_PARA_APLICAR_MS, VIGENCIA_ESTADO_MS, esRutaDeVentana, leerEstado, momentoSeguro, rutaPorRestaurar, scrollTopRestaurado, serializarEstado,
} from '../../src/lib/actualizacion'

const quieto = { streamLocal: false, turnosServidor: 0, hijosVivos: 0, ocioMs: OCIO_PARA_APLICAR_MS }

test('sin nada vivo y 2 min de ocio, es momento seguro', () => {
  assert.deepEqual(momentoSeguro(quieto), { seguro: true })
})

test('un stream de esta ventana, un turno del servidor o un hijo vivo lo impiden', () => {
  assert.deepEqual(momentoSeguro({ ...quieto, streamLocal: true }), { seguro: false, razon: 'stream' })
  assert.deepEqual(momentoSeguro({ ...quieto, turnosServidor: 1 }), { seguro: false, razon: 'turno' })
  assert.deepEqual(momentoSeguro({ ...quieto, hijosVivos: 2 }), { seguro: false, razon: 'hijos' })
})

test('Daniel usando la ventana (menos de 2 min) lo impide; no saber los turnos no bloquea', () => {
  assert.deepEqual(momentoSeguro({ ...quieto, ocioMs: OCIO_PARA_APLICAR_MS - 1 }), { seguro: false, razon: 'uso' })
  assert.deepEqual(momentoSeguro({ ...quieto, turnosServidor: null, hijosVivos: null }), { seguro: true })
})

test('«Reiniciar» a mano es una orden: aplica aun con un turno en curso', () => {
  assert.deepEqual(momentoSeguro({ streamLocal: true, turnosServidor: 3, hijosVivos: 1, ocioMs: 0, manual: true }), { seguro: true })
})

test('el estado guardado va y vuelve; caduca y rechaza rutas externas o basura', () => {
  const ahora = 1_000_000_000
  const e = { ruta: '/chat?x=1', ts: ahora, chat: { alFinal: false, desdeAbajo: 420 } }
  assert.deepEqual(leerEstado(serializarEstado(e), ahora + 1000), e)
  assert.equal(leerEstado(serializarEstado(e), ahora + VIGENCIA_ESTADO_MS + 1), null)
  assert.equal(leerEstado(serializarEstado({ ...e, ruta: '//evil.com' }), ahora), null)
  assert.equal(leerEstado(serializarEstado({ ...e, ruta: 'https://evil.com' }), ahora), null)
  assert.equal(leerEstado('{no es json', ahora), null)
  assert.equal(leerEstado(null, ahora), null)
})

test('solo se navega si el arranque cayó en otra ruta', () => {
  const e = { ruta: '/calendar', ts: 1 }
  assert.equal(rutaPorRestaurar(e, '/calendar'), null)
  assert.equal(rutaPorRestaurar(e, '/chat'), '/calendar')
})

test('el scroll pegado al final sigue pegado aunque crezca el hilo; si no, conserva la distancia', () => {
  assert.equal(scrollTopRestaurado({ alFinal: true, desdeAbajo: 10 }, 5000, 800), 4200)
  assert.equal(scrollTopRestaurado({ alFinal: false, desdeAbajo: 600 }, 5000, 800), 3600)
  assert.equal(scrollTopRestaurado({ alFinal: false, desdeAbajo: 9999 }, 1000, 800), 0)
})

test('regresión 7 oct: la ruta de una ventana sacada nunca se restaura ni sustituye a la de la principal', () => {
  const ahora = 1_000_000_000
  assert.equal(esRutaDeVentana('/panel?ventana=1'), true)
  assert.equal(esRutaDeVentana('/panel'), true)
  assert.equal(esRutaDeVentana('/chat'), false)
  assert.equal(esRutaDeVentana('/panelx'), false)
  // El localStorage es compartido: si la Ventana 1 lo escribió, la principal lo descarta.
  assert.equal(leerEstado(serializarEstado({ ruta: '/panel?ventana=1', ts: ahora }), ahora), null)
  // Aunque el estado fuera válido, la principal no navega a un panel ni una ventana sacada navega a otra ruta.
  assert.equal(rutaPorRestaurar({ ruta: '/panel?ventana=1', ts: 1 }, '/chat'), null)
  assert.equal(rutaPorRestaurar({ ruta: '/calendar', ts: 1 }, '/panel?ventana=1'), null)
  assert.equal(rutaPorRestaurar({ ruta: '/calendar', ts: 1 }, '/chat'), '/calendar')
})
