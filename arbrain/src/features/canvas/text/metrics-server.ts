/**
 * Canvas v4 — medicion de texto en el SERVIDOR (Node), sin DOM.
 *
 * Lee los MISMOS archivos de fuente que se sirven al navegador y aplica la
 * instancia variable del peso pedido. Verificado contra Chromium el 19 ago 2026:
 * delta maximo 0.003px sobre 6 combinaciones de peso y texto.
 *
 * Dos trampas que costaron encontrar y que este archivo evita por construccion:
 *
 * 1. `getVariation()` REVIENTA sobre .woff2 variable ("Cannot read properties of
 *    undefined (reading 'tables')" en cmap). Por eso la fuente de verdad del
 *    servidor es .ttf, no .woff2. El navegador puede seguir cargando woff2.
 *
 * 2. Sin `getVariation()`, fontkit mide la instancia POR DEFECTO del archivo
 *    variable — que en Montserrat es Thin(100). Medir asi da 151.68px para
 *    "LEVY" donde el navegador pinta 163.15 a peso 800: 7% de error. Cambiar
 *    el heuristico por fontkit sin resolver la variacion casi no gana nada.
 */

import fs from 'node:fs'
import path from 'node:path'
// HECHO DE PLATAFORMA: fontkit tiene FORMA distinta en CJS y en ESM. La build
// CommonJS expone un default; la ESM (que es la que resuelve el bundler de
// Next) solo expone `create`/`openSync` con nombre. Un `import fontkit from`
// funciona en un script suelto de Node y revienta dentro de la app:
//   "Export default doesn't exist in target module"
// El import con NOMBRE funciona en los dos.
import { create as createFont, type Font, type FontCollection } from 'fontkit'
import type { FontFamily, TextStyle, Measurer, VerticalMetrics, VerticalMetricsProvider, MeasureContext } from './types'

const FONT_FILES: Record<FontFamily, string> = {
  montserrat: 'Montserrat[wght].ttf',
  'roboto-slab': 'RobotoSlab[wght].ttf',
  caveat: 'Caveat[wght].ttf',
  'jetbrains-mono': 'JetBrainsMono[wght].ttf',
}

/** El archivo de CURSIVA, donde existe. Mismo criterio que el navegador. */
const FONT_FILES_ITALIC: Partial<Record<FontFamily, string>> = {
  montserrat: 'Montserrat-Italic[wght].ttf',
}

/** Rango real del eje `wght` de cada archivo. Fuera de rango se clampa. */
const WEIGHT_RANGE: Record<FontFamily, [number, number]> = {
  montserrat: [100, 900],
  'roboto-slab': [100, 900],
  caveat: [400, 700],
  'jetbrains-mono': [100, 800],
}

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts', 'v4')

/**
 * `fontkit.create()` puede devolver una COLECCION (.ttc) que no sabe medir.
 * Nuestros archivos son .ttf sueltos, pero eso se VERIFICA en vez de asumirse:
 * un .ttc entrando por aqui fallaria mas adelante y en otro sitio, con un
 * mensaje que no diria nada del archivo.
 *
 * `getVariation` no esta en @types/fontkit pero existe en runtime y es
 * OBLIGATORIA: sin ella se mide la instancia por defecto del archivo variable
 * —Thin(100) en Montserrat— con 7% de error.
 */
type LoadedFont = Font & {
  getVariation(settings: Record<string, number>): LoadedFont
}

function asFont(font: Font | FontCollection, file: string): LoadedFont {
  if (!('layout' in font) || typeof (font as Font).layout !== 'function') {
    throw new Error(`[canvas/text] ${file} es una coleccion de fuentes (.ttc), no una fuente medible`)
  }
  return font as LoadedFont
}

const baseFontCache = new Map<string, LoadedFont>()
const variationCache = new Map<string, LoadedFont>()

/** ¿Que archivo corresponde a esta combinacion? Cursiva real o la recta. */
function archivoDe(family: FontFamily, italic: boolean): string {
  return (italic && FONT_FILES_ITALIC[family]) || FONT_FILES[family]
}

function loadBase(family: FontFamily, italic = false): LoadedFont {
  const nombre = archivoDe(family, italic)
  const cached = baseFontCache.get(nombre)
  if (cached) return cached
  const file = path.join(FONT_DIR, nombre)
  if (!fs.existsSync(file)) {
    throw new Error(
      `[canvas/text] falta el archivo de fuente ${file}. ` +
      `Sin el, la medicion server-side es imposible y el compilador NO debe adivinar.`,
    )
  }
  const font = asFont(createFont(fs.readFileSync(file)), nombre)
  baseFontCache.set(nombre, font)
  return font
}

function instanceFor(family: FontFamily, weight: number, italic = false): LoadedFont {
  const [min, max] = WEIGHT_RANGE[family]
  const wght = Math.min(max, Math.max(min, Math.round(weight)))
  const key = `${archivoDe(family, italic)}:${wght}`
  const cached = variationCache.get(key)
  if (cached) return cached
  const base = loadBase(family, italic)
  const variation = base.getVariation({ wght })
  variationCache.set(key, variation)
  return variation
}

export const measureServer: Measurer = (text, style) => {
  if (text.length === 0) return 0
  const font = instanceFor(style.family, style.weight, style.italic === true)
  // run.advanceWidth incluye el kerning. Sumar glyph.advanceWidth uno por uno
  // NO lo incluye y da de mas — ver la nota en types.ts.
  const run = font.layout(text)
  const upem: number = font.unitsPerEm
  let width = (run.advanceWidth / upem) * style.size
  if (style.letterSpacing) {
    // CSS aplica letter-spacing DESPUES de cada caracter, incluido el ultimo.
    width += style.letterSpacing * [...text].length
  }
  return width
}

/**
 * Codepoints que la fuente NO puede pintar (mapean a .notdef).
 *
 * Importa para la medicion, no como curiosidad: cuando un texto trae un glifo
 * fuera de cobertura, el navegador cambia a una fuente de RESPALDO que el
 * servidor no conoce ni puede predecir. Medido: "構造化された知識" a 60px da
 * 281.76px en fontkit (todo .notdef) y 480.00px en el navegador, que lo pinta
 * con una fuente CJK del sistema. 198px de diferencia.
 *
 * Un compilador de diagramas NO puede tratar eso como una medida buena. Tiene
 * dos salidas honestas: avisar, o cambiar la fuente del elemento. Lo que jamas
 * puede hacer es devolver 281.76 como si fuera cierto.
 */
export function uncoveredGlyphs(text: string, family: FontFamily, weight = 400): string[] {
  const font = instanceFor(family, weight)
  const missing: string[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (cp == null) continue
    // Los espacios en blanco no siempre tienen glifo propio y no son un hueco real.
    if (/\s/.test(ch)) continue
    if (font.glyphForCodePoint(cp).id === 0 && !missing.includes(ch)) missing.push(ch)
  }
  return missing
}

/** true si la fuente puede pintar TODO el texto (y por tanto la medida es fiable). */
export function isFullyCovered(text: string, family: FontFamily, weight = 400): boolean {
  return uncoveredGlyphs(text, family, weight).length === 0
}

export const verticalServer: VerticalMetricsProvider = (style): VerticalMetrics => {
  const font = instanceFor(style.family, style.weight, style.italic === true)
  const { unitsPerEm: upem, ascent, descent, lineGap } = font
  const scale = style.size / upem
  const a = ascent * scale
  const d = Math.abs(descent * scale)
  const g = (lineGap ?? 0) * scale
  return { ascent: a, descent: d, lineGap: g, naturalLineHeight: a + d + g }
}

export const serverMeasureContext: MeasureContext = {
  measure: measureServer,
  vertical: verticalServer,
}

/** Para el gate de paridad: qué archivo se está midiendo de verdad. */
export function describeLoadedFonts(): Array<{ family: FontFamily; file: string; exists: boolean }> {
  return (Object.keys(FONT_FILES) as FontFamily[]).map(family => {
    const file = path.join(FONT_DIR, FONT_FILES[family])
    return { family, file, exists: fs.existsSync(file) }
  })
}
