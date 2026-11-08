'use client'
/** Sección /negocio (5 nov 2026): la misma vista de la pestaña del panel, a lo ancho. Es la entrada del teléfono y de
 *  los enlaces directos a «Tu negocio › El sistema» (antes el destino caía en /segundo-cerebro, que lleva a Memoria). */
import { VistaNegocio } from './Negocio'
import e from './equipo.module.css'
import n from './negocio-seccion.module.css'

export function NegocioSeccion() {
  return <main className={e.pagina}>
    <div className={`${e.paginaScroll} ${n.scroll}`}>
      <VistaNegocio grande />
    </div>
  </main>
}
