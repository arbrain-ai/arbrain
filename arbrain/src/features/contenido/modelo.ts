/**
 * Cuartel de Contenido · lógica pura (15 nov 2026). Sin React ni fs: se prueba en `tests/contenido/`.
 *
 * El algoritmo del dueño no es el de YouTube: aquí nunca se ordena por «tiempo que te retiene». Lo que sube es lo que
 * rinde por encima de su canal (outlier) y lo que CEREBRO calificó hacia la meta. Shorts, comentarios y
 * recomendaciones ajenas no existen en este modelo.
 */
import type {
  Calificacion, CanalCuartel, Dosis, IdeaVideo, Lazo, LineaTranscript, Oro, OutlierInfo, PasoDosis, VideoCuartel,
} from './tipos'

// ── Formatos ──────────────────────────────────────────────────────────────────

export function compacto(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)} mil M`
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)} M`
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)} K`
  return String(Math.round(n))
}

/** 75 → «1:15»; 3725 → «1:02:05». */
export function reloj(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s) || s < 0) return '—'
  const t = Math.floor(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`
}

export function duracion(s: number | null | undefined): string {
  if (!s) return '—'
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`
}

export function edad(iso: string | null | undefined, ahora = Date.now()): string {
  if (!iso) return 'sin fecha'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'sin fecha'
  const h = (ahora - t) / 36e5
  if (h < 1) return 'hace minutos'
  if (h < 24) return `hace ${Math.floor(h)} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  if (d < 30) return `hace ${d} días`
  const m = Math.floor(d / 30.4)
  return m < 12 ? `hace ${m} ${m === 1 ? 'mes' : 'meses'}` : `hace ${Math.floor(m / 12)} ${m < 24 ? 'año' : 'años'}`
}

export function multiplicador(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—'
  return `×${p >= 10 ? Math.round(p) : p.toFixed(1)}`
}

export const NOMBRE_CAPA: Record<string, string> = {
  propio: 'Tú', referente: 'Referentes', competencia: 'Competencia', mentor: 'Mentores', frontera: 'Frontera de IA',
  mentalidad: 'Mentalidad', descubierto: 'Descubiertos',
}

/** Orden de los anillos del universo: de ti hacia afuera. */
export const ORDEN_CAPAS = ['propio', 'competencia', 'referente', 'mentor', 'frontera', 'mentalidad', 'descubierto'] as const

// ── Outliers (ESQUEMA §3.1) ───────────────────────────────────────────────────

/** Outlier «de verdad» para la pantalla: ×2 con confianza media o alta, o ×3 con cualquier confianza. */
export function outlierReal(o: OutlierInfo | null | undefined): boolean {
  if (!o || !Number.isFinite(o.puntaje)) return false
  return o.puntaje >= 3 || (o.puntaje >= 2 && o.confianza !== 'baja')
}

/** Posición 0..1 de un puntaje en la regla logarítmica ×1 → ×30 del detector. */
export function posicionLog(p: number, min = 1, max = 30): number {
  if (!Number.isFinite(p) || p <= min) return 0
  return Math.min(1, Math.log(p / min) / Math.log(max / min))
}

export function esShort(v: Pick<VideoCuartel, 'duracion_s' | 'titulo'>): boolean {
  return (v.duracion_s != null && v.duracion_s > 0 && v.duracion_s <= 180) || /#shorts?\b/i.test(v.titulo)
}

// ── Transcript (.md del corpus, ESQUEMA §4.5) ────────────────────────────────

const MARCA = /^\s*`?\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]`?\s*(.*)$/

export function leerTranscriptMd(md: string): { titulo: string | null; canal: string | null; lineas: LineaTranscript[] } {
  const titulo = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null
  const canal = md.match(/\*\*Canal:\*\*\s*(.+)$/m)?.[1]?.trim() ?? null
  const lineas: LineaTranscript[] = []
  for (const raw of md.split('\n')) {
    const m = raw.match(MARCA)
    if (!m) continue
    const s = (Number(m[1] ?? 0) * 3600) + Number(m[2]) * 60 + Number(m[3])
    const texto = m[4].trim()
    if (texto) lineas.push({ s, texto })
  }
  return { titulo, canal, lineas }
}

/** Índice de la línea que suena en el segundo `t` (la última que ya empezó). */
export function lineaActual(lineas: LineaTranscript[], t: number): number {
  let lo = 0, hi = lineas.length - 1, r = -1
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lineas[mid].s <= t) { r = mid; lo = mid + 1 } else hi = mid - 1 }
  return r
}

// ── Lo de CEREBRO, leído tolerante ───────────────────────────────────────────

type Suelto = Record<string, unknown>
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** «12:34» / 754 / «754» → segundos. */
export function segundos(v: unknown): number | null {
  const n = num(v)
  if (n != null) return n
  const s = txt(v)
  if (!s) return null
  const m = s.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

function oroDe(v: unknown): Oro | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Suelto
  const inicio = segundos(o.inicio_s ?? o.s ?? o.etiqueta)
  if (inicio == null) return null
  return { inicio_s: inicio, fin_s: num(o.fin_s), etiqueta: txt(o.etiqueta) ?? reloj(inicio), cita: txt(o.cita), que_hay: txt(o.que_hay), verificado: o.verificado === true }
}

/** Arma el video de un paso: el del sensor si existe; si no, el que CEREBRO copió en el propio paso. */
function videoDePaso(o: Suelto, porId: Map<string, VideoCuartel>): VideoCuartel | null {
  const id = txt(o.video_id)!
  const delSensor = porId.get(id)
  if (delSensor) return delSensor
  const titulo = txt(o.titulo)
  if (!titulo) return null
  return {
    video_id: id, channel_id: txt(o.channel_id) ?? '', canal: txt(o.canal) ?? '', capa: txt(o.capa) ?? 'descubierto', idioma: txt(o.idioma),
    titulo, publicado: txt(o.publicado) ?? '', duracion_s: num(o.duracion_s), miniatura_url: txt(o.miniatura_url),
    outlier: num(o.outlier) != null ? { puntaje: num(o.outlier)!, esperado: 0, metodo: 'cerebro', confianza: 'media' } : null,
    url: txt(o.url) ?? `https://www.youtube.com/watch?v=${id}`,
  }
}

export function normalizarDosis(raw: unknown, porId: Map<string, VideoCuartel>): Dosis | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Suelto
  const videos: PasoDosis[] = arr(r.videos).flatMap(x => {
    if (!x || typeof x !== 'object') return []
    const o = x as Suelto
    if (!txt(o.video_id)) return []
    const eje = o.eje && typeof o.eje === 'object' ? o.eje as Suelto : null
    return [{
      video_id: txt(o.video_id)!,
      por_que: txt(o.por_que_verlo ?? o.por_que) ?? '',
      oro: oroDe(o.oro),
      eje: eje && txt(eje.id) ? { id: txt(eje.id)!, nombre: txt(eje.nombre) ?? txt(eje.id)! } : null,
      se_vuelve: txt(o.se_vuelve), accion: txt(o.accion), puntaje: num(o.puntaje), outlier: num(o.outlier),
      ya_lo_tienes: arr(o.ya_lo_tienes).flatMap(y => { const yy = y as Suelto; const t = txt(yy?.titulo); return t ? [{ titulo: t, corpus: txt(yy.corpus), parecido: num(yy.parecido) }] : [] }),
      estado: txt(o.estado) ?? 'pendiente',
      relleno: o.relleno === true,
      publicado: txt(o.publicado), edad_dias: num(o.edad_dias),
      frescura: o.frescura === 'nuevo' || o.frescura === 'reciente' || o.frescura === 'viejo' ? o.frescura : null,
      fecha_txt: txt(o.fecha_txt), por_que_viejo: txt(o.por_que_viejo),
      video: videoDePaso(o, porId),
    }]
  })
  if (!videos.length) return null
  const meta = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Suelto
  return {
    fecha: txt(r.fecha) ?? (txt(r.generado) ?? '').slice(0, 10),
    nota: txt(r.nota),
    videos: videos.slice(0, 5),
    terminaste: r.terminaste === true || videos.every(v => v.estado !== 'pendiente'),
    minutos_total: num(r.minutos_total), minutos_oro: num(r.minutos_oro),
    ejes: arr(meta.ejes).flatMap(e => { const ee = e as Suelto; return txt(ee?.id) ? [{ id: txt(ee.id)!, nombre: txt(ee.nombre) ?? txt(ee.id)!, peso: num(ee.peso) ?? undefined }] : [] }),
    generado: txt(r.generado) ?? undefined,
    fuente: 'cerebro',
    ventana_dias: num(r.ventana_dias), recientes: num(r.recientes),
  }
}

export function normalizarIdeas(raw: unknown): IdeaVideo[] {
  const lista = Array.isArray(raw) ? raw : arr((raw as Suelto | null)?.ideas)
  return lista.flatMap((x, i) => {
    if (!x || typeof x !== 'object') return []
    const o = x as Suelto
    const titulos = arr(o.titulos).flatMap((t): IdeaVideo['titulos'] => {
      if (typeof t === 'string') return [{ texto: t }]
      const tt = t as Suelto
      return txt(tt?.texto) ? [{ texto: txt(tt.texto)!, patron: txt(tt.patron) }] : []
    })
    const angulo = txt(o.angulo) ?? txt(o.titulo) ?? titulos[0]?.texto
    if (!angulo) return []
    const miniaturas = arr(o.miniaturas).flatMap((m): IdeaVideo['miniaturas'] => {
      if (typeof m === 'string') return [{ texto: m }]
      const mm = m as Suelto
      return mm && (txt(mm.texto) || txt(mm.objeto)) ? [{ texto: txt(mm.texto), objeto: txt(mm.objeto), composicion: txt(mm.composicion) }] : []
    })
    const voz = arr(o.voz_cliente).flatMap((c): IdeaVideo['voz_cliente'] => {
      if (typeof c === 'string') return [{ texto: c }]
      const cc = c as Suelto
      return txt(cc?.texto) ? [{ texto: txt(cc.texto)!, tipo: txt(cc.tipo), uso: txt(cc.uso) }] : []
    })
    const f = (o.origen && typeof o.origen === 'object' ? o.origen : null) as Suelto | null
    const g = (o.para_guion && typeof o.para_guion === 'object' ? o.para_guion : null) as Suelto | null
    return [{
      id: txt(o.id) ?? `idea-${i}`, estado: txt(o.estado) ?? 'nueva', creada: txt(o.creada), tipo: txt(o.tipo),
      angulo, promesa: txt(o.promesa), titulos, miniaturas, voz_cliente: voz,
      origen: f ? { video_id: txt(f.video_id), titulo: txt(f.titulo), canal: txt(f.canal), outlier: num(f.outlier), por_que_funciono: txt(f.por_que_funciono) } : null,
      para_guion: g ? { gancho: txt(g.gancho), demostracion: txt(g.demostracion), cta: txt(g.cta) } : null,
    }]
  })
}

export function normalizarRanking(raw: unknown): Record<string, Calificacion> {
  const out: Record<string, Calificacion> = {}
  const videos = (raw as Suelto | null)?.videos
  if (!videos || typeof videos !== 'object' || Array.isArray(videos)) return out
  for (const [id, v] of Object.entries(videos as Suelto)) {
    const o = v as Suelto
    const p = num(o?.puntaje)
    if (p == null || !ID_VIDEO.test(id)) continue
    const saltar = o.saltar == null ? null : typeof o.saltar === 'string' ? o.saltar : txt((o.saltar as Suelto).razon) ?? 'Levy recomienda no verlo.'
    const eje = o.eje && typeof o.eje === 'object' ? txt((o.eje as Suelto).nombre) : txt(o.eje)
    out[id] = { puntaje: p, tesis: txt(o.tesis), por_que_verlo: txt(o.por_que_verlo), se_vuelve: txt(o.se_vuelve), oro: oroDe(o.oro), saltar, eje }
  }
  return out
}

export function normalizarLazo(raw: unknown): Lazo | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Suelto
  const v = (r.votos ?? {}) as Suelto, ia = (r.ideas_aplicadas ?? {}) as Suelto
  return { votos: { sirvio: num(v.sirvio) ?? 0, no_sirvio: num(v.no_sirvio) ?? 0 }, ideas_aplicadas: { total: num(ia.total) ?? 0, semana: num(ia.semana) ?? 0 }, acierto_dosis: num(r.acierto_dosis) }
}

const ID_VIDEO = /^[\w-]{11}$/

/**
 * Dosis provisional: mientras CEREBRO no publique la suya, la pantalla no inventa razones. Toma los outliers reales
 * más fuertes de la última semana (uno por canal, sin Shorts) y dice la verdad del porqué: «rinde ×N sobre su canal».
 */
export function dosisProvisional(videos: VideoCuartel[], ahora = Date.now(), n = 4): Dosis | null {
  const semana = ahora - 10 * 864e5
  const candidatos = videos
    .filter(v => !esShort(v) && outlierReal(v.outlier) && Date.parse(v.publicado) >= semana)
    .sort((a, b) => (b.outlier?.puntaje ?? 0) - (a.outlier?.puntaje ?? 0))
  const canales = new Set<string>(), elegidos: VideoCuartel[] = []
  for (const v of candidatos) { if (canales.has(v.channel_id)) continue; canales.add(v.channel_id); elegidos.push(v); if (elegidos.length >= n) break }
  if (elegidos.length < 3) return null
  return {
    fecha: new Date(ahora).toISOString().slice(0, 10),
    fuente: 'provisional',
    terminaste: false,
    videos: elegidos.map(v => ({
      video_id: v.video_id, video: v, oro: null, estado: 'pendiente', outlier: v.outlier?.puntaje ?? null,
      por_que: `Rinde ${multiplicador(v.outlier?.puntaje)} sobre lo normal de ${v.canal}: algo de este empaque le funcionó a su audiencia.`,
    })),
  }
}

// ── Tu canal contra tu universo ──────────────────────────────────────────────

export function mediana(xs: number[]): number | null {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

// ── El radar de antes (Supabase intel_videos) con la forma del sensor ─────────

export function desdeRadar(filas: Record<string, unknown>[], canales: Record<string, unknown>[] = []): { videos: VideoCuartel[]; canales: CanalCuartel[] } {
  const cat = new Map<string, Record<string, unknown>>()
  for (const c of canales) { const id = txt(c.channel_id); if (id) cat.set(id, c) }
  const capaDe = (c?: Record<string, unknown>) => {
    const k = String(c?.category ?? '').toLowerCase()
    return /compet/.test(k) ? 'competencia' : /mentor|negocio|business/.test(k) ? 'mentor' : /frontera|ai|ia|research/.test(k) ? 'frontera' : 'referente'
  }
  const videos: VideoCuartel[] = filas.flatMap(f => {
    const id = txt(f.video_id), titulo = txt(f.title)
    if (!id || !titulo) return []
    const ch = txt(f.channel_id) ?? txt(f.channel_name) ?? 'desconocido'
    const v: VideoCuartel = {
      video_id: id, channel_id: ch, canal: txt(f.channel_name) ?? 'Canal', capa: capaDe(cat.get(ch)), idioma: txt(f.language),
      titulo, publicado: txt(f.published_at) ?? new Date(0).toISOString(), duracion_s: num(f.duration_seconds), miniatura_url: txt(f.thumbnail_url),
      vistas: num(f.views), likes: num(f.likes), outlier: null, temas: arr(f.keywords_matched).filter((t): t is string => typeof t === 'string'),
      origen: 'canal', transcript: null, url: `https://www.youtube.com/watch?v=${id}`,
    }
    return esShort(v) ? [] : [v]
  })
  // Sin curva del sensor: un outlier aproximado contra la mediana del canal en esta muestra (confianza baja, se dice).
  const porCanal = new Map<string, number[]>()
  for (const v of videos) if (v.vistas != null) porCanal.set(v.channel_id, [...(porCanal.get(v.channel_id) ?? []), v.vistas])
  for (const v of videos) {
    const xs = porCanal.get(v.channel_id) ?? []
    const m = xs.length >= 5 ? mediana(xs) : null
    if (m && v.vistas != null && Date.now() - Date.parse(v.publicado) > 864e5) v.outlier = { puntaje: v.vistas / m, esperado: Math.round(m), metodo: 'muestra_radar', confianza: 'baja' }
  }
  const lista: CanalCuartel[] = [...cat.values()].map(c => ({
    channel_id: txt(c.channel_id)!, nombre: txt(c.channel_name) ?? 'Canal', capa: capaDe(c), idioma: txt(c.language),
    miniatura_url: txt(c.channel_thumbnail_url), url: txt(c.channel_url) ?? undefined,
    suscriptores: num(c.subscriber_count ?? c.subscribers),
  }))
  return { videos, canales: lista }
}

/** Cuantil por interpolación lineal (xs ya filtrados de NaN). */
export function cuantil(xs: number[], q: number): number | null {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const p = (v.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p)
  return v[lo] + (v[hi] - v[lo]) * (p - lo)
}

/** La banda del universo para una métrica: p10–p90, mediana, y dónde caes tú. */
export function banda(xs: number[], tuyo: number | null) {
  const p10 = cuantil(xs, 0.1), p50 = cuantil(xs, 0.5), p90 = cuantil(xs, 0.9)
  const vals = xs.filter(Number.isFinite)
  if (p10 == null || p50 == null || p90 == null) return null
  const lo = Math.min(...vals, tuyo ?? Infinity), hi = Math.max(...vals, tuyo ?? -Infinity)
  const pos = (x: number) => (hi === lo ? 0.5 : (x - lo) / (hi - lo))
  const sobre = tuyo == null ? null : vals.filter(x => x < tuyo).length / vals.length
  return { p10: pos(p10), p50: pos(p50), p90: pos(p90), tu: tuyo == null ? null : pos(tuyo), mediana: p50, percentil: sobre, n: vals.length }
}

// ── Cuando el reproductor no arranca (15 nov 2026, teléfono de Daniel) ─────────
// En la PWA del iPhone el incrustado se quedó girando para siempre: el velo de «cargando» tapaba lo que fuera que
// mostraba el iframe y nunca había salida. Regla: si en 8 s YouTube no dijo «listo», la sala lo dice y ofrece verlo
// descargado ahí mismo. Nunca se manda a youtube.com (la app y el sitio están cerrados a propósito en su teléfono).

/** Cuánto espera la sala a que el reproductor de YouTube diga «listo» antes de ofrecer la salida. */
export const ESPERA_ARRANQUE_MS = 8000

/**
 * Por qué no arrancó, leído de lo que se alcanzó a ver:
 *  - `sin-api`: ni el script de YouTube llegó → la red no deja pasar a youtube.com (DNS, VPN, sin internet).
 *  - `sin-respuesta`: el script llegó pero el reproductor (iframe) nunca contestó → algo filtra el marco de YouTube
 *    dentro de la app; en un iPhone, casi siempre Tiempo en pantalla con youtube.com restringido.
 *  - `error`: YouTube contestó con un error (`detalle` trae cuál).
 */
export type MotivoNoArranca = 'sin-api' | 'sin-respuesta' | 'error'

export function motivoNoArranca(apiCargada: boolean): Exclude<MotivoNoArranca, 'error'> {
  return apiCargada ? 'sin-respuesta' : 'sin-api'
}

/** Ceja y explicación corta para la salida (una línea de qué pasó y una de qué hacer). */
export function textoNoArranca(motivo: MotivoNoArranca, detalle?: string | null): { ceja: string; texto: string; pista: string | null } {
  if (motivo === 'sin-api') return {
    ceja: 'YouTube no llegó',
    texto: 'Este dispositivo no alcanza youtube.com, así que el video no puede verse incrustado. Bájalo una vez y lo ves aquí.',
    pista: 'Si tienes un bloqueador por DNS o VPN, deja pasar www.youtube.com (puedes bloquear m.youtube.com y youtu.be).',
  }
  if (motivo === 'sin-respuesta') return {
    ceja: 'El reproductor no arrancó',
    texto: 'YouTube no contestó dentro de Arbrain en 8 segundos. Bájalo una vez y lo ves aquí, sin abrir YouTube.',
    pista: 'En el iPhone suele ser Tiempo en pantalla: quita youtube.com de «No permitir nunca» y de los límites de sitios web (la app de YouTube puede seguir bloqueada).',
  }
  return { ceja: 'YouTube devolvió un error', texto: `${detalle || 'El reproductor falló.'} Bájalo una vez y lo ves aquí.`, pista: null }
}
