import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mensajeLienzo } from '../../src/features/canvas/state/pide-a-levy'

test('el pedido va tal cual y debajo el lienzo con su id completo', () => {
  const id = 'b92843b6-e238-46e3-ad9b-d33d45a030cb'
  assert.equal(mensajeLienzo({ texto: '  Ordena esto en tres bloques ', paginaId: id, nombre: 'Clase del lunes' }),
    `Ordena esto en tres bloques\n\n(Lienzo «Clase del lunes» · id ${id})`)
})

test('vacío no manda nada; sin nombre dice «Sin título»', () => {
  assert.equal(mensajeLienzo({ texto: '   ', paginaId: 'x', nombre: 'A' }), null)
  assert.match(mensajeLienzo({ texto: 'hola', paginaId: 'x', nombre: ' ' })!, /«Sin título» · id x/)
})
