/**
 * Op reducer — apply a batch of ops to canvas state.
 *
 * Pure function: takes elements + ops, returns new elements + applied/errors.
 * Used by:
 * - server API route (POST /api/draw3/[id]/ops) to compute new page_elements
 * - client-side after realtime UPDATE event
 * - history store for redo
 */
import { ulid } from 'ulid'
import type { CanvasElement, ElementId, Camera } from '../elements/types'
import { bboxFromElement, bboxUnion, isShape } from '../elements/types'
import {
  createConnector,
  createFrame,
  createGroup,
  createImage,
  createSticky,
  createText,
  createMermaid,
  createCode,
  createTable,
  createComment,
  nextZIndex,
} from '../elements/factories'
import type { Op, AppliedOp, OpError, ApplyOpsResult } from './contract'
import { autoArrange } from '../layout/auto-arrange'
import { MIN_ZOOM, MAX_ZOOM } from '../canvas/camera'
import { capital, NOMBRE_DUENO } from '@/config'

export interface CanvasStateForOps {
  elements: CanvasElement[]
  camera?: Camera
  pageName?: string
  theme?: string
  agentVersion: number
}

/**
 * Apply ops to state. Pure: returns new state, applied, errors.
 *
 * Note: insertImage with file paths require async upload; this reducer assumes
 * `source` is already a URL/data-url. The async upload is the caller's job
 * (see api/draw3/[pageId]/ops/route.ts handleInsertImage).
 */
export function applyOps(
  state: CanvasStateForOps,
  ops: Op[],
  actor: 'human' | 'agent' | 'system' = 'human',
): { newState: CanvasStateForOps; result: ApplyOpsResult } {
  // Clones profundos: state.elements viene del store zustand+immer con objetos
  // CONGELADOS. Varios cases mutan in-place (group/ungroup setean groupId en
  // hijos, move/align/zIndex, etc); sobre un objeto frozen eso lanza TypeError
  // que el try/catch del loop se tragaba en silencio — el sintoma era "Cmd+G
  // crea el grupo pero los hijos nunca quedan linkeados".
  const elements = state.elements.map(el => structuredClone(el) as CanvasElement)
  const applied: AppliedOp[] = []
  const errors: OpError[] = []
  let camera = state.camera
  let pageName = state.pageName ?? ''
  let theme = state.theme ?? 'dark'
  const startVersion = state.agentVersion
  let newVersion = startVersion + 1

  const byId = (id: ElementId) => elements.find(e => e.id === id)
  const idxOf = (id: ElementId) => elements.findIndex(e => e.id === id)
  const expandGroupChildIds = (ids: Iterable<ElementId>) => {
    const out = new Set<ElementId>()
    const visit = (id: ElementId) => {
      if (out.has(id)) return
      const el = byId(id)
      if (!el) return
      out.add(id)
      if (el.type === 'group') {
        for (const childId of el.childIds) visit(childId)
      }
    }
    for (const id of ids) visit(id)
    return out
  }
  const expandDeletionIds = (ids: ElementId[]) => {
    const toRemove = expandGroupChildIds(ids)
    let changed = true
    while (changed) {
      changed = false
      for (const el of elements) {
        const shouldRemove =
          toRemove.has(el.id) ||
          (el.type === 'text' && el.containerId != null && toRemove.has(el.containerId)) ||
          (el.type === 'connector' && (
            (el.startBinding?.elementId != null && toRemove.has(el.startBinding.elementId)) ||
            (el.endBinding?.elementId != null && toRemove.has(el.endBinding.elementId))
          ))
        if (shouldRemove && !toRemove.has(el.id)) {
          toRemove.add(el.id)
          changed = true
        }
      }
    }
    return toRemove
  }
  const expandMoveIds = (ids: ElementId[]) => {
    const toMove = expandGroupChildIds(ids)
    let changed = true
    while (changed) {
      changed = false
      for (const el of elements) {
        if (el.type === 'text' && el.containerId != null && toMove.has(el.containerId) && !toMove.has(el.id)) {
          toMove.add(el.id)
          changed = true
        }
      }
    }
    return toMove
  }

  for (const op of ops) {
    try {
      switch (op.kind) {
        case 'add': {
          // Ensure id exists; assign default zIndex if 0
          const el = { ...op.element }
          if (!el.id) el.id = ulid()
          if (!el.zIndex || el.zIndex === 0) el.zIndex = nextZIndex()
          el.version = el.version ?? 1
          el.createdAt = el.createdAt ?? Date.now()
          el.updatedAt = Date.now()
          el.createdBy = el.createdBy ?? actor === 'agent' ? 'agent' : 'human'
          normalizeAddedElement(el as CanvasElement & Record<string, unknown>)
          elements.push(el as CanvasElement)
          applied.push({ op, affectedIds: [el.id], newVersion })
          break
        }
        case 'update': {
          const i = idxOf(op.id)
          if (i < 0) { errors.push({ op, message: `Element ${op.id} not found`, code: 'not_found' }); break }
          const current = elements[i]
          if (op.expectedVersion != null && current.version !== op.expectedVersion) {
            errors.push({ op, message: `Version mismatch (expected ${op.expectedVersion}, got ${current.version})`, code: 'version_conflict' })
            break
          }
          const next = {
            ...current,
            ...op.patch,
            id: current.id,           // never override
            type: current.type,        // never override type via update
            updatedAt: Date.now(),
            version: (current.version ?? 1) + 1,
          } as CanvasElement
          // An explicit color edit takes ownership: drop the semantic role so the
          // color picker is authoritative (otherwise the theme token would win).
          const patch = op.patch as Record<string, unknown>
          if (('strokeColor' in patch || 'fillColor' in patch || 'textColor' in patch) && !('semantic' in patch)) {
            delete (next as { semantic?: unknown }).semantic
          }
          elements[i] = next
          applied.push({ op, affectedIds: [next.id], newVersion })
          break
        }
        case 'morphShape': {
          const i = idxOf(op.id)
          if (i < 0) { errors.push({ op, message: `Element ${op.id} not found`, code: 'not_found' }); break }
          const current = elements[i]
          if (!isShape(current)) { errors.push({ op, message: `Element ${op.id} is not a shape`, code: 'validation' }); break }
          if (op.expectedVersion != null && current.version !== op.expectedVersion) {
            errors.push({ op, message: `Version mismatch (expected ${op.expectedVersion}, got ${current.version})`, code: 'version_conflict' })
            break
          }
          const next = {
            ...current,
            ...(op.patch ?? {}),
            id: current.id,
            type: op.shapeType,
            updatedAt: Date.now(),
            version: (current.version ?? 1) + 1,
          } as CanvasElement
          elements[i] = next
          applied.push({ op, affectedIds: [next.id], newVersion })
          break
        }
        case 'delete': {
          const toRemove = expandDeletionIds(op.ids)
          for (let i = elements.length - 1; i >= 0; i--) {
            if (toRemove.has(elements[i].id)) elements.splice(i, 1)
          }
          // Remove dangling frame children
          for (const el of elements) {
            if (el.type === 'frame' || el.type === 'group') {
              const before = el.childIds.length
              el.childIds = el.childIds.filter(id => !toRemove.has(id))
              if (el.childIds.length !== before) {
                el.updatedAt = Date.now()
                el.version += 1
              }
            }
          }
          applied.push({ op, affectedIds: Array.from(toRemove), newVersion })
          break
        }
        case 'move': {
          const toMove = expandMoveIds(op.ids)
          for (const el of elements) {
            if (toMove.has(el.id)) {
              el.x += op.dx
              el.y += op.dy
              if (el.type === 'connector' && Array.isArray(el.waypoints)) {
                el.waypoints = el.waypoints.map(point => ({ x: point.x + op.dx, y: point.y + op.dy }))
              }
              el.updatedAt = Date.now()
              el.version = (el.version ?? 1) + 1
            }
          }
          applied.push({ op, affectedIds: Array.from(toMove), newVersion })
          break
        }
        case 'moveTo': {
          const i = idxOf(op.id)
          if (i < 0) { errors.push({ op, message: `Element ${op.id} not found`, code: 'not_found' }); break }
          const current = elements[i]
          const dx = op.x - current.x
          const dy = op.y - current.y
          const toMove = expandMoveIds([op.id])
          for (const el of elements) {
            if (toMove.has(el.id)) {
              el.x += dx
              el.y += dy
              if (el.type === 'connector' && Array.isArray(el.waypoints)) {
                el.waypoints = el.waypoints.map(point => ({ x: point.x + dx, y: point.y + dy }))
              }
              el.updatedAt = Date.now()
              el.version = (el.version ?? 1) + 1
            }
          }
          applied.push({ op, affectedIds: Array.from(toMove), newVersion })
          break
        }
        case 'resize': {
          const i = idxOf(op.id)
          if (i < 0) { errors.push({ op, message: `Element ${op.id} not found`, code: 'not_found' }); break }
          elements[i] = { ...elements[i], width: op.width, height: op.height, updatedAt: Date.now(), version: (elements[i].version ?? 1) + 1 }
          applied.push({ op, affectedIds: [op.id], newVersion })
          break
        }
        case 'rotate': {
          const i = idxOf(op.id)
          if (i < 0) { errors.push({ op, message: `Element ${op.id} not found`, code: 'not_found' }); break }
          elements[i] = { ...elements[i], rotation: op.rotation, updatedAt: Date.now(), version: (elements[i].version ?? 1) + 1 }
          applied.push({ op, affectedIds: [op.id], newVersion })
          break
        }
        case 'bringForward':
        case 'sendBackward':
        case 'bringToFront':
        case 'sendToBack': {
          const ids = new Set(op.ids)
          applyZIndexOp(elements, ids, op.kind)
          applied.push({ op, affectedIds: op.ids, newVersion })
          break
        }
        case 'connect': {
          const from = byId(op.fromId), to = byId(op.toId)
          if (!from || !to) { errors.push({ op, message: 'connect: from/to not found', code: 'not_found' }); break }
          const connector = createConnector({
            fromElementId: op.fromId,
            toElementId: op.toId,
            label: op.label,
            routing: op.routing,
            startArrowhead: op.startArrowhead,
            endArrowhead: op.endArrowhead,
            createdBy: actor === 'agent' ? 'agent' : 'human',
          })
          elements.push(connector)
          applied.push({ op, affectedIds: [connector.id], newVersion })
          break
        }
        case 'disconnect': {
          const i = idxOf(op.connectorId)
          if (i < 0) { errors.push({ op, message: 'connector not found', code: 'not_found' }); break }
          if (elements[i].type !== 'connector') { errors.push({ op, message: 'not a connector', code: 'validation' }); break }
          elements.splice(i, 1)
          applied.push({ op, affectedIds: [op.connectorId], newVersion })
          break
        }
        case 'group': {
          const ids = op.ids.filter(id => byId(id))
          if (ids.length < 2) { errors.push({ op, message: 'group needs >= 2 elements', code: 'validation' }); break }
          const groupId = op.groupId ?? ulid()
          const boxes = ids.map(id => bboxFromElement(byId(id)!))
          const union = bboxUnion(boxes)!
          const group = createGroup({
            childIds: ids,
            bbox: { x: union.minX, y: union.minY, width: union.width, height: union.height },
            createdBy: actor === 'agent' ? 'agent' : 'human',
          })
          group.id = groupId
          elements.push(group)
          for (const el of elements) if (ids.includes(el.id)) el.groupId = groupId
          applied.push({ op, affectedIds: [groupId, ...ids], newVersion })
          break
        }
        case 'ungroup': {
          const i = idxOf(op.groupId)
          if (i < 0) { errors.push({ op, message: 'group not found', code: 'not_found' }); break }
          const group = elements[i]
          if (group.type !== 'group') { errors.push({ op, message: 'not a group', code: 'validation' }); break }
          for (const el of elements) if (el.groupId === op.groupId) el.groupId = null
          elements.splice(i, 1)
          applied.push({ op, affectedIds: [op.groupId, ...group.childIds], newVersion })
          break
        }
        case 'createFrame': {
          const ids = op.ids ?? []
          const childBoxes = ids.map(id => byId(id)).filter(Boolean).map(el => bboxFromElement(el as CanvasElement))
          const union = childBoxes.length ? bboxUnion(childBoxes) : null
          const x = op.x ?? union?.minX ?? 0
          const y = op.y ?? (union ? union.minY - 40 : 0)
          const width = op.width ?? union?.width ?? 400
          const height = op.height ?? (union ? union.height + 40 : 300)
          const frame = createFrame({
            x, y, width, height,
            title: op.title,
            color: op.color,
            childIds: ids,
            createdBy: actor === 'agent' ? 'agent' : 'human',
          })
          elements.push(frame)
          for (const el of elements) if (ids.includes(el.id)) el.frameId = frame.id
          applied.push({ op, affectedIds: [frame.id, ...ids], newVersion })
          break
        }
        case 'setFrame': {
          for (const el of elements) {
            if (op.ids.includes(el.id)) el.frameId = op.frameId
          }
          // Also update frame.childIds if frameId provided
          if (op.frameId) {
            const f = byId(op.frameId)
            if (f && f.type === 'frame') {
              const set = new Set([...f.childIds, ...op.ids])
              f.childIds = Array.from(set)
            }
          }
          applied.push({ op, affectedIds: op.ids, newVersion })
          break
        }
        case 'align': {
          alignElements(elements, op.ids, op.axis)
          applied.push({ op, affectedIds: op.ids, newVersion })
          break
        }
        case 'distribute': {
          distributeElements(elements, op.ids, op.axis)
          applied.push({ op, affectedIds: op.ids, newVersion })
          break
        }
        case 'arrange': {
          const targetIds = op.ids ?? elements.filter(e => !['line', 'arrow', 'connector', 'frame', 'group'].includes(e.type)).map(e => e.id)
          const positions = autoArrange(elements, targetIds, op.algorithm, op.options)
          const affected: ElementId[] = []
          for (const [id, pos] of positions) {
            const i = idxOf(id)
            if (i < 0) continue
            elements[i] = {
              ...elements[i],
              x: pos.x,
              y: pos.y,
              updatedAt: Date.now(),
              version: (elements[i].version ?? 1) + 1,
            } as CanvasElement
            affected.push(id)
          }
          applied.push({ op, affectedIds: affected, newVersion })
          break
        }
        case 'insertImage': {
          // The source must already be a URL by this point
          if (typeof op.source !== 'string') { errors.push({ op, message: 'insertImage source must be string URL', code: 'validation' }); break }
          const targets = elements.filter(e => !e.hidden)
          const bounds = targets.length ? bboxUnion(targets.map(bboxFromElement)) : null
          const width = op.width ?? 400
          const height = op.height ?? 300
          const x = typeof op.x === 'number'
            ? op.x
            : op.x === 'right-of-selection' && bounds
              ? bounds.maxX + 80
              : bounds
                ? bounds.minX + bounds.width / 2 - width / 2
                : 0
          const y = typeof op.y === 'number'
            ? op.y
            : bounds
              ? bounds.minY + bounds.height / 2 - height / 2
              : 0
          const img = createImage({
            x, y, width, height,
            url: op.source,
            alt: op.alt,
            naturalWidth: width,
            naturalHeight: height,
            createdBy: actor === 'agent' ? 'agent' : 'human',
          })
          elements.push(img)
          applied.push({ op, affectedIds: [img.id], newVersion })
          break
        }
        case 'insertText': {
          const text = createText({
            x: op.x, y: op.y,
            text: op.text,
            fontFamily: op.style?.fontFamily,
            fontSize: op.style?.fontSize,
            textColor: op.style?.color,
            createdBy: actor === 'agent' ? 'agent' : 'human',
          })
          if (op.style?.fontWeight) text.fontWeight = op.style.fontWeight
          if (op.style?.fontStyle) text.fontStyle = op.style.fontStyle
          if (op.style?.textDecoration) text.textDecoration = op.style.textDecoration
          elements.push(text)
          applied.push({ op, affectedIds: [text.id], newVersion })
          break
        }
        case 'insertSticky': {
          const sticky = createSticky({
            x: op.x, y: op.y,
            text: op.text,
            color: op.color,
            createdBy: actor === 'agent' ? 'agent' : 'human',
          })
          elements.push(sticky)
          applied.push({ op, affectedIds: [sticky.id], newVersion })
          break
        }
        case 'insertMermaid': {
          const m = createMermaid({
            x: op.x ?? 0,
            y: op.y ?? 0,
            code: op.code,
            createdBy: actor === 'agent' ? 'agent' : 'human',
          })
          elements.push(m)
          applied.push({ op, affectedIds: [m.id], newVersion })
          break
        }
        case 'insertCode': {
          const c = createCode({
            x: op.x, y: op.y,
            code: op.code,
            language: op.language,
            createdBy: actor === 'agent' ? 'agent' : 'human',
          })
          elements.push(c)
          applied.push({ op, affectedIds: [c.id], newVersion })
          break
        }
        case 'insertTable': {
          const t = createTable({
            x: op.x, y: op.y,
            rows: op.rows, cols: op.cols,
            createdBy: actor === 'agent' ? 'agent' : 'human',
          })
          if (op.cells) t.cells = op.cells
          elements.push(t)
          applied.push({ op, affectedIds: [t.id], newVersion })
          break
        }
        case 'addComment': {
          const point = op.point ?? (op.elementId ? centerOf(byId(op.elementId)) : null)
          if (!point) { errors.push({ op, message: 'addComment requires point or elementId', code: 'validation' }); break }
          const comment = createComment({
            x: point.x,
            y: point.y,
            body: op.body,
            authorName: actor === 'agent' ? 'Levy' : capital(NOMBRE_DUENO()),
            createdBy: actor === 'agent' ? 'agent' : 'human',
          })
          elements.push(comment)
          applied.push({ op, affectedIds: [comment.id], newVersion })
          break
        }
        case 'setTheme': {
          theme = op.theme
          applied.push({ op, affectedIds: [], newVersion })
          break
        }
        case 'setCamera': {
          // Un NaN/Infinity serializado en page_elements.camera rompe el zoom
          // de la UI (NaN%). Validar aqui protege TODOS los callers (API, UI,
          // realtime), no solo el borde HTTP.
          if (!Number.isFinite(op.x) || !Number.isFinite(op.y) || !Number.isFinite(op.zoom) || op.zoom <= 0) {
            errors.push({ op, message: 'setCamera: x, y and zoom must be finite numbers (zoom > 0)', code: 'validation' })
            break
          }
          camera = { x: op.x, y: op.y, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, op.zoom)) }
          applied.push({ op, affectedIds: [], newVersion })
          break
        }
        case 'fitView': {
          const targets = op.targetIds
            ? elements.filter(e => op.targetIds!.includes(e.id))
            : elements
          if (!targets.length) { applied.push({ op, affectedIds: [], newVersion }); break }
          const boxes = targets.map(bboxFromElement)
          const u = bboxUnion(boxes)!
          // fitView is mostly a UI hint; serialize bbox into camera approx
          camera = camera ?? { x: 0, y: 0, zoom: 1 }
          applied.push({ op, affectedIds: targets.map(t => t.id), newVersion })
          break
        }
        case 'renamePage': {
          pageName = op.name
          applied.push({ op, affectedIds: [], newVersion })
          break
        }
        default: {
          errors.push({ op: op as Op, message: `Unknown op kind: ${(op as { kind: string }).kind}`, code: 'validation' })
        }
      }
    } catch (err) {
      // No tragar errores en silencio: el log es lo unico que delata bugs como
      // mutaciones sobre objetos frozen (se veian como ops "aplicadas" a medias).
      console.error('[draw3/applyOps] op failed:', op.kind, err)
      errors.push({ op, message: err instanceof Error ? err.message : String(err), code: 'internal' })
    }
  }

  return {
    newState: {
      elements,
      camera: camera,
      pageName,
      theme,
      agentVersion: newVersion,
    },
    result: {
      ok: errors.length === 0,
      applied,
      errors,
      newAgentVersion: newVersion,
    },
  }
}

function centerOf(el?: CanvasElement): { x: number; y: number } | null {
  if (!el) return null
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 }
}

/**
 * Normalizacion al ingest de `add` — los agentes mandan dos formas degeneradas
 * que ANTES renderizaban mal o rompian el bounding box (eran "reglas duras"
 * manuales en la skill; ahora se arreglan de raiz aqui):
 *
 * 1. Connector con `fromId`/`toId` (o `fromElementId`/`toElementId`) en vez de
 *    `startBinding`/`endBinding`: el renderer espera bindings → el connector
 *    NO renderizaba. Se convierten a bindings con anchor auto.
 * 2. Freedraw/highlighter con puntos ABSOLUTOS (x=0 + puntos en coords mundo):
 *    renderiza bien pero el bbox almacenado queda gigante/desplazado →
 *    fitView y minimapa se descuadran. Se re-deriva origen/extent (misma
 *    matematica que createFreedraw; render-neutral e idempotente).
 */
function normalizeAddedElement(el: CanvasElement & Record<string, unknown>): void {
  if (el.type === 'connector') {
    const fromId = el.fromId ?? el.fromElementId
    const toId = el.toId ?? el.toElementId
    if (!el.startBinding && typeof fromId === 'string') {
      el.startBinding = { elementId: fromId, anchor: 'auto', gap: 8 }
    }
    if (!el.endBinding && typeof toId === 'string') {
      el.endBinding = { elementId: toId, anchor: 'auto', gap: 8 }
    }
    delete el.fromId
    delete el.toId
    delete el.fromElementId
    delete el.toElementId
    if (!el.routing) el.routing = 'orthogonal'
    return
  }

  if ((el.type === 'freedraw' || el.type === 'highlighter') && Array.isArray(el.points) && el.points.length > 0) {
    const points = el.points as Array<{ x: number; y: number; pressure?: number }>
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)
    const strokeWidth = typeof el.strokeWidth === 'number' ? el.strokeWidth : 2
    const pad = el.type === 'highlighter'
      ? Math.max(8, strokeWidth / 2 + 4)
      : Math.max(4, strokeWidth / 2 + 3)
    el.points = points.map(point => ({
      x: point.x - minX + pad,
      y: point.y - minY + pad,
      ...(point.pressure != null ? { pressure: point.pressure } : {}),
    }))
    el.x = (typeof el.x === 'number' && Number.isFinite(el.x) ? el.x : 0) + minX - pad
    el.y = (typeof el.y === 'number' && Number.isFinite(el.y) ? el.y : 0) + minY - pad
    el.width = Math.max(1, maxX - minX + pad * 2)
    el.height = Math.max(1, maxY - minY + pad * 2)
  }
}

function applyZIndexOp(elements: CanvasElement[], ids: Set<ElementId>, kind: 'bringForward' | 'sendBackward' | 'bringToFront' | 'sendToBack'): void {
  if (kind === 'bringToFront') {
    const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), 0)
    let z = maxZ + 1
    for (const el of elements) if (ids.has(el.id)) el.zIndex = z++
  } else if (kind === 'sendToBack') {
    const minZ = elements.reduce((m, e) => Math.min(m, e.zIndex), Infinity)
    let z = minZ - 1
    // reverse to preserve relative order
    for (let i = elements.length - 1; i >= 0; i--) {
      if (ids.has(elements[i].id)) {
        elements[i].zIndex = z--
      }
    }
  } else if (kind === 'bringForward') {
    for (const el of elements) if (ids.has(el.id)) el.zIndex += 1
  } else { // sendBackward
    for (const el of elements) if (ids.has(el.id)) el.zIndex -= 1
  }
  for (const id of ids) {
    const el = elements.find(e => e.id === id)
    if (el) {
      el.updatedAt = Date.now()
      el.version = (el.version ?? 1) + 1
    }
  }
}

function alignElements(
  elements: CanvasElement[],
  ids: ElementId[],
  axis: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom',
): void {
  const targets = elements.filter(e => ids.includes(e.id))
  if (targets.length < 2) return
  const boxes = targets.map(t => ({ id: t.id, box: bboxFromElement(t) }))
  let anchor: number
  switch (axis) {
    case 'left':     anchor = Math.min(...boxes.map(b => b.box.minX)); break
    case 'right':    anchor = Math.max(...boxes.map(b => b.box.maxX)); break
    case 'center-x': anchor = boxes.reduce((s, b) => s + (b.box.minX + b.box.maxX) / 2, 0) / boxes.length; break
    case 'top':      anchor = Math.min(...boxes.map(b => b.box.minY)); break
    case 'bottom':   anchor = Math.max(...boxes.map(b => b.box.maxY)); break
    case 'center-y': anchor = boxes.reduce((s, b) => s + (b.box.minY + b.box.maxY) / 2, 0) / boxes.length; break
  }
  for (const t of targets) {
    const box = bboxFromElement(t)
    switch (axis) {
      case 'left':     t.x = anchor; break
      case 'right':    t.x = anchor - box.width; break
      case 'center-x': t.x = anchor - box.width / 2; break
      case 'top':      t.y = anchor; break
      case 'bottom':   t.y = anchor - box.height; break
      case 'center-y': t.y = anchor - box.height / 2; break
    }
    t.updatedAt = Date.now()
    t.version = (t.version ?? 1) + 1
  }
}

function distributeElements(
  elements: CanvasElement[],
  ids: ElementId[],
  axis: 'horizontal' | 'vertical',
): void {
  const targets = elements.filter(e => ids.includes(e.id))
  if (targets.length < 3) return
  const sorted = [...targets].sort((a, b) => axis === 'horizontal' ? a.x - b.x : a.y - b.y)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const firstBox = bboxFromElement(first)
  const lastBox = bboxFromElement(last)
  const span = axis === 'horizontal'
    ? (lastBox.maxX - firstBox.minX)
    : (lastBox.maxY - firstBox.minY)
  const totalSize = sorted.reduce((s, el) => s + (axis === 'horizontal' ? el.width : el.height), 0)
  const gap = (span - totalSize) / (sorted.length - 1)
  let cursor = axis === 'horizontal' ? firstBox.minX : firstBox.minY
  for (const el of sorted) {
    if (axis === 'horizontal') {
      el.x = cursor
      cursor += el.width + gap
    } else {
      el.y = cursor
      cursor += el.height + gap
    }
    el.updatedAt = Date.now()
    el.version = (el.version ?? 1) + 1
  }
}
