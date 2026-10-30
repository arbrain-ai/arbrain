/**
 * Perfiles de permisos por subagente (29 oct 2026, idea 1 de /tmp/warp-investigacion/REPORTE.md §3; sala limpia: se
 * reimplementó desde la descripción de los Agent Profiles de Warp, sin leer ni copiar su código).
 *
 * El default NO cambia: un subagente nace en bypass, sin preguntas (Daniel, 1 oct 08:20). Esto no agrega
 * confirmaciones, solo BLOQUEOS, y los aplica una guardia que corre como gancho PreToolUse del propio CLI
 * (`guardia-perfil.ts`): los ganchos corren en cualquier modo de permisos, así que la lista negra le gana al bypass.
 *
 *   total    lo de siempre (bypass) + la lista negra.
 *   codigo   para worktrees: además, las herramientas de archivos solo escriben dentro de su carpeta (o en /tmp).
 *   lectura  para investigar: lee lo que quiera, escribe solo en /tmp, y Bash solo con programas de lectura que el
 *            analizador entiende entero. Ni push, ni commit, ni MCP con efecto.
 *
 * La lista negra, en todos los perfiles: `git push` forzado (--force, -f, --force-with-lease, +ref, --mirror, --delete),
 * `rm -r` fuera de su carpeta (o de la carpeta entera), deploy o publicación a producción, y por MCP enviar, pagar o
 * publicar. Las reglas de qué es irreversible y de qué MCP es de lectura son las de la edición cliente
 * (`cliente/confirmaciones.ts`, `cliente/politica-agentes.ts`, `cliente/dinero.ts`, `cliente/shell.ts`): una sola fuente.
 *
 * Pura salvo `realpath` del disco (un enlace dentro de la carpeta que apunta afuera cuenta como afuera).
 */
import { existsSync, realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { analizarShell, type ComandoSimple } from '../cliente/shell.js'
import { accionIrreversible } from '../cliente/confirmaciones.js'
import { mcpDeLectura } from '../cliente/politica-agentes.js'
import { MCP_DINERO } from '../cliente/dinero.js'

export const PERFILES = ['total', 'codigo', 'lectura'] as const
export type Perfil = typeof PERFILES[number]
/** El de siempre: bypass sin preguntas, con la lista negra encima. */
export const PERFIL_DEFAULT: Perfil = 'total'
export const esPerfil = (v: unknown): v is Perfil => typeof v === 'string' && (PERFILES as readonly string[]).includes(v)

export const PERFIL_EN_PALABRAS: Record<Perfil, string> = {
  total: 'total (bypass con lista negra)',
  codigo: 'código (escribe solo en su carpeta)',
  lectura: 'lectura (no escribe fuera de /tmp ni publica)',
}

export interface ContextoPerfil {
  /** Carpeta del subagente (su worktree o la que pidió Levy). */
  raiz: string
  /** Carpeta personal, para `~`. */
  home?: string
  /** Carpetas de borrador donde todo perfil escribe y borra (por defecto /tmp, /private/tmp y el TMPDIR). */
  temporales?: string[]
}

// ── Rutas ──
const real = (p: string): string => {
  let base = resolve(p)
  const resto: string[] = []
  for (let i = 0; i < 64; i++) {
    if (existsSync(base)) { try { return join(realpathSync.native(base), ...resto.reverse()) } catch { return resolve(p) } }
    const padre = dirname(base)
    if (padre === base) break
    resto.push(basename(base)); base = padre
  }
  return resolve(p)
}
const dentro = (p: string, dir: string) => p === dir || p.startsWith(dir.endsWith(sep) ? dir : dir + sep)
const temporales = (c: ContextoPerfil) => [...new Set((c.temporales ?? ['/tmp', '/private/tmp', tmpdir()]).map(real))]
const homeDe = (c: ContextoPerfil) => c.home ?? homedir()
/** Ruta absoluta y real de lo que escribió el agente, relativa a `dir`. `~` ya viene expandida por el analizador. */
const absoluta = (p: string, dir: string, c: ContextoPerfil) => real(isAbsolute(p) ? p : p === '~' || p.startsWith('~/') ? join(homeDe(c), p.slice(1)) : join(dir, p))
const enTemporal = (abs: string, c: ContextoPerfil) => temporales(c).some(t => dentro(abs, t) && abs !== t)
/** Dentro de su carpeta (estrictamente: la carpeta entera no) o en un temporal. */
const enSuCarpeta = (abs: string, c: ContextoPerfil) => { const r = real(c.raiz); return (dentro(abs, r) && abs !== r) || enTemporal(abs, c) }
/** Lo que queda antes del primer comodín (`~/foo/*` borra dentro de `~/foo`). */
const sinComodin = (p: string) => { const i = p.search(/[*?[]/); return i < 0 ? p : p.slice(0, i) || '.' }

// ── Lista negra de shell (todos los perfiles) ──
const ENVOLTURAS = new Set(['sudo', 'nohup', 'time', 'command', 'exec', 'nice', 'caffeinate', 'stdbuf', 'unbuffer'])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish'])
const LANZADORES = new Set(['npx', 'bunx', 'pnpx'])

/** El comando que de verdad corre: quita envolturas (`sudo`, `env X=y`, `npx`, `pnpm dlx`, `npm exec --`). */
function nucleo(argv: string[]): string[] {
  let a = argv
  for (let i = 0; i < 8 && a.length; i++) {
    const p = basename(a[0])
    if (ENVOLTURAS.has(p)) { a = a.slice(1); while (a[0]?.startsWith('-')) a = a.slice(1); continue }
    if (p === 'env') { a = a.slice(1); while (a[0] && (a[0].startsWith('-') || a[0].includes('='))) a = a.slice(1); continue }
    if (LANZADORES.has(p)) { a = a.slice(1); while (a[0]?.startsWith('-')) a = a.slice(1); continue }
    if ((p === 'pnpm' || p === 'yarn') && a[1] === 'dlx') { a = a.slice(2); continue }
    if (p === 'npm' && (a[1] === 'exec' || a[1] === 'x')) { a = a.slice(2); while (a[0]?.startsWith('-')) a = a.slice(1); if (a[0] === '--') a = a.slice(1); continue }
    break
  }
  return a
}

/** `git [-C dir] [-c k=v] <sub> args`: el subcomando y sus argumentos. */
function gitSub(a: string[]): { sub: string; args: string[]; c: boolean } | null {
  if (basename(a[0] ?? '') !== 'git') return null
  let i = 1, c = false
  while (i < a.length && a[i].startsWith('-')) {
    if (a[i] === '-C' || a[i] === '--git-dir' || a[i] === '--work-tree' || a[i] === '--namespace') i += 2
    else if (a[i] === '-c') { c = true; i += 2 }
    else i++
  }
  return i < a.length ? { sub: a[i], args: a.slice(i + 1), c } : null
}

/** `git push` que reescribe o borra historia remota. */
export function pushForzado(args: string[]): string | null {
  for (const w of args) {
    if (/^--(force|force-with-lease|force-if-includes)(=|$)/.test(w)) return w.split('=')[0]
    if (w === '--mirror' || w === '--delete' || w === '--prune') return w
    if (/^-[a-zA-Z]+$/.test(w) && /[fd]/.test(w)) return w
    if (!w.startsWith('-') && /^\+/.test(w)) return `refspec ${w}`
    if (!w.startsWith('-') && /^:[^:]/.test(w)) return `borrar rama ${w.slice(1)}`
  }
  return null
}
/** Remotos de despliegue: empujar ahí ES desplegar (Heroku y similares). */
const REMOTO_PROD = /^(production|prod|heroku|dokku|live)$/i

/** Deploy o publicación a producción. Null si no lo es. */
export function deployProduccion(a: string[]): string | null {
  const p = basename(a[0] ?? ''), resto = a.slice(1), tiene = (...x: string[]) => resto.some(w => x.includes(w.split('=')[0]))
  if (p === 'vercel' && (tiene('--prod', '--production') || resto[0] === 'promote')) return 'vercel a producción'
  if (p === 'netlify' && resto[0] === 'deploy' && tiene('--prod', '--prod-if-unlocked')) return 'netlify a producción'
  if (p === 'firebase' && resto[0] === 'deploy') return 'firebase deploy'
  if ((p === 'fly' || p === 'flyctl') && resto[0] === 'deploy') return 'fly deploy'
  if (p === 'railway' && (resto[0] === 'up' || resto[0] === 'deploy')) return 'railway'
  if (p === 'wrangler') {
    if (resto[0] === 'deploy' || resto[0] === 'publish') return `wrangler ${resto[0]}`
    if (resto[0] === 'pages' && (resto[1] === 'deploy' || resto[1] === 'publish')) {
      const rama = resto.find((w, i) => resto[i - 1] === '--branch') ?? resto.find(w => w.startsWith('--branch='))?.slice(9)
      if (!rama || /^(main|master|production|prod)$/.test(rama)) return 'wrangler pages a producción'
    }
  }
  if (p === 'supabase' && ((resto[0] === 'db' && resto[1] === 'push') || (resto[0] === 'functions' && resto[1] === 'deploy')) && !tiene('--local', '--dry-run')) return `supabase ${resto[0]} ${resto[1]}`
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(p) && resto[0] === 'publish' && !tiene('--dry-run')) return `${p} publish`
  if (p === 'cargo' && resto[0] === 'publish' && !tiene('--dry-run')) return 'cargo publish'
  if (p === 'twine' && resto[0] === 'upload') return 'twine upload'
  if (p === 'gem' && resto[0] === 'push') return 'gem push'
  if (p === 'docker' && resto[0] === 'push') return 'docker push'
  return null
}

const RM_RECURSIVO = (args: string[]) => args.some(w => w === '--recursive' || /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(w))

/** Motivo de lista negra para UN comando simple ya separado (o null). `dir` = carpeta efectiva tras los `cd`. */
function negroComando(argv: string[], dir: string, c: ContextoPerfil, profundidad: number): string | null {
  const a = nucleo(argv)
  if (!a.length) return null
  const p = basename(a[0])
  // `bash -c "…"`: se analiza lo de adentro con las mismas reglas
  if (SHELLS.has(p) || p === 'eval') {
    const i = p === 'eval' ? 0 : a.findIndex(w => /^-[a-z]*c[a-z]*$/.test(w))
    const dentroCmd = p === 'eval' ? a.slice(1).join(' ') : i > 0 ? a[i + 1] : undefined
    if (dentroCmd != null) return profundidad > 3 ? 'comando anidado demasiado profundo' : negroTexto(dentroCmd, dir, c, profundidad + 1)
  }
  const g = gitSub(a)
  if (g?.sub === 'push') {
    const f = pushForzado(g.args)
    if (f) return `git push forzado (${f}): reescribe o borra historia remota`
    const remoto = g.args.find(w => !w.startsWith('-'))
    if (remoto && REMOTO_PROD.test(remoto)) return `git push a «${remoto}»: es desplegar a producción`
  }
  const d = deployProduccion(a)
  if (d) return `deploy o publicación a producción (${d})`
  if (p === 'rm' && RM_RECURSIVO(a.slice(1))) {
    const rutas = a.slice(1).filter(w => !w.startsWith('-'))
    for (const r of rutas) {
      if (r.includes('$')) return `rm -r con una ruta que no puedo verificar (${r})`
      const abs = absoluta(sinComodin(r), dir, c)
      if (!enSuCarpeta(abs, c)) return `rm -r fuera de su carpeta (${abs === real(c.raiz) ? 'la carpeta entera' : abs})`
    }
  }
  if (p === 'find') {
    const i = a.findIndex(w => w === '-exec' || w === '-execdir')
    const borra = a.includes('-delete') || (i > 0 && basename(a[i + 1] ?? '') === 'rm')
    if (borra) {
      const fin = a.findIndex((w, k) => k > 0 && (w.startsWith('-') || w === '(' || w === '!'))
      const raices = a.slice(1, fin < 0 ? a.length : fin)
      for (const r of raices.length ? raices : ['.']) if (!enSuCarpeta(absoluta(sinComodin(r), dir, c), c)) return `find que borra fuera de su carpeta (${r})`
    }
  }
  return null
}

/** Lista negra sobre un comando completo (con `&&`, `;`, `|`, `cd`). Lo que el analizador no entiende se revisa por texto. */
function negroTexto(cmd: string, dir0: string, c: ContextoPerfil, profundidad = 0): string | null {
  const an = analizarShell(cmd, homeDe(c))
  if (!an.ok) return negroCrudo(cmd, dir0, c)
  let dir = dir0
  for (const sc of an.comandos) {
    const argv = sc.argv.map(w => w.texto)
    if (basename(argv[0] ?? '') === 'cd') { dir = argv[1] ? absoluta(argv[1], dir, c) : homeDe(c); continue }
    const m = negroComando(argv, dir, c, profundidad)
    if (m) return m
  }
  return null
}

/**
 * Lo que el analizador no entiende (`$VAR`, `$(…)`, here-docs): se parte por separadores y se revisa cada trozo como
 * palabras sueltas. Más estricto a propósito: una ruta con `$` en un `rm -r` no se puede verificar y se bloquea (salvo
 * `$TMPDIR`), y un `push` con `--force` se reconoce aunque venga dentro de un `$(…)`.
 */
function negroCrudo(cmd: string, dir0: string, c: ContextoPerfil): string | null {
  let dir = dir0
  for (const trozo of cmd.split(/&&|\|\||[;|\n`]|\$\(|\)/)) {
    const palabras = (trozo.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(w => w.replace(/^["']|["']$/g, ''))
    let k = 0
    while (k < palabras.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(palabras[k])) k++
    const a = nucleo(palabras.slice(k))
    if (!a.length) continue
    const p = basename(a[0])
    // un `cd` a algo que no se puede verificar deja la carpeta en «desconocida»: lo relativo cuenta como afuera
    if (p === 'cd') { dir = a[1] && !a[1].includes('$') ? absoluta(a[1].replace(/^~(?=\/|$)/, homeDe(c)), dir, c) : '/'; continue }
    if (p === 'rm' && RM_RECURSIVO(a.slice(1))) {
      for (const r of a.slice(1).filter(w => !w.startsWith('-'))) {
        if (/^\$\{?TMPDIR\}?\//.test(r)) continue
        if (r.includes('$')) return `rm -r con una ruta que no puedo verificar (${r})`
        const abs = absoluta(sinComodin(r.replace(/^~(?=\/|$)/, homeDe(c))), dir, c)
        if (!enSuCarpeta(abs, c)) return `rm -r fuera de su carpeta (${abs})`
      }
      continue
    }
    const m = negroComando(a, dir, c, 4)
    if (m) return m
  }
  return null
}

/** MCP: enviar, pagar o publicar (reglas de `confirmaciones.ts` y `dinero.ts`). Las de Arbrain (cabina, manos) traen su freno. */
export function negroMcp(herramienta: string, input: unknown): string | null {
  if (!herramienta.startsWith('mcp__')) return null
  const [, servidor = '', ...resto] = herramienta.split('__')
  const accion = resto.join('__')
  const irr = accionIrreversible(herramienta, input)
  if (irr && irr.categoria !== 'borrar' && irr.categoria !== 'otra') return `${irr.categoria} por MCP (${herramienta})`
  if (MCP_DINERO.test(servidor) && !mcpDeLectura(accion)) return `pagar o mover dinero por MCP (${herramienta})`
  return null
}

// ── Perfil lectura: Bash de solo lectura ──
const LECTURA_PROGRAMAS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'rg', 'grep', 'egrep', 'fgrep', 'find', 'sed', 'awk', 'jq', 'yq', 'sort', 'uniq', 'cut', 'tr', 'nl',
  'column', 'diff', 'cmp', 'comm', 'basename', 'dirname', 'realpath', 'readlink', 'stat', 'file', 'du', 'df', 'tree', 'pwd', 'echo',
  'printf', 'date', 'which', 'whereis', 'type', 'true', 'false', 'test', '[', 'seq', 'xxd', 'od', 'hexdump', 'strings', 'shasum',
  'sha256sum', 'md5', 'md5sum', 'base64', 'mdfind', 'mdls', 'ffprobe', 'git', 'gh', 'curl', 'cd', 'less', 'more', 'fold', 'fmt',
  'rev', 'tac', 'paste', 'join', 'expand', 'unexpand', 'iconv', 'plutil', 'sw_vers', 'uname', 'hostname', 'whoami', 'id', 'uptime',
  'mkdir', 'touch', 'tee', 'cp', 'sleep', 'xargs',
])
const GIT_LECTURA = new Set(['status', 'log', 'show', 'diff', 'blame', 'grep', 'ls-files', 'ls-tree', 'rev-parse', 'rev-list', 'describe',
  'cat-file', 'shortlog', 'reflog', 'for-each-ref', 'merge-base', 'name-rev', 'whatchanged', 'show-ref', 'check-ignore', 'var', 'count-objects'])
const GH_LECTURA = /^(view|list|diff|checks|status|search)$/

/** Motivo para negar un comando simple en perfil lectura (o null). */
function lecturaComando(a: string[], redirs: ComandoSimple['redirecciones'], dir: string, c: ContextoPerfil): string | null {
  for (const r of redirs) {
    if (r.op === '<' || r.op === '>&' || r.destino === '/dev/null') continue
    if (!enTemporal(absoluta(r.destino, dir, c), c)) return `perfil lectura: escribir con «${r.op} ${r.destino}» fuera de /tmp`
  }
  const n = nucleo(a)
  if (!n.length) return null
  const p = basename(n[0]), args = n.slice(1)
  if (!LECTURA_PROGRAMAS.has(p)) return `perfil lectura: «${p}» no es un programa de solo lectura`
  if (p === 'xargs') { const sub = args.find(w => !w.startsWith('-')); return sub ? lecturaComando(args.slice(args.indexOf(sub)), [], dir, c) : null }
  if (p === 'sed' && args.some(w => /^-[a-zA-Z]*i/.test(w) || w.startsWith('--in-place'))) return 'perfil lectura: sed -i modifica archivos'
  if (p === 'awk' && args.some(w => /system\s*\(|\|\s*"|>\s*"/.test(w))) return 'perfil lectura: awk que ejecuta o escribe'
  if (p === 'find' && args.some(w => /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/.test(w))) return 'perfil lectura: find que borra o ejecuta'
  if (p === 'mkdir' || p === 'touch' || p === 'tee') {
    const rutas = args.filter(w => !w.startsWith('-'))
    const fuera = rutas.find(r => !enTemporal(absoluta(r, dir, c), c))
    if (fuera) return `perfil lectura: ${p} fuera de /tmp (${fuera})`
  }
  if (p === 'cp') {
    const destino = args.filter(w => !w.startsWith('-')).at(-1)
    if (!destino || !enTemporal(absoluta(destino, dir, c), c)) return `perfil lectura: cp solo hacia /tmp`
  }
  if (p === 'git') {
    const g = gitSub(n)
    if (!g) return null
    if (g.c) return 'perfil lectura: git -c puede cambiar qué ejecuta git'
    if (g.sub === 'push') return 'perfil lectura: no hace git push'
    if (GIT_LECTURA.has(g.sub)) return null
    const listar = (ok: RegExp) => g.args.every(w => ok.test(w))
    if (g.sub === 'branch' && listar(/^(-a|-r|-v|-vv|--all|--remotes|--list|-l|--show-current|--contains|--merged|--no-merged|--sort=.*|--format=.*|--no-color|--color)$/)) return null
    if (g.sub === 'tag' && listar(/^(-l|--list|-n\d*|--sort=.*|--contains|--merged)$/)) return null
    if (g.sub === 'remote' && (g.args.length === 0 || ['-v', 'show', 'get-url'].includes(g.args[0]))) return null
    if (g.sub === 'config' && g.args.some(w => /^(--get|--get-all|--get-regexp|--list|-l)$/.test(w))) return null
    if ((g.sub === 'worktree' || g.sub === 'stash') && ['list', 'show'].includes(g.args[0] ?? '')) return null
    return `perfil lectura: git ${g.sub} modifica el repo`
  }
  if (p === 'gh') {
    if (args[0] === 'api') {
      // con campos, gh api manda POST: solo pasa un GET explícito o implícito sin campos
      const campos = args.some(w => /^(-f|-F|--field|--raw-field|--input)(=|$)/.test(w))
      const i = args.findIndex(w => /^(-X|--method)(=|$)/.test(w))
      const metodo = i < 0 ? 'GET' : (args[i].includes('=') ? args[i].split('=')[1] : args[i + 1] ?? '').toUpperCase()
      return metodo === 'GET' && !campos ? null : 'perfil lectura: gh api con método o campos que escriben'
    }
    if (args[0] === 'search' || GH_LECTURA.test(args[1] ?? '')) return null
    return `perfil lectura: gh ${args.slice(0, 2).join(' ')} no es de lectura`
  }
  if (p === 'curl') {
    if (args.some(w => /^(-o|-O|--output|--remote-name|-T|--upload-file|-d|--data.*|-F|--form.*|--json|-K|--config)$/.test(w.split('=')[0]))) return 'perfil lectura: curl que escribe archivos o envía datos'
    const i = args.findIndex(w => w === '-X' || w === '--request')
    if (i >= 0 && !/^(GET|HEAD)$/i.test(args[i + 1] ?? '')) return 'perfil lectura: curl con método que escribe'
  }
  return null
}

function lecturaTexto(cmd: string, dir0: string, c: ContextoPerfil): string | null {
  const an = analizarShell(cmd, homeDe(c))
  if (!an.ok) return `perfil lectura: no entiendo este comando entero (${an.motivo}); usa comandos de lectura simples, Read o Grep`
  let dir = dir0
  for (const sc of an.comandos) {
    const argv = sc.argv.map(w => w.texto)
    if (basename(argv[0] ?? '') === 'cd') { dir = argv[1] ? absoluta(argv[1], dir, c) : homeDe(c); continue }
    const m = lecturaComando(argv, sc.redirecciones, dir, c)
    if (m) return m
  }
  return null
}

// ── Herramientas de archivos ──
const ESCRIBE = /^(Write|Edit|MultiEdit|NotebookEdit|apply_patch|ApplyPatch|write_file|replace|edit_file|create_file)$/
const CAMPOS_RUTA = ['file_path', 'path', 'notebook_path', 'absolute_path', 'filePath']

/** Rutas que toca una herramienta de archivos, incluido un parche de codex (`*** Update File: x`). */
export function rutasEscritas(input: unknown): string[] {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const rutas = CAMPOS_RUTA.map(k => i[k]).filter((v): v is string => typeof v === 'string' && !!v)
  for (const v of Object.values(i)) {
    if (typeof v !== 'string' || !v.includes('*** ')) continue
    for (const m of v.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm)) rutas.push((m[1] ?? m[2]).trim())
  }
  return rutas
}

const esShell = (h: string) => h === 'Bash' || /(^|__)(bash|shell|exec|exec_command|run_command|run_shell_command|shell_command)$/i.test(h)
const comandoDe = (input: unknown): string => {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const v = i.command ?? i.cmd
  return Array.isArray(v) ? v.map(String).join(' ') : typeof v === 'string' ? v : ''
}

/**
 * La decisión de la guardia: el motivo del bloqueo o null (corre como siempre, sin preguntar). Nunca pide confirmación:
 * el default de Daniel es bypass sin preguntas y esto solo agrega bloqueos.
 */
export function decidirPerfil(perfil: Perfil, herramienta: string, input: unknown, c: ContextoPerfil): string | null {
  const raiz = c.raiz
  // 1. Lista negra: le gana a todo perfil y al bypass.
  if (esShell(herramienta)) {
    const cmd = comandoDe(input)
    const m = negroTexto(cmd, raiz, c)
    if (m) return `lista negra: ${m}`
    if (perfil === 'lectura') return lecturaTexto(cmd, raiz, c)
    return null
  }
  const mcp = negroMcp(herramienta, input)
  if (mcp) return `lista negra: ${mcp}`
  // 2. Archivos
  if (ESCRIBE.test(herramienta)) {
    if (perfil === 'total') return null
    for (const r of rutasEscritas(input)) {
      const abs = absoluta(r, raiz, c)
      if (perfil === 'lectura' && !enTemporal(abs, c)) return `perfil lectura: no escribe fuera de /tmp (${abs})`
      if (perfil === 'codigo' && !enSuCarpeta(abs, c)) return `perfil código: escribe solo dentro de ${real(raiz)} o /tmp (${abs})`
    }
    return null
  }
  // 3. MCP con efecto en lectura (las de lectura pasan)
  if (perfil === 'lectura' && herramienta.startsWith('mcp__')) {
    const accion = herramienta.split('__').slice(2).join('__')
    if (!mcpDeLectura(accion)) return `perfil lectura: ${herramienta} no es de lectura`
  }
  return null
}
