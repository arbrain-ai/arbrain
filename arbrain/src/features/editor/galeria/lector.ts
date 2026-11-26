/**
 * Galería de videos · el lector del disco (Node, sin `server-only` para que las pruebas lo importen). Escanea las carpetas
 * de proyectos del cerebro, cruza con lo que el canal ya publicó y arma la tarjeta y la ficha de cada video.
 *
 * Reglas (de la sala vieja, `sfcast/sala/lib/gallery.js`):
 *   · Leer nunca escribe: ni identidad, ni historial, ni portadas dentro del proyecto. Lo único que la galería escribe es
 *     el borrador del post y las tarjetas que pidió a la bandeja, ambos en `publish.json` (tmp + rename).
 *   · Nunca una ruta del cliente: el id se resuelve contra las raíces y el nombre no trae separadores ni `..`.
 *   · Falta de dato no es cero: lo que no está se dice como hueco.
 */
import { createHash, randomUUID } from 'node:crypto'
import { promises as fsp, type Dirent } from 'node:fs'
import path from 'node:path'
import {
  capitulos, estadoPost, estadoVideo, extraerDescripcion, extraerPost, fechaDeCarpeta, huecosDe, masReciente, ordenar, palabrasDe,
  cotejar, partirId, salidaDe, segmentar, tipoFinal, titulosDe, transcriptDeTexto, youtubeDe, type Evidencia, type Publish,
} from './modelo'
import type { FichaVideo, Final, LecturaGaleria, Solicitud, TarjetaVideo, TranscriptFicha } from './tipos'
import { tarjetaMotor, type ProyectoMotor } from './motor'

/** Raíces del pipeline, relativas al cerebro. `y` = proyectos (sep en adelante); `v` = videos de jul y ago (solo con publish.json). */
export const RAICES = [
  { tipo: 'y' as const, rel: path.join('contenido', 'youtube', 'proyectos'), exigePublish: false },
  { tipo: 'v' as const, rel: path.join('contenido', 'youtube', 'videos'), exigePublish: true },
]
/** Carpetas de laboratorio dentro de proyectos (no son videos): pruebas del motor, prácticas de miniaturas, estándares. */
export const LABORATORIO = /^\d{4}-\d\d-\d\d-(?:test|prueba|lab|estandar)-|-practice$/

/** Un video del canal tal como lo da la analítica (`youtube_videos`, solo lectura). */
export interface VideoCanal { video_id: string; title: string; published_at: string; views: number | null; impressions_ctr?: number | null; avg_view_percentage?: number | null; duration_seconds?: number | null }

const IMG = /\.(png|jpe?g|webp)$/i
const MEDIA = /\.(mp4|mov|webm|m4v)$/i

async function lista(dir: string): Promise<Dirent[]> {
  try { return await fsp.readdir(dir, { withFileTypes: true }) } catch { return [] }
}
const existe = async (p: string) => { try { await fsp.access(p); return true } catch { return false } }
async function json<T>(p: string): Promise<T | null> { try { return JSON.parse(await fsp.readFile(p, 'utf8')) as T } catch { return null } }

/** Una ruta guardada en publish.json o pedida por nombre, solo si queda DENTRO de la carpeta del proyecto. */
export function dentro(dir: string, rel: string): string | null {
  if (typeof rel !== 'string' || !rel || rel.includes('\0') || path.isAbsolute(rel)) return null
  const abs = path.resolve(dir, rel)
  return abs.startsWith(path.resolve(dir) + path.sep) ? abs : null
}

/** id → carpeta absoluta (o null). Solo ids de carpeta (`y/…`, `v/…`). */
export function carpetaDeId(R: string, id: string): { dir: string; rel: string; tipo: 'y' | 'v'; nombre: string } | null {
  const p = partirId(id)
  if (!p || (p.tipo !== 'y' && p.tipo !== 'v')) return null
  const raiz = RAICES.find(r => r.tipo === p.tipo)!
  const rel = path.join(raiz.rel, p.valor)
  return { dir: path.join(R, rel), rel, tipo: p.tipo, nombre: p.valor }
}

// ── miniaturas ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Candidatas: imágenes en thumbs/, thumbnails/ y un nivel de subcarpetas (thumbnails/v2/…). Referencias y `_*` fuera. */
export async function candidatas(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const sub of ['thumbnails', 'thumbs']) {
    for (const e of await lista(path.join(dir, sub))) {
      if (e.isFile() && IMG.test(e.name) && !/^(?:_|ref[-_])/i.test(e.name)) out.push(path.join(sub, e.name))
      else if (e.isDirectory() && !e.name.startsWith('.') && !/^ref/i.test(e.name)) {
        for (const f of await lista(path.join(dir, sub, e.name))) if (f.isFile() && IMG.test(f.name) && !/^(?:_|ref[-_])/i.test(f.name)) out.push(path.join(sub, e.name, f.name))
      }
    }
  }
  return out.sort()
}

/** La elegida por el dueño, resuelta en disco: `thumbnails/v2/x.png` tal cual, o un nombre suelto buscado en thumbs/ y thumbnails/. */
export async function elegidaEnDisco(dir: string, chosen: unknown): Promise<string | null> {
  if (typeof chosen !== 'string' || !chosen.trim()) return null
  const intentos = chosen.includes('/') ? [chosen] : [chosen, path.join('thumbnails', chosen), path.join('thumbs', chosen)]
  for (const rel of intentos) { const abs = dentro(dir, rel); if (abs && IMG.test(abs) && await existe(abs)) return rel }
  return null
}

// ── evidencia de la carpeta ─────────────────────────────────────────────────────────────────────────────────────────

export async function finalesDe(dir: string, id: string): Promise<Final[]> {
  const out: Final[] = []
  for (const sub of ['renders', 'final', 'finales', 'edit', path.join('design', 'out')]) {
    for (const e of await lista(path.join(dir, sub))) {
      if (!e.isFile() || !MEDIA.test(e.name) || e.name.startsWith('_') || e.name.startsWith('.')) continue
      try {
        const st = await fsp.stat(path.join(dir, sub, e.name))
        const rel = path.join(sub, e.name)
        out.push({ nombre: rel, tipo: tipoFinal(e.name), bytes: st.size, modificado: st.mtime.toISOString(), url: `/api/editor/galeria/final?id=${encodeURIComponent(id)}&f=${encodeURIComponent(rel)}` })
      } catch { /* se movió mientras leía */ }
    }
  }
  const orden = { largo: 0, vertical: 1, '720p': 2, otro: 3 }
  return out.sort((a, b) => orden[a.tipo] - orden[b.tipo] || b.modificado.localeCompare(a.modificado))
}

async function evidencia(dir: string, nombres: Set<string>, id: string, enCanal: Evidencia['enCanal']): Promise<Evidencia> {
  const editJson = (await lista(path.join(dir, 'edit'))).some(e => e.isFile() && /^(?:edl|cut|cortes|tramos)/i.test(e.name))
  const disenio = (await lista(path.join(dir, 'design'))).some(e => !e.name.startsWith('.'))
  return {
    hayGrabacion: ['project.json', 'origin.json', 'words_out.json', 'audio', 'motor', 'transcripts', 'edit'].some(n => nombres.has(n)) || [...nombres].some(n => /transcript/i.test(n)),
    hayCorte: editJson || nombres.has('revisions'),
    hayRevision: [...nombres].some(n => /^review|^validation\.json$|^revisions$/i.test(n)),
    hayArte: disenio || [...nombres].some(n => /^GUION-VISUAL/i.test(n)),
    finales: await finalesDe(dir, id),
    enCanal,
  }
}

// ── la tarjeta ──────────────────────────────────────────────────────────────────────────────────────────────────────

interface Leido { vid: string | null; cotejado: boolean; pub: Publish | null; crudo: string | null; nombres: Set<string>; metadata: { titles?: unknown; title_elegido?: number; description?: string } | null; ev: Evidencia; portadaRel: string | null; portadaDe: TarjetaVideo['portada_de']; candidatas: string[]; hayPost: boolean }

async function leer(dir: string, id: string, canal: Map<string, VideoCanal>, cotejado: string | null = null): Promise<Leido> {
  let crudo: string | null = null
  try { crudo = await fsp.readFile(path.join(dir, 'publish.json'), 'utf8') } catch { /* sin publish.json */ }
  let pub: Publish | null = null
  try { pub = crudo ? JSON.parse(crudo) as Publish : null } catch { pub = null }
  const entradas = await lista(dir)
  const nombres = new Set(entradas.map(e => e.name))
  const metadata = (await json<Leido['metadata']>(path.join(dir, 'metadata.json'))) ?? null
  const vid = youtubeDe(pub) ?? cotejado
  const ev = await evidencia(dir, nombres, id, vid && canal.has(vid) ? { published_at: canal.get(vid)!.published_at } : null)
  const cands = await candidatas(dir)
  const elegida = await elegidaEnDisco(dir, pub?.data?.thumbnail?.chosen)
  const portadaRel = elegida ?? cands[0] ?? null
  const portadaDe: TarjetaVideo['portada_de'] = elegida ? 'elegida' : cands[0] ? 'candidata' : vid ? 'youtube' : ev.finales.length ? 'cuadro' : null
  const hayPost = !!pub?.data?.post_draft?.body || entradas.some(e => e.isFile() && /^post-comunidad.*\.md$/i.test(e.name))
  return { vid, cotejado: !youtubeDe(pub) && !!cotejado, pub, crudo, nombres, metadata, ev, portadaRel, portadaDe, candidatas: cands, hayPost }
}

/** `yt` solo cuando la portada es la de YouTube: el servidor la baja una vez a su caché y la sirve desde Arbrain. */
const urlPortada = (id: string, yt?: string | null) => `/api/editor/galeria/portada?id=${encodeURIComponent(id)}${yt ? `&yt=${yt}` : ''}`

function tarjeta(id: string, rel: string, nombre: string, l: Leido, canal: Map<string, VideoCanal>, ahora: Date): TarjetaVideo {
  const { pub, vid } = l
  const enCanal = vid ? canal.get(vid) ?? null : null
  const meta = l.metadata
  const tituloMeta = Array.isArray(meta?.titles) ? (meta!.titles as unknown[])[meta?.title_elegido ?? 0] : null
  const titulo = (pub?.video?.titulo || pub?.data?.launch?.title || pub?.data?.metadata?.title || (typeof tituloMeta === 'string' ? tituloMeta : '') || enCanal?.title || nombre.replace(/^\d{4}-\d\d-\d\d-/, '').replace(/-/g, ' ')).trim()
  const video = estadoVideo(pub, l.ev, ahora)
  const solicitud = pub?.data?.galeria?.aprobar_post ?? null
  const post = estadoPost(pub, video, l.hayPost, solicitud)
  const salida = salidaDe(pub)
  return {
    id, origen: 'proyecto', carpeta: rel, titulo,
    fecha: enCanal?.published_at ?? salida?.toISOString() ?? fechaDeCarpeta(nombre),
    youtube_id: vid, portada: l.portadaDe ? urlPortada(id, l.portadaDe === 'youtube' ? vid : null) : null, portada_de: l.portadaDe,
    video, post, huecos: [], vistas: enCanal?.views ?? null, duracion: enCanal?.duration_seconds ?? null,
  }
}

/** Todas las carpetas del pipeline, con la evidencia mínima para su tarjeta. Las que no guardaron su id de YouTube se cotejan
 *  con el canal (título y fecha) después de que las demás reclamaron el suyo. */
export async function leerProyectos(R: string, canal: Map<string, VideoCanal>, ahora = new Date()): Promise<{ tarjetas: TarjetaVideo[]; laboratorio: number }> {
  const leidas: { id: string; rel: string; nombre: string; dir: string; l: Leido }[] = []
  let laboratorio = 0
  for (const raiz of RAICES) {
    const base = path.join(R, raiz.rel)
    const dirs = (await lista(base)).filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_') && /^[\w.-]+$/.test(e.name))
    await Promise.all(dirs.map(async e => {
      if (LABORATORIO.test(e.name)) { laboratorio++; return }
      const dir = path.join(base, e.name)
      if (raiz.exigePublish && !(await existe(path.join(dir, 'publish.json')))) return
      const id = `${raiz.tipo}/${e.name}`
      leidas.push({ id, rel: path.join(raiz.rel, e.name), nombre: e.name, dir, l: await leer(dir, id, canal) })
    }))
  }
  const reclamados = new Set(leidas.map(x => x.l.vid).filter((x): x is string => !!x))
  const lista_canal = [...canal.values()]
  for (const x of leidas.filter(x => !x.l.vid).sort((a, b) => b.nombre.localeCompare(a.nombre))) {
    const v = cotejar(x.nombre, lista_canal, reclamados)
    if (v) { reclamados.add(v.video_id); x.l = await leer(x.dir, x.id, canal, v.video_id) }
  }
  const tarjetas = leidas.map(x => { const t = tarjeta(x.id, x.rel, x.nombre, x.l, canal, ahora); t.huecos = huecosRapidos(x.l, t); return t })
  return { tarjetas, laboratorio }
}

/** Los huecos de la tarjeta sin leer el transcript (eso es de la ficha): basta con saber si hay archivo. */
function huecosRapidos(l: Leido, t: TarjetaVideo) {
  const d = l.pub?.data
  const desc = d?.metadata?.description || l.metadata?.description || [...l.nombres].some(n => /^descripcion.*\.txt$/i.test(n))
  return huecosDe({
    titulos: titulosDe(l.pub).length ? [1] : [], descripcion: desc || null, capitulos: typeof d?.metadata?.description === 'string' ? capitulos(d.metadata.description) : desc ? [1] : [],
    link: d?.link?.url ? d.link : null, transcript: l.ev.hayGrabacion || [...l.nombres].some(n => /transcript/i.test(n)) ? 1 : null,
    borrador: { cuerpo: l.hayPost ? 'x' : '' }, portada: t.portada, salida: { video: salidaDe(l.pub)?.toISOString() ?? null }, finales: l.ev.finales, video: t.video, origen: t.origen,
  })
}

/** Los videos del canal sin carpeta de proyecto: entran como publicados, con lo que la analítica sabe. Solo largos. */
export function tarjetasDelCanal(canal: VideoCanal[], yaVistos: Set<string>): TarjetaVideo[] {
  return canal.filter(v => !yaVistos.has(v.video_id) && (v.duration_seconds ?? 999) > 180).map(v => {
    const id = `c/${v.video_id}`
    const video = { clave: 'publicado' as const, etiqueta: `Publicado · ${new Date(v.published_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Mexico_City' })}`, tono: 'live' as const, cuando: v.published_at }
    return {
      id, origen: 'canal' as const, carpeta: null, titulo: v.title, fecha: v.published_at, youtube_id: v.video_id,
      portada: urlPortada(id), portada_de: 'youtube' as const, video, post: { clave: 'sin-registro' as const, etiqueta: 'Post sin registro', tono: 'idle' as const },
      huecos: ['descripcion', 'transcript', 'link'] as TarjetaVideo['huecos'], vistas: v.views ?? null, duracion: v.duration_seconds ?? null,
    }
  })
}

export async function leerGaleria(R: string | null, canal: VideoCanal[] | null, ahora = new Date(), motor: ProyectoMotor[] | null | undefined = undefined): Promise<LecturaGaleria> {
  const avisos: string[] = []
  if (!R) return { videos: [], leido: ahora.toISOString(), avisos: ['No encontré la carpeta del cerebro en esta máquina.'], fuentes: { proyectos: 0, canal: canal?.length ?? null, motor: null } }
  if (!canal) avisos.push('Sin lectura del canal: los publicados sin carpeta no aparecen y el estado «Publicado» sale solo de publish.json.')
  const porId = new Map((canal ?? []).map(v => [v.video_id, v]))
  const { tarjetas, laboratorio } = await leerProyectos(R, porId, ahora)
  const vistos = new Set(tarjetas.map(t => t.youtube_id).filter((x): x is string => !!x))
  const delCanal = tarjetasDelCanal(canal ?? [], vistos)
  if (laboratorio) avisos.push(`${laboratorio} carpetas de laboratorio (pruebas, prácticas) quedan fuera.`)
  if (motor === null) avisos.push('El motor de edición no respondió: sus proyectos no aparecen ahora.')
  const delMotor = (motor ?? []).map(tarjetaMotor)
  return { videos: ordenar([...tarjetas, ...delCanal, ...delMotor]), leido: ahora.toISOString(), avisos, fuentes: { proyectos: tarjetas.length, canal: canal ? delCanal.length : null, motor: motor ? delMotor.length : null } }
}

// ── la ficha ────────────────────────────────────────────────────────────────────────────────────────────────────────

async function descripcionDe(dir: string, l: Leido): Promise<{ texto: string; fuente: string } | null> {
  const md = l.pub?.data?.metadata
  if (typeof md?.description === 'string' && md.description.trim()) return { texto: md.description, fuente: 'publish.json' }
  const archivos = await Promise.all([...l.nombres].filter(n => /^descripcion.*\.txt$/i.test(n)).map(async nombre => ({ nombre, mtime: (await fsp.stat(path.join(dir, nombre)).catch(() => null))?.mtimeMs ?? 0 })))
  const f = masReciente(archivos)
  if (f) { const t = extraerDescripcion(await fsp.readFile(path.join(dir, f.nombre), 'utf8')); if (t) return { texto: t, fuente: f.nombre } }
  if (typeof l.metadata?.description === 'string' && l.metadata.description.trim()) return { texto: l.metadata.description, fuente: 'metadata.json' }
  return null
}

async function postDe(dir: string, l: Leido): Promise<{ cuerpo: string; fuente: string | null }> {
  const pd = l.pub?.data?.post_draft
  if (pd?.body?.trim()) return { cuerpo: pd.body, fuente: pd.source ? `publish.json (de ${pd.source})` : 'publish.json' }
  const archivos = await Promise.all([...l.nombres].filter(n => /^post-comunidad.*\.md$/i.test(n)).map(async nombre => ({ nombre, mtime: (await fsp.stat(path.join(dir, nombre)).catch(() => null))?.mtimeMs ?? 0 })))
  const f = masReciente(archivos)
  if (!f) return { cuerpo: '', fuente: null }
  return { cuerpo: extraerPost(await fsp.readFile(path.join(dir, f.nombre), 'utf8')), fuente: f.nombre }
}

/**
 * El transcript en el mejor formato que haya: el del corte final (`words_out.json`, tiempos de salida) gana; luego el
 * palabra a palabra de la toma (`edit/transcripts/*.json`, `edit/tx_verbatim.json`…), y al final los .txt con tiempos.
 */
export async function transcriptDe(dir: string): Promise<TranscriptFicha | null> {
  const candidatosJson: { rel: string; corte: TranscriptFicha['corte'] }[] = [{ rel: 'words_out.json', corte: 'final' }]
  for (const sub of ['edit/transcripts', 'transcripts']) for (const e of await lista(path.join(dir, sub))) if (e.isFile() && e.name.endsWith('.json')) candidatosJson.push({ rel: path.join(sub, e.name), corte: 'crudo' })
  for (const n of ['edit/tx_verbatim.json', 'edit/verbatim.json', 'edit/transcript.json', 'edit/tx_source.json', 'edit/words-source.json']) candidatosJson.push({ rel: n, corte: 'crudo' })
  for (const c of candidatosJson) {
    const j = await json<unknown>(path.join(dir, c.rel))
    if (!j) continue
    const { palabras, segmentos } = palabrasDe(j)
    if (palabras.length > 10) return { fuente: c.rel, corte: c.corte, segmentos: segmentar(palabras), palabras: palabras.length }
    if (segmentos.length > 3) return { fuente: c.rel, corte: c.corte, segmentos, palabras: segmentos.reduce((n, s) => n + s.texto.split(/\s+/).length, 0) }
  }
  for (const sub of ['transcripts', 'transcript', '.']) {
    for (const e of await lista(path.join(dir, sub))) {
      if (!e.isFile() || !/transcript.*\.txt$/i.test(e.name)) continue
      const rel = path.join(sub, e.name)
      const segs = transcriptDeTexto(await fsp.readFile(path.join(dir, rel), 'utf8'))
      if (segs.length > 3 || (segs.length && /intro/i.test(e.name))) return { fuente: rel.replace(/^\.\//, ''), corte: 'texto', segmentos: segs, palabras: segs.reduce((n, s) => n + s.texto.split(/\s+/).length, 0) }
    }
  }
  return null
}

export async function leerFicha(R: string, id: string, canal: VideoCanal[] | null, ahora = new Date(), transcriptCanal?: (vid: string) => Promise<TranscriptFicha | null>): Promise<FichaVideo | null> {
  const porId = new Map((canal ?? []).map(v => [v.video_id, v]))
  const p = partirId(id)
  if (p?.tipo === 'c') {
    const v = porId.get(p.valor)
    if (!v) return null
    const t = tarjetasDelCanal([v], new Set())[0] ?? { ...tarjetasDelCanal([{ ...v, duration_seconds: 999 }], new Set())[0] }
    const transcript = transcriptCanal ? await transcriptCanal(v.video_id) : null
    const ficha: FichaVideo = {
      ...t, revision: null, candidatas: [], titulos: [{ texto: v.title, elegido: true }], descripcion: null, capitulos: [], palabras_clave: [], link: null, transcript,
      borrador: { cuerpo: '', fuente: null, editable: false, aprobado: null, publicado: null, solicitud: null },
      salida: { video: v.published_at, post: null, post_min: 5, programar: null }, finales: [],
      metricas: { vistas: v.views ?? null, ctr: v.impressions_ctr ?? null, retencion: v.avg_view_percentage ?? null, leido: ahora.toISOString() },
      avisos: ['Este video no tiene carpeta de proyecto: la ficha sale de la analítica del canal.'],
    }
    ficha.huecos = huecosDe(ficha)
    return ficha
  }
  if (p?.tipo === 'm') return null // la ficha del motor la arma `fichaMotor` (necesita su lista)
  const c = carpetaDeId(R, id)
  if (!c || !(await existe(c.dir))) return null
  let l = await leer(c.dir, id, porId)
  if (!l.vid && porId.size) {
    // El mismo cotejo que la rejilla: se reconstruye con todas las carpetas para no ligar un video que ya es de otra.
    const { tarjetas } = await leerProyectos(R, porId, ahora)
    const vid = tarjetas.find(x => x.id === id)?.youtube_id
    if (vid) l = await leer(c.dir, id, porId, vid)
  }
  const t = tarjeta(id, c.rel, c.nombre, l, porId, ahora)
  const d = l.pub?.data
  const descripcion = await descripcionDe(c.dir, l)
  const post = await postDe(c.dir, l)
  const salida = salidaDe(l.pub)
  const postMin = d?.launch?.post_delay_min ?? 5
  const enCanal = t.youtube_id ? porId.get(t.youtube_id) ?? null : null
  const meta = l.metadata
  const titulos = titulosDe(l.pub, Array.isArray(meta?.titles) ? (meta!.titles as unknown[]).filter((x): x is string => typeof x === 'string') : [])
  if (!titulos.some(x => x.elegido) && titulos.length && Array.isArray(meta?.titles)) {
    const elegido = (meta!.titles as unknown[])[meta?.title_elegido ?? -1]
    for (const x of titulos) if (x.texto === elegido) x.elegido = true
  }
  const elegida = await elegidaEnDisco(c.dir, d?.thumbnail?.chosen)
  const avisos: string[] = []
  if (typeof d?.thumbnail?.chosen === 'string' && !elegida) avisos.push(`La portada elegida (${d.thumbnail.chosen}) no está en esta máquina${t.youtube_id ? ': muestro la de YouTube' : ''}.`)
  if (l.cotejado) avisos.push('La carpeta no guardó su id de YouTube: la ligué al video del canal por título y fecha.')
  if (l.crudo && !l.pub) avisos.push('publish.json ilegible: la ficha sale de los archivos de la carpeta.')
  const ficha: FichaVideo = {
    ...t,
    revision: l.crudo ? createHash('sha256').update(l.crudo).digest('hex') : null,
    candidatas: l.candidatas.map(n => ({ nombre: n, url: `${urlPortada(id)}&f=${encodeURIComponent(n)}`, elegida: n === elegida })),
    titulos, descripcion, capitulos: descripcion ? capitulos(descripcion.texto) : [],
    palabras_clave: Array.isArray(d?.metadata?.keywords) ? (d!.metadata!.keywords as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    link: d?.link?.url ? { url: d.link.url, verificado: !!d.link.verified, estado: d.link.status ?? null, destino: d.link.redirect ?? null } : null,
    transcript: (await transcriptDe(c.dir)) ?? (t.youtube_id && transcriptCanal ? await transcriptCanal(t.youtube_id) : null),
    borrador: { cuerpo: post.cuerpo, fuente: post.fuente, editable: !!l.pub, aprobado: d?.post_draft?.approved_at ?? null, publicado: d?.post_published_at ?? null, solicitud: d?.galeria?.aprobar_post ?? null },
    salida: { video: enCanal?.published_at ?? salida?.toISOString() ?? null, post: d?.post_published_at ?? (salida ? new Date(salida.getTime() + postMin * 60e3).toISOString() : null), post_min: postMin, programar: d?.galeria?.programar ?? null },
    finales: l.ev.finales,
    metricas: enCanal ? { vistas: enCanal.views ?? null, ctr: enCanal.impressions_ctr ?? null, retencion: enCanal.avg_view_percentage ?? null, leido: ahora.toISOString() } : null,
    avisos,
  }
  ficha.huecos = huecosDe(ficha)
  return ficha
}

// ── escritura (solo publish.json, solo campos conocidos) ────────────────────────────────────────────────────────────

async function guardarPublish(dir: string, pub: Publish) {
  const destino = path.join(dir, 'publish.json')
  const tmp = `${destino}.${randomUUID()}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(pub, null, 2) + '\n', { flag: 'wx' })
  await fsp.rename(tmp, destino)
}

async function conPublish(R: string, id: string, revision: string | null | undefined, cambio: (pub: Publish, ahora: string) => string | null): Promise<{ cambios: string[]; revision: string }> {
  const c = carpetaDeId(R, id)
  if (!c) throw new Error('Video inválido.')
  let crudo: string
  try { crudo = await fsp.readFile(path.join(c.dir, 'publish.json'), 'utf8') } catch { throw new Error('Este video no tiene publish.json: pídele a Levy que arme su paquete de publicación.') }
  const actual = createHash('sha256').update(crudo).digest('hex')
  if (revision && revision !== actual) throw new Error('La ficha cambió desde que la abriste (otra mano la tocó): recarga antes de guardar.')
  const pub = JSON.parse(crudo) as Publish
  pub.data ??= {}
  const ahora = new Date().toISOString()
  const msg = cambio(pub, ahora)
  if (!msg) return { cambios: [], revision: actual }
  ;(pub.log ??= []).push({ ts: ahora, msg: `galería · ${msg}` })
  await guardarPublish(c.dir, pub)
  return { cambios: [msg], revision: createHash('sha256').update(JSON.stringify(pub, null, 2) + '\n').digest('hex') }
}

/** Editar el texto REVOCA la aprobación y la tarjeta pendiente: nadie aprueba a ciegas un texto que cambió. */
export function escribirBorrador(R: string, id: string, cuerpo: string, revision?: string | null) {
  return conPublish(R, id, revision, (pub, ahora) => {
    const pd = pub.data!.post_draft ?? {}
    if (pd.body === cuerpo) return null
    pd.body = cuerpo.slice(0, 20000); pd.updated_at = ahora; pd.source ??= 'galería'
    const revocada = !!pd.approved_at || !!pub.data!.galeria?.aprobar_post
    pd.approved_at = null
    if (pub.data!.galeria) delete pub.data!.galeria.aprobar_post
    pub.data!.post_draft = pd
    return revocada ? 'post editado (aprobación retirada: el texto cambió)' : 'post editado'
  })
}

/** Guarda la tarjeta que se subió a la bandeja (aprobar el post o programar), para leer después la respuesta del dueño. */
export function guardarSolicitud(R: string, id: string, tipo: 'aprobar_post' | 'programar', s: Solicitud, revision?: string | null) {
  return conPublish(R, id, revision, pub => {
    pub.data!.galeria = { ...(pub.data!.galeria ?? {}), [tipo]: s }
    return tipo === 'aprobar_post' ? `aprobación del post en la bandeja (${s.id})` : `programar en la bandeja (${s.id}${s.para ? ` · ${s.para}` : ''})`
  })
}

/** La respuesta del dueño en la bandeja vuelve al proyecto: un Sí al post lo deja aprobado (no publicado). */
export function reflejarRespuesta(R: string, id: string, tipo: 'aprobar_post' | 'programar', estado: Solicitud['estado'], comentario?: string | null) {
  return conPublish(R, id, null, (pub, ahora) => {
    const s = pub.data!.galeria?.[tipo]
    if (!s || s.estado === estado) return null
    s.estado = estado; s.comentario = comentario ?? null
    if (tipo === 'aprobar_post' && estado === 'si' && pub.data!.post_draft?.body) { pub.data!.post_draft.approved_at = ahora; return 'post APROBADO por el dueño en la bandeja' }
    return `${tipo === 'programar' ? 'programar' : 'post'}: el dueño respondió «${estado}» en la bandeja`
  })
}

/** La ficha de un proyecto del motor: lo que el motor sabe hoy (nombre, material, cambios por revisar) y los huecos. */
export function fichaMotor(p: ProyectoMotor, ahora = new Date()): FichaVideo {
  const t = tarjetaMotor(p)
  const f: FichaVideo = {
    ...t, revision: null, candidatas: [], titulos: [], descripcion: null, capitulos: [], palabras_clave: [], link: null, transcript: null,
    borrador: { cuerpo: '', fuente: null, editable: false, aprobado: null, publicado: null, solicitud: null },
    salida: { video: null, post: null, post_min: 5, programar: null }, finales: [], metricas: null,
    avisos: [`Proyecto del motor de edición (${p.mediaCount ?? 0} ${p.mediaCount === 1 ? 'archivo' : 'archivos'}${p.duration ? `, ${Math.round(p.duration / 60)} min` : ''}). El transcript y los cortes se ven en el editor; la ficha de publicación nace cuando Levy le arme su carpeta.`],
  }
  f.huecos = huecosDe(f)
  void ahora
  return f
}
