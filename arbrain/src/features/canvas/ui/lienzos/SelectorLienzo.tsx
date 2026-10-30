'use client'

/**
 * El selector de lienzos del título (6 oct 2026): «para evitar estar abriendo tantos lienzos, un atajo que me permita moverme
 * entre lienzos desde el mismo lienzo». Se abre al tocar el nombre en la píldora de la cabecera o con Ctrl+L, y muestra el
 * MISMO árbol que «¿Qué lienzo?» (buscador, miniaturas, carpetas, menú ⋯), con los recientes arriba. ↑↓ recorren las filas,
 * Enter abre la marcada, Esc cierra. Elegir uno lo pone EN ESTA pizarra (misma pestaña, misma ventana): no abre otra.
 */
import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import type { Theme } from '../../theme/tokens'
import type { Carpeta, PaginaResumen } from '../../state/nube'
import { useAccionesLienzos } from '../../state/acciones-lienzos'
import { carpetaArchivada } from '../../state/vista-lienzos'
import { leerRecientes, recientesVisibles } from '../../state/recientes-lienzos'
import { ArbolLienzos } from './ArbolLienzos'
import { varsDeTema } from './vars-tema'

interface Props {
  theme: Theme
  paginas: PaginaResumen[]
  carpetas: Carpeta[]
  setPaginas: Dispatch<SetStateAction<PaginaResumen[]>>
  setCarpetas: Dispatch<SetStateAction<Carpeta[]>>
  activa: string | null
  /** Borde izquierdo en px dentro de la pizarra (la píldora se corre cuando el riel está abierto). */
  izquierda: number
  onElegir: (id: string) => void
  onCerrar: () => void
  onBorrada: (id: string) => void
}

export function SelectorLienzo(p: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const a = useAccionesLienzos({ paginas: p.paginas, carpetas: p.carpetas, setPaginas: p.setPaginas, setCarpetas: p.setCarpetas, alBorrarPagina: p.onBorrada })
  // Los recientes se fijan al abrir: el orden no se mueve mientras se mira.
  const recientes = useMemo(() => {
    const vivos = new Set(p.paginas.filter(x => !x.archivado && !carpetaArchivada(p.carpetas, x.folderId)).map(x => x.id))
    return recientesVisibles(leerRecientes(), vivos, p.activa)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      const t = e.target as Element
      // El menú ⋯ vive en un portal (fuera de esta caja) y la píldora alterna por su cuenta: ninguno cierra el selector.
      if (raiz.current?.contains(t) || t.closest?.('[role="menu"], [data-selector-lienzo]')) return
      p.onCerrar()
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="menu"]')) { e.stopPropagation(); p.onCerrar() } }
    window.addEventListener('pointerdown', fuera, true)
    window.addEventListener('keydown', tecla, true)
    return () => { window.removeEventListener('pointerdown', fuera, true); window.removeEventListener('keydown', tecla, true) }
  }, [p])

  const t = p.theme
  return <div ref={raiz} role="dialog" aria-label="Cambiar de lienzo" style={{
    position: 'absolute', left: p.izquierda, top: 62, zIndex: 60,
    width: `min(380px, calc(100% - ${p.izquierda + 14}px))`, maxHeight: 'calc(100% - 150px)', overflowY: 'auto', padding: 8,
    borderRadius: 12, background: t.roles.card.fill, border: `1px solid ${t.roles.card.stroke.color}`,
    boxShadow: t.name === 'oscuro' ? '0 14px 40px rgba(0,0,0,.6)' : '0 14px 40px rgba(15,15,25,.16)',
    transition: 'left .16s ease',
  }}>
    <ArbolLienzos variante="riel" vars={varsDeTema(t)} autoFoco teclado recientes={recientes}
      paginas={p.paginas} carpetas={p.carpetas} activa={p.activa} a={a} onAbrir={x => p.onElegir(x.id)} />
    <p style={{ margin: '8px 6px 2px', font: '500 11px CanvasSans, system-ui', color: t.text.caption }}>↑↓ recorre · Enter abre · Esc cierra · Ctrl+L</p>
  </div>
}
