/**
 * Auto-layout engine — facade over dagre.
 *
 * dagre handles hierarchical layouts (TB, LR, BT, RL).
 * For radial / force / layered we'd lazy-load elkjs.
 */
import dagre from 'dagre'
import type { CanvasElement, ElementId } from '../elements/types'
import { bboxFromElement, isLinear } from '../elements/types'

export type ArrangeAlgorithm =
  | 'dagre-tb' | 'dagre-lr' | 'dagre-bt' | 'dagre-rl'
  | 'grid' | 'stack-vertical' | 'stack-horizontal'
  | 'elk-radial' | 'elk-force' | 'elk-layered'

export interface ArrangeOptions {
  rankSep?: number
  nodeSep?: number
  cols?: number
  gap?: number
  padding?: number
  preservePositions?: boolean
}

/**
 * Compute new (x,y) for each id according to algorithm.
 * Returns a Map: elementId → { x, y }.
 *
 * Edges are derived from `connector` and `arrow` elements that bind to ids in the set.
 */
export function autoArrange(
  allElements: CanvasElement[],
  ids: ElementId[],
  algorithm: ArrangeAlgorithm,
  options: ArrangeOptions = {},
): Map<ElementId, { x: number; y: number }> {
  const out = new Map<ElementId, { x: number; y: number }>()
  const idSet = new Set(ids)
  const nodes = allElements.filter(e => idSet.has(e.id) && !isLinear(e))

  if (algorithm === 'grid') {
    const cols = options.cols ?? Math.ceil(Math.sqrt(nodes.length))
    const gap = options.gap ?? 32
    let cx = 0, cy = 0, maxRowH = 0, col = 0
    for (const n of nodes) {
      out.set(n.id, { x: cx, y: cy })
      maxRowH = Math.max(maxRowH, n.height)
      cx += n.width + gap
      col += 1
      if (col >= cols) {
        cx = 0
        cy += maxRowH + gap
        maxRowH = 0
        col = 0
      }
    }
    return out
  }

  if (algorithm === 'stack-vertical') {
    const gap = options.gap ?? 24
    let y = 0
    const x = 0
    for (const n of nodes) {
      out.set(n.id, { x, y })
      y += n.height + gap
    }
    return out
  }

  if (algorithm === 'stack-horizontal') {
    const gap = options.gap ?? 24
    let x = 0
    const y = 0
    for (const n of nodes) {
      out.set(n.id, { x, y })
      x += n.width + gap
    }
    return out
  }

  // dagre family
  if (algorithm.startsWith('dagre-')) {
    const dir = algorithm.split('-')[1].toUpperCase()  // TB|LR|BT|RL
    const g = new dagre.graphlib.Graph()
    g.setGraph({
      rankdir: dir,
      ranksep: options.rankSep ?? 80,
      nodesep: options.nodeSep ?? 60,
      marginx: options.padding ?? 40,
      marginy: options.padding ?? 40,
    })
    g.setDefaultEdgeLabel(() => ({}))

    for (const n of nodes) {
      g.setNode(n.id, { width: n.width, height: n.height })
    }

    // Edges from connectors + arrows that bind to nodes in the set
    for (const el of allElements) {
      if (el.type === 'connector') {
        const from = el.startBinding?.elementId
        const to = el.endBinding?.elementId
        if (from && to && idSet.has(from) && idSet.has(to)) {
          g.setEdge(from, to)
        }
      }
    }

    dagre.layout(g)

    // Translate to top-left (dagre returns center positions)
    const positions = nodes.map(n => {
      const node = g.node(n.id) as dagre.Node | undefined
      if (!node) return { id: n.id, x: n.x, y: n.y }
      return {
        id: n.id,
        x: node.x - n.width / 2,
        y: node.y - n.height / 2,
      }
    })
    // Normalize: shift so the topleft of the layout aligns to the topleft of
    // the existing selection (preserve relative anchor)
    const minX = Math.min(...positions.map(p => p.x))
    const minY = Math.min(...positions.map(p => p.y))
    // anchor: viewport / existing min
    const existing = nodes.length > 0 ? bboxFromElement(nodes[0]) : { minX: 0, minY: 0 }
    const dx = (existing.minX) - minX
    const dy = (existing.minY) - minY
    for (const p of positions) {
      out.set(p.id, { x: p.x + dx, y: p.y + dy })
    }
    return out
  }

  // ELK lazy-load placeholders (TODO: implement via elkjs)
  if (algorithm.startsWith('elk-')) {
    // Fallback to dagre-tb for now
    return autoArrange(allElements, ids, 'dagre-tb', options)
  }

  // Unknown: no-op
  return out
}
