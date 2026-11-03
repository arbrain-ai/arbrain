/**
 * El agente que se está preparando (2 nov 2026, Daniel a las 06:16 con captura: «veo que estás delegando a cuatro subagentes
 * pero no los veo»). `delegar` crea primero el worktree (`prepararAislamiento`, minutos en el repo grande) y solo después
 * escribe al agente en el registro: durante 4:48 el chat decía «Delegando» y el Taller «Nadie trabaja ahora».
 *
 * Mientras prepara, `delegar` deja aquí una marca por lanzamiento (un archivo, no memoria: la herramienta y la vista del
 * Taller pueden correr en procesos distintos) y la borra al nacer o fallar. El Taller la pinta como «Preparando». Una marca
 * cuyo proceso ya no vive, o más vieja que `VIGENCIA_MS`, es basura de un servidor que se cayó: no se pinta y se borra.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DIR_ARBRAIN } from '../edicion.js'

export interface Preparando {
  clave: string; nombre: string; harness: string
  /** ISO de cuándo empezó a preparar. */
  desde: string
  /** Conversación desde la que Levy lo lanzó (la misma regla que `Subagente.origen`). */
  origen: string | null
  aislamiento: 'worktree' | 'carpeta' | null
  pid: number
}

export const VIGENCIA_MS = 30 * 60_000
const dir = () => join(DIR_ARBRAIN(), 'subagentes-preparando')
const vive = (pid: number) => { try { process.kill(pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM' } }

/** Corre `preparar` con su marca puesta; la marca se quita siempre al terminar (nazca o falle). */
export async function conPreparando<T>(p: Pick<Preparando, 'nombre' | 'harness' | 'origen' | 'aislamiento'>, preparar: () => Promise<T>): Promise<T> {
  const marca: Preparando = { ...p, nombre: p.nombre.slice(0, 80), clave: randomUUID(), desde: new Date().toISOString(), pid: process.pid }
  const ruta = join(dir(), `${marca.clave}.json`)
  // La marca es para mirar: si no se puede escribir, el lanzamiento sigue igual.
  try { await mkdir(dir(), { recursive: true }); await writeFile(ruta, JSON.stringify(marca)) } catch { /* sin marca */ }
  try { return await preparar() } finally { await rm(ruta, { force: true }).catch(() => {}) }
}

/** Los que se están preparando ahora, del más viejo al más nuevo. Las marcas huérfanas se borran al leerlas. */
export async function leerPreparando(ahora = Date.now(), estaVivo: (pid: number) => boolean = vive): Promise<Preparando[]> {
  let nombres: string[]
  try { nombres = (await readdir(dir())).filter(n => n.endsWith('.json')) } catch { return [] }
  const out: Preparando[] = []
  for (const n of nombres) {
    const ruta = join(dir(), n)
    try {
      const m = JSON.parse(await readFile(ruta, 'utf8')) as Preparando
      const t = Date.parse(m.desde)
      if (!Number.isFinite(t) || ahora - t > VIGENCIA_MS || !estaVivo(m.pid)) { await rm(ruta, { force: true }); continue }
      out.push(m)
    } catch { /* a medio escribir o ya borrada: la siguiente lectura la ve */ }
  }
  return out.sort((a, b) => a.desde.localeCompare(b.desde))
}
