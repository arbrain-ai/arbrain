/**
 * Canvas v4 — que hace un pointerdown con la herramienta de seleccion (decision pura, sin DOM ni React).
 *
 * Convencion Miro / Figma / tldraw: con una seleccion MULTIPLE, apretar sobre cualquiera de sus elementos (o dentro de
 * su recuadro) arrastra la seleccion ENTERA y no la toca hasta soltar. Reducirla en el pointerdown era la causa del
 * 6 oct 2026: con 182 elementos seleccionados, apretar un hijo dejaba solo ese y solo ese se movia.
 */

export interface EntradaPuntero {
  /** Elemento agarrable bajo el puntero (los marcos solo por titulo o borde), o null. */
  hit: string | null
  hitSeleccionado: boolean
  /** Cuantos elementos hay seleccionados. */
  cantidad: number
  /** El puntero cae dentro del recuadro de la seleccion multiple. */
  dentroDelRecuadro: boolean
  /** Algun elemento de la seleccion para dirigir el arrastre cuando no hay hit. */
  ancla: string | null
  shift: boolean
  meta: boolean
}

/** Que pasa si se suelta SIN haber superado el umbral. */
export type AlSoltarQuieto = { tipo: 'nada' } | { tipo: 'reducir'; id: string } | { tipo: 'deseleccionar' }

export type DecisionPuntero =
  /** Arrastra la seleccion actual; no se toca hasta pointerup. */
  | { tipo: 'arrastrar-seleccion'; objetivo: string; alSoltarQuieto: AlSoltarQuieto }
  /** Shift: suma o quita ese elemento (y arrastra). */
  | { tipo: 'alternar'; id: string }
  /** Selecciona ese elemento (reemplazando) y arrastra. */
  | { tipo: 'seleccionar'; id: string }
  /** Vacio: deselecciona y arranca la marquesina. */
  | { tipo: 'vacio' }

export function decidirPuntero(e: EntradaPuntero): DecisionPuntero {
  const multiple = e.cantidad > 1
  if (e.hit) {
    if (e.shift) return { tipo: 'alternar', id: e.hit }
    if (multiple && e.hitSeleccionado && !e.meta) {
      return { tipo: 'arrastrar-seleccion', objetivo: e.hit, alSoltarQuieto: { tipo: 'reducir', id: e.hit } }
    }
    return { tipo: 'seleccionar', id: e.hit }
  }
  // Dentro del recuadro pero sobre aire (p. ej. el cuerpo de un marco de fondo): arrastra igual, y un clic quieto
  // sigue deseleccionando como antes.
  if (multiple && e.dentroDelRecuadro && !e.shift && !e.meta && e.ancla) {
    return { tipo: 'arrastrar-seleccion', objetivo: e.ancla, alSoltarQuieto: { tipo: 'deseleccionar' } }
  }
  return { tipo: 'vacio' }
}

/** Pixeles de pantalla antes de que una seleccion multiple empiece a moverse (distingue clic de arrastre). */
export const UMBRAL_ARRASTRE = 3

export function superaUmbral(inicio: { x: number; y: number }, actual: { x: number; y: number }): boolean {
  return Math.hypot(actual.x - inicio.x, actual.y - inicio.y) > UMBRAL_ARRASTRE
}
