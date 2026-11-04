/**
 * «Trae tu negocio», solo la parte de contar (onboarding v2, 3 nov 2026). Solo servidor.
 *
 * Cuenta lo que la persona podría traer, sin leer contenido: conversaciones de Claude Code y Codex de los últimos N días
 * y sus carpetas de trabajo recientes. Mismos lugares que Cloudroom v140 (`session-import.ts`, `local-repos.ts`):
 *   - Claude Code: `$CLAUDE_CONFIG_DIR|~/.claude/projects/<proyecto>/*.jsonl`, sin `agent-*`, sin hilos laterales y sin
 *     sesiones del SDK (las del propio chat de Arbrain corren por el SDK: contarlas sería traer a Levy a sí mismo).
 *   - Codex: `$CODEX_HOME|~/.codex/sessions/**\/rollout-*.jsonl`, solo las iniciadas desde `cli` o `vscode`.
 *   - Carpetas: las que tienen `.git` un nivel dentro de las carpetas de código de siempre. NO se recorren Documentos
 *     ni Escritorio: en macOS eso dispara el aviso de permisos del sistema; para esas está «Elegir otra carpeta…».
 * De cada archivo se mira su fecha y, en las sesiones, solo el primer registro (de dónde nació). El contenido de las
 * conversaciones lo lee el daemon al importar, con permiso explícito de la persona (SPEC › «Trae tu negocio»).
 */
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Hallazgos } from './demo'

export interface Fs {
  readdirSync(p: string): string[]
  statSync(p: string): { mtimeMs: number; isDirectory(): boolean }
  /** Los primeros `n` bytes del archivo como texto (vacío si no se pudo). */
  cabeza(p: string, n: number): string
}

export const fsReal: Fs = {
  readdirSync: (p) => readdirSync(p),
  statSync: (p) => statSync(p),
  cabeza: (p, n) => {
    let fd: number | null = null
    try { fd = openSync(p, 'r'); const b = Buffer.alloc(n); const k = readSync(fd, b, 0, n, 0); return b.subarray(0, k).toString('utf8') } catch { return '' } finally { if (fd !== null) closeSync(fd) }
  },
}

const DIA = 86_400_000
const TOPE_ARCHIVOS = 5_000
/** Se lee poco y, solo si ahí no está de dónde nació la sesión, un poco más (medido el 3 nov: a veces pasa de 8 KB). */
const CABEZA = 8_192
const CABEZA_LARGA = 65_536
export const RAICES_CODIGO = ['', 'code', 'Code', 'Projects', 'projects', 'Developer', 'dev', 'src', 'repos', 'GitHub', 'work'] as const

const lista = (fs: Fs, p: string) => { try { return fs.readdirSync(p) } catch { return [] } }
const fecha = (fs: Fs, p: string) => { try { return fs.statSync(p).mtimeMs } catch { return 0 } }
const esDir = (fs: Fs, p: string) => { try { return fs.statSync(p).isDirectory() } catch { return false } }

/** Registros JSON del principio del archivo (las líneas completas que caben en la cabeza). */
function primeros(texto: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const l of texto.split('\n').slice(0, -1)) { try { const j = JSON.parse(l); if (j && typeof j === 'object') out.push(j) } catch { /* línea a medias */ } }
  return out
}

/** De dónde nació una sesión de Claude Code: de la persona (terminal o app de Claude), del SDK (otra app, incluido
 *  Arbrain, o `claude -p` en un script) o un hilo lateral. `null` si en lo leído todavía no lo dice. */
export function origenClaude(cabeza: string): 'persona' | 'sdk' | 'lateral' | null {
  for (const r of primeros(cabeza)) {
    if (r.isSidechain === true) return 'lateral'
    if (typeof r.entrypoint === 'string') return r.entrypoint.startsWith('sdk') ? 'sdk' : 'persona'
  }
  return null
}

/** ¿Es una conversación de la persona? Sin dato, sí (no se descarta a ciegas). */
export const esConversacionClaude = (cabeza: string) => { const o = origenClaude(cabeza); return o === null || o === 'persona' }

export function esConversacionCodex(cabeza: string): boolean {
  for (const r of primeros(cabeza)) {
    const p = r.payload as Record<string, unknown> | undefined
    const src = (p?.source ?? r.source) as unknown
    if (typeof src === 'string') return src === 'cli' || src === 'vscode'
  }
  return true
}

export function contarClaude(dir: string, desde: number, fs: Fs = fsReal) {
  let n = 0, vistos = 0
  const proyectos = new Set<string>()
  for (const proyecto of lista(fs, join(dir, 'projects'))) {
    const base = join(dir, 'projects', proyecto)
    for (const f of lista(fs, base)) {
      if (!f.endsWith('.jsonl') || f.startsWith('agent-')) continue
      if (++vistos > TOPE_ARCHIVOS) return { n, proyectos: proyectos.size }
      const p = join(base, f)
      if (fecha(fs, p) < desde) continue
      const origen = origenClaude(fs.cabeza(p, CABEZA)) ?? origenClaude(fs.cabeza(p, CABEZA_LARGA))
      if (origen === 'sdk' || origen === 'lateral') continue
      n++; proyectos.add(proyecto)
    }
  }
  return { n, proyectos: proyectos.size }
}

export function contarCodex(dir: string, desde: number, fs: Fs = fsReal): number {
  let n = 0, vistos = 0
  const recorrer = (p: string, nivel: number) => {
    for (const f of lista(fs, p)) {
      const q = join(p, f)
      if (nivel < 3 && esDir(fs, q)) { recorrer(q, nivel + 1); continue }
      if (!/^rollout-.*\.jsonl(\.zst)?$/.test(f)) continue
      if (++vistos > TOPE_ARCHIVOS) return
      if (fecha(fs, q) < desde) continue
      if (f.endsWith('.jsonl') && !esConversacionCodex(fs.cabeza(q, CABEZA))) continue
      n++
    }
  }
  recorrer(join(dir, 'sessions'), 0)
  return n
}

export function haceCuanto(ms: number, ahora: number): string {
  const d = Math.floor((ahora - ms) / DIA)
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`
}

export function carpetasRecientes(home: string, ahora: number, fs: Fs = fsReal, max = 3) {
  const vistas = new Map<string, number>()
  for (const raiz of RAICES_CODIGO) {
    const base = raiz ? join(home, raiz) : home
    for (const f of lista(fs, base)) {
      if (f.startsWith('.')) continue
      const p = join(base, f)
      const git = fecha(fs, join(p, '.git'))
      if (git && !vistas.has(p)) vistas.set(p, git)
    }
  }
  return [...vistas].sort((a, b) => b[1] - a[1]).slice(0, max).map(([p, ms]) => ({ nombre: basename(p), hace: haceCuanto(ms, ahora) }))
}

export function hallazgosLocales(env: Record<string, string | undefined>, home: string, ahora = Date.now(), dias = 30, fs: Fs = fsReal): Hallazgos {
  const desde = ahora - dias * DIA
  const c = contarClaude(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), desde, fs)
  const codex = contarCodex(env.CODEX_HOME || join(home, '.codex'), desde, fs)
  return { chats: { claude: c.n, codex, proyectos: c.proyectos, dias }, carpetas: carpetasRecientes(home, ahora, fs) }
}
