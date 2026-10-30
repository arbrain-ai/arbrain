// Arnés del menú «+» (6 oct 2026): el MenuSecciones REAL (Secciones.tsx) con las APIs simuladas por ejecutar.mjs. Sin login ni Next.
import { createRoot } from 'react-dom/client'
import { MenuSecciones } from '@/features/cabina/panel/Secciones'
import { usePanelAjustes } from '@/features/cabina/panel/panel-ajustes'

;(window as unknown as Record<string, unknown>).__ajustes = usePanelAjustes

import { usePanelFijadas } from '@/features/cabina/panel/fijadas'
import { SeccionPanel } from '@/features/configuracion/components/SeccionPanel'

;(window as unknown as Record<string, unknown>).__fijadas = usePanelFijadas
const ajustes = new URLSearchParams(location.search).get('pagina') === 'ajustes'
createRoot(document.getElementById('raiz')!).render(
  ajustes
    ? <div style={{ maxWidth: 500, padding: 12 }}><SeccionPanel /></div>
    : <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}><MenuSecciones /></div>,
)
