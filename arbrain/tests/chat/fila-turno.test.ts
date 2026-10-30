import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { detalleFila, etiquetaFila, leerFila } from '../../src/features/chat/lib/fila-turno'

// Caso 5 oct 16:56: Daniel en fila detrás de avisos; la UI decía «pregunta pendiente».
test('la etiqueta de fila dice lo que hay delante, nunca una pregunta que no existe', () => {
  assert.equal(etiquetaFila({ mensajes: 0, avisos: 2, pregunta: false, cediendo: false }), 'En fila · detrás de 2 avisos de agentes')
  assert.equal(etiquetaFila({ mensajes: 0, avisos: 1, pregunta: false, cediendo: false }), 'En fila · detrás de 1 aviso de agentes')
  assert.equal(etiquetaFila({ mensajes: 1, avisos: 0, pregunta: false, cediendo: false }), 'En fila · detrás de 1 mensaje tuyo')
  assert.equal(etiquetaFila({ mensajes: 2, avisos: 1, pregunta: false, cediendo: false }), 'En fila · detrás de 2 mensajes tuyos y 1 aviso de agentes')
  assert.equal(etiquetaFila({ mensajes: 0, avisos: 0, pregunta: false, cediendo: true }), 'En fila · Levy pausa un aviso de agentes para atenderte')
  assert.equal(etiquetaFila({ mensajes: 0, avisos: 1, pregunta: true, cediendo: false }), 'En fila · Levy espera tu respuesta a una pregunta')
  assert.equal(etiquetaFila(null), 'En fila · sale cuando termine el turno anterior de esta conversación')
  for (const fila of [null, { mensajes: 0, avisos: 2, pregunta: false, cediendo: false }, { mensajes: 0, avisos: 0, pregunta: false, cediendo: true }]) {
    assert.doesNotMatch(etiquetaFila(fila) + detalleFila(fila), /pregunta/)
  }
  assert.match(detalleFila({ mensajes: 0, avisos: 0, pregunta: false, cediendo: true }), /no se pierde/)
})

test('leerFila tolera frames viejos o rotos', () => {
  assert.equal(leerFila(undefined), null)
  assert.equal(leerFila({ avisos: 'x' }), null)
  assert.deepEqual(leerFila({ mensajes: 0, avisos: 1 }), { mensajes: 0, avisos: 1, pregunta: false, cediendo: false })
})
