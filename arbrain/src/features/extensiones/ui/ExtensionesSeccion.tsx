'use client'
/** Sección /extensiones (21 nov 2026): la misma tienda de la pestaña del panel, a lo ancho. Un solo componente. */
import { SeccionCabecera } from '@/shared/components/SeccionCabecera'
import { tr } from '@/shared/i18n'
import { Tienda } from './Tienda'
import s from './extensiones.module.css'

export function ExtensionesSeccion() {
  return <main className={s.pagina}>
    <div className={s.paginaScroll}>
      <SeccionCabecera ceja={<>{tr('Tu cerebro')} · <b>{tr('extensiones')}</b></>} titulo={tr('Extensiones')}
        descripcion={tr('Agrega a tu cerebro skills, tareas y paneles del catálogo de Arbrain. Ves qué pide cada una antes de instalarla y la quitas cuando quieras.')} />
      <Tienda grande />
    </div>
  </main>
}
