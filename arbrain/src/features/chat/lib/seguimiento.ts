/**
 * ¿Quién lleva el scroll mientras suena el lector? (4 nov 2026, Daniel: «hago scroll pero por alguna razón me regresa
 * arriba y se siente interminable»). Puro, para el test.
 *
 * MEDIDO en el arnés WKWebView (docs/builds/bug-scroll-2026-11-04): con el lector en pausa Daniel bajó con la rueda,
 * tocó Ctrl+Espacio y el hilo saltó 1 742 px hacia arriba, al párrafo que sonaba. Reanudar contaba como «gesto al
 * lector» y le devolvía el scroll (25 oct); además, en cuanto la voz llegaba sola a un párrafo que se veía, el lector
 * volvía a perseguir los siguientes. La telemetría del 4 nov trae decenas de «reanudar» por hora: Daniel pausa con
 * Ctrl+Espacio, lee adelante y reanuda, y cada vez el hilo lo regresaba.
 *
 * Regla: si la mano movió el hilo, NADA lo mueve hasta que él mismo regrese con la mano al párrafo que suena o navegue
 * el lector (tocar un párrafo, anterior, siguiente). Play no cuenta: la voz sigue donde iba y la pantalla se queda donde
 * él la dejó. Sin botón «Seguir» (5 nov 2026): aparecía bajo el dedo y en iPhone se tragaba el toque.
 */
export type Decision = 'quieto' | 'anclar' | 'mover'

export class Seguimiento {
  private suelto = false
  /** La mano de Daniel movió el hilo (rueda, dedo, tecla, clic). */
  mano() { this.suelto = true }
  /** Tocar un párrafo, anterior/siguiente o una lectura nueva. */
  retomar() { this.suelto = false }
  /** Play / Ctrl+Espacio: la voz sigue, pero el scroll sigue siendo de quien lo tenía. */
  reanudar() {}
  /** Terminó el gesto de la mano; `aLaVista` = el párrafo que suena quedó dentro de la zona visible: él volvió. */
  manoTermino(aLaVista: boolean) { if (aLaVista) this.suelto = false }
  get lleva() { return !this.suelto }
  /** Qué hacer con el párrafo que toca: dejar el hilo quieto, anclarlo donde se ve o llevarlo a la vista. */
  decidir(aLaVista: boolean): Decision {
    if (this.suelto) return 'quieto'
    return aLaVista ? 'anclar' : 'mover'
  }
}

/** Sin ruedas durante este tiempo, el gesto de la mano (con la inercia del trackpad) terminó. */
export const FIN_GESTO_MS = 350

/** Teclas que desplazan el hilo cuando el foco está dentro de él. Espacio y ← → son del lector (no desplazan). */
export const TECLAS_DE_SCROLL: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'])
