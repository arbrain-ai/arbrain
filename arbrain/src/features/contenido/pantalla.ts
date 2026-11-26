/**
 * Cuartel v2 · lógica pura de las pantallas (15 nov 2026). Sin React ni fs: se prueba en `tests/contenido/pantalla.test.ts`.
 *
 * Tres ideas, las tres del dueño: «optimicemos por funcionalidad», «tenemos demasiado de mentalidad pero no de mi nicho»
 * y «¿por qué no tengo algo claro acá reciente?».
 *  1. La fecha se ve en cada video (día y hace cuánto).
 *  2. Su nicho va primero: los temas de nicho encabezan cada filtro y el feed de Aprender solo trae de ahí.
 *  3. La gráfica de outliers usa su ancho: fecha en horizontal y multiplicador en vertical, con el eje ajustado a los datos.
 */
import { edad, outlierReal, reloj } from './modelo'
import type { CanalCuartel, FichaCanal, LecturaCuartel, Tema, VideoCuartel } from './tipos'

const DIA = 864e5
const ZONA = 'America/Mexico_City'
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function partes(t: number): { a: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(t))
  const n = (k: string) => Number(p.find(x => x.type === k)?.value ?? 0)
  return { a: n('year'), m: n('month'), d: n('day') }
}

/** «12 nov»; con año si no es el de hoy: «2 sep 2025». Hora de México. */
export function fechaCorta(iso: string | null | undefined, ahora = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(t)) return 'sin fecha'
  const f = partes(t), hoy = partes(ahora)
  return `${f.d} ${MESES[f.m - 1]}${f.a !== hoy.a ? ` ${f.a}` : ''}`
}

/** La fecha que se pinta en cada video: el día y hace cuánto («12 nov · hace 3 días»). */
export function fechaVisible(iso: string | null | undefined, ahora = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(t)) return 'sin fecha'
  return `${fechaCorta(iso, ahora)} · ${edad(iso, ahora)}`
}

export const edadDias = (iso: string | null | undefined, ahora = Date.now()): number => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? Infinity : Math.max(0, (ahora - t) / DIA)
}

// ── Su nicho primero ─────────────────────────────────────────────────────────

/** Respaldo si el universo no marca `nicho` en sus temas (contrato v2, criterio 3). */
export const NICHO_RESPALDO = ['claude-code', 'ia-agentes', 'cerebro-artificial', 'consultoria-ia', 'oferta', 'ventas', 'adquisicion', 'empaquetado-youtube']

const CORTOS: Record<string, string> = {
  'claude-code': 'Claude Code', 'ia-agentes': 'Agentes', 'cerebro-artificial': 'Cerebro artificial', 'consultoria-ia': 'Consultor con IA',
  oferta: 'Oferta', ventas: 'Ventas', adquisicion: 'Adquisición', 'empaquetado-youtube': 'YouTube', 'mensaje-copy': 'Copy',
  'embudo-lanzamiento': 'Embudo', 'comunidad-retencion': 'Comunidad', posicionamiento: 'Posicionamiento', sofisticacion: 'Mercado',
  'negocio-conocimiento': 'Cursos y programas', 'frontera-ia': 'Frontera de IA', robots: 'Robots', mentalidad: 'Mentalidad',
}

export interface TemaChip { slug: string; nombre: string; corto: string; nicho: boolean }

/** Los temas listos para un filtro compacto: etiqueta corta y los de su nicho primero (en el orden del universo). */
export function temasChip(temas: (Tema & { nicho?: boolean; corto?: string | null })[] | null | undefined): TemaChip[] {
  const xs = (temas ?? []).map(t => ({
    slug: t.slug, nombre: t.nombre,
    corto: t.corto?.trim() || CORTOS[t.slug] || t.nombre.split(/[:,]/)[0].trim(),
    nicho: typeof t.nicho === 'boolean' ? t.nicho : NICHO_RESPALDO.includes(t.slug),
  }))
  return [...xs.filter(t => t.nicho), ...xs.filter(t => !t.nicho)]
}

export const esDeNicho = (v: Pick<VideoCuartel, 'capa' | 'temas'>, nicho: Set<string>): boolean =>
  v.capa !== 'mentalidad' && v.capa !== 'propio' && !!v.temas?.some(t => nicho.has(t))

/** Su nicho es español e inglés: lo demás (portugués, ruso…) no entra a ninguna lista por defecto. */
export const esEsEn = (v: Pick<VideoCuartel, 'idioma'>): boolean => !v.idioma || v.idioma === 'es' || v.idioma === 'en'

/**
 * Nuevo y fuerte: cuánto rinde sobre su canal, descontado por edad (vale la mitad cada 10 días). Un video de 3 días a ×3
 * le gana a uno de 40 días a ×10; el de 40 días solo sube si es muchísimo mejor. El multiplicador se topa en ×20, y en ×4
 * si su confianza es baja: un «×900» contra 100 vistas esperadas es ruido de canal chico, no un outlier.
 */
export function fuerzaFresca(v: Pick<VideoCuartel, 'publicado' | 'outlier'>, ahora = Date.now()): number {
  const p = v.outlier?.puntaje
  const tope = v.outlier?.confianza === 'baja' ? 4 : 20
  const fuerza = p == null || !Number.isFinite(p) ? 1 : Math.min(tope, Math.max(0.3, p))
  return Math.pow(fuerza, 0.6) * Math.pow(0.5, edadDias(v.publicado, ahora) / 10)
}

/**
 * El feed de Aprender: lo de su nicho de las últimas semanas, lo que más rinde primero, máximo 2 por canal para que el
 * que publica diario no se lo coma. Con búsqueda, deja de ser feed: busca en todo (título y canal) y ordena por fecha.
 */
export function deTuNicho(videos: VideoCuartel[], nicho: Set<string>, o: { tema?: string | null; q?: string; fuera?: Set<string>; n?: number; ahora?: number } = {}): VideoCuartel[] {
  const ahora = o.ahora ?? Date.now(), n = o.n ?? 8
  const unicos = new Map<string, VideoCuartel>()
  for (const v of videos) if (!unicos.has(v.video_id)) unicos.set(v.video_id, v)
  const q = o.q?.trim().toLowerCase()
  if (q) {
    return [...unicos.values()].filter(v => v.capa !== 'mentalidad' && esEsEn(v) && `${v.titulo} ${v.canal}`.toLowerCase().includes(q))
      .sort((a, b) => Date.parse(b.publicado) - Date.parse(a.publicado)).slice(0, n)
  }
  const candidatos = [...unicos.values()]
    .filter(v => !o.fuera?.has(v.video_id) && (o.tema ? v.capa !== 'mentalidad' && v.capa !== 'propio' && !!v.temas?.includes(o.tema) : esDeNicho(v, nicho)))
    .filter(v => edadDias(v.publicado, ahora) <= 60 && esEsEn(v) && v.capa !== 'descubierto')
    .map(v => ({ v, f: fuerzaFresca(v, ahora) }))
    .sort((a, b) => b.f - a.f)
  const porCanal = new Map<string, number>(), out: VideoCuartel[] = []
  for (const { v } of candidatos) {
    const k = porCanal.get(v.channel_id) ?? 0
    if (k >= 2) continue
    porCanal.set(v.channel_id, k + 1); out.push(v)
    if (out.length >= n) break
  }
  return out
}

/**
 * Los outliers del detector: `outliers.json` (lo más alto del año, tope 300) más los del feed de 60 días que pasan el
 * umbral. Sin esto la gráfica solo veía de ×21 para arriba y todo se apilaba en una esquina.
 */
export function unirOutliers(outliers: VideoCuartel[], videos: VideoCuartel[]): VideoCuartel[] {
  const m = new Map<string, VideoCuartel>()
  for (const v of outliers) if (v.outlier && outlierReal(v.outlier)) m.set(v.video_id, v)
  for (const v of videos) if (v.outlier && outlierReal(v.outlier) && !m.has(v.video_id)) m.set(v.video_id, v)
  return [...m.values()]
}

/**
 * El orden de las tarjetas del detector: primero los de confianza media o alta (su canal tiene historia para comparar),
 * del más fuerte al menos; los de confianza baja, al fondo. Así no encabeza un «×900» de un canal sin línea base.
 */
export function ordenarOutliers(xs: VideoCuartel[], ahora = Date.now()): VideoCuartel[] {
  return [...xs].map(v => ({ v, p: pesoOutlier(v, ahora) })).sort((a, b) => b.p - a.p).map(x => x.v)
}

/** A partir de aquí el multiplicador se pinta «×100+»: más allá ya no distingue nada, solo estira el eje. */
export const TOPE_MULT = 100

/**
 * Cuánto pesa un outlier para encabezar el detector. Mezcla tres cosas, porque el multiplicador solo engaña (un ×129 con
 * 13 K vistas no vale más que un ×40 con 620 K): el multiplicador (topado en ×100, raíz), las vistas absolutas (cada
 * orden de magnitud cuenta) y la frescura (vale la mitad cada 45 días). Si su canal tiene historia para comparar
 * (confianza media o alta) pesa la mitad más.
 */
export function pesoOutlier(v: Pick<VideoCuartel, 'outlier' | 'vistas' | 'publicado'>, ahora = Date.now()): number {
  const p = Math.min(TOPE_MULT, Math.max(1, v.outlier?.puntaje ?? 1))
  const vistas = Math.log10(Math.max(10, v.vistas ?? 10))
  const firme = v.outlier?.confianza === 'baja' ? 1 : 1.5
  return Math.sqrt(p) * Math.pow(vistas, 1.5) * firme * Math.pow(0.5, edadDias(v.publicado, ahora) / 45)
}

/** «×8.4», «×36», y «×100+» de ahí para arriba. */
export function multTexto(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—'
  return p > TOPE_MULT ? `×${TOPE_MULT}+` : `×${p >= 10 ? Math.round(p) : p.toFixed(1)}`
}

/** El tramo del oro, dicho para un botón: «5 min desde 1:01:00». Nulo si no está verificado. */
export function tramoOro(oro: { inicio_s: number; fin_s?: number | null; etiqueta?: string | null; verificado: boolean } | null | undefined): string | null {
  if (!oro || !oro.verificado) return null
  const dur = Math.max(1, Math.round(((oro.fin_s ?? oro.inicio_s + 90) - oro.inicio_s) / 60))
  return `${dur} min desde ${oro.etiqueta ?? reloj(oro.inicio_s)}`
}

// ── Inicio: «lo nuevo de tu universo», ordenado hacia la meta ────────────────

export interface VideoInicio extends VideoCuartel {
  por_que: string
  /** De dónde sale el porqué: «lectura» (Levy leyó el transcript), «ligera» (título y descripción), «pulso» o «pantalla» (sin modelo). */
  por_que_fuente?: string | null
  estado?: string | null
  /** Salió en las últimas 24 h. */
  recien?: boolean
  /** «×3.4», «×1.2 (midiendo)» o «midiendo»: con menos de 3 días el multiplicador se afina en el día. */
  outlier_txt?: string | null
}

export interface FeedInicio {
  videos: VideoInicio[]
  /** «pulso» = lo armó el Studio (ESQUEMA §9.3, ordenado hacia la meta); «pantalla» = respaldo armado aquí. */
  fuente: 'pulso' | 'pantalla'
  /** Cuándo fue el último pulso y a qué hora llega el siguiente («16:37»). */
  pulso: string | null
  siguiente: string | null
  /** Lo que se pinta al final de la lista (lo escribe PULSO); nulo en el respaldo. */
  mensaje: string | null
  /** Ya decidió todo lo nuevo de su nicho. */
  alDia: boolean
}

/**
 * Una línea honesta de por qué le sirve este video. Si Levy ya lo leyó, la suya; si no, lo que sí se sabe sin leerlo:
 * cuánto rinde contra su canal y de qué tema de su nicho es. Nunca se inventa una razón.
 */
export function porQueTeSirve(v: VideoCuartel, o: { leido?: string | null; temas?: Map<string, string>; nicho?: Set<string> } = {}): string {
  if (o.leido?.trim()) return o.leido.trim()
  const tema = (v.temas ?? []).filter(t => !o.nicho || o.nicho.has(t)).map(t => o.temas?.get(t) ?? t)[0]
  const p = v.outlier?.puntaje
  const fuerte = p != null && outlierReal(v.outlier)
  const base = fuerte ? `Rinde ${multTexto(p)} sobre lo normal de su canal` : edadDias(v.publicado) < 2 ? 'Recién publicado' : 'Nuevo en tu universo'
  return tema ? `${base} · ${tema}` : base
}

/**
 * El feed de Inicio. Si el Studio ya lo manda armado (`lectura.inicio.nuevo`, ESQUEMA §9.3: ordenado hacia la meta por
 * PULSO, con su línea de por qué), se respeta su orden y su porqué. Si no (el pulso aún no corre), se arma aquí con lo que
 * hay: su nicho, lo de las últimas semanas, lo que más rinde primero. Siempre: sin mentalidad, sin lo propio, solo español
 * e inglés, sin lo que ya está en la dosis. Con búsqueda deja de ser feed: busca en todo lo que el cuartel conoce.
 */
export function feedInicio(lectura: Pick<LecturaCuartel, 'videos' | 'outliers' | 'ranking' | 'universo' | 'dosis' | 'inicio' | 'estado'>, o: { tema?: string | null; q?: string; n?: number; ahora?: number } = {}): FeedInicio {
  const chips = temasChip(lectura.universo?.temas)
  const nicho = new Set(chips.filter(t => t.nicho).map(t => t.slug)), cortos = new Map(chips.map(t => [t.slug, t.corto]))
  const fuera = new Set((lectura.dosis?.videos ?? []).map(p => p.video_id))
  const conPorQue = (v: VideoCuartel): VideoInicio => {
    const r = lectura.ranking?.[v.video_id]
    const leido = r && !r.saltar ? r.por_que_verlo : null
    return { ...v, por_que: porQueTeSirve(v, { leido, temas: cortos, nicho }), por_que_fuente: leido ? 'lectura' : 'pantalla' }
  }
  const q = o.q?.trim().toLowerCase(), n = o.n ?? 48
  const ini = lectura.inicio ?? null
  const items = Array.isArray(ini?.nuevo?.items) ? ini!.nuevo.items.filter(x => x?.video && typeof x.video.video_id === 'string') : []
  const pulso = ini?.pulso?.fin ?? ini?.generado ?? lectura.estado?.generado ?? lectura.estado?.ultima_corrida?.fin ?? null
  // «Siguiente pulso 16:37» solo mientras esa hora no haya pasado; si ya pasó (la rutina se atrasó o está apagada), se
  // calla y la pantalla dice cuándo fue el último.
  const ahoraMs = o.ahora ?? Date.now()
  const sigT = ini?.siguiente_pulso ? Date.parse(ini.siguiente_pulso) : NaN
  const comun = { pulso, siguiente: Number.isFinite(sigT) && sigT > ahoraMs ? ini?.siguiente_pulso_txt ?? null : null }
  if (ini?.nuevo && !q) {
    const xs: VideoInicio[] = items
      .filter(x => x.video.capa !== 'mentalidad' && esEsEn(x.video) && !fuera.has(x.video_id) && (!o.tema || !!x.video.temas?.includes(o.tema)))
      .map(x => ({ ...x.video, por_que: x.por_que?.trim() || conPorQue(x.video).por_que, por_que_fuente: x.por_que_fuente ?? null, estado: x.estado ?? null, recien: x.recien === true, outlier_txt: x.outlier_txt ?? null }))
    // El mensaje de PULSO nombra la hora del siguiente pulso: si esa hora ya pasó, no se repite una promesa vencida.
    const mensaje = ini.nuevo.mensaje?.trim() || null
    return { videos: xs.slice(0, n), fuente: 'pulso', ...comun, mensaje: mensaje && (comun.siguiente || !/siguiente pulso/i.test(mensaje)) ? mensaje : null, alDia: ini.nuevo.al_dia === true }
  }
  const base = q ? [...lectura.videos, ...lectura.outliers] : lectura.videos
  return { videos: deTuNicho(base, nicho, { tema: o.tema, q, fuera, n, ahora: o.ahora }).map(conPorQue), fuente: 'pantalla', ...comun, mensaje: null, alDia: false }
}

// ── La gráfica: fecha × multiplicador ────────────────────────────────────────

const BONITOS = [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000]

/** Eje vertical (logarítmico) ajustado a los datos: del escalón bonito de abajo al de arriba. Nunca deja media gráfica vacía. */
export function dominioLog(ps: number[], tope = Infinity): { min: number; max: number } {
  const xs = ps.filter(p => Number.isFinite(p) && p > 0).map(p => Math.min(p, tope))
  if (!xs.length) return { min: 2, max: 10 }
  const lo = Math.min(...xs), hi = Math.max(...xs)
  const min = [...BONITOS].reverse().find(b => b <= lo) ?? 1
  let max = BONITOS.find(b => b >= hi) ?? Math.ceil(hi)
  if (max <= min) max = BONITOS.find(b => b > min) ?? min * 2
  return { min, max }
}

export function ticksLog(min: number, max: number): number[] {
  return BONITOS.filter(b => b >= min && b <= max)
}

/** 0 abajo (min) a 1 arriba (max). */
export function posLog(p: number, min: number, max: number): number {
  if (!Number.isFinite(p) || p <= min) return 0
  return Math.min(1, Math.log(p / min) / Math.log(max / min))
}

/** 0 a la izquierda (lo más viejo de la ventana) a 1 a la derecha (hoy). */
export function posFecha(iso: string, ventanaDias: number, ahora = Date.now()): number {
  return Math.max(0, Math.min(1, 1 - edadDias(iso, ahora) / ventanaDias))
}

/** Marcas del eje de fechas: pocas, con el día escrito, y «hoy» al final. */
export function ticksFecha(ventanaDias: number, ahora = Date.now()): { x: number; etiqueta: string }[] {
  const paso = ventanaDias <= 7 ? 1 : ventanaDias <= 30 ? 7 : ventanaDias <= 90 ? 30 : 91
  const out: { x: number; etiqueta: string }[] = []
  for (let d = Math.floor(ventanaDias / paso) * paso; d > 0; d -= paso) {
    if (d === ventanaDias && paso > 1 && ventanaDias % paso === 0 && ventanaDias > 30) continue
    out.push({ x: 1 - d / ventanaDias, etiqueta: fechaCorta(new Date(ahora - d * DIA).toISOString(), ahora) })
  }
  out.push({ x: 1, etiqueta: 'hoy' })
  return out
}

// ── Canales ──────────────────────────────────────────────────────────────────

/** Publicó hace poco (72 h): el anillo verde. */
export const publicoHacePoco = (c: Pick<CanalCuartel, 'ultimo_video'>, ahora = Date.now()): boolean =>
  !!c.ultimo_video && ahora - Date.parse(c.ultimo_video.publicado) < 3 * DIA

/** El directorio del radar: quien publicó más recientemente, primero; los callados al final. */
export function canalesActivos(canales: CanalCuartel[], o: { q?: string; capa?: string | null; idioma?: string | null; temas?: Set<string> | null } = {}): CanalCuartel[] {
  const q = o.q?.trim().toLowerCase()
  return canales
    .filter(c => c.capa !== 'propio')
    .filter(c => !q || `${c.nombre} ${c.handle ?? ''}`.toLowerCase().includes(q))
    .filter(c => !o.capa || c.capa === o.capa)
    .filter(c => !o.idioma || c.idioma === o.idioma)
    .filter(c => !o.temas || !!c.temas?.some(t => o.temas!.has(t)))
    .sort((a, b) => (Date.parse(b.ultimo_video?.publicado ?? '') || 0) - (Date.parse(a.ultimo_video?.publicado ?? '') || 0))
}

/**
 * La ficha de un canal armada con lo que la pantalla ya tiene (feed de 60 días y outliers del año). Es el respaldo mientras
 * llega, o si falla, la ruta del Studio (`/api/contenido/ficha-canal`, ESQUEMA §8.4), que trae su historia completa.
 */
export function fichaLocal(id: string, lectura: Pick<LecturaCuartel, 'universo' | 'videos' | 'outliers'>): FichaCanal | null {
  const suyos = new Map<string, VideoCuartel>()
  for (const v of [...lectura.videos, ...lectura.outliers]) if (v.channel_id === id && !suyos.has(v.video_id)) suyos.set(v.video_id, v)
  const xs = [...suyos.values()]
  const delUniverso = lectura.universo?.canales.find(c => c.channel_id === id)
  if (!delUniverso && !xs.length) return null
  const canal: FichaCanal['canal'] = {
    ...(delUniverso ?? { channel_id: id, nombre: xs[0].canal, capa: xs[0].capa, idioma: xs[0].idioma, temas: xs[0].temas }),
    url: delUniverso?.url ?? `https://www.youtube.com/channel/${id}`,
  }
  const outliers = xs.filter(v => v.outlier && v.outlier.puntaje >= 2).sort((a, b) => b.outlier!.puntaje - a.outlier!.puntaje)
  return {
    canal,
    ultimos: [...xs].sort((a, b) => Date.parse(b.publicado) - Date.parse(a.publicado)).slice(0, 12),
    outliers: outliers.slice(0, 12),
    totales: { largos: xs.length, outliers_365d: outliers.length, transcripts: xs.filter(v => v.transcript?.estado === 'listo').length },
    leido: new Date().toISOString(),
  }
}

// ── Tu canal: una lectura que se pueda accionar ──────────────────────────────

/** De una serie de tus videos, el mejor y el peor (con nombre), para decirlo en una línea sin pasar el cursor. */
export function extremos<T>(xs: T[], valor: (x: T) => number | null | undefined): { mejor: T; peor: T } | null {
  const con = xs.filter(x => { const v = valor(x); return v != null && Number.isFinite(v) && v > 0 })
  if (con.length < 2) return null
  const orden = [...con].sort((a, b) => (valor(b) as number) - (valor(a) as number))
  return { mejor: orden[0], peor: orden[orden.length - 1] }
}

/**
 * La banda del universo para una métrica (p10 a p90, mediana y dónde caes tú), lista para pintarse. Las métricas de
 * YouTube tienen cola larga (un canal de 5 M aplasta a 138 de 20 K): si el rango pasa de 30×, la escala es logarítmica
 * y se recorta al tramo p2–p98, para que la banda se vea y no quede todo pegado a la izquierda.
 */
export function bandaVisible(xs: number[], tuyo: number | null) {
  const vals = xs.filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b)
  if (vals.length < 3) return null
  const q = (p: number) => { const i = (vals.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return vals[lo] + (vals[hi] - vals[lo]) * (i - lo) }
  const p10 = q(0.1), p50 = q(0.5), p90 = q(0.9)
  const t = tuyo != null && Number.isFinite(tuyo) && tuyo > 0 ? tuyo : null
  const lo = Math.min(q(0.02), t ?? Infinity), hi = Math.max(q(0.98), t ?? -Infinity)
  const log = hi / lo > 30
  const f = (x: number) => (log ? Math.log(x) : x)
  const pos = (x: number) => (hi === lo ? 0.5 : Math.max(0, Math.min(1, (f(x) - f(lo)) / (f(hi) - f(lo)))))
  return { p10: pos(p10), p50: pos(p50), p90: pos(p90), tu: t == null ? null : pos(t), mediana: p50, percentil: t == null ? null : vals.filter(x => x < t).length / vals.length, n: vals.length, log }
}
