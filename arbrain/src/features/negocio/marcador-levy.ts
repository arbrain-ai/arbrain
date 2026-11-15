/**
 * Tu negocio › El pulso › Marketing › Canal de Levy: el marcador por video (9 nov 2026). Daniel: «estandarizar las métricas».
 *
 * Una fila por video y siempre los mismos números, en el orden del embudo. Arriba, el total de la semana y una lectura de una
 * línea. El sensor es `arbrain/server/scripts/analytics/marcador_levy.py` (diario) y deja `store/marcador-levy.json`. Aquí,
 * lógica pura: leer ese archivo con tolerancia y armar lo que se ve. Lo que aún no llega es «aún sin dato», nunca 0; un 0 solo
 * aparece si la fuente ya midió el día en que el video estaba publicado. Sin metas ni semáforos: los números son espejo.
 */
import { dm, masDias, rango } from './marketing'

export const RUTA_MARCADOR = ['arbrain', 'server', 'store', 'marcador-levy.json'] as const
export const ESQUEMA_MARCADOR = 'arbrain.marcador-canal/v1'
export const URL_MARCADOR = '/api/negocio/marcador-levy'
export const AUN_SIN_DATO = 'aún sin dato'

// ── El archivo del sensor ──

export interface DiaCanal { fecha: string; vistas: number; subs_ganados: number; pct_visto: number | null }
export interface DiaAlcanceCanal { fecha: string; impresiones: number; clics_miniatura: number }
export interface VideoSensor {
  id: string; titulo: string; url: string; estado: 'publico' | 'programado'; publicado: string; duracion_s: number
  enlace: string | null; tipo: 'largo' | 'corto' | null
  analytics: { hasta: string; vistas: number; pct_visto: number; subs_ganados: number } | null
  alcance: { hasta: string; impresiones: number; clics_miniatura: number } | null
  retencion_30s: { hasta: string; valor: number } | null
}
export interface ClicsSensor { fuente: string; hasta: string | null; por_enlace: Record<string, Record<string, number>>; error?: string }
export interface ArchivoMarcador {
  generado: string | null; handle: string; estado: 'ok' | 'sin-token' | 'error'; error?: string
  analytics: { fuente: string; hasta: string | null; dias: DiaCanal[] } | null
  alcance: { fuente: string; hasta: string | null; dias: DiaAlcanceCanal[] } | null
  clics: ClicsSensor | null
  videos: VideoSensor[]
}

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const fecha = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const texto = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : undefined)
const ultima = <T extends { fecha: string }>(d: T[]) => (d.length ? d[d.length - 1].fecha : null)

function leerVideo(v: unknown): VideoSensor | null {
  if (!obj(v) || !texto(v.id) || !texto(v.titulo) || !fecha(v.publicado) || (v.estado !== 'publico' && v.estado !== 'programado')) return null
  const a = obj(v.analytics) && fecha(v.analytics.hasta) && n(v.analytics.vistas) !== null && n(v.analytics.pct_visto) !== null && n(v.analytics.subs_ganados) !== null ? v.analytics as VideoSensor['analytics'] : null
  const r = obj(v.alcance) && fecha(v.alcance.hasta) && n(v.alcance.impresiones) !== null && n(v.alcance.clics_miniatura) !== null ? v.alcance as VideoSensor['alcance'] : null
  const t = obj(v.retencion_30s) && fecha(v.retencion_30s.hasta) && n(v.retencion_30s.valor) !== null ? v.retencion_30s as VideoSensor['retencion_30s'] : null
  return {
    id: texto(v.id)!, titulo: texto(v.titulo)!, url: texto(v.url) ?? '', estado: v.estado, publicado: v.publicado, duracion_s: n(v.duracion_s) ?? 0,
    enlace: texto(v.enlace) ?? null, tipo: v.tipo === 'largo' || v.tipo === 'corto' ? v.tipo : null, analytics: a, alcance: r, retencion_30s: t,
  }
}

/** El archivo, leído con tolerancia: el día o el video que no trae lo suyo se descarta (no se vuelve 0). */
export function leerMarcador(x: unknown): { archivo: ArchivoMarcador | null; errores: string[] } {
  if (!obj(x)) return { archivo: null, errores: ['El archivo del marcador no se pudo leer.'] }
  const errores: string[] = []
  if (x.esquema !== ESQUEMA_MARCADOR) errores.push(`«esquema» debería ser «${ESQUEMA_MARCADOR}».`)
  const crudos = Array.isArray(x.videos) ? x.videos : []
  const videos = crudos.map(leerVideo).filter((v): v is VideoSensor => !!v)
  if (videos.length < crudos.length) errores.push(`${crudos.length - videos.length} video(s) sin sus datos mínimos.`)
  const a = obj(x.analytics) && Array.isArray(x.analytics.dias) ? x.analytics : null
  const diasA = (a?.dias as unknown[] ?? []).filter((d): d is DiaCanal => obj(d) && fecha(d.fecha) && n(d.vistas) !== null && n(d.subs_ganados) !== null).sort((p, q) => p.fecha.localeCompare(q.fecha))
  const r = obj(x.alcance) && Array.isArray(x.alcance.dias) ? x.alcance : null
  const diasR = (r?.dias as unknown[] ?? []).filter((d): d is DiaAlcanceCanal => obj(d) && fecha(d.fecha) && n(d.impresiones) !== null && n(d.clics_miniatura) !== null).sort((p, q) => p.fecha.localeCompare(q.fecha))
  let clics: ClicsSensor | null = null
  if (obj(x.clics)) {
    const por: Record<string, Record<string, number>> = {}
    if (obj(x.clics.por_enlace)) for (const [slug, dias] of Object.entries(x.clics.por_enlace)) if (obj(dias)) por[slug] = Object.fromEntries(Object.entries(dias).filter(([d, v]) => fecha(d) && n(v) !== null)) as Record<string, number>
    clics = { fuente: texto(x.clics.fuente) ?? 'Enlaces rastreados', hasta: fecha(x.clics.hasta) ? x.clics.hasta : null, por_enlace: por, ...(texto(x.clics.error) ? { error: texto(x.clics.error) } : {}) }
  }
  const handle = obj(x.canal) ? texto(x.canal.handle) ?? '' : ''
  const estado = x.estado === 'ok' || x.estado === 'sin-token' ? x.estado : 'error'
  return { archivo: {
    generado: texto(x.generado) ?? null, handle, estado, error: texto(x.error),
    analytics: a ? { fuente: texto(a.fuente) ?? 'YouTube Analytics', hasta: ultima(diasA), dias: diasA } : null,
    alcance: r ? { fuente: texto(r.fuente) ?? 'YouTube Reporting', hasta: ultima(diasR), dias: diasR } : null,
    clics, videos,
  }, errores }
}

// ── Lo que se ve ──

export type IdMetrica = 'impresiones' | 'ctr' | 'vistas' | 'pct_visto' | 'retencion_30s' | 'clics' | 'subs'
/** El estándar: siempre estas siete y en este orden (el del embudo). */
export const METRICAS: readonly { id: IdMetrica; etiqueta: string }[] = [
  { id: 'impresiones', etiqueta: 'Impresiones' },
  { id: 'ctr', etiqueta: 'CTR de miniatura' },
  { id: 'vistas', etiqueta: 'Vistas' },
  { id: 'pct_visto', etiqueta: '% visto' },
  { id: 'retencion_30s', etiqueta: 'Retención a 30 s' },
  { id: 'clics', etiqueta: 'Clics al enlace' },
  { id: 'subs', etiqueta: 'Suscriptores ganados' },
]

export interface Celda {
  id: IdMetrica; etiqueta: string
  /** El número ya en texto; null = no hay número. */
  valor: string | null
  /** Sin número, lo que se lee en su lugar («aún sin dato», «no aplica»). */
  espera?: string
  /** Por qué no hay número todavía. */
  motivo?: string
  fuente: string
  /** «hasta 8 nov» o «4 – 10 nov». */
  fecha?: string
}
export interface FilaVideo { id: string; titulo: string; url: string; estado: 'publico' | 'programado'; publicado: string; tipo: 'largo' | 'corto' | null; celdas: Celda[] }
export interface SemanaMarcador { desde: string | null; hasta: string | null; rango: string | null; celdas: Celda[] }
export type RespuestaMarcador =
  | { activo: false }
  | { activo: true; generado: string | null; handle: string; estado: 'ok' | 'sin-token' | 'error'; error?: string; errores?: string[]; falta?: string; lectura: string; semana: SemanaMarcador; videos: FilaVideo[] }

const F_REPORTING = 'YouTube Reporting', F_ANALYTICS = 'YouTube Analytics', F_ENLACES = 'Enlaces rastreados'
const M_REPORTING = 'YouTube lo entrega hasta ~48 h después'
const M_ANALYTICS = 'YouTube lo entrega 1 a 3 días después'
const FUENTE_DE: Record<IdMetrica, string> = { impresiones: F_REPORTING, ctr: F_REPORTING, vistas: F_ANALYTICS, pct_visto: F_ANALYTICS, retencion_30s: F_ANALYTICS, clics: F_ENLACES, subs: F_ANALYTICS }
const ETIQUETA = Object.fromEntries(METRICAS.map(m => [m.id, m.etiqueta])) as Record<IdMetrica, string>

const entero = (v: number) => Math.round(v).toLocaleString('es-MX')
const pct = (v: number) => `${v.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`

const numero = (id: IdMetrica, valor: string, fechaTexto: string): Celda => ({ id, etiqueta: ETIQUETA[id], valor, fuente: FUENTE_DE[id], fecha: fechaTexto })
const sinDato = (id: IdMetrica, motivo: string, espera = AUN_SIN_DATO): Celda => ({ id, etiqueta: ETIQUETA[id], valor: null, espera, motivo, fuente: FUENTE_DE[id] })
const hastaDe = (f: string) => `hasta ${dm(f)}`

/** Una fila: acumulado del video desde que salió hasta el último día que cada fuente ya entregó. */
export function filaVideo(v: VideoSensor, clics: ClicsSensor | null): FilaVideo {
  const celda = (id: IdMetrica): Celda => {
    if (v.estado === 'programado') return sinDato(id, `Sale el ${dm(v.publicado)}: se mide al publicarse.`)
    const a = v.analytics, r = v.alcance
    switch (id) {
      case 'impresiones': return r ? numero(id, entero(r.impresiones), hastaDe(r.hasta)) : sinDato(id, M_REPORTING)
      case 'ctr': return r && r.impresiones > 0 ? numero(id, pct((r.clics_miniatura / r.impresiones) * 100), hastaDe(r.hasta)) : sinDato(id, M_REPORTING)
      case 'vistas': return a ? numero(id, entero(a.vistas), hastaDe(a.hasta)) : sinDato(id, M_ANALYTICS)
      case 'pct_visto': return a ? numero(id, pct(a.pct_visto), hastaDe(a.hasta)) : sinDato(id, M_ANALYTICS)
      case 'subs': return a ? numero(id, entero(a.subs_ganados), hastaDe(a.hasta)) : sinDato(id, M_ANALYTICS)
      case 'retencion_30s': {
        if (v.duracion_s > 0 && v.duracion_s <= 30) return sinDato(id, 'El video dura 30 s o menos.', 'no aplica')
        return v.retencion_30s ? numero(id, pct(v.retencion_30s.valor * 100), hastaDe(v.retencion_30s.hasta)) : sinDato(id, M_ANALYTICS)
      }
      case 'clics': {
        if (!v.enlace) return sinDato(id, 'Su descripción no trae un enlace rastreado.')
        if (clics?.error && !clics.hasta) return sinDato(id, 'No se pudieron leer los enlaces rastreados.')
        if (!clics?.hasta || !(v.enlace in clics.por_enlace)) return sinDato(id, 'Ese enlace no aparece en la base de enlaces rastreados.')
        if (clics.hasta < v.publicado) return sinDato(id, 'Se cuentan los días ya cerrados: mañana entra el del estreno.')
        const suma = Object.entries(clics.por_enlace[v.enlace]).reduce((s, [d, c]) => (d >= v.publicado && d <= clics.hasta! ? s + c : s), 0)
        return numero(id, entero(suma), hastaDe(clics.hasta))
      }
    }
  }
  return { id: v.id, titulo: v.titulo, url: v.url, estado: v.estado, publicado: v.publicado, tipo: v.tipo, celdas: METRICAS.map(m => celda(m.id)) }
}

function sumaSemana<T extends { fecha: string }>(dias: T[], fin: string, f: (d: T) => number): number | null {
  const por = new Map(dias.map(d => [d.fecha, d]))
  let s = 0
  for (let k = 0; k < 7; k++) { const d = por.get(masDias(fin, -k)); if (!d) return null; s += f(d) }
  return s
}

/**
 * El total de la semana. Una sola ventana de 7 días para todas las fuentes (nunca se mezclan ventanas): termina en el último
 * día que TODAS las fuentes ya entregaron, contando solo las que ya alcanzaron el primer video publicado. La fuente que aún
 * no lo alcanza dice «aún sin dato» en lugar de un 0.
 */
export function semanaDe(a: ArchivoMarcador): SemanaMarcador {
  const espera = (motivo: string): SemanaMarcador => ({ desde: null, hasta: null, rango: null, celdas: METRICAS.map(m => m.id === 'retencion_30s' ? porVideo() : sinDato(m.id, motivo)) })
  const primera = a.videos.filter(v => v.estado === 'publico').map(v => v.publicado).sort()[0] ?? null
  if (!primera) return espera('El canal todavía no tiene videos publicados.')
  const hAnalytics = a.analytics?.hasta ?? null, hAlcance = a.alcance?.hasta ?? null, hClics = a.clics && !(a.clics.error && !a.clics.hasta) ? a.clics.hasta : null
  const listas = [hAnalytics, hAlcance, hClics].filter((h): h is string => !!h && h >= primera)
  if (!listas.length) return espera(`El primer video salió el ${dm(primera)}: las fuentes aún no llegan a ese día.`)
  const fin = listas.reduce((m, h) => (h < m ? h : m)), desde = masDias(fin, -6), ventana = rango(desde, fin)
  const listo = (h: string | null) => !!h && h >= primera
  const faltan = 'Faltan días en el reporte de esa semana.'
  const celdas = METRICAS.map(({ id }): Celda => {
    if (id === 'retencion_30s') return porVideo()
    if (id === 'impresiones' || id === 'ctr') {
      if (!listo(hAlcance) || !a.alcance) return sinDato(id, M_REPORTING)
      const imp = sumaSemana(a.alcance.dias, fin, d => d.impresiones), cl = sumaSemana(a.alcance.dias, fin, d => d.clics_miniatura)
      if (imp === null || cl === null) return sinDato(id, faltan)
      if (id === 'impresiones') return numero(id, entero(imp), ventana)
      return imp > 0 ? numero(id, pct((cl / imp) * 100), ventana) : sinDato(id, 'Sin impresiones en la semana.')
    }
    if (id === 'clics') {
      if (!listo(hClics) || !a.clics) return sinDato(id, 'Se cuentan los días ya cerrados: mañana entra el del estreno.')
      let s = 0
      for (const dias of Object.values(a.clics.por_enlace)) for (let k = 0; k < 7; k++) s += dias[masDias(fin, -k)] ?? 0
      return numero(id, entero(s), ventana)
    }
    if (!listo(hAnalytics) || !a.analytics) return sinDato(id, M_ANALYTICS)
    const dias = a.analytics.dias
    if (id === 'vistas' || id === 'subs') {
      const s = sumaSemana(dias, fin, d => id === 'vistas' ? d.vistas : d.subs_ganados)
      return s === null ? sinDato(id, faltan) : numero(id, entero(s), ventana)
    }
    // % visto de la semana: promedio de cada día pesado por sus vistas.
    const vistas = sumaSemana(dias, fin, d => d.vistas), peso = sumaSemana(dias, fin, d => d.vistas * (d.pct_visto ?? 0))
    if (vistas === null || peso === null) return sinDato(id, faltan)
    return vistas > 0 ? numero(id, pct(peso / vistas), ventana) : sinDato(id, 'Sin vistas en la semana.')
  })
  return { desde, hasta: fin, rango: ventana, celdas }
}
const porVideo = (): Celda => sinDato('retencion_30s', 'La retención es de cada video: no se suma entre videos.', 'por video')

/** La lectura de una línea. Solo describe lo que hay: sin metas, sin juicio y sin un número que no esté en la semana. */
export function lecturaDe(a: ArchivoMarcador, semana: SemanaMarcador, filas: FilaVideo[]): string {
  const publicos = a.videos.filter(v => v.estado === 'publico')
  if (!publicos.length) {
    const prog = a.videos.filter(v => v.estado === 'programado').sort((p, q) => p.publicado.localeCompare(q.publicado))[0]
    return prog ? `«${prog.titulo}» sale el ${dm(prog.publicado)}: el marcador empieza con él.` : 'El canal todavía no publica: el marcador empieza con el primer video.'
  }
  const de = (id: IdMetrica) => semana.celdas.find(c => c.id === id)?.valor ?? null
  const trozos = [de('impresiones') && `${de('impresiones')} impresiones`, de('vistas') && `${de('vistas')} vistas`, de('clics') && `${de('clics')} clics al enlace`].filter(Boolean) as string[]
  if (!semana.rango || !trozos.length) {
    const ultimo = [...publicos].sort((p, q) => q.publicado.localeCompare(p.publicado))[0]
    return `«${ultimo.titulo}» ya salió: YouTube entrega sus primeros números 1 a 3 días después.`
  }
  const lista = trozos.length > 1 ? `${trozos.slice(0, -1).join(', ')} y ${trozos[trozos.length - 1]}` : trozos[0]
  const vistasDe = (f: FilaVideo) => Number((f.celdas.find(c => c.id === 'vistas')?.valor ?? '').replace(/\D/g, '') || NaN)
  const conVistas = filas.filter(f => Number.isFinite(vistasDe(f)))
  const punta = conVistas.length > 1 ? conVistas.reduce((m, f) => (vistasDe(f) > vistasDe(m) ? f : m)) : null
  return `Semana del ${semana.rango}: ${lista}.${punta ? ` El video con más vistas es «${punta.titulo}».` : ''}`
}

/** Lo que recibe la vista. */
export function armarMarcador(a: ArchivoMarcador, errores: string[] = []): Extract<RespuestaMarcador, { activo: true }> {
  const videos = a.videos.map(v => filaVideo(v, a.clics))
  const semana = semanaDe(a)
  return { activo: true, generado: a.generado, handle: a.handle, estado: a.estado, ...(a.error ? { error: a.error } : {}), ...(errores.length ? { errores } : {}), lectura: lecturaDe(a, semana, videos), semana, videos }
}
