/**
 * Hoja de miniaturas de un video (8 nov 2026, Daniel: «ver la miniatura del frame abajo, justo como YT»).
 *
 * El visor las pide por la misma ruta firmada del video con `?miniaturas=meta` (estado y medidas) y `?miniaturas=img` (la hoja).
 * La hoja se genera con ffmpeg en una sola pasada la primera vez (un video de 13 min tarda ~1 min en segundo plano, a baja
 * prioridad y de una en una para no ahogar al Studio) y se guarda en el temporal del sistema con la huella del archivo
 * (ruta + tamaño + mtime): si el video cambia, se genera otra; si el temporal se limpia, se vuelve a generar sola.
 * Mientras se genera el visor ya funciona (solo sin miniaturas); si ffmpeg no existe o falla, no hay miniaturas y el
 * visor sigue igual: nunca estorba a la reproducción.
 * Sin `import 'server-only'` a propósito (usa node:fs, así que no entra en el cliente igual) para poder probarlo con ffmpeg real;
 * `sondear` (que sí lo trae) se carga al usarse.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { setPriority, tmpdir } from 'node:os'
import { join } from 'node:path'
import { argsMiniaturas, planMiniaturas, type PlanMiniaturas } from '@/features/cabina/documento/medio'

/** El servicio web del Studio corre con un PATH mínimo de launchd (sin Homebrew): igual que ffprobe en documento-server. */
const FFMPEG = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find(p => existsSync(p)) ?? 'ffmpeg'
export const carpetaMiniaturas = () => process.env.ARBRAIN_MINIATURAS_DIR || join(tmpdir(), 'arbrain-miniaturas-video')
const VIDA_MS = 14 * 86_400_000
const REINTENTO_MS = 10 * 60_000
const LIMITE_MS = 10 * 60_000

export type EstadoMiniaturas = ({ estado: 'lista'; clave: string } & PlanMiniaturas) | { estado: 'generando' } | { estado: 'error'; motivo: string }

/** La huella del archivo: cambia si cambia el contenido (tamaño o mtime) o la ruta. */
export const claveMiniaturas = (real: string, info: { size: number; mtimeMs: number }) =>
  createHash('sha1').update(`${real}|${info.size}|${info.mtimeMs}`).digest('hex').slice(0, 20)

const rutas = (clave: string) => ({ jpg: join(carpetaMiniaturas(), `${clave}.jpg`), meta: join(carpetaMiniaturas(), `${clave}.json`) })

const g = globalThis as { __arbrainMiniaturas?: { trabajos: Map<string, Promise<void>>; fallos: Map<string, { motivo: string; en: number }>; cola: Promise<void> } }
const estado = () => (g.__arbrainMiniaturas ??= { trabajos: new Map(), fallos: new Map(), cola: Promise.resolve() })

export type Sondar = (real: string) => Promise<{ duracion: number | null; ancho: number | null; alto: number | null } | null>
const sondaDelVisor: Sondar = async real => (await import('./documento-server')).sondear(real)

async function generar(real: string, clave: string, sondar: Sondar): Promise<void> {
  const { jpg, meta } = rutas(clave)
  const sonda = await sondar(real)
  const plan = planMiniaturas(sonda?.duracion ?? 0, sonda?.ancho && sonda?.alto ? sonda.ancho / sonda.alto : 16 / 9)
  if (!plan) throw new Error('No se pudo leer la duración del video.')
  await mkdir(carpetaMiniaturas(), { recursive: true })
  const tmp = join(carpetaMiniaturas(), `${clave}.${process.pid}.tmp.jpg`)
  await new Promise<void>((resolve, reject) => {
    const hijo = execFile(FFMPEG, argsMiniaturas(real, tmp, plan), { timeout: LIMITE_MS, maxBuffer: 1 << 20 }, err => err ? reject(err) : resolve())
    // A baja prioridad: el Studio sirve la app mientras se arma la hoja.
    try { if (hijo.pid) setPriority(hijo.pid, 10) } catch { /* sin permiso: sigue a prioridad normal */ }
  })
  await rename(tmp, jpg)
  await writeFile(meta, JSON.stringify({ ...plan, clave }))
  void limpiarViejas()
}

/** Quita las hojas que nadie pidió en 14 días (best effort). */
async function limpiarViejas() {
  try {
    const ahora = Date.now()
    for (const nombre of await readdir(carpetaMiniaturas())) {
      const ruta = join(carpetaMiniaturas(), nombre)
      const info = await stat(ruta).catch(() => null)
      if (info && ahora - info.mtimeMs > VIDA_MS) await unlink(ruta).catch(() => undefined)
    }
  } catch { /* sin carpeta */ }
}

/** Dónde va la hoja de este video: lista, en camino o imposible. Pide generarla si aún no existe. */
export async function estadoMiniaturas(real: string, info: { size: number; mtimeMs: number }, sondar: Sondar = sondaDelVisor): Promise<EstadoMiniaturas> {
  const clave = claveMiniaturas(real, info)
  const { jpg, meta } = rutas(clave)
  if (existsSync(jpg) && existsSync(meta)) {
    try { return { estado: 'lista', ...(JSON.parse(await readFile(meta, 'utf8')) as PlanMiniaturas & { clave: string }) } }
    catch { await rm(meta, { force: true }); await rm(jpg, { force: true }) /* corrupta: se regenera */ }
  }
  const e = estado()
  const fallo = e.fallos.get(clave)
  if (fallo && Date.now() - fallo.en < REINTENTO_MS) return { estado: 'error', motivo: fallo.motivo }
  if (e.trabajos.has(clave)) return { estado: 'generando' }
  // De una en una por proceso: la cola evita que tres videos abiertos pongan tres ffmpeg a la vez.
  const trabajo = e.cola.then(() => generar(real, clave, sondar)).catch((err: unknown) => { e.fallos.set(clave, { motivo: err instanceof Error ? err.message.slice(0, 200) : 'No se pudieron generar las miniaturas.', en: Date.now() }) }).finally(() => { e.trabajos.delete(clave) })
  e.cola = trabajo
  e.trabajos.set(clave, trabajo)
  return { estado: 'generando' }
}

/** La hoja ya generada (bytes del JPEG), o null. */
export async function hojaMiniaturas(real: string, info: { size: number; mtimeMs: number }): Promise<Buffer | null> {
  try { return await readFile(rutas(claveMiniaturas(real, info)).jpg) } catch { return null }
}

/** Solo para pruebas: espera a que termine lo que se esté generando. */
export const esperarMiniaturas = async () => { await estado().cola }
