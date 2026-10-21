import type { ReactNode } from 'react'

/** Encabezado único de las secciones (página v2): ceja · titular serif · descripción ·
 *  acciones. Es la misma gramática que los titulares de las vistas de la Cabina, para
 *  que ir de la vista en el chat a su sección completa se sienta continuo. */
export function SeccionCabecera({ ceja, titulo, descripcion, acciones, meta, as: Tag = 'h1' }: {
  ceja?: ReactNode
  titulo: ReactNode
  descripcion?: ReactNode
  acciones?: ReactNode
  meta?: ReactNode
  as?: 'h1' | 'h2'
}) {
  return (
    <header className="pg-cabecera">
      <div>
        {ceja && <p className="pg-ceja">{ceja}</p>}
        {titulo != null && <Tag className="pg-titulo">{titulo}</Tag>}
        {descripcion && <p className="pg-desc">{descripcion}</p>}
      </div>
      {(acciones || meta) && <div className="pg-acciones">{meta && <span className="pg-meta">{meta}</span>}{acciones}</div>}
    </header>
  )
}
