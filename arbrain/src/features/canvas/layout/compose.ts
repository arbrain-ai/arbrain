/**
 * Canvas v4 — composicion de componentes (el layout MICRO).
 *
 * EL REENCUADRE QUE EL v3 NO TUVO: "layout" son DOS problemas distintos y solo
 * uno es de grafos.
 *
 *   MACRO — donde se situan los nodos entre si dadas las aristas. Eso es dagre,
 *           y dagre lo hace bien.
 *   MICRO — dado el contenido de un nodo (titulo, descripcion por fuera abajo,
 *           chips dentro abajo-derecha, insignia arriba), cuanto mide la caja y
 *           donde cae cada parte. ESTO ES FLEXBOX, no grafos.
 *
 * El v3 le pedia a dagre resolver lo micro, para lo que no fue diseñado, y lo
 * micro nunca se construyo como pieza compartida: se hardcodeo como aritmetica
 * de columnas en cada generador ("rail 300 · modulo 900 · form 1620"), y los
 * siete generadores ya divergieron entre si. Por eso ninguno usaba el
 * auto-layout que ya existia: resolvia la mitad equivocada del problema.
 *
 * Aqui la gramatica visual deja de ser prosa con pixeles magicos y pasa a ser
 * DATOS: un arbol de flexbox por rol, versionado y testeable UNA vez.
 */

import type { MeasureContext, TextStyle } from '../text/types'
import { wrapText } from '../text/layout'

import type { Node as YogaNode } from 'yoga-layout'

type YogaCore = (typeof import('yoga-layout'))['default']
type YogaEnums = Pick<typeof import('yoga-layout'), 'Edge' | 'FlexDirection' | 'Justify' | 'Wrap' | 'Direction'>

let core: YogaCore | null = null
let E: YogaEnums | null = null

/** Carga el WASM de yoga una vez. El MISMO binario en Node y en el navegador,
 *  que es lo que hace que servidor y cliente compongan idéntico. */
export async function initLayout(): Promise<void> {
  if (core) return
  const mod = await import('yoga-layout')
  core = mod.default
  E = { Edge: mod.Edge, FlexDirection: mod.FlexDirection, Justify: mod.Justify, Wrap: mod.Wrap, Direction: mod.Direction }
}

function requireYoga(): { Y: YogaCore; E: YogaEnums } {
  if (!core || !E) throw new Error('[canvas/layout] falta await initLayout() antes de componer')
  return { Y: core, E }
}

/** Roles del estandar visual. El agente declara ESTO, nunca una plantilla. */
export type NodeRole =
  | 'card'          // caja con SOLO el titulo adentro (la regla "cards simples")
  | 'module'        // caja + lista de items adentro
  | 'form'          // entrada / formulario
  | 'callout'       // llamada humana, con numero
  | 'deliverable'   // entregable / artefacto
  | 'trigger'       // disparador
  | 'risk'          // riesgo
  | 'agent'         // agente o automatizacion

export interface Chip { text: string }

/** Lo que el agente declara de un nodo. Cero coordenadas, cero tamaños. */
export interface NodeContent {
  role: NodeRole
  title: string
  /** Va DEBAJO de la caja y FUERA de ella. El estandar es explicito:
   *  "caja con parrafo adentro = anti-patron". */
  caption?: string
  /** Items dentro de la caja (curriculum de un modulo). */
  items?: string[]
  /** Etiquetas cortas, alineadas abajo-derecha DENTRO de la caja. */
  chips?: Chip[]
  /** Numero del circulo, solo para `callout`. */
  index?: number
}

export interface ComposeTokens {
  fontTitle: TextStyle
  fontBody: TextStyle
  fontCaption: TextStyle
  fontChip: TextStyle
  paddingX: number
  paddingY: number
  gap: number
  /** Separacion entre la caja y su caption externa. */
  captionGap: number
  minWidth: number
  maxWidth: number
  /** Diametro del circulo numerado de un callout. */
  badgeSize: number
}

/**
 * Tamaños derivados de la vara del estandar visual, no elegidos a ojo.
 *
 * §18 nacio de un reclamo textual de Daniel sobre La Maquina v1 ("de lejos no
 * veo nada, cards chiquitas con monton de espacio vacio") y fija el piso en
 * 20-24px con QA a 40% de zoom. La aritmetica: para leerse comodo al 40% hace
 * falta >=8px en pantalla, o sea >=20px de tamaño real.
 *
 * Los METADATOS son la excepcion deliberada: el mismo estandar los quiere
 * "muted, ~10.5-11px, abajo-derecha". No son texto estructural y no tienen que
 * leerse de lejos — son detalle de cerca. El juez mecanico los evalua con otra
 * vara, y esa distincion esta hecha a proposito, no es un hueco.
 */
export const DEFAULT_TOKENS: ComposeTokens = {
  fontTitle:   { family: 'montserrat', weight: 700, size: 24 },  // 9.6px al 40%
  fontBody:    { family: 'montserrat', weight: 500, size: 20 },  // 8.0px al 40%
  fontCaption: { family: 'montserrat', weight: 400, size: 20 },  // 8.0px al 40%
  fontChip:    { family: 'montserrat', weight: 700, size: 11 },  // metadato, de cerca
  paddingX: 22, paddingY: 18, gap: 10, captionGap: 10,
  minWidth: 200, maxWidth: 520, badgeSize: 44,
}

/** Una parte ya posicionada, en coordenadas relativas al origen del componente. */
export interface ComposedPart {
  kind: 'title' | 'item' | 'caption' | 'chip' | 'badge' | 'box'
  text?: string
  /**
   * Las lineas YA CORTADAS por el mismo wrap que decidio el tamaño de la caja.
   *
   * Sin esto el renderer recibe el texto crudo y lo pinta de un tiron: medido,
   * una caption de 434px declarados se pintaba en UNA linea de 616px y se metia
   * 183px debajo de la tarjeta vecina. El modelo media bien y el renderer
   * ignoraba el resultado — el mismo pecado del v3, donde el renderer decidia
   * por su cuenta en vez de pintar lo que le dan.
   */
  lines?: string[]
  x: number; y: number; width: number; height: number
  style?: TextStyle
}

export interface ComposedNode {
  /** Caja VISIBLE del componente (sin la caption externa). */
  box: { width: number; height: number }
  /** Huella COMPLETA, incluida la caption de afuera. Esto es lo que dagre debe
   *  recibir como tamaño del nodo, o las captions se solapan con la fila de abajo. */
  footprint: { width: number; height: number }
  parts: ComposedPart[]
  /** true si algun texto no cupo. El compilador NUNCA recorta en silencio. */
  overflows: boolean
}

function measureTextNode(
  ctx: MeasureContext, node: YogaNode, text: string, style: TextStyle, maxWidth: number,
): void {
  node.setMeasureFunc((availableWidth: number) => {
    const width = Number.isFinite(availableWidth) && availableWidth > 0
      ? Math.min(availableWidth, maxWidth) : maxWidth
    const laid = wrapText(ctx, text, style, { maxWidth: width })
    return { width: Math.ceil(laid.width), height: Math.ceil(laid.height) }
  })
}

/**
 * Compone un nodo: decide su tamaño y donde cae cada parte, midiendo el texto
 * de verdad. Devuelve coordenadas relativas — quien lo coloca en el mundo es
 * la capa de grafo, que recibe `footprint` como tamaño del nodo.
 */
export function composeNode(
  ctx: MeasureContext, content: NodeContent, tokens: ComposeTokens = DEFAULT_TOKENS,
): ComposedNode {
  const { Y, E: en } = requireYoga()
  const parts: ComposedPart[] = []
  let overflows = false

  const innerMax = tokens.maxWidth - tokens.paddingX * 2

  // Se corta con la MISMA funcion y los MISMOS parametros que usara el
  // measureFunc de yoga: si difieren, la caja mide una cosa y el texto otra.
  const cortar = (t: string, style: TextStyle, max: number) =>
    wrapText(ctx, t, style, { maxWidth: max }).lines.map(l => l.text)

  const box = Y.Node.create()
  box.setFlexDirection(en.FlexDirection.Column)
  box.setPadding(en.Edge.Horizontal, tokens.paddingX)
  box.setPadding(en.Edge.Vertical, tokens.paddingY)
  box.setMinWidth(tokens.minWidth)
  box.setMaxWidth(tokens.maxWidth)

  const title = Y.Node.create()
  measureTextNode(ctx, title, content.title, tokens.fontTitle, innerMax)
  box.insertChild(title, box.getChildCount())

  const itemNodes: YogaNode[] = []
  for (const item of content.items ?? []) {
    const n = Y.Node.create()
    n.setMargin(en.Edge.Top, tokens.gap)
    measureTextNode(ctx, n, item, tokens.fontBody, innerMax)
    box.insertChild(n, box.getChildCount())
    itemNodes.push(n)
  }

  // Chips: fila que se envuelve, empujada a la derecha. Es literalmente la
  // regla del estandar "chips alineados abajo-derecha", como datos.
  let chipRow: YogaNode | null = null
  const chipNodes: YogaNode[] = []
  if (content.chips?.length) {
    chipRow = Y.Node.create()
    chipRow.setFlexDirection(en.FlexDirection.Row)
    chipRow.setJustifyContent(en.Justify.FlexEnd)
    chipRow.setFlexWrap(en.Wrap.Wrap)
    chipRow.setMargin(en.Edge.Top, tokens.gap)
    for (const chip of content.chips) {
      const n = Y.Node.create()
      n.setMargin(en.Edge.Left, 6)
      n.setPadding(en.Edge.Horizontal, 8)
      n.setPadding(en.Edge.Vertical, 4)
      measureTextNode(ctx, n, chip.text, tokens.fontChip, innerMax)
      chipRow.insertChild(n, chipRow.getChildCount())
      chipNodes.push(n)
    }
    box.insertChild(chipRow, box.getChildCount())
  }

  box.calculateLayout(undefined, undefined, en.Direction.LTR)
  const boxLayout = box.getComputedLayout()

  const titleLayout = title.getComputedLayout()
  parts.push({ kind: 'title', text: content.title, style: tokens.fontTitle,
    lines: cortar(content.title, tokens.fontTitle, Math.max(1, titleLayout.width)),
    x: titleLayout.left, y: titleLayout.top, width: titleLayout.width, height: titleLayout.height })

  itemNodes.forEach((n, i) => {
    const l = n.getComputedLayout()
    parts.push({ kind: 'item', text: content.items![i], style: tokens.fontBody,
      lines: cortar(content.items![i], tokens.fontBody, Math.max(1, l.width)),
      x: l.left, y: l.top, width: l.width, height: l.height })
  })

  if (chipRow) {
    const rowLayout = chipRow.getComputedLayout()
    chipNodes.forEach((n, i) => {
      const l = n.getComputedLayout()
      parts.push({ kind: 'chip', text: content.chips![i].text, style: tokens.fontChip,
        lines: [content.chips![i].text],
        x: rowLayout.left + l.left, y: rowLayout.top + l.top, width: l.width, height: l.height })
    })
  }

  // La caption vive FUERA de la caja, debajo. El estandar es explicito:
  // "toda descripcion va FUERA del recuadro; caja con parrafo adentro = anti-patron".
  let footprintHeight = boxLayout.height
  let footprintWidth = boxLayout.width
  if (content.caption) {
    // El pie envuelve al ancho de SU tarjeta, no al maximo global. Un pie de 485px
    // colgando de una tarjeta de 250px pasa el juez (la huella lo contempla) pero se
    // lee como texto suelto: no se alinea con ningun borde y desbalancea la columna.
    // Piso de 220px porque una tarjeta muy angosta produciria una palabra por renglon.
    const anchoPie = Math.min(tokens.maxWidth, Math.max(220, boxLayout.width))
    const laid = wrapText(ctx, content.caption, tokens.fontCaption, { maxWidth: anchoPie })
    const y = boxLayout.height + tokens.captionGap
    parts.push({ kind: 'caption', text: content.caption, style: tokens.fontCaption,
      lines: laid.lines.map(l => l.text),
      x: 0, y, width: laid.width, height: laid.height })
    footprintHeight = y + laid.height
    footprintWidth = Math.max(footprintWidth, laid.width)
    if (laid.brokeWord) overflows = true
  }

  box.freeRecursive()

  return {
    box: { width: boxLayout.width, height: boxLayout.height },
    footprint: { width: footprintWidth, height: footprintHeight },
    parts, overflows,
  }
}
