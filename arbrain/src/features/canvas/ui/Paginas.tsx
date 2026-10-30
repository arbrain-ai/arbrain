'use client'

/**
 * Canvas v4 — el riel de lienzos de la sección Lienzo.
 *
 * Desde el 6 oct 2026 es solo el marco (encabezado, «carpeta nueva», «lienzo nuevo», ocultar): el árbol, las filas con
 * miniatura y el menú ⋯ son los MISMOS que usa «¿Qué lienzo?» en el panel (`lienzos/ArbolLienzos`). Daniel veía «dos sistemas
 * de carpetas»; ahora hay uno y este riel lo viste con el tema del lienzo.
 *
 * Decisiones que siguen vigentes (viven en ArbolLienzos y en `state/acciones-lienzos`):
 *  · Soltar en un hueco no hace nada: sacar de una carpeta es soltar sobre «Sin carpeta» (una fila con nombre).
 *  · Renombrar es en el sitio; la carpeta se abre al arrastrarle un lienzo encima.
 *  · Subcarpetas de UN nivel (`parent_id`, como sfmap): lo que la regla no permite ni se ofrece.
 */

import type { Dispatch, SetStateAction } from 'react'
import type { Theme } from '../theme/tokens'
import type { PaginaResumen, Carpeta } from '../state/nube'
import { useAccionesLienzos } from '../state/acciones-lienzos'
import { ArbolLienzos } from './lienzos/ArbolLienzos'
import { varsDeTema } from './lienzos/vars-tema'
import * as I from './icons'

interface Props {
  theme: Theme
  paginas: PaginaResumen[]
  carpetas: Carpeta[]
  setPaginas: Dispatch<SetStateAction<PaginaResumen[]>>
  setCarpetas: Dispatch<SetStateAction<Carpeta[]>>
  activa: string | null
  abierto: boolean
  onAbrir: (v: boolean) => void
  onElegir: (id: string) => void
  onNuevaPagina: (folderId: string | null) => void
  /** Con `madre`, nace como subcarpeta suya. */
  onNuevaCarpeta: (madre?: string | null) => void
  /** Un lienzo se eliminó: la pizarra suelta el que tenga abierto. */
  onBorrada: (id: string) => void
}

/** Ancho del riel: la pizarra corre su contenido esto cuando está abierto. */
export const ANCHO_RIEL = 300

export function Paginas(p: Props) {
  const t = p.theme
  const a = useAccionesLienzos({
    paginas: p.paginas, carpetas: p.carpetas, setPaginas: p.setPaginas, setCarpetas: p.setCarpetas,
    alBorrarPagina: p.onBorrada, miniaturas: { activo: p.abierto, tema: t },
  })
  if (!p.abierto) return null

  const oscuro = t.name === 'oscuro'
  const vars = varsDeTema(t)

  return (
    <div data-paginas style={{
      position: 'absolute', left: 0, top: 0, bottom: 0, width: ANCHO_RIEL, zIndex: 30,
      display: 'flex', flexDirection: 'column',
      background: t.roles.card.fill, borderRight: `1px solid ${t.roles.card.stroke.color}`,
      boxShadow: oscuro ? '6px 0 24px rgba(0,0,0,.35)' : '6px 0 24px rgba(15,15,25,.06)',
    }}>
      {/* El boton para ABRIR no vive aqui: es el icono de carpeta de la barra del titulo, pegado al nombre del lienzo. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 10px 6px' }}>
        <strong style={{ flex: 1, font: '900 13px CanvasSlab, Georgia, serif', color: t.text.title }}>Lienzos</strong>
        <button onClick={() => p.onNuevaCarpeta(null)} title="Carpeta nueva" style={iconBtn(t)}><I.IconFolderPlus size={16} /></button>
        <button onClick={() => p.onNuevaPagina(null)} title="Lienzo nuevo" style={iconBtn(t)}><I.IconPlus size={16} /></button>
        <button onClick={() => p.onAbrir(false)} title="Ocultar" style={iconBtn(t)}><I.IconChevron size={16} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 12px' }}>
        <ArbolLienzos variante="riel" vars={vars} paginas={p.paginas} carpetas={p.carpetas} activa={p.activa} a={a}
          onAbrir={x => p.onElegir(x.id)}
          onNuevaPagina={id => p.onNuevaPagina(id)} onNuevaSubcarpeta={madre => p.onNuevaCarpeta(madre)} />
      </div>
    </div>
  )
}

const iconBtn = (t: Theme): React.CSSProperties => ({
  width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
  display: 'grid', placeItems: 'center', background: 'transparent', color: t.text.caption,
})
