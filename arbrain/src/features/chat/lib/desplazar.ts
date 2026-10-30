/**
 * Scroll por código que WKWebView sí pinta (12 oct 2026, causa raíz del «blanco» del lector en la app de la Mac).
 *
 * MEDIDO con el arnés WKWebView (scripts/qa/arnes-wkwebview): con la página escalada (el zoom de la app, 1.4 en la Mac
 * de Daniel; da igual si es `zoom` CSS en <html> o el zoom nativo del WKWebView), asignar `scrollTop` o llamar
 * `scrollBy/scrollTo` instantáneo sobre un contenedor `overflow:auto` deja el scroll asíncrono del proceso de UI en
 * OTRA posición que la del contenido. El texto existe (el árbol de render está bien), pero el compositor muestra una
 * zona cuyos mosaicos no se pintaron: blanco hasta el siguiente scroll de verdad. Con escala 1 no pasa (0 de 43
 * fotogramas en el caso mínimo de 200 párrafos; con 1.4, 36 de 43). `scrollIntoView` instantáneo va por otro camino
 * de WebKit y llega bien: 0 de 87 fotogramas con zoom CSS y con zoom nativo.
 *
 * Por eso aquí todo scroll por código del hilo pasa por `fijarScroll`: con la página escalada salta con un marcador
 * invisible y `scrollIntoView`; con escala 1 asigna `scrollTop` como siempre (cero cambio en el teléfono). Y el
 * desplazamiento suave es propio (`deslizarScroll`), cuadro a cuadro con el mismo salto seguro, en vez del
 * `behavior:'smooth'` del navegador: se cancela en cuanto Daniel toca la rueda y nunca deja mosaicos sin pintar.
 */

const MARCA = 'data-marca-scroll'

/** Escala del `zoom` CSS de <html> (ZoomController). 1 en el teléfono y en la web sin zoom. */
export function escalaDePagina(): number {
  if (typeof document === 'undefined') return 1
  const z = parseFloat(document.documentElement.style.zoom || '1')
  return Number.isFinite(z) && z > 0 ? z : 1
}

/**
 * Píxeles de `getBoundingClientRect` por píxel de `scrollTop` en este contenedor. MEDIDO en WKWebView con zoom 1.4:
 * bajar el scroll 300 movió el rect 420. Sin convertir, el lector se pasaba ×1.4 cada vez que seguía el párrafo. Se mide
 * (alto en pantalla / alto de layout) en vez de suponerlo: cada motor implementa el zoom CSS a su manera.
 */
export function escalaRect(el: HTMLElement): number {
  const layout = el.offsetHeight
  const pantalla = el.getBoundingClientRect().height
  return razonEscala(pantalla, layout)
}
/** Puro, para el test: la razón, o 1 si no se puede medir. */
export function razonEscala(pantalla: number, layout: number): number {
  return layout > 0 && pantalla > 0 ? pantalla / layout : 1
}

/** Destino válido de scroll: dentro de [0, máximo]. Puro, para el test. */
export function acotarScroll(top: number, scrollHeight: number, clientHeight: number): number {
  return Math.max(0, Math.min(Math.max(0, scrollHeight - clientHeight), Math.round(top)))
}

/** ¿Hace falta el salto por marcador? Solo con la página escalada y un contenedor posicionado (el marcador absoluto
 *  se mide desde él y se mueve con su contenido). Puro, para el test. */
export function usarMarcador(escala: number, posicion: string): boolean {
  return Math.abs(escala - 1) > 0.001 && posicion !== 'static'
}

/** Lleva `el.scrollTop` a `top`, al instante, sin desincronizar el compositor de WKWebView. */
export function fijarScroll(el: HTMLElement, top: number) {
  limpiarMarcadores(el) // un marcador viejo infla el scrollHeight aunque no haya nada que mover
  const destino = acotarScroll(top, el.scrollHeight, el.clientHeight)
  if (Math.abs(el.scrollTop - destino) < 0.5) return
  if (typeof el.scrollIntoView !== 'function' || !usarMarcador(escalaDePagina(), getComputedStyle(el).position)) {
    el.scrollTop = destino
    return
  }
  // El marcador vive SOLO durante el salto (13 oct 2026). Dejado en el hilo es una trampa: es `position:absolute` con
  // `top` fijo, o sea desborde de scroll. Al cambiar a una conversación corta (el mismo contenedor se reutiliza) el
  // marcador viejo seguía en su `top` y mantenía el scrollHeight de la conversación larga: el hilo quedaba scrolleado a
  // 8 000 px de un contenido de 4 mensajes, en blanco, con scrollTop == scrollHeight - clientHeight (medido en el
  // arnés WKWebView a zoom 1.8: mensajes en -15 349…-12 329 px, scrollHeight 8 976). Cada fijarScroll lo movía y no lo
  // soltaba.
  const m = document.createElement('div')
  m.setAttribute(MARCA, '')
  m.setAttribute('aria-hidden', 'true')
  m.style.cssText = `position:absolute;left:0;top:${destino}px;width:1px;height:1px;margin:0;padding:0;border:0;pointer-events:none;visibility:hidden;`
  el.appendChild(m)
  try {
    m.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' as ScrollBehavior })
  } finally {
    m.remove()
  }
}

/** Quita los marcadores de salto que hayan quedado en el contenedor (restos de versiones anteriores o de un error). */
export function limpiarMarcadores(el: HTMLElement): number {
  const viejos = el.querySelectorAll(`:scope > [${MARCA}]`)
  viejos.forEach((n) => n.remove())
  return viejos.length
}

/** Curva del desplazamiento suave (sale rápido, llega despacio). Pura, para el test. */
export function curvaDeslizar(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return 1 - Math.pow(1 - x, 3)
}

const enCurso = new WeakMap<HTMLElement, () => void>()

/**
 * Desplazamiento suave propio hasta `top`. Se cancela solo si Daniel mueve el hilo (rueda, toque, tecla o clic):
 * su mano manda. Un desplazamiento nuevo sobre el mismo contenedor reemplaza al anterior.
 */
export function deslizarScroll(el: HTMLElement, top: number, ms = 280, alTerminar?: () => void) {
  enCurso.get(el)?.()
  const desde = el.scrollTop
  const hasta = acotarScroll(top, el.scrollHeight, el.clientHeight)
  if (Math.abs(hasta - desde) < 1) return alTerminar?.()
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce || typeof requestAnimationFrame !== 'function') { fijarScroll(el, hasta); return alTerminar?.() }
  const t0 = performance.now()
  let raf = 0
  const entradas = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
  const parar = () => {
    cancelAnimationFrame(raf)
    for (const ev of entradas) el.removeEventListener(ev, parar)
    if (enCurso.get(el) === parar) enCurso.delete(el)
  }
  for (const ev of entradas) el.addEventListener(ev, parar, { passive: true })
  enCurso.set(el, parar)
  const paso = () => {
    const t = (performance.now() - t0) / ms
    fijarScroll(el, desde + (hasta - desde) * curvaDeslizar(t))
    if (t < 1) raf = requestAnimationFrame(paso)
    else { parar(); alTerminar?.() }
  }
  raf = requestAnimationFrame(paso)
}

/**
 * Anclaje del párrafo que se lee (12 oct 2026). WebKit no tiene `overflow-anchor`: si lo de arriba cambia de alto (los
 * mensajes diferidos de LazyMessage se materializan, llega el markdown, carga una imagen), el párrafo se va de la
 * pantalla. Medido con el arnés: al dar play desde el pie de un mensaje largo la vista terminaba en otros mensajes, y en
 * pausa el párrafo quedaba encima de la barra.
 *
 * Mide la posición del elemento EN EL CONTENIDO (top en pantalla + scrollTop): un scroll no la cambia, solo un cambio de
 * alto de lo de arriba. Un ResizeObserver avisa después del layout y antes de pintar, y ahí se compensa: no se ve el
 * brinco. Lo suelta la mano de Daniel (rueda, toque, tecla, clic) o la función que devuelve.
 */
export function anclarElemento(scroller: HTMLElement, el: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {}
  const k = escalaRect(scroller)
  const enContenido = () => el.getBoundingClientRect().top / k + scroller.scrollTop
  const pos0 = enContenido()
  const entradas = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) return soltar()
    const d = enContenido() - pos0
    if (Math.abs(d) > 0.5) fijarScroll(scroller, scroller.scrollTop + d)
  })
  function soltar() {
    ro.disconnect()
    for (const ev of entradas) scroller.removeEventListener(ev, soltar)
  }
  for (const ev of entradas) scroller.addEventListener(ev, soltar, { passive: true })
  // Lo que puede cambiar de alto: cada mensaje del hilo y el contenido entero (separadores, cargadores).
  for (const c of Array.from(scroller.children)) ro.observe(c)
  for (const m of Array.from(scroller.querySelectorAll('[data-msg-id]'))) ro.observe(m)
  return soltar
}
