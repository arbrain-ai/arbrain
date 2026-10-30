/**
 * Canvas v3 — Agent ops contract
 *
 * Discriminated union of all operations the agent (or human) can apply
 * to a canvas page. The same contract is used:
 * - by the agent over HTTP (POST /api/draw3/[pageId]/ops)
 * - by the local UI for undo/redo + autosave
 * - by the realtime channel to propagate changes
 */

import type {
  CanvasElement,
  ElementId,
  FrameColor,
  FontWeight,
  StickyColor,
  ConnectorRouting,
  ArrowHead,
  FontFamily,
  ShapeElementType,
  TextAlign,
  TextDecoration,
} from '../elements/types'

export type Op =
  | { kind: 'add'; element: CanvasElement }
  | { kind: 'update'; id: ElementId; patch: Partial<CanvasElement> & { type?: never }; expectedVersion?: number }
  | { kind: 'morphShape'; id: ElementId; shapeType: ShapeElementType; patch?: Partial<CanvasElement> & { type?: never }; expectedVersion?: number }
  | { kind: 'delete'; ids: ElementId[] }
  | { kind: 'move'; ids: ElementId[]; dx: number; dy: number }
  | { kind: 'moveTo'; id: ElementId; x: number; y: number }
  | { kind: 'resize'; id: ElementId; width: number; height: number; anchor?: 'tl' | 'tr' | 'bl' | 'br' | 'c' }
  | { kind: 'rotate'; id: ElementId; rotation: number }
  | { kind: 'bringForward'; ids: ElementId[] }
  | { kind: 'sendBackward'; ids: ElementId[] }
  | { kind: 'bringToFront'; ids: ElementId[] }
  | { kind: 'sendToBack'; ids: ElementId[] }
  | { kind: 'connect'; fromId: ElementId; toId: ElementId; label?: string; routing?: ConnectorRouting; endArrowhead?: ArrowHead; startArrowhead?: ArrowHead }
  | { kind: 'disconnect'; connectorId: ElementId }
  | { kind: 'group'; ids: ElementId[]; groupId?: string }
  | { kind: 'ungroup'; groupId: ElementId }
  | { kind: 'createFrame'; ids?: ElementId[]; title: string; color?: FrameColor; x?: number; y?: number; width?: number; height?: number }
  | { kind: 'setFrame'; ids: ElementId[]; frameId: ElementId | null }
  | { kind: 'align'; ids: ElementId[]; axis: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom' }
  | { kind: 'distribute'; ids: ElementId[]; axis: 'horizontal' | 'vertical' }
  | { kind: 'arrange'; ids?: ElementId[]; algorithm: ArrangeAlgorithm; options?: ArrangeOptions }
  | { kind: 'insertImage'; source: ImageSource; x?: number | 'center' | 'right-of-selection'; y?: number | 'center'; width?: number; height?: number; alt?: string; maxWidth?: number; preserveAspectRatio?: boolean }
  | { kind: 'insertText'; text: string; x: number; y: number; style?: TextStyleHint }
  | { kind: 'insertSticky'; text: string; x: number; y: number; color?: StickyColor }
  | { kind: 'insertMermaid'; code: string; x?: number; y?: number; mode?: 'native' | 'widget' | 'image' }
  | { kind: 'insertCode'; code: string; language: string; x: number; y: number }
  | { kind: 'insertTable'; rows: number; cols: number; x: number; y: number; cells?: string[][] }
  | { kind: 'addComment'; elementId?: ElementId; point?: { x: number; y: number }; body: string }
  | { kind: 'setTheme'; theme: 'dark' | 'light' | 'mono' | 'system' }
  | { kind: 'setCamera'; x: number; y: number; zoom: number }
  | { kind: 'fitView'; targetIds?: ElementId[]; padding?: number }
  | { kind: 'renamePage'; name: string }

export type ArrangeAlgorithm =
  | 'dagre-tb' | 'dagre-lr' | 'dagre-bt' | 'dagre-rl'
  | 'elk-radial' | 'elk-force' | 'elk-layered'
  | 'grid' | 'stack-vertical' | 'stack-horizontal'

export interface ArrangeOptions {
  rankSep?: number     // vertical spacing between ranks (dagre)
  nodeSep?: number     // horizontal spacing between nodes (dagre)
  cols?: number        // for grid
  gap?: number         // for grid/stack
  padding?: number
  preservePositions?: boolean
}

type ImageSource = string  // URL, file path, or base64 data URL

interface TextStyleHint {
  fontFamily?: FontFamily
  fontSize?: number
  fontWeight?: FontWeight
  fontStyle?: 'normal' | 'italic'
  textDecoration?: TextDecoration
  color?: string
  align?: TextAlign
}

/**
 * Applied op (returned by server)
 */
export interface AppliedOp {
  op: Op
  affectedIds: ElementId[]
  newVersion: number  // page agent_version after applying
}

export interface OpError {
  op: Op
  message: string
  code: 'not_found' | 'version_conflict' | 'validation' | 'permission' | 'internal'
}

export interface ApplyOpsResult {
  ok: boolean
  applied: AppliedOp[]
  errors: OpError[]
  newAgentVersion: number
  conflicts?: Array<{ elementId: ElementId; remoteVersion: number; localVersion: number }>
}

/**
 * Apply request body
 */
export interface ApplyOpsRequest {
  ops: Op[]
  expectedAgentVersion?: number
  actor: 'human' | 'agent' | 'system'
  actorId?: string
}
