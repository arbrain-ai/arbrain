/** Voz por agente de Live. Puro (sin env) para que la UI y el servidor compartan el mismo vocabulario. */
export type LiveAgent = 'levy' | 'trinity' | 'sensei'
export const LIVE_AGENTS: readonly LiveAgent[] = ['levy', 'trinity', 'sensei']

/** Voces por defecto (ElevenLabs). Sobrescribibles por env en el servidor: LIVE_VOICE_LEVY / _TRINITY / _SENSEI. */
export const DEFAULT_AGENT_VOICES: Record<LiveAgent, { voiceId: string; label: string }> = {
  // Voz premade original del proveedor: elección definitiva (4 oct 15:09); la variante «Dominant, Firm» se descartó.
  levy: { voiceId: 'pNInz6obpgDQGcFmaJgB', label: 'Adam' },
  trinity: { voiceId: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah (voz del onboarding)' }, // firmada por el dueño 4 oct 15:05
  sensei: { voiceId: 'HNSF1CTQmub252yhXROX', label: 'God' }, // firmada por el dueño 4 oct 15:05
}

export function normalizeAgent(value: unknown): LiveAgent {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (LIVE_AGENTS as readonly string[]).includes(key) ? (key as LiveAgent) : 'levy'
}

/** Id de voz del agente; el id nunca viene del cliente, solo el nombre del agente. */
export function voiceIdFor(agent: LiveAgent, env: Record<string, string | undefined> = {}): string {
  const override = env[`LIVE_VOICE_${agent.toUpperCase()}`]?.trim()
  return override && /^[A-Za-z0-9]{10,40}$/.test(override) ? override : DEFAULT_AGENT_VOICES[agent].voiceId
}
