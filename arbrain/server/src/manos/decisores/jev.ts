/**
 * Decisor `jev`: TypeSafe Jev. Dos vías (2 oct 2026):
 *  - `openrouter` (preferida): POST https://openrouter.ai/api/alpha/decisions con
 *    `OPENROUTER_API_KEY`, modelo `typesafe/jev-1.13`. Medido: 0.32–0.45 s y ~$0.00002 por decisión.
 *  - `gateway`: Vercel AI Gateway (AI SDK 7, `experimental_evaluate`), exige créditos pagados.
 * `MANOS_JEV_VIA` fuerza una vía; sin ella se usa OpenRouter si hay llave.
 *
 * Devuelve probabilidades por opción, no texto: la confianza es real y se
 * compara con los umbrales del contrato. Si no llega al umbral, la decisión
 * NO se toma aquí: lanza `CedeDecision` y el registro pasa al respaldo.
 *
 * Credencial: `OPENROUTER_API_KEY`, o `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN`
 * para el Gateway. Nunca se imprimen.
 */
import { UMBRAL_CAMBIA_ESTADO, UMBRAL_NORMAL, type Decision, type Decisor, type PedidoDecidir } from '../contrato.js'

export type ViaJev = 'openrouter' | 'gateway'
export function viaJev(env: NodeJS.ProcessEnv = process.env): ViaJev | null {
  const forzada = env.MANOS_JEV_VIA?.trim()
  if (forzada === 'openrouter') return env.OPENROUTER_API_KEY?.trim() ? 'openrouter' : null
  if (forzada === 'gateway') return env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim() ? 'gateway' : null
  if (env.OPENROUTER_API_KEY?.trim()) return 'openrouter'
  if (env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim()) return 'gateway'
  return null
}
const modeloJev = (via: ViaJev) => process.env.MANOS_JEV_MODELO || (via === 'openrouter' ? 'typesafe/jev-1.13' : 'typesafe-ai/jev')
export const MODELO_JEV = modeloJev(viaJev() ?? 'openrouter')

export class CedeDecision extends Error {
  constructor(motivo: string, readonly parcial?: Partial<Decision>) { super(motivo) }
}

export function jevConfigurado(env: NodeJS.ProcessEnv = process.env): boolean {
  return viaJev(env) !== null
}

/** Jev por el endpoint de decisiones de OpenRouter (mismo cuerpo que /v1/systemone de TypeSafe). */
async function evaluarOpenRouter(cuerpo: { model: string; state: unknown; questions: unknown }, timeoutMs: number): Promise<any> {
  const res = await fetch('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Arbrain manos' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const d: any = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${String(d?.error?.message ?? '').slice(0, 160)}`)
  return { answers: d?.result?.answers ?? d?.answers, usage: { inputTokens: d?.usage?.prompt_tokens ?? d?.usage?.input_tokens }, costo: d?.usage?.cost }
}

export class DecisorJev implements Decisor {
  readonly nombre = 'jev'
  constructor(private readonly timeoutMs = Number(process.env.MANOS_JEV_TIMEOUT_MS || 15_000)) {}

  async decidir(p: PedidoDecidir): Promise<Decision> {
    const via = viaJev()
    if (!via) throw new CedeDecision('jev sin credencial (OPENROUTER_API_KEY, AI_GATEWAY_API_KEY o VERCEL_OIDC_TOKEN)')
    const t0 = performance.now()
    let r: any
    // El endpoint exige JSON puro: sin undefined ni tipos no serializables.
    const state = JSON.parse(JSON.stringify(p.estado ?? {}))
    const questions = { eleccion: { type: 'choice', instructions: p.pregunta, criteria: p.opciones } }
    if (via === 'openrouter') {
      try { r = await evaluarOpenRouter({ model: modeloJev(via), state, questions }, this.timeoutMs) }
      catch (e) { throw new CedeDecision(`jev (openrouter) falló: ${(e as Error).name}: ${(e as Error).message.slice(0, 200)}`) }
    } else try {
      const { experimental_evaluate: evaluate } = await import('ai') as any
      r = await evaluate({
        model: modeloJev(via),
        state,
        questions,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (e) {
      throw new CedeDecision(`jev falló: ${(e as Error).name}: ${(e as Error).message.slice(0, 200)}`)
    }
    const ms = performance.now() - t0
    const a = r?.answers?.eleccion
    const g = r?.providerMetadata?.gateway
    const costo = r?.costo != null ? Number(r.costo) : g?.cost != null ? Number(g.cost) : null
    if (a?.type !== 'choice' || !Object.hasOwn(p.opciones, a.choice)) throw new CedeDecision('jev devolvió una opción fuera del catálogo', { ms, costo_usd: costo })
    const confianza = typeof a.probabilities?.[a.choice] === 'number' ? a.probabilities[a.choice] : null
    const umbral = p.cambia_estado ? UMBRAL_CAMBIA_ESTADO : UMBRAL_NORMAL
    const decision: Decision = { eleccion: a.choice, confianza, decisor: this.nombre, ms, costo_usd: costo, tokens_entrada: r?.usage?.inputTokens }
    if (confianza === null || confianza < umbral) throw new CedeDecision(`confianza ${confianza ?? '?'} < ${umbral}`, decision)
    return decision
  }
}
