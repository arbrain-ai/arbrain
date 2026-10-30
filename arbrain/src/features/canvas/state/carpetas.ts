/**
 * Canvas v4 — el arbol de carpetas (3 oct 2026).
 *
 * `draw_folders.parent_id` lo escribe sfmap desde septiembre y la web lo
 * ignoraba: las subcarpetas de sfmap se veian planas, todas en la raiz. El
 * contrato es el de sfmap (NubePaginas.swift, `anidarCarpeta`): UN nivel. Una
 * madre no tiene madre; si no, se formarian cadenas y el arbol dejaria de caber
 * en el panel.
 *
 * Puro: sin red ni React, para poder probarlo y para que la ruta del servidor
 * valide con la MISMA regla que la interfaz ofrece.
 */

/** `archivada`: ISO de cuando se archivó (`draw_folders.archived_at`). Una subcarpeta de una archivada lo está también. */
export interface CarpetaPlana { id: string; nombre: string; orden: number; madre: string | null; archivada?: string | null }
export interface PaginaEnArbol { id: string; folderId: string | null }

export interface NodoCarpeta<P extends PaginaEnArbol> {
  carpeta: CarpetaPlana
  hijas: NodoCarpeta<P>[]
  paginas: P[]
}

const porOrden = (a: CarpetaPlana, b: CarpetaPlana) =>
  a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')

/**
 * El arbol de un nivel.
 *
 * Lo que no encaja se ENSEÑA en la raiz en vez de esconderse: una carpeta cuya
 * madre no existe (la borraron en otro aparato) o cuya madre a su vez tiene
 * madre (una cadena escrita a mano en la tabla). Un lienzo que no se ve es un
 * lienzo perdido, aunque este entero en la base.
 */
export function arbolCarpetas<P extends PaginaEnArbol>(
  carpetas: CarpetaPlana[], paginas: P[],
): { raiz: NodoCarpeta<P>[]; sueltas: P[] } {
  const porId = new Map(carpetas.map(c => [c.id, c]))
  const esRaiz = (c: CarpetaPlana) => {
    if (!c.madre || c.madre === c.id) return true
    const m = porId.get(c.madre)
    return !m || (!!m.madre && m.madre !== m.id)
  }
  const nodo = (c: CarpetaPlana): NodoCarpeta<P> => ({
    carpeta: c, hijas: [], paginas: paginas.filter(p => p.folderId === c.id),
  })
  const raiz = carpetas.filter(esRaiz).sort(porOrden).map(nodo)
  const indice = new Map(raiz.map(n => [n.carpeta.id, n]))
  for (const c of carpetas.filter(c => !esRaiz(c)).sort(porOrden)) indice.get(c.madre!)?.hijas.push(nodo(c))
  const conocidas = new Set(carpetas.map(c => c.id))
  return { raiz, sueltas: paginas.filter(p => !p.folderId || !conocidas.has(p.folderId)) }
}

/**
 * ¿Puede la carpeta `id` quedar dentro de `madre`? null = si; si no, el motivo.
 * `madre` null = sacarla a la raiz, que siempre se puede.
 */
export function puedeAnidar(carpetas: CarpetaPlana[], id: string, madre: string | null): string | null {
  const c = carpetas.find(x => x.id === id)
  if (!c) return 'esa carpeta no existe'
  if (madre === null) return null
  if (madre === id) return 'una carpeta no puede ir dentro de sí misma'
  const m = carpetas.find(x => x.id === madre)
  if (!m) return 'la carpeta de destino no existe'
  if (m.madre) return 'solo hay un nivel: esa carpeta ya está dentro de otra'
  if (carpetas.some(x => x.madre === id)) return 'tiene subcarpetas: solo hay un nivel'
  return null
}

/** ¿Se puede crear una subcarpeta dentro de `madre`? Mismo nivel unico. */
export const puedeSerMadre = (carpetas: CarpetaPlana[], madre: string) => {
  const m = carpetas.find(x => x.id === madre)
  return !!m && !m.madre
}
