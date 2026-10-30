import type { Query } from '@anthropic-ai/claude-agent-sdk'
import type { Connection } from './codex-pool.js'
import { ClaudeInteractiveSession, requireClaudeSubscription } from './claude-session.js'
import { randomUUID } from 'node:crypto'
import { esCuentaApi } from '../modelos/registro.js'

export type InventoryKind = 'skills' | 'mcp'
export interface RuntimeInventory {
  account: string
  kind: InventoryKind
  source: 'conversation' | 'account-discovery'
  observedAt: string
  entries: Array<{ name: string; description?: string; path?: string; scope?: string; enabled?: boolean; status?: string | null; auth?: string; toolCount?: number }>
  loadErrors: number
}
type ClaudeReader = Pick<Query, 'accountInfo' | 'supportedCommands' | 'mcpServerStatus'>
async function inspectClaudeInventory(account: string, kind: InventoryKind, query: ClaudeReader): Promise<RuntimeInventory> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async (): Promise<RuntimeInventory> => {
        requireClaudeSubscription(await query.accountInfo())
        const entries = kind === 'skills'
          ? (await query.supportedCommands()).map(item => ({ name: item.name, description: item.description }))
          : (await query.mcpServerStatus()).map(item => ({ name: item.name, status: item.status, scope: item.scope, ...(item.tools ? { toolCount: item.tools.length } : {}) }))
        return { account, kind, source: 'conversation', observedAt: new Date().toISOString(), entries, loadErrors: 0 }
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Claude inventory timed out')), 15_000) }),
    ])
  } finally { clearTimeout(timer) }
}

/** Coalesce both kinds on one discovery process. Reject excess distinct roots
 * instead of building an unbounded queue or spawning outside a limit. */
export class ClaudeInventoryDiscovery {
  private pending = new Map<string, Promise<Record<InventoryKind, RuntimeInventory | Error>>>()
  constructor(private load: (cwd: string, account: string) => Promise<Record<InventoryKind, RuntimeInventory | Error>>, private limit = 2) {}
  async read(cwd: string, account: string, kind: InventoryKind): Promise<RuntimeInventory> {
    if (!['default', 'bro'].includes(account)) throw new Error('Unknown Claude account')
    const key = JSON.stringify([cwd, account])
    let pending = this.pending.get(key)
    if (!pending) {
      if (this.pending.size >= this.limit) throw new Error('Descubrimiento Claude ocupado. Reintenta cuando termine la consulta actual.')
      pending = Promise.resolve().then(() => this.load(cwd, account)).finally(() => this.pending.delete(key))
      this.pending.set(key, pending)
    }
    const result = (await pending)[kind]
    if (result instanceof Error) throw result
    return result
  }
}
const claudeDiscovery = new ClaudeInventoryDiscovery(async (cwd, account) => {
  const session = new ClaudeInteractiveSession({ owner: 'capability-discovery', account, conversationId: randomUUID() }, {
    cwd, settingSources: ['project', 'user'], settings: { disableAllHooks: true }, tools: [], permissionMode: 'default',
    canUseTool: async () => ({ behavior: 'deny', message: 'Metadata only' }),
    env: { CLAUDECLAW_DAEMON: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
  }, () => {})
  try {
    const results = await Promise.allSettled([inspectClaudeInventory(account, 'skills', session.query), inspectClaudeInventory(account, 'mcp', session.query)])
    const value = (result: PromiseSettledResult<RuntimeInventory>): RuntimeInventory | Error => result.status === 'fulfilled'
      ? { ...result.value, source: 'account-discovery' }
      : result.reason instanceof Error ? result.reason : new Error('Claude inventory unavailable')
    return { skills: value(results[0]), mcp: value(results[1]) }
  } finally { session.close(); await session.drained }
})
export async function readClaudeInventory(cwd: string, account: string, kind: InventoryKind, active?: ClaudeReader, isClosed?: () => boolean, discovery: Pick<ClaudeInventoryDiscovery, 'read'> = claudeDiscovery): Promise<RuntimeInventory> {
  if (!['default', 'bro'].includes(account)) throw new Error('Unknown Claude account')
  if (active) {
    try { return await inspectClaudeInventory(account, kind, active) }
    catch (error) {
      // Inventory must not pin an idle process and delay real conversation work.
      // If it was evicted/replaced, recover through explicitly labeled discovery.
      if (!isClosed?.()) throw error
    }
  }
  return discovery.read(cwd, account, kind)
}

export async function readCodexInventory(client: Pick<Connection, 'request'>, cwd: string, account: string, kind: InventoryKind, threadId?: string): Promise<RuntimeInventory> {
  if (!['codex', 'yt'].includes(account) && !esCuentaApi(account)) throw new Error('Unknown OpenAI account')
  const result: RuntimeInventory = { account, kind, source: threadId ? 'conversation' : 'account-discovery', observedAt: new Date().toISOString(), entries: [], loadErrors: 0 }
  const deadline = Date.now() + 20_000
  const budget = () => { const remaining = deadline - Date.now(); if (remaining <= 0) throw new Error('OpenAI inventory timed out'); return remaining }
  if (kind === 'skills') {
    const response = await client.request<{ data: Array<{ cwd: string; skills: Array<{ name: string; description: string; path: string; scope: string; enabled: boolean }>; errors: unknown[] }> }>('skills/list', { cwds: [cwd], forceReload: true }, budget())
    const entry = response.data?.find(item => item.cwd === cwd)
    if (!entry || !Array.isArray(entry.skills) || !Array.isArray(entry.errors)) throw new Error('Invalid skills inventory for this workspace')
    result.entries = entry.skills.map(item => ({ name: item.name, description: item.description, path: item.path, scope: item.scope, enabled: item.enabled }))
    result.loadErrors = entry.errors.length
    result.source = 'account-discovery' // skills/list scans cwd, not a thread snapshot
  } else {
    let cursor: string | undefined
    const cursors = new Set<string>()
    do {
      const response = await client.request<{ data: Array<{ name: string; runtimeStatus: string | null; authStatus: string; tools: Record<string, unknown> }>; nextCursor?: string | null }>('mcpServerStatus/list', { detail: 'toolsAndAuthOnly', limit: 100, ...(threadId ? { threadId } : {}), ...(cursor ? { cursor } : {}) }, budget())
      if (!Array.isArray(response.data)) throw new Error('Invalid MCP inventory')
      result.entries.push(...response.data.map(item => ({ name: item.name, status: item.runtimeStatus ?? null, auth: item.authStatus, ...(item.tools ? { toolCount: Object.keys(item.tools).length } : {}) })))
      cursor = response.nextCursor ?? undefined
      if (cursor && (cursors.has(cursor) || cursors.size >= 50)) throw new Error('MCP inventory pagination did not terminate')
      if (cursor) cursors.add(cursor)
    } while (cursor)
  }
  return result
}

const plain = (value: string) => value.replace(/[\r\n\t]/g, ' ').replace(/[\\`*_{}\[\]()<>#+.!|~-]/g, '\\$&')
export function renderRuntimeInventory(inventory: RuntimeInventory): string {
  const title = inventory.kind === 'skills' ? 'Skills/comandos anunciados' : 'Integraciones MCP'
  const origin = inventory.source === 'conversation' ? 'proceso de esta conversación' : 'consulta aislada de la cuenta y workspace'
  const lines = [`**${title} · ${plain(inventory.account)}**`, '', `Fuente: ${origin}. Consulta: ${inventory.observedAt}.`, '']
  for (const entry of inventory.entries) {
    const details: string[] = []
    if (entry.enabled !== undefined) details.push(entry.enabled ? 'habilitada' : 'deshabilitada')
    if (inventory.kind === 'mcp') details.push(`estado: ${entry.status ? plain(entry.status) : 'desconocido'}`)
    if (entry.scope) details.push(`origen: ${plain(entry.scope)}`)
    if (entry.auth) details.push(`autenticación: ${plain(entry.auth)}`)
    if (entry.toolCount !== undefined) details.push(`${entry.toolCount} herramientas anunciadas`)
    if (entry.description) details.push(plain(entry.description.slice(0, 240)))
    if (entry.path) details.push(plain(entry.path))
    lines.push(`- **${plain(entry.name)}**${details.length ? ': ' + details.join(' · ') : ''}`)
  }
  if (!inventory.entries.length) lines.push('El runtime no devolvió entradas en esta consulta.')
  if (inventory.loadErrors) lines.push('', `${inventory.loadErrors} errores de carga reportados por el runtime.`)
  lines.push('', 'Este inventario no prueba ejecución de skills ni herramientas. Un estado de autenticación no implica conexión activa.')
  if (inventory.account === 'default' || inventory.account === 'bro') lines.push('La lista de skills/comandos de una conversación corresponde a su inicialización; no se reinicia una conversación para refrescarla. Las herramientas Google Calendar/Gmail/Drive claude_ai siguen restringidas por el adaptador.')
  return lines.join('\n')
}
