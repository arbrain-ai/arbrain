import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { veredicto, type FilaServidor } from '../../src/features/cabina/vistas/servidores-veredicto'

const fila = (nombre: string, estado: FilaServidor['estado'], grupo: FilaServidor['grupo'] = 'miembros'): FilaServidor =>
  ({ id: nombre, grupo, nombre, que: '', estado, frase: null, dato: null, revisado: new Date().toISOString(), racha: 0, desde: null, detalle: {} })

test('todo verde dice que todo abre', () => {
  assert.deepEqual(veredicto([fila('SaaS Factory', 'ok'), fila('VPS', 'ok', 'maquinas')]), { tono: 'ok', texto: 'Todo lo que usan tus miembros abre.' })
})
test('un caído de miembros manda en el titular y se nombra', () => {
  const v = veredicto([fila('SaaS Factory', 'caido'), fila('Labs', 'caido'), fila('Mensajero', 'sin-dato')])
  assert.equal(v.tono, 'caido')
  assert.equal(v.texto, 'SaaS Factory y Labs no abren para tus miembros.')
})
test('«sin dato» nunca se lee como verde', () => {
  const v = veredicto([fila('SaaS Factory', 'ok'), fila('Mensajero de avisos', 'sin-dato')])
  assert.equal(v.tono, 'sin-dato')
  assert.match(v.texto, /No pude comprobar Mensajero de avisos/)
})
test('miembros bien y casa con problema: lo dice sin alarmar a los miembros', () => {
  assert.equal(veredicto([fila('SaaS Factory', 'ok'), fila('Motor', 'caido', 'cerebro')]).texto, 'Tus miembros entran bien, pero algo de tu cerebro está caído.')
  assert.equal(veredicto([fila('SaaS Factory', 'ok'), fila('Funnel', 'lento', 'cerebro')]).tono, 'lento')
})
