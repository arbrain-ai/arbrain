/**
 * Tu negocio › El pulso › Marketing, por canal (8 nov 2026). El órgano decía «Sin datos todavía: falta el sensor»; el dueño
 * lo quiere para sus canales de YouTube, el principal primero.
 *
 * El sensor es `arbrain/server/scripts/analytics/marketing_canales.py` (diario): por canal y por día, vistas y suscriptores
 * (YouTube Analytics) e impresiones y clics de miniatura (YouTube Reporting), en `store/marketing-canales.json`. Los clics a
 * la comunidad (enlaces rastreados, `link_clicks`) los lee el servidor en vivo. Aquí, lógica pura: leer el archivo con
 * tolerancia y armar la semana de cada canal. Cada cifra lleva su fuente y sus fechas; lo no medido es «esperando primer
 * dato», nunca un 0. La usan la API, el pulso, Business Intelligence y node:test.
 */

export const RUTA_MARKETING = ['arbrain', 'server', 'store', 'marketing-canales.json'] as const
export const ESQUEMA_MARKETING = 'arbrain.marketing/v1'
export const URL_MARKETING = '/api/negocio/marketing'


export interface DiaAnalytics { fecha: string; vistas: number; subs_ganados: number; subs_perdidos: number }
export interface DiaAlcance { fecha: string; impresiones: number; clics_miniatura: number }
export interface SerieSensor<T> { fuente: string; hasta: string | null; dias: T[] }
export interface CanalSensor {
  clave: string; id: string; nombre: string
  estado: 'ok' | 'sin-token' | 'error'
  leido?: string; error?: string
  analytics: SerieSensor<DiaAnalytics> | null
  /** null = el reporte de miniaturas todavía no da su primer dato. */
  alcance: SerieSensor<DiaAlcance> | null
}
export interface ArchivoMarketing { generado: string | null; canales: CanalSensor[] }

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const fecha = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const texto = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : undefined)

function serie<T extends { fecha: string }>(x: unknown, campos: (keyof T)[]): SerieSensor<T> | null {
  if (!obj(x) || !Array.isArray(x.dias)) return null
  const dias = x.dias.filter((d): d is T => obj(d) && fecha(d.fecha) && campos.every(c => n(d[c as string]) !== null))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  return { fuente: texto(x.fuente) ?? '', hasta: dias.length ? dias[dias.length - 1].fecha : null, dias }
}

/** El archivo del sensor, leído con tolerancia: el día que no trae sus números se descarta (no se vuelve 0). */
export function leerMarketing(x: unknown): { archivo: ArchivoMarketing | null; errores: string[] } {
  if (!obj(x) || !Array.isArray(x.canales)) return { archivo: null, errores: ['El archivo del sensor no trae «canales».'] }
  const errores: string[] = []
  if (x.esquema !== ESQUEMA_MARKETING) errores.push(`«esquema» debería ser «${ESQUEMA_MARKETING}».`)
  const canales: CanalSensor[] = []
  for (const c of x.canales) {
    if (!obj(c) || !texto(c.clave) || !texto(c.nombre)) { errores.push('Un canal sin «clave» o «nombre».'); continue }
    const estado = c.estado === 'ok' || c.estado === 'sin-token' ? c.estado : 'error'
    canales.push({
      clave: texto(c.clave)!, id: texto(c.id) ?? '', nombre: texto(c.nombre)!, estado, leido: texto(c.leido), error: texto(c.error),
      analytics: serie<DiaAnalytics>(c.analytics, ['vistas', 'subs_ganados', 'subs_perdidos']),
      alcance: serie<DiaAlcance>(c.alcance, ['impresiones', 'clics_miniatura']),
    })
  }
  return { archivo: { generado: texto(x.generado) ?? null, canales }, errores }
}

// ── Fechas civiles (AAAA-MM-DD) ──

const civil = (f: string) => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
export const masDias = (f: string, k: number) => { const d = civil(f); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10) }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const dm = (f: string) => { const d = civil(f); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` }
/** «30 oct – 5 nov». */
export const rango = (desde: string, hasta: string) => `${dm(desde)} – ${dm(hasta)}`

// ── La semana de cada canal ──

export type IdCifra = 'subs' | 'vistas' | 'impresiones' | 'ctr' | 'clics'
export interface Cifra {
  id: IdCifra; etiqueta: string
  /** El número ya en texto; null = esperando primer dato. */
  valor: string | null
  /** Contra los 7 días anteriores («+12 %»); solo si ambas semanas están medidas completas. */
  cambio?: string
  /** El detalle del número («ganó 74, perdió 31»). */
  nota?: string
  /** Las fechas que cubre (7 días cerrados) y de dónde sale. */
  desde?: string; hasta?: string; fuente: string
  /** Sin número: por qué. */
  espera?: string
}
export interface CanalPulso {
  clave: string; nombre: string
  estado: 'numero' | 'esperando' | 'sin-token' | 'error'
  cifras: Cifra[]
  /** Error del canal (con foto anterior o sin ella). */
  error?: string
}

/** Clics a la comunidad por canal y día (de `link_clicks`), hasta el último día cerrado. null = el canal no tiene enlaces rastreados. */
export interface ClicsCanal { porDia: Record<string, number> | null; hasta: string; fuente: string; error?: string }

const FUENTE_CLICS = 'Enlaces rastreados · clics a la comunidad'
const entero = (v: number) => Math.round(v).toLocaleString('es-MX')
const porcentaje = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
function cambio(a: number, b: number | null): string | undefined {
  if (b === null || b <= 0) return undefined
  const d = (a - b) / b
  if (Math.abs(d) < 0.005) return 'igual que la semana anterior'
  return `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)} % contra la semana anterior`
}

/** Suma 7 días que terminan en `hasta`; null si falta alguno (una semana incompleta no se reporta como semana). */
function semana<T extends { fecha: string }>(dias: T[], hasta: string, f: (d: T) => number): number | null {
  const por = new Map(dias.map(d => [d.fecha, d]))
  let s = 0
  for (let k = 0; k < 7; k++) { const d = por.get(masDias(hasta, -k)); if (!d) return null; s += f(d) }
  return s
}

/**
 * La tarjeta de un canal: suscriptores nuevos, vistas, impresiones, CTR y clics a la comunidad de los últimos 7 días
 * cerrados de cada fuente. Analytics y Reporting tardan 1 a 3 días; los clics se leen hasta ayer. Cada cifra dice su
 * semana. Un canal sin vistas medidas ni reporte de miniaturas queda «esperando primer dato».
 */
export function canalPulso(c: CanalSensor, clics: ClicsCanal | null): CanalPulso {
  const base = { clave: c.clave, nombre: c.nombre }
  if (c.estado === 'sin-token') return { ...base, estado: 'sin-token', cifras: [], error: 'Falta autorizar el canal (un clic del dueño).' }
  if (c.estado === 'error' && !c.analytics) return { ...base, estado: 'error', cifras: [], error: c.error ?? 'El sensor no pudo leer el canal.' }
  const cifras: Cifra[] = []
  const a = c.analytics, r = c.alcance
  const fa = a?.fuente || 'YouTube Analytics', fr = r?.fuente || 'YouTube Reporting · miniaturas'
  const aHasta = a?.hasta ?? null
  const algoMedido = !!a?.dias.some(d => d.vistas > 0 || d.subs_ganados > 0) || !!r?.dias.length
  if (!algoMedido) {
    return { ...base, estado: 'esperando', error: c.estado === 'error' ? c.error : undefined, cifras: [
      { id: 'vistas', etiqueta: 'Vistas', valor: null, fuente: fa, espera: 'Esperando primer dato: el canal todavía no registra vistas.' },
      { id: 'impresiones', etiqueta: 'Impresiones', valor: null, fuente: fr, espera: r ? 'Esperando primer dato.' : 'Esperando primer dato: el reporte de miniaturas tarda hasta 48 h desde que se autorizó.' },
    ] }
  }

  if (a && aHasta) {
    const desde = masDias(aHasta, -6), prev = masDias(aHasta, -7)
    const ganados = semana(a.dias, aHasta, d => d.subs_ganados), perdidos = semana(a.dias, aHasta, d => d.subs_perdidos)
    const vistas = semana(a.dias, aHasta, d => d.vistas)
    if (ganados !== null && perdidos !== null) cifras.push({ id: 'subs', etiqueta: 'Suscriptores nuevos', valor: entero(ganados), cambio: cambio(ganados, semana(a.dias, prev, d => d.subs_ganados)), nota: `perdió ${entero(perdidos)}: neto ${ganados - perdidos >= 0 ? '+' : '−'}${entero(Math.abs(ganados - perdidos))}`, desde, hasta: aHasta, fuente: fa })
    else cifras.push({ id: 'subs', etiqueta: 'Suscriptores nuevos', valor: null, fuente: fa, espera: 'Faltan días en la semana del sensor.' })
    if (vistas !== null) cifras.push({ id: 'vistas', etiqueta: 'Vistas', valor: entero(vistas), cambio: cambio(vistas, semana(a.dias, prev, d => d.vistas)), desde, hasta: aHasta, fuente: fa })
    else cifras.push({ id: 'vistas', etiqueta: 'Vistas', valor: null, fuente: fa, espera: 'Faltan días en la semana del sensor.' })
  } else {
    cifras.push({ id: 'vistas', etiqueta: 'Vistas', valor: null, fuente: fa, espera: 'Esperando primer dato.' })
  }

  const rHasta = r?.hasta ?? null
  const imp = r && rHasta ? semana(r.dias, rHasta, d => d.impresiones) : null
  const cm = r && rHasta ? semana(r.dias, rHasta, d => d.clics_miniatura) : null
  if (r && rHasta && imp !== null && cm !== null) {
    const desde = masDias(rHasta, -6), prev = masDias(rHasta, -7)
    cifras.push({ id: 'impresiones', etiqueta: 'Impresiones', valor: entero(imp), cambio: cambio(imp, semana(r.dias, prev, d => d.impresiones)), desde, hasta: rHasta, fuente: fr })
    cifras.push({ id: 'ctr', etiqueta: 'CTR de miniatura', valor: imp > 0 ? porcentaje(cm / imp) : null, nota: imp > 0 ? `${entero(cm)} clics de ${entero(imp)} impresiones` : undefined, desde, hasta: rHasta, fuente: fr, espera: imp > 0 ? undefined : 'Sin impresiones en la semana.' })
  } else {
    const espera = r ? 'Faltan días en el reporte de miniaturas.' : 'Esperando primer dato: el reporte de miniaturas tarda hasta 48 h desde que se autorizó.'
    cifras.push({ id: 'impresiones', etiqueta: 'Impresiones', valor: null, fuente: fr, espera })
    cifras.push({ id: 'ctr', etiqueta: 'CTR de miniatura', valor: null, fuente: fr, espera })
  }

  if (!clics) cifras.push({ id: 'clics', etiqueta: 'Clics a la comunidad', valor: null, fuente: FUENTE_CLICS, espera: 'No se pudieron leer los enlaces rastreados.' })
  else if (clics.error) cifras.push({ id: 'clics', etiqueta: 'Clics a la comunidad', valor: null, fuente: clics.fuente, espera: clics.error })
  else if (!clics.porDia) cifras.push({ id: 'clics', etiqueta: 'Clics a la comunidad', valor: null, fuente: clics.fuente, espera: 'Esperando primer dato: el canal todavía no tiene enlaces rastreados.' })
  else {
    const d = clics.porDia, h = clics.hasta
    const suma = (fin: string) => { let s = 0; for (let k = 0; k < 7; k++) s += d[masDias(fin, -k)] ?? 0; return s }
    const esta = suma(h)
    cifras.push({ id: 'clics', etiqueta: 'Clics a la comunidad', valor: entero(esta), cambio: cambio(esta, suma(masDias(h, -7))), desde: masDias(h, -6), hasta: h, fuente: clics.fuente })
  }
  return { ...base, estado: 'numero', cifras, error: c.estado === 'error' ? c.error : undefined }
}

/** Respuesta de /api/negocio/marketing. `canales` en el orden del sensor (el principal primero). */
export type RespuestaMarketing =
  | { activo: false }
  | { activo: true; generado: string | null; canales: CanalPulso[]; errores?: string[]; falta?: string }

/** Los clics de `link_clicks` agrupados por canal y día civil, a partir de sus enlaces (`tracked_links`). */
export interface Enlace { id: string; slug: string; source: string | null; campaign: string | null; metadata: unknown }
/** Canal de un enlace rastreado: `metadata.canal` si lo trae; si no, los de `source = youtube` son del canal principal. */
export function canalDeEnlace(e: Enlace, principal: string): string | null {
  const m = obj(e.metadata) ? texto(e.metadata.canal) : undefined
  if (m) return m
  return e.source === 'youtube' ? principal : null
}
/** El id del canal principal: el que el sensor marca con clave `principal` (o el primero). */
export const principalDe = (a: ArchivoMarketing | null | undefined) => (a?.canales.find(c => c.clave === 'principal') ?? a?.canales[0])?.id ?? ''
export function clicsPorCanal(enlaces: Enlace[], clics: { link_id: string; dia: string }[], hasta: string, principal: string): Map<string, Record<string, number>> {
  const canal = new Map(enlaces.map(e => [e.id, canalDeEnlace(e, principal)]))
  const out = new Map<string, Record<string, number>>()
  for (const e of enlaces) { const c = canal.get(e.id); if (c && !out.has(c)) out.set(c, {}) }
  for (const c of clics) {
    const k = canal.get(c.link_id)
    if (!k || c.dia > hasta) continue
    const m = out.get(k)!
    m[c.dia] = (m[c.dia] ?? 0) + 1
  }
  return out
}
