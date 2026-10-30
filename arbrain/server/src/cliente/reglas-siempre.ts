/**
 * «Siempre este patrón» (harness-noche 27 oct 2026, botón Play; palabras de Daniel: «Anthropic cada que requiere que yo
 * corra un comando… pone una casilla para solo darle Play… no puedo permitirme esto si le estoy enseñando esto a mis
 * clientes de alto ticket»).
 *
 * Cuando la persona aprueba con «Permitir siempre» en la tarjeta del hilo, se guarda una regla persistente en la política
 * del alumno, visible y revocable en Ajustes › Permisos y seguridad. Desde ahí, lo que case con la regla corre sin
 * tarjeta. Familias (29 oct 2026, un fundador en Windows: «18 clics por permisos», «no me sale la opción de siempre»):
 *
 *   Bash         `npm test *` (programa + subcomando + cualquier argumento) o el comando exacto.
 *   PowerShell   igual que Bash, con su propio filtro de metacaracteres y sin distinguir mayúsculas en el programa
 *                (PowerShell no las distingue). Un cmdlet (`Get-ChildItem`) solo admite el comando exacto.
 *   MCP          una herramienta concreta de un servidor conectado (`mcp__notion__notion-create-pages`).
 *   Escribir     escribir dentro de una carpeta: tu memoria (`.claude/memory/**`, y knowledge, daily, diario, plan),
 *                una habilidad (`.claude/skills/<nombre>/**`) o una carpeta que abriste (ruta absoluta + `/**`).
 *   WebFetch     leer páginas de un dominio (`docs.python.org`).
 *
 * Lo que una regla NUNCA hace (lo aplica `aplicarModo` en politica-agentes.ts, no este archivo):
 *   - convertir en permitido algo que la política niega (solo cambia «confirmar» de categoría «otra» por «permitir»);
 *   - liberar el freno (enviar, borrar, publicar, pagar): esas categorías no aceptan regla, ni al guardarla ni al usarla;
 *   - valer en una rutina sin la persona delante;
 *   - valer en una conversación que leyó contenido de afuera, SALVO las de escribir en tu memoria (`valeTrasAfuera`):
 *     esas solo nacen de la tarjeta de una conversación contaminada (fuera de ella, escribir en la memoria no pregunta),
 *     así que la persona las eligió viendo el aviso «lo que se guarda aquí vuelve en cada conversación». Ninguna regla
 *     salta la R6 ni `egresoContaminado`: escribir un archivo de la memoria no sale de la computadora.
 *
 * El patrón de comandos es deliberadamente estrecho: un solo comando simple (sin `;`, `&&`, `|`, `$(…)`, redirecciones
 * ni saltos de línea), y el comodín solo se permite tras «programa subcomando» con nombres de palabra. Intérpretes y
 * envoltorios (`bash`, `python`, `node`, `env`, `xargs`, `sudo`, `iex`, `Start-Process`…) solo admiten el comando exacto.
 * Las comillas y la barra invertida se aceptan en los argumentos (rutas de Windows `C:\Users\…`): no encadenan nada.
 *
 * Vive en `<ARBRAIN_CONFIG_DIR>/reglas-siempre.json` (carpeta protegida de la app: el agente no la puede escribir).
 * Instalación de Daniel: no se usa.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'
import { hostDe, parsearUrl } from './url.js'

/** Familia de la regla: a qué herramientas aplica. Las viejas (antes del 29 oct) son todas `Bash`. */
export type FamiliaRegla = 'Bash' | 'PowerShell' | 'MCP' | 'Escribir' | 'WebFetch'

export interface ReglaSiempre {
  id: string
  herramienta: FamiliaRegla
  /** Comando (`npm test *` o exacto), herramienta MCP, carpeta (`.claude/memory/**`) o dominio, según la familia. */
  patron: string
  creada: number
  /** Lo que la persona aprobó cuando la creó (para que vea de dónde salió). */
  ejemplo: string
}

const MAX_REGLAS = 100
const MAX_PATRON = 200
const FAMILIAS = new Set<FamiliaRegla>(['Bash', 'PowerShell', 'MCP', 'Escribir', 'WebFetch'])
const ESCRITURA = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
/** Servidores propios de Arbrain: traen su propio freno o no piden tarjeta; una regla no tiene nada que hacer ahí. */
const MCP_PROPIOS = /^mcp__(?:cabina|manos|live)__/
const MCP_NOMBRE = /^mcp__[A-Za-z0-9_-]{1,64}__[A-Za-z0-9_.-]{1,96}$/

/** La familia de reglas de una herramienta, o null si no admite regla. */
export function familiaDe(herramienta: string | undefined): FamiliaRegla | null {
  if (!herramienta) return null
  if (herramienta === 'Bash' || herramienta === 'PowerShell' || herramienta === 'WebFetch') return herramienta
  if (ESCRITURA.has(herramienta)) return 'Escribir'
  if (MCP_NOMBRE.test(herramienta) && !MCP_PROPIOS.test(herramienta)) return 'MCP'
  return null
}

// ---------- Comandos (Bash y PowerShell) ----------

type Shell = 'bash' | 'ps'
/**
 * Lo que vuelve compuesto o encadenado un comando: con esto no hay patrón (ni exacto). La barra invertida no encadena
 * nada (lo que podría escapar ya está en la lista), así que se acepta: las rutas de Windows la llevan (`C:\Users\…`).
 * En PowerShell `\` es un carácter normal y las comillas tampoco encadenan (lo que se expande dentro, `$`, está en la
 * lista); en Bash las comillas siguen fuera, como antes.
 */
const METACARACTERES: Record<Shell, RegExp> = {
  bash: /[;&|`$<>(){}\n\r*?[\]!#~"']/,
  // PowerShell: además `@` (splatting), `%` (ForEach-Object y --%), `,` (listas). El acento grave es su escape.
  ps: /[;&|`$<>(){}\n\r*?[\]!#~@%,]/,
}
/** Programas que ejecutan lo que les pasen: solo comando exacto, nunca comodín. */
const ENVOLTORIOS = new Set([
  'bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell', 'cmd', 'env', 'xargs', 'sudo', 'doas', 'su', 'eval',
  'exec', 'command', 'builtin', 'nohup', 'time', 'nice', 'timeout', 'watch', 'python', 'python3', 'node', 'deno', 'bun',
  'ruby', 'perl', 'php', 'osascript', 'open', 'source', 'ssh', 'npx', 'pnpx', 'bunx', 'uvx', 'find', 'awk', 'sed',
  // Windows (Git Bash y PowerShell): los mismos con su extensión, el lanzador de Python y los que ejecutan texto.
  'py', 'python.exe', 'python3.exe', 'py.exe', 'node.exe', 'bash.exe', 'sh.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe',
  'wsl', 'wsl.exe', 'start', 'iex', 'invoke-expression', 'icm', 'invoke-command', 'saps', 'start-process', 'start-job',
  'invoke-item', 'ii', 'npx.cmd', 'winget', 'choco', 'scoop', 'runas', 'rundll32', 'mshta', 'cscript', 'wscript', 'regsvr32',
])
/**
 * PowerShell: lo que borra, envía o cambia el sistema (y sus alias). Su política no los clasifica como freno, así que
 * aquí no se les ofrece «siempre» ni exacto: la tarjeta pide el clic cada vez.
 */
const FRENO_PS = new Set([
  'remove-item', 'ri', 'rm', 'rmdir', 'del', 'erase', 'rd', 'clear-content', 'clc', 'clear-item', 'cli', 'clear-recyclebin',
  'remove-itemproperty', 'rp', 'set-itemproperty', 'sp', 'new-itemproperty', 'move-item', 'mv', 'mi', 'move', 'rename-item',
  'ren', 'rni', 'send-mailmessage', 'invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm', 'curl', 'wget',
  'start-bitstransfer', 'stop-process', 'kill', 'spps', 'stop-computer', 'restart-computer', 'set-executionpolicy',
  'format-volume', 'clear-disk', 'remove-partition', 'set-acl', 'takeown', 'icacls', 'reg', 'schtasks', 'sc', 'sc.exe',
  'new-service', 'set-service', 'remove-service', 'stop-service', 'set-content', 'add-content', 'ac', 'out-file',
  'set-clipboard', 'disable-computerrestore', 'net', 'netsh', 'setx',
])
const PALABRA = /^[a-z][a-z0-9:_-]{0,40}$/
const PROGRAMA = /^[a-z0-9][a-z0-9._+-]{0,40}$/i
const CMDLET = /^[a-z]+-[a-z][a-z0-9]*$/i

const normal = (t: string, shell: Shell) => shell === 'ps' ? t.toLowerCase() : t

/** Tokens de un comando simple, o null si es compuesto o lleva algo que el patrón no sabría acotar. */
export function tokensSimples(cmd: string, shell: Shell = 'bash'): string[] | null {
  const t = cmd.trim()
  if (!t || t.length > MAX_PATRON || METACARACTERES[shell].test(t)) return null
  const tokens = t.split(/[ \t]+/)
  if (!PROGRAMA.test(tokens[0])) return null
  // Asignaciones de entorno al frente (`FOO=1 npm test`) cambian lo que corre: sin patrón.
  if (tokens.some(x => /^[A-Za-z_][A-Za-z0-9_]*=/.test(x))) return null
  if (shell === 'ps' && FRENO_PS.has(tokens[0].toLowerCase())) return null
  return tokens
}

const envoltorio = (programa: string) => ENVOLTORIOS.has(programa.toLowerCase())

/**
 * Patrón que se le ofrece a la persona para este comando, o null si no admite «Siempre» (compuesto, raro).
 * `npm test --watch` → `npm test *`; `git status` → `git status *`; `python3 x.py` → `python3 x.py` (exacto).
 * PowerShell: igual para programas externos (`npm test *`); un cmdlet, exacto (`Get-ChildItem -Path C:\x`).
 */
export function derivarPatron(cmd: string, shell: Shell = 'bash'): string | null {
  const tokens = tokensSimples(cmd, shell)
  if (!tokens) return null
  const [programa, sub] = tokens
  const cmdlet = shell === 'ps' && CMDLET.test(programa)
  if (!cmdlet && !envoltorio(programa) && sub && PALABRA.test(sub)) return `${programa} ${sub} *`
  return tokens.join(' ')
}

/** ¿El comando casa con el patrón? Mismo filtro de comando simple que al derivar: lo compuesto nunca casa. */
export function coincidePatron(patron: string, cmd: string, shell: Shell = 'bash'): boolean {
  const tokens = tokensSimples(cmd, shell)
  if (!tokens) return false
  const p = patron.trim().split(/[ \t]+/)
  // PowerShell no distingue mayúsculas en cmdlets ni en programas (`NPM test` es `npm test`); Bash sí.
  const igual = (a: string, b: string, i: number) => shell === 'ps' && i === 0 ? a.toLowerCase() === b.toLowerCase() : a === b
  if (p[p.length - 1] === '*') {
    const prefijo = p.slice(0, -1)
    if (prefijo.length < 2 || envoltorio(prefijo[0]) || (shell === 'ps' && CMDLET.test(prefijo[0]))) return false
    return prefijo.every((x, i) => igual(x, tokens[i] ?? '', i))
  }
  return p.length === tokens.length && p.every((x, i) => igual(x, tokens[i], i))
}

function comandoValido(patron: string, shell: Shell): boolean {
  const p = patron.trim()
  const comodin = p.endsWith(' *')
  const cuerpo = comodin ? p.slice(0, -2) : p
  const tokens = tokensSimples(cuerpo, shell)
  if (!tokens) return false
  if (comodin) return tokens.length === 2 && !envoltorio(tokens[0]) && !(shell === 'ps' && CMDLET.test(tokens[0])) && PALABRA.test(tokens[1])
  return true
}

// ---------- Escribir dentro de una carpeta ----------

/** Carpetas de datos del alumno dentro de `.claude/` (las mismas que `CLAUDE_LIBRE` en politica-agentes.ts). */
const MEMORIA = /^\.claude\/(memory|knowledge|daily|diario|plan)\/\*\*$/
const SKILL = /^\.claude\/skills\/[a-z0-9][a-z0-9._-]{0,63}\/\*\*$/
/** Absoluta de macOS/Linux (`/Users/x/proyecto/**`) o de Windows en minúsculas y con `/` (`c:/users/x/proyecto/**`). */
const ABSOLUTA = /^(\/|[a-z]:\/)[^*?\n\r]+\/\*\*$/
/** Archivos que dan instrucciones al agente o lo configuran: ninguna regla de carpeta los cubre (nivelProteccion). */
const NOMBRES_DE_AGENTE = new Set(['claude.md', 'claude.local.md', 'agents.md', '.gitattributes', '.gitmodules', '.mcp.json', '.arbrain-sembrado.json'])
const SEGMENTOS_PROHIBIDOS = new Set(['.git', '.claude', '.codex', '..', '.', 'hooks', '.ssh', '.aws', '.gnupg'])

/** Ruta con `/`, sin barra final; en minúsculas si el sistema no distingue mayúsculas (Windows, macOS). */
export function rutaNormal(p: string, insensible: boolean): string {
  const r = p.replace(/\\/g, '/').replace(/\/+$/, '')
  return insensible ? r.toLowerCase() : r
}

const insensibleDefecto = () => process.platform === 'win32' || process.platform === 'darwin'

function escrituraValida(patron: string): boolean {
  if (MEMORIA.test(patron) || SKILL.test(patron)) return true
  if (!ABSOLUTA.test(patron)) return false
  const partes = patron.slice(0, -3).split('/').filter(Boolean)
  // La raíz del disco o la carpeta personal entera no son «una carpeta que abriste».
  if (partes.length < (/^[a-z]:$/.test(partes[0] ?? '') ? 3 : 2)) return false
  return !partes.some(x => SEGMENTOS_PROHIBIDOS.has(x.toLowerCase()))
}

/**
 * ¿La ruta real `real` cae dentro del alcance? `home` resuelve los relativos (`.claude/memory/**`). Lo que queda debajo
 * no puede pasar por `.git`, `.claude`, `hooks`, `..` ni ser un archivo de instrucciones del agente (CLAUDE.md, AGENTS.md):
 * esos siguen preguntando aunque estén dentro de la carpeta. Pura.
 */
export function rutaEnAlcance(real: string, alcance: string, home: string, insensible = insensibleDefecto()): boolean {
  if (!real || !escrituraValida(alcance)) return false
  const baseRel = alcance.slice(0, -3)
  const base = rutaNormal(alcance.startsWith('.claude/') ? `${rutaNormal(home, false)}/${baseRel}` : baseRel, insensible)
  const r = rutaNormal(real, insensible)
  if (!r.startsWith(`${base}/`)) return false
  const resto = r.slice(base.length + 1).split('/')
  const nombre = (resto[resto.length - 1] ?? '').toLowerCase()
  if (!nombre || NOMBRES_DE_AGENTE.has(nombre) || nombre.startsWith('settings')) return false
  return !resto.some(x => SEGMENTOS_PROHIBIDOS.has(x.toLowerCase()))
}

/**
 * El alcance que se ofrece para escribir en `real`, o null. Memoria → su carpeta entera (`.claude/memory/**`); una
 * habilidad → su carpeta (`.claude/skills/x/**`); una carpeta abierta → esa carpeta. Lo demás de `.claude/` (agentes,
 * comandos, CLAUDE.md) y la carpeta `arbrain/` siguen preguntando cada vez.
 */
export function alcanceEscritura(real: string, home: string, abiertas: readonly string[] = [], insensible = insensibleDefecto()): string | null {
  const r = rutaNormal(real, insensible)
  const h = rutaNormal(home, insensible)
  if (h && r.startsWith(`${h}/`)) {
    const rel = r.slice(h.length + 1).toLowerCase()
    const m = /^\.claude\/(memory|knowledge|daily|diario|plan)\//.exec(rel)
    const s = /^\.claude\/skills\/([a-z0-9][a-z0-9._-]{0,63})\//.exec(rel)
    const alcance = m ? `.claude/${m[1]}/**` : s ? `.claude/skills/${s[1]}/**` : null
    return alcance && rutaEnAlcance(real, alcance, home, insensible) ? alcance : null
  }
  // Una carpeta abierta: la más profunda que contenga el archivo. En Windows se guarda en minúsculas y con `/`.
  const raiz = [...abiertas].map(a => rutaNormal(a, insensible)).filter(a => r.startsWith(`${a}/`)).sort((a, b) => b.length - a.length)[0]
  if (!raiz) return null
  const alcance = `${/^[A-Za-z]:\//.test(raiz) ? raiz.charAt(0).toLowerCase() + raiz.slice(1) : raiz}/**`
  return escrituraValida(alcance) && rutaEnAlcance(real, alcance, home, insensible) ? alcance : null
}

// ---------- Validación y uso ----------

const HOST = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+$/

/** El patrón es uno que este archivo pudo haber derivado para esa familia (no se acepta texto libre desde la red). */
export function patronValido(patron: unknown, familia: FamiliaRegla = 'Bash'): patron is string {
  if (typeof patron !== 'string') return false
  const p = patron.trim()
  if (!p || p.length > MAX_PATRON) return false
  switch (familia) {
    case 'Bash': return comandoValido(p, 'bash')
    case 'PowerShell': return comandoValido(p, 'ps')
    case 'MCP': return MCP_NOMBRE.test(p) && !MCP_PROPIOS.test(p)
    case 'Escribir': return escrituraValida(p)
    case 'WebFetch': return HOST.test(p)
    default: return false
  }
}

/**
 * ¿Esta regla vale también en una conversación que leyó contenido de afuera? Solo escribir en tu memoria (y knowledge,
 * daily, diario, plan): la persona la creó en la tarjeta que ya le avisaba que lo de afuera estaba en la conversación
 * (fuera de una contaminada esos archivos no piden tarjeta, así que no hay otra forma de crearla). Comandos, MCP, otras
 * carpetas y dominios NO valen ahí: una página puede estar dictando el siguiente paso, y para lo que puede salir de la
 * computadora (R6, `egresoContaminado`) no hay regla que lo salte.
 */
export const valeTrasAfuera = (r: Pick<ReglaSiempre, 'herramienta' | 'patron'>): boolean => r.herramienta === 'Escribir' && MEMORIA.test(r.patron)

const archivo = () => join(DIR_ARBRAIN(), 'reglas-siempre.json')
let cache: { ruta: string; mtime: number; reglas: ReglaSiempre[] } | null = null

function leer(): ReglaSiempre[] {
  try {
    const p = archivo()
    if (!existsSync(p)) return []
    const mtime = statSync(p).mtimeMs
    if (cache && cache.ruta === p && cache.mtime === mtime) return cache.reglas
    const j = JSON.parse(readFileSync(p, 'utf8')) as { reglas?: unknown }
    const reglas = (Array.isArray(j.reglas) ? j.reglas : [])
      .filter((r): r is ReglaSiempre => !!r && typeof r === 'object' && FAMILIAS.has((r as ReglaSiempre).herramienta) && patronValido((r as ReglaSiempre).patron, (r as ReglaSiempre).herramienta) && typeof (r as ReglaSiempre).id === 'string')
      .map(r => ({ id: r.id, herramienta: r.herramienta, patron: r.patron.trim(), creada: Number(r.creada) || 0, ejemplo: String(r.ejemplo ?? '').slice(0, 400) }))
      .slice(0, MAX_REGLAS)
    cache = { ruta: p, mtime, reglas }
    return reglas
  } catch { return [] }
}

function escribir(reglas: ReglaSiempre[]): void {
  const p = archivo()
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 })
  writeFileSync(p, JSON.stringify({ reglas: reglas.slice(0, MAX_REGLAS) }, null, 1) + '\n', { mode: 0o600 })
  cache = null
}

export const reglasSiempre = (): ReglaSiempre[] => leer()

/** Guarda una regla de Bash (como antes del 29 oct). Lanza si el patrón no es válido. */
export const agregarRegla = (patron: string, ejemplo: string, ahora = Date.now()): ReglaSiempre => agregarReglaDe('Bash', patron, ejemplo, ahora)

/** Guarda la regla (si ya existe el mismo patrón en la misma familia, devuelve la que había). Lanza si no es válida. */
export function agregarReglaDe(familia: FamiliaRegla, patron: string, ejemplo: string, ahora = Date.now()): ReglaSiempre {
  if (!FAMILIAS.has(familia) || !patronValido(patron, familia)) throw new Error('Ese patrón no se puede guardar.')
  const reglas = leer()
  const p = patron.trim()
  const ya = reglas.find(r => r.patron === p && r.herramienta === familia)
  if (ya) return ya
  if (reglas.length >= MAX_REGLAS) throw new Error(`Ya tienes ${MAX_REGLAS} reglas guardadas; quita alguna en Ajustes › Permisos.`)
  const r: ReglaSiempre = { id: `rg_${randomBytes(5).toString('hex')}`, herramienta: familia, patron: p, creada: ahora, ejemplo: ejemplo.slice(0, 400) }
  escribir([...reglas, r])
  return r
}

export function quitarRegla(id: string): boolean {
  const reglas = leer()
  const resto = reglas.filter(r => r.id !== id)
  if (resto.length === reglas.length) return false
  escribir(resto)
  return true
}

const CAMPOS_RUTA = ['file_path', 'path', 'notebook_path']

export interface OpcionesRegla {
  /** Ruta real (realpath, `~` y relativas resueltas) del archivo que se va a escribir. La da la política. */
  rutaReal?: (p: string) => string
  /** Cerebro del alumno: resuelve los alcances relativos (`.claude/memory/**`). */
  home?: string
  /** Solo las reglas que valen tras leer contenido de afuera (`valeTrasAfuera`). */
  trasAfuera?: boolean
  /** Sistema sin mayúsculas en las rutas (por defecto: Windows y macOS). */
  insensible?: boolean
}

/** La regla que deja correr esta herramienta con este input, si hay. */
export function reglaQueAplica(reglas: readonly ReglaSiempre[] | undefined, herramienta: string, input: unknown, op: OpcionesRegla = {}): ReglaSiempre | null {
  const familia = familiaDe(herramienta)
  if (!familia || !reglas?.length || !input || typeof input !== 'object') return null
  const i = input as Record<string, unknown>
  const candidatas = reglas.filter(r => r.herramienta === familia && (!op.trasAfuera || valeTrasAfuera(r)))
  if (!candidatas.length) return null
  switch (familia) {
    case 'Bash':
    case 'PowerShell': {
      if (i.dangerouslyDisableSandbox === true) return null
      const cmd = typeof i.command === 'string' ? i.command : ''
      return candidatas.find(r => coincidePatron(r.patron, cmd, familia === 'PowerShell' ? 'ps' : 'bash')) ?? null
    }
    case 'MCP': return candidatas.find(r => r.patron === herramienta) ?? null
    case 'WebFetch': {
      const u = typeof i.url === 'string' ? parsearUrl(i.url.trim()) : null
      if (!u || !/^https?:$/.test(u.protocol)) return null
      const host = hostDe(u)
      return candidatas.find(r => r.patron === host) ?? null
    }
    case 'Escribir': {
      const v = CAMPOS_RUTA.map(c => i[c]).find(x => typeof x === 'string' && x) as string | undefined
      if (!v || !op.home) return null
      const real = op.rutaReal ? op.rutaReal(v) : v
      return candidatas.find(r => rutaEnAlcance(real, r.patron, op.home!, op.insensible)) ?? null
    }
  }
  return null
}

export interface ContextoPatron {
  home: string
  abiertas?: readonly string[]
  /** La conversación leyó contenido de afuera: solo se ofrece la regla de tu memoria. */
  contaminada?: boolean
  rutaReal?: (p: string) => string
  insensible?: boolean
}

/**
 * El patrón que la tarjeta ofrece en «Permitir siempre», o null si esta acción no lo admite. Solo lo calcula el daemon
 * (nunca lo manda el navegador) y solo para lo rutinario (categoría «otra»): el freno nunca tiene «siempre».
 */
export function patronParaTarjeta(herramienta: string, input: unknown, categoria: string, ctx: ContextoPatron): string | null {
  if (categoria !== 'otra') return null
  const familia = familiaDe(herramienta)
  if (!familia) return null
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (familia === 'Escribir') {
    const v = CAMPOS_RUTA.map(c => i[c]).find(x => typeof x === 'string' && x) as string | undefined
    if (!v) return null
    const alcance = alcanceEscritura(ctx.rutaReal ? ctx.rutaReal(v) : v, ctx.home, ctx.contaminada ? [] : ctx.abiertas, ctx.insensible)
    if (!alcance) return null
    // Tras leer afuera solo se ofrece lo que después va a valer ahí (la memoria); lo demás sería una promesa falsa.
    return !ctx.contaminada || valeTrasAfuera({ herramienta: 'Escribir', patron: alcance }) ? alcance : null
  }
  if (ctx.contaminada) return null
  if (familia === 'Bash' || familia === 'PowerShell') {
    if (i.dangerouslyDisableSandbox === true || typeof i.command !== 'string') return null
    return derivarPatron(i.command, familia === 'PowerShell' ? 'ps' : 'bash')
  }
  if (familia === 'MCP') return patronValido(herramienta, 'MCP') ? herramienta : null
  if (familia === 'WebFetch') {
    const u = typeof i.url === 'string' ? parsearUrl(i.url.trim()) : null
    const host = u && /^https?:$/.test(u.protocol) ? hostDe(u) : ''
    return patronValido(host, 'WebFetch') ? host : null
  }
  return null
}
