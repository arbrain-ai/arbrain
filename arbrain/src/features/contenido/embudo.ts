/**
 * «Su embudo» en la ficha de cada canal (19 nov 2026). Daniel: «yo al presionar cada uno, esperaría poder dar clic al
 * perfil de cada uno, y poder mirar su oferta, link etc…». La fuente es `contenido/youtube/intel/embudos/embudos.json`
 * (esquema `competidores-embudos/v1`, una ficha curada por canal, cada dato con fuente y fecha) y el estado semanal
 * `datos/estado-semanal.json` (qué canal cambió su embudo y cuándo). Aquí solo se RESUME para una tarjeta corta: qué
 * vende con precio, su regalo, a dónde manda sus videos, su promesa en una línea y su vehículo. Sin texto de más.
 * Puro (sin node ni React): lo usan la ruta del servidor y las pruebas.
 */

export interface EnlaceEmbudo { nombre: string; url: string | null }
export interface VentaEmbudo extends EnlaceEmbudo { precio: string | null }
export interface DestinoEmbudo extends EnlaceEmbudo { en: number; de: number }

export interface EmbudoCanal {
  slug: string
  channel_id: string
  vende: VentaEmbudo[]
  regalo: EnlaceEmbudo | null
  destinos: DestinoEmbudo[]
  promesa: string | null
  vehiculo: string[]
  /** Día del dato (AAAA-MM-DD): el corte de la ficha. */
  fecha: string
  /** Día en que el estudio semanal vio que su embudo cambió (AAAA-MM-DD), si pasó. */
  cambio: string | null
  completa: boolean
}

// Forma mínima de lo que se lee de embudos.json (el resto del esquema no se toca aquí).
type Precio = { monto?: number | null; moneda?: string | null; recurrencia?: string | null; texto?: string | null } | null
type Dato = { fecha?: string } | undefined
export interface FichaEmbudoJson {
  slug: string
  channel_id: string
  destinos_video?: { rol?: string; nombre?: string | null; url?: string; en_videos?: number; de_videos?: number }[]
  regalo_entrada?: { nombre?: string; url?: string | null; dato?: Dato }[]
  oferta_pagada?: { nombre?: string; precio?: Precio; url?: string | null; dato?: Dato }[]
  promesa?: { cita?: string; dato?: Dato }[]
  vehiculo?: string[]
  cobertura?: { estado?: string }
}
export interface EstadoSemanalJson { canales?: Record<string, { ultimo_cambio?: string | null }> }

/** Roles de destino que NO son su embudo: patrocinios, fuentes citadas, otros videos, portafolio. */
const FUERA = new Set(['afiliado_o_patrocinio', 'externo', 'otro_video', 'otro', 'portafolio'])

const VEHICULO: Record<string, string> = {
  comunidad_gratis: 'comunidad gratis', comunidad_pago: 'comunidad de pago', lead_magnet_correo: 'regalo por correo',
  recurso_sin_registro: 'recurso sin registro', curso_gratis_youtube: 'curso gratis en YouTube', curso_pago_unico: 'curso de pago',
  plataforma_de_cursos: 'plataforma de cursos', academia_suscripcion: 'academia por suscripción', suscripcion: 'suscripción',
  formacion_en_vivo: 'formación en vivo', formacion_de_socio: 'formación de socio', programa_por_aplicacion: 'programa por aplicación',
  producto_bajo_precio: 'producto de bajo precio', agencia: 'agencia', newsletter: 'newsletter', libro: 'libro',
  sesiones_en_vivo: 'sesiones en vivo', mentorias_grupales: 'mentorías grupales', servicio_conferencias: 'conferencias',
  canal_whatsapp: 'canal de WhatsApp', eventos: 'eventos', patrocinio_afiliado: 'patrocinios', software: 'software',
}
export const etiquetaVehiculo = (v: string) => VEHICULO[v] ?? v.replace(/_/g, ' ')

const RECURRENCIA: Record<string, string> = { mensual: '/mes', anual: '/año', trimestral: '/trimestre', pago_unico: ' pago único' }

/** «184 USD/mes», «5,000 USD pago único». Sin monto, nada (la tarjeta dice «sin precio visto»). */
export function precioCorto(p: Precio): string | null {
  if (!p || typeof p.monto !== 'number' || !Number.isFinite(p.monto)) return null
  const monto = p.monto.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return `${monto}${p.moneda ? ` ${p.moneda}` : ''}${p.recurrencia ? RECURRENCIA[p.recurrencia] ?? '' : ''}`
}

/** Solo enlaces web de verdad: nada de javascript:, mailto: ni rutas sueltas. */
export const urlSegura = (u: unknown): string | null => {
  if (typeof u !== 'string') return null
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.toString() : null } catch { return null }
}

const dominio = (u: string | null | undefined) => { try { return new URL(u ?? '').hostname.replace(/^www\./, '') } catch { return '' } }
const limpio = (t: unknown) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : '')

export function resumirEmbudo(f: FichaEmbudoJson, corte: string, estado?: EstadoSemanalJson | null): EmbudoCanal {
  const ofertas = (f.oferta_pagada ?? []).filter(o => limpio(o.nombre))
  // Primero lo que tiene precio visto; dentro, el orden de la ficha (la curaduría pone primero la oferta principal).
  const vende = [...ofertas].sort((a, b) => Number(precioCorto(b.precio ?? null) != null) - Number(precioCorto(a.precio ?? null) != null))
    .slice(0, 2).map(o => ({ nombre: limpio(o.nombre), precio: precioCorto(o.precio ?? null), url: urlSegura(o.url) }))
  const r = (f.regalo_entrada ?? []).find(x => limpio(x.nombre) && urlSegura(x.url)) ?? (f.regalo_entrada ?? []).find(x => limpio(x.nombre))
  const vistos = new Set<string>()
  const destinos: DestinoEmbudo[] = []
  for (const d of [...(f.destinos_video ?? [])].sort((a, b) => (b.en_videos ?? 0) - (a.en_videos ?? 0))) {
    const url = urlSegura(d.url)
    const nombre = limpio(d.nombre) || dominio(url)
    if (!url || !nombre || FUERA.has(d.rol ?? '') || /no suyo/i.test(nombre) || vistos.has(nombre)) continue
    vistos.add(nombre)
    destinos.push({ nombre, url, en: d.en_videos ?? 0, de: d.de_videos ?? 0 })
    if (destinos.length === 3) break
  }
  const cambio = estado?.canales?.[f.slug]?.ultimo_cambio ?? null
  return {
    slug: f.slug, channel_id: f.channel_id, vende,
    regalo: r ? { nombre: limpio(r.nombre), url: urlSegura(r.url) } : null,
    destinos,
    promesa: limpio(f.promesa?.find(p => limpio(p.cita))?.cita) || null,
    vehiculo: [...new Set((f.vehiculo ?? []).filter(v => typeof v === 'string' && v))].map(etiquetaVehiculo),
    fecha: corte, cambio: typeof cambio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cambio) ? cambio : null,
    completa: f.cobertura?.estado === 'completa',
  }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** «19 nov» desde «2026-11-19». */
export function diaCorto(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1] ?? ''}`.trim() : ''
}

// ── «Competidores» (19 nov 2026, Daniel 14:07): qué modelo de negocio predomina y la lista de quién vende qué ─────────

// Los siete que nombró Daniel. Formatos de entrega (en vivo, eventos) y canales (lista de correo) no son modelo de negocio.
export type ModeloId = 'comunidad_pago' | 'comunidad_gratis' | 'curso' | 'software' | 'alto_ticket' | 'agencia' | 'patrocinio'
export const MODELOS: [ModeloId, string][] = [
  ['comunidad_pago', 'Comunidad de pago'], ['comunidad_gratis', 'Comunidad gratis'], ['alto_ticket', 'Alto ticket'],
  ['curso', 'Curso o producto'], ['software', 'Software'], ['agencia', 'Agencia o servicio'], ['patrocinio', 'Patrocinio o afiliado'],
]
export const nombreModelo = (id: ModeloId) => MODELOS.find(([m]) => m === id)?.[1] ?? id

const POR_VEHICULO: Record<string, ModeloId> = {
  comunidad_pago: 'comunidad_pago', academia_suscripcion: 'comunidad_pago', suscripcion: 'comunidad_pago',
  comunidad_gratis: 'comunidad_gratis',
  curso_pago_unico: 'curso', plataforma_de_cursos: 'curso', producto_bajo_precio: 'curso', libro: 'curso',
  software: 'software',
  programa_por_aplicacion: 'alto_ticket', formacion_de_socio: 'alto_ticket',
  agencia: 'agencia', servicio_conferencias: 'agencia',
  patrocinio_afiliado: 'patrocinio',
}
const POR_ROL: Record<string, ModeloId> = {
  comunidad_pago: 'comunidad_pago', academia_suscripcion: 'comunidad_pago', comunidad_gratis: 'comunidad_gratis',
  curso_pago_unico: 'curso', programa_por_aplicacion: 'alto_ticket', masterclass_socio: 'alto_ticket', agencia: 'agencia',
}

/** Alto ticket por precio: 1,000 o más por pago o por año (o 500 al mes), en cualquier moneda escrita. */
const precioAlto = (p: Precio) => !!p && typeof p.monto === 'number' &&
  (p.recurrencia === 'mensual' ? p.monto >= 500 : p.recurrencia === 'trimestral' ? p.monto >= 300 : p.monto >= 1000)

/** Los modelos de negocio de un canal, desde su vehículo, a dónde mandan sus videos y el precio de lo que vende. Un
 *  patrocinio cuenta solo si lo declara su vehículo o aparece en 3 o más de sus videos (uno suelto no es su modelo). */
export function modelosDe(f: FichaEmbudoJson): ModeloId[] {
  const m = new Set<ModeloId>()
  for (const v of f.vehiculo ?? []) if (POR_VEHICULO[v]) m.add(POR_VEHICULO[v])
  for (const d of f.destinos_video ?? []) {
    if (d.rol && POR_ROL[d.rol]) m.add(POR_ROL[d.rol])
    if (d.rol === 'afiliado_o_patrocinio' && (d.en_videos ?? 0) >= 3) m.add('patrocinio')
  }
  if ((f.oferta_pagada ?? []).some(o => precioAlto(o.precio ?? null))) m.add('alto_ticket')
  return MODELOS.map(([id]) => id).filter(id => m.has(id))
}

export interface Competidor {
  channel_id: string; slug: string; nombre: string; idioma: 'es' | 'en' | string
  oferta: string | null; precio: string | null; url: string | null; modelos: ModeloId[]; completa: boolean
}
export function competidorDe(f: FichaEmbudoJson & { nombre?: string; idioma?: string }, corte: string): Competidor {
  const e = resumirEmbudo(f, corte)
  return { channel_id: f.channel_id, slug: f.slug, nombre: limpio(f.nombre) || f.slug, idioma: f.idioma ?? '',
    oferta: e.vende[0]?.nombre ?? null, precio: e.vende[0]?.precio ?? null, url: e.vende[0]?.url ?? null, modelos: modelosDe(f), completa: e.completa }
}

/** Cuántos canales tienen cada modelo, de más a menos (solo los que aparecen). */
export function conteoModelos(cs: Competidor[]): { id: ModeloId; nombre: string; canales: number }[] {
  return MODELOS.map(([id, nombre]) => ({ id, nombre, canales: cs.filter(c => c.modelos.includes(id)).length }))
    .filter(x => x.canales > 0).sort((a, b) => b.canales - a.canales)
}
