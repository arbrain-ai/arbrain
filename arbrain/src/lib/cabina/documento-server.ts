import 'server-only'
/**
 * Lado servidor de la vista «documento» (3 oct 2026): resolver con disco (symlinks), leer, guardar
 * con guarda de concurrencia, leer la versión de HEAD y firmar el acceso a los assets de un HTML.
 *
 * Los assets de un HTML se piden desde un iframe `sandbox="allow-scripts"` SIN `allow-same-origin`:
 * su origen es opaco y la cookie de sesión no viaja. Por eso la URL lleva una firma (HMAC con un
 * secreto del proceso) que dice hasta qué carpeta puede leer y hasta cuándo.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { alcanceDeAssets, resolverRuta, rutaPermitida, tipoDocumento, type Raices, type TipoDocumento } from '@/features/cabina/documento/ruta'
import { esEdicionCliente } from '@/lib/edicion'
import { raizWorkspace } from '@/lib/rutas-instalacion'

const CANDIDATAS = [process.env.BUSINESS_OS_ROOT, path.join(homedir(), 'Developer/artificial-brain'), path.join(homedir(), 'Developer/business-os'), path.join(process.cwd(), '..')].filter(Boolean) as string[]
/**
 * El repo vivo (el mismo que lee el Taller): donde Levy escribe, no la copia que sirve la web.
 * Edición cliente: solo el workspace del alumno (`ARBRAIN_HOME`), también como «home»: nada fuera de su cerebro.
 */
export function raices(): Raices {
  if (esEdicionCliente()) { const ws = path.resolve(raizWorkspace()); return { repo: ws, home: ws } }
  const repo = CANDIDATAS.find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? CANDIDATAS[0]
  return { repo: path.resolve(repo), home: homedir() }
}

export class ErrorDocumento extends Error { constructor(msg: string, public status = 400) { super(msg) } }

/** Ruta pedida → ruta real en disco, validada antes y después de seguir enlaces. */
export async function resolverEnDisco(pedida: string): Promise<{ abs: string; real: string; tipo: TipoDocumento }> {
  const r = raices()
  const res = resolverRuta(pedida, r)
  if ('error' in res) throw new ErrorDocumento(res.error, 403)
  let real: string
  try { real = await realpath(res.abs) } catch { throw new ErrorDocumento('Ese archivo ya no existe.', 404) }
  const repoReal = await realpath(r.repo).catch(() => r.repo)
  if (rutaPermitida(real, r) && rutaPermitida(real, { ...r, repo: repoReal })) throw new ErrorDocumento('El enlace apunta fuera de lo permitido.', 403)
  const info = await stat(real)
  // Una carpeta se abre como entrega (8 oct 2026, visor único).
  if (info.isDirectory()) return { abs: res.abs, real, tipo: 'carpeta' }
  if (!info.isFile()) throw new ErrorDocumento('Eso no es un archivo ni una carpeta.', 400)
  return { abs: res.abs, real, tipo: tipoDocumento(real) }
}

export const huella = (texto: string | Buffer) => createHash('sha256').update(texto).digest('hex').slice(0, 24)
export const MAX_TEXTO = 1_000_000

export async function leerTexto(real: string) {
  const [buf, info] = await Promise.all([readFile(real), stat(real)])
  if (buf.length > MAX_TEXTO) throw new ErrorDocumento('El archivo es demasiado grande para el panel (más de 1 MB).', 413)
  return { texto: buf.toString('utf8'), hash: huella(buf), mtime: info.mtime.toISOString(), bytes: buf.length }
}

/** Guarda solo si el disco sigue igual a lo que se leyó; si cambió, no pisa. */
export async function guardarTexto(real: string, texto: string, base: string) {
  const actual = await readFile(real)
  if (huella(actual) !== base) return { conflicto: true as const }
  if (Buffer.byteLength(texto) > MAX_TEXTO) throw new ErrorDocumento('Demasiado texto para guardar desde el panel.', 413)
  await writeFile(real, texto, 'utf8')
  const info = await stat(real)
  return { conflicto: false as const, hash: huella(Buffer.from(texto, 'utf8')), mtime: info.mtime.toISOString() }
}

/** La versión del último commit, para los cambios marcados. null = el archivo no está en git. */
export function versionHead(real: string): Promise<string | null> {
  const dir = path.dirname(real)
  return new Promise(resolve => {
    execFile('git', ['-C', dir, 'show', `HEAD:./${path.basename(real)}`], { maxBuffer: 4 * MAX_TEXTO, timeout: 8000 }, (err, out) => resolve(err ? null : out))
  })
}

// ── Firma de assets ──
const g = globalThis as { __arbrainDocSecreto?: Buffer }
const secreto = () => (g.__arbrainDocSecreto ??= process.env.ARBRAIN_DOC_SECRET ? Buffer.from(process.env.ARBRAIN_DOC_SECRET) : randomBytes(32))
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const TRAMO_MS = 6 * 3600_000

/** La caducidad va por tramos de 6 h (vive entre 6 y 12 h): la misma página firma la MISMA URL
 *  en cada relectura, así el iframe no se recarga cada vez que el panel pregunta si cambió. */
export function firmar(alcance: string, ahora = Date.now()): string {
  const cuerpo = b64(JSON.stringify({ d: alcance, e: (Math.floor(ahora / TRAMO_MS) + 2) * TRAMO_MS }))
  return `${cuerpo}.${b64(createHmac('sha256', secreto()).update(cuerpo).digest()).slice(0, 32)}`
}
export function verificar(token: string, ahora = Date.now()): string | null {
  const [cuerpo, firma] = token.split('.')
  if (!cuerpo || !firma) return null
  const esperada = b64(createHmac('sha256', secreto()).update(cuerpo).digest()).slice(0, 32)
  if (firma.length !== esperada.length || !timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null
  try { const { d, e } = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')); return typeof d === 'string' && typeof e === 'number' && e > ahora ? d : null } catch { return null }
}

/** URL servible de un archivo (HTML, imagen, video, portada) con acceso a su carpeta y alrededores. */
export function urlCruda(real: string, alcance = alcanceDeAssets(real, raices())): string {
  return `/api/cabina/documento/crudo/${firmar(alcance)}${real.split('/').map(encodeURIComponent).join('/')}`
}

// ── Visor único (8 oct 2026): sondeo de medios, carpeta de entrega, imágenes hermanas ──
export interface SondaMedio { ancho: number | null; alto: number | null; fps: number | null; duracion: number | null }

/** ffprobe (si el equipo lo tiene) para que el visor sepa el fps (pasos de fotograma exactos), la proporción y la duración antes de cargar. */
const sondas = new Map<string, Promise<SondaMedio | null>>()
export async function sondear(real: string): Promise<SondaMedio | null> {
  // El panel relee cada 3 s: un ffprobe por archivo y versión (cambia el mtime, cambia la clave).
  const info = await stat(real).catch(() => null)
  if (!info) return null
  const clave = `${real}|${info.size}|${info.mtimeMs}`
  let p = sondas.get(clave)
  if (!p) { if (sondas.size > 200) sondas.clear(); p = sondarSinCache(real); sondas.set(clave, p) }
  return p
}
/** El servicio web del Studio corre con un PATH mínimo de launchd (sin Homebrew): sin la ruta, ffprobe «no existía» y
 *  el visor y el lienzo perdían duración y proporción (medido el 14 oct). */
const FFPROBE = ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe'].find(p => existsSync(p)) ?? 'ffprobe'
function sondarSinCache(real: string): Promise<SondaMedio | null> {
  return new Promise(resolve => {
    execFile(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,avg_frame_rate,r_frame_rate:format=duration', '-of', 'json', real], { timeout: 6000, maxBuffer: 1 << 20 }, (err, out) => {
      if (err) return resolve(null)
      try {
        const j = JSON.parse(out) as { streams?: { codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }[]; format?: { duration?: string } }
        const v = j.streams?.find(x => x.codec_type === 'video')
        const razon = (t?: string) => { const m = /^(\d+)\/(\d+)$/.exec(t ?? ''); return m && Number(m[2]) ? Number(m[1]) / Number(m[2]) : null }
        const fps = razon(v?.avg_frame_rate) || razon(v?.r_frame_rate)
        const d = Number(j.format?.duration)
        resolve({ ancho: v?.width ?? null, alto: v?.height ?? null, fps: fps && fps > 1 && fps < 241 ? Math.round(fps * 1000) / 1000 : null, duracion: Number.isFinite(d) && d > 0 ? d : null })
      } catch { resolve(null) }
    })
  })
}

export type ClaseArchivo = 'video' | 'audio' | 'imagen' | 'pdf' | 'documento' | 'carpeta' | 'otro'
export interface ItemCarpeta { nombre: string; ruta: string; relativa: string; clase: ClaseArchivo; bytes: number; mtime: string; url?: string }
const CLASE: Partial<Record<TipoDocumento, ClaseArchivo>> = { video: 'video', audio: 'audio', imagen: 'imagen', pdf: 'pdf', md: 'documento', txt: 'documento', html: 'documento', mermaid: 'documento' }
const MAX_ITEMS = 240, PROFUNDIDAD = 3
const SALTAR = /^(node_modules|\.git|__pycache__|\.DS_Store|work|build|tmp|cache)$/i

/** Lo que hay en una carpeta, hasta 3 niveles y 240 archivos, sin credenciales ni código: lo que se entrega, no lo que se programó. */
export async function listarCarpeta(real: string): Promise<{ items: ItemCarpeta[]; recortado: boolean }> {
  const r = raices(), repoReal = await realpath(r.repo).catch(() => r.repo)
  const items: ItemCarpeta[] = []
  let recortado = false
  async function recorrer(dir: string, nivel: number) {
    const nombres = (await readdir(dir)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    for (const nombre of nombres) {
      if (items.length >= MAX_ITEMS) { recortado = true; return }
      if (nombre.startsWith('.') || SALTAR.test(nombre)) continue
      const abs = path.join(dir, nombre)
      let fin: string
      try { fin = await realpath(abs) } catch { continue }
      if (rutaPermitida(fin, r) && rutaPermitida(fin, { ...r, repo: repoReal })) continue
      const info = await stat(fin).catch(() => null)
      if (!info) continue
      if (info.isDirectory()) { if (nivel + 1 < PROFUNDIDAD) await recorrer(fin, nivel + 1); continue }
      const clase = CLASE[tipoDocumento(fin)]
      if (!clase) continue
      const relativa = path.relative(real, fin).split(path.sep).join('/')
      items.push({ nombre, ruta: fin, relativa, clase, bytes: info.size, mtime: info.mtime.toISOString(), url: clase === 'video' || clase === 'audio' ? urlCruda(fin, real) : undefined })
    }
  }
  await recorrer(real, 0)
  return { items, recortado }
}

/** `entrega.json` de la carpeta (la escribe quien produjo la entrega): título, nota y qué es final. Todo opcional. */
export async function leerEntrega(real: string): Promise<{ titulo?: string; nota?: string; finales?: string[]; piezas?: string[] } | null> {
  try {
    const j = JSON.parse(await readFile(path.join(real, 'entrega.json'), 'utf8')) as Record<string, unknown>
    const lista = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 200) : undefined
    return { titulo: typeof j.titulo === 'string' ? j.titulo.slice(0, 160) : undefined, nota: typeof j.nota === 'string' ? j.nota.slice(0, 600) : undefined, finales: lista(j.finales), piezas: lista(j.piezas) }
  } catch { return null }
}

const EXT_IMAGEN = /\.(png|jpe?g|webp|gif|svg|avif)$/i
/** Las imágenes de la misma carpeta, para recorrerlas con ← →. */
export async function hermanasImagen(real: string): Promise<{ nombre: string; ruta: string }[]> {
  const dir = path.dirname(real)
  const r = raices(), repoReal = await realpath(r.repo).catch(() => r.repo)
  const nombres = (await readdir(dir).catch(() => [] as string[])).filter(n => !n.startsWith('.') && EXT_IMAGEN.test(n)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).slice(0, 120)
  const out: { nombre: string; ruta: string }[] = []
  for (const n of nombres) {
    const fin = await realpath(path.join(dir, n)).catch(() => null)
    if (fin && !(rutaPermitida(fin, r) && rutaPermitida(fin, { ...r, repo: repoReal }))) out.push({ nombre: n, ruta: fin })
  }
  return out
}
