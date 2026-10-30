'use client'
/** Sección /salud (5 oct 2026): la misma vista de la pestaña del panel, a lo ancho. Un solo componente. */
import { SeccionCabecera } from '@/shared/components/SeccionCabecera'
import { VistaSalud } from './Salud'
import e from './equipo.module.css'

export function SaludSeccion() {
  return <main className={e.pagina}>
    <div className={e.paginaScroll}>
      <SeccionCabecera ceja={<>Tu cuerpo · <b>salud</b></>} titulo="Cómo está tu cuerpo hoy"
        descripcion="Lo que manda tu reloj, contra tu propio normal, y qué hacer con eso." />
      <VistaSalud grande />
    </div>
  </main>
}
