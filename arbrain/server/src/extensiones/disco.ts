/**
 * Extensiones · lo que se lee del disco (21 nov 2026, fase 2 del SPEC `docs/builds/extensiones-2026-11-20/SPEC.md`).
 *
 *   - Dónde: la carpeta de Claude Code del dueño (`CLAUDE_CONFIG_DIR` o `~/.claude`), su cerebro, la caché de cada
 *     extensión (`${CLAUDE_PLUGIN_DATA}` = `<config>/plugins/data/<ext>-arbrain`) y el archivo de llaves.
 *   - Qué está instalado: `<config>/plugins/installed_plugins.json` (lo escribe `claude plugin install`), filtrado a
 *     `<ext>@arbrain` en el ámbito local de ESTE cerebro (o el de usuario).
 *   - El catálogo: una carpeta con `.claude-plugin/marketplace.json` (hoy la del repo; mañana el repo de GitHub, que
 *     Claude Code clona y deja en `known_marketplaces.json`). Configurable con `ARBRAIN_EXTENSIONES_FUENTE`.
 *   - La fuente `ext:` con disco (regla 3: la ruta real, ya sin enlaces, no sale de la carpeta del permiso).
 *   - Las llaves que pide una extensión: `~/.config/arbrain/extensiones/llaves.env` (0600, fuera del cerebro y de git; el
 *     mismo archivo que ya lee la extensión). Nunca se devuelve un valor: solo si está o no.
 *
 * Sin estado ni red; cada función recibe sus rutas (las pruebas usan carpetas temporales).
 */
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, statSync, writeSync, closeSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { declarada, esNombreExtension, leerManifiesto, MARKETPLACE, type LecturaExt, type Manifiesto } from './modelo.js'

type Env = Record<string, string | undefined>

// ── Rutas ──

export const configDirClaude = (env: Env = process.env) => resolve(env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude'))
export const dirDatos = (configDir: string, ext: string) => join(configDir, 'plugins', 'data', `${ext}-${MARKETPLACE}`)
export const archivoLlaves = (env: Env = process.env) => resolve(env.ARBRAIN_LLAVES?.trim() || join(homedir(), '.config', 'arbrain', 'extensiones', 'llaves.env'))

const real = (p: string) => { try { return realpathSync(p) } catch { return resolve(p) } }
export const dentro = (base: string, p: string) => { const r = relative(base, p); return !!r && !r.startsWith('..') && !isAbsolute(r) && !r.split(sep).includes('..') }
const leerJson = (p: string): unknown => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

// ── Lo instalado ──

export interface Instalada { id: string; version: string | null; installPath: string; scope: string; instaladaEn: string | null }

/** `<ext>@arbrain` instaladas para ESTE cerebro (ámbito local o proyecto con su `projectPath`, o de usuario). */
export function leerInstaladas(configDir: string, cerebro: string): Map<string, Instalada> {
  const out = new Map<string, Instalada>()
  const j = leerJson(join(configDir, 'plugins', 'installed_plugins.json'))
  if (!obj(j) || !obj(j.plugins)) return out
  const yo = real(cerebro)
  for (const [clave, entradas] of Object.entries(j.plugins)) {
    const m = /^(.+)@([^@]+)$/.exec(clave)
    if (!m || m[2] !== MARKETPLACE || !esNombreExtension(m[1]) || !Array.isArray(entradas)) continue
    const validas = entradas.filter(obj).filter(e => typeof e.installPath === 'string')
    // Primero la de este cerebro; si no, la de usuario (vale para todos sus proyectos).
    const e = validas.find(x => (x.scope === 'local' || x.scope === 'project') && typeof x.projectPath === 'string' && real(x.projectPath) === yo)
      ?? validas.find(x => x.scope === 'user')
    if (!e) continue
    out.set(m[1], {
      id: m[1], version: typeof e.version === 'string' ? e.version : null, installPath: e.installPath as string, scope: String(e.scope),
      instaladaEn: typeof e.lastUpdated === 'string' ? e.lastUpdated : typeof e.installedAt === 'string' ? e.installedAt : null,
    })
  }
  return out
}

/** El `arbrain.json` de una carpeta de extensión (instalada o del catálogo), validado. */
export function manifiestoDe(carpeta: string): Manifiesto | null {
  return leerManifiesto(leerJson(join(carpeta, 'arbrain.json')))
}

// ── El catálogo ──

export type FuenteCatalogo = { tipo: 'carpeta'; ruta: string; dicha: string } | { tipo: 'remoto'; spec: string; dicha: string }

/** Hoy: la carpeta del repo. Mañana: `arbrain-ai/arbrain-extensiones` (o una URL git). */
export const FUENTE_POR_DEFECTO = 'docs/builds/extensiones-2026-11-20/arbrain-extensiones'
/** El catálogo público (Daniel, 21 nov 2026: «si dale»). Lo usa toda copia que no trae la carpeta del repo del autor. */
export const CATALOGO_PUBLICADO = 'arbrain-ai/arbrain-extensiones'

/**
 * `ARBRAIN_EXTENSIONES_FUENTE` (o el valor por defecto). Una ruta relativa se busca en las raíces dadas (el cerebro y el
 * repo de Arbrain); `dueño/repo` o una URL es remoto: Claude Code lo clona al conectarlo.
 */
export function fuenteCatalogo(env: Env, raices: string[]): FuenteCatalogo | null {
  const dicha = (env.ARBRAIN_EXTENSIONES_FUENTE ?? '').trim() || FUENTE_POR_DEFECTO
  const url = /^(https?:\/\/|git@)/.test(dicha)
  if (!url) {
    const candidatas = isAbsolute(dicha) || dicha.startsWith('~/')
      ? [dicha.startsWith('~/') ? join(homedir(), dicha.slice(2)) : dicha]
      : raices.map(r => resolve(r, dicha))
    const ruta = candidatas.find(existeCatalogo)
    if (ruta) return { tipo: 'carpeta', ruta: real(ruta), dicha }
  }
  // Sin la carpeta del repo del autor (la copia del alumno no la trae): el catálogo publicado (21 nov 2026).
  if (dicha === FUENTE_POR_DEFECTO) return { tipo: 'remoto', spec: CATALOGO_PUBLICADO, dicha: CATALOGO_PUBLICADO }
  // `dueño/repo` de GitHub o una URL git: Claude Code lo clona al conectarlo.
  return url || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(dicha) ? { tipo: 'remoto', spec: dicha, dicha } : null
}
const existeCatalogo = (d: string) => existsSync(join(d, '.claude-plugin', 'marketplace.json'))

/** ¿Este cerebro ya declara el catálogo `arbrain`? (`.claude/settings.local.json › extraKnownMarketplaces`) */
export function catalogoDeclarado(cerebro: string): unknown {
  const s = leerJson(join(cerebro, '.claude', 'settings.local.json'))
  return obj(s) && obj(s.extraKnownMarketplaces) ? (s.extraKnownMarketplaces as Record<string, unknown>)[MARKETPLACE] ?? null : null
}

/** La carpeta donde Claude Code dejó el catálogo `arbrain` (la copia clonada de un repo, o la carpeta misma). */
export function carpetaCatalogoConocida(configDir: string): string | null {
  const j = leerJson(join(configDir, 'plugins', 'known_marketplaces.json'))
  const m = obj(j) ? j[MARKETPLACE] : null
  return obj(m) && typeof m.installLocation === 'string' && existeCatalogo(m.installLocation) ? m.installLocation : null
}

export interface EntradaCatalogo {
  id: string
  nombre: string
  version: string | null
  descripcion: string
  categoria: string | null
  etiquetas: string[]
  /** Primer párrafo del README (la tienda lo muestra). */
  acerca: string | null
  carpeta: string
  manifiesto: Manifiesto | null
}

export function leerCatalogo(dir: string): { nombre: string; version: string | null; entradas: EntradaCatalogo[] } {
  const mk = leerJson(join(dir, '.claude-plugin', 'marketplace.json'))
  if (!obj(mk) || !Array.isArray(mk.plugins)) return { nombre: MARKETPLACE, version: null, entradas: [] }
  const base = real(dir)
  const entradas: EntradaCatalogo[] = []
  for (const p of mk.plugins) {
    if (!obj(p) || !esNombreExtension(p.name) || typeof p.source !== 'string') continue
    const carpeta = resolve(base, p.source)
    if (!dentro(base, real(carpeta))) continue
    const pj = leerJson(join(carpeta, '.claude-plugin', 'plugin.json'))
    const manifiesto = manifiestoDe(carpeta)
    entradas.push({
      id: p.name,
      nombre: obj(pj) && typeof pj.displayName === 'string' ? pj.displayName : manifiesto?.nombre ?? p.name,
      version: obj(pj) && typeof pj.version === 'string' ? pj.version : null,
      descripcion: manifiesto?.resumen ?? (obj(pj) && typeof pj.description === 'string' ? pj.description : ''),
      categoria: typeof p.category === 'string' ? p.category : null,
      etiquetas: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === 'string').slice(0, 8) : [],
      acerca: primerParrafo(join(carpeta, 'README.md')),
      carpeta,
      manifiesto,
    })
  }
  const meta = obj(mk.metadata) ? mk.metadata : {}
  return { nombre: typeof mk.name === 'string' ? mk.name : MARKETPLACE, version: typeof meta.version === 'string' ? meta.version : null, entradas }
}

function primerParrafo(archivo: string): string | null {
  let t: string
  try { t = readFileSync(archivo, 'utf8') } catch { return null }
  const parrafo = t.split(/\n\s*\n/).map(b => b.trim()).find(b => b && !b.startsWith('#') && !b.startsWith('```') && !b.startsWith('|') && !b.startsWith('>'))
  return parrafo ? parrafo.replace(/\s+/g, ' ').replace(/\*\*|`/g, '').slice(0, 600) : null
}

// ── La fuente `ext:` (SPEC §2) ──

const LIMITE_FUENTE = 8 * 1024 * 1024
const NEGADO: LecturaExt = { estado: 'negado', valor: null, fecha: null }

/**
 * Las tres reglas: (1) declarada letra por letra en `panel.datos`, (2) `$CEREBRO` dentro de `permisos.lee`,
 * (3) la ruta real, ya sin enlaces, no sale de la carpeta que abre su permiso. Solo `.json`. No existe = `vacio` (el panel
 * dice «sin dato»); JSON roto = `vacio` con `error`. Nunca un cero inventado.
 */
export function resolverFuenteExt(fuente: unknown, m: Manifiesto | null, raices: { cerebro: string; datos: string | null }): LecturaExt {
  const d = declarada(fuente, m)
  if (!d) return NEGADO
  const base = d.raiz === 'cerebro' ? raices.cerebro : raices.datos
  if (!base) return NEGADO
  const p = resolve(base, d.rel)
  if (!dentro(resolve(base), p)) return NEGADO
  let r: string, techo: string
  try { r = realpathSync(p) } catch { return { estado: 'vacio', valor: null, fecha: null } }
  try { techo = realpathSync(resolve(base, d.permiso || '.')) } catch { return NEGADO }
  if (!dentro(techo, r) || !r.endsWith('.json')) return NEGADO
  const st = statSync(r)
  if (!st.isFile() || st.size > LIMITE_FUENTE) return { estado: 'vacio', valor: null, fecha: null, error: 'no es un archivo o es muy grande' }
  try {
    return { estado: 'ok', valor: JSON.parse(readFileSync(r, 'utf8')), fecha: st.mtime.toISOString() }
  } catch {
    return { estado: 'vacio', valor: null, fecha: st.mtime.toISOString(), error: 'JSON roto' }
  }
}

// ── Archivos del panel ──

const TIPOS: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  woff2: 'font/woff2', woff: 'font/woff',
}
const LIMITE_PANEL = 4 * 1024 * 1024

/** Un archivo de `panel/` de la extensión instalada, o null (fuera de `panel/`, enlace que escapa, tipo raro, muy grande). */
export function archivoDelPanel(installPath: string, ruta: string): { bytes: Buffer; tipo: string; ext: string } | null {
  if (!ruta || ruta.length > 300 || ruta.includes('\0') || ruta.includes('\\') || ruta.split('/').some(p => !p || p === '..' || p === '.')) return null
  const ext = ruta.slice(ruta.lastIndexOf('.') + 1).toLowerCase()
  if (!TIPOS[ext]) return null
  let base: string, r: string
  try { base = realpathSync(join(installPath, 'panel')); r = realpathSync(join(base, ruta)) } catch { return null }
  if (!dentro(base, r)) return null
  const st = statSync(r)
  if (!st.isFile() || st.size > LIMITE_PANEL) return null
  return { bytes: readFileSync(r), tipo: TIPOS[ext], ext }
}

// ── Llaves ──

const varDe = (clave: string) => clave.toUpperCase()

/** Lee el archivo de llaves (KEY=valor). Solo para el scheduler y para saber si están; nunca sale en una respuesta. */
export function leerLlaves(archivo: string): Record<string, string> {
  const out: Record<string, string> = {}
  let t = ''
  try { t = readFileSync(archivo, 'utf8') } catch { return out }
  for (const ln of t.split('\n')) {
    const i = ln.indexOf('=')
    if (i < 1 || ln.trim().startsWith('#')) continue
    const v = ln.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    if (v) out[ln.slice(0, i).trim()] = v
  }
  return out
}

/** ¿Qué llaves de la extensión ya están? (en el archivo o en el entorno del daemon). */
export function llavesGuardadas(m: Manifiesto, archivo: string, env: Env = process.env): Record<string, boolean> {
  const hay = leerLlaves(archivo)
  return Object.fromEntries(m.requiere.llaves.map(l => [l.clave, !!(hay[varDe(l.clave)] || env[varDe(l.clave)]?.trim())]))
}

/** Guarda (o reemplaza) llaves de una extensión: 0600, en su carpeta 0700. Solo claves que la extensión declara. */
export function guardarLlaves(archivo: string, m: Manifiesto, nuevas: Record<string, unknown>): string[] {
  const permitidas = new Set(m.requiere.llaves.map(l => l.clave))
  const aGuardar = Object.entries(nuevas)
    .filter((e): e is [string, string] => permitidas.has(e[0]) && typeof e[1] === 'string' && !!e[1].trim() && e[1].length <= 400 && !/[\r\n\0]/.test(e[1]))
  if (!aGuardar.length) return []
  const vars = new Set(aGuardar.map(([k]) => varDe(k)))
  let previas: string[] = []
  try { previas = readFileSync(archivo, 'utf8').split('\n').filter(ln => ln.trim() && !vars.has(ln.slice(0, ln.indexOf('=')).trim())) } catch { /* nuevo */ }
  const dir = archivo.slice(0, archivo.length - basename(archivo).length)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const fd = openSync(archivo, 'w', 0o600)
  try { writeSync(fd, [...previas, ...aGuardar.map(([k, v]) => `${varDe(k)}=${v.trim()}`)].join('\n') + '\n') } finally { closeSync(fd) }
  chmodSync(archivo, 0o600)
  return aGuardar.map(([k]) => k)
}

/** Las llaves que necesita una tarea, como variables de entorno (archivo primero; si no, el entorno del daemon). */
export function entornoDeLlaves(claves: string[], archivo: string, env: Env = process.env): { vars: Record<string, string>; faltan: string[] } {
  const hay = leerLlaves(archivo)
  const vars: Record<string, string> = {}
  const faltan: string[] = []
  for (const c of claves) {
    const v = hay[varDe(c)] || env[varDe(c)]?.trim()
    if (v) vars[varDe(c)] = v
    else faltan.push(c)
  }
  return { vars, faltan }
}

/** Las carpetas de `.claude/skills/` del cerebro (para `requiere.skills_base`). */
export function skillsDelCerebro(cerebro: string): Set<string> {
  try { return new Set(readdirSync(join(cerebro, '.claude', 'skills'))) } catch { return new Set() }
}
