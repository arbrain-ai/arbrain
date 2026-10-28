// Arnés de capturas de «Pantalla completa» del visor HTML (28 oct 2026): VistaDocumento REAL con un deck real, dentro de un
// casco de teléfono simulado (barra superior y pestañas como /telefono), para ver que el modo tapa la app entera.
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/shared/contexts/theme-context'
import { VistaDocumento } from '@/features/cabina/vistas/Documento'

function App() {
  return <ThemeProvider>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <header style={{ position: 'relative', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 64, borderBottom: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 600, fontSize: 17 }}>Grupal mié 28</header>
      <nav style={{ display: 'flex', gap: 18, padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 15, color: 'var(--muted)' }}><span>Calendario</span><b style={{ color: 'var(--foreground)' }}>Grupal mié 28</b><span>Taller</span></nav>
      <div style={{ padding: 10, minWidth: 0, overflow: 'auto', animation: 'none', transform: 'translateZ(0)' }}><VistaDocumento input={{ vista: 'documento', ruta: '/deck/index.html' } as never} grande /></div>
    </div>
  </ThemeProvider>
}
createRoot(document.getElementById('raiz')!).render(<App />)
