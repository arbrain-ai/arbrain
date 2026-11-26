/**
 * Galería de videos · el modelo puro (sin red, sin disco, sin DOM): estados, capítulos, descripción, post, transcript y
 * los pedidos a Levy. Portado de la sala vieja del dueño (`sfcast/sala/lib/gallery.js`, 26 jul) con sus reglas:
 *   · `publish.json` es la fuente de verdad del lanzamiento; esto lo lee, no inventa un modelo paralelo.
 *   · Honestidad antes que relleno: si un dato no está, el estado lo dice; nunca se inventa.
 *   · Las fechas sin zona del pipeline son hora de Ciudad de México, nunca la de la máquina.
 */
import type { Estado, EtapaPost, EtapaVideo, Final, Pieza, Segmento, Solicitud } from './tipos'

// ── publish.json: la forma que ya existe (tolerante: hay proyectos de jul, ago y sep con variantes) ────────────────────

export interface Publish {
  video?: { slug?: string; titulo?: string; titulos?: unknown; youtube_id?: string; url?: string; youtube_url?: string; publicar?: string; capitulos?: unknown }
  stages?: Record<string, { status?: string; updated_at?: string | null; evidence?: string } | undefined>
  log?: { ts?: string; msg?: string }[]
  data?: {
    metadata?: { title?: string; titles?: unknown; description?: string; keywords?: unknown; summary?: string }
    thumbnail?: { chosen?: string | null }
    link?: { url?: string; verified?: boolean; status?: number; redirect?: string }
    post_draft?: { title?: string; body?: string; source?: string; updated_at?: string; approved_at?: string | null; video_url?: string | null }
    post_published_at?: string | null
    launch?: { video_id?: string; publish_at?: string; publishAt_utc?: string; title?: string; post_delay_min?: number; post_status?: string }
    youtube?: { video_id?: string; observation?: { video_id?: string; privacy_status?: string; checked_at?: string } }
    /** Lo que la galería pidió a la bandeja (no publica: solo guarda la tarjeta para leer su respuesta). */
    galeria?: { aprobar_post?: Solicitud; programar?: Solicitud }
  } & Record<string, unknown>
}

const textos = (x: unknown): string[] => Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string' && !!t.trim()).map(t => t.trim()) : []

/** Lo que el proyecto sabe de su disco, ya medido por el lector. */
export interface Evidencia {
  hayGrabacion: boolean
  hayCorte: boolean
  hayRevision: boolean
  hayArte: boolean
  finales: Final[]
  /** El canal (tabla de analítica) lo tiene como publicado. */
  enCanal: { published_at: string } | null
}

// ── fechas ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** «2026-09-02 17:00» (hora de CDMX, como la deja el pipeline) o ISO con zona → Date. */
export function fechaCdmx(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim()
  const sinZona = /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d)?$/.test(s)
  const d = new Date(sinZona ? s.replace(' ', 'T') + '-06:00' : s)
  return Number.isFinite(d.getTime()) ? d : null
}

/** La fecha que trae el nombre de la carpeta (`2026-09-22-opus-5-5`), a mediodía de CDMX. */
export function fechaDeCarpeta(nombre: string): string | null {
  const m = /^(\d{4}-\d\d-\d\d)/.exec(nombre)
  return m ? new Date(`${m[1]}T12:00:00-06:00`).toISOString() : null
}

export function cuandoCorto(d: Date | string | null | undefined): string {
  const x = typeof d === 'string' ? new Date(d) : d
  if (!x || !Number.isFinite(x.getTime())) return ''
  return x.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
}

export const salidaDe = (pub: Publish | null): Date | null => fechaCdmx(pub?.data?.launch?.publishAt_utc) ?? fechaCdmx(pub?.data?.launch?.publish_at)

// ── identidad y YouTube ──────────────────────────────────────────────────────────────────────────────────────────────

const YT = /^[\w-]{11}$/
export const idYoutubeValido = (v: unknown): v is string => typeof v === 'string' && YT.test(v)

export function youtubeDe(pub: Publish | null): string | null {
  const directos = [pub?.data?.launch?.video_id, pub?.data?.youtube?.video_id, pub?.video?.youtube_id]
  for (const d of directos) if (idYoutubeValido(d)) return d
  for (const url of [pub?.video?.url, pub?.video?.youtube_url, pub?.data?.post_draft?.video_url]) {
    const m = /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/.exec(String(url ?? ''))
    if (m) return m[1]
  }
  return null
}

/** Ids de la galería: `y/<carpeta>` (proyectos), `v/<carpeta>` (videos de jul–ago), `c/<id de YouTube>`, `m/<motor>`. */
const ID = /^(y|v|c|m|p)\/([\w.-]{1,160})$/
export function partirId(id: unknown): { tipo: 'y' | 'v' | 'c' | 'm' | 'p'; valor: string } | null {
  const m = typeof id === 'string' ? ID.exec(id) : null
  if (!m || m[2] === '.' || m[2] === '..' || m[2].includes('..')) return null
  return { tipo: m[1] as 'y' | 'v' | 'c' | 'm' | 'p', valor: m[2] }
}

// ── estados ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const hecho = (pub: Publish | null, etapa: string) => pub?.stages?.[etapa]?.status === 'done'

export function estadoVideo(pub: Publish | null, ev: Evidencia, ahora = new Date()): Estado<EtapaVideo> {
  const obs = pub?.data?.youtube?.observation
  const vid = youtubeDe(pub)
  if (ev.enCanal) return { clave: 'publicado', etiqueta: `Publicado · ${cuandoCorto(ev.enCanal.published_at)}`, tono: 'live', cuando: ev.enCanal.published_at }
  if (vid && obs?.video_id === vid && obs.privacy_status === 'public') return { clave: 'publicado', etiqueta: 'Publicado · verificado en YouTube', tono: 'live', cuando: obs.checked_at ?? null }
  const at = salidaDe(pub)
  if (at) {
    if (at.getTime() > ahora.getTime()) return { clave: 'programado', etiqueta: `Programado · ${cuandoCorto(at)}`, tono: 'wait', cuando: at.toISOString() }
    if (hecho(pub, 'published')) return { clave: 'publicado', etiqueta: `Publicado · ${cuandoCorto(at)}`, tono: 'live', cuando: at.toISOString() }
    return { clave: 'por-verificar', etiqueta: `Salía ${cuandoCorto(at)} · sin verificar`, tono: 'wait', cuando: at.toISOString() }
  }
  if (hecho(pub, 'published')) return { clave: 'publicado', etiqueta: 'Publicado', tono: 'live' }
  if (ev.finales.length || hecho(pub, 'upload')) return { clave: 'exportado', etiqueta: hecho(pub, 'upload') ? 'Subido · sin programar' : 'Exportado', tono: 'ok' }
  if (ev.hayArte) return { clave: 'arte', etiqueta: 'Arte', tono: 'wait' }
  if (ev.hayRevision) return { clave: 'revisar', etiqueta: 'Para revisar', tono: 'wait' }
  if (ev.hayCorte) return { clave: 'cortando', etiqueta: 'Cortando', tono: 'wait' }
  if (ev.hayGrabacion) return { clave: 'grabado', etiqueta: 'Grabado', tono: 'idle' }
  return { clave: 'guion', etiqueta: 'Sin grabar', tono: 'idle' }
}

/** El post: dos ejes que no se mezclan con el video. `hayBorrador` cuenta el .md de trabajo aunque publish.json no lo tenga. */
export function estadoPost(pub: Publish | null, video: Estado<EtapaVideo>, hayBorrador: boolean, solicitud: Solicitud | null = null): Estado<EtapaPost> {
  const d = pub?.data
  if (d?.post_published_at) return { clave: 'publicado', etiqueta: `Post publicado · ${cuandoCorto(d.post_published_at)}`, tono: 'live', cuando: d.post_published_at }
  if (!pub && video.clave === 'publicado') return { clave: 'sin-registro', etiqueta: 'Post sin registro', tono: 'idle' }
  // El dueño lo publicó a mano (jul): no hay registro de cuándo; no se dice «pendiente» de algo que quizá ya salió.
  if (/^manual-por-/.test(d?.launch?.post_status ?? '')) return { clave: 'sin-registro', etiqueta: 'Post a mano · sin registro', tono: 'idle' }
  if (d?.post_draft?.approved_at) return { clave: 'aprobado', etiqueta: 'Post aprobado · listo para salir', tono: 'ok', cuando: d.post_draft.approved_at }
  if (solicitud && (solicitud.estado === 'pendiente' || solicitud.estado === 'si')) return { clave: 'en-bandeja', etiqueta: solicitud.estado === 'si' ? 'Post aprobado en tu bandeja' : 'Post en tu bandeja', tono: solicitud.estado === 'si' ? 'ok' : 'wait' }
  if (video.clave === 'publicado') return { clave: 'pendiente', etiqueta: hayBorrador || d?.post_draft?.body ? 'Post pendiente · hay borrador' : 'Post pendiente', tono: 'wait' }
  if (d?.post_draft?.body || hayBorrador) return { clave: 'borrador', etiqueta: 'Post en borrador', tono: 'wait' }
  return { clave: 'sin-post', etiqueta: 'Sin post', tono: 'idle' }
}

// ── títulos, descripción y capítulos ─────────────────────────────────────────────────────────────────────────────────

export function titulosDe(pub: Publish | null, extra: string[] = []): { texto: string; elegido: boolean }[] {
  const elegido = (pub?.video?.titulo || pub?.data?.launch?.title || pub?.data?.metadata?.title || '').trim()
  const todos = [elegido, ...textos(pub?.video?.titulos), ...textos(pub?.data?.metadata?.titles), ...extra].filter(Boolean)
  const vistos = new Set<string>()
  return todos.filter(t => { const k = t.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true })
    .map(t => ({ texto: t, elegido: !!elegido && t === elegido }))
}

/** El bloque publicable de un DESCRIPCION-*.txt de trabajo: lo que va entre las líneas de `===` tras «DESCRIPCIÓN». */
export function extraerDescripcion(txt: string): string {
  const m = /DESCRIPCI[ÓO]N[^\n]*\n=+\n([\s\S]*?)(?:\n=+\n|$)/i.exec(txt)
  return (m ? m[1] : txt).trim()
}

/** Capítulos de una descripción de YouTube: líneas `MM:SS título` o `H:MM:SS título` (con guion o punto opcional). */
export function capitulos(desc: string): { t: number; titulo: string }[] {
  const out: { t: number; titulo: string }[] = []
  for (const linea of String(desc || '').split('\n')) {
    const m = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—·.]?\s+(.+)$/.exec(linea)
    if (!m) continue
    out.push({ t: (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + +m[3], titulo: m[4].trim() })
  }
  // YouTube exige que el primero empiece en 0:00; si no, no son capítulos sino minutos sueltos citados en el texto.
  return out.length >= 2 && out[0].t === 0 ? out : []
}

// ── el post de comunidad ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Cuerpo publicable de un post-comunidad*.md: la sección «## El post» hasta el siguiente `---` + `##`, sin las notas en
 * blockquote (son para Levy). Por índices y no con un regex con `\Z` (en JS es una Z literal: la sala vieja publicaba el
 * archivo entero por eso).
 */
export function extraerPost(md: string): string {
  const cabeza = /^##\s+El post\s*$/m.exec(md)
  let cuerpo = md
  if (cabeza) {
    cuerpo = md.slice(cabeza.index + cabeza[0].length)
    const fin = /^---\s*$\n+^##\s/m.exec(cuerpo)
    if (fin) cuerpo = cuerpo.slice(0, fin.index)
  }
  return cuerpo.split('\n').filter(l => !/^>\s/.test(l)).join('\n').trim()
}

/** El más reciente gana (`post-comunidad-v4.md` sobre `post-comunidad.md`): por fecha de modificación, luego por nombre. */
export function masReciente<T extends { nombre: string; mtime: number }>(xs: T[]): T | null {
  return [...xs].sort((a, b) => b.mtime - a.mtime || b.nombre.localeCompare(a.nombre))[0] ?? null
}

// ── transcript ───────────────────────────────────────────────────────────────────────────────────────────────────────

interface Palabra { text?: string; word?: string; start?: number; end?: number; type?: string }

/** Palabras de cualquiera de los JSON del pipeline: `[…]`, `{ words: […] }` o `{ segments: [{ start, text }] }`. */
export function palabrasDe(json: unknown): { palabras: { texto: string; t: number }[]; segmentos: Segmento[] } {
  const raiz = json as { words?: unknown; segments?: unknown } | unknown[] | null
  const lista = Array.isArray(raiz) ? raiz : Array.isArray((raiz as { words?: unknown })?.words) ? (raiz as { words: unknown[] }).words : null
  if (lista) {
    const palabras = (lista as Palabra[]).filter(w => w && (w.type == null || w.type === 'word') && typeof (w.text ?? w.word) === 'string' && Number.isFinite(w.start))
      .map(w => ({ texto: String(w.text ?? w.word).trim(), t: Number(w.start) })).filter(w => w.texto)
    return { palabras, segmentos: [] }
  }
  const segs = (raiz as { segments?: unknown })?.segments
  if (Array.isArray(segs)) return { palabras: [], segmentos: (segs as { start?: number; text?: string }[]).filter(s => Number.isFinite(s?.start) && typeof s?.text === 'string').map(s => ({ t: Number(s.start), texto: String(s.text).trim() })) }
  return { palabras: [], segmentos: [] }
}

/** Palabras → renglones legibles: corta al cerrar frase pasados ~4 s, o a los 10 s, o ante un silencio de 1.5 s. */
export function segmentar(palabras: { texto: string; t: number }[]): Segmento[] {
  const out: Segmento[] = []
  let actual: { t: number; xs: string[]; ultimo: number } | null = null
  for (const p of palabras) {
    if (actual && (p.t - actual.t > 10 || p.t - actual.ultimo > 1.5 || (p.t - actual.t > 4 && /[.?!…]$/.test(actual.xs[actual.xs.length - 1] ?? '')))) {
      out.push({ t: actual.t, texto: actual.xs.join(' ') }); actual = null
    }
    if (!actual) actual = { t: p.t, xs: [], ultimo: p.t }
    actual.xs.push(p.texto); actual.ultimo = p.t
  }
  if (actual) out.push({ t: actual.t, texto: actual.xs.join(' ') })
  return out.map(s => ({ t: Math.round(s.t * 10) / 10, texto: s.texto }))
}

/** `[00:12.34] texto`, `[1:02:03] texto` o `0.000–44.033 | take | …` seguido del texto en el renglón siguiente. */
export function transcriptDeTexto(txt: string): Segmento[] {
  const out: Segmento[] = []
  const lineas = String(txt).split('\n')
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]
    const a = /^\s*\[(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?\]\s*(.+)$/.exec(l)
    if (a) {
      const [, x, y, z, frac, texto] = a
      const t = z !== undefined ? +x * 3600 + +y * 60 + +z : +x * 60 + +y + (frac ? +`0.${frac}` : 0)
      out.push({ t: Math.round(t * 10) / 10, texto: texto.trim() }); continue
    }
    const b = /^\s*(\d+(?:\.\d+)?)\s*[–-]\s*\d+(?:\.\d+)?\s*\|/.exec(l)
    if (b && lineas[i + 1]?.trim()) { out.push({ t: Math.round(+b[1] * 10) / 10, texto: lineas[i + 1].trim() }); i++ }
  }
  return out
}

export function buscarEnTranscript(segs: Segmento[], q: string): number[] {
  const n = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const k = n(q.trim())
  if (!k) return []
  return segs.flatMap((s, i) => n(s.texto).includes(k) ? [i] : [])
}

export function reloj(seg: number): string {
  const s = Math.max(0, Math.floor(seg))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`
}

// ── finales ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export function tipoFinal(nombre: string): Final['tipo'] {
  const n = nombre.toLowerCase()
  if (/vertical|9x16|9-16|short|reel|corto/.test(n)) return 'vertical'
  if (/720/.test(n)) return '720p'
  if (/final|master|máster|largo|1080|export|v\d/.test(n)) return 'largo'
  return 'otro'
}

// ── huecos y pedidos a Levy ──────────────────────────────────────────────────────────────────────────────────────────

export const NOMBRE_PIEZA: Record<Pieza, string> = {
  titulos: 'Títulos', descripcion: 'Descripción', capitulos: 'Capítulos', link: 'Link /go/', transcript: 'Transcript',
  post: 'Post de comunidad', miniatura: 'Miniatura', fecha: 'Fecha de salida', finales: 'Finales',
}

const QUE_PEDIR: Record<Pieza, string> = {
  titulos: 'propón 5 títulos (con su patrón y por qué) y deja el elegido sin marcar para que yo escoja',
  descripcion: 'escribe la descripción completa de YouTube con sus capítulos desde el transcript del corte final',
  capitulos: 'saca los capítulos (0:00 primero) del transcript del corte final y agrégalos a la descripción',
  link: 'arma el link /go/ del video y verifícalo (que redirija bien)',
  transcript: 'trae el transcript del corte final (Qwen local verbatim; si ya está en YouTube, el de YouTube)',
  post: 'escribe el borrador del post de comunidad en mi voz (la referencia de mi voz de arquitectura-marketing, cierre con pregunta binaria)',
  miniatura: 'propón miniaturas candidatas siguiendo youtube-os; primero platícame la idea antes de generar',
  fecha: 'propón la fecha y hora de salida según mi cola de publicación',
  finales: 'dime qué falta para exportar el largo, los 3 cortos verticales y el 720p',
}

/** El texto que viaja al chat. Dice dónde guardar y repite el freno: generar no es publicar. */
export function pedidoALevy(pieza: Pieza, v: { titulo: string; carpeta: string | null; youtube_id: string | null }): string {
  const donde = v.carpeta ? `Proyecto: ${v.carpeta}${v.carpeta.includes('proyectos/') ? ' (guárdalo en su publish.json)' : ''}.` : v.youtube_id ? `Video del canal ${v.youtube_id}, sin carpeta de proyecto: créala en contenido/youtube/proyectos/ si hace falta.` : ''
  return `Galería de videos · «${v.titulo}»: ${QUE_PEDIR[pieza]}. ${donde} Es para la ficha: no publiques ni postees nada; lo que salga a YouTube o a la comunidad va a mi bandeja.`.replace(/\s+/g, ' ').trim()
}

export function huecosDe(f: { titulos: unknown[]; descripcion: unknown; capitulos: unknown[]; link: unknown; transcript: unknown; borrador: { cuerpo: string }; portada: string | null; salida: { video: string | null }; finales: unknown[]; video: Estado<EtapaVideo>; origen: string }): Pieza[] {
  const publicado = f.video.clave === 'publicado'
  const h: Pieza[] = []
  if (!f.titulos.length) h.push('titulos')
  if (!f.descripcion) h.push('descripcion')
  else if (!f.capitulos.length) h.push('capitulos')
  if (!f.link) h.push('link')
  if (!f.transcript) h.push('transcript')
  if (!f.borrador.cuerpo && f.origen !== 'canal') h.push('post')
  if (!f.portada) h.push('miniatura')
  if (!f.salida.video && !publicado) h.push('fecha')
  if (!f.finales.length && !publicado) h.push('finales')
  return h
}

// ── filtros de la rejilla ────────────────────────────────────────────────────────────────────────────────────────────

export type Filtro = 'todos' | 'obra' | 'programados' | 'publicados' | 'post'
export const FILTROS: { id: Filtro; nombre: string }[] = [
  { id: 'todos', nombre: 'Todos' }, { id: 'obra', nombre: 'En obra' }, { id: 'programados', nombre: 'Programados' },
  { id: 'publicados', nombre: 'Publicados' }, { id: 'post', nombre: 'Post pendiente' },
]

export function pasaFiltro(v: { video: Estado<EtapaVideo>; post: Estado<EtapaPost>; titulo: string; carpeta: string | null }, filtro: Filtro, q = ''): boolean {
  const k = v.video.clave
  const ok = filtro === 'todos' ? true
    : filtro === 'obra' ? !['programado', 'publicado', 'por-verificar'].includes(k)
    : filtro === 'programados' ? k === 'programado' || k === 'por-verificar'
    : filtro === 'publicados' ? k === 'publicado'
    : ['pendiente', 'borrador', 'en-bandeja'].includes(v.post.clave)
  if (!ok) return false
  const n = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const query = n(q.trim())
  return !query || n(`${v.titulo} ${v.carpeta ?? ''}`).includes(query)
}

/** Lo más nuevo arriba; lo programado (lo que viene) antes que lo publicado del mismo día. */
export function ordenar<T extends { fecha: string | null; titulo: string }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => (Date.parse(b.fecha ?? '') || 0) - (Date.parse(a.fecha ?? '') || 0) || a.titulo.localeCompare(b.titulo))
}

/** Respuesta de la bandeja (GET /decisiones/<id>) → el estado que guarda la solicitud. */
export function estadoSolicitud(vista: { estado?: string; respuesta?: string; comentario?: string } | null): Pick<Solicitud, 'estado' | 'comentario'> {
  if (!vista) return { estado: 'desconocido' }
  if (vista.respuesta === 'si' || vista.respuesta === 'no' || vista.respuesta === 'otro') return { estado: vista.respuesta, comentario: vista.comentario ?? null }
  return { estado: 'pendiente' }
}

// ── cotejo carpeta ↔ canal (cuando la carpeta no guardó el id de YouTube) ────────────────────────────────────────────

const VACIAS = new Set(['con', 'para', 'los', 'las', 'del', 'que', 'una', 'uno', 'por', 'como', 'mas', 'sus', 'tus', 'mis', 'esto', 'este', 'esta', 'ahora', 'nuevo', 'nueva', 'todo', 'the', 'and', 'you', 'your'])
const fichas = (s: string) => new Set(s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !VACIAS.has(t)))

/**
 * El video del canal que corresponde a una carpeta sin id: comparte al menos dos palabras del nombre con el título y salió
 * entre 3 días antes y 21 después de la fecha de la carpeta. Gana el de más palabras en común y, empatados, el más cercano.
 * Es una lectura, no un dato: la ficha lo dice.
 */
export function cotejar<T extends { video_id: string; title: string; published_at: string }>(carpeta: string, canal: T[], reclamados: Set<string>): T | null {
  const fecha = fechaDeCarpeta(carpeta)
  if (!fecha) return null
  const base = Date.parse(fecha)
  const palabras = fichas(carpeta.replace(/^\d{4}-\d\d-\d\d-/, ''))
  let mejor: { v: T; puntos: number; dist: number } | null = null
  for (const v of canal) {
    if (reclamados.has(v.video_id)) continue
    const dias = (Date.parse(v.published_at) - base) / 864e5
    if (!(dias >= -3 && dias <= 21)) continue
    const t = fichas(v.title)
    const puntos = [...palabras].filter(p => t.has(p)).length
    if (puntos < 2) continue
    if (!mejor || puntos > mejor.puntos || (puntos === mejor.puntos && Math.abs(dias) < mejor.dist)) mejor = { v, puntos, dist: Math.abs(dias) }
  }
  return mejor?.v ?? null
}
