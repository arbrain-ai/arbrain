/**
 * Stats Royale · la forma de `vistas/juego.json` (contrato `cuartel.juego/1`, arbrain/server/scripts/cuartel/CONTRATO-JUEGO.md)
 * y la lógica de PANTALLA, pura y probada (tests/contenido/juego.test.ts). Trofeos, coronas, lugares y arenas ya vienen
 * calculados por `juego.py`: aquí no se recalculan, solo se eligen, se ordenan y se dicen. Lo que falta se dice como falta.
 */

export interface RivalLiga { channel_id: string; nombre: string; trofeos: number; lugar: number }
export interface LugarLiga {
  liga: 'hispana' | 'mundial'; lugar: number; de: number; trofeos: number
  arriba: RivalLiga | null; abajo: RivalLiga | null; falta_para_subir: number | null; empatados: number
}
export interface Temporada {
  numero: number; estado: 'en_curso' | 'pretemporada' | 'cerrada' | string; inicio: string; fin?: string; semana?: number; de_semanas?: number
  videos?: number; meta_videos?: number; coronas?: number
  anterior?: { numero: number; inicio: string; fin?: string; videos: number; coronas: number; meta_videos?: number } | null
}
export interface PerfilJuego {
  trofeos: number; largos_28d: number; arena: number; arena_nombre: string
  siguiente_arena: { numero: number; nombre: string; desde: number; falta: number } | null
  ligas: { hispana?: LugarLiga | null; mundial?: LugarLiga | null }
  racha: { semanas: number; mejor: number; semana_actual: { inicio: string; videos: number; meta: number } }
  temporada: Temporada
}
export interface Partida {
  video_id: string; titulo: string; publicado: string; vistas: number | null; esperado: number | null
  puntaje: number | null; coronas: number | null; confianza?: string | null; formato?: string | null
}
export interface Mazo { formato: string; videos: number; con_corona: number; coronas: number; tasa_coronas: number; coronas_por_video: number; mejor_video?: string | null; lugar?: number }
export interface Medidor { clave: string; carta: Carta; valor: number | null; mediana: number | null; n?: number | null; ratio: number | null; umbral: number; estado: 'bajo' | 'bien' | 'falta'; confianza?: string | null }
export interface Repeticion {
  video_id: string; titulo: string; publicado: string; vistas: number | null; puntaje: number | null; coronas: number | null
  veredicto: Carta | 'ninguna' | 'sin_datos'; frase?: string; medidores: Medidor[]; faltas?: string[]; base?: string
}
export interface PuntoCurva { edad_h: number; vistas: number; mediana_previos: number | null; n_previos?: number | null; ratio: number | null }
export interface CurvaVideo { video_id: string; puntos: PuntoCurva[]; referencia_48h_analytics?: { mediana: number | null; n: number; nota?: string } | null; falta?: string | null }
export interface FilaRanking { lugar: number; channel_id: string; nombre: string; trofeos: number; largos_28d: number; arena: number
  /** La fila del dueño. El cuartel la marca con `es_<clave del dueño>`; `marcarTuyo` la normaliza aquí. */
  tuyo: boolean }
export interface Arena { desde: number; numero: number; nombre: string }
type MetaLiga = { top3: Mazo[]; sin_formato?: number }
export interface Juego {
  esquema: string; calculado: string; dia: string
  perfil: PerfilJuego
  partidas: Partida[]
  mazos: { mazos: Mazo[]; sin_formato?: number }
  meta: Partial<Record<'7d' | '28d', Partial<Record<'hispana' | 'mundial', MetaLiga>>>>
  rankings: Partial<Record<'hispana' | 'mundial', FilaRanking[]>>
  repeticion: Repeticion | null
  curva: CurvaVideo[] | null
  arenas: Arena[]
}
/** Lo que contesta `/api/contenido/juego`: el juego, o por qué no hay. */
export type LecturaJuego = { juego: Juego; leido: string } | { juego: null; leido: string; falta: string }

// ── Cartas (el árbol del PLAN 80/20): en este orden se recorre y la primera abajo es el veredicto ─────────────────
export type Carta = 'tema' | 'empaque' | 'gancho' | 'cuerpo' | 'promesa'
export const CARTAS: { carta: Carta; nombre: string; mide: string; sube: string }[] = [
  { carta: 'tema', nombre: 'Tema', mide: 'Impresiones en 7 días', sube: 'elige un tema que YouTube quiera repartir: lo que ya pega en tu ranking' },
  { carta: 'empaque', nombre: 'Empaque', mide: 'CTR en 7 días', sube: 'título y miniatura: la promesa en 3 palabras' },
  { carta: 'gancho', nombre: 'Gancho', mide: 'Retención a 30 s', sube: 'los primeros 30 segundos: confirma la miniatura y abre el bucle' },
  { carta: 'cuerpo', nombre: 'Cuerpo', mide: '% visto', sube: 'el ritmo del medio: menos rodeo, más giros' },
  { carta: 'promesa', nombre: 'Promesa', mide: 'Suscriptores por cada mil vistas', sube: 'el cierre: qué gana quien se queda contigo' },
]
export const cartaDe = (c: string) => CARTAS.find(x => x.carta === c) ?? null

export const FORMATOS: Record<string, string> = {
  experimento: 'Experimento', lista: 'Lista', comparativa: 'Comparativa', lanzamiento: 'Lanzamiento', dominio: 'Dominio', explicacion: 'Explicación', entrevista: 'Entrevista',
}
export const nombreFormato = (f: string | null | undefined) => (f ? FORMATOS[f] ?? f.charAt(0).toUpperCase() + f.slice(1) : 'Sin formato')

/**
 * El cuartel marca la fila del dueño con `es_<clave>` (la clave de la instalación, `DUENO()`); la pantalla solo conoce
 * `tuyo`. Así ningún nombre viaja en el código y otra instalación marca la suya.
 */
export function marcarTuyo(juego: Juego, clave: string): Juego {
  const llave = `es_${clave}`
  const rankings: Juego['rankings'] = {}
  for (const l of ['hispana', 'mundial'] as const) {
    const xs = juego.rankings?.[l]
    if (xs) rankings[l] = xs.map(f => ({ ...f, tuyo: (f as unknown as Record<string, unknown>)[llave] === true || f.tuyo === true }))
  }
  return { ...juego, rankings }
}

// ── Lógica de pantalla ─────────────────────────────────────────────────────────────────────────────────────────

/** Coronas de una partida para pintar: 0 a 3, o null si aún está «en juego» (menos de 24 h). */
export function coronasDe(p: Pick<Partida, 'coronas'>): number | null {
  if (p.coronas == null || !Number.isFinite(p.coronas)) return null
  return Math.max(0, Math.min(3, Math.round(p.coronas)))
}

/** Resumen de coronas de las partidas: cuántas con 3, 2, 1, 0 y en juego, y el total. */
export function resumenCoronas(ps: Pick<Partida, 'coronas'>[]) {
  const r = { total: 0, tres: 0, dos: 0, una: 0, cero: 0, enJuego: 0 }
  for (const p of ps) {
    const c = coronasDe(p)
    if (c == null) { r.enJuego++; continue }
    r.total += c
    if (c === 3) r.tres++; else if (c === 2) r.dos++; else if (c === 1) r.una++; else r.cero++
  }
  return r
}

/**
 * La escalera de arenas: posición (0 a 1) de unos trofeos en una pista donde cada arena ocupa el mismo ancho
 * (los cortes ya son casi logarítmicos), y dentro de su arena se avanza en escala log. Leyenda llena la pista.
 */
export function posicionArena(trofeos: number, arenas: Arena[]): number {
  const xs = [...arenas].sort((a, b) => a.desde - b.desde)
  if (!xs.length) return 0
  const t = Math.max(0, trofeos)
  let i = 0
  for (let k = 0; k < xs.length; k++) if (t >= xs[k].desde) i = k
  const tramo = 1 / xs.length
  const ini = xs[i].desde, fin = xs[i + 1]?.desde
  if (fin == null) return 1
  const dentro = ini <= 0 ? (fin <= 1 ? 0 : Math.log1p(t) / Math.log1p(fin)) : Math.log(Math.max(t, ini) / ini) / Math.log(fin / ini)
  return Math.min(1, (i + Math.max(0, Math.min(1, dentro))) * tramo)
}

/**
 * Las filas de una liga que caben a la vista: el podio (3) y la vecindad de Daniel (los `alrededor` de arriba y de
 * abajo), con un hueco marcado entre bloques. Si Daniel no está en la liga, solo el podio y lo que sigue hasta `tope`.
 */
export function ventanaLiga(filas: FilaRanking[], alrededor = 3, podio = 3): (FilaRanking | { hueco: number })[] {
  const xs = [...filas].sort((a, b) => a.lugar - b.lugar || b.trofeos - a.trofeos)
  const i = xs.findIndex(f => f.tuyo)
  const quedan = new Set<number>()
  for (let k = 0; k < Math.min(podio, xs.length); k++) quedan.add(k)
  if (i >= 0) for (let k = Math.max(0, i - alrededor); k <= Math.min(xs.length - 1, i + alrededor); k++) quedan.add(k)
  else for (let k = 0; k < Math.min(podio + alrededor * 2, xs.length); k++) quedan.add(k)
  const orden = [...quedan].sort((a, b) => a - b)
  const out: (FilaRanking | { hueco: number })[] = []
  orden.forEach((k, j) => {
    if (j > 0 && k - orden[j - 1] > 1) out.push({ hueco: k - orden[j - 1] - 1 })
    out.push(xs[k])
  })
  return out
}

/** Cuándo se calculó el juego, dicho para el dueño, y si ya está viejo (más de 30 h: el cron diario falló). */
export function lecturaDelJuego(calculado: string | null | undefined, ahora = Date.now()): { texto: string; viejo: boolean } {
  const t = calculado ? Date.parse(calculado) : NaN
  if (!Number.isFinite(t)) return { texto: 'sin fecha de cálculo', viejo: true }
  const horas = (ahora - t) / 36e5
  const fmt = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  const hoy = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short' })
  const mismoDia = hoy.format(t) === hoy.format(ahora)
  const hora = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }).format(t)
  return { texto: mismoDia ? `hoy ${hora}` : fmt.format(t).replace(/\./g, ''), viejo: horas > 30 }
}

/** Los puntos de la semana (3) o de la temporada (12): cuáles ya se jugaron. */
export const casillas = (hechos: number, meta: number) => Array.from({ length: Math.max(meta, 0) }, (_, i) => i < hechos)

/** Lo que el veredicto le dice al dueño, en una línea. */
export function textoVeredicto(r: Pick<Repeticion, 'veredicto'>): { titulo: string; detalle: string } {
  const c = cartaDe(r.veredicto)
  if (c) return { titulo: `Se quedó corto en ${c.nombre.toLowerCase()}`, detalle: `Es la primera métrica debajo de tu mediana en el orden del diagnóstico. Para el siguiente: ${c.sube}.` }
  if (r.veredicto === 'ninguna') return { titulo: 'Ninguna métrica abajo', detalle: 'Las cinco cumplieron contra tu mediana: repite la receta.' }
  return { titulo: 'Sin datos para el veredicto', detalle: 'Faltan métricas de este video; abajo dice cuáles.' }
}

/** El ancho (0 a 1) de un medidor contra su mediana: la mediana queda al centro de la pista (ratio 1 → 0.5), tope ×2. */
export const anchoMedidor = (ratio: number | null | undefined) => (ratio == null || !Number.isFinite(ratio) ? 0 : Math.max(0.02, Math.min(1, ratio / 2)))

/** Mazos ordenados para pintar: por tasa de coronas y, a igual tasa, más videos primero (más evidencia). */
export const ordenarMazos = (xs: Mazo[]) => [...xs].sort((a, b) => b.tasa_coronas - a.tasa_coronas || b.videos - a.videos || b.coronas - a.coronas)
