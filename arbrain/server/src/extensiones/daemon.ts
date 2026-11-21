/**
 * Extensiones · las piezas reales del daemon (21 nov 2026): su cerebro, la carpeta de Claude Code con que abre sus
 * conversaciones, el archivo de llaves, la versión de Arbrain, el CLI y `scheduled_tasks`. Las pruebas no pasan por aquí:
 * inyectan las suyas en `tienda.ts` y `tareas.ts`.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALLOWED_CHAT_ID, defaultAccountConfigDir, PROJECT_ROOT } from '../config.js'
import { createTask, deleteTask, listTasks } from '../db.js'
import { archivoLlaves } from './disco.js'
import { prepararCorrida, type AlmacenTareas, type Corrida } from './tareas.js'
import { cliReal, type DepsTienda } from './tienda.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
/** `arbrain/` (el repo de la app que corre este daemon): de ahí sale el catálogo local por defecto y la VERSION. */
const ARBRAIN = resolve(AQUI, '..', '..', '..')

/** La carpeta de Claude Code de la cuenta con que el daemon abre sus conversaciones (sin variable: `~/.claude`). */
export const configDirDaemon = () => defaultAccountConfigDir() ?? join(homedir(), '.claude')

export function versionArbrain(): string | null {
  const v = (process.env.ARBRAIN_VERSION ?? '').trim()
  if (v) return v
  try { return readFileSync(join(ARBRAIN, 'empaquetado', 'distribucion', 'VERSION'), 'utf8').trim() || null } catch { return null }
}

export const almacenDelDaemon: AlmacenTareas = {
  listar: () => listTasks(),
  crear: t => createTask({ id: t.id, chat_id: ALLOWED_CHAT_ID || 'local', thread_id: null, prompt: t.prompt, schedule: t.schedule, next_run: t.nextRun, status: 'active', created_at: Math.floor(Date.now() / 1000) }),
  borrar: id => deleteTask(id),
}

export function depsDelDaemon(proxima: (cron: string) => number): DepsTienda {
  const cerebro = resolve(PROJECT_ROOT)
  return {
    cerebro,
    configDir: configDirDaemon(),
    archivoLlaves: archivoLlaves(),
    env: process.env,
    raicesCatalogo: [cerebro, resolve(ARBRAIN, '..')],
    versionArbrain: versionArbrain(),
    claude: cliReal(cerebro, defaultAccountConfigDir() ?? null),
    tareas: almacenDelDaemon,
    proxima,
  }
}

/** Lo que corre el scheduler para `ext-<extension>--<tarea>` (lanza ErrorTareaExtension si ya no se puede). */
export const corridaDelDaemon = (id: string): Corrida =>
  prepararCorrida(id, { cerebro: resolve(PROJECT_ROOT), configDir: configDirDaemon(), archivoLlaves: archivoLlaves(), env: process.env })
