/**
 * Un solo filtro para Contenido (19 nov 2026). El dueño: «en el radar veo un montón de botones… un botón tipo filtro en
 * lugar de ver tantos botones relacionados al nicho, al tiempo, español e inglés… simplificarlo y unificarlo en un solo
 * filtro». Un campo que entiende texto («claude code español 30 días mis 4 ×10») y lo vuelve fichas que se quitan con ✕.
 *
 * Lógica pura, sin modelo: un vocabulario fijo (temas del universo, nombres de canal, idiomas, ventanas, ×N y atajos).
 * Lo que no se reconoce queda como texto que se busca en título y canal. Vacío = lo de hoy: su nicho, español e inglés,
 * 30 días y su universo (sin descubiertos ni mentalidad).
 */
import { esEsEn, fuerzaFresca, type TemaChip } from './pantalla'
import { NOMBRE_CAPA } from './modelo'
import type { CanalCuartel, VideoCuartel } from './tipos'

export type Ficha =
  | { k: 'idioma'; v: 'es' | 'en' }
  | { k: 'ventana'; dias: number }
  | { k: 'tema'; slug: string }
  | { k: 'nicho' }
  | { k: 'todo' }
  | { k: 'canal'; id: string }
  | { k: 'mis4' }
  | { k: 'mult'; min: number }
  | { k: 'capa'; capa: string }
  | { k: 'texto'; q: string }

export interface CanalVocab { id: string; nombre: string; handle?: string | null }
export interface Vocabulario { temas: TemaChip[]; canales: CanalVocab[]; /** channel_id de sus referentes de estudio («mis 4»). */ mis4: string[] }

export const VENTANA_HOY = 30
const DIA = 864e5

/** minúsculas, sin acentos, «×» como «x» y espacios simples. */
export const normal = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim()

/** El vocabulario sale de la lectura: temas del universo, canales (sin el propio) y los marcados como referentes de estudio. */
export function vocabularioDe(temas: TemaChip[], canales: CanalCuartel[]): Vocabulario {
  const otros = canales.filter(c => c.capa !== 'propio')
  return { temas, canales: otros.map(c => ({ id: c.channel_id, nombre: c.nombre, handle: c.handle })), mis4: otros.filter(c => c.estudio).map(c => c.channel_id) }
}

// ── Reconocer una frase ──────────────────────────────────────────────────────

const CAPAS: Record<string, string> = { competencia: 'competencia', mentor: 'mentor', mentores: 'mentor', frontera: 'frontera', descubierto: 'descubierto', descubiertos: 'descubierto' }
const CONECTORES = new Set(['e', 'y', 'o', 'de', 'del', 'el', 'la', 'los', 'las', 'en', 'con', 'and', 'por', 'a', 'solo', 'ultimos', 'ultimas'])
const NUMEROS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, seis: 6, doce: 12 }

function ventanaDe(p: string): number | null {
  if (/^(hoy|24 ?h|1 dia|un dia)$/.test(p)) return 1
  if (/^(semana|esta semana|la semana)$/.test(p)) return 7
  if (/^(mes|este mes|el mes)$/.test(p)) return 30
  if (/^(ano|este ano|el ano|year|1 year)$/.test(p)) return 365
  const m = p.match(/^(\d{1,3}|un|una|uno|dos|tres|cuatro|seis|doce) ?(d|dias?|days?|sem|semanas?|weeks?|mes|meses|months?|anos?|years?)$/)
  if (!m) return null
  const n = /^\d/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1]]
  const u = m[2]
  const dias = /^(d|dia|dias|day|days)$/.test(u) ? n : /^(sem|semana|semanas|week|weeks)$/.test(u) ? n * 7 : /^(mes|meses|month|months)$/.test(u) ? n * 30 : n * 365
  return dias >= 1 ? Math.min(365, dias) : null
}

function multDe(crudo: string): number | null {
  const m = normal(crudo).match(/^(?:x(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)x)\+?$/)
  const n = m ? Number((m[1] ?? m[2]).replace(',', '.')) : NaN
  return Number.isFinite(n) && n >= 1 ? n : null
}

/** ¿Qué ficha es esta frase (ya normalizada)? `null` si no está en el vocabulario. */
function reconocer(p: string, crudo: string, voc: Vocabulario): Ficha | null {
  if (/^(mis (4|cuatro)( referentes)?|mis referentes|referentes de estudio)$/.test(p)) return { k: 'mis4' }
  if (/^((tu|mi) nicho|nicho)$/.test(p)) return { k: 'nicho' }
  if (/^(todos los temas|todos temas|cualquier tema|sin tema)$/.test(p)) return { k: 'todo' }
  if (/^(espanol|spanish)$/.test(p)) return { k: 'idioma', v: 'es' }
  if (/^(ingles|english)$/.test(p)) return { k: 'idioma', v: 'en' }
  const dias = ventanaDe(p)
  if (dias) return { k: 'ventana', dias }
  if (!p.includes(' ')) { const min = multDe(crudo); if (min) return { k: 'mult', min } }
  const tema = voc.temas.find(t => [t.corto, t.nombre, t.slug, t.slug.replace(/-/g, ' ')].some(x => normal(x) === p))
  if (tema) return { k: 'tema', slug: tema.slug }
  const canal = voc.canales.find(c => normal(c.nombre) === p || (!!c.handle && normal(c.handle).replace(/^@/, '') === p.replace(/^@/, '')))
  if (canal) return { k: 'canal', id: canal.id }
  if (CAPAS[p]) return { k: 'capa', capa: CAPAS[p] }
  return null
}

/**
 * El texto a fichas. Lee de izquierda a derecha y en cada lugar prueba la frase más larga primero (hasta 5 palabras):
 * «claude code» es un tema antes que dos palabras sueltas. Lo que no reconoce se junta como texto a buscar; los conectores
 * sueltos («e», «y», «de»…) se tiran solo si quedaron solos.
 */
export function analizar(texto: string, voc: Vocabulario): Ficha[] {
  const crudos = texto.split(/[\s,;]+/).filter(Boolean)
  const ps = crudos.map(normal)
  const out: Ficha[] = []
  let resto: string[] = []
  const soltar = () => {
    const q = resto.join(' ').trim()
    if (q && !resto.every(w => CONECTORES.has(normal(w)))) out.push({ k: 'texto', q })
    resto = []
  }
  for (let i = 0; i < ps.length;) {
    let hallada: Ficha | null = null, largo = 0
    for (let n = Math.min(5, ps.length - i); n >= 1 && !hallada; n--) {
      const f = reconocer(ps.slice(i, i + n).join(' '), crudos.slice(i, i + n).join(' '), voc)
      if (f) { hallada = f; largo = n }
    }
    if (hallada) { soltar(); out.push(hallada); i += largo } else { resto.push(crudos[i]); i++ }
  }
  soltar()
  return out
}

// ── Juntar fichas ────────────────────────────────────────────────────────────

export const claveFicha = (f: Ficha): string => {
  switch (f.k) {
    case 'idioma': return `idioma:${f.v}`
    case 'ventana': return 'ventana'
    case 'tema': return `tema:${f.slug}`
    case 'canal': return `canal:${f.id}`
    case 'mult': return 'mult'
    case 'capa': return 'capa'
    case 'texto': return `texto:${normal(f.q)}`
    default: return f.k
  }
}

/** Añade fichas: las de un solo valor (ventana, ×N, capa) reemplazan a la anterior; las repetidas no se duplican. */
export function sumar(actuales: Ficha[], nuevas: Ficha[]): Ficha[] {
  const out = [...actuales]
  for (const f of nuevas) {
    const k = claveFicha(f)
    const i = out.findIndex(x => claveFicha(x) === k)
    if (i >= 0) out[i] = f
    else out.push(f)
    // «Tu nicho» y «todos los temas» se excluyen entre sí.
    if (f.k === 'nicho' || f.k === 'todo') { const otra = f.k === 'nicho' ? 'todo' : 'nicho'; const j = out.findIndex(x => x.k === otra); if (j >= 0) out.splice(j, 1) }
  }
  return out
}

export const quitar = (actuales: Ficha[], f: Ficha): Ficha[] => actuales.filter(x => claveFicha(x) !== claveFicha(f))

/** Lo que la pantalla aplica. `temas`/`canales` en null = sin ese filtro; `capa` en null = su universo. */
export interface Criterio {
  idiomas: ('es' | 'en')[]
  dias: number
  temas: Set<string> | null
  canales: Set<string> | null
  multMin: number | null
  capa: string | null
  textos: string[]
  /** ¿Quedó como lo de hoy? (sin fichas). Inicio sigue con el feed de PULSO tal cual. */
  deHoy: boolean
  /** Huella de las fichas: cambia solo si cambia el filtro (no con cada relectura del cuartel). */
  clave: string
}

export function resolver(fichas: Ficha[], voc: Vocabulario): Criterio {
  const idiomas = [...new Set(fichas.flatMap(f => (f.k === 'idioma' ? [f.v] : [])))]
  const ventana = [...fichas].reverse().find((f): f is Extract<Ficha, { k: 'ventana' }> => f.k === 'ventana')
  const temasExpl = fichas.flatMap(f => (f.k === 'tema' ? [f.slug] : []))
  const nicho = voc.temas.filter(t => t.nicho).map(t => t.slug)
  const ids = fichas.flatMap(f => (f.k === 'canal' ? [f.id] : f.k === 'mis4' ? voc.mis4 : []))
  const textos = fichas.flatMap(f => (f.k === 'texto' ? [normal(f.q)] : [])).filter(Boolean)
  const nombraAlguien = ids.length > 0 || textos.length > 0 || fichas.some(f => f.k === 'mis4')
  // El tema: lo que nombró; si nombró canales o buscó texto, ya no se restringe a su nicho (salvo que lo pida).
  const temas = temasExpl.length ? new Set(temasExpl)
    : fichas.some(f => f.k === 'todo') ? null
    : fichas.some(f => f.k === 'nicho') || !nombraAlguien ? (nicho.length ? new Set(nicho) : null)
    : null
  const mult = [...fichas].reverse().find((f): f is Extract<Ficha, { k: 'mult' }> => f.k === 'mult')
  const capa = [...fichas].reverse().find((f): f is Extract<Ficha, { k: 'capa' }> => f.k === 'capa')
  return {
    idiomas: idiomas.length ? idiomas : ['es', 'en'], dias: ventana?.dias ?? VENTANA_HOY, temas,
    // «Mis 4» sin marca en el universo no debe dejar la pantalla vacía en silencio: el conjunto vacío sí filtra (nada), y la barra lo dice.
    canales: ids.length || fichas.some(f => f.k === 'mis4') ? new Set(ids) : null,
    multMin: mult?.min ?? null, capa: capa?.capa ?? null, textos, deHoy: fichas.length === 0, clave: JSON.stringify(fichas),
  }
}

const enIdioma = (v: Pick<VideoCuartel, 'idioma'>, idiomas: Criterio['idiomas']) => (idiomas.length >= 2 ? esEsEn(v) : v.idioma === idiomas[0])

/** ¿Este video pasa el filtro? */
export function pasaVideo(v: VideoCuartel, c: Criterio, ahora = Date.now()): boolean {
  if (!enIdioma(v, c.idiomas)) return false
  if (ahora - Date.parse(v.publicado) > c.dias * DIA) return false
  if (c.capa ? v.capa !== c.capa : v.capa === 'mentalidad' || (v.capa === 'descubierto' && !c.canales)) return false
  if (c.canales && !c.canales.has(v.channel_id)) return false
  if (c.temas && !v.temas?.some(t => c.temas!.has(t))) return false
  if (c.multMin != null && (v.outlier?.puntaje ?? 0) < c.multMin) return false
  if (c.textos.length) { const h = normal(`${v.titulo} ${v.canal}`); if (!c.textos.every(q => h.includes(q))) return false }
  return true
}

/** El directorio de canales con el mismo filtro (sin ventana ni ×N, que son de videos). El texto se aplica al nombre
 *  solo si algún canal lo trae: «agentes autónomos» busca videos, no vacía el directorio. */
export function pasaCanales(canales: CanalCuartel[], c: Criterio): CanalCuartel[] {
  const base = canales.filter(x => x.capa !== 'propio' && (c.capa ? x.capa === c.capa : x.capa !== 'mentalidad' && (x.capa !== 'descubierto' || !!c.canales?.has(x.channel_id)))
    && (c.idiomas.length >= 2 || !x.idioma || x.idioma === c.idiomas[0])
    && (!c.canales || c.canales.has(x.channel_id))
    && (!c.temas || !!c.canales || !!x.temas?.some(t => c.temas!.has(t))))
  if (!c.textos.length) return base
  const porNombre = base.filter(x => { const h = normal(`${x.nombre} ${x.handle ?? ''}`); return c.textos.every(q => h.includes(q)) })
  return porNombre.length ? porNombre : base
}

/**
 * Inicio con filtro: lo que pasa, ordenado hacia la meta (nuevo y fuerte), máximo 2 por canal para que el que publica diario
 * no se lo coma. Si nombró canales, sin tope por canal; si buscó texto, lo más reciente primero.
 */
export function feedFiltrado(videos: VideoCuartel[], c: Criterio, o: { n?: number; ahora?: number } = {}): VideoCuartel[] {
  const ahora = o.ahora ?? Date.now(), n = o.n ?? 24
  const unicos = new Map<string, VideoCuartel>()
  for (const v of videos) if (!unicos.has(v.video_id) && v.capa !== 'propio' && pasaVideo(v, c, ahora)) unicos.set(v.video_id, v)
  const xs = [...unicos.values()]
  if (c.textos.length) return xs.sort((a, b) => Date.parse(b.publicado) - Date.parse(a.publicado)).slice(0, n)
  const orden = xs.map(v => ({ v, f: fuerzaFresca(v, ahora) })).sort((a, b) => b.f - a.f).map(x => x.v)
  if (c.canales) return orden.slice(0, n)
  const porCanal = new Map<string, number>(), out: VideoCuartel[] = []
  for (const v of orden) {
    const k = porCanal.get(v.channel_id) ?? 0
    if (k >= 2) continue
    porCanal.set(v.channel_id, k + 1); out.push(v)
    if (out.length >= n) break
  }
  return out
}

// ── Lo que se ve ─────────────────────────────────────────────────────────────

export function etiqueta(f: Ficha, voc: Vocabulario): string {
  switch (f.k) {
    case 'idioma': return f.v === 'es' ? 'Español' : 'Inglés'
    case 'ventana': return f.dias === 1 ? 'Hoy' : f.dias === 7 ? '7 días' : f.dias === 365 ? '1 año' : `${f.dias} días`
    case 'tema': return voc.temas.find(t => t.slug === f.slug)?.corto ?? f.slug
    case 'nicho': return 'Tu nicho'
    case 'todo': return 'Todos los temas'
    case 'canal': return voc.canales.find(c => c.id === f.id)?.nombre ?? 'Canal'
    case 'mis4': return 'Mis 4'
    case 'mult': return `×${f.min} o más`
    case 'capa': return f.capa === 'descubierto' ? 'Descubiertos' : NOMBRE_CAPA[f.capa] ?? f.capa
    case 'texto': return `«${f.q}»`
  }
}

/** Qué se está viendo, en una línea (lo que la barra dice cuando está vacía o al lado de las fichas). */
export function resumen(c: Criterio, voc: Vocabulario): string {
  const nicho = voc.temas.filter(t => t.nicho).map(t => t.slug)
  const temas = !c.temas ? 'todos los temas' : c.temas.size === nicho.length && nicho.every(s => c.temas!.has(s)) ? 'tu nicho' : null
  const idioma = c.idiomas.length >= 2 ? 'español e inglés' : c.idiomas[0] === 'es' ? 'español' : 'inglés'
  const dias = c.dias === 1 ? 'hoy' : c.dias === 7 ? '7 días' : c.dias === 365 ? '1 año' : `${c.dias} días`
  return [temas, idioma, dias, c.capa ? null : 'tu universo'].filter(Boolean).join(' · ')
}

export interface Sugerencia { grupo: string; ficha: Ficha; texto: string; detalle?: string }

/**
 * Sugerencias para lo que está escribiendo (la última palabra o frase). Sin texto: los atajos, las ventanas, los idiomas y
 * los temas de su nicho. Nunca sugiere lo que ya está puesto.
 */
export function sugerir(fragmento: string, voc: Vocabulario, puestas: Ficha[], max = 18): Sugerencia[] {
  const q = normal(fragmento)
  const ya = new Set(puestas.map(f => JSON.stringify(f)))
  const out: Sugerencia[] = []
  const add = (grupo: string, ficha: Ficha, texto: string, claves: string[], detalle?: string) => {
    if (ya.has(JSON.stringify(ficha))) return
    if (q && !claves.some(c => normal(c).startsWith(q) || normal(c).split(' ').some(w => w.startsWith(q)))) return
    out.push({ grupo, ficha, texto, detalle })
  }
  const mis4 = voc.canales.filter(c => voc.mis4.includes(c.id)).map(c => c.nombre)
  if (mis4.length) add('Atajos', { k: 'mis4' }, 'Mis 4', ['mis 4', 'mis cuatro', 'mis referentes', ...mis4], mis4.join(', '))
  add('Atajos', { k: 'nicho' }, 'Tu nicho', ['tu nicho', 'nicho'])
  add('Atajos', { k: 'todo' }, 'Todos los temas', ['todos los temas'])
  add('Atajos', { k: 'capa', capa: 'descubierto' }, 'Descubiertos', ['descubiertos'], 'fuera de tu universo')
  const m = multDe(fragmento)
  if (m) add('Rinde', { k: 'mult', min: m }, `×${m} o más`, [fragmento], 'veces sobre lo normal de su canal')
  else if (!q || /^x/.test(q)) for (const n of [3, 10]) add('Rinde', { k: 'mult', min: n }, `×${n} o más`, [`x${n}`])
  const d = ventanaDe(q)
  if (d) add('Ventana', { k: 'ventana', dias: d }, etiqueta({ k: 'ventana', dias: d }, voc), [q])
  else for (const dias of [7, 30, 90, 365]) add('Ventana', { k: 'ventana', dias }, etiqueta({ k: 'ventana', dias }, voc), [`${dias} dias`, dias === 365 ? '1 ano' : dias === 7 ? 'semana' : dias === 30 ? 'mes' : ''])
  add('Idioma', { k: 'idioma', v: 'es' }, 'Español', ['espanol', 'spanish'])
  add('Idioma', { k: 'idioma', v: 'en' }, 'Inglés', ['ingles', 'english'])
  for (const t of q ? voc.temas : voc.temas.filter(t => t.nicho)) add('Temas', { k: 'tema', slug: t.slug }, t.corto, [t.corto, t.nombre, t.slug.replace(/-/g, ' ')])
  if (q) for (const c of voc.canales) add('Canales', { k: 'canal', id: c.id }, c.nombre, [c.nombre, c.handle?.replace(/^@/, '') ?? ''])
  if (q) for (const capa of ['competencia', 'mentor', 'frontera']) add('Capa', { k: 'capa', capa }, NOMBRE_CAPA[capa], Object.keys(CAPAS).filter(p => CAPAS[p] === capa))
  return out.slice(0, max)
}

/** La última palabra que está escribiendo (lo que se completa con una sugerencia). */
export const ultimaPalabra = (texto: string): string => (/\s$/.test(texto) ? '' : texto.split(/\s+/).pop() ?? '')

export function guardable(x: unknown): Ficha[] {
  if (!Array.isArray(x)) return []
  return x.filter((f): f is Ficha => !!f && typeof f === 'object' && typeof (f as { k?: unknown }).k === 'string')
}
