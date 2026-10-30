'use client'
import { useLayoutEffect, useRef, type RefObject } from 'react'

// ─── Mensajes fuera de la vista no cuestan layout (5 oct 2026) ───────────────
//
// MEDIDO (CPU ×4, «Planeación mensual» con 234 mensajes = 129 000 px de texto, lienzo en el panel): cada vez que el
// chat cambiaba de ancho —abrir o cerrar el panel cuando Levy muestra una vista, arrastrar su borde, el zoom de la
// app— el navegador volvía a acomodar el texto de TODA la conversación: 281 ms al abrir el panel y hasta 580 ms por
// cada cambio de ancho. LazyMessage ya ahorra el parseo de markdown, pero sus placeholders siguen ocupando layout.
//
// `content-visibility: auto` deja fuera del layout y la pintura lo que no está cerca de la pantalla. Lo delicado es
// el alto reservado: con un alto inventado, un mensaje que entra a la vista cambia de tamaño y el contenido brinca
// (WebKit, la app de escritorio, no compensa con scroll anchoring como Chrome). Por eso un mensaje solo se aplaza
// DESPUÉS de haberse pintado con su contenido final, con su alto real como reserva; `auto` hace que el navegador recuerde el alto
// más reciente cada vez que vuelve a pintarlo.

const MARCA = 'data-fuera-de-vista'

// 11 oct 2026 (medido en WebKit, zoom 1.4, «Planeación mensual»): 6 de 30 mensajes reservaban un alto falso
// (129 px para uno que mide 1734) porque se medían en el primer render, cuando el markdown (import dinámico) aún
// no llegaba o el mensaje seguía en streaming. Como quedaban lejos de la pantalla, nunca se volvían a pintar y la
// conversación cargaba ~5 200 px de altos inventados: al saltar el lector, el contenido se recolocaba por debajo.
// Ahora un mensaje se aplaza solo cuando su alto lleva ESTABLE_MS quieto y ya no está en streaming, y un
// ResizeObserver mantiene la reserva al día cada vez que el mensaje vuelve a pintarse con otro alto.
export const ESTABLE_MS = 600

/** ¿El mensaje ya tiene su alto final? Puro, para el test. */
export function listoParaAplazar(alto: number, msQuieto: number, enStreaming: boolean): boolean {
  return alto > 0 && !enStreaming && msQuieto >= ESTABLE_MS
}

interface Vigia { ro: ResizeObserver; mo: MutationObserver; raiz: HTMLElement | null; vistos: WeakSet<Element>; pendientes: Map<HTMLElement, number>; programar: () => void }

export function useFueraDeVista(contenedor: RefObject<HTMLElement | null>, cambio: unknown) {
  const vigia = useRef<Vigia | null>(null)

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined' || typeof CSS === 'undefined' || !CSS.supports('content-visibility', 'auto')) return
    const pendientes = new Map<HTMLElement, number>() // mensaje → último cambio de alto
    let t = 0
    const revisar = () => {
      t = 0
      const ahora = performance.now()
      // Primero TODAS las lecturas y luego todas las escrituras: un solo layout, no uno por mensaje.
      const listos: [HTMLElement, number][] = []
      for (const [el, desde] of pendientes) {
        if (!el.isConnected) { pendientes.delete(el); continue }
        const alto = el.offsetHeight
        if (listoParaAplazar(alto, ahora - desde, el.hasAttribute('data-msg-streaming'))) listos.push([el, alto])
      }
      for (const [el, alto] of listos) {
        pendientes.delete(el)
        el.setAttribute(MARCA, '')
        el.style.setProperty('contain-intrinsic-height', `auto ${alto}px`)
        el.style.contentVisibility = 'auto'
      }
      if (pendientes.size) programar()
    }
    const programar = () => { if (!t) t = window.setTimeout(revisar, ESTABLE_MS) }
    const ro = new ResizeObserver((entradas) => {
      const ahora = performance.now()
      for (const e of entradas) {
        const el = e.target as HTMLElement
        if (!el.hasAttribute(MARCA)) { pendientes.set(el, ahora); continue }
        // Aplazado y saltado: su alto ES la reserva, no hay nada nuevo que aprender.
        if (el.checkVisibility?.({ contentVisibilityAuto: true }) === false) continue
        const alto = el.offsetHeight
        if (alto > 0) el.style.setProperty('contain-intrinsic-height', `auto ${alto}px`)
      }
      if (pendientes.size) programar()
    })
    // Un mensaje saltado no cambia de alto aunque cambie su contenido (llega el texto completo, se agrega una
    // herramienta): el ResizeObserver no lo ve. Si su DOM cambia, deja de aplazarse y se vuelve a medir.
    const mo = new MutationObserver((cambios) => {
      for (const c of cambios) {
        const nodo = c.target.nodeType === Node.ELEMENT_NODE ? (c.target as Element) : c.target.parentElement
        const el = nodo?.closest<HTMLElement>(`[${MARCA}]`)
        if (!el) continue
        el.removeAttribute(MARCA)
        el.style.removeProperty('content-visibility')
        el.style.removeProperty('contain-intrinsic-height')
        pendientes.set(el, performance.now())
      }
      if (pendientes.size) programar()
    })
    vigia.current = { ro, mo, raiz: null, vistos: new WeakSet(), pendientes, programar }
    return () => { ro.disconnect(); mo.disconnect(); clearTimeout(t); vigia.current = null }
  }, [])

  useLayoutEffect(() => {
    const v = vigia.current
    const raiz = contenedor.current
    if (!v || !raiz) return
    if (v.raiz !== raiz) {
      v.mo.disconnect()
      v.mo.observe(raiz, { childList: true, subtree: true, characterData: true })
      v.raiz = raiz
    }
    const ahora = performance.now()
    for (const el of Array.from(raiz.querySelectorAll<HTMLElement>('[data-msg-id]'))) {
      if (v.vistos.has(el)) continue
      v.vistos.add(el)
      v.pendientes.set(el, ahora)
      v.ro.observe(el)
    }
    // Un mensaje que dejó de transmitir no cambia de alto pero ya puede aplazarse.
    if (v.pendientes.size) v.programar()
  }, [contenedor, cambio])
}

// `useRepintarAlCambiarAlto` (empujón de 1 px tras cambios de alto y scrolls por código, 11–12 oct 2026) se borró el
// 12 oct: el blanco no era content-visibility sino el scroll instantáneo por código con la página escalada, y el
// empujón era otro scroll instantáneo. La causa y su arreglo viven en lib/desplazar.ts.
