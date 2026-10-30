/**
 * Modo servidor (21 oct 2026): carpetas, puertos y secretos de la instalación del alumno que corre desde el código,
 * sin la app de escritorio. Puro respecto del proceso (todo entra por parámetro): lo prueban tests/servidor.
 *
 * Disposición (la misma que arma la app Tauri en `src-tauri/src/daemon.rs › Rutas`, para que daemon y web no noten la
 * diferencia):
 *   <datos>/daemon/          ARBRAIN_DATA_DIR del daemon (store/, uploads/, claude/, cohorte/)
 *   <datos>/daemon/config/   ARBRAIN_CONFIG_DIR (daemon y web). Aquí también lo privado del modo servidor:
 *                            acceso.json (contraseña), llaves.json (llaves BYOK), servidor.json (proceso vivo).
 *                            La política de los agentes y el sandbox niegan leer esta carpeta.
 *   <datos>/web/             ARBRAIN_DATA_DIR de la web (chat y lienzo locales)
 *   <datos>/cerebro/         ARBRAIN_HOME cuando no se corre desde la copia del alumno
 *   <datos>/programa/        el daemon compilado para este sistema
 *   <datos>/logs/            servidor.log, daemon.log, web.log
 */
import { createHash, randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'

/** Puertos del sistema de Daniel y del desarrollo: el modo servidor nunca los usa (igual que la app). */
export const RESERVADOS = [3000, 3099, 3218, 3300]
export const PUERTO_WEB_POR_DEFECTO = 4310
export const ID = 'ai.arbrain.servidor'

/** Carpeta de datos por sistema. `ARBRAIN_SERVIDOR_DATOS` manda (pruebas, varias instalaciones). */
export function dirDatosPorDefecto(plataforma, env, home) {
  if (env.ARBRAIN_SERVIDOR_DATOS?.trim()) return resolve(env.ARBRAIN_SERVIDOR_DATOS.trim())
  if (plataforma === 'darwin') return join(home, 'Library', 'Application Support', ID)
  if (plataforma === 'win32') return join(env.APPDATA?.trim() || join(home, 'AppData', 'Roaming'), ID)
  return join(env.XDG_DATA_HOME?.trim() || join(home, '.local', 'share'), ID)
}

/** Socket del motor: igual que `daemon.rs › sock_motor` (límite de ~104 bytes de los sockets Unix). */
export function sockMotor(config, tmp) {
  const directo = join(config, 'motor.sock')
  if (directo.length <= 100) return directo
  const corto = createHash('sha256').update(config).digest('hex').slice(0, 12)
  return join(tmp, `arbrain-${corto}`, 'motor.sock')
}

export function rutasDe(datos, tmp) {
  const daemon = join(datos, 'daemon')
  const config = join(daemon, 'config')
  return {
    datos,
    daemon,
    config,
    store: join(daemon, 'store'),
    claude: join(daemon, 'claude'),
    web: join(datos, 'web'),
    cerebro: join(datos, 'cerebro'),
    programa: join(datos, 'programa'),
    logs: join(datos, 'logs'),
    motorSock: sockMotor(config, tmp),
    acceso: join(config, 'acceso.json'),
    llaves: join(config, 'llaves.json'),
    proceso: join(config, 'servidor.json'),
  }
}

/** 64 hex aleatorios del sistema (los secretos por arranque: token del daemon, confirmar, pase, motor). */
export const secreto = () => randomBytes(32).toString('hex')

const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'
/**
 * Contraseña de acceso por navegador: 32 caracteres de un alfabeto sin ambigüedades (sin 0/o, 1/l/i) en grupos de 4
 * (`abcd-efgh-…`, 39 caracteres, ~158 bits). Se genera la primera vez y vive en `acceso.json` (0600). Es también el
 * `ARBRAIN_DESKTOP_SECRET` de la web: la cookie de sesión es la misma que da la app de escritorio.
 */
export function contrasenaNueva() {
  // Muestreo por rechazo: 256 no es múltiplo de 31 (longitud del alfabeto), así que `byte % 31` sesgaría los primeros
  // caracteres. Se descartan los bytes >= al mayor múltiplo de 31 (CodeQL js/biased-cryptographic-random).
  const tope = 256 - (256 % ALFABETO.length)
  let s = ''
  while (s.length < 32) {
    for (const b of randomBytes(64)) {
      if (b >= tope) continue
      s += ALFABETO[b % ALFABETO.length]
      if (s.length === 32) break
    }
  }
  return s.match(/.{4}/g).join('-')
}

/** Puerto válido para el modo servidor (no reservado, no privilegiado). */
export function puertoValido(p) {
  return Number.isInteger(p) && p >= 1024 && p <= 65535 && !RESERVADOS.includes(p)
}

/** Llaves que el modo servidor guarda y entrega al daemon por stdin. Nunca tokens de suscripción de claude.ai. */
export const LLAVES = ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY', 'LEMONFOX_API_KEY']

export function limpiarLlave(v) {
  return String(v ?? '').trim().replace(/^['"`]+|['"`]+$/g, '').trim()
}

/** Valida nombre y valor. Devuelve el mensaje de error o null. */
export function errorDeLlave(nombre, valor) {
  if (!LLAVES.includes(nombre)) return 'Llave no permitida.'
  const v = limpiarLlave(valor)
  if (!v) return 'Pega tu llave para continuar.'
  if (/\s/.test(v) || v.length > 4096) return 'La llave no tiene el formato correcto.'
  if (/^sk-ant-oat/i.test(v)) return 'Ese es un token de tu suscripción de Claude y Arbrain no lo usa.'
  if (nombre === 'OPENROUTER_API_KEY' && !v.startsWith('sk-or-')) return 'Las llaves de OpenRouter empiezan con «sk-or-».'
  if (nombre === 'ANTHROPIC_API_KEY' && !v.startsWith('sk-ant-')) return 'Las llaves de Anthropic empiezan con «sk-ant-».'
  if (nombre === 'GROQ_API_KEY' && !v.startsWith('gsk_')) return 'Las llaves de Groq empiezan con «gsk_».'
  if (nombre === 'LEMONFOX_API_KEY' && (/^(sk-or-|sk-ant-|gsk_)/.test(v) || v.length < 16)) return 'Esa no parece una llave de LemonFox.'
  return null
}

/** `sk-ant-…wxyz`: lo único que sale de una llave hacia la pantalla. */
export function enmascarar(v) {
  const s = limpiarLlave(v)
  if (s.length <= 12) return '…' + s.slice(-2)
  return `${s.slice(0, 7)}…${s.slice(-4)}`
}

/** Estado con la misma forma que `llaves_estado` de la app (features/primer-arranque/lib/llaves.ts › EstadoLlaves). */
export function estadoLlaves(guardadas) {
  const llaves = LLAVES.map((nombre) => ({ nombre, presente: !!guardadas[nombre], vista: guardadas[nombre] ? enmascarar(guardadas[nombre]) : null }))
  const listo = !!(guardadas.ANTHROPIC_API_KEY || guardadas.OPENROUTER_API_KEY)
  return { llaves, listo, almacen: 'archivo-local', disponible: true, error: null }
}

/** Línea de secretos por stdin (CONTRATO-DAEMON v2 §2.1): JSON de una línea, sin valores vacíos. */
export function lineaSecretos(pares) {
  const o = {}
  for (const [k, v] of Object.entries(pares)) if (typeof v === 'string' && v) o[k] = v
  return JSON.stringify(o) + '\n'
}

/**
 * Variables heredadas que nunca llegan al daemon ni a la web desde la terminal de quien corre el servidor (las mismas
 * listas de `daemon.rs › HEREDADAS_PROHIBIDAS` y `POLITICA_V3`): llaves, tokens y lo que cambia la política de los
 * agentes (sandbox, proveedor, plantilla, manos).
 */
export const PROHIBIDAS = [
  'ARBRAIN_PASE_AGENTE', 'ARBRAIN_MOTOR_TOKEN', 'ARBRAIN_MOTOR_SECRETOS', 'NODE_OPTIONS', 'LEVY_CHROME',
  'ARBRAIN_DESKTOP_SECRET', 'ARBRAIN_SECRETOS', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'CLAUDE_SECURESTORAGE_CONFIG_DIR', 'OPENROUTER_API_KEY', 'GROQ_API_KEY', 'LEMONFOX_API_KEY',
  'ANTHROPIC_AUTH_TOKEN', 'OPENCLAW_GATEWAY_TOKEN', 'ARBRAIN_DAEMON_TOKEN', 'ARBRAIN_TOKEN_CONFIRMAR', 'ARBRAIN_WEB_URL',
  'ARBRAIN_COHORTE_URL', 'ARBRAIN_PERFIL', 'MC_SERVER_PORT', 'MISSION_CONTROL_ORIGIN', 'MISSION_CONTROL_URL',
  'CLAUDECLAW_ROLE', 'CLAUDECLAW_URL', 'CLAUDECLAW_URL_PINNED', 'CLAUDE_CONFIG_DIR', 'GOG_KEYRING_PASSWORD',
  'ARBRAIN_SANDBOX', 'ANTHROPIC_BASE_URL', 'ARBRAIN_PROVEEDOR_CLAUDE', 'ARBRAIN_PLANTILLA_DIR', 'MANOS_VOZ_VENTANA_MIN',
  'ARBRAIN_PLATAFORMA_PRUEBA', 'MANOS_ADAPTADOR', 'MANOS_MODO', 'MANOS_EDICION', 'MANOS_CASA_APP', 'MANOS_CASA_SOCKET',
  'MANOS_CASA_TOKEN_ARCHIVO', 'MANOS_WINDOWS_EXE', 'MANOS_WINDOWS_FUENTE', 'MANOS_WINDOWS_CSC', 'MANOS_WINDOWS_CACHE',
  // Propias del modo servidor: solo las fija el supervisor.
  'ARBRAIN_SERVIDOR_CONTROL', 'ARBRAIN_MODO_SERVIDOR', 'ARBRAIN_DATA_DIR', 'ARBRAIN_CONFIG_DIR', 'ARBRAIN_HOME',
  'ARBRAIN_MOTOR_SOCK', 'CLAUDECLAW_STORE_DIR', 'BUSINESS_OS_ROOT', 'MISSION_CONTROL_DESKTOP_EMBED', 'PORT', 'HOSTNAME',
  // Modo espejo (beta): la cerca que el daemon consulta antes de cada rutina solo la fija el supervisor con el espejo
  // encendido (espejo/supervisor.mjs › entornoDaemon). Heredada de la terminal, correría un script ajeno antes de cada rutina.
  'ARBRAIN_ESPEJO_GUARDA',
]

/** Entorno heredado sin lo prohibido (comparación sin mayúsculas: Windows no distingue). */
export function entornoLimpio(env) {
  const fuera = new Set(PROHIBIDAS.map((k) => k.toUpperCase()))
  const o = {}
  for (const [k, v] of Object.entries(env)) if (v !== undefined && !fuera.has(k.toUpperCase())) o[k] = v
  return o
}
