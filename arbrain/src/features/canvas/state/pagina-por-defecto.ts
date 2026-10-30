/** La página que abre la sección Lienzo cuando la URL no dice cuál (pura: sin React ni CSS, para probarla). */
import type { Carpeta, PaginaResumen } from './nube'
import { carpetaArchivada } from './vista-lienzos'

/** La página que abre la sección cuando la URL no dice cuál: la última usada si sigue viva, si no la más reciente. */
export function paginaPorDefecto(todas: (Pick<PaginaResumen, 'id' | 'actualizado'> & { archivado?: string | null; folderId?: string | null })[], ultima: string | null, carpetas: Carpeta[] = []): string | null {
  // Una archivada (ella o su carpeta) no es «la última» ni «la más reciente»
  const paginas = todas.filter(p => !p.archivado && !carpetaArchivada(carpetas, p.folderId ?? null))
  if (ultima && paginas.some(p => p.id === ultima)) return ultima
  const reciente = [...paginas].sort((a, b) => b.actualizado.localeCompare(a.actualizado))[0]
  return reciente?.id ?? null
}
