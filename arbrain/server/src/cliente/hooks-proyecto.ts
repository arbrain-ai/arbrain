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
 *
 * Versión firmada (27 oct 2026, reporte de un fundador): desde la v0.2 el cerebro es la copia de GitHub y se actualiza con
 * `git pull`; la plantilla del modo servidor (`arbrain/cerebro/semilla`) no trae ganchos y la huella solo se guardaba al
 * sembrar, así que la primera versión que cambió los ganchos (v0.2.9, py.sh) dejó a esos cerebros sin ganchos en cada
 * sesión. Ahora, si la huella no está aceptada pero cada archivo que la forma es idéntico al de la última etiqueta `v*`
 * alcanzable desde HEAD y esa etiqueta verifica contra el ancla de firmas de la persona
 * (`~/.config/arbrain/firmas-permitidas`, la misma de INSTALAR, actualizar-arbrain y el programa ya compilado), la huella
 * se acepta y se guarda.
 * Instalación de Daniel: nada de esto corre.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
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

/** Rutas absolutas que forman la huella de `raiz`, en el orden en que se mezclan (settings.json primero), o `null` sin ganchos. */
export function rutasDeLaHuella(raiz: string): string[] | null {
  const ajustes = join(raiz, '.claude', 'settings.json')
  const settings = leerJson(ajustes)
  const { comandos, archivos } = archivosDeHooks(raiz, settings)
  if (!comandos.length) return null
  const todos = new Set([...archivosDe(join(raiz, '.claude', 'hooks')), ...archivos])
  todos.delete(ajustes)
  return [ajustes, ...[...todos].sort()]
}

/**
 * Huella de lo que los ganchos de `raiz` ejecutarían: settings.json, todo `.claude/hooks/**` y cada archivo que
 * `archivosDeHooks` encuentra (contenido o «ausente»). `null` si no hay ganchos (nada que verificar).
 */
export function huellaHooks(raiz: string): string | null {
  const rutas = rutasDeLaHuella(raiz)
  if (!rutas) return null
  const h = createHash('sha256')
  for (const ruta of rutas) {
    const rel = relative(raiz, ruta).replace(/\\/g, '/')
    h.update(`\0${rel}\0`)
    try { h.update(readFileSync(ruta)) } catch { h.update('\0ausente\0') }
  }
  return h.digest('hex')
}

const git = (repo: string, args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 15_000, windowsHide: true })

/** ssh-keygen para `verify-tag`: en Windows, el de Git (el de System32 puede ser viejo). Mismo criterio que programa.mjs. */
function sshKeygen(repo: string): string {
  if (process.platform !== 'win32') return 'ssh-keygen'
  const exec = git(repo, ['--exec-path']).stdout?.trim()
  const candidato = exec ? join(exec, '..', '..', '..', 'usr', 'bin', 'ssh-keygen.exe') : ''
  return candidato && existsSync(candidato) ? candidato : 'ssh-keygen'
}

/**
 * ¿Los ganchos de `raiz` son exactamente los de una versión firmada? Última etiqueta `v*` alcanzable desde HEAD, anotada
 * y firmada por una llave del ancla de la persona; cada archivo de la huella presente en disco existe en la etiqueta, y
 * ninguno (presente o ausente) difiere de ella (`git diff`, que respeta los finales de línea de Windows).
 * Devuelve la etiqueta o el motivo por el que no.
 */
export function ganchosDeVersionFirmada(raiz: string, env: NodeJS.ProcessEnv = process.env): { etiqueta?: string; motivo?: string } {
  const ancla = env.ARBRAIN_FIRMAS_PERMITIDAS || join(homedir(), '.config', 'arbrain', 'firmas-permitidas')
  if (!existsSync(ancla)) return { motivo: 'no hay ancla de firmas en ~/.config/arbrain' }
  const rutas = rutasDeLaHuella(raiz)
  if (!rutas) return { motivo: 'sin ganchos' }
  const rels = rutas.map(r => relative(raiz, r).replace(/\\/g, '/'))
  if (rels.some(r => r === '..' || r.startsWith('../') || isAbsolute(r))) return { motivo: 'un gancho apunta fuera del cerebro' }
  const d = git(raiz, ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD'])
  const etiqueta = d.status === 0 ? (d.stdout ?? '').trim() : ''
  if (!etiqueta) return { motivo: 'la copia no tiene etiquetas de versión (o no es un repositorio git)' }
  if (git(raiz, ['cat-file', '-t', etiqueta]).stdout?.trim() !== 'tag') return { motivo: `${etiqueta} no es una etiqueta anotada` }
  const v = git(raiz, ['-c', 'gpg.format=ssh', '-c', `gpg.ssh.program=${sshKeygen(raiz)}`, '-c', `gpg.ssh.allowedSignersFile=${ancla}`, 'verify-tag', etiqueta])
  if (v.status !== 0) return { motivo: `la firma de ${etiqueta} no verifica` }
  const lista = git(raiz, ['ls-tree', '-r', '--name-only', etiqueta, '--', ...rels])
  if (lista.status !== 0) return { motivo: `no se pudo leer la versión ${etiqueta}` }
  const enEtiqueta = new Set((lista.stdout ?? '').split('\n').map(l => l.trim()).filter(Boolean))
  const sueltos = rels.filter((r, i) => existsSync(rutas[i]) && !enEtiqueta.has(r))
  if (sueltos.length) return { motivo: `archivos que la versión ${etiqueta} no trae: ${sueltos.slice(0, 3).join(', ')}` }
  if (git(raiz, ['diff', '--quiet', etiqueta, '--', ...rels]).status !== 0) return { motivo: `los ganchos difieren de la versión ${etiqueta}` }
  return { etiqueta }
}

/** Huellas que ya no coincidieron con una versión firmada: no se vuelve a correr git en cada turno. */
const sinVersionFirmada = new Set<string>()

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
  if (!sinVersionFirmada.has(huella)) {
    const firmada = ganchosDeVersionFirmada(home, env)
    if (firmada.etiqueta) {
      try { aceptarHuella(huella) } catch { /* sin carpeta de configuración: igual vale en este arranque */ }
      return { ok: true, huella, motivo: `ganchos idénticos a la versión firmada ${firmada.etiqueta}: huella aceptada` }
    }
    sinVersionFirmada.add(huella)
  }
  return { ok: false, huella, motivo: 'los ganchos del cerebro (o lo que ejecutan) no coinciden con los de la plantilla: la sesión arranca sin ganchos del proyecto' }
}

/** Solo pruebas. */
export function _vaciarCacheHooksParaPruebas(): void { cachePlantilla.clear(); sinVersionFirmada.clear() }
