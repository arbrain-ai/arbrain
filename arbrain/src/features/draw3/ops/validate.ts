/**
 * Runtime validation of agent ops — the TypeScript contract no protege el
 * borde HTTP. Cada op se valida ANTES de aplicar: una op malformada produce
 * un 400 con mensaje accionable en vez de aplicarse a medias o en silencio.
 *
 * Filosofia: validacion LIGERA de forma (campos requeridos + tipos + finitos),
 * no un schema completo. La semantica (ids existen, version matchea) la valida
 * applyOps con su propio canal de errores.
 */
import type { Op } from './contract'

const VALID_ACTORS = ['human', 'agent', 'system'] as const
export type Actor = (typeof VALID_ACTORS)[number]

export function isValidActor(actor: unknown): actor is Actor {
  return typeof actor === 'string' && (VALID_ACTORS as readonly string[]).includes(actor)
}

const ALIGN_AXES = ['left', 'center-x', 'right', 'top', 'center-y', 'bottom']
const DISTRIBUTE_AXES = ['horizontal', 'vertical']
const THEMES = ['dark', 'light', 'mono', 'system']

function fin(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
function str(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}
function idArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(item => typeof item === 'string')
}

/** Returns an error message, or null if the op is well-formed. */
function validateOp(op: unknown): string | null {
  if (op === null || typeof op !== 'object') return 'op must be an object'
  const o = op as Record<string, unknown>
  if (!str(o.kind)) return 'op.kind is required'

  switch (o.kind) {
    case 'add': {
      if (o.element === null || typeof o.element !== 'object') return 'add: element object is required'
      const el = o.element as Record<string, unknown>
      if (!str(el.type)) return 'add: element.type is required'
      for (const key of ['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const) {
        if (key in el && el[key] != null && !fin(el[key])) return `add: element.${key} must be a finite number`
      }
      if ('href' in el && el.href != null && typeof el.href !== 'string') return 'add: element.href must be a string'
      return null
    }
    case 'update':
      if (!str(o.id)) return 'update: id is required'
      if (o.patch === null || typeof o.patch !== 'object') return 'update: patch object is required'
      return null
    case 'morphShape':
      if (!str(o.id)) return 'morphShape: id is required'
      if (!str(o.shapeType)) return 'morphShape: shapeType is required'
      return null
    case 'delete':
      return idArray(o.ids) ? null : 'delete: ids must be a string array'
    case 'move':
      if (!idArray(o.ids)) return 'move: ids must be a string array'
      if (!fin(o.dx) || !fin(o.dy)) return 'move: dx and dy must be finite numbers'
      return null
    case 'moveTo':
      if (!str(o.id)) return 'moveTo: id is required'
      if (!fin(o.x) || !fin(o.y)) return 'moveTo: x and y must be finite numbers'
      return null
    case 'resize':
      if (!str(o.id)) return 'resize: id is required'
      if (!fin(o.width) || !fin(o.height) || (o.width as number) <= 0 || (o.height as number) <= 0) {
        return 'resize: width and height must be positive finite numbers'
      }
      return null
    case 'rotate':
      if (!str(o.id)) return 'rotate: id is required'
      return fin(o.rotation) ? null : 'rotate: rotation must be a finite number'
    case 'bringForward':
    case 'sendBackward':
    case 'bringToFront':
    case 'sendToBack':
      return idArray(o.ids) ? null : `${o.kind}: ids must be a string array`
    case 'connect':
      if (!str(o.fromId) || !str(o.toId)) return 'connect: fromId and toId are required'
      return null
    case 'disconnect':
      return str(o.connectorId) ? null : 'disconnect: connectorId is required'
    case 'group':
      return idArray(o.ids) ? null : 'group: ids must be a string array'
    case 'ungroup':
      return str(o.groupId) ? null : 'ungroup: groupId is required'
    case 'createFrame':
      if (!str(o.title)) return 'createFrame: title is required'
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        if (key in o && o[key] != null && !fin(o[key])) return `createFrame: ${key} must be a finite number`
      }
      return null
    case 'setFrame':
      if (!idArray(o.ids)) return 'setFrame: ids must be a string array'
      if (o.frameId !== null && !str(o.frameId)) return 'setFrame: frameId must be a string or null'
      return null
    case 'align':
      if (!idArray(o.ids)) return 'align: ids must be a string array'
      return ALIGN_AXES.includes(o.axis as string) ? null : `align: axis must be one of ${ALIGN_AXES.join('|')}`
    case 'distribute':
      if (!idArray(o.ids)) return 'distribute: ids must be a string array'
      return DISTRIBUTE_AXES.includes(o.axis as string) ? null : `distribute: axis must be one of ${DISTRIBUTE_AXES.join('|')}`
    case 'arrange':
      if (o.ids != null && !idArray(o.ids)) return 'arrange: ids must be a string array'
      return str(o.algorithm) ? null : 'arrange: algorithm is required'
    case 'insertImage':
      return str(o.source) ? null : 'insertImage: source is required'
    case 'insertText':
      if (!str(o.text)) return 'insertText: text is required'
      if (!fin(o.x) || !fin(o.y)) return 'insertText: x and y must be finite numbers'
      return null
    case 'insertSticky':
      if (!str(o.text)) return 'insertSticky: text is required'
      if (!fin(o.x) || !fin(o.y)) return 'insertSticky: x and y must be finite numbers'
      return null
    case 'insertMermaid':
      return str(o.code) ? null : 'insertMermaid: code is required'
    case 'insertCode':
      if (!str(o.code)) return 'insertCode: code is required'
      if (!str(o.language)) return 'insertCode: language is required'
      if (!fin(o.x) || !fin(o.y)) return 'insertCode: x and y must be finite numbers'
      return null
    case 'insertTable':
      if (!fin(o.rows) || !fin(o.cols) || (o.rows as number) < 1 || (o.cols as number) < 1) {
        return 'insertTable: rows and cols must be positive numbers'
      }
      if (!fin(o.x) || !fin(o.y)) return 'insertTable: x and y must be finite numbers'
      return null
    case 'addComment':
      if (!str(o.body)) return 'addComment: body is required'
      if (o.elementId == null && o.point == null) return 'addComment: elementId or point is required'
      return null
    case 'setTheme':
      return THEMES.includes(o.theme as string) ? null : `setTheme: theme must be one of ${THEMES.join('|')}`
    case 'setCamera':
      if (!fin(o.x) || !fin(o.y) || !fin(o.zoom)) return 'setCamera: x, y and zoom must be finite numbers'
      if ((o.zoom as number) <= 0) return 'setCamera: zoom must be > 0'
      return null
    case 'fitView':
      if (o.targetIds != null && !idArray(o.targetIds)) return 'fitView: targetIds must be a string array'
      return null
    case 'renamePage':
      return str(o.name) ? null : 'renamePage: name is required'
    default:
      return `Unknown op kind: ${o.kind}. Valid kinds: add, update, morphShape, delete, move, moveTo, resize, rotate, bringForward, sendBackward, bringToFront, sendToBack, connect, disconnect, group, ungroup, createFrame, setFrame, align, distribute, arrange, insertImage, insertText, insertSticky, insertMermaid, insertCode, insertTable, addComment, setTheme, setCamera, fitView, renamePage`
  }
}

export interface InvalidOp {
  index: number
  kind: string
  message: string
}

/** Validate a batch. Returns [] when all ops are well-formed. */
export function validateOps(ops: unknown[]): InvalidOp[] {
  const invalid: InvalidOp[] = []
  ops.forEach((op, index) => {
    const message = validateOp(op)
    if (message) {
      invalid.push({
        index,
        kind: typeof op === 'object' && op !== null ? String((op as Record<string, unknown>).kind ?? '?') : '?',
        message,
      })
    }
  })
  return invalid
}

const _typecheck: (op: Op) => string | null = validateOp
void _typecheck
