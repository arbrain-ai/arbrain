import React from 'react'
import { createRoot } from 'react-dom/client'
import { ChatPanel, MessageBubble } from '../../src/features/chat/components/ChatPanel'
import { CabinaProvider } from '../../src/features/cabina/Cabina'
import type { ChatMessage } from '../../src/features/chat/hooks/useChat'
import { encodeTextAttachments } from '../../src/features/chat/lib/text-attachments'
import '../../src/app/globals.css'

// Mensaje a mitad de turno (5 nov 2026, Daniel: «si es tan smooth no debería cambiar el tamaño del mensaje»). El ChatPanel
// REAL con dos conversaciones de datos inventados: `?session=historial` es un turno recargado de la base (filas con
// `metadata.injectedInto`, que plegarInyectadas mete dentro de la respuesta) y `?session=vivo` el mismo turno aún
// transmitiendo, con un mensaje leído en su lugar y otro todavía enviándose. Lo recorre scripts/qa/capturas-nota-a-mitad.mjs.
const LARGO = 'Oye, antes de seguir con la tabla: los tres primeros renglones ya los revisé y están bien. Lo que me preocupa es la columna de fechas, que viene mezclada (unas en día/mes y otras en mes/día).\n\nNormalízalas todas a día/mes/año y luego sigue con el resumen.'
const NORMAL = 'Arma el resumen semanal del inventario de la tienda de ejemplo: qué se vendió más, qué se quedó parado y qué conviene reponer antes del viernes.'
const ADJUNTO = encodeTextAttachments('Y usa esta lista de proveedores para la parte de reponer (la página es https://ejemplo.com/proveedores):', [{ name: 'proveedores.txt', content: Array.from({ length: 40 }, (_, i) => `Proveedor ${i + 1} · entrega en ${2 + (i % 5)} días · pedido mínimo ${100 + i * 10}`).join('\n') }])
const ANTES = 'Abro la hoja del inventario y la cruzo con las ventas de la semana.\n\nYa tengo las 214 filas cargadas; empiezo por los productos con más salida.'
const DESPUES = 'Listo, normalicé las 214 fechas a día/mes/año (37 venían en mes/día).\n\n**Lo que más se vendió:** café molido, filtros y tazas de barro.\n\n**Lo parado:** termos de acero, sin salida en tres semanas.\n\n¿Reviso también el mes pasado para comparar?'

const t = (min: number) => new Date(Date.UTC(2026, 10, 5, 18, min)).toISOString()
const tools = { toolCalls: [{ toolId: 't1', toolName: 'Read', status: 'done' }, { toolId: 't2', toolName: 'Bash', status: 'done' }], toolInputs: { t1: JSON.stringify({ file_path: '/tmp/inventario.csv' }), t2: JSON.stringify({ command: 'python3 resumen.py', description: 'Cruzar ventas e inventario' }) } }
const filas = (id: string) => [
  { id: 'u1', session_id: id, role: 'user', content: NORMAL, created_at: t(0), metadata: { turnId: 'turno-1' } },
  { id: 'u2', session_id: id, role: 'user', content: LARGO, created_at: t(1), metadata: { turnId: 'iny-1', injectedInto: 'turno-1', afterToolId: 't1', trasTexto: ANTES.length, ancla: ANTES.slice(-60) } },
  { id: 'a1', session_id: id, role: 'assistant', content: `${ANTES}\n\n${DESPUES}`, created_at: t(2), metadata: { turnId: 'turno-1', ...tools } },
  { id: 'u3', session_id: id, role: 'user', content: ADJUNTO, created_at: t(3), metadata: { turnId: 'turno-2' } },
  { id: 'a2', session_id: id, role: 'assistant', content: 'Con la lista: conviene pedir café y filtros al proveedor 3, que entrega en dos días.', created_at: t(4), metadata: { turnId: 'turno-2' } },
]
const SESIONES = ['historial'].map(id => ({ id, title: 'Mensaje a mitad de turno', is_favorite: false, profile_id: 'fixture-owner', created_at: t(0), updated_at: t(4) }))

const real = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input), location.href)
  const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } })
  if (!url.pathname.startsWith('/api/')) return real(input, init)
  const abierta = url.pathname.match(/^\/api\/chat\/sessions\/([^/]+)(\/messages)?$/)
  if (abierta) {
    const id = decodeURIComponent(abierta[1])
    if (abierta[2]) return json({ messages: filas(id), hasMore: false })
    return json({ session: { ...SESIONES[0], id }, messages: filas(id), hasMore: false })
  }
  if (url.pathname.startsWith('/api/chat/sessions') || url.pathname === '/api/chat/active') return json({ sessions: SESIONES, items: [], active: [] })
  if (url.pathname === '/api/chat/efforts') return json({ current: 'medium', ultracode: false, levels: ['low', 'medium', 'high'] })
  return json({}, 404)
}

// ?vivo: el turno todavía transmite. El mensaje largo ya lo tomó el motor (en su lugar) y uno corto se está enviando.
const ahora = Date.now()
const VIVO: ChatMessage[] = [
  { id: 'u1', role: 'user', content: NORMAL, timestamp: new Date(ahora - 120_000) },
  { id: 'a1', role: 'assistant', content: `${ANTES}\n\nNormalizando las fechas`, timestamp: new Date(ahora - 110_000), streaming: true,
    toolCalls: [{ toolId: 't1', toolName: 'Read', status: 'done' }, { toolId: 't2', toolName: 'Bash', status: 'running' }] as ChatMessage['toolCalls'],
    toolInputs: tools.toolInputs,
    inyectados: [
      { id: 'iny-1', texto: LARGO, estado: 'leido', afterToolId: 't1', at: ahora - 90_000, trasTexto: ANTES.length, ancla: ANTES.slice(-60) },
      { id: 'iny-2', texto: 'Y avísame si algún producto se quedó en cero.', estado: 'enviando', at: ahora - 10_000 },
    ] },
]
const vivo = new URLSearchParams(location.search).has('vivo')

createRoot(document.getElementById('root')!).render(vivo
  ? <main style={{ height: '100dvh', overflowY: 'auto' }} className="bg-background text-foreground" data-arbrain-scroll="chat"><CabinaProvider messages={VIVO}><div className="chat-prose" style={{ padding: '24px 16px 40px' }}>
      {VIVO.map((m, i) => <div key={m.id} data-msg-id={m.id} className={i ? 'mt-5' : ''}><MessageBubble msg={m} /></div>)}
    </div></CabinaProvider></main>
  : <main style={{ height: '100dvh' }} className="flex w-full overflow-hidden bg-background text-foreground"><div className="flex min-w-0 flex-1 flex-col"><ChatPanel /></div></main>,
)
