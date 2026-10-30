import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mensajeParaCopia, metadataParaCopia, patronTitulosParecidos, tituloBase, tituloBifurcada, trozos } from '../../src/features/chat/lib/conversacion-bifurcada'

test('el título de la copia es «<título> (bifurcada)»', () => {
  assert.equal(tituloBifurcada('Plan de la masterclass', []), 'Plan de la masterclass (bifurcada)')
})

test('si ya hay una bifurcada, la siguiente numera: (bifurcada 2), (bifurcada 3)', () => {
  const t = 'Plan de la masterclass'
  assert.equal(tituloBifurcada(t, [`${t} (bifurcada)`]), `${t} (bifurcada 2)`)
  assert.equal(tituloBifurcada(t, [`${t} (bifurcada)`, `${t} (BIFURCADA 2)`]), `${t} (bifurcada 3)`)
})

test('bifurcar una bifurcación no apila sufijos', () => {
  assert.equal(tituloBase('Plan (bifurcada)'), 'Plan')
  assert.equal(tituloBase('Plan (bifurcada 4)'), 'Plan')
  assert.equal(tituloBifurcada('Plan (bifurcada)', ['Plan (bifurcada)']), 'Plan (bifurcada 2)')
})

test('título vacío o con espacios raros cae a «Conversación»', () => {
  assert.equal(tituloBifurcada('   ', []), 'Conversación (bifurcada)')
  assert.equal(tituloBifurcada('Hola   \n  mundo', []), 'Hola mundo (bifurcada)')
})

test('un título larguísimo no crece sin límite', () => {
  const largo = 'x'.repeat(300)
  assert.ok(tituloBifurcada(largo, []).length <= 80 + ' (bifurcada)'.length)
})

test('el patrón LIKE escapa % y _ del título', () => {
  assert.equal(patronTitulosParecidos('100%_listo'), '100\\%\\_listo (bifurcada%')
})

test('la metadata copiada pierde turnId (índice único por turno) y conserva el resto', () => {
  assert.deepEqual(metadataParaCopia({ turnId: 'abc', model: 'opus', questionPrompts: [] }), { model: 'opus', questionPrompts: [] })
  assert.equal(metadataParaCopia({ turnId: 'abc' }), null)
  assert.equal(metadataParaCopia(null), null)
  assert.equal(metadataParaCopia([1, 2]), null)
  assert.equal(metadataParaCopia('texto'), null)
})

test('el mensaje copiado apunta a la sesión nueva, conserva fecha y contenido y no lleva id', () => {
  const copia = mensajeParaCopia(
    { role: 'assistant', content: 'hola', created_at: '2026-10-01T12:00:00.000Z', audio_url: undefined, metadata: { turnId: 't1', a: 1 } },
    'sesion-nueva',
  )
  assert.deepEqual(copia, {
    session_id: 'sesion-nueva', role: 'assistant', content: 'hola', created_at: '2026-10-01T12:00:00.000Z',
    audio_url: null, image_url: null, metadata: { a: 1 },
  })
  assert.ok(!('id' in copia))
})

test('trozos parte la lista sin perder ni repetir elementos', () => {
  const lista = Array.from({ length: 7 }, (_, i) => i)
  const partes = trozos(lista, 3)
  assert.deepEqual(partes, [[0, 1, 2], [3, 4, 5], [6]])
  assert.deepEqual(partes.flat(), lista)
  assert.deepEqual(trozos([], 3), [])
})
