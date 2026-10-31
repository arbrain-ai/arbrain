import React from 'react'
import { createRoot } from 'react-dom/client'
import { ChatPanel } from '../../src/features/chat/components/ChatPanel'
import '../../src/app/globals.css'

// Teclear en el composer (31 oct 2026, Daniel: «cada tecla como que hace parpadear la pantalla, sube y baja»).
// El ChatPanel REAL con una conversación larga abierta por deep-link (?session=lab) y un daemon simulado. Lo recorre
// scripts/qa/test-composer-teclear-browser.mjs midiendo el hilo cuadro a cuadro mientras se escribe.
const SESION = { id: 'lab', title: 'Teclear', is_favorite: false, profile_id: 'fixture-owner', created_at: '2026-10-31T12:00:00Z', updated_at: '2026-10-31T13:00:00Z' }
const parrafo = 'Sistemas que se gobiernan solos cada vez más grandes. El composer de abajo no debe mover este texto mientras escribes, ni un pixel, ni un cuadro.'
const MENSAJES = Array.from({ length: 30 }, (_, i) => ({
  id: `m${i}`, session_id: 'lab', role: i % 2 ? 'assistant' : 'user',
  content: i % 2 ? `${parrafo}\n\n${parrafo} ${parrafo}\n\n- uno\n- dos\n- tres` : `${parrafo} (${i})`,
  created_at: new Date(Date.UTC(2026, 9, 31, 12, i)).toISOString(),
}))
const real = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input), location.href)
  const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } })
  if (!url.pathname.startsWith('/api/')) return real(input, init)
  // Cualquier ?session= abre la misma conversación (cada escenario usa la suya: su borrador empieza vacío).
  const abierta = url.pathname.match(/^\/api\/chat\/sessions\/([^/]+)(\/messages)?$/)
  if (abierta) {
    const id = decodeURIComponent(abierta[1]), mensajes = MENSAJES.map((m) => ({ ...m, session_id: id }))
    if (abierta[2]) return json({ messages: mensajes, hasMore: false })
    if (url.searchParams.get('with') === 'messages') return json({ session: { ...SESION, id }, messages: mensajes, hasMore: false })
  }
  if (url.pathname.startsWith('/api/chat/sessions') || url.pathname === '/api/chat/active') return json({ sessions: [SESION], items: [], active: [] })
  if (url.pathname === '/api/chat/efforts') return json({ current: 'medium', ultracode: false, levels: ['low', 'medium', 'high'] })
  return json({}, 404)
}

// ?zoom=1.4: el zoom CSS de la app (ZoomController, ⌘+), como en la Mac de Daniel.
const zoom = Number(new URLSearchParams(location.search).get('zoom')) || 1
if (zoom !== 1) {
  const root = document.documentElement
  root.style.setProperty('zoom', String(zoom)); root.style.setProperty('--ui-zoom', String(zoom))
  root.style.setProperty('--ui-zoomed-app-h', `${innerHeight / zoom}px`); root.style.setProperty('--ui-zoomed-app-w', `${innerWidth / zoom}px`)
}

createRoot(document.getElementById('root')!).render(
  <main style={{ height: 'var(--ui-zoomed-app-h, 100dvh)' }} className="flex w-full overflow-hidden bg-background text-foreground"><div className="flex min-w-0 flex-1 flex-col"><ChatPanel /></div></main>,
)
