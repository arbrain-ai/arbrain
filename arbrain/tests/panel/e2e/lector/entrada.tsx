// Arnés del «Escuchar» de documentos (7 oct 2026): VistaDocumento y EscucharDocumento REALES dentro de una pestaña con el
// mismo marco que el panel (clase `cuerpo`, `data-fijada`), con el motor de voz real de chat-speech.ts. La API de voz del
// navegador se simula en ejecutar.mjs (un Chrome sin pantalla no tiene salida de audio); el resto no se toca.
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/shared/contexts/theme-context'
import { VistaDocumento } from '@/features/cabina/vistas/Documento'
import { EscucharDocumento } from '@/features/cabina/panel/EscucharDocumento'
import { chatSpeech } from '@/features/chat/lib/chat-speech'
import s from '@/features/cabina/panel/panel.module.css'

const ruta = new URLSearchParams(location.search).get('doc') ?? '/tmp/a.html'
;(window as unknown as { __motor: unknown }).__motor = chatSpeech
const ancho = new URLSearchParams(location.search).get('ancho')
const f = { id: 'f1', en: 0, input: { vista: 'documento', ruta } } as never

createRoot(document.getElementById('raiz')!).render(<ThemeProvider>
  <aside data-panel-derecho style={{ width: ancho ? `min(${ancho}px, 100vw)` : 'min(560px, 100vw)', height: 'calc(100vh / var(--ui-zoom, 1))', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', background: 'var(--surface)', marginLeft: 'auto' }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
      <b style={{ flex: 1, fontSize: 13 }}>Pestaña · documento</b>
    </header>
    <div className={s.cuerpo} data-vista data-fijada="f1" role="tabpanel">
      <div className={s.fijadaCuerpo}><EscucharDocumento f={f} /><VistaDocumento input={{ vista: 'documento', ruta } as never} grande /></div>
    </div>
  </aside>
</ThemeProvider>)
