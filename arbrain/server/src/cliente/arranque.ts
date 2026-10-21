/**
 * Arranque de la edición cliente (empaquetado del alumno, 11 oct 2026; contrato:
 * docs/builds/empaquetado-2026-10-11/CONTRATO-DAEMON.md §2).
 *
 * Se importa PRIMERO en index.ts: corre antes de que config.ts, db.ts y compañía lean el entorno. Solo actúa con
 * `ARBRAIN_EDICION=cliente` explícita; en la instalación de Daniel no hace nada.
 *
 * Traduce el contrato (ARBRAIN_DATA_DIR, ARBRAIN_HOME, alias) a las variables que ya entiende el daemon, crea las
 * carpetas privadas (0700) y apaga lo que en la máquina de un alumno no corre (barrendero, aviso de subagentes del
 * motor, claude-in-chrome). Nada de esto toca `~/.config/arbrain` ni el `~/.claude` del usuario.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
// Marcador del repo (carril O, A3): `edicion.js` fija ARBRAIN_EDICION al cargarse; este módulo la lee directo.
import '../edicion.js'
import { configurarProveedorClaude } from './proveedor.js'
import { registrarHuellaSembrada } from './hooks-proyecto.js'
import { LLAVES_COFRE, fijarSecreto, guardarSecretos, leerLineaSincrona, parsearSecretos, secreto, vistaConLlaves } from './cofre.js'

export { CONTRATO_DAEMON } from './contrato.js'

export interface ResultadoArranque { ok: boolean; falta: string[]; dataDir?: string; home?: string }

function carpetaPrivada(ruta: string): void {
  mkdirSync(ruta, { recursive: true, mode: 0o700 })
  // mode de mkdir respeta umask y no cambia carpetas existentes: se fija explícito (en Windows chmod no aplica y se ignora).
  try { if (process.platform !== 'win32') chmodSync(ruta, 0o700) } catch { /* best-effort */ }
}

/** Marca de que el cerebro ya se sembró desde la plantilla (una sola vez: lo que el alumno borre no resucita). */
export const MARCA_SEMBRADO = '.arbrain-sembrado.json'

/**
 * Siembra el workspace del alumno con la plantilla de solo lectura que viaja en la app (`ARBRAIN_PLANTILLA_DIR`, pedido
 * de B). Solo la primera vez y sin sobrescribir nada que ya exista. Devuelve si sembró.
 */
export function sembrarCerebro(home: string, plantilla: string | undefined, ahora = new Date()): boolean {
  if (!plantilla || !existsSync(plantilla) || !statSync(plantilla).isDirectory()) return false
  if (existsSync(join(home, MARCA_SEMBRADO))) return false
  cpSync(plantilla, home, { recursive: true, force: false, errorOnExist: false })
  // Lo que ya trae esta plantilla cuenta como agregado: una versión posterior no lo vuelve a sembrar si el dueño lo borra.
  const agregados = AGREGADOS_PLANTILLA.filter(rel => existsSync(join(plantilla, rel)))
  writeFileSync(join(home, MARCA_SEMBRADO), JSON.stringify({ sembrado: ahora.toISOString(), desde: 'plantilla-cerebro', agregados }, null, 1) + '\n')
  return true
}

/**
 * Carpetas de documentación que una versión posterior de la plantilla agrega a un cerebro YA sembrado (17 oct 2026:
 * los manuales de conexión). Solo texto para leer dentro de `arbrain/cerebro/`: nunca `.claude/` (ganchos, ajustes,
 * skills), ni `CLAUDE.md`, ni nada que el agente ejecute. Cada una se siembra una sola vez, sin pisar nada; queda
 * anotada en la marca y, si el dueño la borra después, no resucita.
 */
export const AGREGADOS_PLANTILLA = ['arbrain/cerebro/manuales'] as const

/** Siembra en un cerebro ya sembrado las carpetas de `AGREGADOS_PLANTILLA` que aún no recibió. Devuelve las sembradas. */
export function sembrarAgregados(home: string, plantilla: string | undefined): string[] {
  const marca = join(home, MARCA_SEMBRADO)
  if (!plantilla || !existsSync(plantilla) || !existsSync(marca)) return []
  let datos: { agregados?: unknown } & Record<string, unknown>
  try { datos = JSON.parse(readFileSync(marca, 'utf8')) } catch { return [] }
  const ya = new Set(Array.isArray(datos.agregados) ? datos.agregados.filter((x): x is string => typeof x === 'string') : [])
  const nuevos: string[] = []
  for (const rel of AGREGADOS_PLANTILLA) {
    if (ya.has(rel)) continue
    const origen = join(plantilla, rel)
    if (!existsSync(origen) || !statSync(origen).isDirectory()) continue
    if (!existsSync(join(home, rel))) {
      cpSync(origen, join(home, rel), { recursive: true, force: false, errorOnExist: false })
      nuevos.push(rel)
    }
    ya.add(rel)
  }
  if (ya.size !== (Array.isArray(datos.agregados) ? datos.agregados.length : 0)) {
    writeFileSync(marca, JSON.stringify({ ...datos, agregados: [...ya] }, null, 1) + '\n')
  }
  return nuevos
}

const defecto = (env: NodeJS.ProcessEnv, k: string, v: string) => { if (!env[k]) env[k] = v }

/**
 * Prepara el entorno de la edición cliente. Pura salvo por crear carpetas y leer stdin; devuelve qué falta del contrato.
 * Secretos (contrato v2 §2.1): con `ARBRAIN_SECRETOS=stdin` llegan en la primera línea de stdin y van al cofre; en
 * ningún caso quedan en `env` (cliente/cofre.ts). `leerStdin` se inyecta en pruebas.
 */
export function prepararEntornoCliente(env: NodeJS.ProcessEnv = process.env, leerStdin: () => string = () => leerLineaSincrona(0)): ResultadoArranque {
  // Alias del contrato → nombres históricos del daemon.
  if (!env.MISSION_CONTROL_ORIGIN && env.ARBRAIN_WEB_URL) env.MISSION_CONTROL_ORIGIN = env.ARBRAIN_WEB_URL

  let deStdin: Record<string, string> | null = null
  if ((env.ARBRAIN_SECRETOS ?? '').trim().toLowerCase() === 'stdin') {
    try { deStdin = parsearSecretos(leerStdin()) } catch (e) {
      deStdin = {}
      process.stderr.write(`arranque: no se pudieron leer los secretos de stdin: ${(e as Error).message}\n`)
    }
  }
  guardarSecretos(env, deStdin)

  const falta: string[] = []
  if (!env.ARBRAIN_DATA_DIR) falta.push('ARBRAIN_DATA_DIR')
  if (!env.MC_SERVER_PORT || !/^\d+$/.test(env.MC_SERVER_PORT)) falta.push('MC_SERVER_PORT')
  // Red team L1: sin el origen de la web no hay a quién entregar respuestas ni a quién abrir CORS; nunca un puerto por defecto.
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.MISSION_CONTROL_ORIGIN ?? '')) falta.push('MISSION_CONTROL_ORIGIN')
  if ((secreto('OPENCLAW_GATEWAY_TOKEN') ?? '').length < 16) falta.push('OPENCLAW_GATEWAY_TOKEN')
  if (falta.length) return { ok: false, falta }
  // BYOK: con solo la llave de OpenRouter, el CLI de Claude va por OpenRouter (cliente/proveedor.ts). Se decide sobre
  // una vista con las llaves; lo que no es llave (URL base, modelos) vuelve a `env`, las llaves se quedan en el cofre.
  const vista = vistaConLlaves(env)
  configurarProveedorClaude(vista)
  for (const k of LLAVES_COFRE) fijarSecreto(k, vista[k])
  for (const [k, v] of Object.entries(vista)) if (!(LLAVES_COFRE as readonly string[]).includes(k) && typeof v === 'string' && env[k] !== v) env[k] = v

  const data = resolve(env.ARBRAIN_DATA_DIR!)
  const home = env.ARBRAIN_HOME && isAbsolute(env.ARBRAIN_HOME) ? resolve(env.ARBRAIN_HOME) : join(data, 'workspace')
  env.ARBRAIN_DATA_DIR = data
  env.ARBRAIN_HOME = home
  for (const d of [data, join(data, 'store'), join(data, 'config'), join(data, 'uploads'), join(data, 'claude'), join(data, 'cohorte'), join(data, 'config', 'manos')]) carpetaPrivada(d)
  mkdirSync(home, { recursive: true })
  let sembro = false
  try { sembro = sembrarCerebro(home, env.ARBRAIN_PLANTILLA_DIR) } catch (e) { process.stderr.write(`arranque: no se pudo sembrar el cerebro: ${(e as Error).message}\n`) }
  if (!sembro) try { sembrarAgregados(home, env.ARBRAIN_PLANTILLA_DIR) } catch (e) { process.stderr.write(`arranque: no se pudieron sembrar los agregados de la plantilla: ${(e as Error).message}\n`) }

  defecto(env, 'CLAUDECLAW_STORE_DIR', join(data, 'store'))
  defecto(env, 'ARBRAIN_CONFIG_DIR', join(data, 'config'))
  // Red team 2 C-1: los ganchos recién sembrados son los aceptados (la huella vive en la configuración de la app).
  if (sembro) try { registrarHuellaSembrada(home) } catch (e) { process.stderr.write(`arranque: no se pudo registrar la huella de los ganchos: ${(e as Error).message}\n`) }
  defecto(env, 'ARBRAIN_UPLOADS_DIR', join(data, 'uploads'))
  // El CLI de Claude del alumno vive aislado: ni lee hooks/skills de su ~/.claude ni mezcla sesiones.
  defecto(env, 'CLAUDE_CONFIG_DIR', join(data, 'claude'))
  defecto(env, 'MANOS_BITACORA_DIR', join(data, 'config', 'manos', 'bitacora'))
  defecto(env, 'MANOS_RECETAS_DIR', join(data, 'config', 'recetas'))
  defecto(env, 'MANOS_ENCARGOS_DIR', join(data, 'config', 'manos', 'encargos'))
  defecto(env, 'MANOS_WEB_DIR', join(data, 'config', 'web'))
  defecto(env, 'ARBRAIN_MOTOR_SOCK', join(data, 'config', 'motor.sock'))
  // Lo que en la máquina del alumno no corre (usa lsof/ps/launchctl o el motor de Daniel).
  defecto(env, 'ARBRAIN_BARRENDERO', '0')
  defecto(env, 'ARBRAIN_AVISO_SUBAGENTES', '0')
  defecto(env, 'LEVY_CHROME', '0')
  defecto(env, 'CLAUDECLAW_ROLE', 'full')
  return { ok: true, falta: [], dataDir: data, home }
}

// Efecto al importar: solo con la edición cliente explícita.
if ((process.env.ARBRAIN_EDICION ?? '').trim().toLowerCase() === 'cliente') {
  const r = prepararEntornoCliente(process.env)
  if (!r.ok) {
    process.stderr.write(`ARBRAIN_DAEMON_ERROR ${JSON.stringify({ codigo: 'config', falta: r.falta })}\n`)
    process.exit(78)
  }
}
