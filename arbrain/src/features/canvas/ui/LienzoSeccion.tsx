'use client'

/**
 * La sección Lienzo de la barra izquierda (3 oct 2026, «Arbrain, una sola app»).
 *
 * Es la misma pizarra de siempre, pero DENTRO del armazón: la barra de secciones, las conversaciones y el
 * panel derecho siguen a la mano y se vuelve al chat con un clic. Antes «expandir» llevaba a `/canvas-lab`,
 * una ruta a pantalla completa sin salida (Daniel tuvo que cerrar la app para volver).
 *
 * La URL manda: `?p=` es la página y `?z=` la zona que Levy encuadró en el panel (la misma gramática de
 * `mostrar {zona}`). Sin página se abre la última que se usó aquí, o la más reciente; nunca el banco de
 * pruebas, que pinta un diagrama de demostración.
 */
import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Pizarra } from './Pizarra'
import { resolverZona } from '@/features/cabina/vistas/zona'
import type { CanvasElement } from '@/features/canvas/model/element'
import * as Nube from '@/features/canvas/state/nube'
import { paginaPorDefecto } from '@/features/canvas/state/pagina-por-defecto'
import { useTheme } from '@/shared/contexts/theme-context'

type Rect = { x: number; y: number; width: number; height: number }
const ULTIMA = 'arbrain.lienzo.ultima'

const leerUltima = () => { try { return localStorage.getItem(ULTIMA) } catch { return null } }
const guardarUltima = (id: string) => { try { localStorage.setItem(ULTIMA, id) } catch { /* sin almacenamiento */ } }

export function LienzoSeccion() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const p = params.get('p'), z = params.get('z')
  // Un solo tema en la pantalla: el lienzo sigue el de la app (antes, app oscura con pizarra clara y su propio botón).
  const { resolvedTheme } = useTheme()
  /** Lo que la pizarra tiene que mostrar. `encuadre` undefined = aún resolviendo la zona. */
  const [destino, setDestino] = useState<{ pagina: string; encuadre: Rect | null } | null>(null)
  const [vacio, setVacio] = useState(false)

  // Sin página en la URL: se elige una y se escribe en la URL (recargar cae en el mismo lugar).
  useEffect(() => {
    if (p) return
    let vivo = true
    Promise.all([Nube.listarPaginas(), Nube.listarCarpetas().catch(() => [] as Nube.Carpeta[])])
      .then(([ps, cs]) => {
        if (!vivo) return
        const id = paginaPorDefecto(ps, leerUltima(), cs)
        if (id) router.replace(`${pathname}?p=${encodeURIComponent(id)}`)
        else setVacio(true)
      })
      .catch(() => { if (vivo) setVacio(true) })
    return () => { vivo = false }
  }, [p, pathname, router])

  // Con página: se resuelve la zona (si la hay) ANTES de entregarla, porque la pizarra encuadra al abrir.
  useEffect(() => {
    if (!p) return
    guardarUltima(p)
    if (!z) { setDestino({ pagina: p, encuadre: null }); return }
    let vivo = true
    fetch(`/api/canvas/pages/${encodeURIComponent(p)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { pagina?: { elements?: CanvasElement[] } }) => {
        if (vivo) setDestino({ pagina: p, encuadre: resolverZona(d?.pagina?.elements ?? [], z)?.rect ?? null })
      })
      .catch(() => { if (vivo) setDestino({ pagina: p, encuadre: null }) })
    return () => { vivo = false }
  }, [p, z])

  return (
    <div className="absolute inset-0 overflow-hidden" data-seccion="lienzo">
      {destino
        ? <Pizarra pagina={destino.pagina} encuadre={destino.encuadre} temaApp={resolvedTheme === 'dark' ? 'oscuro' : 'claro'} />
        : vacio
          ? <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <p>Aún no hay lienzos. Pídele uno a Levy o empieza uno en blanco.</p>
              <button className="btn-secondary" onClick={() => void Nube.crearPagina('Lienzo nuevo').then(pg => router.replace(`${pathname}?p=${encodeURIComponent(pg.id)}`)).catch(() => {})}>Lienzo nuevo</button>
            </div>
          : null}
    </div>
  )
}
