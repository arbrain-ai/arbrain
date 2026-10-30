'use client'

/**
 * El ⚙︎ junto a la píldora del título: «Mostrar en el lienzo» (6 oct 2026). Tres interruptores —herramientas, barra
 * inferior, capítulos— que se aplican en vivo y se guardan por dispositivo. Vive dentro de la barra del título, así que
 * el popover cuelga de ella y se mueve con el riel de lienzos.
 */

import { useEffect, useRef, useState } from 'react'
import type { Theme } from '../theme/tokens'
import { useMostrarEnLienzo } from './useMostrarEnLienzo'
import type { MostrarEnLienzo as Mostrar } from '../state/mostrar-en-lienzo'

const FILAS: Array<{ clave: keyof Mostrar; titulo: string; detalle: string }> = [
  { clave: 'herramientas', titulo: 'Herramientas', detalle: 'La barra de la izquierda' },
  { clave: 'barraInferior', titulo: 'Barra inferior', detalle: 'Guardado, deshacer, zoom, descargar' },
  { clave: 'capitulos', titulo: 'Capítulos', detalle: 'Todo · 1 2 3 4' },
]

export function MostrarEnLienzo({ theme: t }: { theme: Theme }) {
  const [abierto, setAbierto] = useState(false)
  const [m, poner] = useMostrarEnLienzo()
  const ref = useRef<HTMLDivElement>(null)
  const oscuro = t.name === 'oscuro'

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false) } }
    window.addEventListener('pointerdown', fuera)
    window.addEventListener('keydown', esc, true)
    return () => { window.removeEventListener('pointerdown', fuera); window.removeEventListener('keydown', esc, true) }
  }, [abierto])

  // Sin `position: relative`: el popover se ancla a la barra del título entera, no al ⚙︎, para no salirse por la derecha.
  return (
    <div ref={ref} style={{ display: 'flex', flexShrink: 0 }}>
      <button type="button" data-mostrar-lienzo aria-label="Mostrar en el lienzo" aria-haspopup="dialog" aria-expanded={abierto}
        title="Mostrar en el lienzo" onClick={() => setAbierto(v => !v)}
        style={{
          width: 26, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
          background: abierto ? t.roles.sticky.fill : 'transparent', color: t.text.caption, opacity: abierto ? 1 : .7,
        }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {abierto && (
        <div role="dialog" aria-label="Mostrar en el lienzo" data-mostrar-lienzo-popover style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 'min(270px, calc(100vw - 28px))', padding: 6, zIndex: 70,
          borderRadius: 12, background: t.roles.card.fill, border: `1px solid ${t.roles.card.stroke.color}`,
          boxShadow: oscuro ? '0 14px 40px rgba(0,0,0,.6)' : '0 14px 40px rgba(15,15,25,.16)',
          font: '600 12.5px CanvasSans, system-ui', color: t.text.body,
        }}>
          <div style={{ padding: '6px 8px 8px', font: '700 11px CanvasSans, system-ui', letterSpacing: .4, textTransform: 'uppercase', color: t.text.caption }}>
            Mostrar en el lienzo
          </div>
          {FILAS.map(f => (
            <button key={f.clave} type="button" role="switch" aria-checked={m[f.clave]} data-mostrar={f.clave}
              onClick={() => poner({ [f.clave]: !m[f.clave] })}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 8, border: 'none',
                background: 'transparent', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit',
              }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: t.text.title }}>{f.titulo}</span>
                <span style={{ display: 'block', font: '500 11px CanvasSans, system-ui', color: t.text.caption }}>{f.detalle}</span>
              </span>
              <span aria-hidden style={{
                position: 'relative', flexShrink: 0, width: 34, height: 20, borderRadius: 10,
                background: m[f.clave] ? t.accent : (oscuro ? 'rgba(255,255,255,.18)' : 'rgba(15,15,25,.16)'), transition: 'background 140ms',
              }}>
                <span style={{ position: 'absolute', top: 2, left: m[f.clave] ? 16 : 2, width: 16, height: 16, borderRadius: 8, background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left 140ms' }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
