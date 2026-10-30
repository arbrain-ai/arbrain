/**
 * Geometria de figuras para conexiones estilo Miro.
 *
 * El objetivo: que las flechas/conectores se peguen al CONTORNO REAL de cada
 * figura (las aristas del triangulo, la circunferencia del ovalo, los vertices
 * del rombo) en vez del bounding box cuadrado. La primitiva central es
 * `perimeterPointToward(el, target)`: devuelve el punto donde el rayo que sale
 * del centro de la figura hacia `target` cruza el outline real.
 *
 * Todo se calcula en coordenadas de MUNDO, aplicando rotacion + flip espejo.
 */
import type { CanvasElement } from '../elements/types'
import { bboxFromElement } from '../elements/types'

export type Pt = { x: number; y: number }

/** Tipos de figura que tienen un outline poligonal/eliptico propio (no rectangular). */
const SHAPE_TYPES = new Set([
  'rectangle', 'ellipse', 'diamond', 'triangle', 'chevron', 'star', 'polygon',
  'sticky', 'text', 'image', 'frame',
])

export function elementCenter(el: CanvasElement): Pt {
  const b = bboxFromElement(el)
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

/** Outline de la figura en coords de mundo (rotacion + flip aplicados). */
function shapeOutline(el: CanvasElement): Pt[] {
  const local = localOutline(el)
  return local.map(p => toWorld(el, p))
}

/**
 * Punto del contorno REAL sobre el rayo centro -> target.
 * Si el target esta dentro o no hay interseccion, cae al centro.
 */
export function perimeterPointToward(el: CanvasElement, target: Pt): Pt {
  const c = elementCenter(el)
  const outline = shapeOutline(el)
  const hit = rayPolygonHit(c, target, outline)
  return hit ?? c
}

/**
 * Puntos de conexion sobre el contorno real (para los dots del magnet estilo
 * Miro): cardinales + vertices/midpoints. Cada uno trae el `anchor` direccional
 * mas cercano para mantener compatibilidad con el quick-create de 4 lados.
 */
function shapeConnectionAnchors(
  el: CanvasElement,
): Array<{ point: Pt; cardinal: 'top' | 'right' | 'bottom' | 'left' }> {
  const c = elementCenter(el)
  const b = bboxFromElement(el)
  const reach = Math.max(b.width, b.height) * 4 + 64
  // Cardinales: rayo desde el centro en las 4 direcciones, recortado al contorno real.
  const dirs: Array<{ cardinal: 'top' | 'right' | 'bottom' | 'left'; d: Pt }> = [
    { cardinal: 'top', d: { x: c.x, y: c.y - reach } },
    { cardinal: 'right', d: { x: c.x + reach, y: c.y } },
    { cardinal: 'bottom', d: { x: c.x, y: c.y + reach } },
    { cardinal: 'left', d: { x: c.x - reach, y: c.y } },
  ]
  const outline = shapeOutline(el)
  const result: Array<{ point: Pt; cardinal: 'top' | 'right' | 'bottom' | 'left' }> = []
  for (const { cardinal, d } of dirs) {
    const hit = rayPolygonHit(c, d, outline)
    result.push({ point: hit ?? c, cardinal })
  }
  return result
}

/** Punto cardinal sobre el contorno real (top/right/bottom/left). */
export function outlineCardinalPoint(
  el: CanvasElement,
  cardinal: 'top' | 'right' | 'bottom' | 'left',
): Pt {
  const c = elementCenter(el)
  const b = bboxFromElement(el)
  const reach = Math.max(b.width, b.height) * 4 + 64
  const target =
    cardinal === 'top' ? { x: c.x, y: c.y - reach } :
    cardinal === 'right' ? { x: c.x + reach, y: c.y } :
    cardinal === 'bottom' ? { x: c.x, y: c.y + reach } :
    { x: c.x - reach, y: c.y }
  return rayPolygonHit(c, target, shapeOutline(el)) ?? c
}

function hasShapeOutline(el: CanvasElement): boolean {
  return SHAPE_TYPES.has(el.type)
}

// --- internals -------------------------------------------------------------

function localOutline(el: CanvasElement): Pt[] {
  const b = bboxFromElement(el)
  const { minX: x, minY: y, width: w, height: h } = b
  const cx = x + w / 2
  const cy = y + h / 2
  switch (el.type) {
    case 'triangle':
      return [{ x: cx, y }, { x: x + w, y: y + h }, { x, y: y + h }]
    case 'diamond':
      return [{ x: cx, y }, { x: x + w, y: cy }, { x: cx, y: y + h }, { x, y: cy }]
    case 'chevron': {
      const e = el as Extract<CanvasElement, { type: 'chevron' }>
      const notch = clamp(e.notchRatio ?? 0.16, 0, 0.45) * w
      const point = clamp(e.pointRatio ?? 0.84, 0.45, 1) * w
      return [
        { x, y }, { x: x + point, y }, { x: x + w, y: cy },
        { x: x + point, y: y + h }, { x, y: y + h }, { x: x + notch, y: cy },
      ]
    }
    case 'star':
      return starOutline(cx, cy, w / 2, h / 2, (el as Extract<CanvasElement, { type: 'star' }>).points ?? 5)
    case 'polygon':
      return regularPolygon(cx, cy, w / 2, h / 2, (el as Extract<CanvasElement, { type: 'polygon' }>).sides ?? 6)
    case 'ellipse':
      return ellipseOutline(cx, cy, w / 2, h / 2, 48)
    default:
      // rectangulo / sticky / text / image / frame / fallback -> caja
      return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
  }
}

function toWorld(el: CanvasElement, p: Pt): Pt {
  const sx = el.flipX ? -1 : 1
  const sy = el.flipY ? -1 : 1
  const rot = el.rotation || 0
  if (!rot && sx === 1 && sy === 1) return p
  const b = bboxFromElement(el)
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  let dx = (p.x - cx) * sx
  let dy = (p.y - cy) * sy
  if (rot) {
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    const rx = dx * cos - dy * sin
    const ry = dx * sin + dy * cos
    dx = rx
    dy = ry
  }
  return { x: cx + dx, y: cy + dy }
}

function ellipseOutline(cx: number, cy: number, rx: number, ry: number, segments: number): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry })
  }
  return pts
}

function regularPolygon(cx: number, cy: number, rx: number, ry: number, sides: number): Pt[] {
  const n = Math.max(3, sides)
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry })
  }
  return pts
}

function starOutline(cx: number, cy: number, rx: number, ry: number, points: number): Pt[] {
  const n = Math.max(3, points)
  const pts: Pt[] = []
  for (let i = 0; i < n * 2; i++) {
    const outer = i % 2 === 0
    const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2
    const fx = outer ? 1 : 0.42
    const fy = outer ? 1 : 0.42
    pts.push({ x: cx + Math.cos(a) * rx * fx, y: cy + Math.sin(a) * ry * fy })
  }
  return pts
}

/** Interseccion del segmento centro->target con el poligono; la mas lejana del centro. */
function rayPolygonHit(center: Pt, target: Pt, polygon: Pt[]): Pt | null {
  if (polygon.length < 2) return null
  let best: Pt | null = null
  let bestT = -1
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const hit = segmentIntersect(center, target, a, b)
    if (hit && hit.t > bestT) {
      bestT = hit.t
      best = hit.point
    }
  }
  return best
}

/** Interseccion de p1->p2 con a->b. Devuelve t a lo largo de p1->p2 (0..1+) y el punto. */
function segmentIntersect(p1: Pt, p2: Pt, a: Pt, b: Pt): { point: Pt; t: number } | null {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y }
  const s = { x: b.x - a.x, y: b.y - a.y }
  const denom = r.x * s.y - r.y * s.x
  if (Math.abs(denom) < 1e-9) return null
  const qp = { x: a.x - p1.x, y: a.y - p1.y }
  const t = (qp.x * s.y - qp.y * s.x) / denom
  const u = (qp.x * r.y - qp.y * r.x) / denom
  // El rayo puede extenderse mas alla de target (t hasta 4x via reach), pero u debe caer en la arista.
  if (t < 0 || u < 0 || u > 1) return null
  return { point: { x: p1.x + r.x * t, y: p1.y + r.y * t }, t }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
