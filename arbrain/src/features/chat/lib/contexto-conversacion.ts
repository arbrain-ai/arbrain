/**
 * El contexto de UNA conversación para la barra de escribir (2 oct 2026, pedido de Daniel): modelo,
 * tokens y % de la ventana viven junto al selector de modelo y esfuerzo, no debajo de cada respuesta.
 * Fuente: el evento `usage` del ÚLTIMO turno del asistente que lo trae (lo que reportó el motor). Un turno
 * en curso todavía no lo trae: el indicador conserva el anterior y se actualiza al terminar.
 * Sin fuente real, el dato no aparece. Formato único con el panel: shared/lib/uso-modelo.
 *
 * Lógica pura: tests/chat/contexto-conversacion.test.ts.
 */
import { lineaUso, tokensCortos, usoDeTurno, type UsoModelo } from '../../../shared/lib/uso-modelo'

interface UsoCrudo {
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  durationMs?: number
  contextUsed?: number | null
  contextTotal?: number | null
  model?: string | null
  effort?: string | null
}

interface MensajeConUso { role: string; streaming?: boolean; usage?: UsoCrudo }

export interface ContextoConversacion {
  uso: UsoModelo
  /** «Opus 5.5 · alto · 4 K tokens · 8 % de 1M» (la misma línea del panel). */
  linea: string
  /** % exacto de la ventana (0-100), null si el motor no dijo la ventana. */
  pct: number | null
  usado: number | null
  ventana: number | null
}

const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Mensajes en orden cronológico; devuelve null si ningún turno terminado trae dato. */
export function contextoDeConversacion(mensajes: readonly MensajeConUso[]): ContextoConversacion | null {
  for (let i = mensajes.length - 1; i >= 0; i--) {
    const m = mensajes[i]
    if (m.role !== 'assistant' || m.streaming || !m.usage) continue
    const uso = usoDeTurno(m.usage)
    const linea = lineaUso(uso)
    if (!linea) continue
    const ventana = numero(m.usage.contextTotal) && m.usage.contextTotal > 0 ? m.usage.contextTotal : null
    const usado = numero(m.usage.contextUsed) && m.usage.contextUsed >= 0 ? m.usage.contextUsed : null
    const pct = ventana && usado != null ? Math.min(100, (usado / ventana) * 100) : null
    return { uso, linea, pct, usado, ventana }
  }
  return null
}

/** «8 %», «<1 %» cuando hay uso pero redondea a cero. */
export const textoPct = (pct: number) => pct > 0 && pct < 1 ? '<1 %' : `${Math.round(pct)} %`

/** Semáforo del anillo: ≥90 rojo, ≥70 ámbar. */
export const nivelPct = (pct: number | null): 'ok' | 'aviso' | 'alto' | 'sin-dato' =>
  pct == null ? 'sin-dato' : pct >= 90 ? 'alto' : pct >= 70 ? 'aviso' : 'ok'

function duracion(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`
}

/**
 * El desglose de UN turno para el tooltip de la hora: «520 entrada · 4 K salida · 39.6 s · $0.3253».
 * Cada pieza solo si el motor la reportó (un costo cero es suscripción, no se pinta).
 */
export function detalleTurno(u: UsoCrudo | undefined | null): string | null {
  if (!u) return null
  const partes = [
    numero(u.inputTokens) && u.inputTokens > 0 ? `${tokensCortos(u.inputTokens)} entrada` : null,
    numero(u.outputTokens) && u.outputTokens > 0 ? `${tokensCortos(u.outputTokens)} salida` : null,
    numero(u.durationMs) && u.durationMs > 0 ? duracion(u.durationMs) : null,
    numero(u.costUsd) && u.costUsd > 0 ? `$${u.costUsd.toFixed(4)}` : null,
  ].filter(Boolean)
  return partes.length ? partes.join(' · ') : null
}
