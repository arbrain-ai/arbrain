import type { ModelInfo, Options } from '@anthropic-ai/claude-agent-sdk'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { homedir } from 'node:os'
import path from 'node:path'
import { DEFAULT_ACCOUNT_CONFIG_DIR } from '../config.js'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { ClaudeInteractiveSession, requireClaudeSubscription } from './claude-session.js'
import { dirClaudeAlternaO } from '../cuentas-alternas.js'

export interface ClaudeCapabilities { configuredModel?: string | null; configuredEffort?: string | null; settingsSource?: string | null; account: string; observedAt: string; models: ModelInfo[]; commandNames: string[]; agentNames: string[] }
/** Preserve advertised context qualifiers even when resolvedModel omits them. */
export function pinnedClaudeModel(row: ModelInfo): string | undefined {
  const canonical = row.resolvedModel ?? (row.value.startsWith('claude-') ? row.value : undefined)
  if (!canonical) return undefined
  const qualifier = row.value.match(/\[[^\]]+\]$/)?.[0]
  return qualifier && !/\[[^\]]+\]$/.test(canonical) ? canonical + qualifier : canonical
}
export function findClaudeModel(models: ModelInfo[], selected: string | null | undefined): ModelInfo | undefined {
  if (!selected || selected === 'default') return undefined // advertised default is not the user's effective settings
  return models.find(model => model.value === selected) ?? models.find(model => model.value !== 'default' && pinnedClaudeModel(model) === selected)
}
type Loader = (account: string) => Promise<ClaudeCapabilities>
/** Account-specific metadata, never a user prompt. Failed reads are not cached. */
export class ClaudeCapabilityCatalog {
  private entries = new Map<string, { expiresAt: number; pending: Promise<ClaudeCapabilities> }>()
  constructor(private load: Loader, private ttlMs = 30_000, private now = () => Date.now()) {}
  read(account: string): Promise<ClaudeCapabilities> {
    if (!['default', 'bro'].includes(account)) return Promise.reject(new Error('Unknown Claude account'))
    const old = this.entries.get(account)
    if (old && old.expiresAt > this.now()) return old.pending
    const entry = { expiresAt: Infinity, pending: Promise.resolve(null as unknown as ClaudeCapabilities) }
    entry.pending = this.load(account).then(result => {
      if (result.account !== account) throw new Error('Claude capability account mismatch')
      entry.expiresAt = this.now() + this.ttlMs
      return result
    }).catch(error => { if (this.entries.get(account) === entry) this.entries.delete(account); throw error })
    this.entries.set(account, entry)
    return entry.pending
  }
}
export function summarizeClaudeSettings(resolved: { effective: { model?: unknown; effortLevel?: unknown; modelSettings?: Record<string, { effortLevel?: unknown }>; policyHelper?: unknown; env?: Record<string, unknown> }; provenance?: { model?: { source?: string } } }, inherited: Record<string, unknown>) {
  const settings = resolved.effective
  // OpenRouter (edición cliente, contrato §4; 11 oct 2026): ANTHROPIC_MODEL lo fija el propio daemon con el modelo
  // verificado. Es el modelo configurado, no una variable ajena que impida confirmarlo.
  const propio = inherited.ARBRAIN_PROVEEDOR_CLAUDE === 'openrouter' && typeof inherited.ANTHROPIC_MODEL === 'string' && !settings.env?.ANTHROPIC_MODEL
  const unknownModel = !!settings.policyHelper || (!propio && !!inherited.ANTHROPIC_MODEL) || !!settings.env?.ANTHROPIC_MODEL
  const unknownEffort = !!settings.policyHelper || !!inherited.CLAUDE_CODE_EFFORT_LEVEL || !!settings.env?.CLAUDE_CODE_EFFORT_LEVEL
  return {
    configuredModel: unknownModel ? null : typeof settings.model === 'string' ? settings.model : propio ? inherited.ANTHROPIC_MODEL as string : null,
    configuredEffort: !unknownEffort && typeof settings.effortLevel === 'string' ? settings.effortLevel : null,
    settingsSource: unknownModel ? null : resolved.provenance?.model?.source ?? (propio ? 'openrouter' : null),
    ...(unknownModel ? { unresolvedModel: true } : {}),
    ...(settings.policyHelper ? { unresolvedPolicy: true } : {}),
    ...(unknownEffort ? { unresolvedEffort: true } : {}),
    ...(!unknownEffort && settings.modelSettings ? { modelEfforts: Object.fromEntries(Object.entries(settings.modelSettings).filter(([, v]) => typeof v?.effortLevel === 'string').map(([k, v]) => [k, v.effortLevel as string])) } : {}),
  }
}
/** Resolve with the SDK merge engine in an account-isolated process. Never
 * mutate the daemon's CLAUDE_CONFIG_DIR or expose whole settings/credentials. */
export async function readClaudeSettings(cwd: string, account: string): Promise<ReturnType<typeof summarizeClaudeSettings>> {
  if (!['default', 'bro'].includes(account)) throw new Error('Unknown Claude account')
  const env = { ...process.env }
  if (account === 'bro') env.CLAUDE_CONFIG_DIR = dirClaudeAlternaO()
  else if (DEFAULT_ACCOUNT_CONFIG_DIR) env.CLAUDE_CONFIG_DIR = DEFAULT_ACCOUNT_CONFIG_DIR
  else delete env.CLAUDE_CONFIG_DIR
  const code = `const {resolveSettings}=await import(process.argv[1]);const r=await resolveSettings({cwd:process.argv[2],settingSources:['project','user']});const summarize=(${summarizeClaudeSettings.toString()});console.log(JSON.stringify(summarize(r,process.env)));`
  const sdkUrl = pathToFileURL(createRequire(import.meta.url).resolve('@anthropic-ai/claude-agent-sdk')).href
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', code, sdkUrl, cwd], { env, timeout: 10_000, maxBuffer: 65536 })
  return JSON.parse(stdout)
}
const sharedCatalogs = new Map<string, ClaudeCapabilityCatalog>()
export function getClaudeCatalog(cwd: string): ClaudeCapabilityCatalog {
  let catalog = sharedCatalogs.get(cwd)
  if (!catalog) { catalog = createClaudeCatalog(cwd); sharedCatalogs.set(cwd, catalog) }
  return catalog
}
export function createClaudeCatalog(cwd: string): ClaudeCapabilityCatalog {
  return new ClaudeCapabilityCatalog(async account => {
    const options: Options = { cwd, settingSources: ['project', 'user'], settings: { disableAllHooks: true }, tools: [], permissionMode: 'default', canUseTool: async () => ({ behavior: 'deny', message: 'Metadata only' }), env: { CLAUDECLAW_DAEMON: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } }
    const session = new ClaudeInteractiveSession({ owner: 'host-capability-discovery', account, conversationId: randomUUID() }, options, () => {})
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        (async () => {
          requireClaudeSubscription(await session.query.accountInfo())
          const init = await session.query.initializationResult()
          const settings = await readClaudeSettings(cwd, account)
          return { ...settings, account, observedAt: new Date().toISOString(), models: init.models, commandNames: init.commands.map(command => command.name), agentNames: init.agents.map(agent => agent.name) }
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Claude capability discovery timed out')), 15_000) }),
      ])
    } finally { clearTimeout(timer); session.close(); await session.drained }
  })
}
