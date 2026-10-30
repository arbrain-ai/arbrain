'use client'

import type { CanvasPalette } from '../../theme/tokens'

type CanvasColorColumn = {
  name: string
  colors: string[]
}

const CANVAS_COLOR_COLUMNS: CanvasColorColumn[] = [
  { name: 'Neutral', colors: ['#ffffff', '#f4f4f5', '#d4d4d8', '#71717a', '#18181b'] },
  { name: 'Yellow', colors: ['#fef9c3', '#fef08a', '#fde047', '#facc15', '#a16207'] },
  { name: 'Amber', colors: ['#fef3c7', '#fde68a', '#fbbf24', '#f59e0b', '#92400e'] },
  { name: 'Orange', colors: ['#ffedd5', '#fed7aa', '#fb923c', '#f97316', '#9a3412'] },
  { name: 'Red', colors: ['#fee2e2', '#fecaca', '#f87171', '#ef4444', '#991b1b'] },
  { name: 'Pink', colors: ['#fce7f3', '#fbcfe8', '#f472b6', '#ec4899', '#9d174d'] },
  { name: 'Purple', colors: ['#f3e8ff', '#e9d5ff', '#c084fc', '#8b5cf6', '#581c87'] },
  { name: 'Blue', colors: ['#dbeafe', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'] },
  { name: 'Cyan', colors: ['#cffafe', '#a5f3fc', '#22d3ee', '#06b6d4', '#155e75'] },
  { name: 'Green', colors: ['#dcfce7', '#bbf7d0', '#4ade80', '#22c55e', '#166534'] },
  { name: 'Brown', colors: ['#f5ede4', '#ead7c3', '#c59f7b', '#925f36', '#4a2c1a'] },
]

const ROW_COUNT = Math.max(...CANVAS_COLOR_COLUMNS.map(column => column.colors.length))

type SwatchSize = 'xs' | 'sm' | 'md'

const SWATCH_SIZE: Record<SwatchSize, number> = {
  xs: 14,
  sm: 18,
  md: 22,
}

const SWATCH_GAP: Record<SwatchSize, number> = {
  xs: 3,
  sm: 4,
  md: 5,
}

export function CanvasColorPalette({
  value,
  palette,
  onChange,
  allowTransparent = false,
  transparentLabel = 'Sin fondo',
  includeCustom = true,
  swatchSize = 'md',
}: {
  value: string | null
  palette: CanvasPalette
  onChange: (color: string | null) => void
  allowTransparent?: boolean
  transparentLabel?: string
  includeCustom?: boolean
  swatchSize?: SwatchSize
}) {
  const normalizedValue = normalizeColor(value)
  const size = SWATCH_SIZE[swatchSize]
  const gap = SWATCH_GAP[swatchSize]
  const customValue = normalizedValue && normalizedValue !== 'transparent' ? normalizedValue : '#000000'

  return (
    <div className="w-full">
      {allowTransparent && (
        <button
          onClick={() => onChange(null)}
          className="mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-black/5"
          style={{ color: palette.uiText }}
        >
          <span
            className="rounded-full border border-dashed"
            style={{
              width: size,
              height: size,
              borderColor: palette.uiBorder,
              backgroundImage: 'linear-gradient(135deg, transparent 46%, #9ca3af 48%, #9ca3af 52%, transparent 54%)',
            }}
          />
          {transparentLabel}
        </button>
      )}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${CANVAS_COLOR_COLUMNS.length}, ${size}px)`,
          gap,
        }}
      >
        {Array.from({ length: ROW_COUNT }).flatMap((_, rowIndex) =>
          CANVAS_COLOR_COLUMNS.map(column => {
            const color = column.colors[rowIndex]
            if (!color) return <span key={`${column.name}-${rowIndex}`} />
            const active = normalizedValue === color.toLowerCase()
            const isWhite = color.toLowerCase() === '#ffffff'
            return (
              <button
                key={`${column.name}-${color}`}
                onClick={() => onChange(color)}
                className="rounded-full border transition-transform hover:scale-105"
                style={{
                  width: size,
                  height: size,
                  background: color,
                  borderColor: active ? palette.accent : isWhite ? palette.uiBorder : 'rgba(17,24,39,0.16)',
                  boxShadow: active
                    ? `0 0 0 2px ${palette.accent}55, inset 0 0 0 1px rgba(255,255,255,0.65)`
                    : 'inset 0 0 0 1px rgba(255,255,255,0.45)',
                }}
                title={`${column.name} ${rowIndex + 1}`}
              />
            )
          }),
        )}
      </div>
      {includeCustom && (
        <label
          className="mt-3 flex items-center justify-between rounded-xl px-2 py-2 text-xs"
          style={{ color: palette.uiTextMuted, background: palette.uiBg }}
        >
          Color custom
          <input
            type="color"
            value={customValue}
            onChange={(event) => onChange(event.target.value)}
            className="h-7 w-9 rounded border-0 bg-transparent"
          />
        </label>
      )}
    </div>
  )
}

function normalizeColor(color: string | null): string | null {
  if (!color) return null
  return color.toLowerCase()
}
