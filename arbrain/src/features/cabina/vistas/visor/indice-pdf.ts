/** Índice de un PDF (14 nov 2026): cuándo el «outline» que trae el archivo sirve como índice. Puro (tests/visor/documentos.test.ts). */

/** Muchos PDF convertidos traen un «índice» que no sirve: una entrada por página («Page 1, Page 2…»), identificadores o
 *  títulos repetidos. Eso no es un índice: se deja la vista de páginas. */
export function indiceUtil(caps: { titulo: string; pagina: number | null }[], paginas: number): boolean {
  if (caps.length < 2) return false
  const n = caps.length
  const deNumero = caps.filter(c => /^(page|p[áa]gina|p[áa]g\.?|p\.)\s*\d+$/i.test(c.titulo) || /^\d+$/.test(c.titulo)).length
  const raros = caps.filter(c => /^[0-9a-f_]{16,}$/i.test(c.titulo.replace(/\s/g, ''))).length
  const distintos = new Set(caps.map(c => c.titulo.toLowerCase())).size
  if (deNumero / n > 0.5 || raros / n > 0.5 || distintos / n < 0.5) return false
  if (paginas > 40 && n > paginas * 0.8) return false
  return true
}
