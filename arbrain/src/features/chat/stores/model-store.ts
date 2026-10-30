import { nombreModelo } from '@/shared/lib/uso-modelo'

const DISPLAY_NAMES: Record<string, string> = {
  'claude-fable-5-1': 'Fable 5.1',
  'claude-fable-5': 'Fable 5',
  'claude-opus-5-5': 'Opus 5.5',
  'claude-opus-5': 'Opus 5',
  'claude-opus-4-8': 'Opus 4.8',
  'claude-opus-4-7': 'Opus 4.7',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-sonnet-5': 'Sonnet 5',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-haiku-5-5': 'Haiku 5.5',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  // OpenAI (espacio codex, 4 sep 2026)
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-6-sol': 'GPT-6 Sol',
  'gpt-6-luna': 'GPT-6 Luna',
  'gpt-5.6-sol': 'GPT-5.6 Sol',
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-5.6-luna': 'GPT-5.6 Luna',
  'gpt-5.5': 'GPT-5.5',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'gpt-5.3-codex-spark': 'GPT-5.3 Codex Spark',
}

/** "claude-opus-4-8[1m]" → "Opus 4.8" (con fallback razonable para ids desconocidos) */
export function modelDisplayName(id: string | null | undefined): string | null {
  if (!id) return null
  const base = id.replace(/\[[^\]]+\]$/, '') // sufijo de contexto del SDK: [1m]
  if (DISPLAY_NAMES[base]) return DISPLAY_NAMES[base]
  // Modelos por OpenRouter («openai/gpt-6-luna»): el formato único del uso.
  if (base.includes('/')) return nombreModelo(base)
  const pretty = base
    .replace(/^claude-/, '')
    .replace(/-\d{8,}$/, '') // sufijo de fecha (haiku-4-5-20251001)
    .replace(/-(\d+)-(\d+)$/, ' $1.$2')
    .replace(/-(\d+)$/, ' $1')
    .replace(/-/g, ' ')
  return pretty.charAt(0).toUpperCase() + pretty.slice(1)
}
