/**
 * «Siempre este patrón» (harness-noche 27 oct 2026, botón Play; palabras de Daniel: «Anthropic cada que requiere que yo
 * corra un comando… pone una casilla para solo darle Play… no puedo permitirme esto si le estoy enseñando esto a mis
 * clientes de alto ticket»).
 *
 * Cuando la persona aprueba un comando con «Siempre este patrón» en la tarjeta del hilo, se guarda una regla persistente
 * en la política del alumno: el patrón derivado del comando (`npm test *`), visible y revocable en Ajustes › Permisos.
 * Desde ahí, el siguiente comando que case con el patrón corre sin tarjeta.
 *
 * Lo que una regla NUNCA hace (lo aplica `aplicarModo` en politica-agentes.ts, no este archivo):
 *   - convertir en permitido algo que la política niega (solo cambia «confirmar» por «permitir»);
 *   - liberar el freno (enviar, borrar, publicar, pagar): esas categorías no aceptan regla, ni al guardarla ni al usarla;
 *   - valer en una conversación que leyó contenido de afuera, ni en una rutina sin la persona delante.
 *
 * El patrón es deliberadamente estrecho: un solo comando simple (sin `;`, `&&`, `|`, `$(…)`, redirecciones ni saltos de
 * línea), y el comodín solo se permite tras «programa subcomando» con nombres de palabra (`npm test *`, `git status *`).
 * Intérpretes y envoltorios (`bash`, `python`, `node`, `env`, `xargs`, `sudo`…) solo admiten el comando exacto.
 *
 * Vive en `<ARBRAIN_CONFIG_DIR>/reglas-siempre.json` (carpeta protegida de la app: el agente no la puede escribir).
 * Instalación de Daniel: no se usa.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'

export interface ReglaSiempre {
  id: string
  /** Por ahora solo Bash (la tarjeta de comando). */
  herramienta: 'Bash'
  /** `npm test *` (prefijo + cualquier argumento) o el comando exacto. */
  patron: string
  creada: number
  /** El comando que la persona aprobó cuando la creó (para que vea de dónde salió). */
  ejemplo: string
}

const MAX_REGLAS = 100
const MAX_PATRON = 200

/** Lo que vuelve compuesto o encadenado un comando: con esto no hay patrón (ni exacto). */
const METACARACTERES = /[;&|`$<>(){}\n\r\\*?[\]!#~"']/
/** Programas que ejecutan lo que les pasen: solo comando exacto, nunca comodín. */
const ENVOLTORIOS = new Set([
  'bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell', 'cmd', 'env', 'xargs', 'sudo', 'doas', 'su', 'eval',
  'exec', 'command', 'builtin', 'nohup', 'time', 'nice', 'timeout', 'watch', 'python', 'python3', 'node', 'deno', 'bun',
  'ruby', 'perl', 'php', 'osascript', 'open', 'source', 'ssh', 'npx', 'pnpx', 'bunx', 'uvx', 'find', 'awk', 'sed',
])
const PALABRA = /^[a-z][a-z0-9:_-]{0,40}$/
const PROGRAMA = /^[a-z0-9][a-z0-9._+-]{0,40}$/i

/** Tokens de un comando simple, o null si es compuesto o lleva algo que el patrón no sabría acotar. */
export function tokensSimples(cmd: string): string[] | null {
  const t = cmd.trim()
  if (!t || t.length > MAX_PATRON || METACARACTERES.test(t)) return null
  const tokens = t.split(/[ \t]+/)
  if (!PROGRAMA.test(tokens[0])) return null
  // Asignaciones de entorno al frente (`FOO=1 npm test`) cambian lo que corre: sin patrón.
  if (tokens.some(x => /^[A-Za-z_][A-Za-z0-9_]*=/.test(x))) return null
  return tokens
}

/**
 * Patrón que se le ofrece a la persona para este comando, o null si no admite «Siempre» (compuesto, raro).
 * `npm test --watch` → `npm test *`; `git status` → `git status *`; `python3 x.py` → `python3 x.py` (exacto).
 */
export function derivarPatron(cmd: string): string | null {
  const tokens = tokensSimples(cmd)
  if (!tokens) return null
  const [programa, sub] = tokens
  if (!ENVOLTORIOS.has(programa.toLowerCase()) && sub && PALABRA.test(sub)) return `${programa} ${sub} *`
  return tokens.join(' ')
}

/** ¿El comando casa con el patrón? Mismo filtro de comando simple que al derivar: lo compuesto nunca casa. */
export function coincidePatron(patron: string, cmd: string): boolean {
  const tokens = tokensSimples(cmd)
  if (!tokens) return false
  const p = patron.trim().split(/[ \t]+/)
  if (p[p.length - 1] === '*') {
    const prefijo = p.slice(0, -1)
    if (prefijo.length < 2 || ENVOLTORIOS.has(prefijo[0].toLowerCase())) return false
    return prefijo.every((x, i) => tokens[i] === x)
  }
  return p.length === tokens.length && p.every((x, i) => tokens[i] === x)
}

/** El patrón es uno que este archivo pudo haber derivado (no se acepta texto libre desde la red). */
export function patronValido(patron: unknown): patron is string {
  if (typeof patron !== 'string' || !patron.trim() || patron.length > MAX_PATRON) return false
  const p = patron.trim()
  const comodin = p.endsWith(' *')
  const cuerpo = comodin ? p.slice(0, -2) : p
  const tokens = tokensSimples(cuerpo)
  if (!tokens) return false
  if (comodin) return tokens.length === 2 && !ENVOLTORIOS.has(tokens[0].toLowerCase()) && PALABRA.test(tokens[1])
  return true
}

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
      .filter((r): r is ReglaSiempre => !!r && typeof r === 'object' && (r as ReglaSiempre).herramienta === 'Bash' && patronValido((r as ReglaSiempre).patron) && typeof (r as ReglaSiempre).id === 'string')
      .map(r => ({ id: r.id, herramienta: 'Bash' as const, patron: r.patron.trim(), creada: Number(r.creada) || 0, ejemplo: String(r.ejemplo ?? '').slice(0, 400) }))
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

/** Guarda la regla (si ya existe el mismo patrón, devuelve la que había). Lanza si el patrón no es válido. */
export function agregarRegla(patron: string, ejemplo: string, ahora = Date.now()): ReglaSiempre {
  if (!patronValido(patron)) throw new Error('Ese patrón no se puede guardar.')
  const reglas = leer()
  const p = patron.trim()
  const ya = reglas.find(r => r.patron === p)
  if (ya) return ya
  if (reglas.length >= MAX_REGLAS) throw new Error(`Ya tienes ${MAX_REGLAS} reglas guardadas; quita alguna en Ajustes › Permisos.`)
  const r: ReglaSiempre = { id: `rg_${randomBytes(5).toString('hex')}`, herramienta: 'Bash', patron: p, creada: ahora, ejemplo: ejemplo.slice(0, 400) }
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

/** La regla que deja correr este comando, si hay. */
export function reglaQueAplica(reglas: readonly ReglaSiempre[] | undefined, herramienta: string, input: unknown): ReglaSiempre | null {
  if (herramienta !== 'Bash' || !reglas?.length || !input || typeof input !== 'object') return null
  const i = input as Record<string, unknown>
  if (i.dangerouslyDisableSandbox === true) return null
  const cmd = typeof i.command === 'string' ? i.command : ''
  return reglas.find(r => coincidePatron(r.patron, cmd)) ?? null
}
