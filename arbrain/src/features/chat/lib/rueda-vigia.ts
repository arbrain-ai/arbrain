/**
 * Detector de la rueda que no mueve el hilo (19 oct 2026, Daniel: «por alguna razón dejé de poder scrollear desde aquí…
 * puedes mirar?»). No se pudo reproducir: en el arnés WKWebView (zoom 1.4 y 1.7, con el panel abierto, contenido que se
 * encoge, rueda chica y grande) el hilo siempre se movió. Así que, en vez de adivinar, la app mide el momento real.
 *
 * SOLO TELEMETRÍA: escuchas pasivas que no previenen, no detienen y no escriben el scroll. Un gesto de rueda o trackpad
 * cuyo punto cae sobre el hilo (aunque otra capa lo tape) y que no movió `scrollTop` sin estar ya en el tope o el fondo
 * deja UN registro con el estado útil para la causa: geometría del hilo, la cadena de `elementFromPoint`, si alguien
 * llamó `preventDefault` o cortó la propagación, el pin al fondo, el turno en curso, diálogos abiertos, `inert`, zoom.
 * Destino: la bitácora y un log local del servidor (api/chat/hilo-error), nunca la campana. Máximo uno cada 30 s.
 */

/** Un registro cada 30 s como mucho, en el cliente y también en el servidor. */
export const ANTIRREBOTE_MS = 30_000
/** Sin eventos de rueda durante este tiempo, el gesto (con su inercia) terminó y se juzga. */
export const FIN_GESTO_MS = 300
/** Delta vertical acumulado mínimo para contar como intento de desplazar (px). */
export const DELTA_MIN = 24

export interface Gesto {
  /** Delta vertical acumulado en px (positivo = bajar). */
  deltaY: number
  /** Delta horizontal acumulado en px. */
  deltaX: number
  topInicio: number
  topFin: number
  /** scrollHeight − clientHeight del hilo al terminar. */
  max: number
  /** Eventos `scroll` del hilo durante el gesto. */
  scrolls: number
}

/** ¿El gesto pidió mover el hilo y el hilo no se movió, sin estar ya en el borde hacia el que se pidió? Puro, para el test. */
export function gestoAtascado(g: Gesto): boolean {
  if (Math.abs(g.deltaY) < DELTA_MIN || Math.abs(g.deltaY) < Math.abs(g.deltaX)) return false
  if (g.max < 1) return false // nada que desplazar: no es atasco
  if (g.scrolls > 0 || Math.abs(g.topFin - g.topInicio) >= 1) return false
  if (g.deltaY < 0 && g.topInicio <= 1) return false // ya en el tope
  if (g.deltaY > 0 && g.topInicio >= g.max - 1) return false // ya en el fondo
  return true
}

/** Antirrebote. Puro, para el test. */
export function puedeRegistrar(ultimo: number, ahora: number, ventana = ANTIRREBOTE_MS): boolean {
  return ahora - ultimo >= ventana
}

/** Delta de un WheelEvent en px (deltaMode 1 = líneas, 2 = páginas). Puro, para el test. */
export function deltaEnPx(delta: number, modo: number, pagina = 800): number {
  return modo === 1 ? delta * 16 : modo === 2 ? delta * pagina : delta
}

/** ¿(x, y) cae dentro de la caja? Puro, para el test. */
export function dentroDeCaja(x: number, y: number, r: { left: number; top: number; right: number; bottom: number }): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

/** Etiqueta corta de un elemento para el registro (sin texto del usuario: solo etiqueta, id, clases y atributos data). */
export function describir(el: Element | null): string {
  if (!el) return 'null'
  const id = el.id ? `#${el.id}` : ''
  const clase = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className.trim().split(/\s+/).slice(0, 4).join('.') : ''
  const datos = Array.from(el.attributes).filter((a) => a.name.startsWith('data-') || a.name === 'role' || a.name === 'inert' || a.name === 'aria-modal')
    .slice(0, 4).map((a) => (a.value && a.value.length < 24 ? `[${a.name}=${a.value}]` : `[${a.name}]`)).join('')
  return `${el.tagName.toLowerCase()}${id}${clase ? `.${clase.slice(0, 80)}` : ''}${datos}`
}

const esNodo = (x: unknown): x is Node => typeof Node !== 'undefined' && x instanceof Node
const esElemento = (x: unknown): x is Element => typeof Element !== 'undefined' && x instanceof Element

/** Estado del pin al fondo y del turno, lo pone ChatPanel (sus refs). */
export type EstadoChat = Record<string, string | number | boolean | null>

/** Lo que se mide del DOM en el momento del atasco. Lee layout, no escribe. */
export function medirDom(hilo: HTMLElement, x: number, y: number, objetivo: Element | null): Record<string, unknown> {
  const r = hilo.getBoundingClientRect()
  const cs = getComputedStyle(hilo)
  const cadena: string[] = []
  const bajo = document.elementFromPoint(x, y)
  for (let n: Element | null = bajo; n && cadena.length < 8; n = n.parentElement) cadena.push(n === hilo ? `${describir(n)} ← HILO` : describir(n))
  const abiertos = Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"], [role="alertdialog"]')).slice(0, 6).map(describir)
  const inerte = hilo.closest('[inert]')
  const mensajes = Array.from(hilo.querySelectorAll<HTMLElement>('[data-msg-id]'))
  return {
    scrollTop: Math.round(hilo.scrollTop), scrollHeight: hilo.scrollHeight, clientHeight: hilo.clientHeight,
    max: hilo.scrollHeight - hilo.clientHeight,
    caja: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
    punto: { x: Math.round(x), y: Math.round(y) },
    bajoElPuntero: cadena, bajoElPunteroEnHilo: !!bajo && hilo.contains(bajo),
    objetivo: describir(objetivo), objetivoEnHilo: esNodo(objetivo) && hilo.contains(objetivo),
    overflowY: cs.overflowY, pointerEvents: cs.pointerEvents, inert: inerte ? describir(inerte) : null,
    dialogos: abiertos,
    zoom: document.documentElement.style.zoom || '1',
    escalaRect: hilo.offsetHeight > 0 ? Math.round((r.height / hilo.offsetHeight) * 1000) / 1000 : null,
    ventanaScrollY: Math.round(window.scrollY),
    foco: document.hasFocus(), visible: document.visibilityState, activo: describir(document.activeElement),
    mensajes: mensajes.length, aplazados: hilo.querySelectorAll('[data-fuera-de-vista]').length,
    saltados: mensajes.filter((m) => m.checkVisibility?.({ contentVisibilityAuto: true }) === false).length,
    marcadores: hilo.querySelectorAll(':scope > [data-marca-scroll]').length,
    hiloCurado: hilo.dataset.hiloCurado ?? null,
    ancho: window.innerWidth, alto: window.innerHeight,
  }
}

let ultimoEnvio = 0
/** Solo para las pruebas: olvida el último envío. */
export function reiniciarAntirrebote() { ultimoEnvio = 0 }

/** Manda el registro (bitácora + log local del servidor). Nunca la campana. Uno cada 30 s. */
export function reportarRueda(detalle: Record<string, unknown>, sesion: string | null, ahora = Date.now()): boolean {
  if (typeof window === 'undefined' || !puedeRegistrar(ultimoEnvio, ahora)) return false
  ultimoEnvio = ahora
  try {
    void fetch('/api/chat/hilo-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'rueda', mensaje: 'la rueda no movió el hilo', sesion, detalle }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* telemetría: nunca rompe el chat */ }
  return true
}

/**
 * Instala el detector. `hilo()` devuelve el contenedor vivo (puede cambiar), `estado()` el pin al fondo y el turno.
 * Devuelve la función que lo quita. Todas las escuchas son pasivas: no cambian el comportamiento de la rueda.
 */
export function vigilarRueda(hilo: () => HTMLElement | null, estado: () => EstadoChat, sesion: () => string | null): () => void {
  if (typeof window === 'undefined') return () => {}
  interface Vivo { el: HTMLElement; topInicio: number; deltaY: number; deltaX: number; eventos: number; enBurbuja: number; prevenidos: number
    noCancelables: number; scrolls: number; x: number; y: number; objetivo: Element | null; modo: number; inicio: number }
  let g: Vivo | null = null
  let t = 0
  let contado: WheelEvent | null = null // el evento que la captura sumó al gesto
  const alScroll = () => { if (g) g.scrolls++ }
  const juzgar = () => {
    t = 0
    const v = g
    g = null
    if (!v) return
    v.el.removeEventListener('scroll', alScroll)
    try {
      const max = v.el.scrollHeight - v.el.clientHeight
      const gesto: Gesto = { deltaY: v.deltaY, deltaX: v.deltaX, topInicio: v.topInicio, topFin: v.el.scrollTop, max, scrolls: v.scrolls }
      if (!v.el.isConnected || !gestoAtascado(gesto)) return
      if (!puedeRegistrar(ultimoEnvio, Date.now())) return
      reportarRueda({
        gesto: { deltaY: Math.round(v.deltaY), deltaX: Math.round(v.deltaX), topInicio: Math.round(v.topInicio), eventos: v.eventos,
          vistosEnBurbuja: v.enBurbuja, prevenidos: v.prevenidos, noCancelables: v.noCancelables, deltaMode: v.modo, ms: Math.round(performance.now() - v.inicio) },
        // eventos > vistosEnBurbuja: alguien cortó la propagación antes de llegar a la ventana.
        chat: estado(),
        dom: medirDom(v.el, v.x, v.y, v.objetivo),
      }, sesion())
    } catch { /* telemetría: nunca rompe el chat */ }
  }
  // Captura en la ventana: corre ANTES que cualquier manejador de la página, aunque una capa tape el hilo.
  const alEmpezar = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return // zoom, no desplazamiento
    const el = hilo()
    if (!el) return
    const dentro = (esNodo(e.target) && el.contains(e.target)) || dentroDeCaja(e.clientX, e.clientY, el.getBoundingClientRect())
    if (!dentro) return
    if (!g || g.el !== el) {
      if (g) g.el.removeEventListener('scroll', alScroll)
      g = { el, topInicio: el.scrollTop, deltaY: 0, deltaX: 0, eventos: 0, enBurbuja: 0, prevenidos: 0, noCancelables: 0, scrolls: 0,
        x: e.clientX, y: e.clientY, objetivo: esElemento(e.target) ? e.target : null, modo: e.deltaMode, inicio: performance.now() }
      el.addEventListener('scroll', alScroll, { passive: true })
    }
    g.eventos++
    contado = e
    g.deltaY += deltaEnPx(e.deltaY, e.deltaMode, el.clientHeight)
    g.deltaX += deltaEnPx(e.deltaX, e.deltaMode, el.clientWidth)
    g.x = e.clientX; g.y = e.clientY
    if (!e.cancelable) g.noCancelables++
    clearTimeout(t)
    t = window.setTimeout(juzgar, FIN_GESTO_MS)
  }
  // Burbuja en la ventana: corre DESPUÉS de los manejadores de la página; ahí se ve si alguien lo previno.
  const alTerminar = (e: WheelEvent) => {
    if (!g || e !== contado) return
    contado = null
    g.enBurbuja++
    if (e.defaultPrevented) g.prevenidos++
  }
  window.addEventListener('wheel', alEmpezar, { capture: true, passive: true })
  window.addEventListener('wheel', alTerminar, { passive: true })
  return () => {
    window.removeEventListener('wheel', alEmpezar, { capture: true })
    window.removeEventListener('wheel', alTerminar)
    clearTimeout(t)
    if (g) g.el.removeEventListener('scroll', alScroll)
    g = null
    contado = null
  }
}
