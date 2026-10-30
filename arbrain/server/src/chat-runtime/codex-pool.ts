import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CodexRpcClient, spawnCodexRpc } from './codex-rpc.js'
import { nearestEffort } from './effort-control.js'

/** `apiKey`: espacio servido con un proveedor propio (motor estándar, 2 oct 2026). Sin login de ChatGPT; antes de
 *  lanzar el proceso se prepara su CODEX_HOME y el hijo recibe solo la variable de su llave. */
export interface CodexAccount { home: string; apiKey?: { prepare: () => void; env: () => NodeJS.ProcessEnv } }
export interface CodexSelection { model: string; effort: string | null; serviceTier: string }
export interface RuntimeModel {
  value: string
  displayName: string
  description: string
  supportsEffort: boolean
  supportedEfforts: string[]
  defaultEffort: string | null
  serviceTiers: Array<{ id: string; name: string; description: string }>
  inputModalities: string[]
  contextWindow: number | null
  maxContextWindow: number | null
  effectiveContextPercent: number | null
  contextSource: 'runtime-cache' | 'unavailable'
}
export type Connection = Pick<CodexRpcClient, 'request' | 'closed' | 'onDisconnect' | 'close' | 'onNotification' | 'onServerRequest' | 'respond' | 'reject'>
type Factory = (options: { account: string; home: string; cwd: string; bin: string; env?: NodeJS.ProcessEnv }) => Connection

/** Shared process per explicitly configured account. No account fallback or retries of mutations. */
export class CodexRuntimePool {
  private entries = new Map<string, { client: Connection; ready: Promise<Connection> }>()
  constructor(private options: {
    accounts: Readonly<Record<string, CodexAccount>>
    cwd: string
    bin: string
    factory?: Factory
  }) {}

  async connection(account: string): Promise<Connection> {
    const config = this.options.accounts[account]
    if (!Object.hasOwn(this.options.accounts, account) || !config?.home) throw new Error('Unknown Codex account')
    const existing = this.entries.get(account)
    if (existing && !existing.client.closed) return existing.ready
    let env: NodeJS.ProcessEnv | undefined
    if (config.apiKey) { config.apiKey.prepare(); env = config.apiKey.env() }
    const client = (this.options.factory ?? spawnCodexRpc)({ account, home: config.home, cwd: this.options.cwd, bin: this.options.bin, ...(env ? { env } : {}) })
    const entry = { client, ready: Promise.resolve(client) }
    // Install before asynchronous auth so simultaneous calls reuse the same connection.
    this.entries.set(account, entry)
    client.onDisconnect(() => { if (this.entries.get(account) === entry) this.entries.delete(account) })
    // Proveedor propio: la llave va por env_key; no hay cuenta de ChatGPT que verificar.
    entry.ready = config.apiKey ? Promise.resolve(client) : client.request<{ account: { type?: string } | null }>('account/read', { refreshToken: false }).then(result => {
      if (result.account?.type !== 'chatgpt') throw new Error('ChatGPT subscription login is required; API billing is not enabled for this chat')
      return client
    }).catch(error => {
      if (this.entries.get(account) === entry) this.entries.delete(account)
      client.close()
      throw error
    })
    return entry.ready
  }

  async models(account: string): Promise<RuntimeModel[]> {
    const client = await this.connection(account)
    const metadata = await this.contextMetadata(account)
    const models: RuntimeModel[] = []
    let cursor: string | undefined
    const cursors = new Set<string>()
    do {
      const page = await client.request<{ data: Array<Record<string, unknown>>; nextCursor?: string | null }>('model/list', { includeHidden: false, ...(cursor ? { cursor } : {}) })
      if (!Array.isArray(page.data)) throw new Error('Invalid model catalog from App Server')
      for (const model of page.data) {
        if (typeof model.model !== 'string') throw new Error('Model catalog entry has no model id')
        const efforts = Array.isArray(model.supportedReasoningEfforts)
          ? model.supportedReasoningEfforts.flatMap(e => typeof e?.reasoningEffort === 'string' ? [e.reasoningEffort] : []) : []
        const context = metadata.get(model.model)
        models.push({
          value: model.model,
          displayName: typeof model.displayName === 'string' ? model.displayName : model.model,
          description: typeof model.description === 'string' ? model.description : '',
          supportsEffort: efforts.length > 0, supportedEfforts: efforts,
          defaultEffort: typeof model.defaultReasoningEffort === 'string' ? model.defaultReasoningEffort : null,
          serviceTiers: Array.isArray(model.serviceTiers) ? model.serviceTiers.filter(t => typeof t?.id === 'string').map(t => ({ id: t.id, name: String(t.name ?? t.id), description: String(t.description ?? '') })) : [],
          inputModalities: Array.isArray(model.inputModalities) ? model.inputModalities.filter((m): m is string => typeof m === 'string') : [],
          contextWindow: context?.window ?? null, maxContextWindow: context?.maximum ?? null,
          effectiveContextPercent: context?.percent ?? null, contextSource: context ? 'runtime-cache' : 'unavailable',
        })
      }
      cursor = page.nextCursor ?? undefined
      if (cursor && cursors.has(cursor)) throw new Error('Model catalog returned a repeated cursor')
      if (cursor) cursors.add(cursor)
    } while (cursor)
    return models
  }

  /** Validate exact model options before sending a mutation, without silently clamping efforts. */
  async resolveSelection(account: string, selection: { model: string; effort?: string | null; serviceTier?: string | null }): Promise<CodexSelection> {
    const model = await this.validateSelection(account, selection)
    // 2 oct 2026: sin elección el default es «medium» (o el nivel anunciado más cercano), no el del config.toml ni el del modelo.
    const effort = selection.effort ?? nearestEffort(model.supportedEfforts) ?? model.defaultEffort
    if (model.supportsEffort && !effort) throw new Error('The runtime did not announce a default reasoning effort; choose one explicitly')
    if (effort && !model.supportedEfforts.includes(effort)) throw new Error('The runtime default reasoning effort is not supported by this model')
    return { model: model.value, effort, serviceTier: selection.serviceTier ?? 'default' }
  }

  async validateSelection(account: string, selection: { model: string; effort?: string | null; serviceTier?: string | null }): Promise<RuntimeModel> {
    const model = (await this.models(account)).find(m => m.value === selection.model)
    if (!model) throw new Error('The selected model is not available for this account')
    if (selection.effort && !model.supportedEfforts.includes(selection.effort)) throw new Error('This model does not support the selected reasoning effort')
    if (selection.serviceTier && selection.serviceTier !== 'default' && !model.serviceTiers.some(t => t.id === selection.serviceTier)) {
      throw new Error('This model does not support the selected service tier')
    }
    return model
  }

  close(): void {
    for (const entry of [...this.entries.values()]) entry.client.close()
    this.entries.clear()
  }

  private async contextMetadata(account: string): Promise<Map<string, { window: number | null; maximum: number | null; percent: number | null }>> {
    const result = new Map<string, { window: number | null; maximum: number | null; percent: number | null }>()
    try {
      const home = this.options.accounts[account].home
      // Con proveedor propio no hay caché de OpenAI: la ventana sale del catálogo que el propio motor carga.
      const cache = JSON.parse(await readFile(join(home, this.options.accounts[account].apiKey ? 'models.json' : 'models_cache.json'), 'utf8'))
      const positive = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
      for (const model of Array.isArray(cache.models) ? cache.models : []) {
        if (typeof model.slug !== 'string') continue
        result.set(model.slug, { window: positive(model.context_window), maximum: positive(model.max_context_window), percent: positive(model.effective_context_window_percent) })
      }
    } catch { /* Metadata is advisory. Unknown is not a fabricated default window. */ }
    return result
  }
}
