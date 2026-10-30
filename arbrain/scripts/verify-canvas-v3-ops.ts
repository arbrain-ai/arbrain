import { applyOps } from '../src/features/draw3/ops/apply'
import type { Op } from '../src/features/draw3/ops/contract'
import { hitTestResizeEdge, pickElement, pickElementForContext } from '../src/features/draw3/canvas/hit/hit-test'
import { connectorRoutePoints, routeOrthogonalConnector } from '../src/features/draw3/canvas/renderer/connectors'
import { snapConnectorSegment, snapMovingSelection } from '../src/features/draw3/canvas/snap-guides'
import { textDocToRenderLines } from '../src/features/draw3/canvas/renderer/text'
import { setZoomAtCenter, viewportInWorld } from '../src/features/draw3/canvas/camera'
import { bboxFromElement, type CanvasElement } from '../src/features/draw3/elements/types'
import { createConnector, createFrame, createFreedraw, createHighlighter, createRectangle, createSticky, createText } from '../src/features/draw3/elements/factories'
import { renderFreedraw, renderHighlighter, FREEDRAW_THINNING } from '../src/features/draw3/canvas/renderer/freedraw'
import { freehandOutline } from '../src/features/draw3/canvas/renderer/freehand-outline'

// Path2D no existe en Node: stub minimo para poder ejercitar los renderers.
if (typeof globalThis.Path2D === 'undefined') {
  class Path2DStub {
    moveTo() {}
    quadraticCurveTo() {}
    closePath() {}
  }
  ;(globalThis as Record<string, unknown>).Path2D = Path2DStub
}

async function main() {
  const heat = createRectangle({
    x: 100,
    y: 120,
    width: 170,
    height: 76,
    strokeColor: '#ef4444',
    fillColor: '#fee2e2',
    createdBy: 'agent',
  })
  heat.id = 'heat'
  const heatLabel = createText({
    x: 116,
    y: 140,
    width: 138,
    height: 36,
    text: 'Heat source',
    containerId: 'heat',
    textColor: '#111827',
    createdBy: 'agent',
  })
  heatLabel.id = 'heat_label'
  const sink = createRectangle({
    x: 430,
    y: 120,
    width: 170,
    height: 76,
    strokeColor: '#0284c7',
    fillColor: '#e0f2fe',
    createdBy: 'agent',
  })
  sink.id = 'sink'

  const ops: Op[] = [
    { kind: 'createFrame', title: 'Thermal System', x: 40, y: 40, width: 760, height: 420, color: 'violet' },
    { kind: 'add', element: heat },
    { kind: 'add', element: heatLabel },
    {
      kind: 'update',
      id: 'heat_label',
      patch: {
        fontFamily: 'Georgia',
        fontSize: 48,
        textAlign: 'center',
        verticalAlign: 'middle',
      },
    },
    {
      kind: 'update',
      id: 'heat',
      patch: {
        strokeWidth: 6,
        strokeStyle: 'dotted',
        fillColor: null,
        opacity: 0.82,
        cornerRadius: 14,
      },
    },
    { kind: 'add', element: sink },
    { kind: 'connect', fromId: 'heat', toId: 'sink', label: 'thermal flow', routing: 'orthogonal' },
    { kind: 'insertMermaid', code: 'graph LR\n  A[Heat] --> B[Sink]', x: 100, y: 240 },
    { kind: 'insertCode', code: 'const deltaT = hot - cold', language: 'ts', x: 430, y: 240 },
    { kind: 'insertTable', rows: 2, cols: 2, x: 100, y: 540, cells: [['Metric', 'Value'], ['COP', '3.2']] },
    {
      kind: 'add',
      element: {
        id: 'embed_1',
        type: 'embed',
        x: 430,
        y: 540,
        width: 320,
        height: 180,
        rotation: 0,
        zIndex: 10,
        opacity: 1,
        locked: false,
        hidden: false,
        groupId: null,
        frameId: null,
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: 'agent',
        url: 'https://example.com',
        embedKind: 'generic',
      },
    },
    { kind: 'addComment', elementId: 'heat', body: 'Validate sensor placement' },
    { kind: 'arrange', ids: ['heat', 'sink'], algorithm: 'dagre-lr', options: { rankSep: 90, nodeSep: 70 } },
    { kind: 'setTheme', theme: 'mono' },
    { kind: 'fitView', padding: 100 },
  ]

  const { newState, result } = applyOps({
    elements: [],
    agentVersion: 0,
    theme: 'dark',
    pageName: 'Verifier',
  }, ops, 'agent')

  const types = newState.elements.map((el) => el.type)
  const frame = newState.elements.find((el) => el.type === 'frame')
  const connector = newState.elements.find((el) => el.type === 'connector')
  const styledHeat = newState.elements.find((el) => el.id === 'heat')
  const styledLabel = newState.elements.find((el) => el.id === 'heat_label')
  const defaultText = createText({ x: 0, y: 0, text: 'default' })
  const defaultSticky = createSticky({ x: 0, y: 0, text: 'default' })

  const assertions = [
    ['no op errors', result.errors.length === 0],
    ['frame created', types.includes('frame')],
    ['connector created', types.includes('connector')],
    ['connector has bindings', Boolean(connector && connector.type === 'connector' && connector.startBinding && connector.endBinding)],
    ['mermaid widget created', types.includes('mermaid')],
    ['code widget created', types.includes('code')],
    ['table widget created', types.includes('table')],
    ['embed widget created', types.includes('embed')],
    ['comment pin created', types.includes('comment')],
    ['frame has childIds array', Boolean(frame && frame.type === 'frame' && Array.isArray(frame.childIds))],
    ['theme applied', newState.theme === 'mono'],
    ['arrange moved nodes', Boolean(newState.elements.find((el) => el.id === 'heat')?.x !== 100 || newState.elements.find((el) => el.id === 'sink')?.x !== 430)],
    ['custom font family patch preserved', Boolean(styledLabel && styledLabel.type === 'text' && styledLabel.fontFamily === 'Georgia' && styledLabel.fontSize === 48)],
    ['shape style patch preserved', Boolean(styledHeat && styledHeat.type === 'rectangle' && styledHeat.strokeWidth === 6 && styledHeat.strokeStyle === 'dotted' && styledHeat.fillColor == null && styledHeat.cornerRadius === 14)],
    ['text defaults to center middle', defaultText.textAlign === 'center' && defaultText.verticalAlign === 'middle'],
    ['sticky defaults to center middle', defaultSticky.textAlign === 'center' && defaultSticky.verticalAlign === 'middle'],
  ] as const

  const failed = assertions.filter(([, pass]) => !pass)
  const geometryAssertions = verifyGeometryAndHitTesting()
  const failedGeometry = geometryAssertions.filter(([, pass]) => !pass)
  const controlAssertions = verifyCameraAndViewControls()
  const failedControls = controlAssertions.filter(([, pass]) => !pass)
  const snapAssertions = verifySnapGuides()
  const failedSnap = snapAssertions.filter(([, pass]) => !pass)
  const richTextAssertions = verifyRichTextRendering()
  const failedRichText = richTextAssertions.filter(([, pass]) => !pass)
  const undoAssertions = verifyMoveUndoSnapshots()
  const failedUndo = undoAssertions.filter(([, pass]) => !pass)
  if (failed.length > 0 || failedGeometry.length > 0 || failedControls.length > 0 || failedSnap.length > 0 || failedRichText.length > 0 || failedUndo.length > 0) {
    console.error(JSON.stringify({
      ok: false,
      failed: [
        ...failed.map(([name]) => name),
        ...failedGeometry.map(([name]) => name),
        ...failedControls.map(([name]) => name),
        ...failedSnap.map(([name]) => name),
        ...failedRichText.map(([name]) => name),
        ...failedUndo.map(([name]) => name),
      ],
      errors: result.errors,
    }, null, 2))
    process.exit(1)
  }

  console.log(JSON.stringify({
    ok: true,
    elements: newState.elements.length,
    types,
    theme: newState.theme,
    applied: result.applied.length,
    geometry: 'ok',
    controls: 'ok',
    snap: 'ok',
    richText: 'ok',
    undo: 'ok',
  }, null, 2))
}

function verifyCameraAndViewControls() {
  const viewport = { width: 1440, height: 900 }
  const camera = { x: 420, y: -120, zoom: 1 }
  const zoom1 = setZoomAtCenter(camera, 0.01, viewport)
  const zoom100 = setZoomAtCenter(camera, 1, viewport)
  const zoom2000 = setZoomAtCenter(camera, 20, viewport)
  const zoomTooSmall = setZoomAtCenter(camera, 0.001, viewport)
  const zoomTooLarge = setZoomAtCenter(camera, 50, viewport)
  const worldAt2000 = viewportInWorld(zoom2000, viewport)

  return [
    ['zoom preset 1 percent applies', close(zoom1.zoom, 0.01)],
    ['zoom preset 100 percent applies', close(zoom100.zoom, 1)],
    ['zoom preset 2000 percent applies', close(zoom2000.zoom, 20)],
    ['zoom clamps below 1 percent', close(zoomTooSmall.zoom, 0.01)],
    ['zoom clamps above 2000 percent', close(zoomTooLarge.zoom, 20)],
    ['setZoomAtCenter preserves camera center', close(zoom2000.x, camera.x) && close(zoom2000.y, camera.y)],
    ['viewportInWorld reflects high zoom', worldAt2000.width < 100 && worldAt2000.height < 60],
  ] as const
}

function close(a: number, b: number) {
  return Math.abs(a - b) < 1e-6
}

function recordRenderedFills(render: (ctx: CanvasRenderingContext2D) => void): number {
  let fills = 0
  const ctx = {
    save() {},
    restore() {},
    translate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    stroke() {},
    fill() { fills += 1 },
    setLineDash() {},
    set lineCap(_value: CanvasLineCap) {},
    set lineJoin(_value: CanvasLineJoin) {},
    set strokeStyle(_value: string | CanvasGradient | CanvasPattern) {},
    set fillStyle(_value: string | CanvasGradient | CanvasPattern) {},
    set globalAlpha(_value: number) {},
    set lineWidth(_value: number) {},
  } as unknown as CanvasRenderingContext2D
  render(ctx)
  return fills
}

/** Grosor maximo (spread en Y) del outline de una linea horizontal con presion dada. */
function outlineThickness(pressure: number): number {
  const points = Array.from({ length: 24 }, (_, i) => ({ x: i * 10, y: 0, pressure }))
  // Con presion uniforme hasRealPressure=false activaria simulatePressure; se
  // mete una variacion minima en un extremo para forzar presion real.
  points[0] = { x: 0, y: 0, pressure: Math.max(0.01, pressure - 0.05) }
  const outline = freehandOutline(points, {
    size: 12,
    thinning: FREEDRAW_THINNING,
    smoothing: 0.5,
    streamline: 0.2,
  })
  const midXMin = 60
  const midXMax = 180
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of outline) {
    if (x < midXMin || x > midXMax) continue
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return Number.isFinite(maxY - minY) ? maxY - minY : 0
}

function verifyGeometryAndHitTesting() {
  const stroke = createFreedraw({
    x: 100,
    y: 100,
    points: [
      { x: 0, y: 0, pressure: 0.08 },
      { x: 20, y: 10, pressure: 0.08 },
      { x: 46, y: 14, pressure: 1 },
      { x: 76, y: 16, pressure: 1 },
    ],
    strokeWidth: 12,
  })
  const highlighter = createHighlighter({
    x: 40,
    y: 40,
    points: [
      { x: 0, y: 0, pressure: 0.1 },
      { x: 80, y: 0, pressure: 0.1 },
      { x: 170, y: 4, pressure: 1 },
      { x: 260, y: 4, pressure: 1 },
    ],
    strokeWidth: 24,
  })
  const strokeBox = bboxFromElement(stroke)
  const highlighterBox = bboxFromElement(highlighter)
  const strokeFills = recordRenderedFills((ctx) => renderFreedraw(stroke, { ctx }))
  const highlighterFills = recordRenderedFills((ctx) => renderHighlighter(highlighter, { ctx }))
  const lowPressureThickness = outlineThickness(0.08)
  const highPressureThickness = outlineThickness(1)

  const frame = createFrame({ x: 0, y: 0, width: 400, height: 300, title: 'Frame' })
  frame.zIndex = 0
  const rect = createRectangle({ x: 80, y: 80, width: 100, height: 80 })
  rect.zIndex = 1
  const label = createText({ x: 90, y: 90, width: 80, height: 40, text: 'label', containerId: rect.id })
  label.zIndex = 5

  const a = createRectangle({ x: 0, y: 0, width: 100, height: 80 })
  const b = createRectangle({ x: 220, y: 0, width: 100, height: 80 })
  const connector = createConnector({ fromElementId: a.id, toElementId: b.id, routing: 'orthogonal' })
  connector.zIndex = 99
  connector.waypoints = [{ x: 150, y: 40 }, { x: 150, y: -50 }, { x: 220, y: -50 }]

  const shapeHit = pickElement([frame, rect, label], { x: 100, y: 100 })
  const frameInterior = pickElement([frame], { x: 200, y: 200 })
  const frameEdge = pickElement([frame], { x: 2, y: 150 })
  const rectRightResizeEdge = hitTestResizeEdge(rect, { x: rect.x + rect.width + 4, y: rect.y + rect.height / 2 }, 1)
  const rectBottomResizeEdge = hitTestResizeEdge(rect, { x: rect.x + rect.width / 2, y: rect.y + rect.height + 4 }, 1)
  const connectorHit = pickElement([a, b, connector], { x: 160, y: 40 })
  const manualRoute = connectorRoutePoints(connector, [a, b, connector])
  const contextShape = pickElementForContext([a, b, connector], { x: 50, y: 40 })
  const contextConnector = pickElementForContext([a, b, connector], { x: 160, y: 40 })
  const obstacle = createRectangle({ x: 140, y: -20, width: 120, height: 120 })
  obstacle.id = 'obstacle'
  const obstacleAwareRoute = routeOrthogonalConnector(
    { x: 100, y: 40 },
    { x: 360, y: 40 },
    [a, b, obstacle],
    a.id,
    b.id,
  )
  const obstacleBox = bboxFromElement(obstacle)
  const routeAvoidsObstacle = !pathHitsBox(obstacleAwareRoute, {
    minX: obstacleBox.minX,
    minY: obstacleBox.minY,
    maxX: obstacleBox.maxX,
    maxY: obstacleBox.maxY,
  })

  return [
    ['freedraw bbox includes stroke padding', strokeBox.width > 20 && strokeBox.height > 10],
    ['highlighter bbox includes stroke padding', highlighterBox.width > 80 && highlighterBox.height > 20],
    ['freedraw persists pressure samples', stroke.points[0].pressure === 0.08 && stroke.points[3].pressure === 1],
    ['highlighter persists pressure samples', highlighter.points[0].pressure === 0.1 && highlighter.points[3].pressure === 1],
    ['pressure widens the freehand outline', highPressureThickness > lowPressureThickness * 1.4],
    ['freedraw renderer fills an outline path', strokeFills === 1],
    ['highlighter renderer fills an outline path', highlighterFills === 1],
    ['bound text does not steal shape hit', shapeHit?.id === rect.id],
    ['frame interior does not steal clicks', frameInterior == null],
    ['frame edge selectable', frameEdge?.id === frame.id],
    ['right resize edge hit works', rectRightResizeEdge === 'e'],
    ['bottom resize edge hit works', rectBottomResizeEdge === 's'],
    ['connector path hit selectable', connectorHit?.id === connector.id],
    ['connector manual route preserves waypoints', manualRoute.some(point => point.x === 150 && point.y === -50)],
    ['context hit prefers shape over connector', contextShape?.id === a.id],
    ['context connector hit works away from shapes', contextConnector?.id === connector.id],
    ['orthogonal connector route avoids obstacle', routeAvoidsObstacle],
  ] as const
}

function verifySnapGuides() {
  const target = createRectangle({ x: 100, y: 120, width: 180, height: 80 })
  target.id = 'target'
  const moving = createRectangle({ x: 380, y: 130, width: 120, height: 80 })
  moving.id = 'moving'

  const moveSnap = snapMovingSelection({
    elements: [target, moving],
    movingIds: new Set([moving.id]),
    originals: new Map([[moving.id, { x: moving.x, y: moving.y }]]),
    dx: 0,
    dy: -4,
    zoom: 1,
    thresholdPx: 6,
  })

  const segmentSnap = snapConnectorSegment({
    elements: [target, moving],
    connectorId: 'connector',
    route: [{ x: 40, y: 196 }, { x: 540, y: 196 }],
    segmentIndex: 0,
    axis: 'y',
    value: 196,
    zoom: 1,
    thresholdPx: 6,
  })

  return [
    ['moving selection snaps to object edge', close(moveSnap.dy, -10)],
    ['moving selection emits horizontal guide', moveSnap.guides.some(guide => guide.axis === 'y' && close(guide.value, 120))],
    ['connector segment snaps to component bottom edge', close(segmentSnap.value, 200)],
    ['connector segment emits horizontal guide', segmentSnap.guides.some(guide => guide.axis === 'y' && close(guide.value, 200))],
  ] as const
}

function verifyRichTextRendering() {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet item' }] }] },
        ],
      },
      {
        type: 'orderedList',
        attrs: { start: 3 },
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Number item' }] }] },
        ],
      },
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unchecked' }] }] },
          { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Checked' }] }] },
        ],
      },
    ],
  } as const

  const lines = textDocToRenderLines(doc)
  return [
    ['bullet list render line preserved', lines.some(line => line.text === 'Bullet item' && line.marker?.kind === 'bullet')],
    ['ordered list render line preserved', lines.some(line => line.text === 'Number item' && line.marker?.kind === 'ordered' && line.marker.label === '3.')],
    ['unchecked task render line preserved', lines.some(line => line.text === 'Unchecked' && line.marker?.kind === 'task' && line.marker.checked === false)],
    ['checked task render line preserved', lines.some(line => line.text === 'Checked' && line.marker?.kind === 'task' && line.marker.checked === true)],
  ] as const
}

function verifyMoveUndoSnapshots() {
  const shape = createRectangle({ x: 40, y: 60, width: 160, height: 80 })
  shape.id = 'move_shape'
  const label = createText({
    x: 56,
    y: 80,
    width: 128,
    height: 40,
    text: 'Inside',
    containerId: shape.id,
  })
  label.id = 'move_label'
  const connector = createConnector({ fromElementId: shape.id, toElementId: 'target', routing: 'orthogonal' })
  connector.id = 'move_connector'
  connector.x = 12
  connector.y = 24
  connector.waypoints = [{ x: 80, y: 120 }, { x: 140, y: 120 }]

  const forward: Op[] = [
    { kind: 'update', id: shape.id, patch: { x: 100, y: 130 } },
    { kind: 'update', id: label.id, patch: { x: 116, y: 150 } },
    { kind: 'update', id: connector.id, patch: { x: 72, y: 94, waypoints: [{ x: 140, y: 190 }, { x: 200, y: 190 }] } as Partial<CanvasElement> & { type?: never } },
  ]
  const reverse: Op[] = [
    { kind: 'update', id: shape.id, patch: { x: shape.x, y: shape.y } },
    { kind: 'update', id: label.id, patch: { x: label.x, y: label.y } },
    { kind: 'update', id: connector.id, patch: { x: connector.x, y: connector.y, waypoints: connector.waypoints.map(point => ({ ...point })) } as Partial<CanvasElement> & { type?: never } },
  ]

  const moved = applyOps({ elements: [shape, label, connector], agentVersion: 0 }, forward)
  const undone = applyOps(moved.newState, reverse)
  const restoredShape = undone.newState.elements.find(el => el.id === shape.id)
  const restoredLabel = undone.newState.elements.find(el => el.id === label.id)
  const restoredConnector = undone.newState.elements.find(el => el.id === connector.id)

  return [
    ['move undo restores shape position', restoredShape?.x === shape.x && restoredShape?.y === shape.y],
    ['move undo restores bound text position', restoredLabel?.x === label.x && restoredLabel?.y === label.y],
    ['move undo restores connector waypoints', Boolean(restoredConnector?.type === 'connector' && restoredConnector.waypoints?.[0]?.x === 80 && restoredConnector.waypoints?.[1]?.y === 120)],
  ] as const
}

function pathHitsBox(path: Array<{ x: number; y: number }>, box: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  for (let i = 1; i < path.length; i++) {
    if (segmentHitsBox(path[i - 1], path[i], box)) return true
  }
  return false
}

function segmentHitsBox(
  a: { x: number; y: number },
  b: { x: number; y: number },
  box: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  if (a.x === b.x) {
    if (a.x < box.minX || a.x > box.maxX) return false
    return Math.max(a.y, b.y) >= box.minY && Math.min(a.y, b.y) <= box.maxY
  }
  if (a.y === b.y) {
    if (a.y < box.minY || a.y > box.maxY) return false
    return Math.max(a.x, b.x) >= box.minX && Math.min(a.x, b.x) <= box.maxX
  }
  return segmentHitsBox(a, { x: b.x, y: a.y }, box) || segmentHitsBox({ x: b.x, y: a.y }, b, box)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
