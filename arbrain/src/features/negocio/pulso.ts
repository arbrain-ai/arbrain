/**
 * Tu negocio › El pulso (7 nov 2026). Daniel: «el libro no debería verlo… luce aburrido… prefiero un lienzo… un botón que
 * abra y redirija al lienzo en una nueva pestaña» y, a las 15:05, «sistema nervioso de todas las interconexiones… vamos a
 * darle cien por ciento la atención a esto».
 *
 * Seis órganos (marketing, venta, mente del comprador, entrega, finanzas, sistemas), cada uno con su número SOLO si hay una
 * fuente real que la app ya consulta: Cohorte (Polar y la plataforma del programa), Finanzas (sin SAT ni «te queda»), el Taller (rutinas y
 * agentes) y la voz del cliente. Sin sensor, la tarjeta dice «sin datos todavía» y qué sensor falta. Nunca una cifra
 * inventada ni un 0 por falta de dato. Lógica pura (sin React ni fs): la usan la vista, la API y node:test.
 */
import type { FinancesPayload } from '@/features/finances/types/finances'
import type { CronSnapshot } from '@/features/planning/types'
import { estado as estadoRutina } from '@/features/rutinas/model'
import { esAgente, type Trabajos } from '@/features/cabina/trabajos-modelo'
import { iniciales, type Velo, enmascarar } from '@/lib/modo-directo/reglas'
import type { Embudo } from './embudo'
import type { CanalPulso, RespuestaMarketing } from './marketing'

export const ORGANOS = ['marketing', 'venta', 'comprador', 'entrega', 'finanzas', 'sistemas'] as const
export type Organo = (typeof ORGANOS)[number]

/** Lo que muestra cada tarjeta: el órgano y la pregunta que contesta su número. */
export const ORGANO: Record<Organo, { nombre: string; pregunta: string }> = {
  marketing: { nombre: 'Marketing', pregunta: '¿Cuánta gente te descubre?' },
  venta: { nombre: 'Venta', pregunta: '¿Cuántos compran?' },
  comprador: { nombre: 'Mente del comprador', pregunta: '¿Qué dice, qué teme y qué desea?' },
  entrega: { nombre: 'Entrega', pregunta: '¿Avanzan tus fundadores?' },
  finanzas: { nombre: 'Finanzas', pregunta: '¿Qué entró y qué salió?' },
  sistemas: { nombre: 'Sistemas', pregunta: '¿Trabaja solo?' },
}

/** Adónde lleva tocar la tarjeta: su órgano (comprador) o la vista que ya tiene el detalle (`bi`: edición del alumno). */
export type Destino = 'comprador' | 'cohorte' | 'finanzas' | 'taller' | 'bi'

/**
 * El estado de una tarjeta. `numero`: hay cifra leída de su fuente. `sin-sensor`: no existe todavía una fuente que la app
 * consulte (dice cuál falta). `leyendo`: la fuente existe y se está pidiendo. `oculto`: modo directo. `error`: la fuente
 * existe pero no respondió (no es cero).
 */
export type EstadoPulso = 'numero' | 'sin-sensor' | 'leyendo' | 'oculto' | 'error'

export interface Pulso {
  organo: Organo; estado: EstadoPulso
  /** La cifra, ya en texto («12», «$48,300 MXN»). Solo con estado `numero`. */
  cifra?: string
  /** Qué cuenta la cifra («lugares pagados de la cohorte»). */
  unidad?: string
  /** Una o dos líneas de contexto, también leídas de la fuente. */
  detalle?: string[]
  /** De dónde sale. */
  fuente: string
  /** Sin sensor: qué lo mediría. */
  falta?: string
  /** Con error: qué pasó, en palabras. */
  error?: string
  abre?: Destino
  /** Marketing: la semana de cada canal, cada cifra con su fuente y sus fechas. */
  canales?: CanalPulso[]
  /** Edición del alumno (pulso-cliente.ts): sin número, la tarjeta dice «Conecta tu fuente» en vez de «Falta el sensor». */
  conecta?: boolean
  /** La pregunta del órgano cuando la del autor no aplica a cualquier negocio. */
  pregunta?: string
}

/**
 * Lo que el pulso lee de /api/cohorte: un pedazo de `DatosCohorte` (features/cohorte/modelo), declarado aquí a propósito
 * (8 nov 2026). En la copia del alumno ese módulo es una plantilla vacía (`Record<string, never>`) y tomar su tipo rompía
 * la compilación de la copia en la CI de la v0.2.24. El pulso ya valida la forma en tiempo de ejecución (obj0, isArray).
 */
export interface CohortePulso {
  cupo: number
  numeros: {
    cuposPagados: number | null
    llamadas: { total: number; presento: number; noLlego: number; canceladas: number; porVenir: number; sinMarca: number } | null
  }
  fundadores: { cerebro: unknown; atorado: unknown }[]
}

/** Una lectura de `useFuente` reducida a lo que el pulso necesita. */
export interface LecturaDe<T> { data?: T; error?: string }

const MXN = (n: number) => `$${Math.round(n).toLocaleString('es-MX')} MXN`
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

const RARA = 'La fuente respondió algo que no se esperaba.'
const obj0 = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

const FUENTE = {
  marketing: 'YouTube Analytics y enlaces rastreados',
  venta: 'Polar y la plataforma · cohorte fundadora',
  comprador: 'La voz del cliente (voz-del-cliente.json)',
  entrega: 'La plataforma · el cerebro de cada fundador',
  finanzas: 'Finanzas · tus cuentas, últimos 30 días',
  sistemas: 'Taller · rutinas y agentes',
} as const satisfies Record<Organo, string>

/** Común a las fuentes que se leen: modo directo, error o leyendo. null = ya hay datos. */
function antesDeLeer<T>(organo: Organo, l: LecturaDe<T>, oculto: boolean, abre?: Destino): Pulso | null {
  const base = { organo, fuente: FUENTE[organo], abre }
  if (oculto) return { ...base, estado: 'oculto' }
  if (l.data !== undefined) return null
  if (l.error) return { ...base, estado: 'error', error: l.error }
  return { ...base, estado: 'leyendo' }
}

/**
 * Marketing (8 nov 2026): la semana de cada canal de YouTube (sensor diario `marketing_canales.py`) y los clics a la
 * comunidad (enlaces rastreados). El canal principal primero; un canal sin dato queda «esperando primer dato».
 */
export function pulsoMarketing(l: LecturaDe<RespuestaMarketing> = {}): Pulso {
  const previo = antesDeLeer('marketing', l, false)
  if (previo) return previo
  const r = l.data!
  const sinSensor = (falta: string): Pulso => ({ organo: 'marketing', estado: 'sin-sensor', fuente: FUENTE.marketing, falta })
  if (!r.activo) return sinSensor('Un sensor que la app pueda leer: impresiones, CTR y clics de tus videos a la comunidad, por semana.')
  if (!Array.isArray(r.canales)) return { organo: 'marketing', estado: 'error', fuente: FUENTE.marketing, error: RARA }
  if (!r.canales.length) return r.errores?.length
    ? { organo: 'marketing', estado: 'error', fuente: FUENTE.marketing, error: r.errores[0] }
    : sinSensor(r.falta ?? 'El sensor de marketing todavía no deja su primera foto.')
  if (!r.canales.some(c => c.cifras.some(x => x.valor !== null))) return { ...sinSensor('Esperando primer dato de tus canales: el reporte de YouTube tarda hasta 48 h.'), canales: r.canales }
  const fecha = r.generado ? new Date(r.generado) : null
  const cuando = fecha && !Number.isNaN(fecha.getTime()) ? ` · sensor del ${fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' })}` : ''
  return { organo: 'marketing', estado: 'numero', fuente: `${FUENTE.marketing}${cuando}`, canales: r.canales }
}

/** Venta: los lugares pagados de la cohorte (Polar, sin pruebas), con las llamadas que se presentaron. */
export function pulsoVenta(l: LecturaDe<CohortePulso>, oculto = false): Pulso {
  const previo = antesDeLeer('venta', l, oculto, 'cohorte')
  if (previo) return previo
  if (!obj0(l.data!.numeros)) return { organo: 'venta', estado: 'error', fuente: FUENTE.venta, error: RARA, abre: 'cohorte' }
  const n = l.data!.numeros
  if (n.cuposPagados === null) return { organo: 'venta', estado: 'error', fuente: FUENTE.venta, error: 'Polar no respondió.', abre: 'cohorte' }
  const detalle: string[] = []
  if (l.data!.cupo) detalle.push(`Cupo de ${l.data!.cupo}`)
  if (n.llamadas && n.llamadas.total) detalle.push(`${n.llamadas.presento} de ${plural(n.llamadas.total, 'llamada', 'llamadas')} se presentaron`)
  return { organo: 'venta', estado: 'numero', cifra: String(n.cuposPagados), unidad: n.cuposPagados === 1 ? 'lugar pagado de la cohorte' : 'lugares pagados de la cohorte', detalle, fuente: FUENTE.venta, abre: 'cohorte' }
}

/** Entrega: cuántos fundadores ya conectaron su cerebro y cuántos están atorados. */
export function pulsoEntrega(l: LecturaDe<CohortePulso>, oculto = false): Pulso {
  const previo = antesDeLeer('entrega', l, oculto, 'cohorte')
  if (previo) return previo
  if (!Array.isArray(l.data!.fundadores)) return { organo: 'entrega', estado: 'error', fuente: FUENTE.entrega, error: RARA, abre: 'cohorte' }
  const f = l.data!.fundadores
  if (!f.length) return { organo: 'entrega', estado: 'sin-sensor', fuente: FUENTE.entrega, falta: 'Fundadores con pago: cuando entre el primero, aquí se ve si conectó su cerebro.', abre: 'cohorte' }
  const conectados = f.filter(x => x.cerebro).length
  const atorados = f.filter(x => x.atorado).length
  const detalle = [`De ${plural(f.length, 'fundador', 'fundadores')}`]
  if (atorados) detalle.push(plural(atorados, 'atorado en un paso', 'atorados en un paso'))
  return { organo: 'entrega', estado: 'numero', cifra: String(conectados), unidad: conectados === 1 ? 'cerebro conectado' : 'cerebros conectados', detalle, fuente: FUENTE.entrega, abre: 'cohorte' }
}

/** Finanzas como espejo (6 nov): lo que entró y salió en 30 días, y lo que tienes. Sin SAT ni «te queda». */
export function pulsoFinanzas(l: LecturaDe<FinancesPayload>, oculto = false): Pulso {
  const previo = antesDeLeer('finanzas', l, oculto, 'finanzas')
  if (previo) return previo
  const d = l.data!
  if (!obj0(d.summary) || typeof d.summary.income_range_mxn !== 'number') return { organo: 'finanzas', estado: 'error', fuente: FUENTE.finanzas, error: RARA, abre: 'finanzas' }
  if (!d.movements?.length && !d.tienes) return { organo: 'finanzas', estado: 'sin-sensor', fuente: FUENTE.finanzas, falta: 'Movimientos en tus cuentas: carga un estado de cuenta en Finanzas y aquí aparece lo que entró.', abre: 'finanzas' }
  const s = d.summary
  const detalle = [`Salió ${MXN(s.burn_range_mxn)}`]
  if (d.tienes) detalle.push(`Tienes ${MXN(d.tienes.mxn)}`)
  return { organo: 'finanzas', estado: 'numero', cifra: MXN(s.income_range_mxn), unidad: 'entró en 30 días', detalle, fuente: FUENTE.finanzas, abre: 'finanzas' }
}

/** Sistemas: de las rutinas que no están en pausa, cuántas salieron bien en su última corrida; y los agentes trabajando. */
export function pulsoSistemas(crons: LecturaDe<CronSnapshot>, trabajos: LecturaDe<Trabajos> = {}): Pulso {
  const previo = antesDeLeer('sistemas', crons, false, 'taller')
  if (previo) return previo
  const snap = crons.data!
  if (!Array.isArray(snap.jobs) || !Array.isArray(snap.runs)) return { organo: 'sistemas', estado: 'error', fuente: FUENTE.sistemas, error: RARA, abre: 'taller' }
  const activas = snap.jobs.filter(j => j.status !== 'paused')
  if (!activas.length) return { organo: 'sistemas', estado: 'sin-sensor', fuente: FUENTE.sistemas, falta: 'Rutinas activas: cuando programes la primera, aquí se ve si corre sola.', abre: 'taller' }
  const tonos = activas.map(j => estadoRutina(j, snap.runs).tono)
  const bien = tonos.filter(t => t === 'ok' || t === 'curso').length
  const fallan = tonos.filter(t => t === 'error').length
  const detalle: string[] = [`De ${plural(activas.length, 'rutina activa', 'rutinas activas')}`]
  if (fallan) detalle.push(plural(fallan, 'falló en su última corrida', 'fallaron en su última corrida'))
  if (trabajos.data && Array.isArray(trabajos.data.terminales)) {
    const agentes = trabajos.data.terminales.filter(t => esAgente(t) && t.estado === 'trabajando').length
      + (trabajos.data.internas ?? []).filter(t => t.estado === 'trabajando').length
    detalle.push(agentes ? `${plural(agentes, 'agente trabajando', 'agentes trabajando')} ahora` : 'Ningún agente trabajando ahora')
  }
  return { organo: 'sistemas', estado: 'numero', cifra: String(bien), unidad: bien === 1 ? 'rutina salió bien' : 'rutinas salieron bien', detalle, fuente: FUENTE.sistemas, abre: 'taller' }
}

/** Mente del comprador: cuántas citas reales hay y la objeción que más se repite. Siempre abre su órgano. */
export function pulsoComprador(l: LecturaDe<RespuestaComprador>): Pulso {
  const previo = antesDeLeer('comprador', l, false, 'comprador')
  if (previo) return previo
  const r = l.data!
  const voz = r.activo && obj0(r.voz) ? r.voz : null
  if (!voz?.datos || !voz.datos.citas.length) {
    return { organo: 'comprador', estado: 'sin-sensor', fuente: FUENTE.comprador, abre: 'comprador',
      falta: voz?.errores?.length ? 'La voz del cliente tiene un formato que no se pudo leer; Levy la corrige.' : 'La voz del cliente: las citas de tus llamadas y mensajes. Levy la está reuniendo.' }
  }
  const top = voz.datos.resumen.top_objeciones[0]
  return {
    organo: 'comprador', estado: 'numero', cifra: String(voz.datos.citas.length), unidad: voz.datos.citas.length === 1 ? 'cita de tus clientes' : 'citas de tus clientes',
    detalle: top ? [`Objeción nº 1: ${top.texto}`] : [], fuente: FUENTE.comprador, abre: 'comprador',
  }
}

// ── La voz del cliente ──

/** Ruta de la voz del cliente, relativa a la raíz del cerebro (la construye Levy con las llamadas y mensajes). */
export const RUTA_VOZ = '.claude/memory/project/mi-negocio/voz-del-cliente.json'

export interface Cita { texto: string; quien: string | null; tipo: string | null; tema: string | null; nivel_conciencia: string | null; objecion_tipo: string | null }
/** Un elemento del resumen: el texto y, si el archivo lo trae, cuántas veces apareció. */
export interface Tema { texto: string; veces: number | null }
export interface VozCliente { citas: Cita[]; resumen: { top_objeciones: Tema[]; top_deseos: Tema[]; top_dolores: Tema[] }; actualizado: string | null }

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)

/** Un tema del resumen acepta texto suelto o un objeto con su texto (o su tipo, como las objeciones) y su conteo. */
function tema(x: unknown): Tema | null {
  if (typeof x === 'string') return texto(x) ? { texto: x.trim(), veces: null } : null
  if (!obj(x)) return null
  const t = texto(x.texto) ?? texto(x.tema) ?? texto(x.nombre) ?? texto(x.objecion) ?? texto(x.deseo) ?? texto(x.dolor) ?? texto(x.tipo)
  if (!t) return null
  const n = [x.veces, x.n, x.conteo, x.count, x.menciones].find(v => typeof v === 'number' && Number.isFinite(v)) as number | undefined
  return { texto: t, veces: n ?? null }
}

/**
 * Lee el archivo de la voz del cliente con tolerancia: lo que no trae «texto» se descarta y se cuenta como error; un
 * resumen ausente queda vacío (no se inventa). El esquema: citas[{texto,quien,tipo,tema,nivel_conciencia,objecion_tipo}],
 * resumen{top_objeciones,top_deseos,top_dolores}.
 */
export function leerVoz(x: unknown): { voz: VozCliente | null; errores: string[] } {
  if (!obj(x)) return { voz: null, errores: ['El archivo no es un objeto JSON.'] }
  if (!Array.isArray(x.citas)) return { voz: null, errores: ['Falta la lista «citas».'] }
  const errores: string[] = []
  const citas: Cita[] = []
  for (const [i, c] of x.citas.entries()) {
    if (!obj(c) || !texto(c.texto)) { errores.push(`Cita ${i + 1}: falta «texto».`); continue }
    citas.push({ texto: texto(c.texto)!, quien: texto(c.quien), tipo: texto(c.tipo), tema: texto(c.tema), nivel_conciencia: texto(c.nivel_conciencia), objecion_tipo: texto(c.objecion_tipo) })
  }
  const r = obj(x.resumen) ? x.resumen : {}
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(tema).filter((t): t is Tema => !!t) : [])
  const actualizado = texto(x.actualizado) ?? texto(x.generado) ?? texto(x.fecha)
  return { voz: { citas, resumen: { top_objeciones: lista(r.top_objeciones), top_deseos: lista(r.top_deseos), top_dolores: lista(r.top_dolores) }, actualizado }, errores }
}

/** Modo directo: quien se ve como iniciales y los textos pasan por el velo (dinero, correos, teléfonos, nombres). */
export function velarVoz(v: VozCliente, velo: Velo | null): VozCliente {
  const t = (s: string) => enmascarar(s, velo)
  const temas = (xs: Tema[]) => xs.map(x => ({ ...x, texto: t(x.texto) }))
  return {
    ...v,
    citas: v.citas.map(c => ({ ...c, texto: t(c.texto), quien: c.quien ? iniciales(c.quien) : null, tema: c.tema ? t(c.tema) : null })),
    resumen: { top_objeciones: temas(v.resumen.top_objeciones), top_deseos: temas(v.resumen.top_deseos), top_dolores: temas(v.resumen.top_dolores) },
  }
}

// ── El órgano: avatar, vehículo y canal ──

/** Una pieza leída de un canónico: su nombre corto, una frase del documento y de dónde sale. */
export interface Pieza { nombre: string; frase: string | null; ruta: string }

/**
 * Las fuentes de avatar y vehículo, con un ancla para la frase que se enseña. Si el documento cambia y el ancla ya no está,
 * se enseña solo el nombre y el enlace al canónico (nunca una frase inventada).
 */
export const FUENTES_COMPRADOR = {
  avatar: { ruta: '.claude/skills/arquitectura-marketing/references/avatar.md', nombre: /^##\s+Aclaraci[oó]n[^:\n]*:\s*(.+)$/m, ancla: /se conecta con aplicarla/i },
  vehiculo: { ruta: '.claude/memory/project/vehiculo-consultor-negocios-ia-2026-10-22.md', nombre: /^#\s+[^:\n]*:\s*(.+)$/m, ancla: /vende criterio de negocio/i },
} as const

const limpiarMd = (t: string) => t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/[*_`>]+/g, '').replace(/\s+/g, ' ').trim()
const mayus = (t: string) => (t ? t[0].toLocaleUpperCase('es') + t.slice(1) : t)

/** Del markdown: el nombre (por su patrón, o el H1) y la frase que contiene el ancla, entera y sin markdown. */
export function piezaDe(md: string, f: { ruta: string; nombre: RegExp; ancla: RegExp }): Pieza {
  const h1 = /^#\s+(.+)$/m.exec(md)?.[1] ?? ''
  const nombre = mayus(limpiarMd(f.nombre.exec(md)?.[1] ?? h1))
  const parrafos = md.split(/\n\s*\n/).map(p => p.trim()).filter(p => p && !/^(#|\||```|---|<)/.test(p))
  const parrafo = parrafos.find(p => f.ancla.test(p))
  let frase: string | null = null
  if (parrafo) {
    const limpio = limpiarMd(parrafo).replace(/^[^:]{1,40}:\s+(?=[a-záéíóúñ«])/i, '')
    frase = mayus(limpio.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ«¿0-9])/).find(s => f.ancla.test(s)) ?? limpio)
  }
  return { nombre: nombre || f.ruta.split('/').pop()!, frase, ruta: f.ruta }
}

/** El canal: por dónde llega la gente, leído del embudo (la etapa de Adquisición de cada embudo). Lo que opera, primero. */
export function canalesDe(e: Embudo | null | undefined): { nombre: string; embudo: string; que: string; opera: boolean }[] {
  if (!e) return []
  const nombreDe = (id: string) => e.embudos?.find(b => b.id === id)?.nombre ?? id
  return e.etapas
    .filter(et => et.etapa === 'Adquisición')
    .map(et => ({ nombre: et.nombre, embudo: nombreDe(et.embudo), que: et.que_pasa, opera: et.opera_hoy }))
    .sort((a, b) => Number(b.opera) - Number(a.opera))
}

/** El lienzo del sistema nervioso: el id de página que Daniel pone en `lienzo_sistema`. Vacío = «lienzo en camino». */
export const lienzoSistema = (e: Embudo | null | undefined): string | null => {
  const id = e?.lienzo_sistema
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

/** Respuesta de /api/negocio/comprador. */
export type RespuestaComprador =
  | { activo: false }
  | { activo: true; avatar: Pieza | null; vehiculo: Pieza | null; voz: { ruta: string; existe: boolean; datos: VozCliente | null; errores?: string[] }; directo: boolean
      /** Edición del alumno: cómo se llaman sus dos piezas (su oferta y su negocio, de Tu primer día). */
      etiquetas?: { avatar: string; vehiculo: string } }

export const URL_COMPRADOR = '/api/negocio/comprador'
