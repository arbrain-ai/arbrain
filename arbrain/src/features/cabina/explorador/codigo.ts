/**
 * El HTML que da highlight.js partido en líneas (8 oct 2026), para pintar cada línea con su número y poder ajustar las largas
 * sin que los números se desalineen. Un comentario o una cadena de varias líneas abre un <span> en una y lo cierra en otra:
 * al cortar se cierran los abiertos y se reabren en la siguiente. Puro: tests/cabina/explorador.test.ts.
 */
export function lineasHtml(html: string): string[] {
  const out: string[] = [], pila: string[] = []
  let actual = ''
  for (const m of html.matchAll(/(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+|<)/g)) {
    if (m[1]) { pila.push(m[1]); actual += m[1] }
    else if (m[2]) { pila.pop(); actual += m[2] }
    else if (m[3]) { out.push(actual + '</span>'.repeat(pila.length)); actual = pila.join('') }
    else actual += m[4]
  }
  out.push(actual)
  return out
}

export const escaparHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
