import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DOT_TITLE, IndicadorConversacion } from '../../src/features/chat/components/IndicadorConversacion'
import { opcionesMenu } from '../../src/features/chat/lib/atajos-conversacion'
import type { ChatSession } from '../../src/features/chat/hooks/useChatHistory'

const html = (is_starred: boolean, estado: 'working' | 'needs_reply' | 'unread' | 'read', archived_at: string | null = null) =>
  renderToStaticMarkup(createElement(IndicadorConversacion, { sesion: { is_starred, archived_at }, estado }))

test('la favorita muestra estrella en lugar del punto', () => {
  const h = html(true, 'read')
  assert.match(h, /data-favorita="true"/)
  assert.doesNotMatch(h, /rounded-full/)
})

test('la estrella toma el color del estado: ámbar que late, azul, morado y contorno gris en reposo', () => {
  const w = html(true, 'working')
  assert.match(w, /animate-pulse/)
  assert.match(w, /fill="#fbbf24"/)
  assert.match(html(true, 'needs_reply'), /fill="#3b82f6"/)
  assert.match(html(true, 'unread'), /fill="#8c27f1"/)
  const r = html(true, 'read')
  assert.match(r, /fill="none"/)
  assert.doesNotMatch(r, /#ff9101|#fbbf24/)
})

test('estrella y punto comparten leyenda por estado', () => {
  for (const e of ['working', 'needs_reply', 'unread', 'read'] as const) {
    assert.ok(html(true, e).includes(DOT_TITLE[e]))
    assert.ok(html(false, e).includes(DOT_TITLE[e]))
  }
})

test('la no favorita (o archivada) conserva el punto del semáforo', () => {
  assert.match(html(false, 'unread'), /rounded-full/)
  assert.match(html(true, 'read', '2026-10-01'), /rounded-full/)
})

test('fijada no es favorita: solo `is_starred` lleva estrella (Daniel, 4 oct 2026)', () => {
  const fijada = renderToStaticMarkup(createElement(IndicadorConversacion, { sesion: { is_starred: false, archived_at: null }, estado: 'read' }))
  assert.match(fijada, /rounded-full/)
  const s = { id: 'a', title: 'x', is_favorite: true } as ChatSession
  assert.deepEqual(opcionesMenu(s).slice(0, 2).map((o) => o.etiqueta), ['Desfijar', 'Marcar como favorita'])
})
