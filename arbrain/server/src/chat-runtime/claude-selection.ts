import { modeloParaProveedor } from '../cliente/proveedor.js'
import type { ModelInfo, Options, Query } from '@anthropic-ai/claude-agent-sdk'
import type { SessionOverrides, EffortLevel } from '../agent.js'
import { findClaudeModel, pinnedClaudeModel, getClaudeCatalog, readClaudeSettings, type ClaudeCapabilities } from './claude-capabilities.js'
import { nearestEffort } from './effort-control.js'
import { esEdicionCliente } from '../edicion.js'

export interface ClaudeSelection {
  account: string
  requestedModel: string
  model: string
  effort: EffortLevel | null
  fast: boolean
  ultracode: boolean
  adaptiveThinking: boolean
  observedAt: string
  source: string | null
}
type Settings = Awaited<ReturnType<typeof readClaudeSettings>>
function requireKnownSettings(settings: Settings): void {
  if (settings.unresolvedPolicy) throw new Error('La política Claude no se pudo resolver; no se enviará con ajustes supuestos.')
  if (settings.unresolvedModel) throw new Error('Una variable de entorno impide confirmar el modelo Claude; no se enviará con ajustes supuestos.')
  if (settings.unresolvedEffort) throw new Error('Una variable de entorno impide confirmar un esfuerzo compatible; no se enviará con ajustes supuestos.')
}
/**
 * 3 oct 2026: el SDK 0.3.288 dejó de anunciar `opus[1m]` (Opus 5.5 quedó en una
 * sola fila `opus`) y toda conversación que lo tenía guardado quedó bloqueada
 * con «No se pudo confirmar el modelo». Un modelo GUARDADO por conversación es
 * una preferencia vieja frente a un catálogo vivo que cambia con cada SDK:
 *  1. mismo modelo, otro sufijo de contexto (`opus[1m]` → `opus`): se usa la
 *     fila sin sufijo. Nunca al revés (no se concede un sufijo no pedido).
 *  2. modelo retirado del catálogo: cae al modelo configurado de la cuenta, igual
 *     que el esfuerzo guardado (2 oct). `source` lo deja visible.
 * Una elección EXPLÍCITA (selector de modelo) pasa `storedModel: 'reject'` y se
 * valida estricta: no se acepta guardar un modelo que la cuenta no anuncia.
 */
function resolveStoredModel(models: ClaudeCapabilities['models'], requested: string): ReturnType<typeof findClaudeModel> {
  const exact = findClaudeModel(models, requested)
  if (exact) return exact
  const bare = requested.replace(/\[[^\]]+\]$/, '')
  return bare !== requested ? findClaudeModel(models, bare) : undefined
}
/**
 * El modelo de la casa para la edición cliente (30 oct 2026, primer mensaje desde el teléfono de Daniel contra su
 * servidor: «No se pudo confirmar el modelo Claude»). Una cuenta de Claude recién conectada no trae `model` en ningún
 * settings.json y la persona todavía no eligió motor: en la instalación de Daniel eso sigue bloqueando (no se inventa
 * un modelo), pero al alumno se le responde con Opus 5.5 si su cuenta lo anuncia o, si no, con el modelo al que apunta
 * la fila `default` de su catálogo (siempre una fila que la cuenta anuncia, sin conceder un sufijo de contexto).
 */
export const MODELO_CASA = 'claude-opus-5-5'
export function filaDeLaCasa(models: ClaudeCapabilities['models']): ClaudeCapabilities['models'][number] | undefined {
  const sinSufijo = (m: ModelInfo) => !/\[[^\]]+\]$/.test(pinnedClaudeModel(m) ?? '')
  const de = (canonico: string) => models.filter(m => m.value !== 'default' && pinnedClaudeModel(m)?.replace(/\[[^\]]+\]$/, '') === canonico)
    .sort((a, b) => Number(sinSufijo(b)) - Number(sinSufijo(a)))[0]
  const porDefecto = models.find(m => m.value === 'default')?.resolvedModel
  return de(MODELO_CASA) ?? (porDefecto ? de(porDefecto.replace(/\[[^\]]+\]$/, '')) : undefined)
}
/** Freeze user intent without replacing unknown configuration with catalog default (salvo el modelo de la casa en cliente). */
export function freezeClaudeSelection(account: string, overrides: SessionOverrides, explicitEffort: string | undefined, catalog: ClaudeCapabilities, settings: Settings, storedModel: 'fallback' | 'reject' = 'fallback', env: NodeJS.ProcessEnv = process.env): ClaudeSelection {
  if (!['default', 'bro'].includes(account) || catalog.account !== account) throw new Error('Claude selection account mismatch')
  requireKnownSettings(settings)
  let requestedModel = overrides.model ?? settings.configuredModel
  let row = requestedModel ? resolveStoredModel(catalog.models, requestedModel) : undefined
  let source = overrides.model ? 'conversation' : settings.settingsSource
  if (!row && overrides.model && storedModel === 'fallback' && settings.configuredModel) {
    requestedModel = settings.configuredModel
    row = findClaudeModel(catalog.models, requestedModel)
    source = `conversation-unavailable:${overrides.model}`
  }
  if (!row && storedModel === 'fallback' && esEdicionCliente(env)) {
    const casa = filaDeLaCasa(catalog.models)
    if (casa) { source = requestedModel ? `casa:no-disponible:${requestedModel}` : 'casa'; requestedModel = casa.value; row = casa }
  }
  const model = row && pinnedClaudeModel(row)
  if (!requestedModel || !row || !model) throw new Error('No se pudo confirmar el modelo Claude. Elige un modelo disponible en esta cuenta.')
  // 2 oct 2026: sin elección, el default es «medium» (o el nivel anunciado más
  // cercano), no el esfuerzo configurado de la cuenta (xhigh). Un override
  // guardado que este modelo ya no anuncia (cambio de modelo) cae al default en
  // vez de bloquear el turno; uno pedido explícitamente sí se valida abajo.
  const levels = row.supportedEffortLevels ?? []
  const storedEffort = overrides.effort && levels.includes(overrides.effort as EffortLevel) ? overrides.effort : null
  const chosenEffort = explicitEffort ?? storedEffort
  let effort = chosenEffort ?? nearestEffort(levels)
  // SDK declares standing Ultracode as xhigh plus workflow orchestration.
  if (overrides.ultracode) {
    if (chosenEffort && chosenEffort !== 'xhigh') throw new Error('Ultracode requiere xhigh; desactívalo para elegir otro esfuerzo.')
    effort = 'xhigh'
  }
  if (!row.supportedEffortLevels?.length && row.supportsEffort !== true) {
    if (chosenEffort || overrides.ultracode) throw new Error('Este modelo Claude no anuncia soporte para el esfuerzo elegido.')
    effort = null
  } else if (!effort || !row.supportedEffortLevels?.includes(effort as EffortLevel)) {
    throw new Error('No se pudo confirmar un esfuerzo compatible. Elige uno anunciado por este modelo Claude.')
  }
  const selection: ClaudeSelection = { account, requestedModel, model, effort: effort as EffortLevel | null, fast: overrides.fast, ultracode: overrides.ultracode, adaptiveThinking: row.supportsAdaptiveThinking === true, observedAt: new Date().toISOString(), source }
  checkClaudeSelection(selection, account, catalog)
  return selection
}
export function checkClaudeSelection(selection: ClaudeSelection, account: string, catalog: ClaudeCapabilities, nativeSession = false): ModelInfo {
  if (selection.account !== account || catalog.account !== account) throw new Error('Claude selection account mismatch')
  // A native Query started with a canonical ID can omit its bare alias row
  // while keeping the same model's qualified row (observed with Opus 5).
  // For an already accepted BARE ID only, that row can confirm capabilities.
  // It must never rewrite the selected model or opt it into that qualifier.
  const exact = findClaudeModel(catalog.models, selection.model)
  const candidates = !exact && nativeSession && selection.model.startsWith('claude-') && !/\[[^\]]+\]$/.test(selection.model)
    ? catalog.models.filter(m => m.value !== 'default' && pinnedClaudeModel(m)?.replace(/\[[^\]]+\]$/, '') === selection.model)
    : []
  if (candidates.length > 1 && candidates.some(m => (selection.effort && !m.supportedEffortLevels?.includes(selection.effort)) || (selection.fast && m.supportsFastMode !== true) || (selection.adaptiveThinking && m.supportsAdaptiveThinking !== true))) {
    throw new Error('Las variantes del catálogo Claude no confirman las mismas capacidades requeridas; no se sustituirá.')
  }
  const row = exact ?? candidates[0]
  if (!row || (exact && pinnedClaudeModel(exact) !== selection.model)) throw new Error('El modelo Claude aceptado ya no está disponible; no se sustituirá.')
  if (selection.effort && !row.supportedEffortLevels?.includes(selection.effort)) throw new Error('El esfuerzo Claude aceptado ya no está disponible.')
  if (selection.fast && row.supportsFastMode !== true) throw new Error('Fast no está anunciado para este modelo Claude; no se cambiará de modelo.')
  if (selection.ultracode && selection.effort !== 'xhigh') throw new Error('Ultracode requiere xhigh.')
  if (selection.adaptiveThinking && row.supportsAdaptiveThinking !== true) throw new Error('El modo de pensamiento Claude aceptado ya no está disponible.')
  return row
}
export async function resolveClaudeSelection(cwd: string, account: string, overrides: SessionOverrides, effort?: string, storedModel: 'fallback' | 'reject' = 'fallback'): Promise<ClaudeSelection> {
  const [catalog, settings] = await Promise.all([getClaudeCatalog(cwd).read(account), readClaudeSettings(cwd, account)])
  return freezeClaudeSelection(account, overrides, effort, catalog, settings, storedModel)
}
export async function validateClaudeSelection(cwd: string, account: string, selection: ClaudeSelection, query: Pick<Query, 'supportedModels'>): Promise<void> {
  // Reuse the leased native process. No extra Query or user prompt for preflight.
  // Fresh settings catch newly introduced env/policy overrides while preserving
  // the accepted values when ordinary defaults have changed during the queue.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const [models, settings] = await Promise.race([
      Promise.all([query.supportedModels(), readClaudeSettings(cwd, account)]),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Claude selection preflight timed out')), 15_000) }),
    ])
    requireKnownSettings(settings)
    checkClaudeSelection(selection, account, { account, models, observedAt: new Date().toISOString(), commandNames: [], agentNames: [] }, true)
  } finally { clearTimeout(timer) }
}
export function claudeSelectionOptions(selection: ClaudeSelection): Pick<Options, 'model' | 'effort' | 'thinking' | 'settings'> {
  return {
    model: modeloParaProveedor(selection.model)!,
    ...(selection.effort ? { effort: selection.effort } : {}),
    ...(selection.adaptiveThinking ? { thinking: { type: 'adaptive', display: 'summarized' } as const } : {}),
    // Explicit false prevents inherited settings from re-enabling these flags.
    settings: { fastMode: selection.fast, ultracode: selection.ultracode },
  }
}
