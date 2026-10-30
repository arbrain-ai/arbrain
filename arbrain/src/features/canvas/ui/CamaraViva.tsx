'use client'

/**
 * Canvas v4 — la cámara viva (5 oct 2026).
 *
 * MEDIDO en «Customer Journey · Cerebro Artificial» (532 elementos, lienzo de 4096 px): cada cuadro de paneo o de
 * zoom hacía `setCamera` y React volvía a pintar la Pizarra entera con todos sus hijos —el minimapa con 532
 * rectángulos SVG, la barra de estado, la barra contextual— más el recálculo de estilos que eso arrastra. Con la CPU
 * a ×4 (la vara para un WebView más lento que Chrome) eran ~11 ms de React por cuadro: el gesto no cabía en 16 ms.
 *
 * La cámara del GESTO vive aquí, fuera de React: un valor, sus suscriptores y nada más. Quien la necesita cada
 * cuadro se suscribe (el lienzo, los overlays que siguen al contenido). React recibe la cámara ASENTADA: el primer
 * cambio entra al instante (encuadrar, abrir una página, un salto del minimapa siguen siendo un render normal) y
 * durante un gesto continuo solo el último, cuando la mano se detiene.
 */

import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Camera } from '../model/element'

export interface CamaraViva {
  /** La cámara de AHORA. Siempre al día, también entre dos renders de React. */
  readonly ref: { current: Camera }
  fijar: (c: Camera | ((prev: Camera) => Camera)) => void
  suscribir: (fn: () => void) => () => void
  /** ¿Hay una RÁFAGA en curso (dos o más cambios seguidos)? Mientras tanto el lienzo puede pintar más barato.
   *  Un salto suelto no cuenta: encuadrar o abrir una página se pinta nítido desde el primer cuadro. */
  enGesto: () => boolean
}

/** Sin cambios durante este tiempo, el gesto terminó. Lo bastante corto para que soltar se sienta inmediato. */
export const ASENTAR_MS = 140

export function crearCamaraViva(inicial: Camera, asentar: (c: Camera) => void, asentarMs = ASENTAR_MS): CamaraViva {
  const ref = { current: inicial }
  const subs = new Set<() => void>()
  let ultimo = -Infinity
  let rafaga = false
  let reloj: ReturnType<typeof setTimeout> | null = null
  const ahora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const avisar = () => { for (const fn of subs) fn() }
  const cerrar = () => {
    reloj = null
    asentar(ref.current)
    // Un aviso más al asentar: el lienzo vuelve a pintar a resolución completa.
    avisar()
  }
  return {
    ref,
    fijar(c) {
      const prev = ref.current
      const next = typeof c === 'function' ? c(prev) : c
      if (next === prev || (next.x === prev.x && next.y === prev.y && next.zoom === prev.zoom)) return
      ref.current = next
      const t = ahora()
      const enRafaga = t - ultimo < asentarMs
      rafaga = enRafaga
      ultimo = t
      if (reloj) clearTimeout(reloj)
      if (!enRafaga) asentar(next)   // un cambio suelto entra a React de inmediato
      reloj = setTimeout(cerrar, asentarMs)
      avisar()
    },
    suscribir(fn) { subs.add(fn); return () => { subs.delete(fn) } },
    enGesto: () => rafaga && ahora() - ultimo < asentarMs,
  }
}

/** `[cámara asentada para React, cámara viva]`. */
export function useCamaraViva(inicial: Camera): [Camera, CamaraViva] {
  const [asentada, setAsentada] = useState(inicial)
  const viva = useRef<CamaraViva | null>(null)
  if (!viva.current) viva.current = crearCamaraViva(inicial, setAsentada)
  return [asentada, viva.current]
}

/** La cámara viva dentro de un componente: se vuelve a pintar SOLO ese componente en cada cuadro. */
export function useCamara(viva: CamaraViva): Camera {
  return useSyncExternalStore(viva.suscribir, () => viva.ref.current, () => viva.ref.current)
}

/** Para un trozo de JSX que sigue al contenido (overlays, barra contextual) sin arrastrar a la Pizarra entera. */
export function ConCamara({ viva, children }: { viva: CamaraViva; children: (c: Camera) => ReactNode }) {
  return <>{children(useCamara(viva))}</>
}

const nada = () => () => {}

/** Solo el ZOOM vivo: quien lo usa no se vuelve a pintar al panear, solo al acercar o alejar. */
export function useZoomVivo(viva: CamaraViva | undefined, asentado: number): number {
  return useSyncExternalStore(viva ? viva.suscribir : nada, () => viva ? viva.ref.current.zoom : asentado, () => asentado)
}
