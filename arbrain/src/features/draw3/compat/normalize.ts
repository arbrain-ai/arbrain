import type { CanvasElement, FontFamily, TextElement } from '../elements/types'
import { createCode, createComment, createMermaid, createSticky, createTable } from '../elements/factories'

type BinaryFiles = Record<string, { dataURL?: string }>

function normalizeCanvasElement(
  raw: Record<string, unknown>,
  files: BinaryFiles = {},
  index = 0,
): CanvasElement | null {
  if (!raw || raw.isDeleted === true || raw.hidden === true) return null
  if ('rotation' in raw && 'createdBy' in raw && !('angle' in raw)) {
    return raw as unknown as CanvasElement
  }

  const type = String(raw.type ?? 'rectangle')
  const base = {
    id: String(raw.id ?? `legacy-${Date.now()}-${index}`),
    x: numberOr(raw.x, 0),
    y: numberOr(raw.y, 0),
    width: Math.max(1, numberOr(raw.width, 160)),
    height: Math.max(1, numberOr(raw.height, 80)),
    rotation: numberOr(raw.angle, 0),
    zIndex: numberOr(raw.zIndex, index + 1),
    opacity: numberOr(raw.opacity, 100) > 1 ? numberOr(raw.opacity, 100) / 100 : numberOr(raw.opacity, 1),
    locked: Boolean(raw.locked ?? false),
    hidden: false,
    groupId: Array.isArray(raw.groupIds) ? String(raw.groupIds[0] ?? '') || null : null,
    frameId: typeof raw.frameId === 'string' ? raw.frameId : null,
    version: numberOr(raw.version, 1),
    createdAt: numberOr(raw.createdAt, Date.now()),
    updatedAt: numberOr(raw.updatedAt, Date.now()),
    createdBy: 'human' as const,
  }

  if (type === 'text') {
    return {
      ...base,
      type: 'text',
      doc: String(raw.text ?? ''),
      fontFamily: mapFont(raw.fontFamily),
      fontSize: numberOr(raw.fontSize, 18),
      fontWeight: mapWeight(raw.fontWeight),
      fontStyle: mapFontStyle(raw.fontStyle),
      textDecoration: mapTextDecoration(raw.textDecoration),
      textColor: String(raw.strokeColor ?? '#ffffff'),
      textAlign: mapTextAlign(raw.textAlign),
      verticalAlign: raw.verticalAlign === 'top' ? 'top' : raw.verticalAlign === 'bottom' ? 'bottom' : 'middle',
      lineHeight: numberOr(raw.lineHeight, 1.35),
      containerId: typeof raw.containerId === 'string' ? raw.containerId : undefined,
      autoSize: Boolean(raw.autoResize ?? true),
    }
  }

  if (type === 'image') {
    const fileId = typeof raw.fileId === 'string' ? raw.fileId : null
    return {
      ...base,
      type: 'image',
      assetId: null,
      url: fileId ? files[fileId]?.dataURL ?? '' : String(raw.url ?? ''),
      naturalWidth: base.width,
      naturalHeight: base.height,
      alt: 'Image',
    }
  }

  if (type === 'frame') {
    return {
      ...base,
      type: 'frame',
      title: String(raw.name ?? raw.title ?? 'Section'),
      color: 'violet',
      childIds: [],
      clipChildren: false,
    }
  }

  if (type === 'arrow' || type === 'line') {
    return {
      ...base,
      type: type as 'arrow' | 'line',
      strokeColor: String(raw.strokeColor ?? '#ffffff'),
      strokeWidth: numberOr(raw.strokeWidth, 2),
      strokeStyle: mapStrokeStyle(raw.strokeStyle),
      strokeOpacity: numberOr(raw.strokeOpacity, base.opacity),
      points: Array.isArray(raw.points) ? raw.points as Array<{ x: number; y: number }> : [{ x: 0, y: 0 }, { x: base.width, y: base.height }],
      ...(type === 'arrow' ? { startArrowhead: 'none' as const, endArrowhead: 'arrow' as const } : {}),
    } as CanvasElement
  }

  if (type === 'mermaid') return { ...createMermaid({ x: base.x, y: base.y, code: String(raw.code ?? '') }), id: base.id, width: base.width, height: base.height, zIndex: base.zIndex }
  if (type === 'code') return { ...createCode({ x: base.x, y: base.y, code: String(raw.code ?? ''), language: String(raw.language ?? 'text') }), id: base.id, width: base.width, height: base.height, zIndex: base.zIndex }
  if (type === 'comment') return { ...createComment({ x: base.x, y: base.y, body: String(raw.body ?? '') }), id: base.id, width: base.width, height: base.height, zIndex: base.zIndex, resolved: Boolean(raw.resolved ?? false) }
  if (type === 'sticky') return { ...createSticky({ x: base.x, y: base.y, text: String(raw.text ?? ''), color: 'yellow' }), id: base.id, zIndex: base.zIndex }
  if (type === 'table') {
    const cells = Array.isArray(raw.cells) ? raw.cells as string[][] : [['']]
    const table = createTable({ x: base.x, y: base.y, rows: cells.length, cols: Math.max(1, ...cells.map(row => row.length)) })
    table.id = base.id
    table.width = base.width
    table.height = base.height
    table.zIndex = base.zIndex
    table.cells = cells
    return table
  }

  const shape = {
    ...base,
    strokeColor: String(raw.strokeColor ?? '#ffffff'),
    strokeWidth: numberOr(raw.strokeWidth, 2),
    strokeStyle: mapStrokeStyle(raw.strokeStyle),
    strokeOpacity: numberOr(raw.strokeOpacity, base.opacity),
    fillColor: raw.backgroundColor && raw.backgroundColor !== 'transparent' ? String(raw.backgroundColor) : null,
    fillOpacity: numberOr(raw.fillOpacity, base.opacity),
    fillStyle: raw.fillStyle === 'hachure' ? 'hatched' as const : raw.fillStyle === 'cross-hatch' ? 'cross-hatch' as const : 'solid' as const,
  }
  if (type === 'ellipse') return { ...shape, type: 'ellipse' }
  if (type === 'diamond') return { ...shape, type: 'diamond' }
  if (type === 'triangle') return { ...shape, type: 'triangle' }
  if (type === 'chevron') return { ...shape, type: 'chevron', notchRatio: numberOr(raw.notchRatio, 0.16), pointRatio: numberOr(raw.pointRatio, 0.84) }
  return { ...shape, type: 'rectangle', cornerRadius: numberOr(raw.roundness, 10) }
}

export function normalizeCanvasElements(rawElements: Record<string, unknown>[], files: BinaryFiles = {}): CanvasElement[] {
  return rawElements
    .map((raw, index) => normalizeCanvasElement(raw, files, index))
    .filter(Boolean) as CanvasElement[]
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function mapFont(value: unknown): FontFamily {
  const font = String(value ?? '').toLowerCase()
  if (font.includes('roboto slab')) return 'Roboto Slab'
  if (font.includes('inter')) return 'Inter'
  if (font.includes('mono') || font.includes('jetbrains')) return 'mono'
  if (font.includes('fraunces') || font.includes('serif') || font.includes('georgia')) return 'serif'
  if (font.includes('caveat') || font.includes('hand')) return 'handwriting'
  return 'sans'
}

function mapWeight(value: unknown): TextElement['fontWeight'] {
  const weight = numberOr(value, 400)
  if (weight >= 900) return 900
  if (weight >= 800) return 800
  if (weight >= 700) return 700
  if (weight >= 600) return 600
  if (weight >= 500) return 500
  return 400
}

function mapFontStyle(value: unknown): TextElement['fontStyle'] {
  return value === 'italic' ? 'italic' : 'normal'
}

function mapTextDecoration(value: unknown): TextElement['textDecoration'] {
  if (value === 'underline' || value === 'line-through' || value === 'underline line-through') return value
  return 'none'
}

function mapTextAlign(value: unknown): TextElement['textAlign'] {
  if (value === 'left' || value === 'right' || value === 'justify') return value
  return 'center'
}

function mapStrokeStyle(value: unknown): 'solid' | 'dashed' | 'dotted' {
  if (value === 'dashed' || value === 'dotted') return value
  return 'solid'
}
