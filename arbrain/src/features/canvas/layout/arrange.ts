/**
 * Canvas v4 — layout MACRO: donde va cada nodo dadas las aristas.
 *
 * Esta capa es delgada a proposito. dagre resuelve bien el problema de grafos
 * (asignacion de rangos, orden dentro del rango, minimizacion de cruces) y no
 * hay razon para reescribirlo. Lo que el v3 hacia mal no era usar dagre: era
 * pedirle que ADEMAS resolviera la composicion de cada tarjeta, que es otro
 * problema (ver compose.ts).
 *
 * LA REGLA: a dagre se le entrega el `footprint` del nodo compuesto, NUNCA su
 * `box`. La descripcion de una tarjeta vive FUERA de su caja; si dagre solo
 * conoce la caja, reserva menos espacio del que el nodo ocupa y las
 * descripciones se enciman con la fila de abajo. Ese es exactamente el tipo de
 * solapamiento que el juez mecanico reprueba.
 */

import dagre from 'dagre'
import type { EdgeKind } from '../theme/tokens'

export type Direction = 'TB' | 'LR' | 'BT' | 'RL'

export interface ArrangeNode {
  id: string
  /** La huella COMPLETA del nodo compuesto, captions incluidas. */
  width: number
  height: number
}

export interface ArrangeEdge {
  from: string
  to: string
  /** Etiqueta de la arista. Su tamaño reserva espacio real en el ruteo. */
  label?: { width: number; height: number }
}

export interface ArrangeOptions {
  direction?: Direction
  /** Separacion entre rangos (filas en TB, columnas en LR). */
  rankSep?: number
  /** Separacion entre nodos del mismo rango. */
  nodeSep?: number
  edgeSep?: number
  margin?: number
}

export interface PlacedNode {
  id: string
  /** Esquina superior izquierda, en coordenadas de mundo. */
  x: number
  y: number
  width: number
  height: number
}

export interface RoutedEdge {
  from: string
  to: string
  /** Puntos de la ruta que dagre calculo, en coordenadas de mundo. */
  points: Array<{ x: number; y: number }>
  label?: { x: number; y: number; width: number; height: number }
  /** Clase de relacion declarada en el spec. La ata el compilador, no dagre. */
  kind?: EdgeKind
}

export interface ArrangeResult {
  nodes: PlacedNode[]
  edges: RoutedEdge[]
  bounds: { width: number; height: number }
}

const DEFAULTS: Required<ArrangeOptions> = {
  direction: 'LR', rankSep: 80, nodeSep: 40, edgeSep: 16, margin: 48,
}

export function arrange(
  nodes: ArrangeNode[], edges: ArrangeEdge[], options: ArrangeOptions = {},
): ArrangeResult {
  const o = { ...DEFAULTS, ...options }
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({
    rankdir: o.direction, ranksep: o.rankSep, nodesep: o.nodeSep,
    edgesep: o.edgeSep, marginx: o.margin, marginy: o.margin,
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height })

  edges.forEach((e, i) => {
    // Un id por arista: sin el, dos aristas entre el mismo par se pisan y
    // dagre solo reporta una ruta.
    const label = e.label
      ? { width: e.label.width, height: e.label.height, labelpos: 'c' as const }
      : {}
    g.setEdge(e.from, e.to, label, 'e' + i)
  })

  dagre.layout(g)

  const placed: PlacedNode[] = nodes.map(n => {
    const d = g.node(n.id) as unknown as { x: number; y: number; width: number; height: number }
    // dagre devuelve el CENTRO del nodo; el canvas trabaja con la esquina.
    return { id: n.id, x: d.x - d.width / 2, y: d.y - d.height / 2, width: d.width, height: d.height }
  })

  const routed: RoutedEdge[] = edges.map((e, i) => {
    const d = g.edge(e.from, e.to, 'e' + i) as unknown as {
      points: Array<{ x: number; y: number }>
      x?: number; y?: number; width?: number; height?: number
    }
    const out: RoutedEdge = { from: e.from, to: e.to, points: d?.points ?? [] }
    if (e.label && d?.x != null && d?.y != null) {
      out.label = {
        x: d.x - (d.width ?? e.label.width) / 2,
        y: d.y - (d.height ?? e.label.height) / 2,
        width: d.width ?? e.label.width,
        height: d.height ?? e.label.height,
      }
    }
    return out
  })

  const graph = g.graph() as unknown as { width?: number; height?: number }
  return {
    nodes: placed, edges: routed,
    bounds: { width: Math.ceil(graph.width ?? 0), height: Math.ceil(graph.height ?? 0) },
  }
}
