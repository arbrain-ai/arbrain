/**
 * Empuja una inyección al motor vivo de ESTE proceso (agent-server sin corredor, o el corredor).
 * Claude: la sesión persistente del pool (SDKUserMessage priority 'next'). Codex: todavía no
 * (turn/steer existe en codex-cli 0.154; ver PLAN de docs/builds/inyeccion-mitad-de-turno-2026-10-07).
 * false = no entró; el supervisor la deja pendiente y al cerrar el turno sale como turno normal.
 */
import { isCodexAccount } from '../codex-agent.js'
import { claudeRuntimePool } from './claude-pool.js'
import type { Injection } from './inyecciones.js'
import type { TurnIdentity } from './journal.js'

export function inyectarEnMotor(turn: TurnIdentity, injection: Injection): boolean {
  if (isCodexAccount(turn.account)) return false
  const input = injection.input as { message?: unknown; imageUrl?: unknown; audioUrl?: unknown } | null
  // Adjuntos: el turno normal ya sabe prepararlos; aquí solo texto.
  if (!input || typeof input.message !== 'string' || !input.message.trim() || input.imageUrl || input.audioUrl) return false
  return claudeRuntimePool.inject(turn, injection.id, input.message)
}

/** Qué inyecciones del turno (ya cerrado) no alcanzó a leer el modelo: Stop antes de la siguiente herramienta. */
export function sinLeerEnMotor(turn: TurnIdentity): string[] {
  if (isCodexAccount(turn.account)) return []
  return claudeRuntimePool.injectionOutcome(turn)?.sinLeer ?? []
}
