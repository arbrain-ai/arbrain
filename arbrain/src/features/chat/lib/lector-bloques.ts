/**
 * TEXTO PROPIO DE UN CONTENEDOR (8 oct 2026, reporte de Daniel: el lector se saltó parte de
 * un mensaje con una lista anidada).
 *
 * Causa: el lector toma como bloque solo las HOJAS (p, li, h1–h4, blockquote sin otro bloque
 * dentro). Un `<li>` con una sub-lista no es hoja, así que se descartaba entero y su propia
 * prosa («El precio sigue a la prueba… El camino es este:») nunca se oía; la lectura pasaba
 * directo a los ítems anidados.
 *
 * Arreglo: el texto propio de un contenedor (los hijos en línea que están ENTRE sus bloques
 * hijos) se agrupa en tramos y cada tramo se envuelve en un <span data-lector-propio>, que sí
 * es hoja. Así ningún texto visible queda fuera y el orden del documento se conserva.
 *
 * PURO, sin DOM global: trabaja sobre la forma mínima de un nodo, testeable en node.
 */

export interface NodoLector {
  nodeType: number
  nodeName: string
  childNodes: ArrayLike<NodoLector>
  textContent: string | null
}

/** Selector de los bloques que el lector sabe leer (hojas o contenedores de hojas). Desde el 31 oct también h5, h6,
 *  las definiciones (dt, dd), el título de un desplegable (summary) y el pie de una figura (figcaption): antes un
 *  «##### Nota» nunca se oía. */
export const SELECTOR_BLOQUES = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,dt,dd,summary,figcaption'
export const MARCA_PROPIO = 'data-lector-propio'

const ELEMENTO = 1
const TEXTO = 3

// Elementos que cortan un tramo en línea: todo lo que se pinta como bloque.
const DE_BLOQUE = new Set([
  'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'DIV', 'PRE', 'TABLE',
  'HR', 'SECTION', 'ARTICLE', 'DETAILS', 'FIGURE', 'DL', 'DT', 'DD', 'SUMMARY', 'FIGCAPTION',
])

function esBloque(n: NodoLector): boolean {
  return n.nodeType === ELEMENTO && DE_BLOQUE.has(n.nodeName.toUpperCase())
}

/**
 * Tramos de hijos en línea con texto, separados por bloques. Vacío si `el` no tiene ningún
 * bloque hijo (entonces ya es hoja y se lee tal cual) o si no tiene prosa propia.
 */
export function tramosPropios(el: NodoLector): NodoLector[][] {
  const hijos = Array.from(el.childNodes)
  if (!hijos.some(esBloque)) return []
  const tramos: NodoLector[][] = []
  let actual: NodoLector[] = []
  const cierra = () => {
    if (actual.some((n) => /[\p{L}\p{N}]/u.test(n.textContent || ''))) tramos.push(actual)
    actual = []
  }
  for (const n of hijos) {
    if (esBloque(n)) cierra()
    else if (n.nodeType === ELEMENTO || n.nodeType === TEXTO) actual.push(n)
  }
  cierra()
  return tramos
}

/** Firma de un texto: espacios colapsados, sin orillas, sus primeros 80 caracteres. Estable entre renders. */
export function firmaDeTexto(t: string | null | undefined): string {
  return (t || '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/**
 * ¿Este texto es el mensaje que se leía? (12 nov 2026, «pongo pausa y desaparece la línea de audio»). Cuando React vuelve
 * a montar el mensaje (su id local `a-…` pasa al de la base), el lector lo reencuentra por la firma de sus párrafos. Antes
 * se comparaba firma contra firma de cada `p, li…` del nodo nuevo, pero la prosa propia de un `<li>` con sub-lista
 * («**Capa uno, quién eres:**») se lee envuelta en un `<span data-lector-propio>` que el nodo recién pintado aún no tiene:
 * su firma no era la de ningún bloque nuevo, el lector no se reubicaba y la barra se cerraba. Ahora basta con que cada
 * firma aparezca en el texto del candidato (colapsado igual): un párrafo es un tramo contiguo de su mensaje. Pura.
 */
export function contieneFirmas(firmas: readonly string[], texto: string | null | undefined): boolean {
  if (!firmas.length) return false
  const t = (texto || '').replace(/\s+/g, ' ')
  return firmas.every((f) => !!f && t.includes(f))
}
