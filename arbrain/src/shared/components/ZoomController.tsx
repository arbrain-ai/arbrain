'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { factorRueda } from '@/features/cabina/panel/zoom-pestana'

/**
 * Browser-like UI zoom (Cmd/Ctrl +, Cmd/Ctrl -, Cmd/Ctrl 0 to reset).
 *
 * Scales the whole app via CSS `zoom` on <html> (works in the Tauri WKWebView too,
 * where Chrome's native zoom isn't available) and persists the level to localStorage.
 */
const KEY = 'mc-ui-zoom'
/** Cada ventana aparte del panel guarda su propio zoom (5 oct 2026): agrandar la del segundo monitor no toca la principal. */
export const claveZoomVentana = (ventana: string) => `${KEY}:${ventana}`
const MIN = 0.6
const MAX = 1.8
const STEP = 0.1

function applyZoom(z: number) {
  const root = document.documentElement
  const safeZoom = Number.isFinite(z) && z > 0 ? z : 1

  root.style.setProperty('zoom', String(safeZoom))
  root.style.setProperty('--ui-zoom', String(safeZoom))

  // Only publish the zoomed pixel height/width when there is REAL zoom. At
  // zoom=1 (always on mobile) these would resolve to window.innerHeight, which
  // in an iOS standalone PWA (viewport-fit=cover) does NOT cover the full
  // physical screen — leaving a black band below the content. Unset them so the
  // shell's height fallback lands on 100% of the fixed-inset-0 .mission-shell
  // (true fullscreen). Desktop zoom (!=1) still uses the explicit pixel values.
  if (safeZoom === 1) {
    root.style.removeProperty('--ui-zoomed-app-h')
    root.style.removeProperty('--ui-zoomed-app-w')
  } else {
    root.style.setProperty('--ui-zoomed-app-h', `${window.innerHeight / safeZoom}px`)
    root.style.setProperty('--ui-zoomed-app-w', `${window.innerWidth / safeZoom}px`)
  }

  // --app-h is owned solely by DashboardShell's visualViewport sync (one source
  // of truth). It already listens to visualViewport.resize, so it covers the
  // zoom + keyboard case without a competing write here.
  window.dispatchEvent(new Event('arbrain:ui-zoom'))
}

/** Un nivel de zoom de ⌘+/⌘−/⌘0 a partir del actual; null si la tecla no es de zoom. */
export function siguienteZoom(zoom: number, key: string): number | null {
  if (key === '=' || key === '+') return Math.min(MAX, Math.round((zoom + STEP) * 100) / 100)
  if (key === '-' || key === '_') return Math.max(MIN, Math.round((zoom - STEP) * 100) / 100)
  if (key === '0') return 1
  return null
}
export const acotarZoom = (z: number) => Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100))

/**
 * `clave`: dónde se recuerda el nivel (la principal usa `mc-ui-zoom`; cada ventana aparte, `claveZoomVentana(N)`).
 * `rueda`: ⌘+rueda y el pellizco del trackpad también acercan (ventanas aparte, 5 oct 2026, Daniel: «cuando paso
 * una pestaña al otro monitor no puedo hacer ⌘+/⌘−»). Lo que ya atendió algo de adentro (el lienzo con su cámara,
 * un documento con su zoom de pestaña) llega con `defaultPrevented` y se respeta: dentro del lienzo gana el lienzo.
 */
export function ZoomController({ clave = KEY, rueda = false }: { clave?: string; rueda?: boolean } = {}) {
  // En /draw3 el zoom CSS se NEUTRALIZA (siempre 1) sin tocar la preferencia
  // guardada. Tres razones medidas (11 ago 2026, bug cazado por Daniel):
  // (1) WebKit corta el contenido interno de un iframe bajo zoom de raíz — en una
  //     hoja HTML (conectoma) la ficha quedaba fuera de la ventana (cut 115px a
  //     zoom 1.2, medido); (2) el zoom mete offsets en las coordenadas del puntero
  //     del canvas; (3) el redondeo fraccional pinta las dos scrollbars moradas en
  //     la toolbar. Y como aquí las teclas ⌘0/=/− son de la CÁMARA del canvas, un
  //     zoom guardado desde otra sección era IRRESETEABLE en esta ruta.
  const pathname = usePathname()
  // La sección Lienzo (3 oct 2026) es la misma pizarra: mismas tres razones.
  const onCanvas = (pathname?.startsWith('/draw3') || pathname?.startsWith('/lienzo')) ?? false

  useEffect(() => {
    let stored = 1
    try { stored = Number.parseFloat(localStorage.getItem(clave) ?? '1') } catch { /* sin almacenamiento */ }
    let zoom = Number.isFinite(stored) && stored > 0 ? stored : 1
    const effective = () => (onCanvas ? 1 : zoom)
    applyZoom(effective())

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      // En el lienzo (/draw3) el zoom lo maneja la CAMARA del canvas (Cmd+0/=/-),
      // no el zoom CSS del UI. Si no, Cmd+0 reseteaba el UI en vez del canvas, y
      // Cmd+= zoomeaba el UI metiendo offsets en las coordenadas del puntero.
      if (typeof window !== 'undefined' && /^\/(draw3|lienzo)/.test(window.location.pathname)) return
      const next = siguienteZoom(zoom, e.key)
      if (next === null || e.defaultPrevented) return
      e.preventDefault()
      poner(next)
    }
    const poner = (z: number) => {
      zoom = acotarZoom(z)
      applyZoom(effective())
      try {
        localStorage.setItem(clave, String(zoom))
      } catch {
        // ignore (private mode / storage disabled)
      }
    }
    // ⌘+rueda / pellizco (Chrome lo manda como Ctrl+rueda; WebKit, como gesture*).
    const onWheel = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.defaultPrevented || onCanvas) return
      e.preventDefault()
      poner(zoom * factorRueda(e.deltaY))
    }
    let base = 1
    type Gesto = Event & { scale?: number }
    const gestoIni = (e: Event) => { if (e.defaultPrevented || onCanvas) return; e.preventDefault(); base = zoom }
    const gestoMov = (e: Event) => {
      const escala = (e as Gesto).scale
      if (e.defaultPrevented || onCanvas || typeof escala !== 'number' || !(escala > 0)) return
      e.preventDefault()
      poner(base * escala)
    }
    const onResize = () => applyZoom(effective())

    window.addEventListener('keydown', onKeyDown)
    if (rueda) {
      window.addEventListener('wheel', onWheel, { passive: false })
      window.addEventListener('gesturestart', gestoIni, { passive: false } as AddEventListenerOptions)
      window.addEventListener('gesturechange', gestoMov, { passive: false } as AddEventListenerOptions)
    }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('gesturestart', gestoIni)
      window.removeEventListener('gesturechange', gestoMov)
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [onCanvas, clave, rueda])

  return null
}
