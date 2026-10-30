import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { aplicarCambioALista, aplicarCambioARecientes, type CambioSesion } from '../../src/features/chat/lib/cambios-sesion'
import type { ChatSession } from '../../src/features/chat/hooks/useChatHistory'

const ISO = '2026-10-01T12:00:00.000Z'
const ses = (id: string, extra: Partial<ChatSession> = {}): ChatSession => ({
  id, title: `t-${id}`, is_favorite: false, profile_id: null, created_at: ISO, updated_at: ISO, last_message_at: ISO, ...extra,
})

test('parche: cambia solo esa conversación; si no está, devuelve la MISMA lista', () => {
  const lista = [ses('a'), ses('b')]
  const c: CambioSesion = { tipo: 'parche', id: 'b', parche: { title: 'nuevo' } }
  const out = aplicarCambioALista(lista, c)
  assert.equal(out[1].title, 'nuevo')
  assert.equal(out[0], lista[0])
  assert.equal(aplicarCambioALista(lista, { tipo: 'parche', id: 'zz', parche: { title: 'x' } }), lista)
})

test('quitada: la saca; si no está, misma referencia', () => {
  const lista = [ses('a'), ses('b')]
  assert.deepEqual(aplicarCambioALista(lista, { tipo: 'quitada', id: 'a', motivo: 'archivada' }).map((s) => s.id), ['b'])
  assert.equal(aplicarCambioALista(lista, { tipo: 'quitada', id: 'zz', motivo: 'eliminada' }), lista)
})

test('agregada: entra al principio y no se duplica', () => {
  const lista = [ses('a')]
  const out = aplicarCambioALista(lista, { tipo: 'agregada', sesion: ses('n') })
  assert.deepEqual(out.map((s) => s.id), ['n', 'a'])
  assert.equal(aplicarCambioALista(out, { tipo: 'agregada', sesion: ses('n') }), out)
})

test('fijar mueve la conversación de traídas a fijadas (y desfijar la saca de fijadas)', () => {
  const st = { sesiones: [ses('a')], traidas: [ses('b')], fijadas: [ses('f', { is_favorite: true })] }
  const fijada = aplicarCambioARecientes(st, { tipo: 'parche', id: 'b', parche: { is_favorite: true } })
  assert.deepEqual(fijada.fijadas.map((s) => s.id), ['b', 'f'])
  assert.equal(fijada.fijadas[0].is_favorite, true)
  const suelta = aplicarCambioARecientes(st, { tipo: 'parche', id: 'f', parche: { is_favorite: false } })
  assert.deepEqual(suelta.fijadas, [])
})

test('archivar o eliminar la quita de las tres listas', () => {
  const st = { sesiones: [ses('a')], traidas: [ses('a'), ses('b')], fijadas: [ses('a', { is_favorite: true })] }
  const out = aplicarCambioARecientes(st, { tipo: 'quitada', id: 'a', motivo: 'archivada' })
  assert.deepEqual(out.sesiones, [])
  assert.deepEqual(out.traidas.map((s) => s.id), ['b'])
  assert.deepEqual(out.fijadas, [])
})

test('una conversación nueva entra en traídas, y en fijadas solo si venía fijada; sesiones la repuebla ChatPanel', () => {
  const st = { sesiones: [ses('a')], traidas: [], fijadas: [] }
  const normal = aplicarCambioARecientes(st, { tipo: 'agregada', sesion: ses('n') })
  assert.deepEqual(normal.traidas.map((s) => s.id), ['n'])
  assert.deepEqual(normal.fijadas, [])
  assert.equal(normal.sesiones, st.sesiones)
  const fijada = aplicarCambioARecientes(st, { tipo: 'agregada', sesion: ses('p', { is_favorite: true }) })
  assert.deepEqual(fijada.fijadas.map((s) => s.id), ['p'])
})

test('un cambio que no toca nada devuelve el MISMO estado (no repinta)', () => {
  const st = { sesiones: [ses('a')], traidas: [], fijadas: [] }
  assert.equal(aplicarCambioARecientes(st, { tipo: 'parche', id: 'zz', parche: { title: 'x' } }), st)
})
