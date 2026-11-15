/**
 * Mapa v16 · las FUENTES de datos vivos de las islas (14 nov 2026). Daniel: «números vivos, eso es clave!!».
 *
 * Una isla pide `{tipo:'pedir', fuente}`; el host lee aquí. Ninguna cifra nace en este archivo: cada fuente es una lectura
 * que la app YA hace (las mismas URLs, la misma caché de `cabina/datos.ts`, la misma lógica de El pulso en
 * `negocio/pulso.ts`). Sin dato, la isla recibe `estado: 'sin-dato'` (nunca 0); si la fuente falla, `error` con el motivo;
 * en modo directo, cohorte y finanzas llegan `oculto` y ni se piden.
 *
 *   pulso:<organo>     el Pulso del órgano (marketing, venta, comprador, entrega, finanzas, sistemas)
 *   embudo             el embudo de la memoria (`project/mi-negocio/embudo.json`), validado
 *   cohorte:resumen    cupo, lugares pagados, llamadas, fundadores, cerebros conectados, atorados (sin nombres)
 *   finanzas:resumen   lo que entró y salió en 30 días y lo que tienes, en MXN
 *   canal-levy         el marcador del canal de Levy (cifras públicas por video)
 *   bi:<consulta>      la serie del BI (30 días) leída como la lee el panel: su último valor, su cifra, sus puntos y su
 *                      señal (la alarma de Beer: dolor o placer cuando sale de su corredor)
 *   bandeja:<organo>   las tarjetas de la bandeja que DECLARAN ese órgano (campo `organo`): cuántas esperan y sus títulos
 *
 * Puro: las URLs llegan inyectadas (`UrlsApp`, el host las saca de los mismos módulos que los paneles) y la red también
 * (tests/canvas/islas-fuentes.test.ts).
 */
import type { FinancesPayload } from '@/features/finances/types/finances'
import type { CronSnapshot } from '@/features/planning/types'
import type { Trabajos } from '@/features/cabina/trabajos-modelo'
import type { RespuestaEmbudo } from '@/features/negocio/embudo'
import type { RespuestaMarketing } from '@/features/negocio/marketing'
import type { RespuestaMarcador } from '@/features/negocio/marcador-levy'
import {
  ORGANOS, pulsoComprador, pulsoEntrega, pulsoFinanzas, pulsoMarketing, pulsoSistemas, pulsoVenta,
  type CohortePulso, type LecturaDe, type Organo, type Pulso, type RespuestaComprador,
} from '@/features/negocio/pulso'
import { FORMA_FUENTE, type EstadoDato } from './protocolo'
import { organoDeTarjeta, type Tarjeta } from '@/features/decisiones/lib/bandeja'
import { consultaEn, cifraDe, esDinero, type Consulta } from '@/features/bi/catalogo'
import { leer as leerBI, type RespuestaConsulta } from '@/features/bi/modelo'

/** Lo que el host le manda a la isla por cada fuente. */
export interface LecturaFuente { estado: EstadoDato; valor: unknown; fecha: string | null; error?: string }

/** Las URLs de la app que las fuentes leen (las mismas claves de caché que los paneles). */
export interface UrlsApp {
  cohorte: string; finanzas: string; rutinas: string; trabajos: string; marketing: string; comprador: string; embudo: string; marcador: string
  /** El catálogo del BI (`/api/bi`); cada serie se pide en `<bi>/consulta?id=…&ventana=30`. */
  bi: string
  /** La bandeja de decisiones (`/api/decisiones`). */
  bandeja: string
}

export interface Contexto {
  /** Modo directo prendido (o recordado mientras se confirma): cohorte y finanzas no se piden. */
  directo: boolean
  /** Edición del alumno: lo del negocio del autor no se pide. */
  cliente: boolean
}

type Clave = Exclude<keyof UrlsApp, 'bi'>
interface DefFuente {
  /** Qué URLs lee, en orden; null = no se pide en este contexto. */
  lee: (ctx: Contexto) => Array<Clave | null>
  calcular: (l: LecturaDe<unknown>[], ctx: Contexto) => Omit<LecturaFuente, 'fecha'>
}

const ESTADO_DE_PULSO: Record<Pulso['estado'], EstadoDato> = { numero: 'ok', 'sin-sensor': 'sin-dato', leyendo: 'leyendo', oculto: 'oculto', error: 'error' }
const dePulso = (p: Pulso): Omit<LecturaFuente, 'fecha'> => ({ estado: ESTADO_DE_PULSO[p.estado], valor: p, ...(p.error ? { error: p.error } : {}) })
const NO_EDICION = 'No disponible en esta edición.'

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const MXN = (n: number) => `$${Math.round(n).toLocaleString('es-MX')} MXN`

/** Común: aún leyendo o con error. null = hay datos. */
function previo(l: LecturaDe<unknown> | undefined): Omit<LecturaFuente, 'fecha'> | null {
  if (!l) return { estado: 'sin-dato', valor: null }
  if (l.data !== undefined) return null
  if (l.error) return { estado: 'error', valor: null, error: l.error }
  return { estado: 'leyendo', valor: null }
}

const PULSOS: Record<Organo, DefFuente> = {
  marketing: { lee: c => [c.cliente ? null : 'marketing'], calcular: ([l], c) => c.cliente ? { estado: 'sin-dato', valor: null, error: NO_EDICION } : dePulso(pulsoMarketing(l as LecturaDe<RespuestaMarketing>)) },
  venta: { lee: c => [c.directo || c.cliente ? null : 'cohorte'], calcular: ([l], c) => c.cliente ? { estado: 'sin-dato', valor: null, error: NO_EDICION } : dePulso(pulsoVenta((l ?? {}) as LecturaDe<CohortePulso>, c.directo)) },
  entrega: { lee: c => [c.directo || c.cliente ? null : 'cohorte'], calcular: ([l], c) => c.cliente ? { estado: 'sin-dato', valor: null, error: NO_EDICION } : dePulso(pulsoEntrega((l ?? {}) as LecturaDe<CohortePulso>, c.directo)) },
  finanzas: { lee: c => [c.directo || c.cliente ? null : 'finanzas'], calcular: ([l], c) => c.cliente ? { estado: 'sin-dato', valor: null, error: NO_EDICION } : dePulso(pulsoFinanzas((l ?? {}) as LecturaDe<FinancesPayload>, c.directo)) },
  comprador: { lee: () => ['comprador'], calcular: ([l]) => dePulso(pulsoComprador((l ?? {}) as LecturaDe<RespuestaComprador>)) },
  sistemas: { lee: c => (c.cliente ? [null, null] : ['rutinas', 'trabajos']), calcular: ([crons, trabajos], c) => c.cliente ? { estado: 'sin-dato', valor: null, error: NO_EDICION } : dePulso(pulsoSistemas((crons ?? {}) as LecturaDe<CronSnapshot>, (trabajos ?? {}) as LecturaDe<Trabajos>)) },
}

export const FUENTES: Readonly<Record<string, DefFuente>> = {
  ...Object.fromEntries(ORGANOS.map(o => [`pulso:${o}`, PULSOS[o]])),
  embudo: {
    lee: () => ['embudo'],
    calcular: ([l]) => {
      const p = previo(l); if (p) return p
      const r = l.data as RespuestaEmbudo
      if (!obj(r) || !r.activo) return { estado: 'sin-dato', valor: null, error: 'El panel del negocio está apagado en esta instalación.' }
      if (!r.embudo) return { estado: r.errores?.length ? 'error' : 'sin-dato', valor: null, ...(r.errores?.length ? { error: r.errores[0] } : {}) }
      return { estado: 'ok', valor: r.embudo }
    },
  },
  'cohorte:resumen': {
    lee: c => [c.directo || c.cliente ? null : 'cohorte'],
    calcular: ([l], c) => {
      if (c.cliente) return { estado: 'sin-dato', valor: null, error: NO_EDICION }
      if (c.directo) return { estado: 'oculto', valor: null }
      const p = previo(l); if (p) return p
      const d = l.data as CohortePulso
      if (!obj(d) || !obj(d.numeros) || !Array.isArray(d.fundadores)) return { estado: 'error', valor: null, error: 'La fuente respondió algo que no se esperaba.' }
      const ll = d.numeros.llamadas
      return { estado: 'ok', valor: {
        cupo: typeof d.cupo === 'number' && d.cupo > 0 ? d.cupo : null,
        cuposPagados: d.numeros.cuposPagados,
        llamadas: ll ? { total: ll.total, presento: ll.presento } : null,
        fundadores: d.fundadores.length,
        conectados: d.fundadores.filter(f => f.cerebro).length,
        atorados: d.fundadores.filter(f => f.atorado).length,
        semana1: semana1De(d),
      } }
    },
  },
  'finanzas:resumen': {
    lee: c => [c.directo || c.cliente ? null : 'finanzas'],
    calcular: ([l], c) => {
      if (c.cliente) return { estado: 'sin-dato', valor: null, error: NO_EDICION }
      if (c.directo) return { estado: 'oculto', valor: null }
      const p = previo(l); if (p) return p
      const d = l.data as FinancesPayload
      if (!obj(d) || !obj(d.summary) || typeof d.summary.income_range_mxn !== 'number') return { estado: 'error', valor: null, error: 'La fuente respondió algo que no se esperaba.' }
      if (!d.movements?.length && !d.tienes) return { estado: 'sin-dato', valor: null, error: 'Aún no hay movimientos cargados en Finanzas.' }
      const entro = d.summary.income_range_mxn, salio = d.summary.burn_range_mxn
      const tienes = d.tienes ? d.tienes.mxn : null
      return { estado: 'ok', valor: { entro, salio, tienes, moneda: 'MXN', ventana: '30 días',
        texto: { entro: MXN(entro), salio: typeof salio === 'number' ? MXN(salio) : null, tienes: tienes === null ? null : MXN(tienes) } } }
    },
  },
  'canal-levy': {
    lee: c => [c.cliente ? null : 'marcador'],
    calcular: ([l], c) => {
      if (c.cliente) return { estado: 'sin-dato', valor: null, error: NO_EDICION }
      const p = previo(l); if (p) return p
      const r = l.data as RespuestaMarcador
      if (!obj(r) || !r.activo) return { estado: 'sin-dato', valor: null }
      if (r.estado === 'error') return { estado: 'error', valor: r, error: r.error ?? 'El sensor del canal falló.' }
      return { estado: r.estado === 'ok' ? 'ok' : 'sin-dato', valor: r }
    },
  },
}

/**
 * La Semana 1 de la cohorte en su plataforma (sus casillas: acuerdo, cerebro instalado, meta escrita, ritual, se presentó):
 * cuántos fundadores la completaron y cuántas casillas van marcadas. null = las casillas no se pudieron leer (sin dato, no
 * «ninguna»). Sin nombres.
 */
export function semana1De(d: Pick<CohortePulso, 'fundadores'>): { completos: number; total: number; marcadas: number; casillas: number } | null {
  const con = d.fundadores.filter(f => Array.isArray(f.casillas) && f.casillas.length)
  if (!con.length) return null
  const casillas = con.reduce((a, f) => a + f.casillas!.length, 0)
  const marcadas = con.reduce((a, f) => a + f.casillas!.filter(c => c.marcada).length, 0)
  return { completos: con.filter(f => f.casillas!.every(c => c.marcada)).length, total: d.fundadores.length, marcadas, casillas }
}

/** Una tarjeta de la bandeja tal como la lee el mapa (sin el texto exacto ni la persona). */
interface TarjetaLeida { titulo?: unknown; organo?: unknown; categoria?: unknown }

/** `bandeja:<organo>`: las tarjetas que declaran ese órgano. */
function bandejaDe(organo: string): DefFuente {
  return {
    lee: c => [c.cliente ? null : 'bandeja'],
    calcular: ([l], c) => {
      if (c.cliente) return { estado: 'sin-dato', valor: null, error: NO_EDICION }
      const p = previo(l); if (p) return p
      const v = l.data as { pendientes?: TarjetaLeida[] }
      if (!obj(v) || !Array.isArray(v.pendientes)) return { estado: 'error', valor: null, error: 'La bandeja respondió algo que no se esperaba.' }
      const suyas = v.pendientes.filter(t => obj(t) && organoDeTarjeta({ organo: typeof t.organo === 'string' ? t.organo as Tarjeta['organo'] : undefined, categoria: t.categoria as Tarjeta['categoria'] }) === organo)
      return { estado: 'ok', valor: { organo, pendientes: suyas.length, titulos: suyas.slice(0, 3).map(t => String(t.titulo ?? '').slice(0, 140)) } }
    },
  }
}

/** La pendiente de los últimos `n` puntos (por día), por mínimos cuadrados; null con menos de 5 puntos. La misma cuenta que
 *  el bloque `meta-error` usa de cerca: de lejos y de cerca, el órgano duele por la misma razón. */
export function pendienteDe(valores: readonly number[], n = 14): number | null {
  const xs = valores.slice(-n)
  if (xs.length < 5) return null
  const m = xs.length, mx = (m - 1) / 2, my = xs.reduce((a, v) => a + v, 0) / m
  let num = 0, den = 0
  xs.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2 })
  return den ? num / den : null
}

/** Lo que trae `bi:<consulta>`. */
export interface LecturaSerieBI {
  consulta: string; nombre: string; unidad: string; fuente: string; hasta: string | null; usd: boolean; mejor: Consulta['mejor']
  /** El último día con dato y su cifra en texto («1,037 vistas», «$7,898 USD»). */
  ultimo: number | null; cifra: string | null; fecha: string | null
  /** Los valores de los días con dato (los días sin dato se saltan: nunca se pintan como 0). */
  puntos: number[]
  /** La alarma de Beer del BI (`dolor`: salió de su corredor del lado malo; `placer`: del bueno). */
  senal: { tono: string } | null
  frase: string
}

const VENTANA_BI = 30
/** `bi:<consulta>`: el catálogo dice qué es la serie y la consulta trae sus días (las mismas URLs que el panel). */
async function leerSerieBI(id: string, urls: UrlsApp, ctx: Contexto, leer: Leer): Promise<Omit<LecturaFuente, 'fecha'>> {
  if (ctx.cliente) return { estado: 'sin-dato', valor: null, error: NO_EDICION }
  const [cat, con] = await Promise.all([urls.bi, `${urls.bi}/consulta?id=${encodeURIComponent(id)}&ventana=${VENTANA_BI}`]
    .map(u => leer(u).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }) as LecturaDe<unknown>)))
  const p = previo(cat) ?? previo(con); if (p) return p
  const r = cat.data as { activo?: boolean; catalogo?: Consulta[] }
  if (!obj(r) || !r.activo || !Array.isArray(r.catalogo)) return { estado: 'sin-dato', valor: null, error: 'El BI está apagado en esta instalación.' }
  const c = consultaEn(r.catalogo, id)
  if (!c) return { estado: 'error', valor: null, error: `El BI no tiene una consulta «${id}».` }
  const q = con.data as RespuestaConsulta
  if (!obj(q) || !q.datos) return { estado: 'sin-dato', valor: null, error: 'La serie no trae datos todavía.' }
  const lectura = leerBI(c, c.tipo, VENTANA_BI, q.datos)
  const dias = q.datos.forma === 'serie' ? q.datos.puntos.filter(x => typeof x.valor === 'number' && Number.isFinite(x.valor)) : []
  const u = dias.at(-1)
  const valor: LecturaSerieBI = {
    consulta: id, nombre: c.nombre, unidad: c.unidad, fuente: c.fuente, hasta: q.hasta ?? null, usd: esDinero(c), mejor: c.mejor,
    ultimo: u ? (u.valor as number) : null, cifra: u ? cifraDe(u.valor as number, c) : null, fecha: u?.fecha ?? null,
    puntos: dias.map(x => x.valor as number).slice(-120),
    senal: lectura.senal ? { tono: lectura.senal.tono } : null, frase: lectura.frase,
  }
  return { estado: u ? 'ok' : 'sin-dato', valor }
}

const BI = /^bi:([a-z0-9][a-z0-9-]{1,39})$/
const BANDEJA = /^bandeja:(marketing|venta|comprador|entrega|finanzas|sistemas)$/

export const nombresDeFuentes = () => Object.keys(FUENTES)

/** Una lectura de URL: datos, o el motivo por el que no los hay (nunca un valor inventado). */
export type Leer = (url: string) => Promise<LecturaDe<unknown>>

/**
 * Lee UNA fuente: pide sus URLs (las que tocan en este contexto) y calcula el valor con la lógica de siempre. Una fuente
 * que no existe responde `desconocida` (la isla pidió un nombre que no está en el catálogo).
 */
export async function leerFuente(nombre: string, urls: UrlsApp, ctx: Contexto, leer: Leer, ahora: () => Date = () => new Date()): Promise<LecturaFuente> {
  const bi = FORMA_FUENTE.test(nombre) ? BI.exec(nombre) : null
  if (bi) {
    const r = await leerSerieBI(bi[1], urls, ctx, leer)
    return { ...r, fecha: r.estado === 'ok' ? ahora().toISOString() : null }
  }
  const bandeja = FORMA_FUENTE.test(nombre) ? BANDEJA.exec(nombre) : null
  const def = bandeja ? bandejaDe(bandeja[1]) : FORMA_FUENTE.test(nombre) ? FUENTES[nombre] : undefined
  if (!def) return { estado: 'desconocida', valor: null, fecha: null, error: `No hay una fuente llamada «${nombre}».` }
  const claves = def.lee(ctx)
  const lecturas = await Promise.all(claves.map(k => (k ? leer(urls[k]).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })) : Promise.resolve(undefined))))
  const r = def.calcular(lecturas as LecturaDe<unknown>[], ctx)
  return { ...r, fecha: r.estado === 'ok' ? ahora().toISOString() : null }
}

/** ¿Cambió lo que la isla está viendo? (el host solo re-envía y rehace la foto si sí). */
export const mismaLectura = (a: LecturaFuente | undefined, b: LecturaFuente) =>
  !!a && a.estado === b.estado && a.error === b.error && JSON.stringify(a.valor) === JSON.stringify(b.valor)
