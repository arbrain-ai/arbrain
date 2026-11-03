/**
 * Clic o arrastre en el árbol de lienzos (1 nov 2026, Daniel: «resuelve esto no puedo abrir lienzos a mano»).
 *
 * Las filas del árbol (`ArbolLienzos`) son `draggable`: se arrastran a una carpeta. WebKit, el motor de la app de la Mac,
 * arranca el arrastre HTML5 en cuanto el puntero se corre unos 3 px con el botón abajo, y desde ese momento ya no hay `click`.
 * Un clic de trackpad corre el dedo 3 o 4 px con facilidad: la fila tomaba el foco, salía `dragstart` y el lienzo nunca se
 * abría (medido con clics nativos en un WKWebView: con 0 px abre, con 4 px no; el Halo pulsa por accesibilidad y sí abría).
 *
 * Aquí se decide, sin DOM: un arrastre que no se alejó más de `UMBRAL_PX` y no se soltó en ningún destino es un clic. Un clic
 * sin arrastre lo atiende el `onClick` de siempre (aquí no cuenta, para no abrir dos veces).
 */

/** Hasta aquí (px de pantalla) un arrastre todavía es un clic con el dedo corrido. Un arrastre a una carpeta va mucho más lejos. */
export const UMBRAL_PX = 8

export interface Punto { x: number; y: number }

const distancia = (a: Punto, b: Punto) => Math.hypot(b.x - a.x, b.y - a.y)

/** Un punto que sirve para medir. Hay motores que mandan (0, 0) en `dragend`: ese no se cree. */
export const puntoValido = (p: Punto | null | undefined): p is Punto =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && !(p.x === 0 && p.y === 0)

/** El gesto de UNA fila, de bajar el botón a soltarlo. `K` identifica la fila (un lienzo o una carpeta). */
export class ClicOArrastre<K = string> {
  private gesto: { clave: K; desde: Punto; lejos: number; arrastro: boolean } | null = null

  /** El botón principal bajó sobre la fila `clave`. */
  bajar(clave: K, p: Punto) { this.gesto = { clave, desde: p, lejos: 0, arrastro: false } }

  /** Salió `dragstart` de la fila `clave` (de otra, el gesto ya no es de este clic). */
  arrastrar(clave: K) {
    if (this.gesto && this.gesto.clave === clave) this.gesto.arrastro = true
    else this.gesto = null
  }

  /** El arrastre pasó por `p` (un `dragover` en cualquier parte): se guarda lo más lejos que llegó. */
  pasar(p: Punto) {
    const g = this.gesto
    if (g && puntoValido(p)) g.lejos = Math.max(g.lejos, distancia(g.desde, p))
  }

  /** ¿Hay un arrastre en curso que empezó en esta fila? */
  arrastrando() { return !!this.gesto?.arrastro }

  /**
   * Terminó el gesto (`pointerup` o `dragend`, el que llegue primero; el otro ya no encuentra gesto). Devuelve la fila que hay
   * que abrir si fue un clic que el arrastre se tragó; null si fue un clic normal (ya lo abrió `onClick`), un arrastre de
   * verdad o algo que se soltó en un destino.
   */
  terminar(p: Punto | null, soltado: boolean): K | null {
    const g = this.gesto
    this.gesto = null
    if (!g || !g.arrastro || soltado) return null
    const lejos = puntoValido(p) ? Math.max(g.lejos, distancia(g.desde, p)) : g.lejos
    return lejos < UMBRAL_PX ? g.clave : null
  }
}
