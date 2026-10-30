/**
 * Medios del sistema nervioso del lienzo (14 oct 2026): de un candidato declarado (`medio:vsl2/*\/vsl2.mp4`,
 * `env:HT_VSL2_URL`, `https://…`) a algo que el reproductor del lienzo pueda pedir, y el flujo con Range.
 *
 * SEGURIDAD: solo se sirve lo que vive bajo una LISTA CERRADA de raíces con alias (por defecto `~/Movies/arbrain-medios`
 * y `~/Movies/vsl2`, la salida del pipeline del VSL2). Sin rutas absolutas, sin `..`, sin ocultos, symlinks resueltos y
 * re-validados, solo extensiones de audio y video. Un `env:` solo puede ser `*_URL` y su valor tiene que ser https: el
 * valor de una variable cualquiera nunca sale al navegador.
 *
 * LATENCIA: el archivo se sirve tal cual desde el disco del Studio (los cortes del pipeline salen con `faststart`), con
 * `Accept-Ranges` y una URL versionada por tamaño y fecha (`v=`), así que reabrir el mismo video no vuelve a pedir nada.
 */
import { createReadStream } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { candidatoMedio, type MedioResuelto } from '@/features/canvas/model/nervio'

export type RaicesMedios = Record<string, string>

/** Las raíces permitidas. `ARBRAIN_MEDIOS_RAICES=alias=/ruta:alias2=/ruta2` las reemplaza (pruebas, otra instalación). */
export function raicesMedios(env: NodeJS.ProcessEnv = process.env): RaicesMedios {
  const crudo = env.ARBRAIN_MEDIOS_RAICES
  if (crudo) {
    const out: RaicesMedios = {}
    for (const par of crudo.split(':')) {
      const i = par.indexOf('=')
      if (i > 0 && path.isAbsolute(par.slice(i + 1))) out[par.slice(0, i)] = par.slice(i + 1)
    }
    return out
  }
  const h = homedir()
  return { 'arbrain-medios': path.join(h, 'Movies/arbrain-medios'), vsl2: path.join(h, 'Movies/vsl2') }
}

export const TIPOS_MEDIO: Record<string, { mime: string; clase: 'video' | 'audio' }> = {
  mp4: { mime: 'video/mp4', clase: 'video' }, m4v: { mime: 'video/mp4', clase: 'video' }, mov: { mime: 'video/quicktime', clase: 'video' },
  webm: { mime: 'video/webm', clase: 'video' }, mp3: { mime: 'audio/mpeg', clase: 'audio' }, m4a: { mime: 'audio/mp4', clase: 'audio' },
  aac: { mime: 'audio/aac', clase: 'audio' }, wav: { mime: 'audio/wav', clase: 'audio' }, ogg: { mime: 'audio/ogg', clase: 'audio' },
}
const extDe = (p: string) => path.extname(p).slice(1).toLowerCase()
const dentro = (abs: string, base: string) => abs === base || abs.startsWith(base.endsWith('/') ? base : base + '/')

export class ErrorMedio extends Error { constructor(msg: string, public status = 400) { super(msg) } }

export interface ArchivoMedio { real: string; ruta: string; bytes: number; mtimeMs: number; mime: string; clase: 'video' | 'audio' }

/** Expande `*` (un segmento = «el más reciente que exista») sin salir del directorio. Devuelve rutas candidatas. */
async function expandir(dir: string, segs: string[]): Promise<string[]> {
  if (!segs.length) return [dir]
  const [s, ...resto] = segs
  if (s !== '*') return expandir(path.join(dir, s), resto)
  let nombres: string[]
  try { nombres = (await readdir(dir)).filter(n => !n.startsWith('.')).slice(0, 500) } catch { return [] }
  const out: string[] = []
  for (const n of nombres) out.push(...await expandir(path.join(dir, n), resto))
  return out
}

/** `medio:<alias>/<ruta>` → archivo real permitido. Con `*`, el candidato más reciente que exista. */
export async function resolverArchivo(src: string, raices: RaicesMedios = raicesMedios()): Promise<ArchivoMedio> {
  const v = candidatoMedio(src)
  if (!v || !v.startsWith('medio:')) throw new ErrorMedio('Ese medio no es una ruta permitida.', 403)
  const [alias, ...segs] = v.slice(6).split('/')
  const raiz = raices[alias]
  if (!raiz) throw new ErrorMedio(`La raíz «${alias}» no está en la lista de medios.`, 403)
  if (segs.some(s => s.startsWith('.'))) throw new ErrorMedio('Los archivos ocultos no se sirven.', 403)
  const raizReal = await realpath(raiz).catch(() => null)
  if (!raizReal) throw new ErrorMedio('La carpeta de medios no existe en esta máquina.', 404)
  let mejor: ArchivoMedio | null = null
  for (const cand of await expandir(raiz, segs)) {
    const real = await realpath(cand).catch(() => null)
    if (!real || !dentro(real, raizReal)) continue
    if (real.slice(raizReal.length).split('/').some(p => p.startsWith('.'))) continue
    const t = TIPOS_MEDIO[extDe(real)]
    if (!t) continue
    const info = await stat(real).catch(() => null)
    if (!info?.isFile()) continue
    if (!mejor || info.mtimeMs > mejor.mtimeMs) {
      mejor = { real, ruta: `medio:${alias}${real.slice(raizReal.length)}`, bytes: info.size, mtimeMs: info.mtimeMs, mime: t.mime, clase: t.clase }
    }
  }
  if (!mejor) throw new ErrorMedio(segs.includes('*') ? 'Todavía no hay ningún archivo que coincida.' : 'Ese archivo no existe.', 404)
  return mejor
}

const PUBLICO_DIRECTO = /\.(mp4|m4v|webm|mov|mp3|m4a|wav|ogg|aac|m3u8)(\?|#|$)/i

/** Una URL pública: video directo o página para incrustar (SFCast). */
function resolverUrl(url: string, origen: string): MedioResuelto | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'https:') return null
  const directo = PUBLICO_DIRECTO.test(u.pathname)
  return { ok: true, tipo: directo ? 'url' : 'embed', url: u.href, origen, clase: /\.(mp3|m4a|wav|ogg|aac)$/i.test(u.pathname) ? 'audio' : 'video' }
}

export const urlFlujo = (a: Pick<ArchivoMedio, 'ruta' | 'bytes' | 'mtimeMs'>) =>
  `/api/canvas/nervio/medio/flujo?m=${encodeURIComponent(a.ruta)}&v=${a.bytes.toString(36)}-${Math.round(a.mtimeMs).toString(36)}`

/**
 * El primer candidato que exista gana (el orden lo declara el agente: «la URL estable primero, si no el corte local»).
 * `sondear` (ffprobe con caché) es opcional: da duración y proporción para la pastilla y el reproductor.
 */
export async function resolverMedio(src: readonly string[], o: {
  raices?: RaicesMedios; env?: Record<string, string | undefined>
  sondear?: (real: string) => Promise<{ duracion: number | null; ancho: number | null; alto: number | null } | null>
} = {}): Promise<MedioResuelto> {
  const env = o.env ?? process.env
  const errores: string[] = []
  for (const c of src) {
    const v = candidatoMedio(c)
    if (!v) { errores.push(`«${c}» no es un candidato válido`); continue }
    if (v.startsWith('env:')) {
      const val = env[v.slice(4)]?.trim()
      const r = val ? resolverUrl(val, v) : null
      if (r) return r
      errores.push(`${v.slice(4)} sin definir`)
      continue
    }
    if (v.startsWith('https://')) { const r = resolverUrl(v, v); if (r) return r; continue }
    try {
      const a = await resolverArchivo(v, o.raices)
      const s = o.sondear ? await o.sondear(a.real).catch(() => null) : null
      return { ok: true, tipo: 'archivo', url: urlFlujo(a), origen: a.ruta, clase: a.clase, bytes: a.bytes,
        duracion: s?.duracion ?? null, ancho: s?.ancho ?? null, alto: s?.alto ?? null }
    } catch (e) { errores.push(e instanceof ErrorMedio ? e.message : 'no se pudo leer') }
  }
  return { ok: false, error: errores.join(' · ') || 'sin candidatos' }
}

/** Un archivo como flujo web que tolera la cancelación a medias (saltar en el video cancela la petición anterior). */
function flujo(ruta: string, rango?: { start: number; end: number }): ReadableStream<Uint8Array> {
  // 512 KB por lectura: menos vueltas al disco en el arranque que los 64 KB por omisión.
  const rs = createReadStream(ruta, { ...rango, highWaterMark: 512 * 1024 })
  return new ReadableStream<Uint8Array>({
    start(c) {
      rs.on('data', chunk => { try { c.enqueue(chunk as Buffer); if ((c.desiredSize ?? 1) <= 0) rs.pause() } catch { rs.destroy() } })
      rs.on('end', () => { try { c.close() } catch { /* ya cancelado */ } })
      rs.on('error', e => { try { c.error(e) } catch { /* ya cancelado */ } })
    },
    pull() { rs.resume() },
    cancel() { rs.destroy() },
  })
}

/** La respuesta de un archivo con Range (206), completo (200) o rango imposible (416). */
export function responderArchivo(a: Pick<ArchivoMedio, 'real' | 'bytes' | 'mime' | 'mtimeMs'>, rangeHeader: string | null): Response {
  const headers: Record<string, string> = {
    'Content-Type': a.mime, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
    // La URL lleva la versión (tamaño y fecha): si el archivo cambia, cambia la URL. Privada: viaja con la sesión.
    'Cache-Control': 'private, max-age=86400', ETag: `"${a.bytes.toString(36)}-${Math.round(a.mtimeMs).toString(36)}"`,
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? '')
  if (m && (m[1] || m[2])) {
    const ini = m[1] ? Number(m[1]) : Math.max(0, a.bytes - Number(m[2]))
    const fin = m[1] && m[2] ? Math.min(Number(m[2]), a.bytes - 1) : a.bytes - 1
    if (ini >= a.bytes || ini > fin) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${a.bytes}` } })
    return new Response(flujo(a.real, { start: ini, end: fin }), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${ini}-${fin}/${a.bytes}`, 'Content-Length': String(fin - ini + 1) } })
  }
  return new Response(flujo(a.real), { headers: { ...headers, 'Content-Length': String(a.bytes) } })
}
