/**
 * EL RESALTADO DEL LECTOR ES UN SOLO ELEMENTO (29 oct 2026). Daniel: «a veces se queda rastro».
 *
 * Antes era la CSS Highlight API (`::highlight(chat-word)`): clear()+add() de un rango por palabra. WebKit no siempre
 * invalida la zona del rango que se quita (el mismo bug que ya documentaba el lector en iOS) y el ámbar viejo se quedaba
 * pintado sobre palabras que ya pasaron hasta el siguiente repintado. Ahora hay UNA caja (`[data-lector-resaltado]`)
 * que se MUEVE a la palabra que suena: moverla obliga al compositor a repintar de dónde sale y a dónde llega, y al cerrar
 * se quita del documento. No puede haber dos: antes de crearla se barre cualquier otra.
 *
 * La caja es opaca (el ámbar al 65 % sobre el fondo real del texto, el mismo tono de antes) y lleva la palabra en tinta
 * oscura con la tipografía calculada del texto, encima del original: se ve igual que el resaltado de siempre.
 *
 * Vive dentro del contenedor que scrollea (el hilo del chat), así acompaña al scroll sin código; cada fotograma se vuelve
 * a medir por si el texto se movió (un mensaje que crece arriba, el composer, el zoom de la app). Sin contenedor
 * posicionado, va `fixed` sobre la página.
 */
import { escalaDePagina, razonEscala } from './desplazar'

export const ATRIBUTO_RESALTADO = 'data-lector-resaltado'
// Los mismos tokens (y respaldos) que tenía ::highlight(chat-word).
const TINTA = 'var(--l-gris-3, #1a1208)'
const AMBAR = 'rgb(var(--l-ambar-4-rgb, 255, 145, 1))'

/** Rango DOM de los caracteres `[desde, hasta)` de `el.textContent`. */
export function rangoDe(el: HTMLElement, desde: number, hasta: number): Range | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let off = 0
  let inicio = false
  let node: Node | null
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length || 0
    if (!inicio && off + len > desde) {
      range.setStart(node, desde - off)
      inicio = true
    }
    if (inicio && off + len >= hasta) {
      range.setEnd(node, Math.min(hasta - off, len))
      return range
    }
    off += len
  }
  return null
}

/** Dónde poner la caja dentro del contenedor posicionado `host`, en px de layout. Pura, para el test. */
export function geometriaEnHost(
  r: { left: number; top: number; width: number; height: number },
  host: { left: number; top: number; escala: number; scrollLeft: number; scrollTop: number; clientLeft: number; clientTop: number },
) {
  const s = host.escala > 0 ? host.escala : 1
  return {
    x: (r.left - host.left) / s - host.clientLeft + host.scrollLeft,
    y: (r.top - host.top) / s - host.clientTop + host.scrollTop,
    w: r.width / s,
    h: r.height / s,
  }
}

/** Contenedor que scrollea al texto y puede alojar la caja: el hilo del chat, o el primer ancestro con scroll y posición. */
function anfitrion(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p)
    if (cs.position === 'static') continue
    if (p.hasAttribute('data-arbrain-scroll') || /(auto|scroll)/.test(cs.overflowY)) return p
  }
  return null
}

/** Primer fondo no transparente detrás de `el` (para dar a la caja el mismo tono que el ámbar translúcido de antes). */
function fondoDe(el: HTMLElement): string {
  for (let p: HTMLElement | null = el; p; p = p.parentElement) {
    const c = getComputedStyle(p).backgroundColor
    if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)) return c
  }
  return 'Canvas' // color de fondo del sistema: ningún ancestro pinta fondo
}

// Cuadros sin cambio tras los que la caja deja de medirse cada cuadro (pausa, una lectura restaurada que espera horas).
const CUADROS_A_REPOSO = 30
const SONDEO_REPOSO_MS = 250

export class ResaltadoUnico {
  private caja: HTMLDivElement | null = null
  private objetivo: { el: HTMLElement; desde: number; hasta: number; host: HTMLElement | null } | null = null
  private raf = 0
  private huella = ''
  private palabra = ''
  private quietos = 0
  private sondeo: ReturnType<typeof setTimeout> | null = null
  private observador: ResizeObserver | null = null
  private observado: HTMLElement | null = null

  /** La palabra `[desde, hasta)` de `el` (offsets de su textContent) queda resaltada, y la caja la sigue. */
  pintar(el: HTMLElement, desde: number, hasta: number) {
    if (hasta <= desde) return
    const host = this.objetivo?.el === el && el.isConnected ? this.objetivo.host : anfitrion(el)
    this.objetivo = { el, desde, hasta, host }
    this.colocar()
    this.observar(el, host)
    this.despertar()
  }

  /** Quita la caja del documento (y cualquier otra que hubiera quedado). */
  limpiar() {
    this.objetivo = null
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    if (this.sondeo) clearTimeout(this.sondeo)
    this.sondeo = null
    this.observador?.disconnect()
    this.observado = null
    if (typeof document !== 'undefined') document.removeEventListener('scroll', this.despertar, true)
    this.caja?.remove()
    this.caja = null
    this.huella = ''
    this.palabra = ''
    if (typeof document !== 'undefined') document.querySelectorAll(`[${ATRIBUTO_RESALTADO}]`).forEach((n) => n.remove())
  }

  /** Lo que la caja cubre ahora (para el arnés y las pruebas). */
  actual() {
    const o = this.objetivo
    return o && this.caja?.isConnected && this.caja.style.display !== 'none' ? { el: o.el, desde: o.desde, hasta: o.hasta } : null
  }

  /** Vuelve a medir cada cuadro (una palabra nueva, el texto cambió de alto, un scroll). */
  private despertar = () => {
    this.quietos = 0
    if (this.sondeo) clearTimeout(this.sondeo)
    this.sondeo = null
    if (!this.raf && this.objetivo) this.raf = requestAnimationFrame(this.seguir)
  }

  private seguir = () => {
    this.raf = 0
    if (!this.objetivo) return
    this.quietos = this.colocar() ? 0 : this.quietos + 1
    if (this.quietos < CUADROS_A_REPOSO) {
      this.raf = requestAnimationFrame(this.seguir)
      return
    }
    // En reposo no se gasta un cuadro tras otro: un cambio de alto lo avisa el ResizeObserver y un scroll su evento; el
    // sondeo lento cubre lo demás.
    const mira = () => {
      this.sondeo = null
      if (!this.objetivo) return
      if (this.colocar()) this.despertar()
      else this.sondeo = setTimeout(mira, SONDEO_REPOSO_MS)
    }
    this.sondeo = setTimeout(mira, SONDEO_REPOSO_MS)
  }

  /** Avisos de que la palabra pudo moverse sin que cambie de palabra: el párrafo o lo que hay en el hilo cambió de alto. */
  private observar(el: HTMLElement, host: HTMLElement | null) {
    if (this.observado === el) return
    this.observado = el
    document.addEventListener('scroll', this.despertar, { capture: true, passive: true })
    if (typeof ResizeObserver === 'undefined') return
    this.observador?.disconnect()
    this.observador = new ResizeObserver(() => this.despertar())
    this.observador.observe(el)
    for (const hijo of Array.from(host?.children ?? [])) if (hijo !== this.caja) this.observador.observe(hijo)
  }

  /** Pone la caja sobre la palabra. `true` si algo cambió (posición, tamaño o visibilidad). */
  private colocar(): boolean {
    const o = this.objetivo
    if (!o) return false
    const rango = o.el.isConnected ? rangoDe(o.el, o.desde, o.hasta) : null
    const rect = rango ? Array.from(rango.getClientRects()).find((r) => r.width > 0 && r.height > 0) : undefined
    const caja = this.asegurarCaja()
    if (!rango || !rect) {
      const cambio = caja.style.display !== 'none'
      if (cambio) caja.style.display = 'none'
      this.huella = ''
      return cambio
    }
    const host = o.host?.isConnected ? o.host : (o.host = anfitrion(o.el))
    const destino = host ?? document.body
    if (caja.parentNode !== destino) destino.appendChild(caja)
    let g: { x: number; y: number; w: number; h: number }
    if (host) {
      const hr = host.getBoundingClientRect()
      g = geometriaEnHost(rect, {
        left: hr.left, top: hr.top, escala: razonEscala(hr.height, host.offsetHeight),
        scrollLeft: host.scrollLeft, scrollTop: host.scrollTop, clientLeft: host.clientLeft, clientTop: host.clientTop,
      })
    } else {
      const s = escalaDePagina()
      g = { x: rect.left / s, y: rect.top / s, w: rect.width / s, h: rect.height / s }
    }
    const texto = (o.el.textContent || '').slice(o.desde, o.hasta)
    if (texto !== this.palabra) {
      this.palabra = texto
      caja.textContent = texto
      const fuente = (rango.startContainer.parentElement ?? o.el) as HTMLElement
      const cs = getComputedStyle(fuente)
      caja.style.fontFamily = cs.fontFamily
      caja.style.fontSize = cs.fontSize
      caja.style.fontWeight = cs.fontWeight
      caja.style.fontStyle = cs.fontStyle
      caja.style.letterSpacing = cs.letterSpacing
      caja.style.fontFeatureSettings = cs.fontFeatureSettings
      caja.style.textTransform = cs.textTransform
      caja.style.background = `color-mix(in srgb, ${AMBAR} 65%, ${fondoDe(fuente)})`
    }
    const huella = `${g.x.toFixed(2)}|${g.y.toFixed(2)}|${g.w.toFixed(2)}|${g.h.toFixed(2)}|${host ? 'a' : 'f'}|${texto}`
    if (huella === this.huella) return false
    this.huella = huella
    caja.style.position = host ? 'absolute' : 'fixed'
    caja.style.transform = `translate(${g.x}px, ${g.y}px)`
    caja.style.width = `${g.w}px`
    caja.style.height = `${g.h}px`
    caja.style.lineHeight = `${g.h}px`
    caja.style.display = 'block'
    return true
  }

  private asegurarCaja(): HTMLDivElement {
    if (this.caja) return this.caja
    document.querySelectorAll(`[${ATRIBUTO_RESALTADO}]`).forEach((n) => n.remove())
    const c = document.createElement('div')
    c.setAttribute(ATRIBUTO_RESALTADO, '')
    c.setAttribute('aria-hidden', 'true')
    c.style.cssText =
      `position:absolute;left:0;top:0;margin:0;padding:0;border:0;box-sizing:border-box;z-index:1;pointer-events:none;` +
      `user-select:none;-webkit-user-select:none;white-space:pre;overflow:hidden;border-radius:2px;color:${TINTA};` +
      `background:${AMBAR};display:none;will-change:transform;contain:layout paint;`
    this.caja = c
    return c
  }
}
