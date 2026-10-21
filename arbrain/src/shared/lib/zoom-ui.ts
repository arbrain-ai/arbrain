/**
 * El zoom de la interfaz y lo que flota encima (3 oct 2026).
 *
 * ZoomController aplica CSS `zoom` a <html> (⌘+/−) y publica `--ui-zoom`. Bajo ese zoom, getBoundingClientRect y
 * clientX/clientY dan coordenadas de PANTALLA, pero un `left/top/translate` de algo `position: fixed` se vuelve a
 * multiplicar por el zoom. Quien posiciona un menú, una sugerencia o un fantasma con coordenadas medidas tiene que
 * dividir entre el zoom; si no, a 1.25 el «+» del panel salía por la derecha y el menú quedaba cortado.
 * Una sola función para todos (antes cada menú tenía su copia del cálculo, y el «+» no la tenía).
 */
export function zoomUI(): number {
  if (typeof document === 'undefined') return 1
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom'))
  return Number.isFinite(z) && z > 0 ? z : 1
}

/** Coordenada de pantalla → la que entiende un `left/top/translate` fixed bajo el zoom de la UI. */
export const aFijo = (px: number, z = zoomUI()) => px / z

/**
 * Dónde poner un menú de `ancho` px de pantalla bajo su ancla: alineado al borde derecho del ancla y siempre dentro
 * de la ventana con `margen`. Todo entra y sale en px de pantalla salvo el resultado, que ya viene en px fijos.
 */
export function bajoElAncla(ancla: { right: number; bottom: number }, ancho: number, vista: { ancho: number }, { separacion = 6, margen = 8, z = zoomUI() } = {}) {
  const left = Math.min(Math.max(margen, ancla.right - ancho), vista.ancho - ancho - margen)
  return { left: aFijo(Math.max(margen, left), z), top: aFijo(ancla.bottom + separacion, z) }
}
