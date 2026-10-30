/**
 * Dónde y de qué tamaño se pinta el VISOR DEL NERVIO (14 oct 2026, v2).
 *
 * Daniel (14 oct): «no tengo scrollbar horizontal y ni debería, porque no puedo ver toda la página… quizá debería ser
 * una vista previa para teléfono». La vista previa ya no es un iframe al ancho del panel (que cortaba la página de
 * escritorio): es un TELÉFONO de 390×844 CSS px escalado con `transform: scale` para caber entero, o un ESCRITORIO de
 * 1280 px escalado al ancho. Nunca hay scroll horizontal; el vertical vive dentro del iframe.
 *
 * El panel tampoco se sale del viewport: en ancho grande se acopla a la derecha (como en v1); con la ventana chica o en
 * el teléfono es una hoja inferior (medio y estado) o casi pantalla completa (vista previa).
 *
 * Funciones puras: se prueban sin DOM (tests/canvas/visor-disposicion.test.ts).
 */
import type { AccionNervio } from './nervio'

export type ModoPrevia = 'telefono' | 'escritorio'

/** El teléfono de referencia (iPhone 14/15/16 en CSS px) y el escritorio que se escala. */
export const TELEFONO = { ancho: 390, alto: 844 } as const
export const ESCRITORIO = { ancho: 1280 } as const
/** Bisel del marco (px de pantalla, no escala) y aire alrededor del dispositivo dentro del cuerpo del panel. */
export const BISEL = 6
export const AIRE = 12
/** Por debajo de este ancho de lienzo el visor deja de acoplarse y se vuelve hoja. */
export const ANGOSTO = 720
const MARGEN = 16
const ARRIBA = 64
/** Alto aproximado de la cabecera y el pie del panel (para estimar el cuerpo antes de medirlo). */
export const CABEZA = 50
export const PIE = 34

export interface Lienzo { width: number; height: number }

export interface Disposicion {
  /** `hoja`: ventana chica o teléfono. `acoplado`: borde derecho del lienzo. */
  forma: 'hoja' | 'acoplado'
  left: number; width: number
  /** `null` = anclado abajo (`bottom: 8`): la hoja de medio/estado crece hacia arriba con su contenido. */
  top: number | null
  /** Alto fijo (vista previa) o `null` = el del contenido, con tope `maxHeight`. */
  height: number | null
  maxHeight: number
}

/** Ancho del panel acoplado para medio y estado (v1). */
export function anchoVisor(vp: Lienzo) { return Math.round(Math.max(320, Math.min(560, vp.width * 0.42))) }

export function disposicionVisor(vp: Lienzo, accion: AccionNervio, modo: ModoPrevia = 'telefono'): Disposicion {
  const W = Math.max(0, vp.width), H = Math.max(0, vp.height)
  if (W < ANGOSTO) {
    const left = 8, width = Math.max(0, W - 16)
    if (accion === 'previa') {
      const top = H < 560 ? 8 : Math.round(H * 0.08)
      return { forma: 'hoja', left, width, top, height: Math.max(0, H - top - 8), maxHeight: Math.max(0, H - top - 8) }
    }
    return { forma: 'hoja', left, width, top: null, height: null, maxHeight: Math.max(0, H - 16) }
  }
  const top = Math.min(ARRIBA, Math.max(8, Math.round(H * 0.06)))
  const maxHeight = Math.max(0, H - top - MARGEN)
  const tope = W - 2 * MARGEN
  if (accion !== 'previa') {
    const width = Math.min(tope, anchoVisor(vp))
    return { forma: 'acoplado', left: W - width - MARGEN, width, top, height: null, maxHeight }
  }
  let width: number
  if (modo === 'escritorio') {
    // Más ancho que el teléfono: a 0.42 de escala el texto de escritorio no se lee. Deja al menos 120 px de lienzo.
    width = Math.round(Math.max(anchoVisor(vp), Math.min(960, W * 0.55, W - 2 * MARGEN - 120)))
  } else {
    const cuerpo = { width: 10_000, height: maxHeight - CABEZA - PIE }
    const t = encajarTelefono(cuerpo)
    width = Math.max(340, Math.ceil(t.marcoAncho + 2 * AIRE))
  }
  width = Math.min(tope, width)
  return { forma: 'acoplado', left: W - width - MARGEN, width, top, height: maxHeight, maxHeight }
}

export interface Telefono { escala: number; marcoAncho: number; marcoAlto: number }

/** El teléfono más grande que cabe ENTERO en el cuerpo (nunca se agranda por encima de 1:1). */
export function encajarTelefono(cuerpo: Lienzo): Telefono {
  const libreW = cuerpo.width - 2 * AIRE - 2 * BISEL
  const libreH = cuerpo.height - 2 * AIRE - 2 * BISEL
  const escala = Math.max(0.05, Math.min(1, libreW / TELEFONO.ancho, libreH / TELEFONO.alto))
  return { escala, marcoAncho: TELEFONO.ancho * escala + 2 * BISEL, marcoAlto: TELEFONO.alto * escala + 2 * BISEL }
}

export interface Escritorio { escala: number; ventanaAncho: number; ventanaAlto: number; iframeAlto: number }

/** El escritorio de 1280 px escalado al ancho del cuerpo; el iframe es tan alto como para llenar el cuerpo ya escalado. */
export function encajarEscritorio(cuerpo: Lienzo): Escritorio {
  const ventanaAncho = Math.max(1, cuerpo.width - 2 * AIRE)
  const ventanaAlto = Math.max(1, cuerpo.height - 2 * AIRE)
  const escala = Math.min(1, ventanaAncho / ESCRITORIO.ancho)
  return { escala, ventanaAncho: ESCRITORIO.ancho * escala, ventanaAlto, iframeAlto: Math.round(ventanaAlto / escala) }
}
