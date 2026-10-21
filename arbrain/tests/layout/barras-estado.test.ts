import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { ESTADO_INICIAL, alternarConversaciones, leerEstado, serializarEstado } from '../../src/shared/lib/barras-estado'

test('arranca con la barra de conversaciones a la vista', () => {
  assert.deepEqual(ESTADO_INICIAL, { conversaciones: true })
})

test('alternar esconde y vuelve a mostrar la única barra', () => {
  const oculta = alternarConversaciones(ESTADO_INICIAL)
  assert.deepEqual(oculta, { conversaciones: false })
  assert.deepEqual(alternarConversaciones(oculta), ESTADO_INICIAL)
})

test('lo guardado vuelve tal cual', () => {
  for (const e of [ESTADO_INICIAL, { conversaciones: false }]) assert.deepEqual(leerEstado(serializarEstado(e)), e)
})

test('lo guardado por la versión de dos barras sigue valiendo: solo cuenta conversaciones', () => {
  assert.deepEqual(leerEstado('{"iconos":true,"conversaciones":false,"previo":null}'), { conversaciones: false })
  assert.deepEqual(leerEstado('{"iconos":false,"conversaciones":true,"previo":{"iconos":true,"conversaciones":true}}'), { conversaciones: true })
})

test('lo guardado roto, vacío o con tipos raros cae al inicial sin lanzar', () => {
  for (const raw of [null, undefined, '', '{', 'null', '[]', '"x"', '{"conversaciones":1}', '{"iconos":true}']) {
    assert.deepEqual(leerEstado(raw), ESTADO_INICIAL, String(raw))
  }
})
