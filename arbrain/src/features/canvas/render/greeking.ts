/**
 * Canvas v4 — greeking: el texto que no se lee se dibuja como una línea (6 oct 2026, firmado por Daniel).
 *
 * El texto mide SIEMPRE lo que el autor del lienzo decidió, como en una lámina impresa: no se agranda al alejar
 * (se retiró el «zoom semántico»). Cuando un renglón queda por debajo de este tamaño EN PANTALLA no se lee ni
 * rasterizado, así que se pinta como lo que el ojo ve a esa distancia: una línea gris suave del largo del texto.
 * Sin medir y sin rasterizar glifos: es una estimación por caracteres, y cuesta un `fillRect`.
 *
 * Los textos que el autor hizo grandes (rótulos, palabras de escala de mapa) cruzan el umbral mucho más lejos
 * y se siguen leyendo de lejos porque son grandes de verdad.
 */

/** Por debajo de esto (px CSS de pantalla) un renglón es una línea. */
export const GREEKING_PX = 6.5

/** Ancho aproximado de un renglón: ~0.5 em por carácter, nunca más que su caja. */
export function anchoGreeking(linea: string, size: number, anchoCaja: number): number {
  return Math.min(anchoCaja, linea.length * size * 0.5)
}

export const enGreeking = (sizeU: number, zoom: number): boolean => sizeU * zoom < GREEKING_PX
