/**
 * El lector multi-harness del motor: la conversación REAL de cada terminal, leída
 * de su archivo de sesión, sin GUI y sin gate de archivos.
 *
 * Dos mitades, igual que en SFTerm:
 *  - ENCONTRAR (aquí): el motor dice qué proceso corre en primer plano (nombre, argv,
 *    cwd, arranque, CLAUDE_CONFIG_DIR/CODEX_HOME) y esto ubica su archivo, con el
 *    orden de verdades de SFTerm: argv (`--session-id`, `--resume`) > nacimiento.
 *  - PARSEAR (`./sfterm/`): los parsers de SFTerm, copiados tal cual por
 *    `scripts/sync-lector-sfterm.sh`. Un solo parser por harness en toda la casa.
 *
 * Lo que no se puede leer se dice («sin conversación legible»), nunca se inventa.
 */
import { execFile } from 'node:child_process'
import { open, readdir, stat, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ProcInfo } from './cliente.js'
import type { ParsedTranscript } from './sfterm/msgs.js'
import { parseTranscript as parseClaude } from './sfterm/transcripts/claude.js'
import { parseCodexTranscript } from './sfterm/transcripts/codex.js'
import { parsePiTranscript, piSlug } from './sfterm/transcripts/pi.js'
import { parseQwenTranscript } from './sfterm/transcripts/qwen.js'
import { parseOpencodeTranscript } from './sfterm/transcripts/opencode.js'
import { parseCrushTranscript } from './sfterm/transcripts/crush.js'

const run = promisify(execFile)
export const HARNESSES = ['claude', 'codex', 'pi', 'opencode', 'qwen', 'gemini', 'crush'] as const
export type Harness = typeof HARNESSES[number]
const home = () => homedir()

export function harnessDe(nombre: string | null | undefined): Harness | null {
  const n = (nombre ?? '').toLowerCase()
  return (HARNESSES as readonly string[]).includes(n) ? n as Harness : null
}

export const claudeSlug = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, '-')
const canon = async (p: string) => { try { return await realpath(p) } catch { return p } }

async function jsonl(dir: string): Promise<{ path: string; birth: number; mtime: number; size: number }[]> {
  let names: string[] = []
  try { names = await readdir(dir) } catch { return [] }
  const out = []
  for (const n of names) {
    if (!n.endsWith('.jsonl')) continue
    try { const s = await stat(join(dir, n)); out.push({ path: join(dir, n), birth: s.birthtimeMs, mtime: s.mtimeMs, size: s.size }) } catch { /* se fue */ }
  }
  return out
}

function argvValor(argv: string[], ...flags: string[]): string | null {
  for (let i = 0; i < argv.length - 1; i++) if (flags.includes(argv[i])) return argv[i + 1]
  for (const a of argv) for (const f of flags) if (a.startsWith(f + '=')) return a.slice(f.length + 1)
  return null
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El archivo nacido en la ventana de arranque de ESTE proceso (o el que escribe después). */
/** SFTerm midió que en el mismo slug nacen sesiones de maquinaria (hooks) cada pocos
 *  minutos: se toma la PRIMERA nacida tras el arranque con cuerpo (>1 KB), no la última. */
function porNacimiento<T extends { birth: number; mtime: number; size: number }>(c: T[], startMs: number): T | null {
  const nacidos = c.filter(x => x.birth >= startMs - 5000 && x.size > 1024).sort((a, b) => a.birth - b.birth)
  if (nacidos.length) return nacidos[0]
  const tocados = c.filter(x => x.mtime >= startMs).sort((a, b) => b.mtime - a.mtime)
  return tocados[0] ?? null
}

export interface Ubicacion { harness: Harness; path: string; sid?: string; db?: boolean }

export async function ubicar(fg: ProcInfo): Promise<Ubicacion | null> {
  const harness = harnessDe(fg.name)
  if (!harness || !fg.cwd) return null
  const startMs = fg.start_s * 1000
  const cwd = fg.cwd
  if (harness === 'claude') {
    const dir = join(fg.config_dir || join(home(), '.claude'), 'projects', claudeSlug(cwd))
    const c = await jsonl(dir)
    const dura = argvValor(fg.argv, '--session-id', '--resume', '-r')
    if (dura && UUID.test(dura)) {
      const hit = c.find(x => x.path.endsWith(`${dura}.jsonl`))
      // un --resume puede bifurcar a un archivo nuevo nacido en el arranque: ese gana
      const fork = argvValor(fg.argv, '--session-id') ? null : porNacimiento(c.filter(x => x !== hit), startMs)
      if (fork && fork.birth >= startMs - 5000) return { harness, path: fork.path }
      if (hit) return { harness, path: hit.path, sid: dura }
    }
    const p = porNacimiento(c, startMs)
    return p ? { harness, path: p.path } : null
  }
  if (harness === 'codex') {
    const root = fg.config_dir || join(home(), '.codex')
    const quiero = await canon(cwd)
    const dias: string[] = []
    for (let t = startMs - 86_400_000; t <= Date.now() + 86_400_000; t += 86_400_000) {
      const d = new Date(t)
      dias.push(join(root, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')))
    }
    const c = (await Promise.all([...new Set(dias)].map(jsonl))).flat()
    const resumeId = fg.argv.includes('resume') ? fg.argv[fg.argv.indexOf('resume') + 1] : null
    if (resumeId && UUID.test(resumeId)) { const hit = c.find(x => x.path.includes(resumeId)); if (hit) return { harness, path: hit.path, sid: resumeId } }
    const propios = []
    for (const x of c.filter(x => x.birth >= startMs - 5000 || x.mtime >= startMs)) {
      const cab = await cabeza(x.path, 256 * 1024)
      try { const v = JSON.parse(cab.split('\n')[0]); if (await canon(v?.payload?.cwd ?? '') === quiero) propios.push(x) } catch { /* cabecera ilegible */ }
    }
    const p = porNacimiento(propios, startMs)
    return p ? { harness, path: p.path } : null
  }
  if (harness === 'pi') {
    const p = porNacimiento(await jsonl(join(home(), '.pi/agent/sessions', piSlug(cwd))), startMs)
    return p ? { harness, path: p.path } : null
  }
  if (harness === 'qwen' || harness === 'gemini') {
    const p = porNacimiento(await jsonl(join(home(), harness === 'qwen' ? '.qwen' : '.gemini', 'projects', claudeSlug(cwd), 'chats')), startMs)
    return p ? { harness, path: p.path } : null
  }
  // bases SQLite: la sesión más reciente de ESTA carpeta
  const db = harness === 'opencode' ? join(home(), '.local/share/opencode/opencode.db') : join(cwd, '.crush/crush.db')
  const sql = harness === 'opencode'
    ? `select id from session where directory='${cwd.replace(/'/g, "''")}' and time_archived is null order by time_updated desc limit 1;`
    : 'select id from sessions order by updated_at desc limit 1;'
  const sid = (await sqlite(db, sql)).trim().split('\n')[0]
  return sid && /^[A-Za-z0-9_-]{1,128}$/.test(sid) ? { harness, path: db, sid, db: true } : null
}

async function sqlite(db: string, sql: string): Promise<string> {
  try { return (await run('/usr/bin/sqlite3', ['-readonly', db, sql], { timeout: 5000, maxBuffer: 8_000_000 })).stdout } catch { return '' }
}

async function cabeza(path: string, n: number): Promise<string> {
  const f = await open(path, 'r')
  try { const b = Buffer.alloc(n); const { bytesRead } = await f.read(b, 0, n, 0); return b.subarray(0, bytesRead).toString('utf8') } finally { await f.close() }
}

/** La cola del archivo (el parser sabe que puede empezar a media conversación). */
async function cola(path: string, n = 768 * 1024): Promise<string> {
  const f = await open(path, 'r')
  try {
    const { size } = await f.stat()
    const desde = Math.max(0, size - n)
    const b = Buffer.alloc(size - desde)
    await f.read(b, 0, b.length, desde)
    const t = b.toString('utf8')
    return desde > 0 ? t.slice(t.indexOf('\n') + 1) : t
  } finally { await f.close() }
}

function sqlDe(u: Ubicacion): string {
  const s = u.sid!
  if (u.harness === 'opencode') return `select json_object('k','m','id',id,'t',time_created,'d',json(data)) from message where session_id='${s}' order by time_created,id;` +
    `select json_object('k','p','id',id,'m',message_id,'t',time_created,'d',json(data)) from part where session_id='${s}' order by time_created,id;`
  return `select json_object('k','m','id',id,'session',session_id,'role',role,'model',model,'provider',provider,'t',created_at,'parts',json(parts)) from messages where session_id='${s}' order by rowid;`
}

/** Tokens gastados por la sesión (base del tope de costo). null = el formato no lo dice. */
export function tokensDe(harness: Harness, raw: string): number | null {
  if (harness === 'claude') {
    let t = 0, visto = false
    const ids = new Set<string>()
    for (const l of raw.split('\n')) {
      if (!l.includes('"usage"')) continue
      try {
        const v = JSON.parse(l); const u = v?.message?.usage; if (!u) continue
        const id = v?.message?.id; if (id) { if (ids.has(id)) continue; ids.add(id) }
        t += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0); visto = true
      } catch { /* línea partida */ }
    }
    return visto ? t : null
  }
  if (harness === 'codex') {
    const m = [...raw.matchAll(/"total_token_usage":\{[^}]*"total_tokens":(\d+)/g)].pop()
    return m ? Number(m[1]) : null
  }
  return null
}

/**
 * Tokens de una sesión de Claude sobre el archivo COMPLETO, sin releerlo (2 oct 2026). La cola de 768 KB
 * basta para pintar los mensajes, no para sumar: en una sesión larga (capturas en base64) la suma salía
 * de las últimas decenas de mensajes y daba 7,830 tokens con el contexto al 54 %. Aquí se lee una vez
 * entero y después solo lo que se agregó; si el archivo se encoge (reescrito), se empieza de nuevo.
 */
const contadores = new Map<string, { offset: number; suma: number; visto: boolean; ids: Set<string>; resto: string }>()
export async function tokensClaudeCompletos(path: string): Promise<number | null> {
  const f = await open(path, 'r')
  try {
    const { size } = await f.stat()
    let c = contadores.get(path)
    if (!c || size < c.offset) { c = { offset: 0, suma: 0, visto: false, ids: new Set(), resto: '' }; contadores.set(path, c) }
    const BLOQUE = 8 * 1024 * 1024
    while (c.offset < size) {
      const b = Buffer.alloc(Math.min(BLOQUE, size - c.offset))
      const { bytesRead } = await f.read(b, 0, b.length, c.offset)
      if (!bytesRead) break
      c.offset += bytesRead
      const lineas = (c.resto + b.subarray(0, bytesRead).toString('utf8')).split('\n')
      c.resto = lineas.pop() ?? ''
      for (const l of lineas) {
        if (!l.includes('"usage"')) continue
        try {
          const v = JSON.parse(l); const u = v?.message?.usage; if (!u) continue
          const id = v?.message?.id; if (id) { if (c.ids.has(id)) continue; c.ids.add(id) }
          c.suma += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0); c.visto = true
        } catch { /* línea partida o no JSON */ }
      }
    }
    if (contadores.size > 200) contadores.delete(contadores.keys().next().value!)
    return c.visto ? c.suma : null
  } finally { await f.close() }
}

export interface Leido { ubicacion: Ubicacion; parsed: ParsedTranscript; tokens: number | null }
const cache = new Map<string, { firma: string; leido: Leido }>()

/** La ubicación de un proceso vivo casi no cambia (solo con /clear o un fork): se
 *  recuerda 60 s por PID+arranque. Sin esto cada lectura hacía stat de ~1,600 sesiones
 *  de la carpeta del proyecto (medido: picos de 26 s en la vista). */
const ubicaciones = new Map<string, { u: Ubicacion | null; at: number }>()
async function ubicarRecordado(fg: ProcInfo): Promise<Ubicacion | null> {
  const k = `${fg.pid}:${fg.start_s}:${fg.name}`
  const c = ubicaciones.get(k)
  if (c && Date.now() - c.at < (c.u ? 60_000 : 15_000)) return c.u
  const u = await ubicar(fg)
  ubicaciones.set(k, { u, at: Date.now() })
  if (ubicaciones.size > 200) ubicaciones.delete(ubicaciones.keys().next().value!)
  return u
}

export async function leer(fg: ProcInfo): Promise<Leido | null> {
  const u = await ubicarRecordado(fg)
  if (!u) return null
  let firma = ''
  try { const s = await stat(u.path); firma = `${u.path}:${u.sid ?? ''}:${s.size}:${s.mtimeMs}` } catch { return null }
  const c = cache.get(u.path + (u.sid ?? ''))
  if (c && c.firma === firma) return c.leido
  const raw = u.db ? await sqlite(u.path, sqlDe(u)) : await cola(u.path)
  const parse: Record<Harness, (r: string) => ParsedTranscript> = {
    claude: parseClaude, codex: parseCodexTranscript, pi: r => parsePiTranscript(r), qwen: parseQwenTranscript,
    gemini: parseQwenTranscript, opencode: parseOpencodeTranscript, crush: parseCrushTranscript,
  }
  let parsed: ParsedTranscript
  try { parsed = parse[u.harness](raw) } catch (e) { parsed = { msgs: [], truncated: false, error: e instanceof Error ? e.message : 'parser falló' } }
  // Con la cola cortada la suma sería parcial: mejor «sin medir» que una cifra falsa.
  // (Codex lleva total acumulado en cada evento, así que su cola sí basta.)
  // Claude en archivo: la suma va sobre el archivo entero (contador incremental), nunca sobre la cola.
  const tokens = u.harness === 'claude' && !u.db ? await tokensClaudeCompletos(u.path).catch(() => null)
    : parsed.truncated && u.harness !== 'codex' ? null : tokensDe(u.harness, raw)
  const leido = { ubicacion: u, parsed, tokens }
  cache.set(u.path + (u.sid ?? ''), { firma, leido })
  if (cache.size > 200) cache.delete(cache.keys().next().value!)
  return leido
}
