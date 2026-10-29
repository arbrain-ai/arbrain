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
import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { esEdicionCliente } from '../edicion.js'

export type MotorClaude = 'suscripcion' | 'llave'
export const ARCHIVO_MOTOR = 'motor-claude.json'

// Prueba en Windows del 22 oct 2026 (docs/builds/prueba-windows-2026-10-22, puntos 10 y 12): cada estado dice en UNA
// línea qué falta, y el arreglo es un botón de Arbrain (login oficial del CLI), nunca un prompt para copiar.
export const MENSAJE_SIN_SESION = 'Tu Claude Code está instalado pero sin sesión. Pulsa «Iniciar sesión con Claude» y entra con tu cuenta en el navegador.'
export const MENSAJE_SIN_CLAUDE = 'No encontré Claude Code en esta computadora (la app de escritorio de Claude no basta: hace falta Claude Code).'
export const MENSAJE_LENTO = 'Tu Claude Code tardó demasiado en responder (la primera vez puede tardar). Pulsa «Revisar de nuevo».'
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
 * Dónde puede estar el `claude` de la persona. La app de escritorio y el modo servidor arrancan con el PATH que tenían
 * al nacer (macOS no le pasa el de la terminal; en Windows, un CLI instalado después no aparece hasta reiniciar el
 * proceso), así que además del PATH se miran: el PATH VIGENTE del usuario en el registro (Windows), los lugares de los
 * instaladores oficiales (el nativo `~/.local/bin`, el antiguo `~/.claude/local`, Homebrew, npm global, WinGet) y, al
 * final, el Claude Code que trae la app de escritorio de Claude (`<datos de la app>/Claude/claude-code/<versión>/…`).
 */
export function candidatosClaude(env: NodeJS.ProcessEnv = process.env, plataforma: NodeJS.Platform = process.platform, home = homedir(), pathVigente: string[] = []): string[] {
  const win = plataforma === 'win32'
  const nombres = win ? ['claude.exe', 'claude.cmd'] : ['claude']
  const dirs = [...(env.PATH ?? env.Path ?? '').split(win ? ';' : delimiter), ...pathVigente].filter(Boolean)
  if (win) {
    dirs.push(join(home, '.local', 'bin'), join(home, '.claude', 'local'))
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

/** Carpetas donde la app de escritorio de Claude guarda su propio Claude Code, por versión. */
export function carpetasClaudeDeEscritorio(env: NodeJS.ProcessEnv = process.env, plataforma: NodeJS.Platform = process.platform, home = homedir()): string[] {
  if (plataforma === 'darwin') return [join(home, 'Library', 'Application Support', 'Claude', 'claude-code')]
  if (plataforma === 'win32') return [env.APPDATA, env.LOCALAPPDATA].filter((d): d is string => !!d).map(d => join(d, 'Claude', 'claude-code'))
  return [join(env.XDG_CONFIG_HOME || join(home, '.config'), 'Claude', 'claude-code')]
}

const versionNum = (v: string) => v.split('.').map(n => Number.parseInt(n, 10) || 0)
const masNueva = (a: string, b: string) => { const x = versionNum(a), y = versionNum(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0); return 0 }

/** El binario del Claude Code de la app de escritorio, el de versión más nueva, o null. Busca a poca profundidad. */
export function claudeDeEscritorio(env: NodeJS.ProcessEnv = process.env, plataforma: NodeJS.Platform = process.platform, home = homedir()): string | null {
  const nombre = plataforma === 'win32' ? 'claude.exe' : 'claude'
  const archivo = (p: string) => { try { return statSync(p).isFile() } catch { return false } }
  const hijos = (d: string) => { try { return readdirSync(d) } catch { return [] } }
  for (const raiz of carpetasClaudeDeEscritorio(env, plataforma, home)) {
    for (const version of hijos(raiz).filter(v => /^\d+(\.\d+)*$/.test(v)).sort(masNueva)) {
      const dv = join(raiz, version)
      const directos = [join(dv, nombre), ...hijos(dv).flatMap(h => [join(dv, h, nombre), join(dv, h, 'claude.app', 'Contents', 'MacOS', 'claude')])]
      const hallado = directos.find(archivo)
      if (hallado) return hallado
    }
  }
  return null
}

/**
 * Windows: el PATH vigente del usuario y del sistema según el registro. Un proceso que nació antes de instalar Claude
 * Code (el daemon, el supervisor del modo servidor) no ve el PATH nuevo; el registro sí. Solo lectura, sin shell.
 */
export function pathVigenteWindows(env: NodeJS.ProcessEnv = process.env, plataforma: NodeJS.Platform = process.platform): string[] {
  if (plataforma !== 'win32') return []
  const out: string[] = []
  for (const clave of ['HKCU\\Environment', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment']) {
    try {
      const salida = execFileSync('reg', ['query', clave, '/v', 'Path'], { encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      out.push(...interpretarPathDelRegistro(salida, env))
    } catch { /* sin esa clave: sigue */ }
  }
  return out
}

/** Lee la salida de `reg query … /v Path` y expande %VARIABLES%. Pura. */
export function interpretarPathDelRegistro(salida: string, env: NodeJS.ProcessEnv): string[] {
  const m = salida.match(/^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im)
  if (!m) return []
  const expandir = (s: string) => s.replace(/%([^%]+)%/g, (_, k: string) => {
    const clave = Object.keys(env).find(e => e.toUpperCase() === k.toUpperCase())
    return clave ? String(env[clave]) : `%${k}%`
  })
  return m[1].trim().split(';').map(d => expandir(d.trim())).filter(d => d && !d.includes('%'))
}

export function buscarClaude(env: NodeJS.ProcessEnv = process.env, plataforma: NodeJS.Platform = process.platform, home = homedir(), pathVigente?: string[]): string | null {
  for (const p of candidatosClaude(env, plataforma, home, pathVigente ?? pathVigenteWindows(env, plataforma))) {
    try { if (existsSync(p) && statSync(p).isFile()) return p } catch { /* siguiente */ }
  }
  return claudeDeEscritorio(env, plataforma, home)
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
  /** Lo que eligió la persona (o se eligió solo al detectar su sesión); null si nunca se eligió. */
  elegido?: MotorClaude | null
  /** El inicio de sesión que lanzó Arbrain con el CLI oficial, si hay uno en curso o recién terminado. */
  login?: EstadoLogin
  /** Codex (ChatGPT): solo informativo. En la edición cliente no corre todavía (ver `codex-agent.ts`). */
  codex?: { instalado: boolean; sesion: boolean }
}

/**
 * Lee la salida JSON de `claude auth status` y se queda SOLO con lo necesario: si hay sesión, con qué método y qué plan.
 * El correo, la organización y cualquier otro dato se descartan aquí y nunca salen del daemon. Pura.
 */
export function interpretarEstadoAuth(salida: string): Pick<EstadoSuscripcion, 'sesion' | 'metodo' | 'plan' | 'code' | 'mensaje'> {
  let d: Record<string, unknown>
  try { d = JSON.parse(salida) as Record<string, unknown> } catch { return { sesion: false, code: 'error', mensaje: 'Tu Claude Code no respondió como esperaba (quizá es una versión vieja). Pulsa «Iniciar sesión con Claude» o «Revisar de nuevo».' } }
  const metodo = typeof d.authMethod === 'string' ? d.authMethod : undefined
  const plan = typeof d.subscriptionType === 'string' && /^[a-z_-]{1,24}$/i.test(d.subscriptionType) ? d.subscriptionType : undefined
  const logueado = d.loggedIn === true
  const primerNivel = d.apiProvider === undefined || d.apiProvider === 'firstParty'
  if (logueado && metodo === 'claude.ai' && primerNivel) return { sesion: true, metodo, ...(plan ? { plan } : {}) }
  if (!logueado || metodo === 'none' || !metodo) return { sesion: false, ...(metodo ? { metodo } : {}), code: CODIGO_SIN_SESION, mensaje: MENSAJE_SIN_SESION }
  // Sesión por otra vía (llave de API, apiKeyHelper, Bedrock…): eso no es la suscripción y cobraría aparte.
  return { sesion: false, metodo, code: 'otra_via', mensaje: 'Tu Claude Code está conectado con una llave de API o con otro proveedor, no con tu cuenta de Claude. Pulsa «Iniciar sesión con Claude» y entra con tu cuenta Pro o Max.' }
}

type Ejecutar = (archivo: string, args: string[], env: Record<string, string>) => Promise<{ stdout: string; code: number; lento?: boolean }>

/**
 * En Windows un `claude.cmd` (npm global) solo corre por shell; con `shell: true` Node junta archivo y argumentos sin
 * comillas, así que una ruta con espacios («C:\Users\Usuario Ejemplo\…») se partía. Va entre comillas; los argumentos son
 * fijos de Arbrain, nunca texto de la persona.
 */
export function comandoParaEjecutar(archivo: string): { archivo: string; shell: boolean } {
  const cmd = /\.(cmd|bat)$/i.test(archivo)
  return { archivo: cmd ? `"${archivo}"` : archivo, shell: cmd }
}

// La primera vez en Windows el antivirus revisa el binario (200 MB) y `auth status` puede tardar decenas de segundos.
const PLAZO_ESTADO_MS = 45_000

const ejecutarReal: Ejecutar = (archivo, args, env) => new Promise((resolve) => {
  const c = comandoParaEjecutar(archivo)
  execFile(c.archivo, args, { env, timeout: PLAZO_ESTADO_MS, maxBuffer: 64 * 1024, windowsHide: true, shell: c.shell }, (err, stdout) => {
    const e = err as (Error & { code?: unknown; killed?: boolean; signal?: unknown }) | null
    const code = e ? (typeof e.code === 'number' ? e.code : -1) : 0
    resolve({ stdout: String(stdout ?? ''), code, lento: !!e && (e.killed === true || e.signal === 'SIGTERM') && !String(stdout ?? '').trim() })
  })
})

let cache: { t: number; valor: Omit<EstadoSuscripcion, 'activo'> } | null = null
const VIGENCIA_MS = 10_000

/**
 * ¿Hay un Claude Code con sesión de suscripción? Corre `claude auth status --json` (la vía oficial: sale 0 con sesión,
 * 1 sin ella) con un entorno sin llaves de API y sin la carpeta aislada de Arbrain, para ver la MISMA sesión que ve la
 * persona en su terminal. No lee ningún archivo de credenciales. `fresco` salta la caché (botón «Revisar de nuevo» y
 * el regreso del inicio de sesión).
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
    valor = r.lento ? { instalado: true, sesion: false, code: 'lento', mensaje: MENSAJE_LENTO } : { instalado: true, ...interpretarEstadoAuth(r.stdout) }
    if (valor.sesion && r.code !== 0) valor = { instalado: true, sesion: false, code: CODIGO_SIN_SESION, mensaje: MENSAJE_SIN_SESION }
  }
  if (!op.ejecutar) cache = { t: Date.now(), valor }
  return { ...valor, activo }
}

/** Solo pruebas. */
export function vaciarCacheSuscripcion(): void { cache = null }

// ── Iniciar sesión desde Arbrain (22 oct 2026) ─────────────────────────────────────────────────────────────────────
// Daniel, prueba en Windows: «sácame del medio». Un botón lanza el login OFICIAL del CLI (`claude auth login
// --claudeai`): el propio Claude Code abre el navegador en la página de Anthropic, escucha el regreso en 127.0.0.1 y
// guarda su sesión donde siempre (Llavero de macOS o su carpeta). Arbrain no ve la página, el código ni el token: no
// lee la salida del proceso (se descarta) y no le escribe nada. Solo espera a que termine y vuelve a preguntar
// `auth status`.

export interface EstadoLogin { estado: 'esperando' | 'listo' | 'fallo'; desde: string; mensaje?: string }
export const MENSAJE_LOGIN_ESPERANDO = 'Se abrió tu navegador: entra con tu cuenta de Claude y autoriza. Arbrain lo detecta solo al volver.'
export const MENSAJE_LOGIN_FALLO = 'El inicio de sesión no terminó (se cerró o venció). Pulsa «Iniciar sesión con Claude» otra vez.'
/**
 * En tu servidor (29 oct 2026, «solo en tu servidor»): ahí no hay navegador que abrir ni regreso a 127.0.0.1, así que el
 * botón no sirve. La sesión se inicia con el login oficial en una terminal (`nube.sh claude`): Claude Code muestra el
 * enlace, la persona entra en el navegador de su teléfono o su compu y pega el código en esa terminal
 * (code.claude.com/docs/en/authentication: «Paste code here if prompted»). Arbrain no ve el código ni el token.
 */
export const MENSAJE_LOGIN_SERVIDOR = 'Tu Arbrain vive en tu servidor: la sesión de Claude se inicia desde una terminal. Pídele a tu Claude Code «conecta mi cuenta de Claude en mi servidor»: te da un comando, entras con tu cuenta y pegas el código ahí.'
/** ¿Este daemon corre en el servidor de la persona (unidad de systemd de nube.sh)? */
export const enServidorNube = (env: NodeJS.ProcessEnv = process.env): boolean => (env.ARBRAIN_SERVIDOR_NUBE ?? '').trim() === '1'
const PLAZO_LOGIN_MS = 10 * 60_000

type Lanzar = (archivo: string, args: string[], env: Record<string, string>) => ChildProcess
const lanzarReal: Lanzar = (archivo, args, env) => {
  const c = comandoParaEjecutar(archivo)
  // stdin abierto y sin escribir: el CLI espera el regreso del navegador; stdout/stderr se descartan (nunca se leen).
  return spawn(c.archivo, args, { env, shell: c.shell, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] })
}

let login: { proc: ChildProcess | null; estado: EstadoLogin; plazo?: NodeJS.Timeout } | null = null

export function estadoLogin(): EstadoLogin | undefined { return login?.estado }

/**
 * Lanza `claude auth login --claudeai` con la sesión del usuario (sin llaves de API ni carpeta aislada). Uno a la vez:
 * si ya hay uno esperando, devuelve ese. `alTerminar` corre cuando el CLI sale con éxito (para conectar solo).
 */
export function iniciarLoginClaude(op: { env?: NodeJS.ProcessEnv; ruta?: string | null; lanzar?: Lanzar; alTerminar?: () => void; ahora?: Date } = {}): EstadoLogin | { estado: 'sin_claude'; mensaje: string } {
  if (login?.estado.estado === 'esperando') return login.estado
  const env = op.env ?? process.env
  const ruta = op.ruta !== undefined ? op.ruta : buscarClaude(env)
  if (!ruta) return { estado: 'sin_claude', mensaje: MENSAJE_SIN_CLAUDE }
  const estado: EstadoLogin = { estado: 'esperando', desde: (op.ahora ?? new Date()).toISOString(), mensaje: MENSAJE_LOGIN_ESPERANDO }
  let proc: ChildProcess
  try { proc = (op.lanzar ?? lanzarReal)(ruta, ['auth', 'login', '--claudeai'], { ...entornoSinApi(env), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }) } catch {
    login = { proc: null, estado: { estado: 'fallo', desde: estado.desde, mensaje: MENSAJE_LOGIN_FALLO } }
    return login.estado
  }
  const actual = { proc, estado } as NonNullable<typeof login>
  login = actual
  const cerrar = (ok: boolean) => {
    if (login !== actual || actual.estado.estado !== 'esperando') return
    if (actual.plazo) clearTimeout(actual.plazo)
    actual.proc = null
    actual.estado = ok ? { estado: 'listo', desde: estado.desde } : { estado: 'fallo', desde: estado.desde, mensaje: MENSAJE_LOGIN_FALLO }
    cache = null
    if (ok) try { op.alTerminar?.() } catch { /* conectar solo es un extra */ }
  }
  proc.on('error', () => cerrar(false))
  proc.on('exit', (code) => cerrar(code === 0))
  actual.plazo = setTimeout(() => { try { proc.kill() } catch { /* ya salió */ } cerrar(false) }, PLAZO_LOGIN_MS)
  actual.plazo.unref?.()
  return estado
}

/**
 * Instaladores oficiales de Claude Code (code.claude.com/docs/en/setup), los mismos que se pegan en la terminal. Con
 * el botón de Arbrain los corre el daemon, con el usuario de la persona y sin administrador: deja `claude` en
 * `~/.local/bin`, donde `buscarClaude` lo encuentra aunque el PATH del proceso sea viejo.
 */
export function comandoInstalarClaude(plataforma: NodeJS.Platform = process.platform): { archivo: string; args: string[] } {
  return plataforma === 'win32'
    ? { archivo: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex'] }
    : { archivo: '/bin/bash', args: ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'] }
}
const PLAZO_INSTALAR_MS = 8 * 60_000

/** Instala Claude Code con el instalador oficial. Resuelve con la ruta del binario o null si no quedó. */
export function instalarClaude(op: { env?: NodeJS.ProcessEnv; plataforma?: NodeJS.Platform } = {}): Promise<string | null> {
  const env = op.env ?? process.env
  const c = comandoInstalarClaude(op.plataforma)
  return new Promise((resolve) => {
    execFile(c.archivo, c.args, { env: entornoSinApi(env), timeout: PLAZO_INSTALAR_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, () => {
      cache = null
      resolve(buscarClaude(env))
    })
  })
}

/**
 * El botón «Iniciar sesión con Claude»: si falta Claude Code lo instala primero (instalador oficial) y luego lanza el
 * login. Devuelve enseguida; el estado se sigue por `estadoLogin()` (GET /llaves/suscripcion).
 */
export function iniciarSesionClaude(op: { env?: NodeJS.ProcessEnv; alTerminar?: () => void } = {}): EstadoLogin {
  if (login?.estado.estado === 'esperando') return login.estado
  const env = op.env ?? process.env
  if (enServidorNube(env)) return { estado: 'fallo', desde: new Date().toISOString(), mensaje: MENSAJE_LOGIN_SERVIDOR }
  const ruta = buscarClaude(env)
  if (ruta) {
    const r = iniciarLoginClaude({ env, ruta, alTerminar: op.alTerminar })
    return 'desde' in r ? r : { estado: 'fallo', desde: new Date().toISOString(), mensaje: r.mensaje }
  }
  const instalando: EstadoLogin = { estado: 'esperando', desde: new Date().toISOString(), mensaje: MENSAJE_INSTALANDO }
  const actual = { proc: null, estado: instalando } as NonNullable<typeof login>
  login = actual
  void instalarClaude({ env }).then((nueva) => {
    if (login !== actual) return
    if (!nueva) { actual.estado = { estado: 'fallo', desde: instalando.desde, mensaje: MENSAJE_NO_INSTALO }; return }
    login = null
    iniciarLoginClaude({ env, ruta: nueva, alTerminar: op.alTerminar })
  })
  return instalando
}
export const MENSAJE_INSTALANDO = 'Instalando Claude Code (el instalador oficial, uno o dos minutos). Después se abre tu navegador para entrar.'
export const MENSAJE_NO_INSTALO = 'No pude instalar Claude Code (¿sin internet?). Revisa tu conexión y pulsa «Iniciar sesión con Claude» otra vez.'

/** Cierra un inicio de sesión en curso (al apagar el daemon). */
export function cancelarLoginClaude(): void {
  if (login?.proc) try { login.proc.kill() } catch { /* ya salió */ }
  if (login?.plazo) clearTimeout(login.plazo)
  login = null
}

// ── Conectar solo (22 oct 2026) ────────────────────────────────────────────────────────────────────────────────────
// Si la persona no tiene llave y nunca eligió «usar una llave», en cuanto su Claude Code tiene sesión Levy la usa, sin
// preguntar ni reiniciar: el daemon aún no tiene vía de API que quitar (sin llave no hay cofre que configurar), así que
// basta fijar el motor en el proceso y guardarlo para el próximo arranque (lo mismo que hace `arranque.ts`).

/** ¿Se puede pasar al motor de suscripción sin reiniciar? Solo si hoy no hay llave con la que hable el chat. */
export function activarSuscripcionEnCaliente(configDir: string | undefined, sinLlave: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!esEdicionCliente(env) || !sinLlave) return false
  if (configDir) guardarMotorElegido(configDir, 'suscripcion')
  env.ARBRAIN_MOTOR_CLAUDE = 'suscripcion'
  for (const k of VIAS_DE_API) delete env[k]
  return true
}

/**
 * Si no hay con qué hablar, mira si la persona ya tiene su Claude Code con sesión y, si es así, lo conecta. Respeta una
 * elección explícita de «llave». Devuelve true si quedó conectado. Para el primer arranque, el chat y el regreso del
 * inicio de sesión.
 */
export async function conectarSuscripcionSiHay(op: { sinLlave: boolean; configDir?: string; env?: NodeJS.ProcessEnv; fresco?: boolean; detectar?: typeof detectarSuscripcion }): Promise<boolean> {
  const env = op.env ?? process.env
  if (!esEdicionCliente(env) || motorSuscripcion(env) || !op.sinLlave) return false
  if (leerMotorElegido(op.configDir) === 'llave') return false
  const d = await (op.detectar ?? detectarSuscripcion)({ env, fresco: op.fresco })
  return d.sesion ? activarSuscripcionEnCaliente(op.configDir, true, env) : false
}

/** Codex: ¿instalado y con sesión? Solo informativo (`codex login status` sale 0 con sesión y 1 sin ella; escribe en
 * stderr, que no se lee). Nunca lee `~/.codex`. */
let cacheCodex: { t: number; valor: { instalado: boolean; sesion: boolean } } | null = null
export async function detectarCodex(op: { env?: NodeJS.ProcessEnv; ejecutar?: Ejecutar; ruta?: string | null; fresco?: boolean } = {}): Promise<{ instalado: boolean; sesion: boolean }> {
  if (!op.fresco && !op.ejecutar && cacheCodex && Date.now() - cacheCodex.t < 60_000) return cacheCodex.valor
  const env = op.env ?? process.env
  const win = process.platform === 'win32'
  const ruta = op.ruta !== undefined ? op.ruta : (() => {
    const dirs = [...(env.PATH ?? env.Path ?? '').split(win ? ';' : delimiter), ...pathVigenteWindows(env), join(homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', ...(env.APPDATA ? [join(env.APPDATA, 'npm')] : [])].filter(Boolean)
    for (const d of dirs) for (const n of win ? ['codex.exe', 'codex.cmd'] : ['codex']) { const p = join(d, n); try { if (statSync(p).isFile()) return p } catch { /* siguiente */ } }
    return null
  })()
  if (!ruta) { if (!op.ejecutar) cacheCodex = { t: Date.now(), valor: { instalado: false, sesion: false } }; return { instalado: false, sesion: false } }
  const r = await (op.ejecutar ?? ejecutarReal)(ruta, ['login', 'status'], entornoSinApi(env))
  const valor = { instalado: true, sesion: r.code === 0 && !r.lento }
  if (!op.ejecutar) cacheCodex = { t: Date.now(), valor }
  return valor
}

type Fuente = 'user' | 'project' | 'local'
/**
 * Fuentes de ajustes del CLI. Con el motor de suscripción, solo las del proyecto: los ajustes personales de la persona
 * (`~/.claude/settings.json`: ganchos, permisos amplios, un `apiKeyHelper` que cobraría por API) no entran al chat de
 * Arbrain. Su sesión sí, porque no es un ajuste: la resuelve el binario.
 */
export function fuentesDeAjustes(base: Fuente[], env: NodeJS.ProcessEnv = process.env): Fuente[] {
  return motorSuscripcion(env) ? base.filter(f => f !== 'user') : base
}
