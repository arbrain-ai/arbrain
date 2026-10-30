/**
 * Canvas v4 — tipografia sobre la seleccion.
 *
 * El problema que resuelve: "el texto de este elemento" no es un solo campo. Un
 * bloque de texto tiene UN estilo; una tarjeta compilada tiene varios (titulo,
 * renglones, pie, etiquetas), cada uno con su tamaño; una tabla tiene el suyo.
 * Sin un punto unico, cada superficie de la interfaz acabaria decidiendo por su
 * cuenta que significa "ponlo en negrita" — y decidirian distinto.
 *
 * REGLA DE TAMAÑO: cambiar el tamaño ESCALA proporcionalmente, no aplana. Un
 * titulo de 24 y un pie de 16 tienen esa diferencia por diseño; igualarlos a
 * ambos en 20 destruye la jerarquia que el compilador construyo.
 */

import type { CanvasElement } from './element'
import type { TextStyle, FontFamily } from '../text/types'

export interface TipografiaPatch {
  family?: FontFamily
  weight?: number
  italic?: boolean
  underline?: boolean
  strike?: boolean
  /** Tamaño OBJETIVO del renglon mas grande. El resto escala con el. */
  size?: number
  lineHeight?: number
  letterSpacing?: number
  align?: 'left' | 'center' | 'right'
}

/** ¿Este elemento tiene texto que la tipografia pueda tocar? */
export function tieneTexto(el: CanvasElement): boolean {
  if (el.type === 'text' || el.type === 'table' || el.type === 'code') return true
  return el.type === 'shape' && (el.text?.length ?? 0) > 0
}

/** Los estilos que hay dentro de un elemento, para poder LEER el estado actual. */
export function estilosDe(el: CanvasElement): TextStyle[] {
  if (el.type === 'text' || el.type === 'table' || el.type === 'code') return [el.style]
  if (el.type === 'shape') return (el.text ?? []).map(t => t.style)
  return []
}

/**
 * El estilo que la interfaz debe MOSTRAR para una seleccion.
 *
 * Con varios elementos, un campo solo se muestra si TODOS coinciden; si no,
 * queda indefinido y el control aparece en blanco. Enseñar el valor del primero
 * haria que la barra afirme algo falso sobre los demas.
 */
export function estiloComun(els: CanvasElement[]): Partial<TextStyle> & { align?: string } {
  const todos = els.flatMap(estilosDe)
  if (todos.length === 0) return {}
  const igual = <K extends keyof TextStyle>(k: K): TextStyle[K] | undefined => {
    const v = todos[0][k]
    return todos.every(s => s[k] === v) ? v : undefined
  }
  // La alineacion se lee de los DOS sitios donde vive: `align` en un bloque de
  // texto, `textAlign` en una figura. Leer solo uno dejaba el control en blanco
  // sobre una figura que si tenia alineacion, y un control en blanco significa
  // "valores distintos" — habria estado mintiendo.
  const alineaciones = els.flatMap(e =>
    e.type === 'text' ? [e.align]
    : e.type === 'shape' && e.text?.length ? [e.textAlign ?? (e.origin ? 'left' : 'center')]
    : [])
  return {
    family: igual('family'), weight: igual('weight'),
    italic: igual('italic'), underline: igual('underline'), strike: igual('strike'),
    // El tamaño que se ENSEÑA es el mayor: es el que el ojo lee como "el
    // tamaño" del elemento, y es el que la escala usa como referencia.
    size: Math.max(...todos.map(s => s.size)),
    lineHeight: igual('lineHeight'), letterSpacing: igual('letterSpacing'),
    align: alineaciones.length && alineaciones.every(a => a === alineaciones[0]) ? alineaciones[0] : undefined,
  }
}

function aplicarAEstilo(s: TextStyle, p: TipografiaPatch, factor: number): TextStyle {
  const out: TextStyle = { ...s }
  if (p.family !== undefined) out.family = p.family
  if (p.weight !== undefined) out.weight = p.weight
  if (p.italic !== undefined) out.italic = p.italic
  if (p.underline !== undefined) out.underline = p.underline
  if (p.strike !== undefined) out.strike = p.strike
  if (p.lineHeight !== undefined) out.lineHeight = p.lineHeight
  if (p.letterSpacing !== undefined) out.letterSpacing = p.letterSpacing
  // Piso de 6px: mas chico que eso no es texto, es ruido — la misma vara que
  // usa el juez para la legibilidad.
  if (factor !== 1) out.size = Math.max(6, Math.round(s.size * factor * 10) / 10)
  return out
}

/** Aplica la tipografia a un elemento. Devuelve el mismo objeto si no aplica. */
export function aplicarTipografia(el: CanvasElement, p: TipografiaPatch): CanvasElement {
  const estilos = estilosDe(el)
  if (estilos.length === 0) return el
  const mayor = Math.max(...estilos.map(s => s.size))
  const factor = p.size !== undefined && mayor > 0 ? p.size / mayor : 1
  const ahora = Date.now()

  if (el.type === 'text') {
    return { ...el, style: aplicarAEstilo(el.style, p, factor),
             align: (p.align as typeof el.align) ?? el.align, updatedAt: ahora }
  }
  if (el.type === 'table' || el.type === 'code') {
    return { ...el, style: aplicarAEstilo(el.style, p, factor), updatedAt: ahora }
  }
  if (el.type === 'shape') {
    // La alineacion de una FIGURA vive en el elemento, no en cada parte: es una
    // decision del contenedor. Alinear el titulo a la izquierda y el pie al
    // centro seria un accidente, no una intencion.
    return { ...el, updatedAt: ahora,
             textAlign: (p.align as typeof el.textAlign) ?? el.textAlign,
             text: (el.text ?? []).map(t => ({ ...t, style: aplicarAEstilo(t.style, p, factor) })) }
  }
  return el
}

/** Las familias que la interfaz ofrece, con el nombre que Daniel reconoce. */
export const FAMILIAS: Array<{ id: FontFamily; label: string; muestra: string }> = [
  { id: 'montserrat', label: 'Montserrat', muestra: 'Ag' },
  { id: 'roboto-slab', label: 'Roboto Slab', muestra: 'Ag' },
  { id: 'caveat', label: 'Caveat', muestra: 'Ag' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', muestra: 'Ag' },
]

/** Rango de peso REAL de cada archivo. Pedir 900 a Caveat da 700 y confunde. */
export const PESOS: Record<FontFamily, number[]> = {
  montserrat: [300, 400, 500, 600, 700, 800, 900],
  'roboto-slab': [300, 400, 500, 600, 700, 800, 900],
  caveat: [400, 500, 600, 700],
  'jetbrains-mono': [300, 400, 500, 600, 700, 800],
}

/** Tamaños con nombre. Un menu de tallas se elige mas rapido que un numero. */
export const TAMANOS: Array<{ px: number; label: string }> = [
  { px: 12, label: 'Micro' }, { px: 16, label: 'Pequeño' }, { px: 20, label: 'Normal' },
  { px: 24, label: 'Nota' }, { px: 32, label: 'Mediano' }, { px: 40, label: 'Grande' },
  { px: 56, label: 'Título' }, { px: 72, label: 'Display' }, { px: 96, label: 'Cartel' },
]
