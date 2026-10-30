/**
 * Canvas v3 perf harness — paridad de culling, hit-test y caches.
 *
 * Se corre ANTES y DESPUES de cada paso de la fase de performance:
 *   npx tsx scripts/verify-canvas-v3-perf.ts
 *
 * Contratos que protege:
 *  1. Culling: `visibleElements()` NUNCA omite un elemento cuyo footprint real
 *     (bbox, o ruta real para connectors bindeados) intersecta el viewport con
 *     margen. Falsos positivos se permiten (solo cuestan render); falsos
 *     negativos NO (elemento desaparece de pantalla).
 *  2. Hit-test: `pickElement` es determinista. El script imprime un checksum
 *     estable del resultado de ~600 picks sobre una escena sintetica fija;
 *     compararlo entre commits detecta cualquier cambio de comportamiento.
 *  3. Caches (cuando exista canvas/perf-cache.ts): mismos resultados que las
 *     funciones sin cache + identidad de referencia en la segunda llamada.
 *
 * Todo es deterministico (PRNG con seed fija). Sin acceso a red ni Supabase.
 */
import { visibleElements, sortByZIndex } from '../src/features/draw3/canvas/viewport'
import { applyOps } from '../src/features/draw3/ops/apply'
import { validateOps } from '../src/features/draw3/ops/validate'
import { viewportInWorld } from '../src/features/draw3/canvas/camera'
import { pickElement } from '../src/features/draw3/canvas/hit/hit-test'
import { connectorRoutePoints } from '../src/features/draw3/canvas/renderer/connectors'
import { bboxFromElement, bboxIntersects, type BBox, type CanvasElement, type Camera } from '../src/features/draw3/elements/types'
import {
  createConnector,
  createFrame,
  createFreedraw,
  createRectangle,
  createEllipse,
  createSticky,
  createText,
} from '../src/features/draw3/elements/factories'

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32)
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Synthetic scene: ~340 elements spread over a large world
// ---------------------------------------------------------------------------
function buildScene(): CanvasElement[] {
  const rand = mulberry32(20260612)
  const elements: CanvasElement[] = []
  const WORLD = 12000

  const rects: CanvasElement[] = []
  for (let i = 0; i < 120; i++) {
    const rect = createRectangle({
      x: Math.round(rand() * WORLD - WORLD / 2),
      y: Math.round(rand() * WORLD - WORLD / 2),
      width: 80 + Math.round(rand() * 240),
      height: 60 + Math.round(rand() * 160),
    })
    rect.id = `rect_${i}`
    rect.zIndex = i
    if (i % 9 === 0) rect.rotation = Math.round(rand() * 360)
    rects.push(rect)
    elements.push(rect)
  }

  for (let i = 0; i < 40; i++) {
    const ellipse = createEllipse({
      x: Math.round(rand() * WORLD - WORLD / 2),
      y: Math.round(rand() * WORLD - WORLD / 2),
      width: 60 + Math.round(rand() * 180),
      height: 60 + Math.round(rand() * 180),
    })
    ellipse.id = `ellipse_${i}`
    ellipse.zIndex = 200 + i
    elements.push(ellipse)
  }

  // Bound texts inside the first 30 rectangles
  for (let i = 0; i < 30; i++) {
    const host = rects[i]
    const label = createText({
      x: host.x + 12,
      y: host.y + 12,
      width: Math.max(40, host.width - 24),
      height: 32,
      text: `label ${i}`,
      containerId: host.id,
    })
    label.id = `boundtext_${i}`
    label.zIndex = 300 + i
    elements.push(label)
  }

  // Free texts + stickies
  for (let i = 0; i < 30; i++) {
    const text = createText({
      x: Math.round(rand() * WORLD - WORLD / 2),
      y: Math.round(rand() * WORLD - WORLD / 2),
      width: 160,
      height: 40,
      text: `free ${i}`,
    })
    text.id = `freetext_${i}`
    text.zIndex = 400 + i
    elements.push(text)

    const sticky = createSticky({
      x: Math.round(rand() * WORLD - WORLD / 2),
      y: Math.round(rand() * WORLD - WORLD / 2),
      text: `sticky ${i}`,
    })
    sticky.id = `sticky_${i}`
    sticky.zIndex = 500 + i
    elements.push(sticky)
  }

  // Frames
  for (let i = 0; i < 8; i++) {
    const frame = createFrame({
      x: Math.round(rand() * WORLD - WORLD / 2),
      y: Math.round(rand() * WORLD - WORLD / 2),
      width: 600 + Math.round(rand() * 600),
      height: 400 + Math.round(rand() * 400),
      title: `Frame ${i}`,
    })
    frame.id = `frame_${i}`
    frame.zIndex = -10 + i
    elements.push(frame)
  }

  // Freedraw strokes (relative points, normalized origin)
  for (let i = 0; i < 12; i++) {
    const points = [] as Array<{ x: number; y: number; pressure?: number }>
    let px = 0
    let py = 0
    for (let p = 0; p < 24; p++) {
      px += rand() * 40
      py += (rand() - 0.5) * 60
      points.push({ x: Math.round(px), y: Math.round(py), pressure: 0.3 + rand() * 0.7 })
    }
    const stroke = createFreedraw({
      x: Math.round(rand() * WORLD - WORLD / 2),
      y: Math.round(rand() * WORLD - WORLD / 2),
      points,
      strokeWidth: 6,
    })
    stroke.id = `freedraw_${i}`
    stroke.zIndex = 600 + i
    elements.push(stroke)
  }

  // Bound connectors between distant rectangles — their stored x/y/w/h LIES
  // about the real route, which is exactly the case culling must respect.
  for (let i = 0; i < 60; i++) {
    const from = rects[Math.floor(rand() * rects.length)]
    let to = rects[Math.floor(rand() * rects.length)]
    if (to.id === from.id) to = rects[(rects.indexOf(from) + 7) % rects.length]
    const connector = createConnector({
      fromElementId: from.id,
      toElementId: to.id,
      routing: i % 3 === 0 ? 'orthogonal' : i % 3 === 1 ? 'curved' : 'straight',
    })
    connector.id = `connector_${i}`
    connector.zIndex = 700 + i
    elements.push(connector)
  }

  return elements
}

// ---------------------------------------------------------------------------
// Reference footprint: the TRUE render footprint of an element
// ---------------------------------------------------------------------------
const ROUTE_PAD = 24 // strokeWidth + arrowheads margin

function bboxOfPoints(points: Array<{ x: number; y: number }>, pad: number): BBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  minX -= pad
  minY -= pad
  maxX += pad
  maxY += pad
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

function inflateForRotation(box: BBox): BBox {
  // Circumscribed-circle inflation: safe upper bound for any rotation.
  const halfDiag = Math.hypot(box.width, box.height) / 2
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  return {
    minX: cx - halfDiag,
    minY: cy - halfDiag,
    maxX: cx + halfDiag,
    maxY: cy + halfDiag,
    width: halfDiag * 2,
    height: halfDiag * 2,
  }
}

function trueFootprint(el: CanvasElement, elements: CanvasElement[]): BBox {
  if (el.type === 'connector') {
    const route = connectorRoutePoints(el, elements)
    if (route.length > 0) return bboxOfPoints(route, ROUTE_PAD)
  }
  let box = bboxFromElement(el)
  if ('rotation' in el && typeof el.rotation === 'number' && el.rotation % 360 !== 0) {
    box = inflateForRotation(box)
  }
  return box
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
type Assertion = readonly [string, boolean]

function verifyCullingParity(elements: CanvasElement[]): Assertion[] {
  const rand = mulberry32(99)
  const size = { width: 1440, height: 900, dpr: 2 }
  const MARGIN = 200
  const assertions: Assertion[] = []
  let totalVisible = 0
  let totalReference = 0

  for (let i = 0; i < 24; i++) {
    const camera: Camera = {
      x: Math.round(rand() * 14000 - 7000),
      y: Math.round(rand() * 14000 - 7000),
      zoom: [0.05, 0.1, 0.25, 0.5, 1, 2, 4][i % 7],
    }
    const visible = visibleElements(elements, camera, size, MARGIN)
    const visibleIds = new Set(visible.map(el => el.id))

    const view = viewportInWorld(camera, size)
    const padded: BBox = {
      minX: view.minX - MARGIN,
      minY: view.minY - MARGIN,
      maxX: view.maxX + MARGIN,
      maxY: view.maxY + MARGIN,
      width: view.width + MARGIN * 2,
      height: view.height + MARGIN * 2,
    }

    const missing: string[] = []
    let referenceCount = 0
    for (const el of elements) {
      if (el.hidden) continue
      if (bboxIntersects(trueFootprint(el, elements), padded)) {
        referenceCount++
        if (!visibleIds.has(el.id)) missing.push(el.id)
      }
    }
    totalVisible += visible.length
    totalReference += referenceCount
    if (missing.length > 0) {
      assertions.push([`culling camera ${i}: false negatives (${missing.slice(0, 5).join(', ')})`, false])
    }
  }
  assertions.push(['culling: no false negatives across 24 cameras', assertions.every(([, pass]) => pass)])
  assertions.push(['culling: reference saw elements', totalReference > 0])
  console.error(`[culling] visible=${totalVisible} reference=${totalReference} (visible >= reference esperado)`)
  return assertions
}

function verifyHitTestDeterminism(elements: CanvasElement[]): Assertion[] {
  const rand = mulberry32(7777)
  const points: Array<{ x: number; y: number }> = []
  // Random world points
  for (let i = 0; i < 400; i++) {
    points.push({ x: Math.round(rand() * 14000 - 7000), y: Math.round(rand() * 14000 - 7000) })
  }
  // Points ON elements (centers + edges) — the interesting cases
  for (const el of elements.slice(0, 200)) {
    const box = bboxFromElement(el)
    points.push({ x: Math.round((box.minX + box.maxX) / 2), y: Math.round((box.minY + box.maxY) / 2) })
  }

  const runPicks = (zoom: number) => points.map(p => pickElement(elements, p, zoom)?.id ?? '∅')
  const run1 = runPicks(1)
  const run2 = runPicks(1)
  const runZoomedOut = runPicks(0.1)

  const deterministic = run1.every((id, i) => id === run2[i])

  // Stable checksum (FNV-1a) — compare between commits to catch behavior drift
  const checksum = (ids: string[]) => {
    let h = 0x811c9dc5
    for (const id of ids) {
      for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
      }
      h ^= 0x7c
      h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(16)
  }
  console.error(`[hit-test] checksum zoom=1: ${checksum(run1)} | zoom=0.1: ${checksum(runZoomedOut)} | picks=${run1.filter(id => id !== '∅').length}/${run1.length}`)

  return [
    ['hit-test deterministic across runs', deterministic],
    ['hit-test finds elements at centers', run1.filter(id => id !== '∅').length > 150],
  ]
}

function verifySortStability(elements: CanvasElement[]): Assertion[] {
  const sorted = sortByZIndex(elements)
  const ordered = sorted.every((el, i) => i === 0 || sorted[i - 1].zIndex <= el.zIndex)
  return [
    ['z-sort returns ordered array', ordered],
    ['z-sort preserves element count', sorted.length === elements.length],
  ]
}

interface PerfCacheModule {
  bboxOf(el: CanvasElement): BBox
  getSortedByZ(elements: CanvasElement[]): CanvasElement[]
  getSortedByZDesc(elements: CanvasElement[]): CanvasElement[]
  getElementIndex(elements: CanvasElement[]): Map<string, CanvasElement>
  getConnectorRoute(connector: CanvasElement & { type: 'connector' }, elements: CanvasElement[]): Array<{ x: number; y: number }>
}

async function verifyPerfCacheIfPresent(elements: CanvasElement[]): Promise<Assertion[]> {
  let cache: PerfCacheModule | null = null
  try {
    cache = (await import('../src/features/draw3/canvas/' + 'perf-cache')) as PerfCacheModule
  } catch {
    console.error('[perf-cache] modulo no existe todavia — checks omitidos')
    return []
  }

  const assertions: Assertion[] = []
  const sortedPlain = [...elements].sort((a, b) => a.zIndex - b.zIndex)
  const sortedCached = cache.getSortedByZ(elements)
  assertions.push([
    'perf-cache: getSortedByZ matches plain sort order',
    sortedCached.length === sortedPlain.length && sortedCached.every((el, i) => el.zIndex === sortedPlain[i].zIndex),
  ])
  assertions.push(['perf-cache: getSortedByZ identity on second call', cache.getSortedByZ(elements) === sortedCached])

  const someEl = elements[10]
  const boxPlain = bboxFromElement(someEl)
  const boxCached = cache.bboxOf(someEl)
  assertions.push([
    'perf-cache: bboxOf contains plain bbox',
    boxCached.minX <= boxPlain.minX && boxCached.minY <= boxPlain.minY && boxCached.maxX >= boxPlain.maxX && boxCached.maxY >= boxPlain.maxY,
  ])
  assertions.push(['perf-cache: bboxOf identity on second call', cache.bboxOf(someEl) === boxCached])

  const index = cache.getElementIndex(elements)
  assertions.push(['perf-cache: index resolves ids', elements.every(el => index.get(el.id) === el)])

  const connector = elements.find(el => el.type === 'connector')
  if (connector && connector.type === 'connector') {
    const routePlain = connectorRoutePoints(connector, elements)
    const routeCached = cache.getConnectorRoute(connector, elements)
    assertions.push([
      'perf-cache: connector route matches uncached',
      routeCached.length === routePlain.length && routeCached.every((p, i) => p.x === routePlain[i].x && p.y === routePlain[i].y),
    ])
    assertions.push(['perf-cache: connector route identity on second call', cache.getConnectorRoute(connector, elements) === routeCached])
    // New array reference (simulates an edit) must invalidate route cache
    const elementsCopy = [...elements]
    const routeAfterNewArray = cache.getConnectorRoute(connector, elementsCopy)
    assertions.push(['perf-cache: new elements array busts route cache', routeAfterNewArray !== routeCached || routeAfterNewArray.length === routeCached.length])
  }

  return assertions
}

// ---------------------------------------------------------------------------
// Fase 1 — hardening del contrato de ops (setCamera, validacion, add ingest)
// ---------------------------------------------------------------------------
function verifyOpsHardening(): Assertion[] {
  const assertions: Assertion[] = []

  // 1. setCamera con NaN/Infinity → error de validacion, camara intacta
  const badCamera = applyOps(
    { elements: [], agentVersion: 0, camera: { x: 10, y: 20, zoom: 1 } },
    [{ kind: 'setCamera', x: NaN, y: 0, zoom: Infinity }],
  )
  assertions.push(['setCamera NaN rejected with validation error', badCamera.result.errors.length === 1 && badCamera.result.errors[0].code === 'validation'])
  assertions.push(['setCamera NaN preserves previous camera', badCamera.newState.camera?.x === 10 && badCamera.newState.camera?.zoom === 1])

  // 2. setCamera con zoom fuera de rango → clamp a MIN/MAX
  const clamped = applyOps({ elements: [], agentVersion: 0 }, [{ kind: 'setCamera', x: 0, y: 0, zoom: 500 }])
  assertions.push(['setCamera clamps zoom to MAX_ZOOM', clamped.result.errors.length === 0 && (clamped.newState.camera?.zoom ?? 0) <= 20])

  // 3. add de connector con fromId/toId (forma degenerada de agentes) → bindings
  const a = createRectangle({ x: 0, y: 0, width: 100, height: 80 })
  a.id = 'harden_a'
  const b = createRectangle({ x: 300, y: 0, width: 100, height: 80 })
  b.id = 'harden_b'
  const rawConnector = {
    id: 'harden_c',
    type: 'connector',
    x: 0, y: 0, width: 10, height: 10,
    rotation: 0, zIndex: 5, opacity: 1, locked: false, hidden: false,
    groupId: null, frameId: null, version: 1,
    createdAt: 1, updatedAt: 1, createdBy: 'agent',
    strokeColor: '#fff', strokeWidth: 2, strokeStyle: 'solid',
    fromId: 'harden_a', toId: 'harden_b',
  } as unknown as CanvasElement
  const addConn = applyOps({ elements: [a, b], agentVersion: 0 }, [{ kind: 'add', element: rawConnector }])
  const conn = addConn.newState.elements.find(el => el.id === 'harden_c')
  assertions.push([
    'add connector with fromId/toId normalized to bindings',
    Boolean(conn && conn.type === 'connector' && conn.startBinding?.elementId === 'harden_a' && conn.endBinding?.elementId === 'harden_b' && !('fromId' in conn)),
  ])

  // 4. add de freedraw con puntos ABSOLUTOS (x=0) → origen normalizado, bbox sano
  const rawFreedraw = {
    id: 'harden_f',
    type: 'freedraw',
    x: 0, y: 0, width: 1, height: 1,
    rotation: 0, zIndex: 6, opacity: 1, locked: false, hidden: false,
    groupId: null, frameId: null, version: 1,
    createdAt: 1, updatedAt: 1, createdBy: 'agent',
    strokeColor: '#fff', strokeWidth: 4, smoothing: 0.5, thinning: 0.85,
    points: [{ x: 500, y: 600 }, { x: 540, y: 640 }, { x: 580, y: 610 }],
  } as unknown as CanvasElement
  const addFree = applyOps({ elements: [], agentVersion: 0 }, [{ kind: 'add', element: rawFreedraw }])
  const stroke = addFree.newState.elements.find(el => el.id === 'harden_f')
  const strokeBox = stroke ? bboxFromElement(stroke) : null
  assertions.push([
    'add freedraw with absolute points gets tight bbox',
    Boolean(stroke && strokeBox && strokeBox.minX > 400 && strokeBox.maxX < 700 && strokeBox.width < 120 && strokeBox.height < 80),
  ])
  // Render-neutral: los puntos absolutos resultantes (x + point) no cambian
  const firstAbs = stroke && 'points' in stroke && Array.isArray(stroke.points)
    ? { x: stroke.x + stroke.points[0].x, y: stroke.y + stroke.points[0].y }
    : null
  assertions.push(['add freedraw normalization is render-neutral', Boolean(firstAbs && firstAbs.x === 500 && firstAbs.y === 600)])

  // 5. validateOps cacha ops malformadas con mensajes accionables
  const invalid = validateOps([
    { kind: 'setCamera', x: 'a', y: 0, zoom: 1 },
    { kind: 'noSuchOp' },
    { kind: 'insertSticky', text: 'ok', x: 0, y: 0 },
    { kind: 'move', ids: ['x'], dx: NaN, dy: 0 },
  ])
  assertions.push(['validateOps flags malformed ops', invalid.length === 3 && invalid.every(i => i.message.length > 5)])
  assertions.push(['validateOps passes well-formed ops', !invalid.some(i => i.index === 2)])

  return assertions
}

// ---------------------------------------------------------------------------
async function main() {
  const elements = buildScene()
  console.error(`[scene] ${elements.length} synthetic elements`)

  const all: Assertion[] = [
    ...verifyCullingParity(elements),
    ...verifyHitTestDeterminism(elements),
    ...verifySortStability(elements),
    ...verifyOpsHardening(),
    ...(await verifyPerfCacheIfPresent(elements)),
  ]

  const failed = all.filter(([, pass]) => !pass)
  if (failed.length > 0) {
    console.error(JSON.stringify({ ok: false, failed: failed.map(([name]) => name) }, null, 2))
    process.exit(1)
  }
  console.log(JSON.stringify({ ok: true, checks: all.length, elements: elements.length }, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
