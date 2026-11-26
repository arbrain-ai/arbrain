'use client'
/**
 * Tu negocio en una sola pantalla (17 nov 2026). Daniel: «no debería haber scroll, debería ser estático vertical, todas las
 * secciones». El panel vive dentro del cuerpo de su pestaña, que hace scroll y es de todas las secciones (no se toca): aquí
 * El pulso mide cuánto alto le queda en ese cuerpo y lo toma entero (`--alto-pulso`), para repartirlo sin desbordar.
 *
 * Solo con ventana de escritorio (desde ANCHO_MIN de ancho y ALTO_MIN de alto disponibles: la ventana de Daniel y hasta
 * 1440×820). En el panel lateral de 520 px o en el teléfono no cabe todo legible: ahí vuelve el scroll, como siempre.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

export const ANCHO_MIN = 1180
export const ALTO_MIN = 640

const haceScroll = (el: Element) => { const o = getComputedStyle(el).overflowY; return o === 'auto' || o === 'scroll' }

/** El alto que le queda a `el` dentro de su contenedor con scroll (sin el relleno de abajo de los que lo envuelven). */
export function altoDisponible(el: HTMLElement): { alto: number; ancho: number } | null {
  let s: HTMLElement | null = el.parentElement
  let relleno = 0
  while (s && s !== document.body && !haceScroll(s)) { relleno += parseFloat(getComputedStyle(s).paddingBottom) || 0; s = s.parentElement }
  const caja = s && s !== document.body ? s.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
  const r = el.getBoundingClientRect()
  // Con el zoom de la pestaña, la caja medida viene escalada: se vuelve a unidades CSS del panel.
  const escala = el.offsetWidth ? r.width / el.offsetWidth : 1
  const top = r.top + (s && s !== document.body ? s.scrollTop : window.scrollY)
  // El relleno viene en unidades CSS y la caja en px de pantalla (con el zoom de interfaz de Daniel, 1.2, sobraban 2 px):
  // se resta en las mismas unidades, y un px de aire por el redondeo del zoom.
  const alto = (caja.bottom - top - 1) / (escala || 1) - relleno - 1
  return { alto: Math.floor(alto), ancho: Math.floor(el.offsetWidth) }
}

/** `ancho`: el de El pulso (decide la composición: la portada desde ANCHO_MIN); `una`: además cabe en el alto que queda. */
export function useUnaPantalla(ref: RefObject<HTMLElement | null>, activo = true): { una: boolean; alto: number | null; ancho: number } {
  const [estado, setEstado] = useState<{ una: boolean; alto: number | null; ancho: number }>({ una: false, alto: null, ancho: 0 })
  const ajuste = useRef(0)
  useLayoutEffect(() => {
    const inicial = ref.current
    if (!inicial || !activo) { setEstado({ una: false, alto: null, ancho: 0 }); return }
    // El nodo raíz cambia cuando cambia la composición (tarjetas ↔ portada); su contenedor no: se mide siempre el actual.
    const padre = inicial.parentElement
    const medirYa = () => {
      const el = ref.current
      if (!el || !el.isConnected) return
      const m = altoDisponible(el)
      // Con zoom de interfaz (1.1, 1.3) el redondeo deja unos px de sobra en el cuerpo con scroll: lo que sobre se le
      // descuenta al alto, una vez y con tope (nunca crece por esto).
      let sc: HTMLElement | null = el.parentElement
      while (sc && sc !== document.body && !haceScroll(sc)) sc = sc.parentElement
      if (sc && sc !== document.body && el.style.getPropertyValue('--alto-pulso')) {
        const sobra = sc.scrollHeight - sc.clientHeight
        if (sobra > 0 && sobra < 40) ajuste.current = Math.min(40, ajuste.current + sobra)
      }
      const alto = m ? m.alto - ajuste.current : 0
      const una = !!m && m.ancho >= ANCHO_MIN && alto >= ALTO_MIN
      const sig = { una, alto: una ? alto : null, ancho: m?.ancho ?? 0 }
      setEstado(prev => (prev.una === sig.una && prev.alto === sig.alto && prev.ancho === sig.ancho ? prev : sig))
    }
    let marco = 0
    const medir = () => { cancelAnimationFrame(marco); marco = requestAnimationFrame(medirYa) }
    // Otra ventana u otro zoom: el ajuste se vuelve a buscar desde cero.
    const otraVentana = () => { ajuste.current = 0; medir() }
    // La primera, antes de pintar: sin un cuadro de la composición equivocada.
    medirYa()
    const ro = new ResizeObserver(medir)
    let s: HTMLElement | null = padre
    while (s && s !== document.body && !haceScroll(s)) s = s.parentElement
    if (s && s !== document.body) ro.observe(s)
    if (padre) ro.observe(padre)
    window.addEventListener('resize', otraVentana)
    window.addEventListener('arbrain:ui-zoom', otraVentana)
    return () => { cancelAnimationFrame(marco); ro.disconnect(); window.removeEventListener('resize', otraVentana); window.removeEventListener('arbrain:ui-zoom', otraVentana) }
  }, [ref, activo])
  return estado
}
