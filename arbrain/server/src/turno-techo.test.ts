import { describe, expect, it } from 'vitest'
import { AGENT_TIMEOUT_MS, CHAT_ABSOLUTE_LIMIT_MS, CHAT_IDLE_LIMIT_MS, CHAT_STREAM_HARD_CAP_MS } from './config.js'
import { mensajeDeTurnoMuerto } from './agent.js'

describe('techo del turno de chat (incidente 30 sep: rediseño muerto a los 30:00)', () => {
  it('sin techo de tiempo total por defecto (11 oct 2026); solo la inactividad corta', () => {
    expect(CHAT_ABSOLUTE_LIMIT_MS).toBe(0)
    expect(CHAT_STREAM_HARD_CAP_MS).toBe(0)
    expect(CHAT_IDLE_LIMIT_MS).toBe(AGENT_TIMEOUT_MS)
  })
  it('el dueño ve qué pasó, no el diagnóstico crudo del SDK', () => {
    const m = mensajeDeTurnoMuerto('[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use', 'error_during_execution', false)
    expect(m).not.toContain('ede_diagnostic')
    expect(m).toContain('sigue')
    expect(mensajeDeTurnoMuerto(undefined, undefined, true)).toContain('techo de tiempo configurado')
    expect(mensajeDeTurnoMuerto('otro error', undefined, false)).toContain('otro error')
  })
})
