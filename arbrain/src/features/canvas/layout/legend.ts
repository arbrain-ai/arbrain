/**
 * Canvas v4 — la leyenda del diagrama.
 *
 * EL GAP QUE DECLARO EL CRITICO CIEGO, textual: "codificacion visual sin
 * diccionario. Usa borde rojo solido, borde morado discontinuo y tres tags de
 * esquina como si comunicaran estado o categoria, pero ni un solo elemento de
 * la interfaz explica ese codigo — el lector tiene que adivinar si el rojo
 * significa 'no hacer esto', 'riesgo' o es solo enfasis puesto a ojo."
 *
 * Lo incomodo: la leyenda YA estaba en el estandar visual §3 ("Leyenda
 * obligatoria: arriba a la derecha, mini-shape por tipo + label"), escrita y
 * con medidas. Estaba y no se implemento. El critico no descubrio una regla
 * nueva: encontro una que ya existia y se estaba ignorando.
 *
 * Se DERIVA de los roles presentes, no es una lista estatica: un diagrama sin
 * riesgos no debe explicar que significa el rojo. Una leyenda que documenta
 * codigos ausentes es ruido, y una que omite los presentes es el bug original.
 */

import type { Role, EdgeKind } from '../theme/tokens'
import type { MeasureContext, TextStyle } from '../text/types'

/** Que comunica cada rol. En palabras del lector, no del sistema. */
const SIGNIFICADO: Record<Role, string | null> = {
  card: null,            // la caja neutra no codifica nada: no se explica
  drawn: null,           // autoria, no semantica: la mano no necesita diccionario
  module: 'módulo con contenido',
  form: 'entrada / formulario',
  callout: 'llamada humana',
  deliverable: 'entregable',
  trigger: 'disparador',
  risk: 'riesgo — no tocar',
  agent: 'agente / automatización',
  tray: 'fase o territorio',
  sticky: 'nota',
  // El rol `nota` nacio despues que esta leyenda (la adhesiva amarilla, aparte
  // de `sticky` para no amarillear los chips) y aqui faltaba: el Record<Role,...>
  // los exige todos, asi que su ausencia rompia el type check del build.
  nota: 'nota adhesiva',
  // sensor: MISMO fallo que `nota` dos parrafos arriba, tercera repeticion. El rol
  // se enmendo en tokens.ts el 24 ago (opsroom The Machinery v2) y la leyenda no se
  // actualizo, asi que Record<Role,...> dejaba de cumplirse y el type check tumbaba
  // el build entero — con el, cualquier deploy de Vercel. Texto derivado de tokens:
  // "no es lo que se HACE ni lo que EXISTE: es lo que se MIDE".
  sensor: 'sensor — lo que se mide',
  // widget: CUARTA repeticion del mismo fallo (nota -> sensor -> ... -> widget).
  // El rol nacio con el centro de mando (53ca06c0, tres widgets vivos dentro del
  // mapa del negocio) y la leyenda no se actualizo, asi que Record<Role,...>
  // volvio a romper el type check y con el CUALQUIER deploy. Ya no basta con
  // documentarlo aqui: el arreglo de verdad es que este Record se derive de los
  // roles de tokens.ts en vez de repetirse a mano. Texto derivado de tokens:
  // "la ventana VIVA a otro sistema... el dato lo pinta la app al vuelo".
  widget: 'ventana viva a otro sistema',
}

/** Que comunica cada clase de arista. `flujo` es el default: no se explica. */
const SIGNIFICADO_ARISTA: Record<EdgeKind, string | null> = {
  flujo: null,
  agente: 'paso automatizado',
  fragil: 'relación frágil',
  hueco: 'declarado, aún hueco',
}

export interface LegendItem {
  /** Una caja se muestra con su figura; una arista, con un trazo. */
  clase: 'caja' | 'arista'
  role: Role
  edgeKind?: EdgeKind
  label: string
  swatch: { x: number; y: number; width: number; height: number }
  text: { x: number; y: number; width: number; height: number }
}

export interface Legend {
  items: LegendItem[]
  width: number
  height: number
}

/**
 * Tamaño del texto de la leyenda. Vive AQUI y lo leen el compilador y el juez.
 * Si cada uno lo declarara por su cuenta, el juez mediria un numero que la
 * pantalla no usa — un sensor midiendo su propia suposicion.
 */
export const LEGEND_SIZE = 16

const SWATCH_W = 44
const SWATCH_H = 22
const GAP_X = 10
const GAP_Y = 9
const COL_GAP = 26

/**
 * Compone la leyenda para los roles que el diagrama USA.
 * Devuelve null si no hay nada que explicar — un diagrama de puras cajas
 * neutras no necesita diccionario.
 */
export function composeLegend(
  ctx: MeasureContext, rolesUsados: Role[], style: TextStyle,
  aristasUsadas: Array<EdgeKind | undefined> = [],
): Legend | null {
  // Cajas y aristas entran al MISMO diccionario. Explicar el codigo de las
  // cajas y callar el de las lineas dejaria la mitad del diagrama en clave.
  const entradas: Array<{ clase: 'caja' | 'arista'; role: Role; edgeKind?: EdgeKind; label: string }> = []
  for (const r of [...new Set(rolesUsados)]) {
    const l = SIGNIFICADO[r]
    if (l != null) entradas.push({ clase: 'caja', role: r, label: l })
  }
  for (const k of [...new Set(aristasUsadas)]) {
    if (!k) continue
    const l = SIGNIFICADO_ARISTA[k]
    if (l != null) entradas.push({ clase: 'arista', role: 'card', edgeKind: k, label: l })
  }
  if (entradas.length === 0) return null
  const unicos = entradas

  const items: LegendItem[] = []
  const lineH = Math.max(SWATCH_H, Math.ceil(ctx.vertical(style).naturalLineHeight))
  // Dos columnas: una tira de ocho renglones es mas alta que el propio diagrama.
  const porColumna = Math.ceil(unicos.length / 2)
  let anchoCol0 = 0

  unicos.forEach((entrada, i) => {
    const label = entrada.label
    const col = Math.floor(i / porColumna)
    const fila = i % porColumna
    const w = ctx.measure(label, style)
    if (col === 0) anchoCol0 = Math.max(anchoCol0, SWATCH_W + GAP_X + w)
    items.push({
      clase: entrada.clase, role: entrada.role, edgeKind: entrada.edgeKind, label,
      swatch: { x: 0, y: fila * (lineH + GAP_Y), width: SWATCH_W, height: SWATCH_H },
      text: { x: SWATCH_W + GAP_X, y: fila * (lineH + GAP_Y), width: Math.ceil(w), height: lineH },
    })
  })

  // La segunda columna se corre despues de medir la primera: adivinar su
  // desplazamiento es como se solapan las leyendas.
  const offset = anchoCol0 + COL_GAP
  let ancho = anchoCol0
  for (const it of items) {
    const col = items.indexOf(it) >= porColumna ? 1 : 0
    if (col === 1) {
      it.swatch.x += offset
      it.text.x += offset
      ancho = Math.max(ancho, it.text.x + it.text.width)
    }
  }

  const filas = Math.min(porColumna, unicos.length)
  return { items, width: Math.ceil(ancho), height: filas * (lineH + GAP_Y) - GAP_Y }
}
