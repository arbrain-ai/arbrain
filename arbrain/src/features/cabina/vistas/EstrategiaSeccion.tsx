'use client'
/** Sección /estrategia (8 nov 2026): la vista del panel a lo ancho; la entrada del teléfono y de los enlaces directos. */
import { VistaEstrategia } from './Estrategia'
import e from './equipo.module.css'
import n from './negocio-seccion.module.css'

export function EstrategiaSeccion() {
  return <main className={e.pagina}>
    <div className={`${e.paginaScroll} ${n.scroll}`}>
      <VistaEstrategia grande />
    </div>
  </main>
}
