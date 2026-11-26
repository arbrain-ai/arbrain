import 'server-only'
/**
 * Cuartel de Contenido · lado servidor (15 nov 2026). Lee las vistas JSON del sensor y lo de CEREBRO desde el Studio
 * (ESQUEMA.md §1); si el sensor aún no corrió, cae al radar de antes (Supabase `intel_videos`) con la misma forma y lo
 * dice. Nada de esto sale de la máquina: YouTube reproduce; Arbrain guarda texto.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import path from 'node:path'
import { instalacion } from '@/config'
import { createSFClient } from '@/lib/supabase/sf-client'
import { entornoHerramientas, python3, rutaTranscript } from './corpus'
import { desdeRadar, dosisProvisional, leerTranscriptMd, normalizarDosis, normalizarIdeas, normalizarLazo, normalizarRanking } from './modelo'
import type { CanalCuartel, Descarga, FichaCanal, EstadoSensor, Inicio, LecturaCanal, LecturaCuartel, LecturaMentalidad, Tema, Transcript, VideoCuartel, VideoMentalidad, VideoPropio } from './tipos'

const RAICES = () => [process.env.BUSINESS_OS_ROOT, instalacion().raizRepoRespaldo, path.join(process.cwd(), '..')].filter(Boolean) as string[]
export const raiz = (): string | null => RAICES().find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? null

const ID = /^[\w-]{11}$/
export const idValido = (v: unknown): v is string => typeof v === 'string' && ID.test(v)

const dirCuartel = (R: string) => path.join(R, 'arbrain', 'server', 'store', 'cuartel')

async function json<T = unknown>(ruta: string): Promise<T | null> {
  try { return JSON.parse(await readFile(ruta, 'utf8')) as T } catch { return null }
}

// ── Lectura completa ─────────────────────────────────────────────────────────

export async function leerCuartel(): Promise<LecturaCuartel> {
  const R = raiz()
  const avisos: string[] = []
  const leido = new Date().toISOString()
  if (!R) return { universo: null, videos: [], outliers: [], estado: null, dosis: null, ideas: [], ranking: {}, lazo: null, fuente: 'vacio', inicio: null, avisos: ['No encontré la carpeta del cerebro en esta máquina.'], leido }
  const base = dirCuartel(R)
  const [universo, videosV, outliersV, estado, dosisRaw, ideasRaw, rankingRaw, lazoRaw, inicio] = await Promise.all([
    json<{ canales?: CanalCuartel[]; temas?: Tema[]; capas?: string[]; generado?: string }>(path.join(base, 'vistas', 'universo.json')),
    json<{ videos?: VideoCuartel[] }>(path.join(base, 'vistas', 'videos.json')),
    json<{ outliers?: VideoCuartel[] }>(path.join(base, 'vistas', 'outliers.json')),
    json<EstadoSensor>(path.join(base, 'vistas', 'estado.json')),
    json(path.join(base, 'cerebro', 'dosis.json')),
    json(path.join(base, 'cerebro', 'ideas.json')),
    json(path.join(base, 'cerebro', 'ranking.json')),
    json(path.join(base, 'cerebro', 'lazo.json')),
    leerInicio(R),
  ])

  let videos = videosV?.videos ?? [], outliers = outliersV?.outliers ?? []
  let canales = universo?.canales ?? []
  let fuente: LecturaCuartel['fuente'] = videos.length ? 'sensor' : 'vacio'
  if (!videos.length) {
    try {
      const sf = createSFClient()
      const [v, c] = await Promise.all([
        sf.from('intel_videos').select('video_id,channel_id,channel_name,title,thumbnail_url,views,likes,duration_seconds,published_at,language,keywords_matched').order('published_at', { ascending: false }).limit(400),
        sf.from('intel_channels').select('*'),
      ])
      if (v.error) throw new Error(v.error.message)
      const r = desdeRadar((v.data ?? []) as Record<string, unknown>[], (c.data ?? []) as Record<string, unknown>[])
      videos = r.videos
      if (!canales.length) canales = r.canales
      outliers = videos.filter(x => x.outlier && x.outlier.puntaje >= 2).sort((a, b) => (b.outlier!.puntaje) - (a.outlier!.puntaje))
      fuente = 'radar'
      avisos.push('El sensor del cuartel aún no publica: muestro el radar de antes (29 canales) con outliers aproximados.')
    } catch {
      avisos.push('Sin lectura del radar: ni el sensor ni Supabase respondieron. Ausencia no es cero.')
    }
  }
  // Nunca un Short: el sensor ya los excluye (`es_short`); el radar de antes se filtra en `desdeRadar`.
  videos = videos.filter(v => !(v as { es_short?: number | boolean }).es_short)
  const porId = new Map<string, VideoCuartel>()
  for (const v of [...outliers, ...videos]) porId.set(v.video_id, v)
  let dosis = normalizarDosis(dosisRaw, porId)
  if (!dosis) {
    dosis = dosisProvisional(videos)
    if (dosis) avisos.push('Dosis provisional: CEREBRO aún no la elige; van los outliers más fuertes de la semana.')
  }
  canales = await marcarEstudio(R, canales)
  return {
    universo: canales.length ? { canales, temas: universo?.temas ?? [], capas: universo?.capas ?? [], generado: universo?.generado } : null,
    videos, outliers, estado, dosis, ideas: normalizarIdeas(ideasRaw), ranking: normalizarRanking(rankingRaw), lazo: normalizarLazo(lazoRaw), fuente, inicio, avisos, leido,
  }
}

/**
 * «Mis 4» (19 nov 2026): sus referentes de estudio. La marca la pone su universo (`referente_estudio` en cada canal de
 * `universo-youtube.json`); el sensor la copia en `extra` en su siguiente corrida. Se leen las dos, por channel_id, para
 * que el atajo funcione desde ya. Los nombres nunca viven en el código.
 */
async function marcarEstudio(R: string, canales: CanalCuartel[]): Promise<CanalCuartel[]> {
  const u = await json<{ canales?: { channel_id?: string; referente_estudio?: unknown }[] }>(path.join(R, '.claude', 'memory', 'project', 'mi-negocio', 'universo-youtube.json'))
  const ids = new Set((u?.canales ?? []).filter(c => c.referente_estudio && typeof c.channel_id === 'string').map(c => c.channel_id as string))
  return canales.map(c => (ids.has(c.channel_id) || !!(c as { extra?: { referente_estudio?: unknown } }).extra?.referente_estudio ? { ...c, estudio: true } : c))
}

// ── Feed Inicio (PULSO, ESQUEMA §9) ──────────────────────────────────────────
// Lo escribe el pulso cada 30 min (y cada vista del sensor). Lo ya votado se quita aquí también, por si el voto llegó
// después de la última regeneración: el feed tiene final y no vuelve a ofrecer lo que ya decidió.

export async function leerInicio(R0?: string | null): Promise<Inicio | null> {
  const R = R0 ?? raiz()
  if (!R) return null
  const base = dirCuartel(R)
  const [inicio, votos] = await Promise.all([
    json<Inicio>(path.join(base, 'vistas', 'inicio.json')),
    readFile(path.join(base, 'cerebro', 'feedback.jsonl'), 'utf8').catch(() => ''),
  ])
  if (!inicio?.nuevo) return null
  const votado = new Set<string>()
  for (const linea of votos.split('\n')) {
    try { const f = JSON.parse(linea) as { video_id?: string; voto?: string }; if (f.video_id && f.voto) votado.add(f.video_id) } catch { /* renglón vacío */ }
  }
  const items = inicio.nuevo.items.filter(x => !votado.has(x.video_id))
  const quitados = inicio.nuevo.items.length - items.length
  if (!quitados) return inicio
  const al_dia = items.length === 0
  return {
    ...inicio,
    nuevo: {
      ...inicio.nuevo, items, pendientes: items.length, decididos: inicio.nuevo.decididos + quitados, al_dia,
      mensaje: al_dia ? `Estás al día: ya decidiste todo lo nuevo de tu nicho. Lo siguiente llega con el pulso de las ${inicio.siguiente_pulso_txt ?? 'próxima media hora'}.` : inicio.nuevo.mensaje,
    },
  }
}

// ── Biblioteca fija (mentalidad): ESQUEMA §4.5b/§4.6 ─────────────────────────
// La vista `vistas/biblioteca.json` (SENSOR) trae los números; la lista `store/cuartel/biblioteca.json` manda en
// `aprobado`, y es lo único que PANTALLAS escribe ahí (el palomeo del dueño y el botón «fijar»).

const listaBiblioteca = (R: string) => path.join(dirCuartel(R), 'biblioteca.json')
type EntradaLista = { video_id: string; aprobado?: boolean | null; [k: string]: unknown }

export async function leerMentalidad(): Promise<LecturaMentalidad> {
  const R = raiz()
  if (!R) return { estado: 'sin_propuesta', videos: [], canales: [] }
  const [vista, lista] = await Promise.all([
    json<{ videos?: Record<string, unknown>[] }>(path.join(dirCuartel(R), 'vistas', 'biblioteca.json')),
    json<{ videos?: EntradaLista[] }>(listaBiblioteca(R)),
  ])
  const aprobado = new Map((lista?.videos ?? []).map(e => [e.video_id, e.aprobado === true || e.aprobado === false ? e.aprobado : null]))
  const base = vista?.videos?.length ? vista.videos : (lista?.videos ?? []) as Record<string, unknown>[]
  if (!base.length) return { estado: 'sin_propuesta', videos: [], canales: [] }
  const videos = base.flatMap(v => {
    if (!idValido(v.video_id)) return []
    const id = v.video_id as string
    return [{ ...(v as unknown as VideoCuartel), titulo: String(v.titulo ?? id), canal: String(v.canal ?? ''), capa: String(v.capa ?? 'mentalidad'),
      uso: String(v.uso ?? 'constancia'), estante: String(v.estante ?? 'Fijados'), porque: (v.porque as string) ?? null, nucleo: v.nucleo === true,
      origen_propuesta: (v.origen_fijado as string) ?? (v.origen as string) ?? null,
      aprobado: aprobado.has(id) ? aprobado.get(id)! : (v.aprobado === true || v.aprobado === false ? v.aprobado : null) } satisfies VideoMentalidad]
  })
  // cuartel v2 (15 nov, Daniel: «dice para palomear... no es la intencion tenemos demasiado de mentalidad pero no de mi
  // nicho»): sin palomeo. El núcleo (y lo que él fijó) es el estante listo; el resto va tras «más»; lo que quitó, fuera.
  const vivos = videos.filter(v => v.aprobado !== false)
  const alNucleo = (v: VideoMentalidad) => v.nucleo === true || (v.aprobado === true && v.origen_propuesta === 'fijado')
  const orden = (a: VideoMentalidad, b: VideoMentalidad) => (a.uso === 'gym' ? 0 : 1) - (b.uso === 'gym' ? 0 : 1) || (b.vistas ?? 0) - (a.vistas ?? 0)
  const nucleo = vivos.filter(alNucleo).sort(orden)
  const mas = vivos.filter(v => !alNucleo(v)).sort(orden)
  const horas = Math.round(vivos.reduce((a, v) => a + (v.duracion_s ?? 0), 0) / 360) / 10
  return { estado: 'listo', nucleo, mas, videos: [...nucleo, ...mas], canales: [], resumen: { videos: vivos.length, nucleo: nucleo.length, horas_totales: horas } }
}

/** Quitar (false), devolver (null/true) y «fijar» un video nuevo (entra al núcleo). Solo cambia `aprobado` y agrega entradas. */
export async function decidirMentalidad(cambios: { videos?: Record<string, boolean | null> }, nuevos: EntradaLista[] = []) {
  const R = raiz()
  if (!R) throw new Error('Sin carpeta del cerebro.')
  const ruta = listaBiblioteca(R)
  const lista = (await json<{ videos?: EntradaLista[]; [k: string]: unknown }>(ruta)) ?? { esquema: 'cuartel.biblioteca/1', videos: [] }
  const xs = lista.videos ?? []
  for (const [id, v] of Object.entries(cambios.videos ?? {})) {
    if (!idValido(id)) continue
    const e = xs.find(x => x.video_id === id)
    if (e) e.aprobado = v
  }
  for (const n of nuevos) if (idValido(n.video_id) && !xs.some(x => x.video_id === n.video_id)) xs.push({ ...n, aprobado: true })
  lista.videos = xs
  await mkdir(path.dirname(ruta), { recursive: true })
  await writeFile(ruta + '.tmp', JSON.stringify(lista, null, 1))
  const { rename } = await import('node:fs/promises')
  await rename(ruta + '.tmp', ruta)
}

// ── Tu canal (YouTube Analytics → youtube_videos) ────────────────────────────

export async function leerCanal(): Promise<LecturaCanal> {
  const sf = createSFClient()
  const r = await sf.from('youtube_videos').select('*').order('published_at', { ascending: false }).limit(120)
  if (r.error) return { videos: [], leido: new Date().toISOString(), aviso: 'No se pudo leer tu analítica. Ausencia no es cero.' }
  const videos = ((r.data ?? []) as Record<string, unknown>[]).map(f => ({
    video_id: String(f.video_id), title: String(f.title ?? ''), published_at: String(f.published_at ?? ''),
    views: (f.views as number) ?? null, avg_view_percentage: (f.avg_view_percentage as number) ?? null,
    impressions: (f.impressions as number) ?? null, impressions_ctr: (f.impressions_ctr as number) ?? null,
    subscribers_gained: (f.subscribers_gained as number) ?? null, duration_seconds: (f.duration_seconds as number) ?? null,
    thumbnail_url: (f.thumbnail_url as string) ?? null,
  } satisfies VideoPropio))
  return { videos, leido: new Date().toISOString() }
}

// ── Transcript a un clic ─────────────────────────────────────────────────────
// Sin `rg` ni PATH heredado (corpus.ts): el servidor instalado lo lanza launchd con PATH mínimo.

export async function leerTranscript(videoId: string): Promise<Transcript | null> {
  const R = raiz()
  if (!R) return null
  const ruta = await rutaTranscript(R, videoId, dirCuartel(R))
  if (!ruta) return null
  const md = await readFile(ruta, 'utf8')
  const t = leerTranscriptMd(md)
  if (!t.lineas.length) return null
  return { video_id: videoId, titulo: t.titulo, canal: t.canal, lineas: t.lineas, ruta: path.relative(R, ruta) }
}

/** Pide el transcript al sensor (`--transcript <id>`, ESQUEMA §7). Sin sensor, yt-dlp por el pipeline de intel. */
export async function pedirTranscript(videoId: string): Promise<{ estado: string; detalle?: string }> {
  const R = raiz()
  if (!R) return { estado: 'error', detalle: 'Sin carpeta del cerebro.' }
  const sensor = path.join(R, 'arbrain', 'server', 'scripts', 'cuartel', 'cuartel_sensor.py')
  if (!existsSync(sensor)) return { estado: 'error', detalle: 'El sensor del cuartel aún no está instalado en esta máquina.' }
  const script = [sensor, '--transcript', videoId]
  return new Promise(res => {
    execFile(python3(), script, { cwd: R, env: entornoHerramientas(), timeout: 180000, maxBuffer: 4 << 20 }, (error, out, err) => {
      const ultima = out.trim().split('\n').pop() ?? ''
      try { const j = JSON.parse(ultima); return res({ estado: String(j.estado ?? (error ? 'error' : 'listo')), detalle: j.detalle ?? j.ruta }) } catch { /* texto */ }
      res(error ? { estado: 'error', detalle: (err || error.message).slice(-300) } : { estado: 'listo' })
    })
  })
}

// ── Ficha de canal («ir al canal» dentro de Arbrain, ESQUEMA §8.4) ───────────

const CANAL = /^UC[\w-]{22}$/
export const canalValido = (v: unknown): v is string => typeof v === 'string' && CANAL.test(v)

/** Sus últimos largos y sus mejores outliers del año, de `cuartel.db` en solo lectura (`--ficha`, 0 unidades). */
export async function leerFichaCanal(channelId: string): Promise<FichaCanal | null> {
  const R = raiz()
  if (!R || !canalValido(channelId)) return null
  const sensor = path.join(R, 'arbrain', 'server', 'scripts', 'cuartel', 'cuartel_sensor.py')
  if (!existsSync(sensor)) return null
  return new Promise(res => {
    execFile(python3(), [sensor, '--ficha', channelId], { cwd: R, env: entornoHerramientas(), timeout: 20000, maxBuffer: 8 << 20 }, (_e, out) => {
      try {
        const j = JSON.parse(out.trim().split('\n').pop() ?? '') as FichaCanal & { error?: string }
        res(j.error ? null : j)
      } catch { res(null) }
    })
  })
}

// ── Descargas con su botón (al Studio; servibles al teléfono) ────────────────

const DIAS_VIDA = 30
const GRACIA_VISTA_H = 12

export const dirDescargas = (R: string) => path.join(dirCuartel(R), 'descargas')
const indiceDe = (R: string) => path.join(dirDescargas(R), 'indice.json')

async function leerIndice(R: string): Promise<Descarga[]> {
  return (await json<Descarga[]>(indiceDe(R))) ?? []
}
async function escribirIndice(R: string, xs: Descarga[]) {
  await mkdir(dirDescargas(R), { recursive: true })
  const tmp = indiceDe(R) + '.tmp'
  await writeFile(tmp, JSON.stringify(xs, null, 1))
  const { rename } = await import('node:fs/promises')
  await rename(tmp, indiceDe(R))
}

/** Lista y poda: lo vencido (30 días) o visto (con 12 h de gracia) se borra archivo por archivo, salvo lo fijado. */
export async function listarDescargas(): Promise<Descarga[]> {
  const R = raiz()
  if (!R) return []
  const ahora = Date.now()
  const xs = await leerIndice(R)
  const dir = dirDescargas(R)
  const vivas: Descarga[] = []
  let cambio = false
  for (const d of xs) {
    const vencida = !d.fijada && ((d.expira && Date.parse(d.expira) < ahora) || (d.vista && ahora - Date.parse(d.vista) > GRACIA_VISTA_H * 36e5))
    if (vencida) {
      if (d.archivo) await unlink(path.join(dir, path.basename(d.archivo))).catch(() => {})
      cambio = true
      continue
    }
    // Estado vivo de una que baja: el log del proceso dice el avance.
    if (d.estado === 'bajando') {
      const fin = await json<{ estado: string; archivo?: string; bytes?: number; error?: string }>(path.join(dir, `${d.video_id}.estado.json`))
      if (fin && fin.estado !== 'bajando') {
        Object.assign(d, fin.estado === 'lista' ? { estado: 'lista', archivo: fin.archivo, bytes: fin.bytes, lista: new Date().toISOString() } : { estado: 'error', error: fin.error ?? 'No se pudo bajar.' })
        cambio = true
      } else {
        try {
          const log = await readFile(path.join(dir, `${d.video_id}.log`), 'utf8')
          const m = [...log.matchAll(/(\d{1,3}(?:\.\d)?)%/g)].pop()
          d.progreso = m ? Number(m[1]) / 100 : d.progreso ?? 0
        } catch { /* aún sin log */ }
        if (ahora - Date.parse(d.pedida) > 2 * 36e5) { d.estado = 'error'; d.error = 'Se quedó a medias más de 2 horas.'; cambio = true }
      }
    }
    vivas.push(d)
  }
  if (cambio) await escribirIndice(R, vivas)
  return vivas
}

export async function pedirDescarga(p: { video_id: string; titulo: string; canal?: string | null; modo?: 'video' | 'audio' }): Promise<Descarga> {
  const R = raiz()
  if (!R) throw new Error('Sin carpeta del cerebro.')
  const xs = await leerIndice(R)
  const ya = xs.find(d => d.video_id === p.video_id && d.estado !== 'error')
  if (ya) return ya
  const dir = dirDescargas(R)
  await mkdir(dir, { recursive: true })
  const d: Descarga = {
    video_id: p.video_id, titulo: p.titulo.slice(0, 200), canal: p.canal ?? null, estado: 'bajando', pedida: new Date().toISOString(),
    expira: new Date(Date.now() + DIAS_VIDA * 864e5).toISOString(), fijada: false, progreso: 0,
  }
  await escribirIndice(R, [...xs.filter(x => x.video_id !== p.video_id), d])
  // El script vive junto al código; en el Studio, en el checkout (R). Si no está en ninguno, se dice.
  const script = [path.join(R, 'arbrain', 'server', 'scripts', 'cuartel', 'boton_youtube.py'), path.join(process.cwd(), 'server', 'scripts', 'cuartel', 'boton_youtube.py')].find(existsSync)
  const estado = path.join(dir, `${p.video_id}.estado.json`)
  await unlink(estado).catch(() => {})
  if (!script) { await writeFile(estado, JSON.stringify({ estado: 'error', error: 'No encontré el script de descarga en esta máquina.' })); return d }
  const { openSync } = await import('node:fs')
  const log = openSync(path.join(dir, `${p.video_id}.log`), 'w')
  const hijo = spawn(python3(), [script, 'descargar', p.video_id, dir, p.modo ?? 'video'], { cwd: R, env: entornoHerramientas(), detached: true, stdio: ['ignore', log, log] })
  // Si el proceso sale sin dejar su estado (murió, no arrancó), queda el error a la vista en vez de «bajando» 2 horas.
  hijo.on('exit', codigo => { if (!existsSync(estado)) writeFile(estado, JSON.stringify({ estado: 'error', error: `La descarga terminó con código ${codigo}.` })).catch(() => {}) })
  hijo.on('error', e => { writeFile(estado, JSON.stringify({ estado: 'error', error: e.message })).catch(() => {}) })
  hijo.unref()
  return d
}

export async function ajustarDescarga(videoId: string, cambio: { fijada?: boolean; vista?: boolean; borrar?: boolean }) {
  const R = raiz()
  if (!R) throw new Error('Sin carpeta del cerebro.')
  const xs = await leerIndice(R)
  const d = xs.find(x => x.video_id === videoId)
  if (!d) return null
  if (cambio.borrar) {
    const dir = dirDescargas(R)
    if (d.archivo) await unlink(path.join(dir, path.basename(d.archivo))).catch(() => {})
    for (const extra of [`${videoId}.log`, `${videoId}.estado.json`]) await unlink(path.join(dir, extra)).catch(() => {})
    await escribirIndice(R, xs.filter(x => x !== d))
    return null
  }
  if (cambio.fijada != null) d.fijada = cambio.fijada
  if (cambio.vista) d.vista = d.vista ?? new Date().toISOString()
  await escribirIndice(R, xs)
  return d
}

export async function archivoDescarga(videoId: string): Promise<{ ruta: string; bytes: number; tipo: string } | null> {
  const R = raiz()
  if (!R) return null
  const d = (await leerIndice(R)).find(x => x.video_id === videoId && x.estado === 'lista')
  if (!d?.archivo) return null
  const ruta = path.join(dirDescargas(R), path.basename(d.archivo))
  try {
    const s = await stat(ruta)
    return { ruta, bytes: s.size, tipo: ruta.endsWith('.m4a') ? 'audio/mp4' : 'video/mp4' }
  } catch { return null }
}

/** Para pruebas y diagnóstico: qué hay en la carpeta (nombres, sin leer contenido). */
export async function carpetaDescargas(): Promise<string[]> {
  const R = raiz()
  return R ? readdir(dirDescargas(R)).catch(() => []) : []
}
