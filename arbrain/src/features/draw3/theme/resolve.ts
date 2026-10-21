/**
 * Theme-aware color resolution.
 *
 * Two mechanisms, applied at render time (single point in the engine):
 *
 *  1. Semantic roles — an element with `semantic` (e.g. 'identity', 'delivery')
 *     resolves its fill/stroke/text from the active palette's functionColors.
 *     This lets cards fully re-look when the theme flips dark <-> light.
 *
 *  2. Auto defaults — an element whose stroke/text color is the legacy "default
 *     white" (the value baked by the factories) is treated as "follow the theme":
 *     it resolves to palette.defaultStroke / palette.textColor. So white arrows
 *     and white text turn dark on a light canvas with no data migration.
 *
 * Explicit, non-default colors are left untouched.
 */
import type { CanvasElement } from '../elements/types'
import type { CanvasPalette } from './tokens'

// Legacy default stroke/text values that should follow the theme. '#ffffff' is the
// factory default; '#f7f8f8' is the dark palette's defaultStroke.
const AUTO_COLORS = new Set(['#ffffff', '#fff', '#f7f8f8'])

function isAuto(color: string | null | undefined): boolean {
  if (!color) return true
  return AUTO_COLORS.has(color.trim().toLowerCase())
}

/**
 * Returns the element unchanged when no resolution is needed, otherwise a shallow
 * clone with theme-resolved colors. Never mutates the input.
 */
export function resolveElementColors<T extends CanvasElement>(el: T, palette: CanvasPalette): T {
  const semantic = 'semantic' in el ? (el as { semantic?: keyof CanvasPalette['functionColors'] }).semantic : undefined

  // 1. Semantic role wins.
  if (semantic && palette.functionColors[semantic]) {
    const fc = palette.functionColors[semantic]
    const patched = { ...el } as Record<string, unknown>
    if ('strokeColor' in el) patched.strokeColor = fc.stroke
    if ('fillColor' in el) patched.fillColor = fc.fill
    if (el.type === 'text') patched.textColor = fc.text
    return patched as T
  }

  // 2. Auto default resolution (no semantic role).
  let patched: Record<string, unknown> | null = null

  if ('strokeColor' in el && isAuto((el as { strokeColor?: string }).strokeColor)) {
    patched = patched ?? { ...el }
    patched.strokeColor = palette.defaultStroke
  }

  if (el.type === 'text' && isAuto((el as { textColor?: string }).textColor)) {
    patched = patched ?? { ...el }
    patched.textColor = palette.textColor
  }

  return (patched ?? el) as T
}
