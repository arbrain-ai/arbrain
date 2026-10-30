import { IDENTITIES } from './engine.js'
import { ConsejoError, type ModelSettings, type ModelCatalog, type Packet, type Stage } from './types.js'

function parseChoice(choice: unknown) {
  if (!choice || typeof choice !== 'object' || Array.isArray(choice)) throw new ConsejoError('Modelo o esfuerzo inválido.', 400)
  const { model, effort } = choice as Record<string, unknown>
  if (typeof model !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,119}$/.test(model) ||
    (effort !== undefined && (typeof effort !== 'string' || !/^[a-z]{1,12}$/.test(effort)))) throw new ConsejoError('Modelo o esfuerzo inválido.', 400)
  return { model, ...(effort !== undefined ? { effort } : {}) }
}

/** Parse only user-selectable fields. Accounts and billing never come from the client. */
export function parseSettings(input: unknown): ModelSettings | undefined {
  if (input === undefined) return undefined
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ConsejoError('Ajustes de modelos inválidos.', 400)
  const result = {} as ModelSettings
  for (const provider of ['claude', 'openai'] as const) {
    const choice = (input as Record<string, unknown>)[provider]
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) throw new ConsejoError('Elige ambos modelos.', 400)
    result[provider] = parseChoice(choice)
  }
  const synthesis = (input as Record<string, unknown>).synthesis
  if (synthesis !== undefined) {
    const choice = parseChoice(synthesis)
    const provider = (synthesis as Record<string, unknown>).provider
    if (provider !== 'claude' && provider !== 'openai') throw new ConsejoError('Proveedor de síntesis inválido.', 400)
    result.synthesis = { ...choice, provider }
  }
  return result
}
export function selectedIdentities(settings?: ModelSettings) {
  return Object.fromEntries((['claude', 'openai'] as const).map(p => [p, { ...IDENTITIES[p], model: settings?.[p].model ?? IDENTITIES[p].model }])) as typeof IDENTITIES
}
/** Old packets retain the original Claude synthesis. New choices are frozen per turn. */
export function stageSelection(packet: Pick<Packet, 'settings' | 'identities'>, stage: Stage) {
  const provider = stage === 'synthesis' ? packet.settings?.synthesis?.provider ?? 'claude' : stage
  const choice = stage === 'synthesis' ? packet.settings?.synthesis ?? packet.settings?.claude : packet.settings?.[provider]
  return { identity: { ...packet.identities[provider], model: choice?.model ?? packet.identities[provider].model }, effort: choice?.effort }
}
export function validateCatalog(catalog: ModelCatalog, settings?: ModelSettings): void {
  const expected = selectedIdentities(settings)
  for (const p of ['claude', 'openai'] as const) {
    if (catalog[p].account !== expected[p].account) throw new Error(`La cuenta de ${p} cambió; no se envió el prompt.`)
    const model = catalog[p].models.find(m => m.model === expected[p].model)
    if (!model) throw new Error(`${expected[p].model} no está disponible en esta cuenta; elige otro modelo explícitamente.`)
    const effort = settings?.[p].effort
    if (effort && !model.efforts.includes(effort)) throw new Error(`${expected[p].model} no admite el esfuerzo ${effort}.`)
  }
  if (settings?.synthesis) {
    const choice = settings.synthesis
    const model = catalog[choice.provider].models.find(m => m.model === choice.model)
    if (!model) throw new Error(`${choice.model} no está disponible para Levy; elige otro modelo explícitamente.`)
    if (choice.effort && !model.efforts.includes(choice.effort)) throw new Error(`${choice.model} no admite el esfuerzo ${choice.effort} para Levy.`)
  }
}
