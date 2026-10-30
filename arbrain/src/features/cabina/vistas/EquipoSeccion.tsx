'use client'
/** Sección /equipo (5 oct 2026): la misma vista de la pestaña del panel, a lo ancho. Un solo componente. */
import { SeccionCabecera } from '@/shared/components/SeccionCabecera'
import { VistaEquipo } from './Equipo'
import e from './equipo.module.css'

export function EquipoSeccion() {
  return <main className={e.pagina}>
    <div className={e.paginaScroll}>
      <SeccionCabecera ceja={<>Tu negocio · <b>equipo</b></>} titulo="Quién lleva qué"
        descripcion="El organigrama vivo: qué le llega a cada uno, de qué se encarga y cuándo se movió por última vez." />
      <VistaEquipo grande />
    </div>
  </main>
}
