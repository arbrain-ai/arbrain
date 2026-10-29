// Arnés de «Pantalla completa» del visor HTML (28 oct 2026; 29 oct tras fallar en el iPhone real). VistaDocumento REAL con un
// deck real dentro de los MISMOS contenedores del panel en el teléfono (PanelDerecho › PestanaTelefono › VistaFijada:
// `.pestanaTelefono > .cuerpo > .fijadaCuerpo`, este último con `container-type`, que fue la causa), bajo la cabecera, la
// fila de pestañas y una burbuja fija del chat. Las reglas globales de pantalla completa las inyecta ejecutar.mjs desde
// globals.css real.
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/shared/contexts/theme-context'
import { VistaDocumento } from '@/features/cabina/vistas/Documento'
import s from '@/features/cabina/panel/panel.module.css'

function App() {
  return <ThemeProvider>
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', paddingTop: 'env(safe-area-inset-top)' }}>
        <header data-cabecera style={{ position: 'relative', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 48, borderBottom: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 600, fontSize: 17 }}>Arbrain</header>
        <nav style={{ display: 'flex', gap: 18, padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 15, color: 'var(--muted)', background: 'var(--surface)' }}><span>Calendario</span><b style={{ color: 'var(--foreground)' }}>Grupal mié 28</b><span>Taller</span></nav>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          <div className={s.pestanaTelefono} data-pestana-telefono>
            <div className={s.cuerpo} data-vista role="tabpanel">
              <div className={s.fijadaCuerpo} style={{ translate: '0 0' }}><VistaDocumento input={{ vista: 'documento', ruta: '/deck/index.html' } as never} grande /></div>
            </div>
          </div>
        </div>
      </div>
      <button data-burbuja-chat aria-label="Chat" style={{ position: 'fixed', top: 14, right: 14, zIndex: 9999, width: 46, height: 46, borderRadius: 999, background: '#222', color: '#fff', border: 0 }}>💬</button>
    </div>
  </ThemeProvider>
}
createRoot(document.getElementById('raiz')!).render(<App />)
