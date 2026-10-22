/**
 * Motor «Mi Claude Code» de la edición cliente (21 oct 2026, Daniel 18:21: «aseguremonos que aquel usuario con una sub
 * lo instale tan fácilmente posible con su suscripción»).
 *
 * El chat corre con el Claude Code oficial y sin modificar, con la sesión que la persona ya inició en SU terminal
 * (`claude` → login por el flujo de Anthropic). Arbrain no lee, copia, guarda ni reenvía ningún token: el binario
 * resuelve su propia sesión (Llavero de macOS o la carpeta de configuración del usuario), igual que en su terminal.
 * Política: docs/builds/instalacion-github-2026-10-21/PLAN.md §6 (permitido: iniciar sesión en el binario sin modificar
 * con tu suscripción; no permitido: que una app pida, guarde o reenvíe credenciales de claude.ai).
 *
 * Con este motor:
 *   - El CLI usa la carpeta de configuración por defecto del usuario (sin `CLAUDE_CONFIG_DIR` aislado), porque es ahí
 *     donde vive su sesión.
 *   - El CLI NO hereda `ANTHROPIC_API_KEY`, la llave de OpenRouter ni ninguna vía de API (`entornoSinApi`): si la
 *     heredara, Claude Code cobraría por API en lugar de usar el plan.
 *   - Solo se cargan los ajustes del proyecto (el cerebro), no los personales de `~/.claude` (ganchos, permisos o un
 *     `apiKeyHelper` del usuario no entran al chat de Arbrain).
 *   - Cada sesión confirma por `accountInfo()` que corre con suscripción; si no, no se envía ningún prompt.
 *   - Las rutinas automáticas no corren: el plan es para uso ordinario e individual.
 *
 * La elección vive en `<ARBRAIN_CONFIG_DIR>/motor-claude.json` (no es secreto) y se aplica al arrancar el daemon; la app
 * lo reinicia al cambiarla. `ARBRAIN_MOTOR_CLAUDE` en el entorno del lanzador manda sobre el archivo.
 * Instalación de Daniel: nada de esto corre (solo con la edición cliente).
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { esEdicionCliente } from '../edicion.js'

export type MotorClaude = 'suscripcion' | 'llave'
export const ARCHIVO_MOTOR = 'motor-claude.json'

export const MENSAJE_SIN_SESION = 'Abre una terminal y escribe `claude`, inicia sesión con tu cuenta y vuelve.'
export const MENSAJE_SIN_CLAUDE = 'No encontré Claude Code en esta computadora. Instálalo (una línea en la terminal), escribe `claude`, inicia sesión con tu cuenta y vuelve.'
export const MENSAJE_RUTINAS = 'Las rutinas automáticas no corren con tu suscripción de Claude (es para tu uso directo). Para que corran solas, conecta una llave en Ajustes › Llaves.'
export const CODIGO_SIN_SESION = 'sin_sesion'

/** ¿El chat de esta instalación corre con la suscripción del alumno? Solo en la edición cliente. */
export function motorSuscripcion(env: NodeJS.ProcessEnv = process.env): boolean {
  return esEdicionCliente(env) && (env.ARBRAIN_MOTOR_CLAUDE ?? '').trim().toLowerCase() === 'suscripcion'
}

const normalizar = (v: unknown): MotorClaude | null => v === 'suscripcion' || v === 'llave' ? v : null

/** Lo que eligió la persona, o null si nunca eligió (o el archivo no se lee). */
export function leerMotorElegido(configDir: string | undefined): MotorClaude | null {
  if (!configDir) return null
  try { return normalizar((JSON.parse(readFileSync(join(configDir, ARCHIVO_MOTOR), 'utf8')) as { motor?: unknown }).motor) } catch { return null }
}

export function guardarMotorElegido(configDir: string, motor: MotorClaude, ahora = new Date()): void {
  mkdirSync(configDir, { recursive: true, mode: 0o700 })
  writeFileSync(join(configDir, ARCHIVO_MOTOR), JSON.stringify({ motor, elegido: ahora.toISOString() }) + '\n', { mode: 0o600 })
}

/**
 * Variables que harían que Claude Code use otra vía que no es la sesión de la persona (y cobre por API o hable con
 * otro proveedor), o que lo lleven a otra carpeta de credenciales. Ninguna llega al CLI con el motor de suscripción.
 */
export const VIAS_DE_API = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_CUSTOM_HEADERS', 'ANTHROPIC_UNIX_SOCKET',
  'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL', 'OPENROUTER_API_KEY', 'ARBRAIN_PROVEEDOR_CLAUDE',
  'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'CLAUDE_CODE_OAUTH_SCOPES', 'CLAUDE_CODE_API_KEY_HELPER_TTL_MS',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_ANTHROPIC_AWS',
  'AWS_BEARER_TOKEN_BEDROCK', 'ANTHROPIC_FOUNDRY_API_KEY',
  'CLAUDE_CONFIG_DIR', 'CLAUDE_SECURESTORAGE_CONFIG_DIR',
] as const

/** Copia de `base` sin ninguna vía de API ni carpeta de credenciales ajena. Pura. */
export function entornoSinApi(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) if (typeof v === 'string') env[k] = v
  for (const k of VIAS_DE_API) delete env[k]
  return env
}

/**
 * Dónde puede estar el `claude` de la persona. La app de escritorio arranca con un PATH mínimo (macOS no le pasa el de
 * la terminal), así que además del PATH se miran los lugares de los instaladores oficiales: el nativo
 * (`~/.local/bin`), el antiguo local (`~/.claude/local`), Homebrew, npm global y WinGet.
 */
export function candidatosClaude(env: NodeJS.ProcessEnv = process.env, plataforma: NodeJS.Platform = process.platform, home = homedir()): string[] {
  const win = plataforma === 'win32'
  const nombres = win ? ['claude.exe', 'claude.cmd'] : ['claude']
  const dirs = (env.PATH ?? env.Path ?? '').split(win ? ';' : delimiter).filter(Boolean)
  if (win) {
    dirs.push(join(home, '.local', 'bin'))
    if (env.APPDATA) dirs.push(join(env.APPDATA, 'npm'))
    if (env.LOCALAPPDATA) dirs.push(join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'))
  } else {
    dirs.push(join(home, '.local', 'bin'), join(home, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin', join(home, '.npm-global', 'bin'), '/usr/bin')
  }
  const vistos = new Set<string>()
  const out: string[] = []
  for (const d of dirs) for (const n of nombres) {
    const p = join(d, n)
    if (!vistos.has(p)) { vistos.add(p); out.push(p) }
  }
  return out
}

export function buscarClaude(env: NodeJS.ProcessEnv = process.env, plataforma: NodeJS.Platform = process.platform, home = homedir()): string | null {
  for (const p of candidatosClaude(env, plataforma, home)) {
    try { if (existsSync(p) && statSync(p).isFile()) return p } catch { /* siguiente */ }
  }
  return null
}

export interface EstadoSuscripcion {
  /** ¿Hay un `claude` instalado? */
  instalado: boolean
  /** ¿Ese `claude` tiene sesión iniciada con una cuenta de Claude (suscripción)? */
  sesion: boolean
  /** `authMethod` que reporta el CLI (none, claude.ai, oauth_token, api_key, api_key_helper, third_party). */
  metodo?: string
  /** pro, max, team, enterprise… si el CLI lo dice. */
  plan?: string
  /** El motor activo ahora mismo en el daemon. */
  activo: boolean
  code?: string
  mensaje?: string
}

/**
 * Lee la salida JSON de `claude auth status` y se queda SOLO con lo necesario: si hay sesión, con qué método y qué plan.
 * El correo, la organización y cualquier otro dato se descartan aquí y nunca salen del daemon. Pura.
 */
export function interpretarEstadoAuth(salida: string): Pick<EstadoSuscripcion, 'sesion' | 'metodo' | 'plan' | 'code' | 'mensaje'> {
  let d: Record<string, unknown>
  try { d = JSON.parse(salida) as Record<string, unknown> } catch { return { sesion: false, code: 'error', mensaje: 'No pude leer el estado de tu Claude Code. Actualízalo (`claude update`) y vuelve a intentar.' } }
  const metodo = typeof d.authMethod === 'string' ? d.authMethod : undefined
  const plan = typeof d.subscriptionType === 'string' && /^[a-z_-]{1,24}$/i.test(d.subscriptionType) ? d.subscriptionType : undefined
  const logueado = d.loggedIn === true
  const primerNivel = d.apiProvider === undefined || d.apiProvider === 'firstParty'
  if (logueado && metodo === 'claude.ai' && primerNivel) return { sesion: true, metodo, ...(plan ? { plan } : {}) }
  if (!logueado || metodo === 'none' || !metodo) return { sesion: false, ...(metodo ? { metodo } : {}), code: CODIGO_SIN_SESION, mensaje: MENSAJE_SIN_SESION }
  // Sesión por otra vía (llave de API, apiKeyHelper, Bedrock…): eso no es la suscripción y cobraría aparte.
  return { sesion: false, metodo, code: 'otra_via', mensaje: 'Tu Claude Code está conectado con una llave de API o con otro proveedor, no con tu cuenta de Claude. En la terminal escribe `claude auth login`, entra con tu cuenta Pro o Max y vuelve.' }
}

type Ejecutar = (archivo: string, args: string[], env: Record<string, string>) => Promise<{ stdout: string; code: number }>

const ejecutarReal: Ejecutar = (archivo, args, env) => new Promise((resolve) => {
  execFile(archivo, args, { env, timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true, shell: /\.cmd$/i.test(archivo) }, (err, stdout) => {
    const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : -1) : 0
    resolve({ stdout: String(stdout ?? ''), code })
  })
})

let cache: { t: number; valor: Omit<EstadoSuscripcion, 'activo'> } | null = null
const VIGENCIA_MS = 10_000

/**
 * ¿Hay un Claude Code con sesión de suscripción? Corre `claude auth status --json` (la vía oficial: sale 0 con sesión,
 * 1 sin ella) con un entorno sin llaves de API y sin la carpeta aislada de Arbrain, para ver la MISMA sesión que ve la
 * persona en su terminal. No lee ningún archivo de credenciales. `fresco` salta la caché (botón «Ya inicié sesión»).
 */
export async function detectarSuscripcion(op: { fresco?: boolean; env?: NodeJS.ProcessEnv; ejecutar?: Ejecutar; ruta?: string | null } = {}): Promise<EstadoSuscripcion> {
  const env = op.env ?? process.env
  const activo = motorSuscripcion(env)
  if (!op.fresco && !op.ejecutar && cache && Date.now() - cache.t < VIGENCIA_MS) return { ...cache.valor, activo }
  const ruta = op.ruta !== undefined ? op.ruta : buscarClaude(env)
  let valor: Omit<EstadoSuscripcion, 'activo'>
  if (!ruta) valor = { instalado: false, sesion: false, code: 'sin_claude', mensaje: MENSAJE_SIN_CLAUDE }
  else {
    const r = await (op.ejecutar ?? ejecutarReal)(ruta, ['auth', 'status', '--json'], { ...entornoSinApi(env), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' })
    valor = { instalado: true, ...interpretarEstadoAuth(r.stdout) }
    if (valor.sesion && r.code !== 0) valor = { instalado: true, sesion: false, code: CODIGO_SIN_SESION, mensaje: MENSAJE_SIN_SESION }
  }
  if (!op.ejecutar) cache = { t: Date.now(), valor }
  return { ...valor, activo }
}

/** Solo pruebas. */
export function vaciarCacheSuscripcion(): void { cache = null }

type Fuente = 'user' | 'project' | 'local'
/**
 * Fuentes de ajustes del CLI. Con el motor de suscripción, solo las del proyecto: los ajustes personales de la persona
 * (`~/.claude/settings.json`: ganchos, permisos amplios, un `apiKeyHelper` que cobraría por API) no entran al chat de
 * Arbrain. Su sesión sí, porque no es un ajuste: la resuelve el binario.
 */
export function fuentesDeAjustes(base: Fuente[], env: NodeJS.ProcessEnv = process.env): Fuente[] {
  return motorSuscripcion(env) ? base.filter(f => f !== 'user') : base
}
