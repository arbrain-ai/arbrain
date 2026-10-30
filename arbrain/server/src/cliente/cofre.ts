/**
 * Cofre de secretos de la edición cliente (endurecimiento, 11 oct 2026; CONTRATO-DAEMON.md v2 §2.1).
 *
 * Problema: lo que viaja por variables de entorno lo ve cualquier proceso del mismo usuario (`ps eww <pid>`,
 * `/proc/<pid>/environ`) y lo hereda todo hijo: el CLI de Claude, su Bash, sus hooks y sus servidores MCP. Un agente
 * con Bash podría leer el secreto de confirmar y aprobarse a sí mismo una acción irreversible (I8).
 *
 * Contrato v2: la app lanza el daemon con `ARBRAIN_SECRETOS=stdin` y escribe UNA línea JSON en su stdin antes de
 * cualquier otra cosa: `{"OPENCLAW_GATEWAY_TOKEN":"…","ARBRAIN_TOKEN_CONFIRMAR":"…","ARBRAIN_PASE_AGENTE":"…",
 * "ANTHROPIC_API_KEY":"…"}` (solo los nombres de abajo; el resto se ignora). El stdin queda abierto (vigía §5).
 * Los secretos viven en memoria de este proceso; `process.env` del daemon nunca los tiene, así que ningún hijo
 * los hereda y `ps eww` del daemon no los muestra (nunca estuvieron en su entorno inicial).
 *
 * Quién recibe qué:
 *   - El CLI de Claude: solo sus llaves (`entornoClaude`) y `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, que hace que el CLI
 *     quite las credenciales (y todo nombre con TOKEN/KEY/SECRET…) del entorno de Bash, hooks y MCP stdio.
 *   - Los agentes: `ARBRAIN_PASE_AGENTE`, un Bearer de privilegio de agente (rutas del daemon y `/api/canvas` de la
 *     web), que nunca abre las rutas de la app (`rutaSoloApp`). No es secreto frente al agente: es su credencial.
 *   - Nadie fuera del daemon: el token del daemon y el secreto de confirmar.
 *
 * Compatibilidad (contrato v1): si la app aún los pasa por entorno, se capturan igual y se borran de `process.env`
 * (los hijos ya no los heredan), pero siguen visibles con `ps eww` del daemon: por eso la app v2 usa stdin.
 * Instalación de Daniel: nada de esto corre (solo lo llama cliente/arranque.ts con la edición cliente).
 */
import { readSync } from 'node:fs'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { entornoSinApi, motorSuscripcion } from './suscripcion.js'

/** Secretos que solo comparten la app, su web y el daemon. */
export const SECRETOS_APP = ['OPENCLAW_GATEWAY_TOKEN', 'ARBRAIN_TOKEN_CONFIRMAR', 'ARBRAIN_PASE_AGENTE'] as const
/**
 * Llaves del alumno (BYOK) que la app puede entregar: API key de Anthropic u OpenRouter. Nada más.
 * Decisión del autor (12 oct 2026): Arbrain nunca pide, guarda ni pasa tokens de la suscripción de claude.ai
 * (`claude setup-token`, `CLAUDE_CODE_OAUTH_TOKEN`); si llegan por stdin o por entorno, se ignoran y se borran.
 */
export const LLAVES_BYOK = ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'] as const
/**
 * Llaves de voz del alumno (21 oct 2026, carril VOZ): la de Groq para dictar (Whisper). No habla con Claude ni decide
 * proveedor: vive aparte de las BYOK para que su sola presencia nunca cuente como «hay con qué hablar». Solo la usa
 * el propio daemon en `/live/transcribe` y `/voz/probar`; nunca llega al CLI ni a ningún hijo. Desde v0.2.10 (grupal del
 * 23 oct: «la voz por defecto en Windows es fea»), también la de LemonFox, opcional y de pago, con la que `/tts` lee las
 * respuestas en voz alta.
 */
export const LLAVES_VOZ = ['GROQ_API_KEY', 'LEMONFOX_API_KEY'] as const
/**
 * Lo que vive en el cofre: las llaves BYOK más `ANTHROPIC_AUTH_TOKEN`, que SOLO fija el propio daemon con la llave de
 * OpenRouter (cliente/proveedor.ts). Nunca se acepta desde fuera.
 */
export const LLAVES_COFRE = [...LLAVES_BYOK, 'ANTHROPIC_AUTH_TOKEN'] as const
/** Credenciales de claude.ai que la edición cliente no acepta por ninguna vía (ni stdin, ni entorno, ni al CLI). */
export const CREDENCIALES_SUSCRIPCION = ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'CLAUDE_CODE_OAUTH_SCOPES'] as const
/** Alias del contrato → nombre canónico. */
const ALIAS: Record<string, string> = { ARBRAIN_DAEMON_TOKEN: 'OPENCLAW_GATEWAY_TOKEN' }
/** Lo que nunca queda en `process.env` del daemon cliente (lo heredaría cualquier hijo). */
export const NUNCA_EN_ENTORNO = ['OPENCLAW_GATEWAY_TOKEN', 'ARBRAIN_DAEMON_TOKEN', 'ARBRAIN_TOKEN_CONFIRMAR', 'ARBRAIN_DESKTOP_SECRET', ...LLAVES_COFRE, ...LLAVES_VOZ, ...CREDENCIALES_SUSCRIPCION] as const
/**
 * Variables que harían que el CLI buscara credenciales fuera de su carpeta aislada (`CLAUDE_CONFIG_DIR` del alumno):
 * `CLAUDE_SECURESTORAGE_CONFIG_DIR` redirige el almacén seguro (llavero / `.credentials.json`) del binario. Heredadas,
 * engancharían el chat a una sesión de claude.ai sin que nadie lo decidiera. No son secretos: solo se quitan.
 */
export const RUTAS_CREDENCIALES_AJENAS = ['CLAUDE_SECURESTORAGE_CONFIG_DIR'] as const

const CONOCIDOS = new Set<string>([...SECRETOS_APP, ...LLAVES_BYOK, ...LLAVES_VOZ, ...Object.keys(ALIAS)])
const LIMITE_LINEA = 64 * 1024

let cofre = new Map<string, string>()
let origen: 'stdin' | 'entorno' | 'ninguno' = 'ninguno'

/**
 * Lee una línea de un descriptor (stdin) de forma síncrona: el arranque corre antes de que config.ts y server.ts lean
 * su configuración. Lee de a trozos y corta en el primer salto de línea; lo que venga después se descarta (la app no
 * escribe nada más). EOF sin salto = lo leído. Pipes no bloqueantes (EAGAIN): reintenta hasta `plazoMs`.
 */
export function leerLineaSincrona(fd = 0, plazoMs = 15_000): string {
  const trozo = Buffer.alloc(4096)
  let acumulado = Buffer.alloc(0)
  const limite = Date.now() + plazoMs
  const espera = new Int32Array(new SharedArrayBuffer(4))
  while (acumulado.length < LIMITE_LINEA) {
    let n: number
    try {
      n = readSync(fd, trozo, 0, trozo.length, null)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EOF') break
      if (code === 'EAGAIN' || code === 'EWOULDBLOCK') {
        if (Date.now() > limite) throw new Error('la app no escribió los secretos en stdin a tiempo')
        Atomics.wait(espera, 0, 0, 20)
        continue
      }
      throw e
    }
    if (n === 0) break
    acumulado = Buffer.concat([acumulado, trozo.subarray(0, n)])
    const salto = acumulado.indexOf(10)
    if (salto >= 0) return acumulado.subarray(0, salto).toString('utf8').replace(/\r$/, '')
  }
  return acumulado.toString('utf8').trim()
}

/** Línea JSON → solo los nombres conocidos con valor string. Pura. Una línea inválida no entrega nada. */
export function parsearSecretos(linea: string): Record<string, string> {
  let crudo: unknown
  try { crudo = JSON.parse(linea) } catch { return {} }
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(crudo as Record<string, unknown>)) {
    if (!CONOCIDOS.has(k) || typeof v !== 'string') continue
    out[ALIAS[k] ?? k] = v.trim()
  }
  return out
}

/**
 * Guarda en el cofre los secretos que llegaron por stdin (v2) o, si no, por entorno (v1), y los BORRA de `env`.
 * Deja en `env` solo el pase de agente (generado aquí si la app no lo mandó). Devuelve de dónde vinieron.
 */
export function guardarSecretos(env: NodeJS.ProcessEnv, deStdin: Record<string, string> | null): typeof origen {
  cofre = new Map()
  let alguno = false
  for (const nombre of [...SECRETOS_APP, ...LLAVES_BYOK, ...LLAVES_VOZ]) {
    const alias = Object.keys(ALIAS).find(a => ALIAS[a] === nombre)
    const v = deStdin?.[nombre] ?? env[nombre] ?? (alias ? env[alias] : undefined)
    if (typeof v === 'string' && v.trim()) { cofre.set(nombre, v.trim()); alguno = true }
  }
  for (const nombre of NUNCA_EN_ENTORNO) delete env[nombre]
  if (!cofre.has('ARBRAIN_PASE_AGENTE')) cofre.set('ARBRAIN_PASE_AGENTE', randomBytes(32).toString('hex'))
  env.ARBRAIN_PASE_AGENTE = cofre.get('ARBRAIN_PASE_AGENTE')!
  origen = deStdin ? 'stdin' : alguno ? 'entorno' : 'ninguno'
  return origen
}

export const origenSecretos = () => origen
export const secreto = (nombre: string): string | undefined => cofre.get(nombre)
/** Fija (o borra con `undefined`) un valor del cofre. Lo usa el arranque al configurar el proveedor. */
export function fijarSecreto(nombre: string, valor: string | undefined): void {
  if (valor === undefined) cofre.delete(nombre)
  else cofre.set(nombre, valor)
}

/** Las llaves BYOK presentes (incluidas las vacías a propósito, p. ej. `ANTHROPIC_API_KEY=''` con OpenRouter). */
export function llavesByok(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of LLAVES_COFRE) { const v = cofre.get(k); if (v !== undefined) out[k] = v }
  return out
}

/** La llave de Groq del alumno (dictado), si la app la entregó. Vacía cuenta como ausente. */
export function llaveVoz(): string | undefined {
  const v = cofre.get('GROQ_API_KEY')?.trim()
  return v ? v : undefined
}

/** La llave de LemonFox del alumno (leer las respuestas en voz alta), si la app la entregó. */
export function llaveLemonfox(): string | undefined {
  const v = cofre.get('LEMONFOX_API_KEY')?.trim()
  return v ? v : undefined
}

/** Entorno + llaves: para decidir proveedor y estado (/health) sin poner las llaves en `process.env`. */
export function vistaConLlaves(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, ...llavesByok() }
}

/**
 * Entorno del CLI de Claude que lanza el SDK. Edición cliente: el del daemon (ya sin secretos) + solo las llaves del
 * CLI + `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` (el CLI las quita del entorno de Bash, hooks y MCP stdio; verificado con
 * el binario del SDK 0.3.295). Sin edición cliente devuelve `base` tal cual: Daniel no cambia.
 */
export function entornoClaude(base: NodeJS.ProcessEnv = process.env, cliente = true): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) if (typeof v === 'string') env[k] = v
  if (!cliente) return env
  for (const k of [...NUNCA_EN_ENTORNO, ...RUTAS_CREDENCIALES_AJENAS]) delete env[k]
  if (motorSuscripcion(base)) {
    // Motor «Mi Claude Code» (cliente/suscripcion.ts): ninguna llave ni vía de API llega al CLI (si heredara
    // ANTHROPIC_API_KEY, Claude Code cobraría por API en vez de usar el plan). La sesión la resuelve el binario solo.
    const limpio = entornoSinApi(env)
    limpio.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = '1'
    limpio.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR = '1'
    return limpio
  }
  // Al CLI solo su vía: la API key de Anthropic, o la de OpenRouter como ANTHROPIC_AUTH_TOKEN (solo si el daemon eligió
  // OpenRouter; nunca un token de suscripción).
  const v = cofre.get('ANTHROPIC_API_KEY')
  if (v !== undefined) env.ANTHROPIC_API_KEY = v
  const or = cofre.get('ANTHROPIC_AUTH_TOKEN')
  if (or !== undefined && env.ARBRAIN_PROVEEDOR_CLAUDE === 'openrouter') env.ANTHROPIC_AUTH_TOKEN = or
  env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = '1'
  // Red team C1: cada Bash vuelve a la carpeta del cerebro; un `cd ~` no cambia dónde corre el siguiente comando.
  env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR = '1'
  return env
}

const igual = (dado: unknown, real: string | undefined): boolean => {
  if (!real || typeof dado !== 'string' || dado.length !== real.length) return false
  return timingSafeEqual(Buffer.from(dado), Buffer.from(real))
}

/** ¿Este Bearer es el pase de agente? (privilegio de agente: nunca abre las rutas de la app). */
export const paseAgenteValido = (dado: unknown): boolean => igual(dado, cofre.get('ARBRAIN_PASE_AGENTE'))

/**
 * ¿Esta ruta le está cerrada al pase de agente? (403 con el pase; solo la app y su web, con el Bearer del daemon.) Pura.
 *
 * Red team 4 M4-2: lista BLANCA. Antes el pase abría todo salvo una lista de escrituras, así que leía las conversaciones
 * de la persona (`GET /sessions`, `/chat/backstage`), su actividad (`/ops/recent`, `/ops/stream`), su uso (`/usage`),
 * sus pendientes con el literal de lo que está por aprobar (`/confirmaciones`), sus archivos sin la política
 * (`/fs/*`), la memoria y la anatomía del contexto (`POST /cabina`) y sus cifras (`/cohorte`). Ningún agente legítimo
 * las usa: la Cabina va directo a la base, el lienzo va a la web (`/api/canvas`), el chat propio ya está en su contexto.
 * Al pase le queda solo lo que usan de verdad:
 *   - `GET /health`: sonda.
 *   - `GET /schedule`: ver las rutinas (lo documenta la skill de la app en el cerebro del alumno); correrlas o
 *     pausarlas sigue cerrado (red team 3 M-1/M-2).
 *   - `GET /manos/estado`, `GET /manos/interruptor`, `POST /confirmaciones/pedir|consumir`: el MCP de manos. En la v1
 *     responden apagado o 403 `no_disponible` (DECISIONES #11); quedan para cuando computer use vuelva.
 * `/vivo` y `/live/tool` se atienden antes de la credencial (el segundo con su propio token por turno).
 */
export function rutaSoloApp(metodo: string | undefined, ruta: string): boolean {
  return !(RUTAS_DEL_PASE[metodo ?? '']?.has(ruta) ?? false)
}

const RUTAS_DEL_PASE: Record<string, ReadonlySet<string>> = {
  GET: new Set(['/health', '/schedule', '/manos/estado', '/manos/interruptor']),
  POST: new Set(['/confirmaciones/pedir', '/confirmaciones/consumir']),
}

/** Solo pruebas. */
export function vaciarCofreParaPruebas(): void { cofre = new Map(); origen = 'ninguno' }
