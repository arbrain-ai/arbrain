'use client'

/**
 * Mi marca (lib/mi-marca.ts): aplica en la ventana el nombre y el logo de `mi-marca/` del dueño. Los colores no pasan
 * por aquí: `tema.css` lo enlaza el layout como hoja de estilos. Next reescribe el título y los iconos al navegar, así
 * que un observador del <head> los vuelve a poner. Sin `mi-marca/`, no hace nada.
 */
import { useEffect } from 'react'
import { tituloConMarca } from '@/lib/mi-marca-titulo'

export function MiMarca() {
  useEffect(() => {
    let vivo = true
    let observador: MutationObserver | null = null
    fetch('/api/mi-marca', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { nombre: string | null; logo: string | null } | null) => {
        if (!vivo || !m || (!m.nombre && !m.logo)) return
        const aplicar = () => {
          const t = tituloConMarca(document.title, m.nombre)
          if (t !== document.title) document.title = t
          if (m.logo) {
            for (const l of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]')) {
              if (l.getAttribute('href') !== m.logo) l.setAttribute('href', m.logo)
            }
          }
        }
        aplicar()
        observador = new MutationObserver(aplicar)
        observador.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href'] })
      })
      .catch(() => { /* sin marca propia: la de Arbrain */ })
    return () => { vivo = false; observador?.disconnect() }
  }, [])
  return null
}
