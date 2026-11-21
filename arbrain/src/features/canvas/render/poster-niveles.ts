/**
 * Los NIVELES de un póster (mar 17 nov 2026, «Mi mapa v19»).
 *
 * De lejos, el lienzo pinta el póster de cada pieza viva reducido a unos cuantos píxeles. Reducir un bitmap grande en
 * cada cuadro con suavizado (`imageSmoothingQuality: 'medium'`) es caro en Chromium: con los 13 pósters de la v19, el
 * paneo del mapa entero bajaba a 42 fps (la v18, con 6, iba a 50). La salida de siempre en gráficos: versiones a la
 * mitad, a la cuarta… hechas UNA vez (con suavizado alto) y guardadas junto al bitmap; cada cuadro pinta la más chica
 * que todavía tiene al menos los píxeles que ocupa en pantalla. De cerca no cambia nada (nivel 0, el bitmap tal cual).
 */

/** Cuántas veces se puede partir a la mitad un póster de `anchoPoster` px y seguir teniendo ≥ los px que ocupa en
 * pantalla (`anchoEnPantalla`). 0 = el original. Tope: 5 (1/32). Puro: se prueba sin navegador. */
export function nivelDePoster(anchoPoster: number, anchoEnPantalla: number, tope = 5): number {
  if (!(anchoPoster > 0) || !(anchoEnPantalla > 0)) return 0
  let n = 0, w = anchoPoster
  while (n < tope && w / 2 >= anchoEnPantalla && w / 2 >= 16) { w /= 2; n++ }
  return n
}

type Imagen = CanvasImageSource & { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength }
const reducidos = new WeakMap<object, CanvasImageSource[]>()

const lado = (v: number | SVGAnimatedLength) => (typeof v === 'number' ? v : v.baseVal.value)

/** La versión del póster que conviene pintar a ese ancho en pantalla (px de dispositivo). Se hace una vez y se guarda
 * junto al bitmap (un póster nuevo es otro objeto: su caché nace vacía). Sin `document` (pruebas), el original. */
export function posterParaPintar(poster: CanvasImageSource, anchoEnPantalla: number): CanvasImageSource {
  if (typeof document === 'undefined' || !('width' in poster)) return poster
  const w0 = lado((poster as Imagen).width), h0 = lado((poster as Imagen).height)
  const nivel = nivelDePoster(w0, anchoEnPantalla)
  if (nivel === 0) return poster
  let lista = reducidos.get(poster)
  if (!lista) { lista = []; reducidos.set(poster, lista) }
  if (!lista[nivel]) {
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(w0 / 2 ** nivel)); c.height = Math.max(1, Math.round(h0 / 2 ** nivel))
    const g = c.getContext('2d')
    if (!g) return poster
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'
    g.drawImage(poster, 0, 0, c.width, c.height)
    lista[nivel] = c
  }
  return lista[nivel]
}
