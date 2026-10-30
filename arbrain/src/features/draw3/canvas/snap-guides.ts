import { bboxFromElement, bboxUnion, type BBox, type CanvasElement, type ElementId } from '../elements/types'

export type SnapAxis = 'x' | 'y'
type SnapGuideKind = 'edge' | 'center'

export type SnapGuide = {
  axis: SnapAxis
  value: number
  from: number
  to: number
  kind: SnapGuideKind
  sourceId?: ElementId
  targetId?: ElementId
}

type Point = { x: number; y: number }

type SnapAnchor = {
  axis: SnapAxis
  value: number
  rangeStart: number
  rangeEnd: number
  kind: SnapGuideKind
  elementId?: ElementId
}

type AxisMatch = {
  delta: number
  distance: number
  moving: SnapAnchor
  target: SnapAnchor
}

const GUIDE_PADDING = 18

export function snapMovingSelection(options: {
  elements: CanvasElement[]
  movingIds: Set<ElementId>
  originals: ReadonlyMap<ElementId, { x: number; y: number }>
  dx: number
  dy: number
  zoom: number
  thresholdPx: number
}): { dx: number; dy: number; guides: SnapGuide[] } {
  const threshold = worldThreshold(options.thresholdPx, options.zoom)
  const movingBox = movingSelectionBox(options.elements, options.movingIds, options.originals, options.dx, options.dy)
  if (!movingBox) return { dx: options.dx, dy: options.dy, guides: [] }

  const targets = snapAnchorsForElements(options.elements, options.movingIds)
  if (targets.length === 0) return { dx: options.dx, dy: options.dy, guides: [] }

  const movingAnchors = snapAnchorsForBox(movingBox)
  const xMatch = bestAxisMatch(movingAnchors, targets, 'x', threshold)
  const yMatch = bestAxisMatch(movingAnchors, targets, 'y', threshold)
  const snappedDx = options.dx + (xMatch?.delta ?? 0)
  const snappedDy = options.dy + (yMatch?.delta ?? 0)
  const finalBox = translateBox(movingBox, xMatch?.delta ?? 0, yMatch?.delta ?? 0)
  const finalAnchors = snapAnchorsForBox(finalBox)
  const guides = [
    ...guidesForAxisMatch(xMatch, finalAnchors, targets, 'x'),
    ...guidesForAxisMatch(yMatch, finalAnchors, targets, 'y'),
  ]

  return { dx: snappedDx, dy: snappedDy, guides }
}

export function snapConnectorSegment(options: {
  elements: CanvasElement[]
  connectorId: ElementId
  route: Point[]
  segmentIndex: number
  axis: SnapAxis
  value: number
  zoom: number
  thresholdPx: number
}): { value: number; guides: SnapGuide[] } {
  const a = options.route[options.segmentIndex]
  const b = options.route[options.segmentIndex + 1]
  if (!a || !b) return { value: options.value, guides: [] }

  const targets = snapAnchorsForElements(options.elements, new Set([options.connectorId]))
    .filter(anchor => anchor.axis === options.axis)
  if (targets.length === 0) return { value: options.value, guides: [] }

  const threshold = worldThreshold(options.thresholdPx, options.zoom)
  let best: SnapAnchor | null = null
  let bestDistance = Infinity

  for (const target of targets) {
    const distance = Math.abs(target.value - options.value)
    if (distance <= threshold && distance < bestDistance) {
      best = target
      bestDistance = distance
    }
  }

  if (!best) return { value: options.value, guides: [] }

  const segmentRange = options.axis === 'x'
    ? normalizeRange(a.y, b.y)
    : normalizeRange(a.x, b.x)
  const guide = guideFromRanges({
    axis: options.axis,
    value: best.value,
    movingRangeStart: segmentRange.start,
    movingRangeEnd: segmentRange.end,
    targetRangeStart: best.rangeStart,
    targetRangeEnd: best.rangeEnd,
    kind: best.kind,
    targetId: best.elementId,
    sourceId: options.connectorId,
  })

  return { value: best.value, guides: [guide] }
}

function movingSelectionBox(
  elements: CanvasElement[],
  movingIds: Set<ElementId>,
  originals: ReadonlyMap<ElementId, { x: number; y: number }>,
  dx: number,
  dy: number,
): BBox | null {
  const boxes = elements
    .filter(el => movingIds.has(el.id) && isSnapElement(el))
    .map((el) => {
      const origin = originals.get(el.id)
      if (!origin) return null
      const box = bboxFromElement(el)
      return translateBox(box, origin.x + dx - el.x, origin.y + dy - el.y)
    })
    .filter((box): box is BBox => box != null)

  return bboxUnion(boxes)
}

function snapAnchorsForElements(elements: CanvasElement[], excludedIds: Set<ElementId>): SnapAnchor[] {
  const anchors: SnapAnchor[] = []
  for (const element of elements) {
    if (!isSnapElement(element)) continue
    if (excludedIds.has(element.id)) continue
    if (element.groupId && excludedIds.has(element.groupId)) continue
    if (element.type === 'text' && element.containerId && excludedIds.has(element.containerId)) continue
    anchors.push(...snapAnchorsForBox(bboxFromElement(element), element.id))
  }
  return anchors
}

function snapAnchorsForBox(box: BBox, elementId?: ElementId): SnapAnchor[] {
  const centerX = (box.minX + box.maxX) / 2
  const centerY = (box.minY + box.maxY) / 2
  return [
    { axis: 'x', value: box.minX, rangeStart: box.minY, rangeEnd: box.maxY, kind: 'edge', elementId },
    { axis: 'x', value: centerX, rangeStart: box.minY, rangeEnd: box.maxY, kind: 'center', elementId },
    { axis: 'x', value: box.maxX, rangeStart: box.minY, rangeEnd: box.maxY, kind: 'edge', elementId },
    { axis: 'y', value: box.minY, rangeStart: box.minX, rangeEnd: box.maxX, kind: 'edge', elementId },
    { axis: 'y', value: centerY, rangeStart: box.minX, rangeEnd: box.maxX, kind: 'center', elementId },
    { axis: 'y', value: box.maxY, rangeStart: box.minX, rangeEnd: box.maxX, kind: 'edge', elementId },
  ]
}

function bestAxisMatch(
  movingAnchors: SnapAnchor[],
  targetAnchors: SnapAnchor[],
  axis: SnapAxis,
  threshold: number,
): AxisMatch | null {
  let best: AxisMatch | null = null

  for (const moving of movingAnchors) {
    if (moving.axis !== axis) continue
    for (const target of targetAnchors) {
      if (target.axis !== axis) continue
      const delta = target.value - moving.value
      const distance = Math.abs(delta)
      if (distance <= threshold && (!best || distance < best.distance || (
        distance === best.distance && guidePriority(moving, target) > guidePriority(best.moving, best.target)
      ))) {
        best = { delta, distance, moving, target }
      }
    }
  }

  return best
}

function guidesForAxisMatch(
  match: AxisMatch | null,
  finalMovingAnchors: SnapAnchor[],
  targetAnchors: SnapAnchor[],
  axis: SnapAxis,
): SnapGuide[] {
  if (!match) return []
  const guides: SnapGuide[] = []
  const seen = new Set<string>()

  for (const moving of finalMovingAnchors) {
    if (moving.axis !== axis) continue
    for (const target of targetAnchors) {
      if (target.axis !== axis || !almostEqual(moving.value, target.value)) continue
      const kind = target.kind === 'center' || moving.kind === 'center' ? 'center' : 'edge'
      const guide = guideFromRanges({
        axis,
        value: target.value,
        movingRangeStart: moving.rangeStart,
        movingRangeEnd: moving.rangeEnd,
        targetRangeStart: target.rangeStart,
        targetRangeEnd: target.rangeEnd,
        kind,
        targetId: target.elementId,
        sourceId: moving.elementId,
      })
      const key = `${guide.axis}:${guide.value.toFixed(2)}:${guide.kind}:${guide.from.toFixed(2)}:${guide.to.toFixed(2)}`
      if (seen.has(key)) continue
      seen.add(key)
      guides.push(guide)
    }
  }

  return guides.sort((a, b) => guideKindRank(a.kind) - guideKindRank(b.kind))
}

function guideFromRanges(options: {
  axis: SnapAxis
  value: number
  movingRangeStart: number
  movingRangeEnd: number
  targetRangeStart: number
  targetRangeEnd: number
  kind: SnapGuideKind
  sourceId?: ElementId
  targetId?: ElementId
}): SnapGuide {
  const from = Math.min(options.movingRangeStart, options.movingRangeEnd, options.targetRangeStart, options.targetRangeEnd) - GUIDE_PADDING
  const to = Math.max(options.movingRangeStart, options.movingRangeEnd, options.targetRangeStart, options.targetRangeEnd) + GUIDE_PADDING
  return {
    axis: options.axis,
    value: options.value,
    from,
    to,
    kind: options.kind,
    sourceId: options.sourceId,
    targetId: options.targetId,
  }
}

function isSnapElement(element: CanvasElement): boolean {
  if (element.hidden) return false
  if (element.type === 'text' && element.containerId != null) return false
  switch (element.type) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'triangle':
    case 'chevron':
    case 'star':
    case 'polygon':
    case 'text':
    case 'sticky':
    case 'image':
    case 'embed':
    case 'comment':
    case 'mermaid':
    case 'code':
    case 'table':
    case 'frame':
      return true
    default:
      return false
  }
}

function translateBox(box: BBox, dx: number, dy: number): BBox {
  return {
    minX: box.minX + dx,
    minY: box.minY + dy,
    maxX: box.maxX + dx,
    maxY: box.maxY + dy,
    width: box.width,
    height: box.height,
  }
}

function normalizeRange(a: number, b: number) {
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

function worldThreshold(thresholdPx: number, zoom: number) {
  return Math.max(1, thresholdPx) / Math.max(zoom || 1, 0.01)
}

function guidePriority(moving: SnapAnchor, target: SnapAnchor) {
  if (moving.kind === 'center' && target.kind === 'center') return 3
  if (moving.kind === target.kind) return 2
  return 1
}

function guideKindRank(kind: SnapGuideKind) {
  return kind === 'edge' ? 0 : 1
}

function almostEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.01
}
