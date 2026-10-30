import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { esVistaConocida } from '../../src/features/cabina/model'

// 27 oct 2026: una pestaña fijada con `vista: 'historia'` (de una rama en obra) tumbó la app en todos los dispositivos.
test('una vista que este build no conoce no entra al panel', () => {
  assert.equal(esVistaConocida('vista-de-una-rama-en-obra'), false)
  assert.equal(esVistaConocida('historia'), true) // ya vive en main (harness-noche)
  assert.equal(esVistaConocida(undefined), false)
  assert.equal(esVistaConocida('calendario'), true)
})

