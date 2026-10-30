/**
 * Memoria y contexto (4 oct 2026, Daniel: «Debería poder ver mis memorias en algún punto de esta interfaz. Quiero
 * saber qué acumulas de mí como contexto cada que tenemos una conversación. Igual entiende las reglas de cómo luce
 * el system prompt y todo lo que entra en la ventana de contexto del proveedor que tenemos.»).
 *
 *  A · La memoria: `.claude/memory/` del checkout vivo, por capa (esencia, índices, carpetas), con la fecha del
 *      último commit de cada archivo y su línea del índice. Solo lectura; credenciales nunca se leen.
 *  B · La anatomía de la ventana, MEDIDA, nunca inventada:
 *      · Desglose por capa = `getContextUsage({ detail: 'full' })` del SDK (el mismo `/context` de Claude Code,
 *        contado con la API de conteo de tokens). Se guarda por turno de chat en `store/contexto.db`
 *        (`registrarTurno`), o, si la conversación aún no tiene uno, una sonda `/context` en una sesión vacía con
 *        la misma configuración del proyecto (comando local: no hay inferencia).
 *      · Totales por llamada = `usage` de cada mensaje del asistente en el transcript del SDK (input +
 *        cache_creation + cache_read): lo que el proveedor cobró como entrada. Es la verdad del tamaño real.
 *      · Lo inyectado por mensaje = el último `hook_additional_context` del transcript (UserPromptSubmit).
 *  Lo que se calcula (no se mide) lo dice: «por diferencia» o «estimado».
 */
import { esEdicionCliente } from '../edicion.js'
import { execFile } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'
import { PROJECT_ROOT, STORE_DIR } from '../config.js'
import { logger } from '../logger.js'

const run = promisify(execFile)
const MEMORIA = join(PROJECT_ROOT, '.claude', 'memory')

// ───────────────────────── A · la memoria ─────────────────────────

export type Capa = 'esencia' | 'indice' | 'user' | 'feedback' | 'project' | 'reference'
export interface ArchivoMemoria {
  ruta: string            // relativa a .claude/memory
  capa: Capa
  titulo: string
  bytes: number
  fecha: string | null     // último commit (ISO); null = sin commit (archivo local)
  descripcion: string | null  // la frase del índice
  indice: 'indice' | 'user' | 'archivo' | null
  triggers: string[]
  oculto: boolean          // credenciales: solo el nombre
}

/** Archivos cuyo contenido nunca sale de la máquina por esta vista. */
export const esSecreto = (ruta: string) => /credencial|secret|password|contrase|token-|api-?key/i.test(ruta)

/** Tacha lo que parezca una llave aunque viva en una memoria normal. */
export function tachar(texto: string): string {
  return texto
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, '«oculto»')
    .replace(/\b(ghp|gho|github_pat|xox[abps]|AIza)[A-Za-z0-9_-]{16,}/g, '«oculto»')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '«oculto»')
    .replace(/((?:key|token|secret|password|contraseña|bearer)\s*[:=]\s*[`"']?)[A-Za-z0-9_\-./+]{20,}/gi, '$1«oculto»')
}

const ENTRADA = /^- `([^`]+)`\s*[—-]\s*(.*?)\s*\*\*T:\*\*(.*)$/

function capaDe(ruta: string): Capa | null {
  if (ruta === 'MEMORY.md') return 'esencia'
  if (/^MEMORY-.*\.md$/.test(ruta)) return 'indice'
  const c = ruta.split('/')[0]
  return c === 'user' || c === 'feedback' || c === 'project' || c === 'reference' ? c : null
}

function caminar(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir, { withFileTypes: true })) {
    if (n.name.startsWith('.')) continue
    const p = join(dir, n.name)
    if (n.isDirectory()) caminar(p, out)
    else if (n.name.endsWith('.md')) out.push(p)
  }
  return out
}

let fechasCache: { en: number; fechas: Map<string, string> } | null = null
async function fechasGit(): Promise<Map<string, string>> {
  if (fechasCache && Date.now() - fechasCache.en < 5 * 60_000) return fechasCache.fechas
  const fechas = new Map<string, string>()
  try {
    const { stdout } = await run('git', ['log', '--format=%x00%cI', '--name-only', '--', '.claude/memory'], { cwd: PROJECT_ROOT, maxBuffer: 64 * 1024 * 1024 })
    let fecha = ''
    for (const linea of stdout.split('\n')) {
      if (linea.startsWith('\u0000')) { fecha = linea.slice(1).trim(); continue }
      const r = linea.trim()
      if (!r.startsWith('.claude/memory/')) continue
      const rel = r.slice('.claude/memory/'.length)
      if (!fechas.has(rel)) fechas.set(rel, fecha)   // git log va del más nuevo al más viejo
    }
  } catch (err) { logger.warn({ err }, 'memoria: git log falló; sin fechas') }
  fechasCache = { en: Date.now(), fechas }
  return fechas
}

function lineasDeIndice(): Map<string, { indice: 'indice' | 'user' | 'archivo'; descripcion: string; triggers: string[] }> {
  const m = new Map<string, { indice: 'indice' | 'user' | 'archivo'; descripcion: string; triggers: string[] }>()
  for (const [indice, archivo] of [['indice', 'MEMORY-indice.md'], ['user', 'MEMORY-user.md'], ['archivo', 'MEMORY-archivo.md']] as const) {
    let texto = ''
    try { texto = readFileSync(join(MEMORIA, archivo), 'utf8') } catch { continue }
    for (const linea of texto.split('\n')) {
      const e = ENTRADA.exec(linea)
      if (!e) continue
      const ruta = e[1].replace(/^\.claude\/memory\//, '')
      if (m.has(ruta)) continue
      m.set(ruta, { indice, descripcion: e[2].replace(/\s+/g, ' ').trim(), triggers: e[3].split(',').map(t => t.trim().replace(/\.$/, '')).filter(Boolean) })
    }
  }
  return m
}

const tituloDe = (texto: string, ruta: string) => {
  const nombre = /^---\n[\s\S]*?^name:\s*(.+)$[\s\S]*?^---$/m.exec(texto)?.[1]
  return (nombre ?? /^#\s+(.+)$/m.exec(texto)?.[1] ?? ruta.split('/').pop()!.replace(/\.md$/, '')).trim().slice(0, 160)
}

export async function memoria(): Promise<{ archivos: ArchivoMemoria[]; raiz: string; leidoEn: string }> {
  const [fechas, indice] = [await fechasGit(), lineasDeIndice()]
  const archivos: ArchivoMemoria[] = []
  for (const abs of caminar(MEMORIA)) {
    const ruta = relative(MEMORIA, abs).split(sep).join('/')
    const capa = capaDe(ruta)
    if (!capa) continue
    const oculto = esSecreto(ruta)
    let texto = ''
    try { texto = oculto ? '' : readFileSync(abs, 'utf8').slice(0, 4000) } catch { /* ilegible: queda sin título */ }
    const i = indice.get(ruta)
    archivos.push({
      ruta, capa, titulo: oculto ? ruta.split('/').pop()!.replace(/\.md$/, '') : tituloDe(texto, ruta), bytes: statSync(abs).size,
      fecha: fechas.get(ruta) ?? null, descripcion: i?.descripcion ?? null, indice: i?.indice ?? null, triggers: i?.triggers ?? [], oculto,
    })
  }
  archivos.sort((a, b) => (b.fecha ?? '9').localeCompare(a.fecha ?? '9') || a.ruta.localeCompare(b.ruta))
  return { archivos, raiz: '.claude/memory', leidoEn: new Date().toISOString() }
}

/** Un archivo de memoria para leer. Nunca fuera de .claude/memory, nunca un secreto. */
export function leerMemoria(ruta: string): { ruta: string; texto: string; oculto: boolean; bytes: number } | { error: string; status: number } {
  if (typeof ruta !== 'string' || !ruta.endsWith('.md') || ruta.includes('..') || ruta.startsWith('/') || ruta.includes('\0')) return { error: 'Ruta inválida.', status: 400 }
  const abs = join(MEMORIA, ruta)
  if (!abs.startsWith(MEMORIA + sep) || !existsSync(abs)) return { error: 'No existe esa memoria.', status: 404 }
  const bytes = statSync(abs).size
  if (esSecreto(ruta)) return { ruta, texto: '', oculto: true, bytes }
  return { ruta, texto: tachar(readFileSync(abs, 'utf8')), oculto: false, bytes }
}

// ───────────────────── B · registro por turno (store/contexto.db) ─────────────────────

export interface UsoLlamada { input: number; cacheCreacion: number; cacheLectura: number; salida: number }
export const totalEntrada = (u: UsoLlamada) => u.input + u.cacheCreacion + u.cacheLectura

export interface Desglose {
  modelo: string
  total: number
  ventana: number
  categorias: { nombre: string; tokens: number; tipo: 'used' | 'free' | 'buffer' | 'deferred' }[]
  memoria: { ruta: string; tokens: number }[]
  skills: { nombre: string; origen: string; tokens: number }[]
  mcp: { servidor: string; herramientas: number; tokens: number }[]
  /** Solo en el desglose por turno (getContextUsage): las secciones del system prompt y de qué está hecho el historial. */
  secciones?: { nombre: string; tokens: number }[]
  herramientasSistema?: { nombre: string; tokens: number }[]
  mensajes?: { llamadas: number; resultados: number; adjuntos: number; asistente: number; usuario: number; sinAtribuir: number; adjuntosPorTipo: { nombre: string; tokens: number }[] }
}

let db: Database.Database | null = null
function base(): Database.Database {
  if (db) return db
  mkdirSync(STORE_DIR, { recursive: true })
  db = new Database(join(STORE_DIR, 'contexto.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 3000')
  db.exec(`CREATE TABLE IF NOT EXISTS contexto_turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversacion TEXT NOT NULL, cuenta TEXT NOT NULL, turno TEXT, sesion TEXT, en INTEGER NOT NULL,
    modelo TEXT, ventana INTEGER, llamadas INTEGER,
    primera_input INTEGER, primera_creacion INTEGER, primera_lectura INTEGER,
    ultima_input INTEGER, ultima_creacion INTEGER, ultima_lectura INTEGER, salida INTEGER,
    desglose TEXT, desglose_en INTEGER
  );
  CREATE INDEX IF NOT EXISTS contexto_turnos_conv ON contexto_turnos(conversacion, en DESC);`)
  return db
}

/** Lo que el SDK devuelve en getContextUsage, reducido a lo que la vista pinta. */
export function reducirDesglose(r: {
  model: string; totalTokens: number; rawMaxTokens?: number; maxTokens?: number
  categories: { name: string; tokens: number; kind?: string; isDeferred?: boolean }[]
  memoryFiles?: { path: string; tokens: number }[]
  mcpTools?: { serverName: string; tokens: number; isLoaded?: boolean }[]
  skills?: { name: string; source: string; tokens: number }[] | { skillFrontmatter?: { name: string; source: string; tokens: number }[] }
  systemPromptSections?: { name: string; tokens: number }[]
  systemTools?: { name: string; tokens: number }[]
  messageBreakdown?: { toolCallTokens: number; toolResultTokens: number; attachmentTokens: number; assistantMessageTokens: number; userMessageTokens: number; unattributedTokens: number; attachmentsByType?: { name: string; tokens: number }[] }
}): Desglose {
  const porServidor = new Map<string, { herramientas: number; tokens: number }>()
  for (const t of r.mcpTools ?? []) {
    const s = porServidor.get(t.serverName) ?? { herramientas: 0, tokens: 0 }
    s.herramientas++; s.tokens += t.tokens; porServidor.set(t.serverName, s)
  }
  const skillsCrudas = Array.isArray(r.skills) ? r.skills : r.skills?.skillFrontmatter ?? []
  const rel = (p: string) => p.startsWith(PROJECT_ROOT + '/') ? p.slice(PROJECT_ROOT.length + 1) : p.replace(/^\/Users\/[^/]+\//, '~/')
  return {
    modelo: r.model, total: r.totalTokens, ventana: r.rawMaxTokens ?? r.maxTokens ?? 0,
    categorias: r.categories.filter(c => c.tokens > 0).map(c => ({ nombre: c.name, tokens: c.tokens, tipo: (c.kind ?? (c.isDeferred ? 'deferred' : 'used')) as Desglose['categorias'][number]['tipo'] })),
    memoria: (r.memoryFiles ?? []).map(f => ({ ruta: rel(f.path), tokens: f.tokens })),
    skills: skillsCrudas.map(s => ({ nombre: s.name, origen: s.source, tokens: s.tokens })).sort((a, b) => b.tokens - a.tokens),
    mcp: [...porServidor].map(([servidor, s]) => ({ servidor, ...s })).sort((a, b) => b.tokens - a.tokens),
    ...(r.systemPromptSections?.length ? { secciones: r.systemPromptSections.map(x => ({ nombre: x.name, tokens: x.tokens })) } : {}),
    ...(r.systemTools?.length ? { herramientasSistema: r.systemTools.map(x => ({ nombre: x.name, tokens: x.tokens })).sort((a, b) => b.tokens - a.tokens) } : {}),
    ...(r.messageBreakdown ? { mensajes: {
      llamadas: r.messageBreakdown.toolCallTokens, resultados: r.messageBreakdown.toolResultTokens, adjuntos: r.messageBreakdown.attachmentTokens,
      asistente: r.messageBreakdown.assistantMessageTokens, usuario: r.messageBreakdown.userMessageTokens, sinAtribuir: r.messageBreakdown.unattributedTokens,
      adjuntosPorTipo: (r.messageBreakdown.attachmentsByType ?? []).map(x => ({ nombre: x.name, tokens: x.tokens })).sort((a, b) => b.tokens - a.tokens),
    } } : {}),
  }
}

const ultimoDesglose = new Map<string, number>()
const CADA_DESGLOSE_MS = 10 * 60_000

/**
 * Guarda el usage de un turno del chat y, como mucho cada 10 min por conversación, el desglose por capa del SDK.
 * Nunca lanza ni retrasa el turno: el desglose corre en segundo plano.
 */
export function registrarTurno(t: {
  conversacion: string; cuenta: string; turno?: string; sesion?: string; modelo?: string | null; ventana?: number | null
  llamadas: number; primera: UsoLlamada | null; ultima: UsoLlamada | null
}, sdk?: { getContextUsage?: (o?: { detail?: 'summary' | 'full' }) => Promise<unknown> }): void {
  try {
    const d = base()
    const info = d.prepare(`INSERT INTO contexto_turnos (conversacion, cuenta, turno, sesion, en, modelo, ventana, llamadas,
      primera_input, primera_creacion, primera_lectura, ultima_input, ultima_creacion, ultima_lectura, salida)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(t.conversacion, t.cuenta, t.turno ?? null, t.sesion ?? null, Date.now(), t.modelo ?? null, t.ventana ?? null, t.llamadas,
      t.primera?.input ?? null, t.primera?.cacheCreacion ?? null, t.primera?.cacheLectura ?? null,
      t.ultima?.input ?? null, t.ultima?.cacheCreacion ?? null, t.ultima?.cacheLectura ?? null, t.ultima?.salida ?? null)
    const clave = `${t.cuenta}\u0000${t.conversacion}`
    if (!sdk?.getContextUsage || Date.now() - (ultimoDesglose.get(clave) ?? 0) < CADA_DESGLOSE_MS) return
    ultimoDesglose.set(clave, Date.now())
    const id = Number(info.lastInsertRowid)
    const tope = new Promise<never>((_, no) => setTimeout(() => no(new Error('getContextUsage tardó más de 60 s')), 60_000).unref())
    void Promise.race([sdk.getContextUsage({ detail: 'full' }), tope]).then(r => {
      base().prepare('UPDATE contexto_turnos SET desglose = ?, desglose_en = ? WHERE id = ?').run(JSON.stringify(reducirDesglose(r as Parameters<typeof reducirDesglose>[0])), Date.now(), id)
    }, err => { ultimoDesglose.delete(clave); logger.warn({ err: err instanceof Error ? err.message : err }, 'contexto: desglose del turno no disponible') })
  } catch (err) { logger.warn({ err }, 'contexto: no se pudo registrar el turno') }
}

// ───────────────────── B · sonda /context (sesión vacía, sin inferencia) ─────────────────────

const SONDA = () => join(STORE_DIR, 'contexto-sonda.json')
let sondaEnCurso: Promise<{ en: string; desglose: Desglose } | null> | null = null

export function leerSonda(): { en: string; desglose: Desglose } | null {
  try { return JSON.parse(readFileSync(SONDA(), 'utf8')) } catch { return null }
}

/** `/context` en una sesión nueva con la configuración del chat (proyecto + usuario + cabina). Local: sin turno de modelo. */
export function medirSonda(): Promise<{ en: string; desglose: Desglose } | null> {
  if (sondaEnCurso) return sondaEnCurso
  sondaEnCurso = (async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const { cabinaMcpConfig } = await import('./config.js')
    const cabina = cabinaMcpConfig()
    const ac = new AbortController()
    const tope = setTimeout(() => ac.abort(), 60_000)
    try {
      const q = query({ prompt: '/context', options: {
        cwd: PROJECT_ROOT, settingSources: ['project', 'user'], persistSession: false, abortController: ac,
        betas: ['context-1m-2025-08-07'],
        // Edición cliente (red team L5): sin bypass y sin herramientas. Daniel: igual que siempre.
        ...(esEdicionCliente()
          ? { permissionMode: 'default' as const, canUseTool: async () => ({ behavior: 'deny' as const, message: 'Solo /context: sin herramientas.' }), settings: { disableAllHooks: true } }
          : { permissionMode: 'bypassPermissions' as const, allowDangerouslySkipPermissions: true }),
        ...(cabina ? { mcpServers: { cabina } } : {}),
      } })
      for await (const e of q as AsyncIterable<Record<string, unknown>>) {
        const cu = e['context_usage'] as Record<string, unknown> | undefined
        if (!cu) continue
        const desglose = reducirDesglose({
          model: String(cu.model), totalTokens: Number(cu.total_tokens), rawMaxTokens: Number(cu.raw_max_tokens),
          categories: (cu.categories as { name: string; tokens: number; kind: string }[]) ?? [],
          memoryFiles: (cu.memory_files as { path: string; tokens: number }[]) ?? [],
          mcpTools: ((cu.mcp_tools as { server_name: string; tokens: number }[]) ?? []).map(t => ({ serverName: t.server_name, tokens: t.tokens })),
          skills: (cu.skills as { name: string; source: string; tokens: number }[]) ?? [],
        })
        const foto = { en: new Date().toISOString(), desglose }
        mkdirSync(STORE_DIR, { recursive: true })
        writeFileSync(SONDA() + '.tmp', JSON.stringify(foto)); renameSync(SONDA() + '.tmp', SONDA())
        try { await (q as unknown as { interrupt(): Promise<void> }).interrupt() } catch { /* ya terminó */ }
        return foto
      }
      return null
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, 'contexto: la sonda /context falló')
      return null
    } finally { clearTimeout(tope); ac.abort(); sondaEnCurso = null }
  })()
  return sondaEnCurso
}

// ───────────────────── B · el transcript de una conversación ─────────────────────

export interface Llamada { en: string; uso: UsoLlamada }
export interface LecturaTranscript {
  llamadas: Llamada[]
  turnos: { en: string; caracteres: number; primeraLlamada: number | null; llamadas: number }[]
  compactaciones: { en: string; antes: number | null; despues: number | null; disparo: string | null }[]
  inyeccion: { en: string; evento: string; texto: string } | null
  /** Caracteres del primer bloque inyectado: con el primer mensaje, lo único «tuyo» en la primera llamada. */
  primeraInyeccion: number | null
  modelo: string | null
}

const cacheTranscript = new Map<string, { firma: string; lectura: LecturaTranscript }>()

/** Lee lo medible de un transcript sin parsear las líneas que no importan (hay transcripts de 120 MB). */
export async function leerTranscript(archivo: string): Promise<LecturaTranscript> {
  const st = statSync(archivo)
  const firma = `${st.size}:${st.mtimeMs}`
  const c = cacheTranscript.get(archivo)
  if (c?.firma === firma) return c.lectura
  const vistos = new Set<string>()
  const l: LecturaTranscript = { llamadas: [], turnos: [], compactaciones: [], inyeccion: null, primeraInyeccion: null, modelo: null }
  const rl = createInterface({ input: createReadStream(archivo, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const linea of rl) {
    const asistente = linea.includes('"type":"assistant"') && linea.includes('"usage"')
    const usuario = !asistente && linea.includes('"type":"user"') && linea.includes('"promptId"') && !linea.includes('"tool_use_id"') && !linea.includes('"isMeta":true')
    const gancho = !asistente && !usuario && linea.includes('"hook_additional_context"')
    const compacta = !asistente && !usuario && !gancho && linea.includes('"compact_boundary"')
    if (!asistente && !usuario && !gancho && !compacta) continue
    let e: Record<string, unknown>
    try { e = JSON.parse(linea) } catch { continue }
    if (e.isSidechain === true) continue
    const en = typeof e.timestamp === 'string' ? e.timestamp : ''
    if (asistente && e.type === 'assistant') {
      const m = e.message as { id?: string; model?: string; usage?: Record<string, number> } | undefined
      if (!m?.usage || !m.id || vistos.has(m.id)) continue
      vistos.add(m.id)
      if (m.model && m.model !== '<synthetic>') l.modelo = m.model
      const u = m.usage
      const uso = { input: u.input_tokens ?? 0, cacheCreacion: u.cache_creation_input_tokens ?? 0, cacheLectura: u.cache_read_input_tokens ?? 0, salida: u.output_tokens ?? 0 }
      if (totalEntrada(uso) === 0) continue
      l.llamadas.push({ en, uso })
      const t = l.turnos[l.turnos.length - 1]
      if (t) { t.llamadas++; if (t.primeraLlamada == null) t.primeraLlamada = l.llamadas.length - 1 }
    } else if (usuario && e.type === 'user') {
      const contenido = (e.message as { content?: unknown } | undefined)?.content
      const texto = typeof contenido === 'string' ? contenido : Array.isArray(contenido) ? contenido.filter((b: { type?: string }) => b?.type === 'text').map((b: { text?: string }) => b.text ?? '').join('\n') : ''
      if (!texto.trim() || texto.startsWith('<command-')) continue
      l.turnos.push({ en, caracteres: texto.length, primeraLlamada: null, llamadas: 0 })
    } else if (gancho && e.type === 'attachment') {
      const a = e.attachment as { type?: string; content?: unknown; hookEvent?: string; hookName?: string } | undefined
      if (a?.type !== 'hook_additional_context') continue
      const texto = Array.isArray(a.content) ? a.content.map(String).join('\n\n') : String(a.content ?? '')
      l.inyeccion = { en, evento: a.hookEvent ?? a.hookName ?? 'hook', texto }
      if (l.primeraInyeccion == null && l.llamadas.length === 0) l.primeraInyeccion = texto.length
    } else if (compacta && e.type === 'system' && e.subtype === 'compact_boundary') {
      const m = e.compactMetadata as { preTokens?: number; postTokens?: number; trigger?: string } | undefined
      l.compactaciones.push({ en, antes: m?.preTokens ?? null, despues: m?.postTokens ?? null, disparo: m?.trigger ?? null })
    }
  }
  cacheTranscript.set(archivo, { firma, lectura: l })
  if (cacheTranscript.size > 12) cacheTranscript.delete(cacheTranscript.keys().next().value!)
  return l
}

// ───────────────────── B · la anatomía que pinta la vista ─────────────────────

export interface Anatomia {
  conversacion: {
    id: string; cuenta: string; sesion: string | null; transcript: boolean
    primera: (Llamada & { total: number }) | null
    ultima: (Llamada & { total: number }) | null
    ultimoTurno: { en: string; caracteres: number; llamadas: number; primera: (Llamada & { total: number }) | null } | null
    /** Lo tuyo dentro de la primera llamada (primer mensaje + su inyección), en caracteres. */
    primerMensaje: { caracteres: number; inyeccion: number } | null
    llamadas: number; turnos: number
    compactaciones: LecturaTranscript['compactaciones']
    inyeccion: (NonNullable<LecturaTranscript['inyeccion']> & { caracteres: number; partes: { nombre: string; caracteres: number }[] }) | null
    modelo: string | null
  } | null
  desglose: { fuente: 'turno' | 'sonda'; en: string; datos: Desglose } | null
  ventana: { tokens: number | null; modelo: string | null; fuente: string }
  archivos: { ruta: string; caracteres: number }[]
  ganchos: { evento: string; comando: string }[]
  tokensPorCaracter: number | null
}

const conTotal = (l: Llamada | undefined | null) => l ? { ...l, total: totalEntrada(l.uso) } : null

/** Parte el bloque inyectado por memory-recall.py en sus tres piezas (rutas, recall, agenda). */
export function partesDeInyeccion(texto: string): { nombre: string; caracteres: number }[] {
  const partes: { nombre: string; caracteres: number }[] = []
  for (const trozo of texto.split(/\n\n(?=RUTAS POR INTENCI|🧠 recall|AGENDA COMPARTIDA)/)) {
    const nombre = trozo.startsWith('RUTAS POR INTENCI') ? 'Rutas por intención' : trozo.startsWith('🧠 recall') ? 'Recall de memoria' : trozo.startsWith('AGENDA COMPARTIDA') ? 'Agenda del turno' : 'Otro'
    partes.push({ nombre, caracteres: trozo.length })
  }
  return partes
}

function ganchos(): { evento: string; comando: string }[] {
  try {
    const s = JSON.parse(readFileSync(join(PROJECT_ROOT, '.claude', 'settings.json'), 'utf8')) as { hooks?: Record<string, { hooks?: { command?: string }[] }[]> }
    return Object.entries(s.hooks ?? {}).flatMap(([evento, grupos]) => grupos.flatMap(g => (g.hooks ?? []).map(h => ({ evento, comando: (h.command ?? '').replace(/\$CLAUDE_PROJECT_DIR\/?|"/g, '').replace(/^cd\s+&&\s+/, '').slice(0, 120) }))))
  } catch { return [] }
}

function archivosFijos(): { ruta: string; caracteres: number }[] {
  return ['CLAUDE.md', '.claude/memory/MEMORY.md', '.claude/now.md'].map(ruta => {
    try { return { ruta, caracteres: readFileSync(join(PROJECT_ROOT, ruta), 'utf8').length } } catch { return { ruta, caracteres: 0 } }
  })
}

/** La sesión del SDK y la cuenta de una conversación de Arbrain, por el journal del chat. */
function sesionDe(conversacion: string, journalDb?: Database.Database): { sesion: string | null; cuenta: string } {
  if (conversacion.startsWith('sdk:')) return { sesion: conversacion.slice(4), cuenta: 'default' }
  if (!journalDb) return { sesion: null, cuenta: 'default' }
  const r = journalDb.prepare(`SELECT account, native_thread_id FROM chat_runtime_turns WHERE conversation_id = ? AND native_thread_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get(conversacion) as { account: string; native_thread_id: string } | undefined
  return { sesion: r?.native_thread_id ?? null, cuenta: r?.account ?? 'default' }
}

/** La conversación más reciente del chat de Arbrain (cuando la vista se abre fuera de /chat). */
function ultimaConversacion(journalDb?: Database.Database): string | null {
  const r = journalDb?.prepare(`SELECT conversation_id FROM chat_runtime_turns WHERE native_thread_id IS NOT NULL AND account NOT LIKE 'openai%' ORDER BY updated_at DESC LIMIT 1`).get() as { conversation_id: string } | undefined
  return r?.conversation_id ?? null
}

export async function anatomia(o: {
  conversacion?: string; medir?: boolean; journalDb?: Database.Database
  transcriptDe?: (sesion: string, cuenta: string) => string | null
}): Promise<Anatomia> {
  const id = o.conversacion?.trim() || ultimaConversacion(o.journalDb)
  let conversacion: Anatomia['conversacion'] = null
  let desgloseTurno: { en: string; datos: Desglose } | null = null
  let ventanaTurno: { tokens: number; modelo: string | null } | null = null
  if (id) {
    const { sesion, cuenta } = sesionDe(id, o.journalDb)
    const archivo = sesion && o.transcriptDe ? o.transcriptDe(sesion, cuenta) : null
    const t = archivo ? await leerTranscript(archivo) : null
    const ultimoTurno = t?.turnos[t.turnos.length - 1]
    conversacion = {
      id, cuenta, sesion, transcript: !!t,
      primera: conTotal(t?.llamadas[0]), ultima: conTotal(t?.llamadas[t.llamadas.length - 1]),
      ultimoTurno: ultimoTurno ? { en: ultimoTurno.en, caracteres: ultimoTurno.caracteres, llamadas: ultimoTurno.llamadas, primera: ultimoTurno.primeraLlamada != null ? conTotal(t!.llamadas[ultimoTurno.primeraLlamada]) : null } : null,
      primerMensaje: t?.turnos[0] ? { caracteres: t.turnos[0].caracteres, inyeccion: t.primeraInyeccion ?? 0 } : null,
      llamadas: t?.llamadas.length ?? 0, turnos: t?.turnos.length ?? 0, compactaciones: t?.compactaciones ?? [],
      inyeccion: t?.inyeccion ? { ...t.inyeccion, caracteres: t.inyeccion.texto.length, partes: partesDeInyeccion(t.inyeccion.texto) } : null,
      modelo: t?.modelo ?? null,
    }
    try {
      const fila = base().prepare(`SELECT desglose, desglose_en, ventana, modelo FROM contexto_turnos WHERE conversacion = ? ORDER BY CASE WHEN desglose IS NULL THEN 1 ELSE 0 END, en DESC LIMIT 1`).get(id) as { desglose: string | null; desglose_en: number | null; ventana: number | null; modelo: string | null } | undefined
      if (fila?.desglose) desgloseTurno = { en: new Date(fila.desglose_en!).toISOString(), datos: JSON.parse(fila.desglose) }
      if (fila?.ventana) ventanaTurno = { tokens: fila.ventana, modelo: fila.modelo }
    } catch (err) { logger.warn({ err }, 'contexto: no se pudo leer contexto.db') }
  }
  let sonda = desgloseTurno ? null : leerSonda()
  if (!desgloseTurno && (o.medir || !sonda || Date.now() - Date.parse(sonda.en) > 6 * 3600_000)) sonda = (await medirSonda()) ?? sonda
  const desglose = desgloseTurno ? { fuente: 'turno' as const, ...desgloseTurno } : sonda ? { fuente: 'sonda' as const, en: sonda.en, datos: sonda.desglose } : null
  const ventana = ventanaTurno ? { ...ventanaTurno, fuente: 'modelUsage.contextWindow del último turno guardado' }
    : desglose?.datos.ventana ? { tokens: desglose.datos.ventana, modelo: desglose.datos.modelo, fuente: 'getContextUsage del SDK (ventana de autocompactación)' }
    : { tokens: null, modelo: conversacion?.modelo ?? null, fuente: 'sin dato' }
  const archivos = archivosFijos()
  // Razón tokens/carácter MEDIDA en CLAUDE.md (conteo del SDK ÷ caracteres): solo para estimar lo que no se cuenta.
  const claude = desglose?.datos.memoria.find(m => m.ruta === 'CLAUDE.md')
  const chars = archivos.find(a => a.ruta === 'CLAUDE.md')?.caracteres
  return { conversacion, desglose, ventana, archivos, ganchos: ganchos(), tokensPorCaracter: claude && chars ? claude.tokens / chars : null }
}
