/**
 * Canvas v4 — medicion de texto en el NAVEGADOR.
 *
 * Usa `ctx.measureText` nativo: es la verdad, porque es literalmente el mismo
 * motor que va a pintar. El servidor (metrics-server.ts) reproduce estos
 * numeros con fontkit; el gate de paridad verifica que sigan coincidiendo.
 *
 * REGLA: el navegador NO carga los .ttf variables de 300-730KB. Carga sus
 * .woff2 normales por CSS. Lo unico que tiene que ser identico entre los dos
 * lados es el NUMERO, y eso se verifica midiendo, no asumiendo.
 */

import type { FontFamily, TextStyle, Measurer, VerticalMetrics, VerticalMetricsProvider, MeasureContext } from './types'
import { FAMILIAS_CON_CURSIVA } from './types'

const CSS_FAMILY: Record<FontFamily, string> = {
  montserrat: 'CanvasSans',
  'roboto-slab': 'CanvasSlab',
  caveat: 'CanvasHand',
  'jetbrains-mono': 'CanvasMono',
}

let ctx: CanvasRenderingContext2D | null = null

function context(): CanvasRenderingContext2D {
  if (ctx) return ctx
  if (typeof document === 'undefined') {
    throw new Error('[canvas/text] metrics-browser requiere DOM. En Node usa metrics-server.')
  }
  const canvas = document.createElement('canvas')
  const c = canvas.getContext('2d')
  if (!c) throw new Error('[canvas/text] no se pudo obtener contexto 2d para medir')
  ctx = c
  return c
}

/** La cadena que va en `ctx.font`. Mismo orden que la shorthand de CSS. */
export function cssFont(style: TextStyle): string {
  // La cursiva entra en la cadena SOLO si existe la cara de verdad. Pedirsela
  // al navegador para una familia que no la tiene lo hace sintetizarla por su
  // cuenta, y esa sintesis no es la nuestra: el motor y el medidor dejarian de
  // hablar del mismo dibujo.
  const cursiva = style.italic && FAMILIAS_CON_CURSIVA.has(style.family) ? 'italic ' : ''
  return `${cursiva}${style.weight} ${style.size}px ${CSS_FAMILY[style.family]}`
}

export const measureBrowser: Measurer = (text, style) => {
  if (text.length === 0) return 0
  const c = context()
  c.font = cssFont(style)
  let width = c.measureText(text).width
  if (style.letterSpacing) {
    width += style.letterSpacing * [...text].length
  }
  return width
}

export const verticalBrowser: VerticalMetricsProvider = (style): VerticalMetrics => {
  const c = context()
  c.font = cssFont(style)
  // Las metricas de la FUENTE (fontBoundingBox*), no las del texto medido:
  // asi el alto de linea no cambia segun si el string trae tildes o descendentes.
  const m = c.measureText('Hxg')
  const ascent = m.fontBoundingBoxAscent ?? style.size * 0.8
  const descent = m.fontBoundingBoxDescent ?? style.size * 0.2
  return { ascent, descent, lineGap: 0, naturalLineHeight: ascent + descent }
}

export const browserMeasureContext: MeasureContext = {
  measure: measureBrowser,
  vertical: verticalBrowser,
}

/**
 * Espera a que las fuentes esten REALMENTE cargadas antes de medir.
 * Medir en frio devuelve las metricas de la fuente de respaldo y todo el
 * layout nace torcido — la clase de bug que se ve bien en pantalla despues
 * de un refresh y mal en la primera carga.
 */
export async function waitForFonts(styles: TextStyle[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.all(styles.map(s => document.fonts.load(cssFont(s), 'Hxg')))
  await document.fonts.ready
}
