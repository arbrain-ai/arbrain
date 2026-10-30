/**
 * Canvas v4 — el cartucho del titulo de una seccion, calculado en UN solo lugar (6 oct 2026).
 *
 * Lo usan el motor (para pintarlo) y el hit-test (para saber donde se agarra una seccion). Antes el hit-test trataba
 * todo el cuerpo del marco como agarrable: en un lienzo con marcos de fondo gigantes, un clic en «vacio» caia dentro
 * de un marco, lo seleccionaba y nunca deseleccionaba. Ahora un marco se agarra por su titulo o por su borde.
 */
export interface CartuchoMarco {
  /** Titulo en mayusculas, tal como se pinta. */
  texto: string
  /** Ancho del texto + el espaciado entre letras. */
  ancho: number
  /** Caja del cartucho en coordenadas del lienzo. */
  caja: { x: number; y: number; width: number; height: number }
}

/** Mide el ancho de un texto ya en mayusculas con la fuente del titulo. */
export type MedirTitulo = (texto: string) => number

export function cartuchoDeMarco(
  marco: { x: number; y: number; title: string }, _zoom: number, medir: MedirTitulo,
): CartuchoMarco | null {
  if (!marco.title) return null
  const texto = marco.title.toUpperCase()
  const ancho = medir(texto) + texto.length * 0.6
  // El titulo mide siempre lo mismo (se retiro el zoom semantico): 18 u de alto, cartucho sobre el borde superior.
  const ox = marco.x + 10, oy = marco.y - 4
  const w = ancho + 16, h = 18
  return { texto, ancho, caja: { x: ox, y: oy - h, width: w, height: h } }
}

/** Estimacion sin lienzo (pruebas, servidor): ~8 px por letra de la fuente del titulo. */
export const medirAproximado: MedirTitulo = t => t.length * 8
