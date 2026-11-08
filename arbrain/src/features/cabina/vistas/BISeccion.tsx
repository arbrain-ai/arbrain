'use client'
/** Sección /bi (7 nov 2026): la vista del panel a lo ancho; la entrada del teléfono y de los enlaces directos. */
import { VistaBI } from './BI'
import e from './equipo.module.css'
import n from './negocio-seccion.module.css'

export function BISeccion() {
  return <main className={e.pagina}>
    <div className={`${e.paginaScroll} ${n.scroll}`}>
      <VistaBI grande />
    </div>
  </main>
}
