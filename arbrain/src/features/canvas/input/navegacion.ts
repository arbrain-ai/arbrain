/**
 * Canvas v4 — moverse por el lienzo: rueda, trackpad, pasos de zoom y la cámara animada.
 *
 * Pedido de Daniel (5 oct 2026): *"presionar la rueda del mouse o cmd clic no saca la manita… ¿Cmd +/- ya hace
 * zoom? dame la mejor UX"*. La vara es Figma/tldraw/Excalidraw:
 *
 *   · ratón: rueda = paneo vertical, ⇧+rueda = horizontal, ⌘+rueda = zoom a escalones suaves
 *   · trackpad: dos dedos = paneo directo, pellizco = zoom continuo
 *   · teclado: ⌘+ / ⌘− (o + / − sueltos) a escalones redondos, ⌘0 al 100%, ⌘1 / ⇧1 todo, ⌘2 / ⇧2 la selección, todo animado
 *
 * Aquí vive lo PURO (se prueba sin navegador) y el animador, que solo necesita `requestAnimationFrame`.
 */

import type { Camera } from '../model/element'
import { MIN_ZOOM, MAX_ZOOM } from '../model/element'
import { zoomAt, type Viewport } from '../render/viewport'

// ── ratón o trackpad ─────────────────────────────────────────────────────────

/** Lo que hace falta de un WheelEvent. `wheelDeltaY` es el campo heredado de WebKit/Blink (no estándar). */
export interface Rueda {
  deltaX: number
  deltaY: number
  deltaMode: number
  wheelDeltaY?: number
  ctrlKey?: boolean
}

export type Aparato = 'raton' | 'trackpad'

/**
 * ¿Rueda de ratón o trackpad? El navegador no lo dice; se deduce de huellas, de la más fiable a la menos.
 *
 * Lo que manda es el COSTO de equivocarse, que no es simétrico: un trackpad leído como ratón vuelve el pellizco
 * una cadena de escalones de 15% a 60 eventos por segundo (inusable); un ratón leído como trackpad solo pierde el
 * suavizado. Así que «ratón» exige evidencia y la duda cae del lado del trackpad.
 *
 *   1. `deltaMode` en líneas o páginas: solo una rueda con muescas (Firefox).
 *   2. ⌘/Ctrl con deltas chicos: es el pellizco (el navegador lo manda como Ctrl+rueda aunque nadie pulse Ctrl).
 *   3. Movimiento horizontal sin Shift: dedos.
 *   4. `wheelDeltaY` en múltiplos de 120 (la muesca clásica: Chrome ±100 / WebKit ±40 de delta): ratón. No sirve la
 *      relación `wheelDeltaY = −3·deltaY` que circula por ahí: WebKit (la app de escritorio) la cumple también
 *      con el ratón.
 *   5. Sin esa huella, un delta entero grande es muesca; lo demás, dedos.
 */
export function clasificarRueda(e: Rueda): Aparato {
  if (e.deltaMode !== 0) return 'raton'
  if (e.ctrlKey && Math.abs(e.deltaY) < 25) return 'trackpad'
  if (e.deltaX !== 0) return 'trackpad'
  if (typeof e.wheelDeltaY === 'number' && e.wheelDeltaY !== 0) {
    return e.wheelDeltaY % 120 === 0 && Math.abs(e.deltaY) >= 4 ? 'raton' : 'trackpad'
  }
  return Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50 ? 'raton' : 'trackpad'
}

/**
 * La clasificación se PEGA durante una ráfaga. La inercia del trackpad y la aceleración del ratón producen eventos
 * sueltos que, solos, se leen al revés; decidir evento por evento hace que el paneo tartamudee entre animado y
 * directo. El aparato se decide con el primero de la ráfaga y se sostiene mientras sigan llegando.
 */
export class DetectorRueda {
  private ultimo: { aparato: Aparato; at: number } | null = null
  constructor(private pausaMs = 220) {}
  aparato(e: Rueda, ahora: number): Aparato {
    const fresco = clasificarRueda(e)
    if (this.ultimo && ahora - this.ultimo.at < this.pausaMs) {
      // Un ratón no produce horizontal sin Shift: si aparece, la ráfaga era de trackpad.
      if (this.ultimo.aparato === 'raton' && e.deltaX !== 0 && !e.ctrlKey && fresco === 'trackpad') {
        this.ultimo = { aparato: 'trackpad', at: ahora }
      } else {
        this.ultimo.at = ahora
      }
      return this.ultimo.aparato
    }
    this.ultimo = { aparato: fresco, at: ahora }
    return fresco
  }
}

/** Deltas en px CSS, sea cual sea la unidad que reporte el navegador. */
export function deltasEnPx(e: Rueda & { shiftKey?: boolean }, alturaPagina: number): { dx: number; dy: number } {
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? alturaPagina : 1
  let dx = e.deltaX * k, dy = e.deltaY * k
  // ⇧+rueda = horizontal. macOS ya lo convierte; Windows y Linux mandan el delta en Y con Shift.
  if (e.shiftKey && dx === 0) { dx = dy; dy = 0 }
  return { dx, dy }
}

/** Factor de zoom para una ráfaga de rueda: el pellizco es continuo; la muesca, un escalón de ~15%. */
export function factorDeRueda(dy: number, aparato: Aparato): number {
  if (aparato === 'trackpad') {
    const d = Math.max(-30, Math.min(30, dy))
    return Math.exp(-d * 0.01)
  }
  if (dy === 0) return 1
  // Al menos una muesca por evento (Safari reporta la muesca como ±4), a lo más cuatro (una rueda libre girada fuerte).
  const muescas = Math.sign(dy) * Math.min(4, Math.max(1, Math.abs(dy) / 100))
  return Math.pow(1.15, -muescas)
}

// ── escalones de zoom ────────────────────────────────────────────────────────

/** Los niveles por los que pasa ⌘+ / ⌘−. Redondos para que el porcentaje se lea y se pueda volver a él. */
export const NIVELES_ZOOM = [0.02, 0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 20]

/**
 * El siguiente escalón. Desde un zoom cualquiera (43% tras encuadrar) sube al primer nivel redondo por encima,
 * no a 43% × 1.2: así ⌘+ siempre aterriza en números que se reconocen.
 */
export function siguienteNivel(zoom: number, dir: 1 | -1): number {
  const eps = 1e-3
  if (dir > 0) {
    for (const n of NIVELES_ZOOM) if (n > zoom * (1 + eps)) return n
    return MAX_ZOOM
  }
  for (let i = NIVELES_ZOOM.length - 1; i >= 0; i--) if (NIVELES_ZOOM[i] < zoom * (1 - eps)) return NIVELES_ZOOM[i]
  return MIN_ZOOM
}

// ── la cámara entre dos puntos ───────────────────────────────────────────────

/**
 * La cámara a una fracción `t` del camino de `a` a `b`.
 *
 * Interpolar x, y y zoom por separado hace que el contenido se deslice de lado mientras crece: el ojo pierde lo
 * que miraba. Aquí el zoom avanza geométricamente alrededor del ÚNICO punto de pantalla que no se mueve entre
 * las dos cámaras, así que acercarse se ve como acercarse, no como un barrido. Sin cambio de zoom es un paneo
 * recto.
 */
export function camaraEntre(a: Camera, b: Camera, t: number): Camera {
  if (t <= 0) return a
  if (t >= 1) return b
  const r = Math.log(b.zoom / a.zoom)
  if (!Number.isFinite(r) || Math.abs(r) < 1e-4) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, zoom: a.zoom + (b.zoom - a.zoom) * t }
  }
  const zoom = a.zoom * Math.exp(r * t)
  const inv = 1 / a.zoom - 1 / b.zoom
  // k = desplazamiento, en px de pantalla desde el centro, del punto fijo; W = el punto de mundo bajo él.
  const kx = (b.x - a.x) / inv, ky = (b.y - a.y) / inv
  const wx = a.x + kx / a.zoom, wy = a.y + ky / a.zoom
  return { x: wx - kx / zoom, y: wy - ky / zoom, zoom }
}

export const suave = (t: number) => 1 - Math.pow(1 - t, 3)
export const suaveDoble = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** Zoom anclado, a un zoom ABSOLUTO (no un factor): lo que piden ⌘0 y los escalones. */
export function zoomA(c: Camera, vp: Viewport, punto: { x: number; y: number }, zoom: number): Camera {
  return zoomAt(c, vp, punto, zoom / c.zoom)
}

// ── el animador ──────────────────────────────────────────────────────────────

/**
 * Lleva la cámara a un destino en unos cientos de milisegundos.
 *
 * El DESTINO es lo que importa: tres pulsaciones seguidas de ⌘+ o tres muescas de rueda encadenan sobre el
 * destino pendiente, no sobre la cámara a medio camino; si no, la tercera aterriza más cerca que la primera.
 * Cualquier gesto directo (arrastrar, el trackpad) cancela: la mano manda sobre la animación.
 */
export class AnimadorCamara {
  private raf: number | null = null
  private meta: Camera | null = null

  constructor(
    private aplicar: (c: Camera) => void,
    private leer: () => Camera,
    private reloj: {
      ahora: () => number; cuadro: (f: () => void) => number; cancelar: (id: number) => void
      /** Red para cuando no hay cuadros (pestaña oculta, WKWebView estrangulado): la cámara llega igual. */
      despues?: (f: () => void, ms: number) => unknown; olvidar?: (t: unknown) => void
    } = {
      ahora: () => performance.now(),
      cuadro: f => requestAnimationFrame(f),
      cancelar: id => cancelAnimationFrame(id),
      despues: (f, ms) => setTimeout(f, ms),
      olvidar: t => clearTimeout(t as ReturnType<typeof setTimeout>),
    },
  ) {}
  private red: unknown = null

  /** A dónde va la cámara: el destino en curso o, sin animación, donde está. */
  destino(): Camera { return this.meta ?? this.leer() }
  animando(): boolean { return this.raf !== null }

  /** `trayecto` cambia el CAMINO (el vuelo entre capítulos se aleja a medio camino); sin él, `camaraEntre`. */
  ir(b: Camera, ms = 180, curva: (t: number) => number = suave, trayecto: (a: Camera, b: Camera, t: number) => Camera = camaraEntre): void {
    this.cancelar()
    const a = this.leer()
    if (ms <= 0 || reducirMovimiento() || (a.x === b.x && a.y === b.y && a.zoom === b.zoom)) {
      this.aplicar(b)
      return
    }
    this.meta = b
    const t0 = this.reloj.ahora()
    const paso = () => {
      const t = Math.min(1, (this.reloj.ahora() - t0) / ms)
      this.aplicar(t >= 1 ? b : trayecto(a, b, curva(t)))
      if (t >= 1) { this.raf = null; this.meta = null; if (this.red !== null) this.reloj.olvidar?.(this.red); this.red = null; return }
      this.raf = this.reloj.cuadro(paso)
    }
    this.raf = this.reloj.cuadro(paso)
    // Sin cuadros la animacion se quedaba a medias para siempre: el destino nunca llegaba.
    this.red = this.reloj.despues?.(() => { if (this.meta === b) { this.cancelar(); this.aplicar(b) } }, ms + 150) ?? null
  }

  cancelar(): void {
    if (this.raf !== null) this.reloj.cancelar(this.raf)
    if (this.red !== null) this.reloj.olvidar?.(this.red)
    this.raf = null
    this.red = null
    this.meta = null
  }
}

function reducirMovimiento(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// ── teclado ──────────────────────────────────────────────────────────────────

export type AccionZoom = 'acercar' | 'alejar' | 'cien' | 'todo' | 'seleccion'

/**
 * ¿Esta tecla es un atajo de cámara? Por `code` además de `key`: con Shift, `1` llega como `!` en un teclado
 * inglés y como otro símbolo en uno español, y el `+` del teclado español no es la tecla `=`.
 */
export function accionZoomDeTecla(e: {
  key: string; code?: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean
}): AccionZoom | null {
  if (e.altKey) return null
  const mod = !!(e.metaKey || e.ctrlKey)
  const code = e.code ?? ''
  const digito = /^(Digit|Numpad)([0-2])$/.exec(code)?.[2] ?? (/^[0-2]$/.test(e.key) ? e.key : null)
  if (mod) {
    if (e.key === '=' || e.key === '+' || code === 'Equal' || code === 'NumpadAdd') return 'acercar'
    if (e.key === '-' || e.key === '_' || code === 'Minus' || code === 'NumpadSubtract') return 'alejar'
    if (e.shiftKey) return null
    if (digito === '0') return 'cien'
    if (digito === '1') return 'todo'
    if (digito === '2') return 'seleccion'
    return null
  }
  // Sin modificador: la convención de Figma, + / − sueltos (y = en el teclado inglés, el + del español, el
  // numérico), ⇧0 / ⇧1 / ⇧2; y el 0 suelto que ya existía. Escribiendo texto no llegan aquí (Pizarra las deja pasar).
  if (e.key === '+' || e.key === '=' || code === 'NumpadAdd') return 'acercar'
  if (e.key === '-' || e.key === '_' || code === 'NumpadSubtract') return 'alejar'
  if (e.shiftKey && digito === '0') return 'cien'
  if (e.shiftKey && digito === '1') return 'todo'
  if (e.shiftKey && digito === '2') return 'seleccion'
  if (!e.shiftKey && e.key === '0') return 'cien'
  return null
}
