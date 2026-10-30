/**
 * «Pausar todo» (seguridad del alumno, 12 oct 2026; AUDITORIA punto 4). Freno general de la persona: detiene los turnos
 * y rutinas en curso y bloquea los nuevos hasta que ella reanude desde la app.
 *
 * Tres capas, todas en el daemon de la edición cliente:
 *   1. al pausar se abortan los controladores de todo turno vivo (chat y rutinas), lo que interrumpe el CLI, y se cierran
 *      las sesiones del pool (nada queda corriendo en segundo plano);
 *   2. `runAgent`, `runAgent` de rutinas y el scheduler no arrancan nada mientras dure la pausa;
 *   3. la guardia de herramientas niega toda herramienta mientras dure (lo que sobreviva a la capa 1 no actúa).
 *
 * El estado se guarda en `<ARBRAIN_CONFIG_DIR>/pausa.json` (carpeta protegida: ningún agente la lee ni la escribe), así
 * una pausa sobrevive a un reinicio del daemon. Pausar lo puede pedir la app con su token; reanudar exige además el
 * secreto de confirmar (X-Arbrain-Confirmar): un agente nunca se despausa. Instalación de Daniel: no se usa.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'

export const MENSAJE_PAUSA = 'Arbrain está en pausa: la persona detuvo todo desde la app. No se ejecutó nada. Cuando ella pulse «Reanudar», vuelve a intentarlo.'

export interface EstadoPausa { pausado: boolean; desde: number | null }

let estado: EstadoPausa | null = null
const enCurso = new Set<AbortController>()
const alPausar = new Set<() => void>()

const archivo = () => join(DIR_ARBRAIN(), 'pausa.json')

function leer(): EstadoPausa {
  if (estado) return estado
  try {
    const p = archivo()
    const j = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) as Partial<EstadoPausa> : {}
    estado = { pausado: j.pausado === true, desde: typeof j.desde === 'number' ? j.desde : null }
  } catch { estado = { pausado: false, desde: null } }
  return estado
}

function guardar(e: EstadoPausa): void {
  estado = e
  try { const p = archivo(); mkdirSync(dirname(p), { recursive: true, mode: 0o700 }); writeFileSync(p, JSON.stringify(e) + '\n', { mode: 0o600 }) }
  catch { /* el estado en memoria manda; el archivo solo lo persiste entre aperturas */ }
}

export const estadoPausa = (): EstadoPausa => ({ ...leer() })
export const pausado = (): boolean => leer().pausado

/** Pausa todo: aborta lo vivo y bloquea lo nuevo. Devuelve cuántos turnos se detuvieron. */
export function pausar(ahora = Date.now()): number {
  if (!leer().pausado) guardar({ pausado: true, desde: ahora })
  const n = enCurso.size
  for (const ac of [...enCurso]) { try { ac.abort() } catch { /* ya abortado */ } }
  enCurso.clear()
  for (const fn of alPausar) { try { fn() } catch { /* un oyente nunca impide la pausa */ } }
  return n
}

export function reanudar(): void { guardar({ pausado: false, desde: null }) }

/** Un turno o rutina vivo se apunta para que «Pausar todo» lo detenga. Devuelve la función para borrarse. */
export function registrarEnCurso(ac: AbortController): () => void {
  enCurso.add(ac)
  return () => { enCurso.delete(ac) }
}

/** Algo más que detener al pausar (p. ej. cerrar el pool de sesiones). */
export function alPausarTodo(fn: () => void): () => void { alPausar.add(fn); return () => { alPausar.delete(fn) } }

/** Solo pruebas. */
export function _pausaParaPruebas(e: EstadoPausa | null = null): void { estado = e; enCurso.clear() }
export const _enCursoParaPruebas = () => enCurso.size
