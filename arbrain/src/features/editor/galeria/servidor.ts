import 'server-only'
/**
 * Galería de videos · lado servidor: une el lector del disco con lo que Arbrain ya sabe del canal (la misma lectura de
 * `Tu canal`: tabla `youtube_videos`, solo lectura) y con la bandeja de decisiones (autonomía v2). Nada de aquí publica,
 * sube ni postea: aprobar el post o programar la salida sube UNA tarjeta a la bandeja del dueño y guarda su id.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { leerCanal, leerTranscript, raiz } from '@/features/contenido/servidor'
import { aLaBandeja } from '@/features/decisiones/server'
import { candidatas, carpetaDeId, dentro, elegidaEnDisco, fichaMotor, finalesDe, guardarSolicitud, leerFicha, leerGaleria, reflejarRespuesta, type VideoCanal } from './lector'
import { leerMotor, MOTOR_URL, tokenMotor } from './motor'
import { estadoSolicitud, idYoutubeValido, palabrasDe, partirId, segmentar, youtubeDe, type Publish } from './modelo'
import type { FichaVideo, LecturaGaleria, Solicitud, TranscriptFicha } from './tipos'

export { raiz }

async function canal(): Promise<VideoCanal[] | null> {
  try {
    const l = await leerCanal()
    return l.aviso ? null : l.videos.map(v => ({ video_id: v.video_id, title: v.title, published_at: v.published_at, views: v.views, impressions_ctr: v.impressions_ctr ?? null, avg_view_percentage: v.avg_view_percentage ?? null, duration_seconds: v.duration_seconds ?? null }))
  } catch { return null }
}

async function transcriptDelCanal(vid: string): Promise<TranscriptFicha | null> {
  try {
    const t = await leerTranscript(vid)
    if (!t?.lineas.length) return null
    return { fuente: t.ruta ?? 'transcript de YouTube', corte: 'youtube', segmentos: t.lineas.map(l => ({ t: l.s, texto: l.texto })), palabras: t.lineas.reduce((n, l) => n + l.texto.split(/\s+/).length, 0) }
  } catch { return null }
}

export async function galeria(): Promise<LecturaGaleria> {
  const [c, m] = await Promise.all([canal(), leerMotor()])
  return leerGaleria(raiz(), c, new Date(), m)
}

/** La ficha; si hay tarjetas pendientes en la bandeja, lee su respuesta y la refleja en el proyecto antes de mostrarla. */
export async function ficha(request: Request, id: string): Promise<FichaVideo | null> {
  const R = raiz()
  if (!R) return null
  const p = partirId(id)
  if (p?.tipo === 'm') {
    const m = (await leerMotor())?.find(x => x.id === p.valor)
    if (!m) return null
    const f = fichaMotor(m)
    f.transcript = await transcriptDelMotor(m.poster?.mediaId)
    f.huecos = f.huecos.filter(h => h !== 'transcript' || !f.transcript)
    return f
  }
  const videos = await canal()
  let f = await leerFicha(R, id, videos, new Date(), transcriptDelCanal)
  if (!f) return null
  let cambio = false
  for (const [tipo, s] of [['aprobar_post', f.borrador.solicitud], ['programar', f.salida.programar]] as const) {
    if (!s || s.estado !== 'pendiente') continue
    try {
      const r = await aLaBandeja(request, `/decisiones/${s.id}`, { plazoMs: 4000 })
      if (!r.ok) continue
      const vista = await r.json() as { estado?: string; respuesta?: string; comentario?: string }
      const e = estadoSolicitud(vista)
      if (e.estado !== 'pendiente' && e.estado !== 'desconocido') { await reflejarRespuesta(R, id, tipo, e.estado, e.comentario); cambio = true }
    } catch { /* sin bandeja: se queda pendiente y se dice así */ }
  }
  if (cambio) f = await leerFicha(R, id, videos, new Date(), transcriptDelCanal)
  return f
}

// ── a la bandeja (el freno): pedir, nunca decidir ────────────────────────────────────────────────────────────────────

export async function subirALaBandeja(request: Request, id: string, tipo: 'aprobar_post' | 'programar', op: { revision?: string | null; para?: string | null }): Promise<Solicitud> {
  const R = raiz()
  if (!R) throw new Error('No encontré la carpeta del cerebro en esta máquina.')
  const f = await leerFicha(R, id, await canal())
  if (!f || f.origen !== 'proyecto') throw new Error('Solo un video con carpeta de proyecto puede subir a la bandeja.')
  if (!f.revision) throw new Error('Este video no tiene publish.json: pídele a Levy que arme su paquete de publicación.')
  if (tipo === 'aprobar_post' && !f.borrador.cuerpo.trim()) throw new Error('No hay texto del post que aprobar.')
  let para: string | null = null
  if (tipo === 'programar') {
    const d = op.para ? new Date(op.para) : null
    if (!d || !Number.isFinite(d.getTime()) || d.getTime() < Date.now() + 10 * 60e3) throw new Error('Elige una fecha y hora de salida al menos 10 minutos en el futuro.')
    para = d.toISOString()
  }
  const cuando = para ? new Date(para).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }) : ''
  const cuerpo = tipo === 'aprobar_post'
    ? { titulo: `Aprobar el post de «${f.titulo}»`.slice(0, 160), categoria: 'publicar', recomienda: 'si',
        recomendacion: 'El borrador está en la ficha de la galería. Aprobar no lo publica: lo deja listo para salir cuando el video sea público.',
        detalle: f.borrador.cuerpo.slice(0, 2000), organo: 'marketing' }
    : { titulo: `Programar «${f.titulo}» para ${cuando}`.slice(0, 160), categoria: 'publicar', recomienda: 'si',
        recomendacion: 'Con tu Sí, Levy sube y programa el video a esa hora (privado hasta entonces) y el post sale después, si está aprobado.',
        detalle: `Video: ${f.carpeta}\nSalida: ${cuando} (CDMX)\n${f.descripcion ? 'Descripción lista.' : 'Falta descripción.'} ${f.borrador.aprobado ? 'Post aprobado.' : 'Post sin aprobar.'}`, organo: 'marketing' }
  const r = await aLaBandeja(request, '/decisiones/pedir', { metodo: 'POST', cuerpo })
  const j = await r.json().catch(() => ({})) as { id?: string; error?: string }
  if (!r.ok || !j.id) throw new Error(j.error ?? 'La bandeja no respondió: no subí nada.')
  const s: Solicitud = { id: j.id, pedida: new Date().toISOString(), estado: 'pendiente', para }
  await guardarSolicitud(R, id, tipo, s, op.revision)
  return s
}

// ── medios: portada y finales (por inventario, nunca por ruta del cliente) ──────────────────────────────────────────

const TIPO: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' }
export const tipoDe = (p: string) => TIPO[path.extname(p).toLowerCase()] ?? 'application/octet-stream'
/** Caché de portadas bajadas o extraídas (fuera de git: `server/store/`). `ARBRAIN_GALERIA_CACHE` la mueve (capturas, pruebas). */
const cacheDir = (R: string) => process.env.ARBRAIN_GALERIA_CACHE || path.join(R, 'arbrain', 'server', 'store', 'editor-galeria', 'portadas')
const FFMPEG = () => ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find(existsSync) ?? 'ffmpeg'

async function deYoutube(R: string, vid: string): Promise<string | null> {
  const destino = path.join(cacheDir(R), `yt-${vid}.jpg`)
  if (existsSync(destino)) return destino
  for (const calidad of ['maxresdefault', 'hqdefault']) {
    try {
      const r = await fetch(`https://i.ytimg.com/vi/${vid}/${calidad}.jpg`, { signal: AbortSignal.timeout(8000) })
      if (!r.ok) continue
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 3000) continue // la gris de 120×90: la grande aún no existe
      await mkdir(cacheDir(R), { recursive: true })
      await writeFile(destino, buf)
      return destino
    } catch { /* sin red: siguiente */ }
  }
  return null
}

/** Un cuadro del video (a los 20 s o al 30 % si es corto), una vez, con prioridad baja. */
async function cuadro(R: string, video: string): Promise<string | null> {
  const st = await stat(video).catch(() => null)
  if (!st) return null
  const destino = path.join(cacheDir(R), `cuadro-${createHash('sha256').update(`${video}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 20)}.jpg`)
  if (existsSync(destino)) return destino
  await mkdir(cacheDir(R), { recursive: true })
  const ok = await new Promise<boolean>(res => execFile('nice', ['-n', '15', FFMPEG(), '-v', 'error', '-ss', '20', '-i', video, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '4', '-y', destino], { timeout: 20000 }, e => res(!e)))
  return ok && existsSync(destino) ? destino : null
}

/** La portada de una tarjeta (o una candidata por nombre): ruta absoluta del archivo a servir, o null. */
export async function portada(id: string, nombre: string | null, yt: string | null = null): Promise<string | null> {
  const R = raiz()
  if (!R) return null
  const p = partirId(id)
  if (p?.tipo === 'c') return deYoutube(R, p.valor)
  if (p?.tipo === 'm') return cuadroMotor(R, p.valor)
  const c = carpetaDeId(R, id)
  if (!c || !existsSync(c.dir)) return null
  const cands = await candidatas(c.dir)
  if (nombre) return cands.includes(nombre) ? dentro(c.dir, nombre) : null
  let pub: Publish | null = null
  try { pub = JSON.parse(await readFile(path.join(c.dir, 'publish.json'), 'utf8')) as Publish } catch { /* sin publish */ }
  const elegida = await elegidaEnDisco(c.dir, pub?.data?.thumbnail?.chosen)
  if (elegida) return dentro(c.dir, elegida)
  if (cands[0]) return dentro(c.dir, cands[0])
  const vid = youtubeDe(pub) ?? (idYoutubeValido(yt) ? yt : null)
  if (vid) { const y = await deYoutube(R, vid); if (y) return y }
  const finales = await finalesDe(c.dir, id)
  const largo = finales.find(f => f.tipo === 'largo') ?? finales[0]
  return largo ? cuadro(R, dentro(c.dir, largo.nombre)!) : null
}

/** Un final del proyecto, solo si está en su inventario (`renders/`, `final/`, `finales/`). */
export async function final(id: string, nombre: string): Promise<string | null> {
  const R = raiz()
  const c = R ? carpetaDeId(R, id) : null
  if (!c) return null
  const fs = await finalesDe(c.dir, id)
  return fs.some(f => f.nombre === nombre) ? dentro(c.dir, nombre) : null
}

/** El cuadro de portada de un proyecto del motor (`poster` → `/media/:id/frame`), pedido con el token desde aquí. */
async function cuadroMotor(R: string, proyecto: string): Promise<string | null> {
  const m = (await leerMotor())?.find(x => x.id === proyecto)
  const media = m?.poster?.mediaId, token = tokenMotor()
  if (!media || !token || !/^[\w-]{1,80}$/.test(media)) return null
  const t = Number.isFinite(m!.poster?.time) ? Number(m!.poster!.time) : 2
  const destino = path.join(cacheDir(R), `motor-${media}-${t}.jpg`)
  if (existsSync(destino)) return destino
  try {
    const r = await fetch(`${MOTOR_URL()}/media/${media}/frame?t=${t}&w=960`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) })
    if (!r.ok) return null
    await mkdir(cacheDir(R), { recursive: true })
    await writeFile(destino, Buffer.from(await r.arrayBuffer()))
    return destino
  } catch { return null }
}

/** El transcript de la toma en el motor (segmentos con tiempos), tal cual lo tiene: Whisper hoy, Qwen cuando lo enchufe `editor-espanol`. */
async function transcriptDelMotor(media: string | undefined): Promise<TranscriptFicha | null> {
  const token = tokenMotor()
  if (!media || !token || !/^[\w-]{1,80}$/.test(media)) return null
  try {
    const r = await fetch(`${MOTOR_URL()}/media/${media}/transcript?granularity=segment`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const j = await r.json() as { modelLabel?: string; provider?: string }
    const { palabras, segmentos } = palabrasDe(j)
    const segs = segmentos.length ? segmentos.sort((a, b) => a.t - b.t) : segmentar(palabras)
    if (!segs.length) return null
    return { fuente: `motor · ${j.modelLabel ?? j.provider ?? 'transcripción'}`, corte: 'crudo', segmentos: segs.map(x => ({ t: Math.round(x.t * 10) / 10, texto: x.texto })), palabras: segs.reduce((n, x) => n + x.texto.split(/\s+/).length, 0) }
  } catch { return null }
}
