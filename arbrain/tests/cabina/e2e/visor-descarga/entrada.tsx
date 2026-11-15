// Arnés de «Descargar» del visor (12 nov 2026). La Cabina REAL con un archivo como ruta, en sus dos casas:
//   ?modo=hilo    la vista en el hilo (CabinaProvider › CabinaDelMensaje › VistaViva), como la pinta ChatPanel (teléfono).
//   ?modo=panel   la pestaña del panel (VistaFijada de PanelDerecho), grande (escritorio).
// &ruta=… el archivo; &escritorio=1 simula Tauri (el opener queda registrado en window.__ABIERTOS__).
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/shared/contexts/theme-context'
import { CabinaDelMensaje, CabinaProvider } from '@/features/cabina/Cabina'
import { VistaFijada } from '@/features/cabina/panel/PanelDerecho'
import type { ChatMessage } from '@/features/chat/hooks/useChat'

const q = new URLSearchParams(location.search)
const modo = q.get('modo') ?? 'hilo'
const ruta = q.get('ruta') ?? ''
if (q.get('escritorio') === '1') {
  const w = window as unknown as Record<string, unknown>
  w.__ESCRITORIO__ = true
  w.__ABIERTOS__ = []
  w.__TAURI_INTERNALS__ = { invoke: async (cmd: string, args: unknown) => { (w.__ABIERTOS__ as unknown[]).push({ cmd, args }); return null }, transformCallback: () => 0 }
}
const input = { vista: 'documento' as const, ruta }

const MENSAJES: ChatMessage[] = [
  { id: 'u1', role: 'user', content: 'Ábreme el video de la clase.', timestamp: new Date(Date.now() - 60_000) },
  {
    id: 'a1', role: 'assistant', timestamp: new Date(Date.now() - 50_000), content: 'Ahí está. Con «Descargar» te lo bajas al teléfono.',
    toolCalls: [{ toolId: 'toolu_doc', toolName: 'mcp__cabina__mostrar', status: 'done' }] as ChatMessage['toolCalls'],
    toolInputs: { toolu_doc: JSON.stringify(input) },
  },
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
    <VistaFijada f={{ id: 'doc-descarga', input, en: 1 }} />
  </div>
}

createRoot(document.getElementById('raiz')!).render(<ThemeProvider>{modo === 'panel' ? <Panel /> : <Hilo />}</ThemeProvider>)
