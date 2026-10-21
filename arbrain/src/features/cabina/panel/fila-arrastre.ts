/**
 * Reordenar la fila de pestañas del teléfono con el dedo (10 oct 2026, Daniel: «mover las pestañas dejando presionado con
 * el teléfono y arrastrando hacia los lados»): la parte PURA, sin React ni DOM (tests/panel/fila-arrastre.test.ts).
 * Mantener presionado levanta la pestaña; arrastrarla la acomoda en vivo entre las demás y soltarla guarda el orden con el
 * mismo acomodo global del escritorio (`reordenar` + `indiceEnOrden`). El Taller queda fijo a la derecha, como allá.
 */
import { indiceDeInsercion } from './arrastre-geom'
import { conAncladas, indiceEnOrden, limitarIndice, moverA, TALLER } from './pestanas-fuera'

/** Ancho (px) de la franja de cada borde de la tira que la desplaza sola, y su velocidad máxima (px por cuadro). */
export const BORDE_AUTO = 36
export const VELOCIDAD_AUTO = 12

/**
 * Dónde caería la pestaña levantada entre las que se pueden mover (posición SIN ella). `centros`: el centro de cada una
 * en coordenadas del contenido de la tira (incluida la levantada, en `desde`). Una anclada solo cae entre ancladas.
 */
export function destinoEnFila(centros: number[], x: number, desde: number, anclada: boolean, ancladasSinElla: number) {
  return limitarIndice(indiceDeInsercion(centros, x, desde), anclada, ancladasSinElla, Math.max(0, centros.length - 1))
}

/** Cuánto se desplaza la tira en este cuadro con el dedo en `x`: hacia la izquierda (<0) junto al borde izquierdo, etc. */
export function velocidadAutoScroll(x: number, izquierda: number, derecha: number, borde = BORDE_AUTO, max = VELOCIDAD_AUTO) {
  if (derecha - izquierda <= borde * 2) return 0
  if (x < izquierda + borde) return -Math.ceil(max * Math.min(1, (izquierda + borde - x) / borde))
  if (x > derecha - borde) return Math.ceil(max * Math.min(1, (x - (derecha - borde)) / borde))
  return 0
}

/** La posición en el orden guardado que se le pasa a `reordenar`: la fila del teléfono pinta todas las abiertas. */
export const indiceParaReordenar = (orden: string[], claves: string[], clave: string, indice: number) =>
  indiceEnOrden(orden, claves.filter(c => c !== TALLER), clave, indice)

/** El orden que queda al soltar (lo mismo que hace `reordenar` del store; aquí para probarlo). */
export const ordenTrasSoltar = (orden: string[], claves: string[], clave: string, indice: number, ancladas: string[]) =>
  conAncladas(moverA(orden, clave, indiceParaReordenar(orden, claves, clave, indice)), ancladas)
