/**
 * Canvas v4 — filtro de la seleccion multiple (estilo Miro: «Filtro · N objetos»).
 *
 * Con varios elementos de tipos distintos la barra no enseña controles de texto/figura/trazo: enseña un filtro por
 * tipo, y elegir uno REDUCE la seleccion a ese tipo. Solo cuando todo es del mismo tipo salen sus controles propios.
 */

import type { CanvasElement } from './element'

export type CategoriaElemento = 'nota' | 'texto' | 'figura' | 'conector' | 'imagen' | 'marco' | 'trazo' | 'otro'

export const ROTULO_CATEGORIA: Record<CategoriaElemento, [string, string]> = {
  nota: ['nota', 'notas'], texto: ['texto', 'textos'], figura: ['figura', 'figuras'], conector: ['conector', 'conectores'],
  imagen: ['imagen', 'imágenes'], marco: ['marco', 'marcos'], trazo: ['trazo', 'trazos'], otro: ['otro', 'otros'],
}

export function categoriaDe(el: CanvasElement): CategoriaElemento {
  switch (el.type) {
    case 'shape': return (el as { role?: string }).role === 'sticky' ? 'nota' : 'figura'
    case 'text': return 'texto'
    case 'connector': return 'conector'
    case 'image': return 'imagen'
    case 'frame': return 'marco'
    case 'ink': return 'trazo'
    default: return 'otro'
  }
}

/** Cuantos hay de cada categoria, en orden estable de aparicion en ROTULO_CATEGORIA. */
export function contarPorCategoria(els: CanvasElement[]): Array<{ categoria: CategoriaElemento; cuantos: number }> {
  const m = new Map<CategoriaElemento, number>()
  for (const e of els) m.set(categoriaDe(e), (m.get(categoriaDe(e)) ?? 0) + 1)
  return (Object.keys(ROTULO_CATEGORIA) as CategoriaElemento[]).filter(c => m.has(c)).map(c => ({ categoria: c, cuantos: m.get(c)! }))
}

/** ¿Hay mas de un tipo? Entonces la barra es la de seleccion mixta. */
export function esSeleccionMixta(els: CanvasElement[]): boolean {
  return els.length > 1 && new Set(els.map(categoriaDe)).size > 1
}

/** Ids de la seleccion que son de esa categoria. */
export function filtrarPorCategoria(els: CanvasElement[], categoria: CategoriaElemento): Set<string> {
  return new Set(els.filter(e => categoriaDe(e) === categoria).map(e => e.id))
}

export function textoObjetos(n: number): string {
  return `${n} ${n === 1 ? 'objeto' : 'objetos'}`
}
