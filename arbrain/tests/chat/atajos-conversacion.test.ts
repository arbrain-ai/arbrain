import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { esProtegida, esTeclaDeAtajo, opcionesMenu, opcionPorTecla, tieneMenu } from '../../src/features/chat/lib/atajos-conversacion'
import type { ChatSession } from '../../src/features/chat/hooks/useChatHistory'

const ISO = '2026-10-01T12:00:00.000Z'
const ses = (extra: Partial<ChatSession> = {}): ChatSession => ({
  id: 'x', title: 'Hola', is_favorite: false, profile_id: null, created_at: ISO, updated_at: ISO, last_message_at: ISO,
  last_role: 'assistant', last_read_at: ISO, ...extra,
})
const letras = (s: ChatSession) => opcionesMenu(s).map((o) => `${o.letra}:${o.id}`).join(' ')

test('menú completo: Favorita P, no leído U, Cambiar nombre R, Bifurcar F, Archivar A, Eliminar D', () => {
  assert.equal(letras(ses()), 'P:fijar S:favorita U:no-leida R:renombrar F:bifurcar A:archivar D:eliminar')
})

test('Fijar/Desfijar y Marcar como favorita/Quitar de favoritas son acciones aparte; no leído cambia según el estado', () => {
  assert.equal(opcionesMenu(ses({ is_favorite: true }))[0].etiqueta, 'Desfijar')
  assert.equal(opcionesMenu(ses({ is_favorite: true }))[1].etiqueta, 'Marcar como favorita')
  assert.equal(opcionesMenu(ses({ is_favorite: true, is_starred: true }))[1].etiqueta, 'Quitar de favoritas')
  assert.equal(opcionesMenu(ses())[2].etiqueta, 'Marcar como no leído')
  assert.equal(opcionesMenu(ses({ last_read_at: null }))[2].etiqueta, 'Marcar como leído')
})

test('«Marcar como no leído» está apagada si el último mensaje no es de Levy', () => {
  const o = opcionesMenu(ses({ last_role: 'user' })).find((x) => x.id === 'no-leida')
  assert.equal(o?.deshabilitada, true)
  assert.ok(o?.motivo)
  assert.equal(opcionPorTecla(opcionesMenu(ses({ last_role: 'user' })), 'u'), null)
})

test('Eliminar va aparte y en rojo', () => {
  const eliminar = opcionesMenu(ses()).at(-1)
  assert.equal(eliminar?.id, 'eliminar')
  assert.equal(eliminar?.peligro, true)
  assert.equal(eliminar?.separador, true)
})

test('archivada: solo Desarchivar (A) y Eliminar (D)', () => {
  assert.equal(letras(ses({ archived_at: ISO })), 'A:archivar D:eliminar')
  assert.equal(opcionesMenu(ses({ archived_at: ISO }))[0].etiqueta, 'Desarchivar')
})

test('el hilo «Automatizaciones» fijado no se desfija (los crons lo buscan fijado); un duplicado suelto solo se fija', () => {
  const auto = ses({ title: 'Automatizaciones', is_favorite: true })
  assert.equal(esProtegida(auto), true)
  assert.equal(letras(auto), 'S:favorita U:no-leida')
  assert.equal(letras(ses({ title: 'Automatizaciones', is_favorite: false })), 'P:fijar')
})

test('sin menú en solo-SDK ni en conversaciones por crear', () => {
  assert.equal(tieneMenu(ses()), true)
  assert.equal(tieneMenu(ses({ isSDKOnly: true })), false)
  assert.equal(tieneMenu(ses({ pendingCreation: true })), false)
})

test('la letra ejecuta sin importar mayúsculas; una letra sin opción no hace nada', () => {
  const ops = opcionesMenu(ses())
  assert.equal(opcionPorTecla(ops, 'f')?.id, 'bifurcar')
  assert.equal(opcionPorTecla(ops, 'D')?.id, 'eliminar')
  assert.equal(opcionPorTecla(ops, 'z'), null)
  assert.equal(opcionPorTecla(ops, 'Enter'), null)
})

test('solo la letra sola es atajo: no con Cmd/Ctrl/Alt, ni espacio, ni dentro de composición', () => {
  const k = (key: string, extra: Partial<KeyboardEvent> = {}) =>
    esTeclaDeAtajo({ key, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, ...extra })
  assert.equal(k('p'), true)
  assert.equal(k('p', { metaKey: true }), false)
  assert.equal(k('p', { ctrlKey: true }), false)
  assert.equal(k('p', { altKey: true }), false)
  assert.equal(k(' '), false)
  assert.equal(k('Enter'), false)
  assert.equal(k('p', { isComposing: true }), false)
})
