'use client'
/** Sección /masterclass (7 oct 2026): la misma vista de la pestaña del panel, a lo ancho. Un solo componente. */
import { SeccionCabecera } from '@/shared/components/SeccionCabecera'
import { VistaMasterclass } from './Masterclass'
import e from './equipo.module.css'

export function MasterclassSeccion() {
  return <main className={e.pagina}>
    <div className={e.paginaScroll}>
      <SeccionCabecera ceja={<>Lanzamiento · <b>masterclass</b></>} titulo="La masterclass del sábado 17"
        descripcion="Lo que falta para estar listos, bloque por bloque, desde su fuente única." />
      <VistaMasterclass grande />
    </div>
  </main>
}
