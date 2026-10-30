/**
 * Lado servidor de las imágenes rápidas (5 oct 2026): registra una imagen por el hash de su contenido y genera sus
 * variantes con sharp, una sola vez, en una caché de disco. Ver `variantes.ts` para el porqué.
 *
 * Seguridad: solo las rutas de la API que ya autorizan (vista documento, /api/imagen/info) registran imágenes. La URL
 * de una variante lleva el hash del contenido (128 bits): no se adivina, y antes de generar se vuelve a leer el origen
 * y se exige que su contenido siga dando ESE hash. Si el archivo cambió, esa URL ya no sirve nada nuevo.
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { anchoAceptado, esOptimizable, HASH_VALIDO, type FormatoVariante, type MetaImagen } from './variantes'
import { instalacion } from '@/config'

export type Origen = { archivo: string } | { url: string }
interface Ficha extends MetaImagen { origen: Origen }

const MAX_BYTES = 60 * 1024 * 1024
export const dirCache = () => process.env.ARBRAIN_IMG_CACHE || path.join(homedir(), 'Library', 'Caches', 'arbrain', 'imagenes')

const huella = (buf: Buffer) => createHash('sha256').update(buf).digest('hex').slice(0, 32)
const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** Escribe sin dejar archivos a medias: si dos procesos generan lo mismo, gana el último rename (contenido idéntico). */
async function escribirAtomico(destino: string, datos: Buffer | string) {
  await mkdir(path.dirname(destino), { recursive: true })
  const tmp = `${destino}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, datos)
  await rename(tmp, destino)
}

// Un solo trabajo por clave aunque lleguen varias peticiones a la vez (el panel relee cada 3 s; el navegador pide 1x y 2x).
const enVuelo = new Map<string, Promise<unknown>>()
function unaVez<T>(clave: string, trabajo: () => Promise<T>): Promise<T> {
  const previo = enVuelo.get(clave) as Promise<T> | undefined
  if (previo) return previo
  const p = trabajo().finally(() => enVuelo.delete(clave))
  enVuelo.set(clave, p)
  return p
}

// ── Leer el origen ──

/** Storage de Mission Control vive en el Studio: su URL pública (Funnel) se lee por la interna, sin salir a internet. */
function storageInterno(url: string): string {
  const publico = (process.env.NEXT_PUBLIC_MC_STORAGE_PUBLIC_URL || instalacion().storagePublico).replace(/\/$/, '')
  if (!publico) return url
  const interno = (process.env.MC_STORAGE_INTERNAL_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
  return url.startsWith(publico + '/') ? interno + url.slice(publico.length) : url
}

/** Solo Storage público conocido: el Studio (interno o Funnel) y Supabase en la nube. Nunca una URL cualquiera (SSRF). */
export function urlDeStoragePermitida(url: string): boolean {
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (!u.pathname.startsWith('/storage/v1/object/public/') || u.username || u.password) return false
  const crudo = process.env.NEXT_PUBLIC_MC_STORAGE_PUBLIC_URL || instalacion().storagePublico
  if (crudo) { try { if (u.origin === new URL(crudo).origin) return true } catch { /* sin Storage propio */ } }
  if (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname) && u.port === '8000') return true
  return u.protocol === 'https:' && u.hostname.endsWith('.supabase.co') && !u.port
}

async function descargar(url: string): Promise<Buffer> {
  const intentos = [...new Set([storageInterno(url), url])]
  let ultimo: unknown
  for (const destino of intentos) {
    try {
      const r = await fetch(destino, { signal: AbortSignal.timeout(20_000), redirect: 'error' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      if (Number(r.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('demasiado grande')
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > MAX_BYTES) throw new Error('demasiado grande')
      return buf
    } catch (e) { ultimo = e }
  }
  throw ultimo instanceof Error ? ultimo : new Error('No se pudo descargar la imagen.')
}

async function leerOrigen(origen: Origen): Promise<Buffer> {
  if ('archivo' in origen) {
    const info = await stat(origen.archivo)
    if (info.size > MAX_BYTES) throw new Error('demasiado grande')
    return readFile(origen.archivo)
  }
  return descargar(origen.url)
}

// ── Registrar ──

const fichaPath = (hash: string) => path.join(dirCache(), hash, 'meta.json')
const sinOrigen = ({ origen: _o, ...meta }: Ficha): MetaImagen => meta

async function fichar(buf: Buffer, origen: Origen): Promise<MetaImagen> {
  const hash = huella(buf)
  const ruta = fichaPath(hash)
  try {
    const previa = JSON.parse(await readFile(ruta, 'utf8')) as Ficha
    // El mismo contenido puede vivir en otro lugar (copia, otra versión): la ficha apunta al origen más reciente.
    if (JSON.stringify(previa.origen) !== JSON.stringify(origen)) await escribirAtomico(ruta, JSON.stringify({ ...previa, origen }))
    return sinOrigen(previa)
  } catch { /* primera vez */ }
  const img = sharp(buf, { failOn: 'none', limitInputPixels: 300e6 })
  const m = await img.metadata()
  const o = (m as { autoOrient?: { width: number; height: number } }).autoOrient
  const ancho = o?.width ?? m.width ?? 0
  const alto = o?.height ?? m.height ?? 0
  if (!ancho || !alto) throw new Error('No es una imagen legible.')
  const [mini, stats] = await Promise.all([
    sharp(buf, { failOn: 'none', limitInputPixels: 300e6 }).rotate().resize({ width: 24 }).webp({ quality: 40 }).toBuffer(),
    img.stats(),
  ])
  const { r, g, b } = stats.dominant
  const ficha: Ficha = { hash, ancho, alto, color: `#${hex(r)}${hex(g)}${hex(b)}`, placeholder: `data:image/webp;base64,${mini.toString('base64')}`, origen }
  await escribirAtomico(ruta, JSON.stringify(ficha))
  return sinOrigen(ficha)
}

// Archivo → ficha, por (ruta, mtime, tamaño): el panel relee cada 3 s y no hace falta volver a leer 7 MB.
const porArchivo = new Map<string, MetaImagen>()
const porUrl = new Map<string, MetaImagen>()

/** Ficha de un archivo ya validado por quien llama (ruta real, dentro de lo permitido). null = formato que no se recomprime. */
export async function registrarArchivo(real: string): Promise<MetaImagen | null> {
  if (!esOptimizable(real)) return null
  const info = await stat(real)
  if (info.size > MAX_BYTES) return null
  const clave = `${real}:${info.mtimeMs}:${info.size}`
  const hecha = porArchivo.get(clave)
  if (hecha) return hecha
  return unaVez(`archivo:${clave}`, async () => {
    const meta = await fichar(await readFile(real), { archivo: real })
    porArchivo.set(clave, meta)
    return meta
  })
}

/** Ficha de una imagen de Storage. Las URLs de Storage del chat son únicas por subida: se recuerdan por URL. */
export async function registrarUrl(url: string): Promise<MetaImagen | null> {
  if (!esOptimizable(url) || !urlDeStoragePermitida(url)) return null
  const hecha = porUrl.get(url)
  if (hecha) return hecha
  return unaVez(`url:${url}`, async () => {
    const meta = await fichar(await descargar(url), { url })
    porUrl.set(url, meta)
    return meta
  })
}

// ── Variantes ──

/** Ruta en disco de la variante, generándola si falta. null = hash desconocido, ancho no aceptado o el origen cambió. */
export async function variante(hash: string, ancho: number, formato: FormatoVariante): Promise<string | null> {
  if (!HASH_VALIDO.test(hash)) return null
  const destino = path.join(dirCache(), hash, `${ancho}.${formato}`)
  try { await stat(destino); return destino } catch { /* se genera */ }
  let ficha: Ficha
  try { ficha = JSON.parse(await readFile(fichaPath(hash), 'utf8')) as Ficha } catch { return null }
  if (!anchoAceptado(ancho, ficha.ancho)) return null
  return unaVez(`variante:${hash}/${ancho}.${formato}`, async () => {
    const buf = await leerOrigen(ficha.origen).catch(() => null)
    if (!buf || huella(buf) !== hash) return null
    const base = sharp(buf, { failOn: 'none', limitInputPixels: 300e6 }).rotate().resize({ width: ancho, withoutEnlargement: true })
    const salida = formato === 'avif' ? await base.avif({ quality: 50, effort: 4 }).toBuffer() : await base.webp({ quality: 78 }).toBuffer()
    await escribirAtomico(destino, salida)
    return destino
  })
}
