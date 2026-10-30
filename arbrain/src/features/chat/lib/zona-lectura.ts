/**
 * Zona visible real para seguir la frase que se lee en voz alta.
 * Va entre lo más bajo de la barra de lectura / borde del hilo y el borde superior del
 * composer MEDIDO en ese momento (crece al escribir), nunca un porcentaje fijo del viewport.
 */
export interface Franja { top: number; bottom: number }

export interface ZonaLecturaEntrada {
  bloque: Franja
  /** Área de scroll del hilo (rect del contenedor). */
  hilo: Franja
  /** Borde superior del composer, si existe y se pinta. */
  composerTop?: number | null
  /** Borde inferior de la barra de lectura superior, si tapa el hilo. */
  barraBottom?: number | null
  /** Aire mínimo entre la frase y los bordes de la zona. */
  margen?: number
}

export interface ZonaLecturaSalida {
  zona: Franja
  /** true si el bloque ya cabe entero dentro de la zona (cero scroll). */
  dentro: boolean
  /** Píxeles a desplazar el scroll (positivo = bajar) para centrar el bloque en la zona. */
  delta: number
}

export function calcularZonaLectura(e: ZonaLecturaEntrada): ZonaLecturaSalida {
  const margen = e.margen ?? 24
  let top = e.hilo.top
  let bottom = e.hilo.bottom
  if (e.barraBottom != null && e.barraBottom > top) top = Math.min(e.barraBottom, bottom)
  if (e.composerTop != null && e.composerTop < bottom) bottom = Math.max(e.composerTop, top)
  const zona = { top, bottom }
  const dentro = e.bloque.top >= top + margen && e.bloque.bottom <= bottom - margen
  const alto = e.bloque.bottom - e.bloque.top
  const util = bottom - top
  // Bloque más alto que la zona: alinear su inicio (la frase se lee de arriba abajo).
  const destino = alto + 2 * margen >= util ? top + margen : top + (util - alto) / 2
  return { zona, dentro, delta: e.bloque.top - destino }
}
