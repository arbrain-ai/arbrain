/**
 * Edición de Arbrain (seguridad para clientes, 10 oct 2026; docs/builds/seguridad-empaquetado-2026-10-09/AUDITORIA.md).
 *
 * La instalación de Daniel no cambia: sin marca, todo sigue como hoy. En la app del alumno la marca viaja por
 * variable (`ARBRAIN_EDICION=cliente`, contrato en docs/builds/empaquetado-2026-10-11/CONTRATO-DAEMON.md); los procesos
 * hijos (servidor MCP de manos, Cabina) la heredan del entorno del daemon.
 *
 * Empaquetado (11 oct 2026): el archivo marcador `edicion` ya no se lee de `~/.config/arbrain` compartida, porque la app
 * del alumno instalada en la Mac de Daniel convertiría también a su daemon. Solo se lee de una carpeta de
 * configuración explícita (`ARBRAIN_CONFIG_DIR`, o `ARBRAIN_DATA_DIR/config` que pasa la app).
 *
 * Marcador del repo (carril O, red team A3, 11 oct 2026): la COPIA del alumno nace cliente en cualquier forma de
 * ejecución (Claude Code o Codex levantando `manos`, `npm run dev`, `tsx`, `npm start`), sin depender de variables.
 * El generador escribe `arbrain/EDICION` (plantilla `arbrain/empaquetado/plantillas/arbrain/EDICION`); el repo de
 * Daniel no lo tiene. Al cargar este módulo, si el marcador dice `cliente` y no hay `ARBRAIN_EDICION` explícita, se fija
 * `process.env.ARBRAIN_EDICION=cliente`: así lo ven igual todas las preguntas de edición del proceso y lo heredan sus
 * hijos (agentes, MCP, Cabina). Un `env` sintético (pruebas) no se toca: la respuesta depende solo del `env` que pasan.
 *
 * Prioridad: `ARBRAIN_EDICION` explícita (cliente → sí; cualquier otro valor → no) > marcador del repo > marcador de la
 * carpeta explícita > instalación de Daniel.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/**
 * Dónde se busca el marcador del repo, relativo a este módulo: `src/edicion.ts` o `dist/edicion.js` dentro de
 * `arbrain/server` → `arbrain/server/EDICION` y `arbrain/EDICION` (el que escribe el generador). Un daemon armado con
 * `build:cliente` en otra carpeta lo encuentra en `<daemon>/EDICION` si se copia ahí.
 */
export const RUTAS_MARCADOR_REPO = [new URL('../EDICION', import.meta.url), new URL('../../EDICION', import.meta.url)].map(u => fileURLToPath(u))

/** Valor de un marcador: la primera línea que no es comentario (`#`) ni vacía, en minúsculas; '' si no hay archivo. */
export function leerMarcador(ruta: string): string {
  try {
    const linea = readFileSync(ruta, 'utf8').split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith('#'))
    return (linea ?? '').toLowerCase()
  } catch { return '' }
}

/** ¿Algún marcador del repo dice `cliente`? */
export function marcadorRepoCliente(rutas: readonly string[] = RUTAS_MARCADOR_REPO): boolean {
  return rutas.some(r => leerMarcador(r) === 'cliente')
}

/**
 * Aplica el marcador del repo al entorno: sin `ARBRAIN_EDICION` explícita y con marcador `cliente`, la fija. La
 * variable explícita siempre gana (también `ARBRAIN_EDICION=original` para salir a propósito). Devuelve si la fijó.
 */
export function aplicarMarcadorRepo(env: NodeJS.ProcessEnv = process.env, rutas: readonly string[] = RUTAS_MARCADOR_REPO): boolean {
  if ((env.ARBRAIN_EDICION ?? '').trim()) return false
  if (!marcadorRepoCliente(rutas)) return false
  env.ARBRAIN_EDICION = 'cliente'
  return true
}

aplicarMarcadorRepo()

/** Carpeta de configuración explícita (la de la app del alumno o la de una prueba), o '' si no hay. */
function dirExplicita(env: NodeJS.ProcessEnv): string {
  return env.ARBRAIN_CONFIG_DIR || (env.ARBRAIN_DATA_DIR ? join(env.ARBRAIN_DATA_DIR, 'config') : '')
}

/**
 * Carpeta de configuración local de Arbrain: la explícita (app del alumno, pruebas); si no hay, `~/.config/arbrain`
 * (Daniel) o, en cliente, `~/.config/arbrain-cliente`: una copia que corre fuera de la app (p. ej. `manos` lanzado por
 * Claude Code desde el repo del alumno) nunca lee el interruptor, la voz ni la bitácora de la instalación de Daniel.
 */
export const DIR_ARBRAIN = () =>
  dirExplicita(process.env) || join(homedir(), esEdicionCliente() ? '.config/arbrain-cliente' : '.config/arbrain')

export function esEdicionCliente(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicita = (env.ARBRAIN_EDICION ?? '').trim().toLowerCase()
  if (explicita) return explicita === 'cliente'
  const dir = dirExplicita(env)
  if (!dir) return false
  return leerMarcador(join(dir, 'edicion')) === 'cliente'
}

/**
 * Texto de «falta una llave» (carril T, 11 oct 2026). En la instalación original es el de siempre (`original`, que cita
 * su `arbrain/server/.env`); en cliente nunca nombra ese archivo ni variables de la instalación original: la única
 * llave que el alumno pone es la de Ajustes › Llaves (Anthropic, sesión de Claude u OpenRouter).
 */
export function textoFaltaLlave(nombre: string, original: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!esEdicionCliente(env)) return original
  if (nombre === 'OPENROUTER_API_KEY') return 'Falta tu llave de OpenRouter: agrégala en Ajustes › Llaves.'
  if (nombre === 'ANTHROPIC_API_KEY') return 'Falta tu llave de Claude: agrégala en Ajustes › Llaves.'
  return 'Esta opción necesita una llave que esta edición de Arbrain no configura.'
}

/** Texto de «el motor por API está apagado»: en cliente sin la instrucción de editar el `.env` de la instalación original. */
export function textoMotorApiApagado(original: string, env: NodeJS.ProcessEnv = process.env): string {
  return esEdicionCliente(env) ? 'El motor por API no está disponible en esta edición.' : original
}
