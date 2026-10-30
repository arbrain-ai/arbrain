import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ClaudeInteractiveSession, requireClaudeSubscription } from './claude-session.js'
import { esCuentaApi } from '../modelos/registro.js'
import { PROJECT_ROOT, STORE_DIR } from '../config.js'

/**
 * Catálogo de comandos "/" del chat (5 oct 2026). Une lo que expone el SDK de
 * Claude Code (comandos nativos, skills, plugins, agentes) con los comandos
 * locales de Arbrain y los modos. Contrato HTTP: GET /commands?account=<cuenta>.
 *
 * Decisión Codex/API: esas cuentas no tienen un SDK que liste comandos, así que
 * reciben modos aplicables + comandos locales + las skills leídas del disco
 * (.claude/skills). Es barato, no abre un App Server y las skills son del repo.
 */
export type CommandSection = 'modos' | 'arbrain' | 'nativos' | 'skills' | 'agentes'
export interface CatalogCommand {
  name: string
  description: string
  argumentHint?: string
  aliases?: string[]
  section: CommandSection
  kind: 'local' | 'sdk' | 'agent' | 'mode'
  origin?: string
}
export interface CommandCatalog { account: string; observedAt: string; source: 'sdk' | 'cache' | 'fallback'; commands: CatalogCommand[] }
export interface SdkCommandInput { name: string; description?: string; argumentHint?: string; aliases?: string[]; builtin?: boolean }
export interface SdkSnapshot { observedAt: string; commands: SdkCommandInput[]; agents: Array<{ name: string; description?: string }>; terminal: string[] }

/** Mismo criterio que codex-agent.isCodexAccount, sin arrastrar el runtime de Codex. */
const isCodexAccount = (account: string): boolean => account === 'codex' || account === 'yt' || esCuentaApi(account)

type LocalDef = Omit<CatalogCommand, 'name'> & { name: string; claudeOnly?: boolean }

/** Orden fijo. `claudeOnly`: no aplica a Codex/API. /plan no está: ver server.ts (no hay toggle real). */
const MODES: LocalDef[] = [
  { name: '/goal', description: 'Objetivo persistente: sigue trabajando hasta cumplir la condición', argumentHint: '<condición> | status | pause | resume | clear', section: 'modos', kind: 'mode' },
  { name: '/model', description: 'Cambiar el modelo de esta conversación', argumentHint: '<modelo>', section: 'modos', kind: 'local' },
  { name: '/effort', description: 'Nivel de esfuerzo de razonamiento (low a max)', argumentHint: '<low|medium|high|xhigh|max|default>', section: 'modos', kind: 'local' },
  { name: '/fast', description: 'Modo rápido: más velocidad en modelos compatibles (alterna)', argumentHint: '[on|off]', section: 'modos', kind: 'mode' },
  { name: '/ultracode', description: 'Ultracode: esfuerzo xhigh y flujos multiagente (alterna)', argumentHint: '[on|off]', section: 'modos', kind: 'mode', claudeOnly: true },
  { name: '/compact', description: 'Comprime el contexto de la conversación', argumentHint: '<instrucciones opcionales de resumen>', section: 'modos', kind: 'sdk', claudeOnly: true },
  { name: '/context', description: 'Cuánto contexto se está usando', section: 'modos', kind: 'sdk', claudeOnly: true },
  { name: '/loop', description: 'Repite un prompt o comando cada cierto intervalo', argumentHint: '[intervalo] [prompt]', section: 'modos', kind: 'sdk', claudeOnly: true },
]
const LOCALS: LocalDef[] = [
  { name: '/clear', description: 'Nueva conversación, borra el historial', section: 'arbrain', kind: 'local' },
  { name: '/status', description: 'Estado de Levy: modelo, tareas activas, sesión', section: 'arbrain', kind: 'local' },
  { name: '/skills', description: 'Skills disponibles en esta cuenta', section: 'arbrain', kind: 'local' },
  { name: '/memory', description: 'Memoria persistente (MEMORY.md)', section: 'arbrain', kind: 'local' },
  { name: '/mcp', description: 'Estado de los servidores MCP', section: 'arbrain', kind: 'local' },
  { name: '/todos', description: 'Lista de tareas activa del agente', section: 'arbrain', kind: 'local' },
  { name: '/tasks', description: 'Tareas actuales del tablero', section: 'arbrain', kind: 'local' },
  { name: '/agents', description: 'Estado en vivo de todos los agentes', section: 'arbrain', kind: 'local' },
  { name: '/usage', description: 'Costo y tokens de Levy (7 y 30 días)', section: 'arbrain', kind: 'local' },
  { name: '/help', description: 'Ver todos los comandos disponibles', section: 'arbrain', kind: 'local' },
]
const LOCAL_NAMES = new Set([...MODES, ...LOCALS].map(c => c.name.slice(1)))
const HIDDEN = (name: string) => name.startsWith('__') || name === 'workflow-launch-exec' || name === 'heapdump'
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

/** Frontmatter YAML mínimo: escalares, comillas simples o dobles, `>`/`|` y continuaciones con sangría. */
export function parseFrontmatter(text: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^\uFEFF/, ''))
  if (!match) return {}
  const out: Record<string, string> = {}
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const head = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i])
    if (!head) continue
    const key = head[1]
    let value = head[2].trim()
    const block = /^[>|][+-]?$/.test(value)
    const parts: string[] = block ? [] : value ? [value] : []
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim())
    value = parts.join(' ')
    const quoted = /^(["'])([\s\S]*)\1$/.exec(value)
    if (quoted) value = quoted[1] === '"' ? quoted[2].replace(/\\(["\\])/g, '$1') : quoted[2].replace(/''/g, "'")
    out[key] = value.trim()
  }
  return out
}

/** Skills (.claude/skills/<n>/SKILL.md) y comandos personalizados (.claude/commands/**.md) del proyecto. */
export function readSkillsFromDisk(root: string): SdkCommandInput[] {
  const found = new Map<string, SdkCommandInput>()
  const safe = <T>(fn: () => T, fallback: T): T => { try { return fn() } catch { return fallback } }
  const skillsDir = join(root, '.claude', 'skills')
  for (const dir of safe(() => readdirSync(skillsDir), [] as string[])) {
    const meta = safe(() => parseFrontmatter(readFileSync(join(skillsDir, dir, 'SKILL.md'), 'utf8')), null)
    if (!meta) continue
    const name = meta.name || dir
    if (/\s/.test(name)) continue
    found.set(name, { name, description: meta.description ?? '', ...(meta['argument-hint'] ? { argumentHint: meta['argument-hint'] } : {}) })
  }
  const walk = (dir: string, prefix: string, depth: number) => {
    if (depth > 4) return
    for (const entry of safe(() => readdirSync(dir), [] as string[])) {
      const full = join(dir, entry)
      const stat = safe(() => statSync(full), null)
      if (!stat) continue
      if (stat.isDirectory()) { walk(full, `${prefix}${entry}:`, depth + 1); continue }
      if (!entry.endsWith('.md')) continue
      const meta = safe(() => parseFrontmatter(readFileSync(full, 'utf8')), {} as Record<string, string>)
      const name = `${prefix}${entry.slice(0, -3)}`
      if (!found.has(name)) found.set(name, { name, description: meta.description ?? '', ...(meta['argument-hint'] ? { argumentHint: meta['argument-hint'] } : {}) })
    }
  }
  walk(join(root, '.claude', 'commands'), '', 0)
  return [...found.values()]
}

const originOf = (name: string): string => name.includes(':') ? 'plugin' : 'proyecto'

export function buildCatalog(account: string, snapshot: SdkSnapshot | null, disk: SdkCommandInput[], source: CommandCatalog['source'], observedAt = snapshot?.observedAt ?? new Date().toISOString()): CommandCatalog {
  const claude = !isCodexAccount(account)
  const keep = (list: LocalDef[]): CatalogCommand[] => list.filter(c => claude || !c.claudeOnly).map(({ claudeOnly: _omit, ...c }) => c)
  const commands: CatalogCommand[] = [...keep(MODES), ...keep(LOCALS)]
  const terminal = new Set(snapshot?.terminal ?? [])
  const taken = new Set(LOCAL_NAMES)
  const sdk = claude && snapshot ? snapshot.commands : []
  const nativos: CatalogCommand[] = []
  const skills: CatalogCommand[] = []
  const place = (item: SdkCommandInput, section: 'nativos' | 'skills', origin: string) => {
    const name = item.name.replace(/^\//, '')
    if (!name || taken.has(name) || HIDDEN(name) || terminal.has(name)) return
    taken.add(name)
    const entry: CatalogCommand = { name: `/${name}`, description: item.description ?? '', section, kind: 'sdk', origin,
      ...(item.argumentHint ? { argumentHint: item.argumentHint } : {}), ...(item.aliases?.length ? { aliases: item.aliases } : {}) }
    ;(section === 'nativos' ? nativos : skills).push(entry)
  }
  for (const item of sdk) if (item.builtin === true) place(item, 'nativos', 'claude-code')
  for (const item of sdk) if (item.builtin !== true) place(item, 'skills', originOf(item.name))
  // Sin SDK (o cuenta Codex/API) las skills salen del disco; con SDK manda su lista (incluye plugins).
  if (!claude || !snapshot) for (const item of disk) place(item, 'skills', 'proyecto')
  commands.push(...nativos.sort(byName), ...skills.sort(byName))
  if (claude && snapshot) {
    const agentes = snapshot.agents.filter(a => a.name).map((a): CatalogCommand => ({ name: `@${a.name}`, description: a.description ?? '', section: 'agentes', kind: 'agent', origin: 'claude-code' }))
    commands.push(...agentes.sort(byName))
  }
  return { account, observedAt, source, commands }
}

/** Convierte lo que trae el SDK (SlashCommand/AgentInfo) en un snapshot propio. */
export function snapshotFrom(commands: SdkCommandInput[], agents: Array<{ name: string; description?: string }>, terminal: string[] = [], observedAt = new Date().toISOString()): SdkSnapshot {
  return { observedAt, commands: commands.map(c => ({ name: c.name, description: c.description, argumentHint: c.argumentHint, aliases: c.aliases, builtin: c.builtin })), agents, terminal }
}

/** init solo trae nombres: añade los que faltan sin pisar descripciones ya conocidas. */
export function mergeInitNames(base: SdkSnapshot | null, names: string[], terminal: string[] | undefined, skillNames: string[] | undefined, agentNames: string[] | undefined): SdkSnapshot {
  const snapshot: SdkSnapshot = base ? { ...base, commands: [...base.commands], agents: [...base.agents] } : { observedAt: new Date().toISOString(), commands: [], agents: [], terminal: [] }
  const known = new Set(snapshot.commands.map(c => c.name))
  const skills = new Set(skillNames ?? [])
  for (const raw of names) {
    const name = raw.replace(/^\//, '')
    if (!name || known.has(name)) continue
    known.add(name)
    // Sin metadata: lo que el init lista como skill no es nativo; el resto, sí.
    snapshot.commands.push({ name, description: '', builtin: !skills.has(name) && !name.includes(':') })
  }
  const agents = new Set(snapshot.agents.map(a => a.name))
  for (const name of agentNames ?? []) if (name && !agents.has(name)) { agents.add(name); snapshot.agents.push({ name, description: '' }) }
  if (terminal) snapshot.terminal = [...terminal]
  snapshot.observedAt = new Date().toISOString()
  return snapshot
}

interface Deps {
  root: string
  discover: (account: string) => Promise<SdkSnapshot>
  storePath?: string
  ttlMs?: number
  now?: () => number
  readDisk?: (root: string) => SdkCommandInput[]
}

export class CommandCatalogService {
  private memory = new Map<string, { snapshot: SdkSnapshot; at: number | null }>()
  private pending = new Map<string, Promise<SdkSnapshot | null>>()
  private loaded = false
  private ttl: number
  private now: () => number
  constructor(private deps: Deps) { this.ttl = deps.ttlMs ?? 10 * 60_000; this.now = deps.now ?? Date.now }

  private disk() { return (this.deps.readDisk ?? readSkillsFromDisk)(this.deps.root) }
  private loadStore() {
    if (this.loaded) return
    this.loaded = true
    if (!this.deps.storePath) return
    try {
      const raw = JSON.parse(readFileSync(this.deps.storePath, 'utf8')) as Record<string, SdkSnapshot>
      for (const [account, snapshot] of Object.entries(raw)) {
        if (snapshot && Array.isArray(snapshot.commands)) this.memory.set(account, { snapshot, at: null }) // null: persistido, se refresca
      }
    } catch { /* sin caché en disco todavía */ }
  }
  private persist() {
    if (!this.deps.storePath) return
    try {
      mkdirSync(join(this.deps.storePath, '..'), { recursive: true })
      const tmp = `${this.deps.storePath}.${randomUUID()}.tmp`
      writeFileSync(tmp, JSON.stringify(Object.fromEntries([...this.memory].map(([k, v]) => [k, v.snapshot]))))
      renameSync(tmp, this.deps.storePath)
    } catch { /* la caché en disco es oportunista */ }
  }
  private refresh(account: string): Promise<SdkSnapshot | null> {
    let running = this.pending.get(account)
    if (!running) {
      running = this.deps.discover(account)
        .then(snapshot => { this.memory.set(account, { snapshot, at: this.now() }); this.persist(); return snapshot })
        .catch(() => null)
        .finally(() => this.pending.delete(account))
      this.pending.set(account, running)
    }
    return running
  }

  /** Sirve la caché al instante (stale-while-revalidate); sin caché espera al SDK y, si falla, cae al disco. */
  async get(account: string): Promise<CommandCatalog> {
    if (isCodexAccount(account)) return buildCatalog(account, null, this.disk(), 'fallback')
    this.loadStore()
    const hit = this.memory.get(account)
    if (hit) {
      const fresh = hit.at !== null && this.now() - hit.at < this.ttl
      if (!fresh) void this.refresh(account)
      return buildCatalog(account, hit.snapshot, this.disk(), fresh ? 'sdk' : 'cache')
    }
    const snapshot = await this.refresh(account)
    return snapshot ? buildCatalog(account, snapshot, this.disk(), 'sdk') : buildCatalog(account, null, this.disk(), 'fallback')
  }

  /** Un turno real emitió `init`: solo nombres. Completa lo que falte sin borrar descripciones. */
  ingestInit(account: string, init: { slashCommands?: string[]; terminalSlashCommands?: string[]; skills?: string[]; agents?: string[] }): void {
    if (isCodexAccount(account) || !init.slashCommands?.length) return
    this.loadStore()
    const prior = this.memory.get(account)
    this.memory.set(account, { snapshot: mergeInitNames(prior?.snapshot ?? null, init.slashCommands, init.terminalSlashCommands, init.skills, init.agents), at: prior?.at ?? null })
    this.persist()
  }

  /** `commands_changed` trae SlashCommand completo: reemplaza la lista. */
  ingestChanged(account: string, commands: SdkCommandInput[]): void {
    if (isCodexAccount(account) || !Array.isArray(commands)) return
    this.loadStore()
    const prior = this.memory.get(account)?.snapshot
    this.memory.set(account, { snapshot: snapshotFrom(commands, prior?.agents ?? [], prior?.terminal ?? []), at: this.now() })
    this.persist()
  }
}

/** Descubrimiento real: sesión aislada sin herramientas ni inferencia (patrón de claude-capabilities). */
export async function discoverClaudeCommands(cwd: string, account: string): Promise<SdkSnapshot> {
  if (!['default', 'bro'].includes(account)) throw new Error('Unknown Claude account')
  const session = new ClaudeInteractiveSession({ owner: 'command-catalog', account, conversationId: randomUUID() }, {
    cwd, settingSources: ['project', 'user'], settings: { disableAllHooks: true }, tools: [], permissionMode: 'default',
    canUseTool: async () => ({ behavior: 'deny', message: 'Metadata only' }),
    env: { CLAUDECLAW_DAEMON: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
  }, () => {})
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async (): Promise<SdkSnapshot> => {
        requireClaudeSubscription(await session.query.accountInfo())
        const [commands, agents] = await Promise.all([session.query.supportedCommands(), session.query.supportedAgents()])
        return snapshotFrom(commands, agents)
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Command discovery timed out')), 20_000) }),
    ])
  } finally { clearTimeout(timer); session.close(); await session.drained }
}

let shared: CommandCatalogService | undefined
/** Singleton del daemon: lo leen GET /commands y lo alimentan los turnos reales (agent.ts). */
export function getCommandCatalog(): CommandCatalogService {
  shared ??= new CommandCatalogService({ root: PROJECT_ROOT, storePath: join(STORE_DIR, 'command-catalog.json'), discover: account => discoverClaudeCommands(PROJECT_ROOT, account) })
  return shared
}
