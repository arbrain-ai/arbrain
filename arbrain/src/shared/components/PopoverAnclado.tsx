'use client'
import { useCallback, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type Ref, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CORTE_HOJA, aCss, colocarPopover, vistaCompleta, type Colocacion, type OpcionesColocar, type Vista } from '@/shared/lib/popover-anclado'
import css from './popover-anclado.module.css'

// La primitiva de los popovers de la barra de escribir (1 nov 2026, Daniel: «asegúrate de que ambos sean bien
// responsivos»). Portal a <body> con `position: fixed`, así ningún contenedor con overflow lo recorta; se mide contra
// lo VISIBLE (visualViewport: teclado virtual y pellizco incluidos) y en px CSS del propio popover, con el zoom de la
// app (⌘+/⌘−) ya descontado. Se recoloca con la ventana, el scroll, el teclado, el zoom, el ancla y su contenido.
// Geometría: shared/lib/popover-anclado.ts. Causa del corte anterior: docs/builds/popovers-composer-2026-11-01/.

/** Zoom efectivo del elemento: lo que multiplica a sus px CSS para llegar a px de pantalla. */
export function zoomDe(el: Element | null): number {
  const actual = (el as (Element & { currentCSSZoom?: number }) | null)?.currentCSSZoom
  if (typeof actual === 'number' && Number.isFinite(actual) && actual > 0) return actual
  // Motores sin currentCSSZoom: el zoom de la raíz, que es el único que pone la app.
  const raiz = typeof document === 'undefined' ? 1 : Number.parseFloat(getComputedStyle(document.documentElement).zoom)
  return Number.isFinite(raiz) && raiz > 0 ? raiz : 1
}

/** La vista en px CSS del popover: bloque de `position: fixed` y la parte que de verdad se ve. */
export function vistaDe(zoom: number): Vista {
  const z = zoom > 0 ? zoom : 1
  const base = vistaCompleta(window.innerWidth / z, window.innerHeight / z)
  const vv = window.visualViewport
  if (!vv) return base
  return { ...base, visible: aCss({ top: vv.offsetTop, left: vv.offsetLeft, bottom: vv.offsetTop + vv.height, right: vv.offsetLeft + vv.width }, z) }
}

/** Alto sin recorte (px CSS): el del panel más lo que esconden sus zonas con scroll (el panel o `[data-popover-scroll]`). */
function altoNatural(panel: HTMLElement): number {
  let alto = panel.offsetHeight
  for (const el of [panel, ...panel.querySelectorAll<HTMLElement>('[data-popover-scroll]')]) alto += Math.max(0, el.scrollHeight - el.clientHeight)
  return alto
}

const px = (n: number | undefined) => (n == null ? 'auto' : `${n}px`)

function estilo(c: Colocacion): Record<'left' | 'right' | 'top' | 'bottom' | 'width' | 'maxHeight', string> {
  return c.modo === 'hoja'
    ? { left: '0px', right: '0px', width: 'auto', top: 'auto', bottom: px(c.bottom), maxHeight: px(c.maxHeight) }
    : { left: px(c.left), right: 'auto', width: px(c.width), top: px(c.top), bottom: px(c.bottom), maxHeight: px(c.maxHeight) }
}

type Modo = Colocacion['modo']
type Opciones = Omit<OpcionesColocar, 'altoNatural'>

/**
 * Coloca `panel` junto a `ancla` y lo mantiene dentro de lo visible. Escribe la posición directo en el estilo (antes
 * de pintar y sin re-render por cada scroll); solo el modo (hoja o flotante) vive en estado, porque cambia lo que se
 * pinta (velo y asa).
 */
export function usePopoverAnclado(ancla: RefObject<HTMLElement | null> | undefined, panel: RefObject<HTMLElement | null>, op: Opciones): Modo {
  const { ancho, altoMax, hojaEnMovil = true, alinear = 'inicio' } = op
  const [modo, setModo] = useState<Modo>(() => {
    if (typeof window === 'undefined' || !hojaEnMovil) return 'flotante'
    const { visible } = vistaDe(zoomDe(document.documentElement))
    return visible.right - visible.left < CORTE_HOJA ? 'hoja' : 'flotante'
  })

  const colocar = useCallback(() => {
    const el = panel.current
    if (!el) return
    const zoom = zoomDe(el)
    const r = ancla?.current?.getBoundingClientRect()
    const caja = r && (r.width || r.height) ? aCss(r, zoom) : null
    const c = colocarPopover(caja, vistaDe(zoom), { ancho, altoMax, hojaEnMovil, alinear, altoNatural: altoNatural(el) })
    const s = estilo(c)
    for (const k of Object.keys(s) as (keyof typeof s)[]) if (el.style[k] !== s[k]) el.style[k] = s[k]
    el.dataset.modo = c.modo
    if (c.modo === 'flotante') el.dataset.lado = c.lado
    else delete el.dataset.lado
    setModo((m) => (m === c.modo ? m : c.modo))
  }, [ancla, panel, ancho, altoMax, hojaEnMovil, alinear])

  useLayoutEffect(() => {
    colocar()
    let cuadro = 0
    // Una sola medición por cuadro aunque lleguen scroll, resize y mutaciones juntos.
    const pedir = () => { if (!cuadro) cuadro = requestAnimationFrame(() => { cuadro = 0; colocar() }) }
    pedir() // El ancla puede montarse en el mismo commit: su ref llega después.
    const vv = window.visualViewport
    window.addEventListener('resize', pedir)
    window.addEventListener('scroll', pedir, { capture: true, passive: true })
    window.addEventListener('arbrain:ui-zoom', pedir)
    vv?.addEventListener('resize', pedir)
    vv?.addEventListener('scroll', pedir)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(pedir)
    if (ancla?.current) ro?.observe(ancla.current)
    if (panel.current) ro?.observe(panel.current)
    // El contenido que llega después (límites, catálogo) puede cambiar el lado que le cabe.
    const mo = typeof MutationObserver === 'undefined' || !panel.current ? null : new MutationObserver(pedir)
    if (panel.current) mo?.observe(panel.current, { childList: true, subtree: true, characterData: true })
    return () => {
      window.removeEventListener('resize', pedir)
      window.removeEventListener('scroll', pedir, { capture: true })
      window.removeEventListener('arbrain:ui-zoom', pedir)
      vv?.removeEventListener('resize', pedir)
      vv?.removeEventListener('scroll', pedir)
      ro?.disconnect()
      mo?.disconnect()
      cancelAnimationFrame(cuadro)
    }
  }, [colocar, ancla, panel])

  return modo
}

interface Props extends Opciones, Omit<HTMLAttributes<HTMLDivElement>, 'style'> {
  /** Lo que lo abre: el popover se pega a su borde. Sin ancla medible, abajo a la izquierda. */
  ancla?: RefObject<HTMLElement | null>
  /** Ref del panel (para «clic fuera» y foco). */
  panelRef?: Ref<HTMLDivElement>
  children: ReactNode
}

/** Popover de la barra de escribir: portal, colocación, velo y asa en teléfono. El aspecto lo pone `className`. */
export function PopoverAnclado({ ancla, panelRef, ancho, altoMax, hojaEnMovil = true, alinear, className, children, ...resto }: Props) {
  const panel = useRef<HTMLDivElement | null>(null)
  const modo = usePopoverAnclado(ancla, panel, { ancho, altoMax, hojaEnMovil, alinear })
  const unir = useCallback((el: HTMLDivElement | null) => {
    panel.current = el
    if (typeof panelRef === 'function') panelRef(el)
    else if (panelRef) (panelRef as { current: HTMLDivElement | null }).current = el
  }, [panelRef])
  if (typeof document === 'undefined') return null
  return createPortal(
    <>
      {modo === 'hoja' && <div className={css.velo} aria-hidden data-popover-velo />}
      <div ref={unir} data-popover-composer data-modo={modo} className={`${css.panel}${className ? ` ${className}` : ''}`} {...resto}>
        {modo === 'hoja' && <span className={css.asa} aria-hidden />}
        {children}
      </div>
    </>,
    document.body,
  )
}
