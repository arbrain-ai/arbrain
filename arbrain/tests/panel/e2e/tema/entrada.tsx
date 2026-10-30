// Arnés de capturas (4 oct 2026): componentes REALES (ThemeProvider, VistaDocumento, AgentesTrabajando, GruposHerramientas,
// ControlesPanel/enfoque por CSS) con datos simulados por tests/panel/e2e/tema/ejecutar.mjs. Sin login ni Next.
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/shared/contexts/theme-context'
import { ThemeToggle } from '@/shared/components/ThemeToggle'
import { VistaDocumento } from '@/features/cabina/vistas/Documento'
import { AgentesTrabajando } from '@/features/cabina/panel/AgentesTrabajando'
import { GruposHerramientas } from '@/features/chat/components/ToolCallCard'
import { agruparHerramientas } from '@/features/chat/lib/rastro'
import { ControlesPanel } from '@/features/cabina/panel/Ventana'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useEffect } from 'react'
import s from '@/features/cabina/panel/panel.module.css'

const q = new URLSearchParams(location.search)
const ruta = q.get('doc') ?? '/tmp/plan.html'
const movil = q.get('movil') === '1'

function Enfoque() {
  const on = useLayoutStore(s => s.enfoquePanel)
  useEffect(() => {
    if (!on) return
    document.documentElement.dataset.enfoque = '1'
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) useLayoutStore.getState().setEnfoquePanel(false) }
    window.addEventListener('keydown', esc)
    return () => { delete document.documentElement.dataset.enfoque; window.removeEventListener('keydown', esc) }
  }, [on])
  return null
}

/** El botón de pantalla completa por pestaña se fundió en el del panel (5 oct 2026); aquí queda el mismo alternar. */
function BotonEnfoque() {
  const on = useLayoutStore(s => s.enfoquePanel)
  return <button data-testid="enfoque-pestana" aria-pressed={on} onClick={() => useLayoutStore.getState().setEnfoquePanel(!on)}>{on ? 'Volver' : 'Pantalla completa'}</button>
}

function App() {
  return <ThemeProvider>
    <Enfoque />
    <div style={{ display: 'flex', height: '100vh' }}>
      <div data-oculta-enfoque style={{ display: movil ? 'none' : undefined, width: 70, background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>barra</div>
      <main data-shell-main style={{ display: movil ? 'none' : 'flex', flex: 1, minWidth: 0, flexDirection: 'column' }}>
        <header style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderBottom: '1px solid var(--border)' }}>
          <b>Levy</b><AgentesTrabajando conversacion="c1" /><ThemeToggle compact />
        </header>
        <div style={{ padding: 16 }}>
          <GruposHerramientas grupos={agruparHerramientas({ toolCalls: [
            { toolId: 'a', toolName: 'mcp__cabina__delegar', status: 'done' },
            { toolId: 'b', toolName: 'mcp__cabina__delegar', status: 'running' },
            { toolId: 'c', toolName: 'Bash', status: 'done' },
          ] })} />
          <textarea id="borrador" defaultValue="" placeholder="borrador del chat" style={{ width: '100%', marginTop: 12 }} />
        </div>
      </main>
      <aside className={s.lateral} data-panel-derecho style={{ width: movil ? '100%' : 460, maxWidth: movil ? 'none' : undefined, minWidth: movil ? 0 : undefined, borderLeft: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, padding: 8 }}><ControlesPanel modo="lateral" onCerrar={() => {}} /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '0 8px' }}><BotonEnfoque /></div>
        <div id="lienzo" style={{ height: 120, overflow: 'auto', margin: 8, border: '1px solid var(--border)' }}><div style={{ width: 2000, height: 2000, background: 'linear-gradient(135deg,#7c3aed33,#f59e0b33)' }}>Customer Journey (lienzo)</div></div>
        <div style={{ padding: 12, minWidth: 0, overflow: 'auto' }}><VistaDocumento input={{ vista: 'documento', ruta } as never} grande /></div>
      </aside>
    </div>
  </ThemeProvider>
}
createRoot(document.getElementById('raiz')!).render(<App />)
