/**
 * Estrategia › Competidores (15 nov 2026). Daniel: «quiero algo dedicado a esto, tipo una lista, pero ademas miembros en
 * su comunidad, "oferta" que puedas inferir, mensaje, etc… faltan "las nuevas promesas"».
 *
 * Lógica pura de la lista (sin React ni fs): de dónde sale (el bloque `competidores` de mercado.json, o, en un archivo v1,
 * los hispanos y anglos de «Contra quién»), cómo se filtra (establecidos, nuevas promesas, anglo), cómo se ordena (tamaño o
 * velocidad) y el número que se pinta en cada fila. Ninguna cifra se inventa: lo que no trae el archivo es `null` y la fila
 * dice «sin dato»; un tamaño que solo existe como texto («260K suscriptores») se lee de ese texto, nunca se estima.
 */
import type { Canal, Competidor, Competidores, ContraQuien, FichaCompetidor, GrupoCompetidor, Mercado, Oferta, Referente } from './estrategia'

/** «Benjamín Cordero · Imperio Agéntico» → «benjamin-cordero-imperio-agentico». */
export const slug = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

export const FILTROS = ['todos', 'establecido', 'promesa', 'anglo'] as const
export type Filtro = (typeof FILTROS)[number]
export const ORDENES = ['tamano', 'velocidad'] as const
export type Orden = (typeof ORDENES)[number]

/** «260K suscriptores» → 260000; «1.12M» → 1120000; «4,283 miembros» → 4283; «~367K» → 367000. Sin número, null. */
export function aNumero(valor: string | null | undefined): number | null {
  if (!valor) return null
  const m = /(\d[\d,.]*)\s*([kKmM])?(?![a-zA-Z])/.exec(valor.replace(/ /g, ' '))
  if (!m) return null
  let base = m[1]
  const sufijo = m[2]?.toLowerCase()
  // «4,283» es miles; «1.12» con sufijo es decimal; «4.283» sin sufijo (miles a la europea) también.
  if (sufijo) base = base.replace(/,/g, '')
  else base = /^\d{1,3}([.,]\d{3})+$/.test(base) ? base.replace(/[.,]/g, '') : base.replace(/,/g, '')
  const n = Number(base)
  if (!Number.isFinite(n)) return null
  return Math.round(n * (sufijo === 'k' ? 1e3 : sufijo === 'm' ? 1e6 : 1))
}

const esYoutube = (tipo: string) => /youtube/i.test(tipo)

/** El tamaño de una ficha: su audiencia mayor (el canal con más seguidores o los miembros de su comunidad). */
export function tamanoDe(f: FichaCompetidor): number | null {
  const xs = [...f.canales.map(c => c.seguidores ?? aNumero(c.valor)), f.comunidad?.miembros ?? aNumero(f.comunidad?.valor)]
    .filter((n): n is number => n !== null && n > 0)
  return xs.length ? Math.max(...xs) : null
}

/** El canal que da la medida en la fila: YouTube si hay; si no, el de más seguidores. */
export function canalPrincipal(f: FichaCompetidor) {
  return f.canales.find(c => esYoutube(c.tipo)) ?? [...f.canales].sort((a, b) => (b.seguidores ?? aNumero(b.valor) ?? 0) - (a.seguidores ?? aNumero(a.valor) ?? 0))[0] ?? null
}

/**
 * La velocidad en un solo número comparable: % de crecimiento de seguidores en ~30 días. Si el censo solo trae los
 * seguidores ganados en ~30 días, se divide entre lo que tenía antes. Nada más se vuelve porcentaje: las vistas (cada censo
 * las mide distinto: del canal en 28 días o de los videos largos en 30) y lo ganado en 7 días son otras ventanas y solo se
 * muestran, no ordenan.
 */
export function velocidadDe(f: FichaCompetidor): { pct: number | null; semana: number | null } {
  const v = f.velocidad
  if (!v) return { pct: null, semana: null }
  if (v.pct_30d !== null) return { pct: v.pct_30d, semana: v.seguidores_7d }
  const c = canalPrincipal(f), hoy = c ? c.seguidores ?? aNumero(c.valor) : null
  if (v.seguidores_30d !== null && hoy && hoy > v.seguidores_30d) return { pct: (v.seguidores_30d / (hoy - v.seguidores_30d)) * 100, semana: v.seguidores_7d }
  return { pct: null, semana: v.seguidores_7d }
}

export const filtrar = (xs: FichaCompetidor[], filtro: Filtro) => (filtro === 'todos' ? xs : xs.filter(f => f.grupo === filtro))

/** Ordena sin perder a nadie: los que no tienen dato van al final, en orden alfabético, y la vista los marca. */
export function ordenar(xs: FichaCompetidor[], orden: Orden): FichaCompetidor[] {
  const alfa = (a: FichaCompetidor, b: FichaCompetidor) => a.nombre.localeCompare(b.nombre, 'es')
  if (orden === 'tamano') return [...xs].sort((a, b) => (tamanoDe(b) ?? -1) - (tamanoDe(a) ?? -1) || alfa(a, b))
  // Primero quien trae su % medido; los demás, después y por tamaño (no se inventa un % que no se midió).
  const clave = (f: FichaCompetidor): [number, number] => {
    const v = velocidadDe(f)
    return v.pct !== null ? [0, -v.pct] : [1, -(tamanoDe(f) ?? -1)]
  }
  return [...xs].sort((a, b) => { const x = clave(a), y = clave(b); return x[0] - y[0] || x[1] - y[1] || alfa(a, b) })
}

export const conDato = (f: FichaCompetidor, orden: Orden) => (orden === 'tamano' ? tamanoDe(f) !== null : velocidadDe(f).pct !== null)

export function cuentas(xs: FichaCompetidor[]): Record<Filtro, number> {
  return { todos: xs.length, establecido: xs.filter(f => f.grupo === 'establecido').length, promesa: xs.filter(f => f.grupo === 'promesa').length, anglo: xs.filter(f => f.grupo === 'anglo').length }
}

/** «1,120,000» → «1.1M»; «4,283» → «4.3K»; «870» → «870». */
export function compacto(n: number): string {
  const a = Math.abs(n)
  const f = (x: number, s: string) => `${x >= 100 ? Math.round(x) : Number(x.toFixed(1))}${s}`
  if (a >= 1e6) return f(n / 1e6, 'M')
  if (a >= 1e3) return f(n / 1e3, 'K')
  return String(Math.round(n))
}

const GRATIS = /^(0|0 usd|gratis|free)\b|^«?SUSCR[IÍ]BETE.*GRATIS/i
/** El primer escalón que cobra (la entrada de pago): el mensual con número si hay; si no, la primera oferta de pago. */
export function entradaDe(f: FichaCompetidor): { precio: string; oculto: boolean; usd_mes: number | null } | null {
  // «sin dato» o «desconocido» no es un precio: no se pinta como entrada (sí «oculto», que es un dato: tras llamada).
  const pago = f.oferta.filter(o => !GRATIS.test(o.precio.trim()) && o.forma !== 'gratis' && (o.oculto || !/^(sin dato|desconocido|no p[uú]blico)\b/i.test(o.precio.trim())))
  const o = pago.find(x => x.usd_mes !== null) ?? pago.find(x => /\d/.test(x.precio)) ?? pago[0]
  return o ? { precio: o.precio.split(/\s\(|;\s|,\s|\scon\s/)[0], oculto: o.oculto, usd_mes: o.usd_mes } : null
}

// ── Archivo v1: la lista sale de «Contra quién» (8 nov) mientras no exista el censo del 15 nov ──

const canalV1 = (c: Canal) => ({ tipo: c.tipo.replace(/_/g, ' '), valor: c.valor, seguidores: aNumero(c.valor), url: c.url, fuente: c.fuente, fecha: c.fecha })
const COMUNIDAD = /skool|comunidad|circle|discord|whop/i
function comunidadV1(cs: Canal[]) {
  const c = cs.find(x => COMUNIDAD.test(x.tipo) && /pago/i.test(x.tipo)) ?? cs.find(x => COMUNIDAD.test(x.tipo))
  if (!c) return null
  return { plataforma: c.tipo.replace(/_/g, ' ').replace(/\s*(de\s+)?(pago|gratis)$/i, '') || c.tipo, acceso: /pago/i.test(c.tipo) ? 'pago' as const : /gratis/i.test(c.tipo) ? 'gratis' as const : null,
    miembros: aNumero(c.valor), valor: c.valor, url: c.url, fuente: c.fuente, fecha: c.fecha }
}
const ofertaV1 = (o: Oferta) => ({ nombre: o.oferta, precio: o.precio, usd_mes: null, forma: GRATIS.test(o.precio.trim()) ? 'gratis' : null, promesa: o.promesa && o.promesa !== '—' ? o.promesa : null,
  oculto: /oculto|tras (una )?llamada/i.test(o.precio), inferido: false, url: o.url, fuente: null, fecha: null })
const fuentesV1 = (x: { canales: Canal[]; ofertas: Oferta[] }) => [...x.canales.map(c => c.url && { url: c.url, que: c.tipo.replace(/_/g, ' '), fecha: c.fecha }), ...x.ofertas.map(o => o.url && { url: o.url, que: o.oferta, fecha: null })]
  .filter((f): f is { url: string; que: string; fecha: string | null } => !!f && /^https?:\/\//.test(f.url))
  .filter((f, i, xs) => xs.findIndex(y => y.url === f.url) === i)

function deHispano(c: Competidor): FichaCompetidor {
  const [nombre, marca] = c.nombre.split(/\s·\s/)
  return {
    id: slug(c.nombre), nombre: nombre.trim(), marca: marca?.trim() ?? null, mercado: 'hispano', grupo: 'establecido', pais: c.pais && c.pais !== 'no verificado' ? c.pais : null,
    descripcion: c.avatar, canales: c.canales.map(canalV1), comunidad: comunidadV1(c.canales), oferta: c.ofertas.map(ofertaV1),
    mensaje: null, mecanismo: null, sofisticacion: null, cadencia: null, velocidad: null, por_que_crece: null, mejor_que_tu: null, cambios: null,
    imagen: c.imagen, fuentes: fuentesV1(c),
  }
}
function deAnglo(r: Referente): FichaCompetidor {
  return {
    id: slug(r.nombre), nombre: r.nombre, marca: null, mercado: 'anglo', grupo: 'anglo', pais: null,
    descripcion: r.categoria ?? r.avatar, canales: r.canales.map(canalV1), comunidad: comunidadV1(r.canales), oferta: r.ofertas.map(ofertaV1),
    mensaje: null, mecanismo: null, sofisticacion: null, cadencia: null, velocidad: null, por_que_crece: null,
    mejor_que_tu: r.adelanto ? r.adelanto.replace(/^\(lectura\)\s*/i, '') : null, cambios: null, imagen: r.imagen, fuentes: fuentesV1(r),
  }
}

/** La lista que pinta la sección: el censo si existe; si no, la de «Contra quién» (directos y alcance en español, y todos los anglos). */
export function listaDe(m: Mercado): (Competidores & { desde: 'censo' | 'contra' }) | null {
  if (m.competidores) return { ...m.competidores, desde: 'censo' }
  const c: ContraQuien | null = m.contra_quien
  if (!c || (!c.hispanos.length && !c.anglos.length)) return null
  return {
    fuente: c.fuente, fecha: c.fecha, metodo: null, limites: c.limites, desde: 'contra', tu: null,
    lista: [...c.hispanos.filter(h => h.grupo === 'directo' || h.grupo === 'alcance').map(deHispano), ...c.anglos.map(deAnglo)],
  }
}

export const NOMBRE_GRUPO: Record<GrupoCompetidor, string> = { establecido: 'Establecido', promesa: 'Nueva promesa', anglo: 'Anglo' }
