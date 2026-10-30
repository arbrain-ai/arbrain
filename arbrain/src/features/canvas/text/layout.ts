/**
 * Canvas v4 — corte de linea y ajuste de texto. UN algoritmo, dos medidores.
 *
 * Esta es la pieza que el v3 no tenia y por eso divergio: media distinto en el
 * servidor que en el navegador Y ademas cortaba distinto. Aqui el algoritmo es
 * uno solo y recibe el medidor inyectado, asi que servidor y navegador cortan
 * en el mismo lugar por construccion.
 *
 * Lo que este modulo SI hace y el v3 prometia sin hacer:
 * `autoSize` de verdad reduce el tamaño hasta que cabe. En el v3 el parametro
 * `autoShrink` se recibia y nunca se leia (renderer/text.ts:661): el texto
 * dentro de una figura se recortaba en silencio con ctx.clip() y el de una nota
 * se desbordaba por fuera. Dos fallas distintas, ninguna era ajustar.
 */

import type { MeasureContext, TextLayout, TextStyle, LaidOutLine } from './types'

export interface WrapOptions {
  maxWidth: number
  /** Alto disponible. Solo lo usa `fitText`. */
  maxHeight?: number
}

/** Separadores donde se puede cortar sin partir una palabra. */
const BREAKABLE = /(\s+|-|—|–|\/)/

function splitIntoTokens(text: string): string[] {
  return text.split(BREAKABLE).filter(t => t.length > 0)
}

function effectiveLineHeight(ctx: MeasureContext, style: TextStyle): number {
  const natural = ctx.vertical(style).naturalLineHeight
  return style.lineHeight ? style.size * style.lineHeight : natural
}

/**
 * Parte UNA palabra que no cabe entera, por busqueda binaria sobre el medidor.
 * Se usa solo cuando no hay donde cortar: una URL larga, un identificador.
 */
function breakLongWord(
  ctx: MeasureContext, word: string, style: TextStyle, maxWidth: number,
): { head: string; rest: string } {
  const chars = [...word]
  let lo = 1, hi = chars.length, best = 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const candidate = chars.slice(0, mid).join('')
    if (ctx.measure(candidate, style) <= maxWidth) { best = mid; lo = mid + 1 }
    else { hi = mid - 1 }
  }
  return { head: chars.slice(0, best).join(''), rest: chars.slice(best).join('') }
}

/** Corta el texto a lineas que caben en `maxWidth`. Respeta los \n explicitos. */
export function wrapText(
  ctx: MeasureContext, text: string, style: TextStyle, options: WrapOptions,
): TextLayout {
  const { maxWidth } = options
  const lineHeight = effectiveLineHeight(ctx, style)
  const lines: LaidOutLine[] = []
  let brokeWord = false

  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) { lines.push({ text: '', width: 0 }); continue }

    let current = ''
    const flush = () => {
      if (current.length === 0) return
      lines.push({ text: current, width: ctx.measure(current, style) })
      current = ''
    }

    for (let token of splitIntoTokens(paragraph)) {
      // Un espacio al inicio de linea no cuenta: se descarta como hace CSS.
      if (current.length === 0 && /^\s+$/.test(token)) continue

      const tentative = current + token
      if (ctx.measure(tentative, style) <= maxWidth) { current = tentative; continue }

      flush()
      if (/^\s+$/.test(token)) continue

      // El token solo tampoco cabe: hay que partirlo.
      while (ctx.measure(token, style) > maxWidth) {
        const { head, rest } = breakLongWord(ctx, token, style, maxWidth)
        if (head.length === 0) break // maxWidth mas chico que un glifo: se rinde
        brokeWord = true
        lines.push({ text: head, width: ctx.measure(head, style) })
        token = rest
      }
      current = token
    }
    flush()
    if (paragraph.length > 0 && lines.length === 0) lines.push({ text: '', width: 0 })
  }

  const width = lines.reduce((max, l) => Math.max(max, l.width), 0)
  return { lines, width, height: lines.length * lineHeight, lineHeight, brokeWord }
}

export interface FitOptions extends WrapOptions {
  maxHeight: number
  /** Piso de legibilidad. Por debajo, prefiere desbordar antes que ser ilegible. */
  minSize?: number
  /** Cuanto puede bajar por paso. 1px da resultados finos sin ser lento. */
  step?: number
}

export interface FitResult extends TextLayout {
  /** El tamaño con el que finalmente cupo. Puede ser menor al pedido. */
  size: number
  /** true si ni al tamaño minimo cupo. El llamador decide que hacer. */
  overflows: boolean
}

/**
 * Ajusta el texto a una caja: reduce el tamaño hasta que cabe en alto y ancho.
 *
 * Devuelve `overflows: true` en vez de recortar en silencio. Esa es la
 * diferencia con el v3: aqui el que llama SIEMPRE se entera de que no cupo, y
 * el juez mecanico puede reprobarlo. Un recorte silencioso es un dato perdido
 * que nadie ve hasta que Daniel abre el diagrama.
 */
export function fitText(
  ctx: MeasureContext, text: string, style: TextStyle, options: FitOptions,
): FitResult {
  const minSize = options.minSize ?? 8
  const step = options.step ?? 1
  let size = style.size
  let layout = wrapText(ctx, text, { ...style, size }, options)

  while (layout.height > options.maxHeight && size - step >= minSize) {
    size -= step
    layout = wrapText(ctx, text, { ...style, size }, options)
  }

  return { ...layout, size, overflows: layout.height > options.maxHeight }
}

/**
 * El tamaño natural de una caja para este texto: lo que mide sin comprimir.
 * Es lo que el compilador usa para pedirle a la capa de composicion cuanto
 * espacio necesita ANTES de que nadie decida donde va.
 */
export function naturalSize(
  ctx: MeasureContext, text: string, style: TextStyle, maxWidth: number,
): { width: number; height: number } {
  const layout = wrapText(ctx, text, style, { maxWidth })
  return { width: Math.ceil(layout.width), height: Math.ceil(layout.height) }
}
