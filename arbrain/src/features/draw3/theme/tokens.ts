/**
 * Theme tokens for Canvas v3.
 *
 * Three themes: dark (default), light, mono (high-contrast black/white).
 */
import type { FrameColor, StickyColor, FunctionColorName } from '../elements/types'

export type ThemeName = 'dark' | 'light' | 'mono'

interface FunctionColor {
  fill: string
  stroke: string
  text: string
}

export interface CanvasPalette {
  canvasBg: string
  gridLine: string
  gridDot: string
  defaultStroke: string
  defaultFill: string | null
  textColor: string
  selectionFill: string
  selectionStroke: string
  handleFill: string
  handleStroke: string
  snapGuide: string
  hoverGlow: string
  presenceColors: string[]
  frameColors: Record<FrameColor, { bg: string; border: string; title: string }>
  stickyColors: Record<StickyColor, { bg: string; text: string }>
  functionColors: Record<FunctionColorName, FunctionColor>
  uiBg: string
  uiBgElevated: string
  uiBorder: string
  uiText: string
  uiTextMuted: string
  accent: string
}

// Semantic color roles per theme (Business OS visual standard). Dark = deep tinted
// fills + accent stroke + light text. Light = pale tinted fills + accent stroke +
// dark text. Same accent hue across themes so the map reads identically by function.
const FUNCTION_COLORS: Record<ThemeName, Record<FunctionColorName, FunctionColor>> = {
  dark: {
    identity:     { fill: 'rgba(18,19,27,0.88)',  stroke: '#f6a502', text: '#f8fafc' },
    acquisition:  { fill: 'rgba(28,14,18,0.85)',  stroke: '#ef4444', text: '#fee2e2' },
    community:    { fill: 'rgba(25,18,36,0.85)',  stroke: '#8b5cf6', text: '#ede9fe' },
    conversion:   { fill: 'rgba(31,24,12,0.85)',  stroke: '#f59e0b', text: '#fef3c7' },
    revenue:      { fill: 'rgba(34,25,10,0.85)',  stroke: '#f6a502', text: '#fde68a' },
    delivery:     { fill: 'rgba(10,28,20,0.85)',  stroke: '#10b981', text: '#d1fae5' },
    intelligence: { fill: 'rgba(8,24,32,0.85)',   stroke: '#06b6d4', text: '#cffafe' },
    risk:         { fill: 'rgba(36,12,16,0.85)',  stroke: '#b91c1c', text: '#fecaca' },
    neutral:      { fill: 'rgba(18,19,27,0.85)',  stroke: '#71717a', text: '#e4e4e7' },
  },
  light: {
    identity:     { fill: '#fffaf0', stroke: '#d98a02', text: '#1f2937' },
    acquisition:  { fill: '#fef2f2', stroke: '#ef4444', text: '#7f1d1d' },
    community:    { fill: '#f5f3ff', stroke: '#8b5cf6', text: '#4c1d95' },
    conversion:   { fill: '#fffbeb', stroke: '#d97706', text: '#78350f' },
    revenue:      { fill: '#fefce8', stroke: '#ca8a04', text: '#713f12' },
    delivery:     { fill: '#ecfdf5', stroke: '#059669', text: '#064e3b' },
    intelligence: { fill: '#ecfeff', stroke: '#0891b2', text: '#164e63' },
    risk:         { fill: '#fef2f2', stroke: '#b91c1c', text: '#7f1d1d' },
    neutral:      { fill: '#f8fafc', stroke: '#94a3b8', text: '#1f2937' },
  },
  mono: {
    identity:     { fill: '#ffffff', stroke: '#000000', text: '#000000' },
    acquisition:  { fill: '#ffffff', stroke: '#000000', text: '#000000' },
    community:    { fill: '#ffffff', stroke: '#000000', text: '#000000' },
    conversion:   { fill: '#ffffff', stroke: '#000000', text: '#000000' },
    revenue:      { fill: '#ffffff', stroke: '#000000', text: '#000000' },
    delivery:     { fill: '#ffffff', stroke: '#000000', text: '#000000' },
    intelligence: { fill: '#ffffff', stroke: '#000000', text: '#000000' },
    risk:         { fill: '#ffffff', stroke: '#000000', text: '#000000' },
    neutral:      { fill: '#ffffff', stroke: '#000000', text: '#000000' },
  },
}

const FRAME_HUES: Record<FrameColor, number> = {
  slate: 215, zinc: 240, red: 0, orange: 25, amber: 40,
  green: 145, teal: 175, blue: 215, violet: 270, pink: 330,
}

function frameForDark(): Record<FrameColor, { bg: string; border: string; title: string }> {
  const out = {} as Record<FrameColor, { bg: string; border: string; title: string }>
  for (const [key, hue] of Object.entries(FRAME_HUES)) {
    out[key as FrameColor] = {
      bg: `hsla(${hue}, 30%, 12%, 0.55)`,
      border: `hsla(${hue}, 50%, 38%, 1)`,
      title: `hsla(${hue}, 60%, 75%, 1)`,
    }
  }
  return out
}

function frameForLight(): Record<FrameColor, { bg: string; border: string; title: string }> {
  const out = {} as Record<FrameColor, { bg: string; border: string; title: string }>
  for (const [key, hue] of Object.entries(FRAME_HUES)) {
    out[key as FrameColor] = {
      bg: `hsla(${hue}, 70%, 96%, 0.7)`,
      border: `hsla(${hue}, 50%, 65%, 1)`,
      title: `hsla(${hue}, 55%, 35%, 1)`,
    }
  }
  return out
}

function frameForMono(): Record<FrameColor, { bg: string; border: string; title: string }> {
  const out = {} as Record<FrameColor, { bg: string; border: string; title: string }>
  for (const key of Object.keys(FRAME_HUES)) {
    out[key as FrameColor] = { bg: '#ffffff', border: '#000000', title: '#000000' }
  }
  return out
}

const STICKY_BASE: Record<StickyColor, { bg: string; text: string }> = {
  yellow: { bg: '#fef9c3', text: '#1a1a1a' },
  pink:   { bg: '#fbcfe8', text: '#1a1a1a' },
  blue:   { bg: '#bfdbfe', text: '#1a1a1a' },
  green:  { bg: '#bbf7d0', text: '#1a1a1a' },
  orange: { bg: '#fed7aa', text: '#1a1a1a' },
  purple: { bg: '#ddd6fe', text: '#1a1a1a' },
  red:    { bg: '#fecaca', text: '#1a1a1a' },
  gray:   { bg: '#e5e7eb', text: '#1a1a1a' },
}

function stickyFor(mode: 'dark' | 'light' | 'mono'): Record<StickyColor, { bg: string; text: string }> {
  if (mode === 'mono') {
    const out = {} as Record<StickyColor, { bg: string; text: string }>
    for (const key of Object.keys(STICKY_BASE)) {
      out[key as StickyColor] = { bg: '#ffffff', text: '#000000' }
    }
    return out
  }
  return STICKY_BASE
}

export const THEMES: Record<ThemeName, CanvasPalette> = {
  dark: {
    canvasBg: '#09090b',
    gridLine: 'rgba(255, 255, 255, 0.08)',
    gridDot: 'rgba(255, 255, 255, 0.18)',
    defaultStroke: '#f7f8f8',
    defaultFill: null,
    textColor: '#f7f8f8',
    selectionFill: 'rgba(139, 92, 246, 0.18)',
    selectionStroke: '#8B5CF6',
    handleFill: '#8B5CF6',
    handleStroke: '#ffffff',
    snapGuide: '#ec4899',
    hoverGlow: 'rgba(139, 92, 246, 0.32)',
    presenceColors: ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#f472b6'],
    frameColors: frameForDark(),
    stickyColors: stickyFor('dark'),
    functionColors: FUNCTION_COLORS.dark,
    uiBg: 'rgba(22, 22, 28, 0.88)',
    uiBgElevated: '#191920',
    uiBorder: 'rgba(255, 255, 255, 0.10)',
    uiText: '#f7f8f8',
    uiTextMuted: '#a1a1aa',
    accent: '#8B5CF6',
  },
  light: {
    canvasBg: '#ffffff',
    gridLine: '#e4e4e7',
    gridDot: '#d4d4d8',
    defaultStroke: '#0f172a',
    defaultFill: '#ffffff',
    textColor: '#0f172a',
    selectionFill: 'rgba(104, 58, 204, 0.10)',
    selectionStroke: '#683ACC',
    handleFill: '#683ACC',
    handleStroke: '#ffffff',
    snapGuide: '#ec4899',
    hoverGlow: 'rgba(104, 58, 204, 0.16)',
    presenceColors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
    frameColors: frameForLight(),
    stickyColors: stickyFor('light'),
    functionColors: FUNCTION_COLORS.light,
    uiBg: 'rgba(255, 255, 255, 0.86)',
    uiBgElevated: '#ffffff',
    uiBorder: 'rgba(15, 23, 42, 0.10)',
    uiText: '#0f172a',
    uiTextMuted: '#71717a',
    accent: '#683ACC',
  },
  mono: {
    canvasBg: '#ffffff',
    gridLine: '#e0e0e0',
    gridDot: '#c0c0c0',
    defaultStroke: '#000000',
    defaultFill: '#ffffff',
    textColor: '#000000',
    selectionFill: 'rgba(0, 0, 0, 0.06)',
    selectionStroke: '#000000',
    handleFill: '#000000',
    handleStroke: '#ffffff',
    snapGuide: '#000000',
    hoverGlow: 'rgba(0, 0, 0, 0.1)',
    presenceColors: ['#000000', '#444444', '#666666', '#888888', '#aaaaaa'],
    frameColors: frameForMono(),
    stickyColors: stickyFor('mono'),
    functionColors: FUNCTION_COLORS.mono,
    uiBg: '#ffffff',
    uiBgElevated: '#f5f5f5',
    uiBorder: '#000000',
    uiText: '#000000',
    uiTextMuted: '#444444',
    accent: '#000000',
  },
}

export function getPalette(theme: ThemeName | 'system'): CanvasPalette {
  if (theme === 'system') {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
      return THEMES.dark
    }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return THEMES.dark
    }
    return THEMES.light
  }
  return THEMES[theme]
}
