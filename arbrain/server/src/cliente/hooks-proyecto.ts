/**
 * Ganchos del proyecto en la edición cliente (red team 2 C-1, 11 oct 2026).
 *
 * El CLI ejecuta los `hooks` de `<cerebro>/.claude/settings.json` con todos los permisos de la persona: fuera del sandbox
 * de Bash y sin pasar por la guardia. Dos capas:
 *
 *   1. La política (`politica-agentes.ts › nivelProteccion`) no deja que el agente escriba sin confirmación nada que un
 *      gancho ejecute o importe; settings y `.claude/hooks/**` ni con clic. La prueba `hooks-proyecto.test.ts` recorre los
 *      `command` de la plantilla, resuelve cada archivo que ejecutan o importan (`archivosDeHooks`) y falla si alguno es
 *      escribible por el agente sin confirmación.
 *   2. Antes de cada turno el daemon calcula la huella de lo que los ganchos ejecutarían (`huellaHooks`: settings.json,
 *      todo `.claude/hooks/**` y los archivos que `archivosDeHooks` encuentra) y la compara con las aceptadas: la de la
 *      plantilla que viaja en la app (`ARBRAIN_PLANTILLA_DIR`) y la que quedó al sembrar el cerebro (guardada en la carpeta
 *      de configuración de la app, que el agente no puede tocar). Si no coincide, la sesión arranca SIN ganchos del
 *      proyecto (`disableAllHooks` en la capa de flags; la guardia de Arbrain son callbacks del SDK y sigue corriendo) y
 *      se registra. Si el cerebro no tiene ganchos, no hay nada que verificar.
 *
 * Sin plantilla ni huella guardada (instalación anterior a esta versión), la primera huella se acepta y se guarda.
 * Instalación de Daniel: nada de esto corre.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'

/** Extensiones de archivos que un gancho puede ejecutar o importar. */
export const EXT_EJECUTABLE = /\.(py|pyw|sh|bash|zsh|fish|ts|mts|cts|tsx|js|mjs|cjs|jsx|rb|pl|php|lua|command|ps1|psm1|bat|cmd|swift)$/i
const VARIABLE_PROYECTO = /\$\{?CLAUDE_PROJECT_DIR\}?/g

/** Los `command` de todos los ganchos de un settings.json (cualquier evento). */
export function comandosDeHooks(settings: unknown): string[] {
  const out: string[] = []
  const hooks = (settings && typeof settings === 'object' ? (settings as Record<string, unknown>).hooks : null) as Record<string, unknown> | null
  if (!hooks || typeof hooks !== 'object') return out
  for (const grupos of Object.values(hooks)) {
    if (!Array.isArray(grupos)) continue
    for (const g of grupos) {
      const lista = (g && typeof g === 'object' ? (g as Record<string, unknown>).hooks : null)
      if (!Array.isArray(lista)) continue
      for (const h of lista) {
        const c = h && typeof h === 'object' ? (h as Record<string, unknown>).command : undefined
        if (typeof c === 'string' && c.trim()) out.push(c)
      }
    }
  }
  return out
}

function leerJson(ruta: string): unknown {
  try { return JSON.parse(readFileSync(ruta, 'utf8')) } catch { return null }
}

const esArchivo = (p: string) => { try { return statSync(p).isFile() } catch { return false } }

/** Palabras de un comando de shell que parecen rutas (sin comillas). Por exceso. */
function rutasEnComando(cmd: string, raiz: string): string[] {
  const plano = cmd.replace(VARIABLE_PROYECTO, raiz)
  const out: string[] = []
  for (const m of plano.matchAll(/"([^"]*)"|'([^']*)'|([^\s'";|&<>()`]+)/g)) {
    const t = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (!t || t.startsWith('-')) continue
    if (!EXT_EJECUTABLE.test(t) && !/[\\/]/.test(t)) continue
    const v = /^\$\{?[A-Za-z_]\w*(?::-[^}]*)?\}?[\\/]+(.*)$/.exec(t)
    out.push(v ? resolve(raiz, v[1]) : isAbsolute(t) ? resolve(t) : resolve(raiz, t))
  }
  return out
}

/** Archivos que un script ejecuta o importa, por lectura estática. Por exceso: incluye candidatos que no existen. */
function referenciasDe(archivo: string, raiz: string): string[] {
  let texto = ''
  try { if (statSync(archivo).size > 1_000_000) return []; texto = readFileSync(archivo, 'utf8') } catch { return [] }
  const dir = dirname(archivo)
  const out = new Set<string>()
  const agregar = (lit: string) => {
    let l = lit.replace(VARIABLE_PROYECTO, raiz).trim()
    if (!l || l.length > 300) return
    // Otra variable de shell al inicio (`"$dir/.claude/hooks/x.ts"`, `${ROOT}/…`): casi siempre es la raíz del proyecto.
    const v = /^\$\{?[A-Za-z_]\w*(?::-[^}]*)?\}?[\\/]+(.*)$/.exec(l)
    if (v) { out.add(resolve(raiz, v[1])); out.add(resolve(dir, v[1])); return }
    if (isAbsolute(l)) { out.add(resolve(l)); return }
    out.add(resolve(dir, l))                       // Path(__file__).with_name(...), ./x.sh, source x.sh
    if (/[\\/]/.test(l)) out.add(resolve(raiz, l)) // root / 'arbrain/server/scripts/...'
  }
  // Literales entre comillas con extensión ejecutable (rutas armadas con Path, subprocess, spawn, source…).
  for (const m of texto.matchAll(/(["'`])([^"'`\n]{1,300}?)\1/g)) if (EXT_EJECUTABLE.test(m[2])) agregar(m[2])
  // Rutas sin comillas en shell: $CLAUDE_PROJECT_DIR/…, ./x.sh, x/y.py.
  for (const m of texto.matchAll(/(?:^|[\s=(:])((?:\$\{?CLAUDE_PROJECT_DIR\}?|\.{1,2})?[\w./${}-]*\.(?:py|sh|bash|zsh|ts|mts|js|mjs|cjs|rb|pl|php))(?=$|[\s;|&)'"])/gm)) agregar(m[1])
  // Python: import x / from x import y → hermanos x.py o x/__init__.py (el directorio del script va primero en sys.path).
  if (/\.pyw?$/i.test(archivo)) {
    for (const m of texto.matchAll(/^[ \t]*(?:from[ \t]+([\w.]+)[ \t]+import|import[ \t]+([\w., \t]+))/gm)) {
      const nombres = (m[1] ? [m[1]] : (m[2] ?? '').split(',')).map(n => n.trim().split(/\s+/)[0].split('.')[0]).filter(Boolean)
      for (const n of nombres) { out.add(join(dir, `${n}.py`)); out.add(join(dir, n, '__init__.py')) }
    }
  }
  // JS/TS: import/require relativos.
  if (/\.(ts|mts|cts|tsx|js|mjs|cjs|jsx)$/i.test(archivo)) {
    for (const m of texto.matchAll(/(?:import|require|from)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const base = resolve(dir, m[1])
      out.add(base)
      if (!EXT_EJECUTABLE.test(base)) for (const e of ['.ts', '.js', '.mjs', '.cjs', '/index.ts', '/index.js']) out.add(base + e)
      else out.add(base.replace(/\.js$/, '.ts'))
    }
  }
  return [...out]
}

/**
 * Archivos (rutas absolutas) que los ganchos de `raiz` ejecutan o importan, recorriendo las referencias de cada script.
 * Lectura estática y por exceso: si algo se ejecuta y no se resuelve aquí, la prueba de la plantilla lo debe mostrar.
 */
export function archivosDeHooks(raiz: string, settings: unknown = leerJson(join(raiz, '.claude', 'settings.json'))): { comandos: string[]; archivos: string[] } {
  const comandos = comandosDeHooks(settings)
  const vistos = new Set<string>()
  const pendientes: string[] = []
  for (const c of comandos) for (const r of rutasEnComando(c, raiz)) if (!vistos.has(r)) { vistos.add(r); pendientes.push(r) }
  for (let n = 0; pendientes.length && n < 500; n++) {
    const a = pendientes.shift()!
    if (!esArchivo(a)) continue
    for (const r of referenciasDe(a, raiz)) if (!vistos.has(r)) { vistos.add(r); pendientes.push(r) }
  }
  return { comandos, archivos: [...vistos].filter(a => EXT_EJECUTABLE.test(a)).sort() }
}

/**
 * Los archivos ejecutables o importables de una carpeta (recursivo, sin cachés de Python), en orden. Los datos que los
 * propios ganchos escriben ahí (`hooks/tmp/*.jsonl`, estados) no cuentan: cambian en cada turno y no se ejecutan.
 */
function archivosDe(dir: string, raiz = dir, out: string[] = []): string[] {
  let entradas: string[] = []
  try { entradas = readdirSync(dir).sort() } catch { return out }
  for (const e of entradas) {
    if (e === '__pycache__' || e === '.DS_Store' || e.endsWith('.pyc')) continue
    const p = join(dir, e)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) archivosDe(p, raiz, out)
    else if (st.isFile() && EXT_EJECUTABLE.test(e)) out.push(p)
  }
  return out
}

/**
 * Huella de lo que los ganchos de `raiz` ejecutarían: settings.json, todo `.claude/hooks/**` y cada archivo que
 * `archivosDeHooks` encuentra (contenido o «ausente»). `null` si no hay ganchos (nada que verificar).
 */
export function huellaHooks(raiz: string): string | null {
  const ajustes = join(raiz, '.claude', 'settings.json')
  const settings = leerJson(ajustes)
  const { comandos, archivos } = archivosDeHooks(raiz, settings)
  if (!comandos.length) return null
  const h = createHash('sha256')
  const meter = (ruta: string) => {
    const rel = relative(raiz, ruta).replace(/\\/g, '/')
    h.update(`\0${rel}\0`)
    try { h.update(readFileSync(ruta)) } catch { h.update('\0ausente\0') }
  }
  meter(ajustes)
  const todos = new Set([...archivosDe(join(raiz, '.claude', 'hooks')), ...archivos])
  for (const a of [...todos].sort()) if (a !== ajustes) meter(a)
  return h.digest('hex')
}

const RUTA_ACEPTADAS = () => join(DIR_ARBRAIN(), 'hooks-aceptados.json')

function aceptadasGuardadas(): string[] {
  const j = leerJson(RUTA_ACEPTADAS()) as { huellas?: unknown } | null
  return Array.isArray(j?.huellas) ? (j!.huellas as unknown[]).filter((x): x is string => typeof x === 'string') : []
}

/** Guarda una huella aceptada (al sembrar el cerebro o la primera vez). En la carpeta de configuración de la app (0600). */
export function aceptarHuella(huella: string): void {
  const previas = aceptadasGuardadas()
  if (previas.includes(huella)) return
  mkdirSync(dirname(RUTA_ACEPTADAS()), { recursive: true, mode: 0o700 })
  writeFileSync(RUTA_ACEPTADAS(), JSON.stringify({ huellas: [...previas, huella].slice(-8) }, null, 1) + '\n', { mode: 0o600 })
}

/** Tras sembrar el cerebro desde la plantilla: lo sembrado es lo aceptado. */
export function registrarHuellaSembrada(home: string): void {
  const h = huellaHooks(home)
  if (h) aceptarHuella(h)
}

const cachePlantilla = new Map<string, string | null>()
function huellaPlantilla(plantilla: string | undefined): string | null {
  if (!plantilla || !existsSync(plantilla)) return null
  if (!cachePlantilla.has(plantilla)) cachePlantilla.set(plantilla, huellaHooks(plantilla))
  return cachePlantilla.get(plantilla) ?? null
}

export interface VerificacionHooks { ok: boolean; huella: string | null; motivo?: string }

/** ¿Los ganchos del cerebro son los aceptados? Se llama antes de cada sesión del agente (edición cliente). */
export function verificarHooksProyecto(env: NodeJS.ProcessEnv = process.env): VerificacionHooks {
  const home = env.ARBRAIN_HOME
  if (!home) return { ok: true, huella: null }
  let huella: string | null
  try { huella = huellaHooks(home) } catch (e) { return { ok: false, huella: null, motivo: `no se pudo leer los ganchos: ${(e as Error).message}` } }
  if (!huella) return { ok: true, huella: null }
  const aceptadas = new Set(aceptadasGuardadas())
  const dePlantilla = huellaPlantilla(env.ARBRAIN_PLANTILLA_DIR)
  if (dePlantilla) aceptadas.add(dePlantilla)
  if (!aceptadas.size) {
    try { aceptarHuella(huella) } catch { /* sin carpeta de configuración: igual se acepta en este arranque */ }
    return { ok: true, huella, motivo: 'primera huella aceptada (sin plantilla ni huella guardada)' }
  }
  if (aceptadas.has(huella)) return { ok: true, huella }
  return { ok: false, huella, motivo: 'los ganchos del cerebro (o lo que ejecutan) no coinciden con los de la plantilla: la sesión arranca sin ganchos del proyecto' }
}

/** Solo pruebas. */
export function _vaciarCacheHooksParaPruebas(): void { cachePlantilla.clear() }
