'use client'
/**
 * La pizarra completa dentro de otra superficie: la pestaña Lienzo del panel (4 oct 2026, «el panel es la
 * experiencia completa») y la ventana desprendida. Es el MISMO editor de la sección /lienzo: dibujar, editar,
 * páginas, carpetas, minimapa. Se monta cuando ya se sabe la zona (o que no hay): la pizarra solo lee su encuadre
 * inicial al abrir. Mirar no escribe.
 */
import { useEffect, useRef, useState } from 'react'
import { Pizarra } from '@/features/canvas/ui/Pizarra'
import { useTheme } from '@/shared/contexts/theme-context'
import { resolverZona, type Rect } from './zona'
import { urlLienzo } from './Lienzo'

export function PizarraEmbebida({ paginaId, zona, soloConFoco, alCambiarPagina }: {
  paginaId: string; zona?: string; soloConFoco?: boolean
  /** La pizarra cambió de lienzo por dentro (selector del título): la pestaña se actualiza sin abrir otra ni recargar. */
  alCambiarPagina?: (id: string, nombre: string | null) => void
}) {
  const { resolvedTheme } = useTheme()
  // La pizarra se reconstruye cuando LLEGA otra página de fuera (Levy muestra otra), no cuando ella misma cambió: esa ya la está
  // mostrando. `interna` recuerda a cuál cambió por dentro; la clave solo avanza si la página nueva es otra que esa.
  const interna = useRef<string | null>(null)
  const [clave, setClave] = useState(() => `${paginaId}:0`)
  const previa = useRef(paginaId)
  useEffect(() => {
    if (paginaId === previa.current) return
    previa.current = paginaId
    if (paginaId !== interna.current) setClave(c => `${paginaId}:${Number(c.split(':').pop()) + 1}`)
  }, [paginaId])
  const [encuadre, setEncuadre] = useState<Rect | null | undefined>(zona ? undefined : null)
  useEffect(() => {
    if (!zona) { setEncuadre(null); return }
    let vivo = true
    fetch(urlLienzo(paginaId), { cache: 'no-store' }).then(r => r.json())
      .then(d => { if (vivo) setEncuadre(resolverZona(d?.pagina?.elements ?? [], zona)?.rect ?? null) })
      .catch(() => { if (vivo) setEncuadre(null) })
    return () => { vivo = false }
  }, [paginaId, zona])
  return <>
    {/* Las @font-face del v4: las mismas que mide el compilador (las carga el layout de /lienzo, no el panel). */}
    <link rel="stylesheet" href="/fonts/v4/fonts.css" precedence="default" />
    {encuadre !== undefined && <Pizarra key={clave} pagina={paginaId} encuadre={encuadre} incrustada soloConFoco={soloConFoco}
      alCambiarPagina={(id, nombre) => { interna.current = id; alCambiarPagina?.(id, nombre) }}
      temaApp={resolvedTheme === 'dark' ? 'oscuro' : 'claro'} />}
  </>
}
