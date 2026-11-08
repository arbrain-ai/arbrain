// Arnés del visor de carpeta (6 nov 2026, Daniel 18:10: «doy clic a un video y luego me saca no puedo he podido ver
// ninguno aun»). La Cabina REAL con una carpeta de entrega como ruta, en sus dos casas:
//   ?modo=hilo    la vista en el hilo (CabinaProvider › CabinaDelMensaje › VistaViva), como la pinta ChatPanel.
//   ?modo=panel   la pestaña del panel (VistaFijada de PanelDerecho), grande.
// &ruta=… la carpeta. Los datos llegan por la caché real (datos.ts) desde la ruta real de la API (ejecutar.mjs la sirve).
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/shared/contexts/theme-context'
import { CabinaDelMensaje, CabinaProvider } from '@/features/cabina/Cabina'
import { VistaFijada } from '@/features/cabina/panel/PanelDerecho'
import type { ChatMessage } from '@/features/chat/hooks/useChat'

const q = new URLSearchParams(location.search)
const modo = q.get('modo') ?? 'hilo'
const ruta = q.get('ruta') ?? ''
const input = { vista: 'documento' as const, ruta, titulo: 'Los cortos' }

const MENSAJES: ChatMessage[] = [
  { id: 'u1', role: 'user', content: 'Enséñame los cortos.', timestamp: new Date(Date.now() - 60_000) },
  {
    id: 'a1', role: 'assistant', timestamp: new Date(Date.now() - 50_000), content: 'Arriba están los seis.',
    toolCalls: [{ toolId: 'toolu_carpeta', toolName: 'mcp__cabina__mostrar', status: 'done' }] as ChatMessage['toolCalls'],
    toolInputs: { toolu_carpeta: JSON.stringify(input) },
  },
  // La conversación sigue debajo de la vista (lo normal en un hilo vivo).
  ...Array.from({ length: 6 }, (_, i): ChatMessage => ({ id: `d${i}`, role: i % 2 ? 'assistant' : 'user', timestamp: new Date(Date.now() - 40_000 + i * 1000),
    content: Array.from({ length: 4 }, (_, j) => `Mensaje ${i + 1}, párrafo ${j + 1}: la conversación siguió después de que Levy mostró la carpeta, con el largo de una respuesta normal.`).join('\n\n') })),
]

function Hilo() {
  return <div data-hilo style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden' }}>
    <div className="chat-prose" style={{ padding: '16px 12px 40px' }}>
      <CabinaProvider messages={MENSAJES}>
        {MENSAJES.map(m => <div key={m.id} data-msg-id={m.id} className="mt-5">
          {m.role === 'user' ? <p style={{ textAlign: 'right', whiteSpace: 'pre-wrap' }}>{m.content}</p>
            : <article>{m.toolCalls?.length ? <CabinaDelMensaje msg={m} /> : null}{m.content.split('\n\n').map((p, j) => <p key={j} style={{ margin: '0 0 12px' }}>{p}</p>)}</article>}
        </div>)}
      </CabinaProvider>
    </div>
  </div>
}

function Panel() {
  return <div data-hilo style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
    <VistaFijada f={{ id: 'doc-cortos', input, en: 1 }} />
  </div>
}

createRoot(document.getElementById('raiz')!).render(<ThemeProvider>{modo === 'panel' ? <Panel /> : <Hilo />}</ThemeProvider>)
