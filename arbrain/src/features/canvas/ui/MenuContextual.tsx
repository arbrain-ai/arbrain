'use client'

/**
 * Canvas v4 — el menu de clic derecho.
 *
 * Lo que Daniel pidio: *"clic derecho en esos folders etc etc etc"*. Aqui es el
 * del LIENZO; el del arbol de paginas vive en su propio componente.
 *
 * Dos menus en uno, y esa es la decision: sobre un elemento ofrece lo que se le
 * puede hacer A ESO; sobre el vacio ofrece lo que se puede TRAER. Un menu unico
 * con la mitad de las entradas grises es mas largo de leer y no dice mas.
 *
 * Se voltea solo si no cabe. Un menu que sale fuera de la pantalla en el borde
 * derecho es lo mismo que no tener menu.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Theme } from '../theme/tokens'
import * as I from './icons'

export interface AccionMenu {
  id: string
  label: string
  atajo?: string
  icon?: (p: { size?: number }) => React.ReactElement
  /** Separador visual ANTES de esta entrada. */
  corte?: boolean
  peligro?: boolean
  onPick: () => void
}

interface Props {
  x: number
  y: number
  theme: Theme
  acciones: AccionMenu[]
  onClose: () => void
}

const ANCHO = 232

export function MenuContextual({ x, y, theme: t, acciones, onClose }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Se mide DESPUES de montar y antes de pintar: adivinar el alto por el numero
  // de entradas falla en cuanto una lleva atajo o el tema cambia el interlineado.
  useLayoutEffect(() => {
    const el = raiz.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: x + r.width > window.innerWidth - 8 ? Math.max(8, x - r.width) : x,
      top: y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height) : y,
    })
  }, [x, y, acciones.length])

  useEffect(() => {
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // `pointerdown` en captura: si esperara al `click`, el lienzo de abajo ya
    // habria empezado un gesto con el menu todavia en pantalla.
    window.addEventListener('pointerdown', fuera, true)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', fuera, true)
      window.removeEventListener('keydown', esc)
    }
  }, [onClose])

  return (
    <div ref={raiz} data-menu-contextual
      style={{
        position: 'fixed', left: pos.left, top: pos.top, width: ANCHO, padding: 5,
        background: t.roles.card.fill, border: `1px solid ${t.roles.card.stroke.color}`,
        borderRadius: 11, zIndex: 90,
        boxShadow: t.name === 'oscuro' ? '0 14px 40px rgba(0,0,0,.6)' : '0 14px 40px rgba(15,15,25,.16)',
        font: '600 12.5px CanvasSans, system-ui', color: t.text.body,
      }}>
      {acciones.map(a => (
        <div key={a.id}>
          {a.corte && <div style={{ height: 1, background: t.roles.card.stroke.color, opacity: .6, margin: '4px 6px' }} />}
          <button
            onClick={() => { a.onPick(); onClose() }}
            onPointerEnter={e => { e.currentTarget.style.background = a.peligro ? 'rgba(220,38,38,.10)' : theme_suave(t) }}
            onPointerLeave={e => { e.currentTarget.style.background = 'transparent' }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 9,
              padding: '7px 9px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: 'transparent', textAlign: 'left',
              color: a.peligro ? t.roles.risk.stroke.color : t.text.body,
              font: 'inherit',
            }}>
            <span style={{ width: 16, display: 'grid', placeItems: 'center', opacity: .85 }}>
              {a.icon ? a.icon({ size: 15 }) : null}
            </span>
            <span style={{ flex: 1 }}>{a.label}</span>
            {a.atajo && <span style={{ color: t.text.caption, font: '500 11px CanvasSans, system-ui' }}>{a.atajo}</span>}
          </button>
        </div>
      ))}
    </div>
  )
}

function theme_suave(t: Theme): string {
  return t.name === 'oscuro' ? 'rgba(255,255,255,.07)' : 'rgba(15,15,25,.055)'
}

export const iconos = I
