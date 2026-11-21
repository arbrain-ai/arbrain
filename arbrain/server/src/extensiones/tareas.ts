/**
 * Extensiones · sus tareas en el scheduler (21 nov 2026, SPEC §1.2 `tareas` y §4.3 llaves).
 *
 * Una tarea de extensión es una fila de `scheduled_tasks` con id `ext-<extension>--<tarea>`. La fila no guarda el
 * comando: en cada corrida se vuelve a leer el `arbrain.json` de la carpeta INSTALADA (cambia al actualizar), así una
 * versión nueva corre lo nuevo sin re-dar de alta, y una extensión quitada no corre nada (la fila se borra sola).
 *
 * Cómo corre (sin agente, sin LLM): el script declarado (`corre`, dentro de la carpeta instalada, sin salir de ella)
 * con sus `argumentos`, en la carpeta del cerebro, con un entorno MÍNIMO: PATH, HOME, idioma y zona; `ARBRAIN_RAIZ`
 * (el cerebro), `CLAUDE_PLUGIN_ROOT` y `CLAUDE_PLUGIN_DATA` (los mismos que da Claude Code a la skill) y SOLO las
 * llaves que la tarea declara en `necesita` (como `YOUTUBE_DATA_API_KEY`). Nada más del daemon llega al hijo: ni sus
 * tokens ni la llave de Claude del alumno. `PYTHONDONTWRITEBYTECODE=1`: la carpeta instalada es de solo lectura.
 */
import { delimiter, extname, join, resolve } from 'node:path'
import { accessSync, constants, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dentro, dirDatos, entornoDeLlaves, leerInstaladas, manifiestoDe } from './disco.js'
import { idTarea, type Manifiesto, type Tarea } from './modelo.js'

const SEGMENTO = '[a-z0-9](?:[a-z0-9]|-(?!-))*'
const FORMA_ID = new RegExp(`^ext-(${SEGMENTO})--(${SEGMENTO})$`)

/** `ext-competencia--estudio-semanal` → { extension: 'competencia', tarea: 'estudio-semanal' } */
export function leerIdTarea(id: string): { extension: string; tarea: string } | null {
  const m = FORMA_ID.exec(id)
  return m ? { extension: m[1], tarea: m[2] } : null
}
export const esTareaExtension = (id: string) => leerIdTarea(id) !== null

/** Lo que se ve en Rutinas: qué extensión y qué corre (la fila guarda esto; el comando se vuelve a leer al correr). */
export const textoTarea = (m: Manifiesto, t: Tarea) =>
  `Extensión «${m.nombre}» · ${t.id}: ${[t.corre, ...t.argumentos].join(' ')}`.slice(0, 500)

export interface FilaTarea { id: string; prompt: string; schedule: string; status: string; next_run: number; last_run: number | null; last_result: string | null }
export interface AlmacenTareas {
  listar(): FilaTarea[]
  crear(t: { id: string; prompt: string; schedule: string; nextRun: number }): void
  borrar(id: string): void
}

const deLaExtension = (ext: string, filas: FilaTarea[]) => filas.filter(f => leerIdTarea(f.id)?.extension === ext)

/**
 * Da de alta (o al día) las tareas de una extensión: crea las que faltan, reemplaza las que cambiaron de horario o de
 * comando y borra las que su versión ya no declara. Una tarea igual se deja como está (si el dueño la pausó, sigue
 * pausada). Un `cada` que no es cron no se da de alta (se reporta).
 */
export function darDeAlta(ext: string, m: Manifiesto, almacen: AlmacenTareas, proxima: (cron: string) => number):
  { altas: string[]; iguales: string[]; bajas: string[]; invalidas: string[] } {
  const previas = deLaExtension(ext, almacen.listar())
  const quiero = new Map(m.tareas.map(t => [idTarea(ext, t.id), t]))
  const r = { altas: [] as string[], iguales: [] as string[], bajas: [] as string[], invalidas: [] as string[] }
  for (const f of previas) if (!quiero.has(f.id)) { almacen.borrar(f.id); r.bajas.push(f.id) }
  for (const [id, t] of quiero) {
    let siguiente: number
    try { siguiente = proxima(t.cada) } catch { r.invalidas.push(id); continue }
    const prompt = textoTarea(m, t)
    const previa = previas.find(f => f.id === id)
    if (previa && previa.schedule === t.cada && previa.prompt === prompt) { r.iguales.push(id); continue }
    if (previa) almacen.borrar(id)
    almacen.crear({ id, prompt, schedule: t.cada, nextRun: siguiente })
    r.altas.push(id)
  }
  return r
}

/** Da de baja todas las tareas de una extensión (al quitarla). */
export function darDeBaja(ext: string, almacen: AlmacenTareas): string[] {
  const bajas = deLaExtension(ext, almacen.listar()).map(f => f.id)
  for (const id of bajas) almacen.borrar(id)
  return bajas
}

export class ErrorTareaExtension extends Error {
  /** La extensión ya no está instalada (o ya no declara esa tarea): la fila sobra y se borra. */
  constructor(msg: string, public sobra = false) { super(msg) }
}

export interface ContextoCorrida {
  cerebro: string
  configDir: string
  archivoLlaves: string
  /** El entorno del daemon: de aquí solo salen PATH, HOME, idioma y zona (y las llaves declaradas, si no están en el archivo). */
  env: NodeJS.ProcessEnv
}

export interface Corrida { cmd: string; args: string[]; cwd: string; env: Record<string, string>; timeoutMs: number; extension: string; tarea: string }

export const PLAZO_TAREA_MS = 30 * 60_000
const CARPETAS_EXTRA = ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin'), '/usr/bin', '/bin']
const BASE_ENV = ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'TZ', 'SystemRoot', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']

export const rutaDeBusqueda = (env: NodeJS.ProcessEnv) => [...new Set([...(env.PATH ?? '').split(delimiter).filter(Boolean), ...CARPETAS_EXTRA])]

/** El primer ejecutable con ese nombre en la ruta de búsqueda (la del daemon más las carpetas de siempre). */
export function buscarPrograma(nombre: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!/^[A-Za-z0-9._+-]+$/.test(nombre)) return null
  for (const d of rutaDeBusqueda(env)) {
    for (const n of process.platform === 'win32' ? [`${nombre}.exe`, `${nombre}.cmd`, nombre] : [nombre]) {
      const p = join(d, n)
      try { accessSync(p, constants.X_OK); if (statSync(p).isFile()) return p } catch { /* sigue */ }
    }
  }
  return null
}

/** Qué corre una tarea: lo resuelve SIEMPRE desde la carpeta instalada de hoy. Lanza `ErrorTareaExtension` si no se puede. */
export function prepararCorrida(id: string, ctx: ContextoCorrida): Corrida {
  const ref = leerIdTarea(id)
  if (!ref) throw new ErrorTareaExtension(`«${id}» no es una tarea de extensión.`)
  const inst = leerInstaladas(ctx.configDir, ctx.cerebro).get(ref.extension)
  if (!inst) throw new ErrorTareaExtension(`La extensión «${ref.extension}» ya no está instalada en este cerebro: su tarea se quitó.`, true)
  const m = manifiestoDe(inst.installPath)
  const t = m?.tareas.find(x => x.id === ref.tarea)
  if (!m || !t) throw new ErrorTareaExtension(`La versión instalada de «${ref.extension}» ya no declara la tarea «${ref.tarea}»: se quitó.`, true)
  let raiz: string, script: string
  try { raiz = realpathSync(inst.installPath); script = realpathSync(resolve(raiz, t.corre)) } catch {
    throw new ErrorTareaExtension(`No encuentro «${t.corre}» en la extensión «${ref.extension}» instalada (reinstálala desde Extensiones).`)
  }
  if (!dentro(raiz, script) || !statSync(script).isFile()) throw new ErrorTareaExtension(`«${t.corre}» sale de la carpeta de la extensión: no se corre.`)

  const { vars, faltan } = entornoDeLlaves(t.necesita, ctx.archivoLlaves, ctx.env)
  const obligatorias = faltan.filter(c => !m.requiere.llaves.find(l => l.clave === c)?.opcional)
  if (obligatorias.length) throw new ErrorTareaExtension(`Falta la llave ${obligatorias.join(', ')} de «${m.nombre}»: guárdala en Extensiones › ${m.nombre}.`)

  const env: Record<string, string> = {}
  for (const k of BASE_ENV) { const v = ctx.env[k]; if (typeof v === 'string' && v) env[k] = v }
  env.PATH = rutaDeBusqueda(ctx.env).join(delimiter)
  if (!env.HOME) env.HOME = homedir()
  Object.assign(env, vars, {
    ARBRAIN_RAIZ: ctx.cerebro,
    CLAUDE_PLUGIN_ROOT: raiz,
    CLAUDE_PLUGIN_DATA: dirDatos(ctx.configDir, ref.extension),
    ARBRAIN_LLAVES: ctx.archivoLlaves,
    ARBRAIN_EXTENSION_TAREA: id,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONUNBUFFERED: '1',
  })

  const ext = extname(script).toLowerCase()
  let cmd: string, args: string[]
  if (ext === '.py') {
    const py = buscarPrograma('python3', ctx.env) ?? buscarPrograma('python', ctx.env)
    if (!py) throw new ErrorTareaExtension(`«${m.nombre}» necesita python3 y no lo encuentro en esta computadora.`)
    cmd = py; args = [script, ...t.argumentos]
  } else if (ext === '.sh') {
    cmd = '/bin/bash'; args = [script, ...t.argumentos]
  } else if (ext === '.mjs' || ext === '.js' || ext === '.cjs') {
    cmd = process.execPath; args = [script, ...t.argumentos]
  } else {
    cmd = script; args = [...t.argumentos]
  }
  return { cmd, args, cwd: ctx.cerebro, env, timeoutMs: PLAZO_TAREA_MS, extension: ref.extension, tarea: ref.tarea }
}
