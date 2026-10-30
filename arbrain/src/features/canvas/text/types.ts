/**
 * Canvas v4 — contrato de medicion de texto.
 *
 * La leccion que este modulo existe para no repetir: el v3 media con
 * `charWidth = fontSize * 0.62` porque `document` no existe server-side.
 * Medido el 19 ago 2026 contra Chromium real: ese heuristico se queda corto
 * 8.8% en mayusculas peso 800 ("LEVY" a 60px daba 148.80 cuando el navegador
 * pinta 163.15) y por eso el wrap partia palabras a la mitad.
 *
 * El v4 tiene DOS implementaciones de `Measurer` — fontkit en el servidor,
 * `ctx.measureText` en el navegador — verificadas identicas por un gate.
 * El ALGORITMO de corte de linea es uno solo y vive en `layout.ts`: recibe
 * el measurer inyectado. Dos mediciones, un algoritmo, cero divergencia.
 */

export type FontFamily = 'montserrat' | 'roboto-slab' | 'caveat' | 'jetbrains-mono'

/** Peso real del eje variable. Cada familia declara su rango soportado. */
export type FontWeight = number

export interface TextStyle {
  family: FontFamily
  weight: FontWeight
  /** Tamaño en pixeles CSS. */
  size: number
  /** Multiplicador de alto de linea. 1.0 = el alto natural de la fuente. */
  lineHeight?: number
  /** Espaciado entre letras en px, como el `letter-spacing` de CSS. */
  letterSpacing?: number
  /**
   * CURSIVA.
   *
   * Solo Montserrat trae un archivo de cursiva DE VERDAD (un diseño distinto,
   * no el mismo inclinado). Las otras tres se inclinan a mano en el motor, que
   * es lo mismo que hace el navegador cuando no encuentra la cara — pero
   * hacerlo nosotros garantiza que servidor y navegador MIDAN igual, porque
   * inclinar no cambia el avance de ningun glifo.
   */
  italic?: boolean
  /** Subrayado. Se pinta; no viene de la fuente. */
  underline?: boolean
  /** Tachado. Se pinta; no viene de la fuente. */
  strike?: boolean
}

/** Familias que tienen un archivo de CURSIVA propio. El resto se inclina. */
export const FAMILIAS_CON_CURSIVA: ReadonlySet<FontFamily> = new Set<FontFamily>(['montserrat'])

/** Cuanto se inclina la cursiva sintetica. 12 grados, como el faux italic del navegador. */
export const OBLICUA = Math.tan(12 * Math.PI / 180)

/**
 * Lo unico que el algoritmo de layout necesita saber medir.
 * Devuelve el avance del renglon EN PIXELES, con kerning aplicado.
 *
 * ⚠️ El kerning no es opcional ni un refinamiento: sumar el `advanceWidth` de
 * cada glifo por separado da 164.44px para "LEVY" donde el renglon real mide
 * 163.15px. El par "AV" solo ya vale -2.34px. Toda implementacion DEBE
 * devolver el avance del renglon completo, jamas la suma de sus partes.
 */
export type Measurer = (text: string, style: TextStyle) => number

/** Metricas verticales de una fuente, normalizadas a un tamaño en px. */
export interface VerticalMetrics {
  ascent: number
  descent: number
  lineGap: number
  /** ascent + |descent| + lineGap, en px. El alto natural de una linea. */
  naturalLineHeight: number
}

export type VerticalMetricsProvider = (style: TextStyle) => VerticalMetrics

export interface MeasureContext {
  measure: Measurer
  vertical: VerticalMetricsProvider
}

/** Una linea ya cortada, con su ancho real medido. */
export interface LaidOutLine {
  text: string
  width: number
}

export interface TextLayout {
  lines: LaidOutLine[]
  /** El ancho de la linea mas ancha. */
  width: number
  height: number
  lineHeight: number
  /** true si alguna palabra individual no cupo y hubo que partirla. */
  brokeWord: boolean
}
