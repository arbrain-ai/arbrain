/**
 * Formato único de modelo, esfuerzo y tokens (motor estándar, 2 oct 2026). El chat (UsageBadge) y el
 * panel (Taller) pintan lo mismo con estas funciones, venga del motor que venga: Claude, Codex con
 * ChatGPT o Codex con un proveedor propio como DeepSeek. Regla: sin fuente real, el dato no se pinta.
 *
 * Lógica pura: tests/shared/uso-modelo.test.ts.
 */

export interface UsoModelo {
  /** Id crudo del modelo que respondió (el que reporta el motor), o null. */
  modelo: string | null
  /** Esfuerzo con que corrió, como lo dice el motor (`low`, `medium`...), o null. */
  esfuerzo: string | null
  /** Tokens consumidos (entrada + salida), o null si no hay medición. */
  tokens: number | null
  /** Contexto ocupado; `ventana` null cuando la fuente no dice el denominador. */
  contexto: { pct: number; ventana: number | null } | null
}

const mayus = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s

/**
 * «claude-sonnet-5-5[1m]» → «Sonnet 5.5»; «gpt-6-sol» → «GPT-6 Sol»; «deepseek/deepseek-v4.1-flash» →
 * «DeepSeek V4.1 Flash». Lo que no se reconoce va tal cual (sin el prefijo del proveedor).
 */
export function nombreModelo(id: string | null | undefined): string | null {
  if (!id) return null
  const limpio = id.trim().replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '')
  const sinProveedor = limpio.includes('/') ? limpio.slice(limpio.lastIndexOf('/') + 1) : limpio
  // Claude directo («claude-sonnet-4-5») o por OpenRouter («anthropic/claude-sonnet-4.5»): «Sonnet 4.5» (v1.1, el
  // selector del alumno mostraba el id crudo).
  const claude = /^claude-([a-z]+)-(\d+)(?:[.-](\d+))?$/i.exec(sinProveedor)
  if (claude) return `${mayus(claude[1])} ${claude[2]}${claude[3] ? `.${claude[3]}` : ''}`
  const gpt = /^gpt-([\d.]+)(?:-(.+))?$/i.exec(sinProveedor)
  if (gpt) return `GPT-${gpt[1]}${gpt[2] ? ` ${gpt[2].split('-').map(p => p === 'codex' ? 'Codex' : mayus(p)).join(' ')}` : ''}`
  const deepseek = /^deepseek-v([\d.]+)-(.+)$/i.exec(sinProveedor)
  if (deepseek) return `DeepSeek V${deepseek[1]} ${deepseek[2].split('-').map(mayus).join(' ')}`
  if (/^deepseek-flash$/i.test(sinProveedor)) return 'DeepSeek Flash'
  return sinProveedor || null
}

const ESFUERZOS: Record<string, string> = { minimal: 'mínimo', low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'muy alto', max: 'máximo' }
/** «low» → «bajo». Un nivel desconocido va tal cual. */
export const nombreEsfuerzo = (e: string | null | undefined): string | null => e ? ESFUERZOS[e] ?? e : null

/** 167583 → «168 K»; 1250000 → «1.3 M». */
export function tokensCortos(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')} M`
  if (n >= 1000) return `${Math.round(n / 1000)} K`
  return String(n)
}

/** 1_000_000 → «1M», 200_000 → «200K» (como la barra de estado del CLI). */
export const ventanaCorta = (n: number) => n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`

/** «19 % de 1M» o, si la fuente no dice la ventana, «19 % de contexto». */
export const contextoEnPalabras = (c: UsoModelo['contexto']) => c ? `${c.pct} % ${c.ventana ? `de ${ventanaCorta(c.ventana)}` : 'de contexto'}` : null

/** La línea compacta, idéntica en el chat y en el panel: «DeepSeek V4.1 Flash · bajo · 19 K tokens · 2 % de 1M». */
export function lineaUso(u: UsoModelo): string | null {
  return [nombreModelo(u.modelo), nombreEsfuerzo(u.esfuerzo), u.tokens != null ? `${tokensCortos(u.tokens)} tokens` : null, contextoEnPalabras(u.contexto)]
    .filter(Boolean).join(' · ') || null
}

/** El evento `usage` de un turno del chat (cualquier motor) en el formato único. */
export function usoDeTurno(u: { model?: string | null; effort?: string | null; inputTokens?: number; outputTokens?: number; contextUsed?: number | null; contextTotal?: number | null }): UsoModelo {
  const total = (u.inputTokens ?? 0) + (u.outputTokens ?? 0)
  const ventana = typeof u.contextTotal === 'number' && u.contextTotal > 0 ? u.contextTotal : null
  const usado = typeof u.contextUsed === 'number' && u.contextUsed >= 0 ? u.contextUsed : null
  return {
    modelo: u.model || null,
    esfuerzo: u.effort || null,
    tokens: total > 0 ? total : null,
    contexto: ventana && usado != null ? { pct: Math.round((usado / ventana) * 100), ventana } : null,
  }
}
