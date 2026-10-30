import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { devolverAlComposer, sacarDeFila } from '../../src/features/chat/lib/fila-edicion'
import { unirFila } from '../../src/features/chat/lib/envio-chat'

// Caso real del 12 oct 2026: «le di editar al botón y el texto se bajó pero las fotos se quedaron arriba».
const foto1 = 'http://127.0.0.1:8000/storage/v1/object/public/chat/a.jpg'
const foto2 = 'http://127.0.0.1:8000/storage/v1/object/public/chat/b.jpg'
const vacio = { input: '', textFiles: [] as unknown[], imageFiles: [] as unknown[], imagenesSubidas: [] as string[], editingMsgId: null as string | null }
const pendiente = (id: string, texto: string, imagenes?: string[]) => ({ id, texto, creado: 1, ...(imagenes ? { imagenes } : {}) })

test('editar un mensaje en fila con texto + 2 fotos lo devuelve completo al composer y la fila queda vacía', () => {
  const fila = [pendiente('m1', 'Mira estas dos capturas', [foto1, foto2])]
  const r = sacarDeFila(fila, 'm1')
  assert.ok(r)
  assert.deepEqual(r.resto, [])
  const draft = devolverAlComposer(vacio, r.item)
  assert.equal(draft.input, 'Mira estas dos capturas')
  assert.deepEqual(draft.imagenesSubidas, [foto1, foto2])
  // Al reenviarlo vuelve a ser el mismo mensaje, una sola vez.
  assert.deepEqual(unirFila([{ texto: draft.input, imagenes: draft.imagenesSubidas }]), { texto: 'Mira estas dos capturas', imagenes: [foto1, foto2] })
})

test('un mensaje solo con fotos también se puede editar y sale entero de la fila', () => {
  const r = sacarDeFila([pendiente('m1', '', [foto1, foto2])], 'm1')!
  assert.deepEqual(r.resto, [])
  const draft = devolverAlComposer({ ...vacio, input: 'ya escribía algo' }, r.item)
  assert.equal(draft.input, 'ya escribía algo')
  assert.deepEqual(draft.imagenesSubidas, [foto1, foto2])
})

test('con varias entradas solo sale la editada; ↑ (sin id) saca la última; lo del composer se conserva delante', () => {
  const fila = [pendiente('a', 'uno', [foto1]), pendiente('b', 'dos'), pendiente('c', 'tres', [foto2])]
  const medio = sacarDeFila(fila, 'b')!
  assert.deepEqual(medio.resto.map(x => x.id), ['a', 'c'])
  const ultimo = sacarDeFila(medio.resto)!
  assert.equal(ultimo.item.id, 'c')
  assert.deepEqual(ultimo.resto.map(x => x.id), ['a'])
  const draft = devolverAlComposer({ ...vacio, input: 'hola', imagenesSubidas: [foto1] }, ultimo.item)
  assert.equal(draft.input, 'hola\n\ntres')
  assert.deepEqual(draft.imagenesSubidas, [foto1, foto2])
  assert.equal(sacarDeFila([], undefined), null)
  assert.equal(sacarDeFila(fila, 'no-existe'), null)
})
