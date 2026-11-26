/**
 * Mapa v16 · el CARTEL de lejos (14 nov 2026, pasada de pulido). El crítico ciego y Levy coincidieron: «de lejos no tiene
 * alma: las tarjetas de los órganos se ven iguales y oscuras y su interior no se lee». De lejos el ojo no lee bloques: lee
 * IDENTIDAD. Así que cuando una isla ocupa poco en pantalla, el lienzo no la encoge: pinta su CARTEL, diseñado para leerse a
 * 150–500 px de ancho, como un mapa que cambia de nivel de detalle con el zoom.
 *
 *   · Un ÓRGANO: su ícono en un disco de su acento, su nombre, su número vivo en grande, su estado (en calma, duele, sin
 *     sensor) y su meta contra la realidad en una barra. Sin meta escrita en su fuente, la barra es un HUECO punteado que
 *     dice «sin meta · ponla tú» (nunca una meta inventada). Si la bandeja tiene una decisión que DECLARA ese órgano, un
 *     sello de oro con cuántas esperan su toque.
 *   · Mi norte: el círculo NOVA de protagonista, de adentro hacia afuera (el porqué al centro, el juego infinito y los
 *     anillos Nicho, Oferta, Vehículo y Atención con su letra grande).
 *
 * Todo sale de la receta y de sus fuentes, nada nace aquí: el órgano de `receta.organo` o de su bloque `organo-vivo`; el
 * número de `pulso:<organo>` (o de `lejos.cifra`); la meta, del bloque `meta-error` (`meta`, firmada en su fuente) contra su
 * realidad (`bi:<serie>` o `realidad`); el estado, con la MISMA cuenta que el bloque de cerca (la señal del BI o el error que
 * crece). La receta lo afina con `lejos: { forma, icono, acento, cifra, frase }` y se ve en vivo, como todo lo demás.
 *
 * `datosDelCartel` es puro (tests/canvas/islas-cartel.test.ts); `pintarCartel` dibuja en vector, barato a 60 fps.
 */
import { ORGANO } from '@/features/negocio/pulso'
import type { LecturaFuente } from '../fuentes'
import { pendienteDe } from '../fuentes'
import { campo, ACENTOS, ICONOS_LEJOS, type Acento, type IconoLejos, type Receta } from '../receta'

/** Lo que el cartel necesita de una isla: su receta y sus bloques ya validados (con o sin caja). */
export interface IslaMin { receta: Receta; bloques: ReadonlyArray<{ tipo: string; ok: boolean; p?: unknown }> }

type Leer = (f: string) => LecturaFuente | undefined
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const t = (x: unknown) => (typeof x === 'string' ? x : '')

export const ORGANOS_CARTEL = ['marketing', 'venta', 'comprador', 'entrega', 'finanzas', 'sistemas'] as const
type OrganoCartel = (typeof ORGANOS_CARTEL)[number]
const esOrgano = (x: unknown): x is OrganoCartel => typeof x === 'string' && (ORGANOS_CARTEL as readonly string[]).includes(x)

/** La identidad de cada órgano de lejos: su ícono y su acento (la receta los cambia con `lejos.icono` y `lejos.acento`). */
export const IDENTIDAD: Record<OrganoCartel, { icono: IconoLejos; acento: Acento }> = {
  marketing: { icono: 'megafono', acento: 'violeta' },
  comprador: { icono: 'cerebro', acento: 'orquidea' },
  venta: { icono: 'manos', acento: 'esmeralda' },
  entrega: { icono: 'paquete', acento: 'cielo' },
  finanzas: { icono: 'cartera', acento: 'oro' },
  sistemas: { icono: 'engranes', acento: 'acero' },
}

/**
 * Los acentos, en claro y en oscuro. Dentro del claroscuro de la marca (morado y oro) y lejos del rojo, que es solo del
 * dolor: un órgano nunca «parece» doler por su color.
 */
export const ACENTO: Record<Acento, { claro: string; oscuro: string }> = {
  violeta: { claro: '#8C27F1', oscuro: '#b47dff' },
  orquidea: { claro: '#b62bc9', oscuro: '#ee7dff' },
  esmeralda: { claro: '#059669', oscuro: '#34d399' },
  cielo: { claro: '#0284c7', oscuro: '#4cc3ff' },
  oro: { claro: '#e58200', oscuro: '#ffac3d' },
  acero: { claro: '#4b5b73', oscuro: '#b8c4d6' },
}
ACENTOS satisfies readonly Acento[]

/** Los íconos (lucide, ISC, 24×24 de trazo) en rutas SVG: se pintan con Path2D. */
export const ICONO_RUTAS: Record<IconoLejos, string[]> = {
  megafono: ['M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', 'M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14', 'M8 6v8'],
  manos: ['M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17', 'm7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9', 'm2 16 6 6', 'M18.9 9a2.9 2.9 0 1 1-5.8 0a2.9 2.9 0 1 1 5.8 0', 'M9 5a3 3 0 1 1-6 0a3 3 0 1 1 6 0'],
  cerebro: ['M12 18V5', 'M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4', 'M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5', 'M17.997 5.125a4 4 0 0 1 2.526 5.77', 'M18 18a4 4 0 0 0 2-7.464', 'M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517', 'M6 18a4 4 0 0 1-2-7.464', 'M6.003 5.125a4 4 0 0 0-2.526 5.77'],
  paquete: ['m16 16 2 2 4-4', 'M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14', 'm7.5 4.27 9 5.15', 'M3.29 7L12 12L20.71 7', 'M12 22V12'],
  cartera: ['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'],
  engranes: ['M5 3h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M7 11v4a2 2 0 0 0 2 2h4', 'M15 13h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z'],
  brujula: ['m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z', 'M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0'],
  timon: ['M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0', 'M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0', 'M12 2v7', 'M12 15v7', 'M2 12h7', 'M15 12h7'],
  chispa: ['M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z', 'M20 2v4', 'M22 4h-4', 'M6 20a2 2 0 1 1-4 0a2 2 0 1 1 4 0'],
  blanco: ['M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0', 'M18 12a6 6 0 1 1-12 0a6 6 0 1 1 12 0', 'M14 12a2 2 0 1 1-4 0a2 2 0 1 1 4 0'],
  libro: ['M12 7v14', 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'],
  escalera: ['M3 21h5v-5h5v-5h5V6h3', 'M3 21h18'],
}
ICONOS_LEJOS satisfies readonly IconoLejos[]

export type EstadoCartel = 'calma' | 'duele' | 'sin-sensor' | 'leyendo' | 'oculto'
export interface MetaCartel {
  /** La meta firmada (número y unidad) contra la realidad; `fraccion` = realidad / meta (0–1+). */
  valor: number; unidad: string; texto: string
  realidad: number | null; fraccion: number | null
}
export interface DatosCartelOrgano {
  forma: 'organo'
  organo: OrganoCartel; nombre: string; pregunta: string; icono: IconoLejos; acento: Acento
  cifra: string | null; unidad: string; estado: EstadoCartel; porque: string
  meta: MetaCartel | null
  /** La realidad en texto (para el hueco sin meta: el número que hoy sí se mide). */
  realidad: string | null
  decisiones: number
  /** La serie de su realidad (los días con dato del BI) para la curva del centro, y su nombre. */
  serie: number[]; serieNombre: string
  /** El contexto de su número (El pulso): «83 suscriptores nuevos», «De 24 rutinas activas»… */
  detalle: string[]
  /** Lo que la receta pide decir APARTE de la meta (`meta-error.aparte`): las cuotas que no son MRR recurrente. */
  aparte: string | null
}
export interface DatosCartelTimonel {
  forma: 'timonel'
  titulo: string
  /** La corrección que baja: «Empujar «<cuello>»». */
  correccion: string
  /** Lo que mide el cuello y si ya tiene número. */
  mide: string; numero: string | null
  embudo: string
}
export interface DatosCartelNova {
  forma: 'nova'
  titulo: string; nucleo: string; rotulo: string
  anillos: Array<{ inicial: string; nombre: string; oro: boolean }>
}
/** Un capítulo (la oferta, el programa, los principios): su encabezado y su frase firmada, en grande. Solo si la receta lo pide. */
export interface DatosCartelCapitulo {
  forma: 'capitulo'
  icono: IconoLejos; acento: Acento
  ceja: string; titulo: string; bajada: string; cita: string
  /** Los peldaños de su escalera (la oferta), si la tiene: nombre y si está vivo o abierto. */
  peldanos: Array<{ nombre: string; abierto: boolean; tono: 'oro' | 'morado' | 'gris' }>
}
export type DatosCartel = DatosCartelOrgano | DatosCartelNova | DatosCartelTimonel | DatosCartelCapitulo

/** El órgano que encarna la isla: el de la receta o el de su bloque `organo-vivo`. */
export function organoDe(isla: IslaMin): OrganoCartel | null {
  if (esOrgano(isla.receta.organo)) return isla.receta.organo
  for (const b of isla.bloques) if (b.ok && b.tipo === 'organo-vivo' && obj(b.p) && esOrgano((b.p as Record<string, unknown>).organo)) return (b.p as Record<string, unknown>).organo as OrganoCartel
  return null
}

/** ¿Tiene cartel de lejos esta isla y de qué forma? `lejos.forma: "ninguna"` lo apaga (se encogen sus bloques). */
export function formaCartel(isla: IslaMin): 'organo' | 'nova' | 'timonel' | 'capitulo' | null {
  const f = isla.receta.lejos?.forma
  if (f === 'ninguna') return null
  if (f === 'organo') return organoDe(isla) ? 'organo' : null
  if (f === 'nova' || f === 'timonel' || f === 'capitulo') return f
  if (organoDe(isla)) return 'organo'
  if (isla.bloques.some(b => b.ok && b.tipo === 'estrella')) return 'nova'
  if (isla.bloques.some(b => b.ok && b.tipo === 'timonel')) return 'timonel'
  return null
}

/** Las fuentes que el cartel lee además de las de sus bloques (el host las pide junto con las demás). */
export function fuentesDelCartel(isla: IslaMin): string[] {
  const forma = formaCartel(isla), organo = organoDe(isla)
  if (forma === 'timonel') return ['embudo']
  if (forma !== 'organo' || !organo) return []
  const me = isla.bloques.find(b => b.ok && b.tipo === 'meta-error')
  const ap = me && obj(me.p) && obj((me.p as Record<string, unknown>).aparte) ? (me.p as { aparte: Record<string, unknown> }).aparte : null
  return [`pulso:${organo}`, `bandeja:${organo}`, ...(isla.receta.lejos?.cifra ? [isla.receta.lejos.cifra.fuente] : []), ...(ap && typeof ap.fuente === 'string' ? [ap.fuente] : [])]
}

const blq = (isla: Pick<IslaMin, 'bloques'>, tipo: string) => {
  const b = isla.bloques.find(x => x.ok && x.tipo === tipo)
  return b && obj(b.p) ? (b.p as Record<string, unknown>) : null
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** «2026-11-11» → «11 nov». */
export const diaCorto = (f: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f); return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]}` : f }
/** «100K», «1.5M»: la meta de lejos, corta. */
const corta = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n))

/** Lo que el cartel dice, leído de la receta y de las fuentes. Puro. */
export function datosDelCartel(isla: IslaMin, leer: Leer): DatosCartel | null {
  const forma = formaCartel(isla)
  if (!forma) return null
  const lejos = isla.receta.lejos
  if (forma === 'nova') {
    const e = blq(isla, 'estrella') ?? {}
    const nucleo = obj(e.nucleo) ? e.nucleo : {}
    const anillos = (Array.isArray(e.anillos) ? e.anillos : []).filter(obj).map(a => ({
      inicial: t(a.inicial) || t(a.nombre).slice(0, 1).toUpperCase(), nombre: t(a.nombre), oro: a.tono === 'oro' || a.id === 'juego',
    }))
    return { forma, titulo: lejos?.frase || isla.receta.titulo, nucleo: t(nucleo.frase).replace(/[«»]/g, '').replace(/\s*\n\s*/g, ' ').trim(), rotulo: t(nucleo.rotulo), anillos }
  }
  if (forma === 'capitulo') {
    const e = blq(isla, 'encabezado') ?? {}, f = blq(isla, 'firma'), esc = blq(isla, 'escalera-valor')
    return {
      forma, icono: lejos?.icono ?? 'brujula', acento: lejos?.acento ?? 'oro',
      ceja: t(e.ceja), titulo: t(e.titulo) || isla.receta.titulo, bajada: lejos?.frase || t(e.bajada), cita: f ? t(f.frase) : '',
      peldanos: esc && Array.isArray(esc.escalones) ? esc.escalones.filter(obj).map(x => ({ nombre: t(x.nombre), abierto: x.estado === 'abierto' || x.estado === 'idea', tono: (x.tono === 'oro' || x.tono === 'morado' ? x.tono : 'gris') as 'oro' | 'morado' | 'gris' })).filter(x => x.nombre).slice(0, 5) : [],
    }
  }
  if (forma === 'timonel') {
    // El cuello del negocio (embudo.json), sin cifras en la frase: la corrección que baja a su órgano.
    const e = leer('embudo'), emb = e?.estado === 'ok' && obj(e.valor) ? e.valor : null
    const etapas = emb && Array.isArray(emb.etapas) ? emb.etapas.filter(obj) : []
    const cu = etapas.find(x => obj(x.cuello) && x.cuello.es === true)
    const nombres = Object.fromEntries((emb && Array.isArray(emb.embudos) ? emb.embudos.filter(obj) : []).map(b => [t(b.id), t(b.nombre)]))
    const mide = cu && obj(cu.mide) ? cu.mide : null
    return {
      forma, titulo: lejos?.frase || isla.receta.titulo,
      correccion: cu ? `Empujar «${t(cu.nombre)}»` : e?.estado === 'leyendo' || !e ? '…' : 'sin dato del embudo',
      mide: mide ? t(mide.nombre) : '', numero: mide && mide.hay_numero === true && typeof mide.valor === 'number' ? new Intl.NumberFormat('es-MX').format(mide.valor) : null,
      embudo: cu ? nombres[t(cu.embudo)] || t(cu.embudo) : '',
    }
  }
  const organo = organoDe(isla)!
  const id = IDENTIDAD[organo]
  const ov = blq(isla, 'organo-vivo') ?? {}
  // El número: el que la receta pida de lejos o el del pulso del órgano.
  const lp = leer(`pulso:${organo}`)
  const pulso = lp && obj(lp.valor) ? lp.valor : null
  let cifra: string | null = null, unidad = ''
  if (lejos?.cifra) {
    const l = leer(lejos.cifra.fuente)
    const v = l?.estado === 'ok' ? (lejos.cifra.campo ? campo(l.valor, lejos.cifra.campo) : obj(l.valor) ? l.valor.cifra : l.valor) : null
    if (v !== null && v !== undefined && v !== '') cifra = String(v)
    unidad = lejos.cifra.unidad ?? ''
  } else if (lp?.estado === 'ok' && pulso && typeof pulso.cifra === 'string') {
    cifra = pulso.cifra; unidad = t(pulso.unidad)
  }
  // La meta y la realidad: del bloque meta-error (la meta solo si está escrita en su fuente).
  const me = blq(isla, 'meta-error')
  const m0 = me && obj(me.meta) && typeof me.meta.valor === 'number' ? me.meta : null
  const serie = me && obj(me.serie) && typeof me.serie.consulta === 'string' ? leer(`bi:${me.serie.consulta}`) : undefined
  const sv = serie?.estado === 'ok' && obj(serie.valor) ? serie.valor : null
  const rv = me && obj(me.realidad) && typeof me.realidad.fuente === 'string' ? me.realidad : null
  let realidad: number | null = sv && typeof sv.ultimo === 'number' ? sv.ultimo : null
  // La realidad con su día: una serie diaria nunca se confunde con el número de la semana del órgano.
  let realidadTxt: string | null = sv && typeof sv.cifra === 'string' ? `${t(sv.nombre)}: ${sv.cifra}${typeof sv.fecha === 'string' ? ` el ${diaCorto(sv.fecha)}` : ''}` : null
  if (rv) {
    const l = leer(t(rv.fuente)), v = l?.estado === 'ok' ? campo(l.valor, t(rv.campo)) : null, tot = l?.estado === 'ok' && rv.total ? campo(l.valor, t(rv.total)) : null
    const n = typeof v === 'number' ? v : typeof v === 'string' && /\d/.test(v) ? Number(v.replace(/[^0-9.-]/g, '')) : NaN
    if (Number.isFinite(n)) { realidad = n; realidadTxt = `${typeof v === 'string' ? v : n}${typeof tot === 'number' ? ` de ${tot}` : ''} ${t(rv.etiqueta)}`.trim() }
  }
  const usd = (m0 && m0.unidad === 'USD') || (sv ? sv.usd === true : false)
  const meta: MetaCartel | null = m0 ? {
    valor: m0.valor as number, unidad: t(m0.unidad), texto: `${usd ? '$' : ''}${corta(m0.valor as number)}${m0.unidad ? ` ${t(m0.unidad)}` : ''}`,
    realidad, fraccion: realidad !== null && (m0.valor as number) > 0 ? realidad / (m0.valor as number) : null,
  } : null
  // El estado: la misma cuenta que de cerca (meta-error): duele si el error crece o si el BI enciende su señal de dolor.
  let estado: EstadoCartel, porque = ''
  if (!lp || lp.estado === 'leyendo') estado = 'leyendo'
  else if (lp.estado === 'oculto') estado = 'oculto'
  else if (lp.estado !== 'ok') { estado = 'sin-sensor'; porque = t(pulso?.falta) || lp.error || 'su fuente no responde' }
  else {
    const puntos = sv && Array.isArray(sv.puntos) ? (sv.puntos as unknown[]).filter((n): n is number => typeof n === 'number') : []
    const m = pendienteDe(puntos)
    const mejorArriba = !sv || sv.mejor !== 'abajo'
    const crece = !!meta && m !== null && (mejorArriba ? m < 0 : m > 0)
    const dolor = !!sv && obj(sv.senal) && sv.senal.tono === 'dolor'
    estado = crece || dolor ? 'duele' : 'calma'
    porque = dolor ? t(sv?.frase) : crece ? 'el error crece' : ''
  }
  // Lo que no es meta, dicho aparte (15 nov 2026): `aparte: { fuente, campo }` en el bloque meta-error.
  const ap = me && obj(me.aparte) && typeof me.aparte.fuente === 'string' ? me.aparte : null
  const la = ap ? leer(t(ap.fuente)) : undefined
  const apV = ap && la?.estado === 'ok' ? campo(la.valor, t(ap.campo)) : null
  const aparte = typeof apV === 'string' && apV ? apV : null
  const lb = leer(`bandeja:${organo}`)
  const decisiones = lb?.estado === 'ok' && obj(lb.valor) && typeof lb.valor.pendientes === 'number' ? lb.valor.pendientes : 0
  return {
    forma, organo, nombre: t(ov.nombre) || ORGANO[organo].nombre, pregunta: t(ov.pregunta) || ORGANO[organo].pregunta,
    icono: lejos?.icono ?? id.icono, acento: lejos?.acento ?? id.acento,
    cifra, unidad: lejos?.frase || unidad, estado, porque, meta, realidad: realidadTxt, decisiones,
    serie: sv && Array.isArray(sv.puntos) ? (sv.puntos as unknown[]).filter((n): n is number => typeof n === 'number').slice(-30) : [],
    serieNombre: sv ? t(sv.nombre) : '',
    detalle: pulso && Array.isArray(pulso.detalle) ? (pulso.detalle as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 3) : [],
    aparte,
  }
}

// ── el dibujo ──
export interface PaletaCartel { arriba: string; abajo: string; borde: string; texto: string; muted: string; brand: string; oro: string; dolor: string; card: string }
const SANS = 'system-ui, -apple-system, sans-serif'
const SERIF = "ui-serif, 'New York', 'Iowan Old Style', Georgia, serif"

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, q); else ctx.rect(x, y, w, h)
}
/** El tamaño al que `s` cabe en `w` (sin bajar de `min`). */
function cabe(ctx: CanvasRenderingContext2D, s: string, w: number, tam: number, peso: string, familia: string, min: number): number {
  ctx.font = `${peso} ${tam}px ${familia}`
  const a = ctx.measureText(s).width
  return a > w ? Math.max(min, Math.floor(tam * (w / a))) : tam
}
/** Un texto en una línea que cabe en `w`: baja de tamaño hasta `min` y, si aun así no cabe, se recorta con «…». */
function linea(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, w: number, tam: number, peso: string, familia: string, color: string, min = tam * 0.5, alinear: CanvasTextAlign = 'left'): number {
  let k = tam
  ctx.font = `${peso} ${k}px ${familia}`
  const ancho = ctx.measureText(s).width
  if (ancho > w) { k = Math.max(min, Math.floor(tam * (w / ancho))); ctx.font = `${peso} ${k}px ${familia}` }
  let txt = s
  while (txt.length > 1 && ctx.measureText(txt).width > w) txt = txt.slice(0, -2) + '…'
  ctx.fillStyle = color; ctx.textAlign = alinear; ctx.textBaseline = 'alphabetic'
  ctx.fillText(txt, alinear === 'center' ? x + w / 2 : alinear === 'right' ? x + w : x, y)
  ctx.textAlign = 'left'
  return k
}
const PATHS = new Map<string, Path2D>()
function icono(ctx: CanvasRenderingContext2D, nombre: IconoLejos, cx: number, cy: number, lado: number, color: string) {
  if (typeof Path2D === 'undefined') return
  ctx.save()
  ctx.translate(cx - lado / 2, cy - lado / 2); ctx.scale(lado / 24, lado / 24)
  ctx.strokeStyle = color; ctx.lineWidth = 1.9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const d of ICONO_RUTAS[nombre]) { let p = PATHS.get(d); if (!p) { p = new Path2D(d); PATHS.set(d, p) } ctx.stroke(p) }
  ctx.restore()
}
const alfa = (hex: string, a: number) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')

/**
 * El cartel en su caja lógica (0, 0, ancho, alto). `oscuro` decide los acentos; `P` es la paleta de la app (la misma de los
 * bloques). Pocas llamadas: un fondo, un disco, cuatro textos, una barra.
 */
export function pintarCartel(ctx: CanvasRenderingContext2D, d: DatosCartel, W: number, H: number, P: PaletaCartel, oscuro: boolean): void {
  if (d.forma === 'nova') { pintarNova(ctx, d, W, H, P, oscuro); return }
  if (d.forma === 'timonel') { pintarTimonel(ctx, d, W, H, P, oscuro); return }
  if (d.forma === 'capitulo') { pintarCapitulo(ctx, d, W, H, P, oscuro); return }
  const A = ACENTO[d.acento][oscuro ? 'oscuro' : 'claro']
  const duele = d.estado === 'duele', apagado = d.estado === 'sin-sensor' || d.estado === 'oculto'
  // Fondo: la placa y la luz de su acento desde arriba a la izquierda (donde vive su disco).
  const fondo = ctx.createLinearGradient(0, 0, 0, H); fondo.addColorStop(0, P.arriba); fondo.addColorStop(1, P.abajo)
  ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H)
  const luz = ctx.createRadialGradient(W * 0.16, H * 0.12, 0, W * 0.16, H * 0.12, W * 0.95)
  luz.addColorStop(0, alfa(duele ? P.dolor : A, oscuro ? 0.42 : 0.2)); luz.addColorStop(1, alfa(duele ? P.dolor : A, 0))
  ctx.fillStyle = luz; ctx.fillRect(0, 0, W, H)
  // La franja de su acento arriba: identidad desde el otro lado del mapa.
  ctx.fillStyle = duele ? P.dolor : A; ctx.fillRect(0, 0, W, 22)
  const pad = 88, ancho = W - 2 * pad, alto = H > 1300
  // El disco con su ícono y el nombre.
  const D = alto ? 250 : 210, cy = 74 + D / 2
  const g = ctx.createLinearGradient(pad, cy - D / 2, pad + D, cy + D / 2)
  g.addColorStop(0, apagado ? P.muted : A); g.addColorStop(1, apagado ? P.borde : alfa(A, 0.7))
  ctx.beginPath(); ctx.arc(pad + D / 2, cy, D / 2, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
  icono(ctx, d.icono, pad + D / 2, cy, D * 0.54, '#ffffff')
  const xN = pad + D + 56, wN = W - xN - pad - 60
  linea(ctx, d.nombre, xN, cy + 46, wN, d.nombre.length > 12 ? 124 : 150, '600', SERIF, P.texto, 70)
  // El número vivo, protagonista. El tamaño se decide ANTES de escribir: una cifra larga («$354,912 MXN») baja de tamaño y
  // todo lo de abajo sube con ella.
  const yNum = cy + D / 2 + (alto ? 70 : 50)
  const hayCifra = !!d.cifra && !apagado
  const texNum = hayCifra ? d.cifra! : d.estado === 'oculto' ? '••••' : d.estado === 'leyendo' ? '…' : 'sin sensor'
  const k = hayCifra ? cabe(ctx, texNum, ancho, alto ? 330 : 250, '800', SANS, 120) : alto ? 170 : 140
  const base = yNum + k * 0.8
  linea(ctx, texNum, pad, base, ancho, k, hayCifra ? '800' : 'italic 600', SANS, hayCifra ? P.texto : P.muted, k)
  ctx.font = `${hayCifra ? '800' : 'italic 600'} ${k}px ${SANS}`
  const wNum = ctx.measureText(texNum).width
  // Su estado y las decisiones que esperan su toque: píldoras sobrias (el rojo solo si duele; el oro, si te espera algo).
  const pildoras: Array<{ txt: string; col: string; lleno?: boolean }> = [
    { txt: duele ? 'duele' : d.estado === 'calma' ? 'en calma' : d.estado === 'leyendo' ? 'leyendo' : d.estado === 'oculto' ? 'oculto' : 'sin sensor', col: duele ? P.dolor : d.estado === 'calma' ? A : P.muted },
    ...(d.decisiones > 0 ? [{ txt: d.decisiones === 1 ? '1 espera tu toque' : `${d.decisiones} esperan tu toque`, col: P.oro, lleno: true }] : []),
  ]
  const hP = alto ? 96 : 84, fP = alto ? 54 : 48
  ctx.font = `800 ${fP}px ${SANS}`
  const anchos = pildoras.map(q => ctx.measureText(q.txt.toUpperCase()).width + hP * 1.45)
  const total = anchos.reduce((a, w) => a + w, 0) + (anchos.length - 1) * 28
  // Junto al número si cabe (centradas en su altura); si no, debajo de su unidad.
  const enLinea = pad + wNum + 70 + total <= W - pad && pildoras.length === 1
  const yUni = base + (alto ? 104 : 92)
  linea(ctx, hayCifra ? d.unidad : d.porque, pad, yUni, ancho, alto ? 70 : 62, '500', SANS, P.muted, 36)
  let yP = enLinea ? base - k * 0.36 - hP / 2 : yUni + (alto ? 56 : 44)
  let xP = enLinea ? W - pad - total : pad
  pildoras.forEach((q, i) => {
    const w = anchos[i]
    rr(ctx, xP, yP, w, hP, hP / 2)
    ctx.fillStyle = q.lleno ? q.col : alfa(q.col, oscuro ? 0.18 : 0.12); ctx.fill()
    ctx.lineWidth = 4; ctx.strokeStyle = alfa(q.col, 0.8); ctx.stroke()
    ctx.beginPath(); ctx.arc(xP + hP * 0.52, yP + hP / 2, hP * 0.17, 0, Math.PI * 2); ctx.fillStyle = q.lleno ? '#1a0f00' : q.col; ctx.fill()
    if (q.col === P.dolor) { ctx.beginPath(); ctx.arc(xP + hP * 0.52, yP + hP / 2, hP * 0.29, 0, Math.PI * 2); ctx.strokeStyle = alfa(P.dolor, 0.5); ctx.lineWidth = 6; ctx.stroke() }
    linea(ctx, q.txt.toUpperCase(), xP + hP * 0.86, yP + hP * 0.7, w - hP, fP, '800', SANS, q.lleno ? '#1a0f00' : q.col, 30)
    xP += w + 28
  })
  if (!enLinea) yP += hP
  // La meta contra la realidad, abajo: una barra legible.
  const hB = alto ? 78 : 66, yB = H - pad - hB, yR = yB - 34, fR = alto ? 58 : 50
  // En medio: la curva de su realidad (los días del BI) o el contexto de su número. Solo si hay aire.
  const m0 = (enLinea ? yUni + 50 : yP + 50), m1 = yR - fR - 40
  if (m1 - m0 > 160 && d.serie.length >= 5) {
    curva(ctx, d.serie, pad, m0 + 56, ancho, m1 - m0 - 56, duele ? P.dolor : A, P.oro, oscuro)
    linea(ctx, `${d.serieNombre.toUpperCase()} · 30 DÍAS`, pad, m0 + 40, ancho, 40, '800', SANS, alfa(P.muted, 0.9), 26)
  } else if (m1 - m0 > 70 && d.detalle.length) {
    const lh = alto ? 64 : 56
    d.detalle.slice(0, Math.max(1, Math.floor((m1 - m0) / lh))).forEach((x, i) => linea(ctx, x, pad, m0 + 44 + i * lh, ancho, alto ? 50 : 44, '500', SANS, alfa(P.muted, 0.95), 28))
  }
  if (d.meta) {
    const f = d.meta.fraccion
    linea(ctx, `META ${d.meta.texto.toUpperCase()}`, pad, yR, ancho * 0.62, fR, '800', SANS, P.texto, 34)
    linea(ctx, f === null ? 'sin realidad' : `${f < 0.1 ? (Math.round(f * 1000) / 10).toLocaleString('es-MX') : Math.round(f * 100)} %`, pad + ancho * 0.62, yR, ancho * 0.38, fR + 16, '800', SANS, duele ? P.dolor : A, 40, 'right')
    rr(ctx, pad, yB, ancho, hB, hB / 2); ctx.fillStyle = alfa(P.texto, oscuro ? 0.1 : 0.07); ctx.fill()
    if (f !== null) {
      const w = Math.max(hB, Math.min(1, f) * ancho)
      const gb = ctx.createLinearGradient(pad, 0, pad + ancho, 0); gb.addColorStop(0, duele ? P.dolor : A); gb.addColorStop(1, P.oro)
      rr(ctx, pad, yB, w, hB, hB / 2); ctx.fillStyle = gb; ctx.fill()
    }
  } else {
    // Sin meta escrita en su fuente: un hueco que se ve a propósito y que invita a ponerla. Nunca una meta inventada.
    linea(ctx, 'SIN META', pad, yR, ancho * 0.36, fR, '800', SANS, P.muted, 34)
    if (d.realidad) linea(ctx, d.realidad, pad + ancho * 0.36, yR, ancho * 0.64, fR - 10, '600', SANS, P.muted, 26, 'right')
    rr(ctx, pad, yB, ancho, hB, hB / 2); ctx.setLineDash([26, 18]); ctx.lineWidth = 5; ctx.strokeStyle = alfa(A, 0.85); ctx.stroke(); ctx.setLineDash([])
    linea(ctx, 'ponla tú  ＋', pad, yB + hB * 0.68, ancho, hB * 0.62, 'italic 650', SANS, A, 28, 'center')
  }
  // Lo que no es meta, aparte y en tinta apagada, bajo la barra (las cuotas que no son MRR recurrente).
  if (d.aparte) linea(ctx, d.aparte, pad, yB + hB + 52, ancho, alto ? 42 : 38, '600', SANS, P.muted, 24)
  // El borde: su acento; si duele, el rojo y más grueso.
  rr(ctx, 3, 3, W - 6, H - 6, 28); ctx.lineWidth = duele ? 14 : 6; ctx.strokeStyle = duele ? P.dolor : alfa(A, 0.7); ctx.stroke()
}

/** La curva de su realidad: área suave en su acento y el último día en oro. Los días sin dato ya no vienen (nunca 0). */
function curva(ctx: CanvasRenderingContext2D, serie: number[], x: number, y: number, w: number, h: number, col: string, oro: string, oscuro: boolean) {
  const lo = Math.min(...serie), hi = Math.max(...serie), span = hi - lo || 1
  const X = (i: number) => x + (i / (serie.length - 1)) * w, Y = (v: number) => y + h - 10 - ((v - lo) / span) * (h - 30)
  ctx.beginPath(); serie.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))))
  ctx.lineTo(X(serie.length - 1), y + h); ctx.lineTo(x, y + h); ctx.closePath()
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, alfa(col, oscuro ? 0.38 : 0.24)); g.addColorStop(1, alfa(col, 0))
  ctx.fillStyle = g; ctx.fill()
  ctx.beginPath(); serie.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))))
  ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke()
  const u = serie.length - 1
  ctx.beginPath(); ctx.arc(X(u), Y(serie[u]), 20, 0, Math.PI * 2); ctx.fillStyle = oro; ctx.fill()
}

/** Renglones de `s` que caben en `w` a ese tamaño (como mucho `max`; el último con «…» si no cupo). */
function renglones(ctx: CanvasRenderingContext2D, s: string, w: number, tam: number, peso: string, familia: string, max: number): string[] {
  ctx.font = `${peso} ${tam}px ${familia}`
  const out: string[] = []
  for (const p of s.split(/\s+/).filter(Boolean)) { const u = out.at(-1); if (u !== undefined && ctx.measureText(`${u} ${p}`).width <= w) out[out.length - 1] = `${u} ${p}`; else out.push(p) }
  if (out.length > max) { out.length = max; out[max - 1] = out[max - 1].replace(/\s*\S*$/, '') + '…' }
  return out
}

/** Un capítulo de lejos: su título enorme, su promesa en una frase y su cita firmada; la oferta, con su escalera. */
function pintarCapitulo(ctx: CanvasRenderingContext2D, d: DatosCartelCapitulo, W: number, H: number, P: PaletaCartel, oscuro: boolean) {
  const A = ACENTO[d.acento][oscuro ? 'oscuro' : 'claro']
  const fondo = ctx.createLinearGradient(0, 0, 0, H); fondo.addColorStop(0, P.arriba); fondo.addColorStop(1, P.abajo)
  ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H)
  const luz = ctx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, W * 1.1)
  luz.addColorStop(0, alfa(A, oscuro ? 0.36 : 0.18)); luz.addColorStop(1, alfa(A, 0)); ctx.fillStyle = luz; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = A; ctx.fillRect(0, 0, W, 22)
  const pad = 96, ancho = W - 2 * pad, D = 230
  // Todo el bloque de texto, centrado en el alto si la isla es alta (sin escalera) o arriba (con escalera abajo).
  const tit = renglones(ctx, d.titulo, ancho, 230, '600', SERIF, 2)
  const baj = renglones(ctx, d.bajada, ancho, 92, 'italic 500', SERIF, 4)
  const cit = d.cita ? renglones(ctx, d.cita, ancho - 50, 70, 'italic 500', SERIF, 4) : []
  const altoTexto = D + 70 + tit.length * 236 + 40 + baj.length * 110 + (cit.length ? 80 + cit.length * 86 : 0)
  const hEsc = d.peldanos.length ? Math.min(H * 0.38, 900) : 0
  let y = d.peldanos.length ? 110 : Math.max(110, (H - altoTexto) / 2)
  ctx.beginPath(); ctx.arc(pad + D / 2, y + D / 2, D / 2, 0, Math.PI * 2)
  const g = ctx.createLinearGradient(pad, y, pad + D, y + D); g.addColorStop(0, A); g.addColorStop(1, alfa(P.oro, 0.85)); ctx.fillStyle = g; ctx.fill()
  icono(ctx, d.icono, pad + D / 2, y + D / 2, D * 0.54, '#ffffff')
  if (d.ceja) renglones(ctx, d.ceja.toUpperCase(), ancho - D - 50, 52, '800', SANS, 2).forEach((r, i) => linea(ctx, r, pad + D + 50, y + D / 2 + 18 + (i - 0.5) * 64, ancho - D - 50, 52, '800', SANS, A, 30))
  y += D + 70
  tit.forEach(r => { linea(ctx, r, pad, y + 190, ancho, 230, '600', SERIF, P.texto, 120); y += 236 })
  y += 40
  baj.forEach(r => { linea(ctx, r, pad, y + 80, ancho, 92, 'italic 500', SERIF, alfa(P.texto, 0.82), 50); y += 110 })
  // La cita, solo los renglones que caben antes del borde (o de la escalera): el último con «…».
  const tope = (d.peldanos.length ? H - pad - hEsc - 60 : H - pad) - (y + 60)
  const caben = Math.min(cit.length, Math.floor(tope / 86))
  if (caben > 0) {
    const us = cit.slice(0, caben)
    if (caben < cit.length) us[caben - 1] = us[caben - 1].replace(/\s*\S*$/, '') + '…'
    y += 60
    ctx.fillStyle = P.oro; ctx.fillRect(pad, y + 6, 10, us.length * 86 - 6)
    us.forEach(r => { linea(ctx, r, pad + 50, y + 66, ancho - 50, 70, 'italic 500', SERIF, P.muted, 40); y += 86 })
  }
  // La escalera de la oferta: sus peldaños subiendo, el abierto punteado.
  if (d.peldanos.length) {
    const n = d.peldanos.length, gap = 40, w = (ancho - gap * (n - 1)) / n, base = H - pad
    d.peldanos.forEach((q, i) => {
      const h = hEsc * (0.45 + 0.55 * (i + 1) / n), x = pad + i * (w + gap), col = q.tono === 'oro' ? P.oro : q.tono === 'morado' ? (oscuro ? '#b47dff' : P.brand) : P.muted
      rr(ctx, x, base - h, w, h, 28)
      ctx.fillStyle = alfa(col, q.abierto ? 0.06 : oscuro ? 0.22 : 0.16); ctx.fill()
      ctx.setLineDash(q.abierto ? [24, 16] : []); ctx.lineWidth = 6; ctx.strokeStyle = alfa(col, 0.9); ctx.stroke(); ctx.setLineDash([])
      renglones(ctx, q.nombre, w - 50, 56, '700', SERIF, 3).forEach((r, k) => linea(ctx, r, x + 25, base - h + 86 + k * 66, w - 50, 56, '700', SERIF, P.texto, 30))
    })
  }
  rr(ctx, 3, 3, W - 6, H - 6, 28); ctx.lineWidth = 6; ctx.strokeStyle = alfa(A, 0.6); ctx.stroke()
}

/** El timonel de lejos: la corrección que baja (el cuello del embudo) en grande. */
function pintarTimonel(ctx: CanvasRenderingContext2D, d: DatosCartelTimonel, W: number, H: number, P: PaletaCartel, oscuro: boolean) {
  const A = ACENTO.violeta[oscuro ? 'oscuro' : 'claro']
  const fondo = ctx.createLinearGradient(0, 0, 0, H); fondo.addColorStop(0, P.arriba); fondo.addColorStop(1, P.abajo)
  ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H)
  const luz = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.9)
  luz.addColorStop(0, alfa(A, oscuro ? 0.4 : 0.2)); luz.addColorStop(1, alfa(A, 0)); ctx.fillStyle = luz; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = A; ctx.fillRect(0, 0, W, 22)
  const pad = 88, ancho = W - 2 * pad, D = 210, cy = 74 + D / 2
  ctx.beginPath(); ctx.arc(pad + D / 2, cy, D / 2, 0, Math.PI * 2)
  const g = ctx.createLinearGradient(pad, cy - D / 2, pad + D, cy + D / 2); g.addColorStop(0, A); g.addColorStop(1, P.oro); ctx.fillStyle = g; ctx.fill()
  icono(ctx, 'timon', pad + D / 2, cy, D * 0.56, '#ffffff')
  linea(ctx, d.titulo, pad + D + 56, cy + 46, W - pad * 2 - D - 120, 150, '600', SERIF, P.texto, 70)
  linea(ctx, 'LA CORRECCIÓN QUE BAJA · EL CUELLO', pad, cy + D / 2 + 110, ancho, 50, '800', SANS, P.oro, 30)
  // La corrección, en dos renglones como mucho, serif grande.
  const palabras = d.correccion.split(/\s+/), renglones: string[] = []
  ctx.font = `italic 600 120px ${SERIF}`
  for (const w of palabras) { const u = renglones.at(-1); if (u && ctx.measureText(`${u} ${w}`).width < ancho) renglones[renglones.length - 1] = `${u} ${w}`; else renglones.push(w) }
  renglones.slice(0, 3).forEach((r, i) => linea(ctx, r, pad, cy + D / 2 + 250 + i * 136, ancho, 120, 'italic 600', SERIF, P.texto, 70))
  const yM = H - pad - 40
  linea(ctx, d.mide ? `lo que mide: ${d.mide}` : '', pad, yM - 70, ancho, 56, '600', SANS, P.muted, 30)
  linea(ctx, d.numero ? d.numero : 'sin número todavía', pad, yM, ancho * 0.6, 60, d.numero ? '800' : 'italic 650', SANS, d.numero ? P.texto : A, 30)
  if (d.embudo) linea(ctx, d.embudo.toUpperCase(), pad + ancho * 0.5, yM, ancho * 0.5, 44, '800', SANS, alfa(P.muted, 0.9), 26, 'right')
  rr(ctx, 3, 3, W - 6, H - 6, 28); ctx.lineWidth = 6; ctx.strokeStyle = alfa(A, 0.7); ctx.stroke()
}

/** Mi norte de lejos: el círculo NOVA de protagonista. */
function pintarNova(ctx: CanvasRenderingContext2D, d: DatosCartelNova, W: number, H: number, P: PaletaCartel, oscuro: boolean) {
  const fondo = ctx.createLinearGradient(0, 0, 0, H); fondo.addColorStop(0, P.arriba); fondo.addColorStop(1, P.abajo)
  ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H)
  const morado = oscuro ? '#b47dff' : P.brand
  // El título arriba.
  linea(ctx, d.titulo, 90, 210, W - 180, 170, '600', SERIF, P.texto, 90)
  const R = Math.min(W * 0.46, (H - 360) / 2), cx = W / 2, cy = 300 + R + (H - 300 - 2 * R) / 2 - 10
  // La luz del núcleo derramándose por los anillos.
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1)
  halo.addColorStop(0, alfa(P.oro, oscuro ? 0.45 : 0.3)); halo.addColorStop(0.35, alfa(morado, oscuro ? 0.22 : 0.12)); halo.addColorStop(1, alfa(morado, 0))
  ctx.fillStyle = halo; ctx.fillRect(cx - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4)
  const n = d.anillos.length, r0 = R * 0.3, paso = (R - r0) / Math.max(1, n)
  // Los anillos, de afuera hacia adentro (el de afuera abajo), con su letra grande sobre el eje vertical.
  for (let i = n - 1; i >= 0; i--) {
    const a = d.anillos[i], r = r0 + (i + 1) * paso
    const col = a.oro ? P.oro : morado
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = alfa(col, (oscuro ? 0.05 : 0.035) + (n - i) * (oscuro ? 0.018 : 0.012)); ctx.fill()
    ctx.lineWidth = a.oro ? 7 : 4.5; ctx.strokeStyle = alfa(col, a.oro ? 0.95 : 0.8); ctx.stroke()
  }
  for (let i = 0; i < n; i++) {
    const a = d.anillos[i], rm = r0 + (i + 0.5) * paso
    const col = a.oro ? P.oro : oscuro ? '#f3e8ff' : P.brand
    // Su letra sobre el eje horizontal, a la derecha del núcleo: de adentro hacia afuera se lee «∞ N O V A».
    linea(ctx, a.inicial, cx + rm - paso / 2, cy + paso * 0.22, paso, paso * 0.8, '600', SERIF, col, paso * 0.3, 'center')
    // Su nombre, chico, debajo de su letra (de cerca se lee entero; de lejos, la letra basta).
    if (a.nombre) linea(ctx, a.nombre.toUpperCase(), cx + rm - paso / 2, cy + paso * 0.52, paso * 0.96, Math.min(30, paso * 0.2), '800', SANS, alfa(col, 0.85), 14, 'center')
  }
  // El núcleo: oro, con el porqué.
  const nucleo = ctx.createRadialGradient(cx, cy - r0 * 0.3, 0, cx, cy, r0)
  nucleo.addColorStop(0, '#fff3dc'); nucleo.addColorStop(0.55, P.oro); nucleo.addColorStop(1, '#a85a00')
  ctx.beginPath(); ctx.arc(cx, cy, r0, 0, Math.PI * 2); ctx.fillStyle = nucleo; ctx.fill()
  ctx.lineWidth = 6; ctx.strokeStyle = alfa('#ffffff', 0.6); ctx.stroke()
  const palabras = d.nucleo.split(/\s+/).filter(Boolean)
  const lineas: string[] = []
  ctx.font = `italic 600 ${Math.round(r0 * 0.3)}px ${SERIF}`
  for (const p of palabras) { const u = lineas.at(-1); if (u && ctx.measureText(`${u} ${p}`).width < r0 * 1.55) lineas[lineas.length - 1] = `${u} ${p}`; else lineas.push(p) }
  const lh = r0 * 0.34, y0 = cy - ((lineas.length - 1) * lh) / 2 + r0 * 0.1
  lineas.slice(0, 4).forEach((l, i) => linea(ctx, l, cx - r0 * 0.85, y0 + i * lh, r0 * 1.7, Math.round(r0 * 0.3), 'italic 600', SERIF, '#2a1500', r0 * 0.16, 'center'))
  if (d.rotulo) linea(ctx, d.rotulo.toUpperCase(), cx - r0, cy - r0 * 0.62, r0 * 2, Math.round(r0 * 0.12), '800', SANS, alfa('#2a1500', 0.75), 14, 'center')
  rr(ctx, 3, 3, W - 6, H - 6, 28); ctx.lineWidth = 6; ctx.strokeStyle = alfa(P.oro, 0.7); ctx.stroke()
}
