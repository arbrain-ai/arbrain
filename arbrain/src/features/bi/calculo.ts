/**
 * Business Intelligence · la cuenta del catálogo genérico (8 nov 2026). Los adaptadores (fuentes/) traen filas con nombre
 * de columna; aquí se convierten en lo que pinta el panel (serie diaria, barras o pasos) con las reglas de siempre:
 *
 * - Un día se cuenta en la zona del negocio. Fechas con zona («…Z», «…-06:00») se pasan a esa zona; sin zona, vale el día
 *   escrito. «08/11/2026» es día/mes (Latinoamérica) salvo que el archivo diga otro formato.
 * - Lo que la fuente CUBRE va de su primer a su último registro (un archivo) o hasta ayer (una base viva). Dentro, un día sin
 *   filas es 0; fuera, es «sin medir» (null). Un promedio sin filas no existe: null, nunca 0. Falta de dato no es cero.
 * - Un importe que no se puede leer no suma ni resta: la fila cuenta para «ventas», no para «lo que entró».
 * Lógica pura (sin fs ni red): la usan motor.ts y node:test.
 */
import { HISTORIA, sumarDias, type Barra, type Datos, type Punto } from './modelo'
import type { Ventana } from './catalogo'
import type { Filtro, FormatoFecha, Forma, Fuente, Mapeo } from './generico'

export type Celda = string | number | boolean | null
/** Lo que trae un adaptador: columnas y filas tal cual; `extremos` (primer y último valor de la fecha) si es una base. */
export interface Lote { columnas: string[]; filas: Celda[][]; viva: boolean; extremos?: [Celda, Celda] }

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** El índice de una columna sin distinguir mayúsculas, acentos ni espacios; -1 si no está. */
export function indiceColumna(columnas: string[], nombre: string): number {
  const exacta = columnas.indexOf(nombre)
  return exacta >= 0 ? exacta : columnas.map(normal).indexOf(normal(nombre))
}

export class ErrorFuente extends Error {}

function col(lote: Lote, fuente: Fuente, nombre: string): number {
  const i = indiceColumna(lote.columnas, nombre)
  if (i < 0) throw new ErrorFuente(`La fuente «${fuente.id}» no tiene la columna «${nombre}». Trae: ${lote.columnas.slice(0, 20).map(c => `«${c}»`).join(', ')}${lote.columnas.length > 20 ? '…' : ''}.`)
  return i
}

// ── Fechas ──

const diaCivil = (d: Date, zona: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const valida = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate() && y >= 1900 && y <= 2200
const dosDigitos = (n: number) => String(n).padStart(2, '0')

/** Un valor de la columna de fecha → «AAAA-MM-DD» del día civil del negocio, o null si no se puede leer. */
export function fechaCivil(v: Celda, formato: FormatoFecha = 'auto', zona = 'America/Mexico_City'): string | null {
  if (v === null || typeof v === 'boolean') return null
  if (typeof v === 'number') return null
  const t = v.trim()
  if (!t) return null
  // ISO con hora y zona: el instante, visto en la zona del negocio.
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i.exec(t)
  if (iso) {
    const [, y, m, d, hh, mm, ss, z] = iso
    if (!valida(+y, +m, +d)) return null
    if (!z) return `${y}-${m}-${d}`
    const off = z.toUpperCase() === 'Z' ? 'Z' : z.length === 3 ? `${z}:00` : z.includes(':') ? z : `${z.slice(0, 3)}:${z.slice(3)}`
    const instante = Date.parse(`${y}-${m}-${d}T${hh ?? '00'}:${mm ?? '00'}:${ss ?? '00'}${off}`)
    return Number.isNaN(instante) ? null : diaCivil(new Date(instante), zona)
  }
  if (formato === 'aaaa-mm-dd') return null
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T,]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?)?$/i.exec(t)
  if (!dmy) return null
  const a = +dmy[1], b = +dmy[2], y = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3]
  const mesPrimero = formato === 'mm/dd/aaaa' || (formato === 'auto' && b > 12 && a <= 12)
  const [d, m] = mesPrimero ? [b, a] : [a, b]
  return valida(y, m, d) ? `${y}-${dosDigitos(m)}-${dosDigitos(d)}` : null
}

/** Un importe como lo escribe una persona («$1,234.50», «1.234,50 MXN», «(300)») → número, o null. */
export function numero(v: Celda, decimal: '.' | ',' = '.'): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let t = v.trim()
  if (!t) return null
  const negativo = /^\(.*\)$/.test(t) || /^-/.test(t.replace(/^[^\d-]+/, ''))
  t = t.replace(/[^\d.,]/g, '')
  if (!t) return null
  t = decimal === ',' ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? (negativo ? -n : n) : null
}

const texto = (v: Celda) => (v === null ? '' : String(v).trim())

// ── De filas a registros ──

interface Registro { dia: string; fila: Celda[] }
interface Leida { fuente: Fuente; lote: Lote; registros: Registro[]; primerDia: string | null; ultimoDia: string | null; hasta: string | null; sinFecha: number }

/** Las filas con su día, la cobertura de la fuente y hasta qué día cerrado llega su dato. */
function leerLote(fuente: Fuente, lote: Lote, ayer: string, zona: string): Leida {
  const iFecha = col(lote, fuente, fuente.fecha)
  const formato = fuente.formato_fecha ?? 'auto'
  const registros: Registro[] = []
  let sinFecha = 0
  for (const fila of lote.filas) {
    const dia = fechaCivil(fila[iFecha] ?? null, formato, zona)
    if (dia) registros.push({ dia, fila })
    else if (texto(fila[iFecha] ?? null)) sinFecha++
  }
  let primerDia: string | null, ultimoDia: string | null
  if (lote.extremos) {
    primerDia = fechaCivil(lote.extremos[0], formato, zona)
    ultimoDia = fechaCivil(lote.extremos[1], formato, zona)
  } else {
    primerDia = registros.reduce<string | null>((m, r) => (m === null || r.dia < m ? r.dia : m), null)
    ultimoDia = registros.reduce<string | null>((m, r) => (m === null || r.dia > m ? r.dia : m), null)
  }
  // Una base viva cubre hasta ayer (hoy no ha cerrado); un archivo, hasta su último registro (y nunca hoy).
  const hasta = primerDia === null ? null : lote.viva ? ayer : ultimoDia && ultimoDia < ayer ? ultimoDia : ayer
  return { fuente, lote, registros, primerDia, ultimoDia, hasta, sinFecha }
}

function pasa(l: Leida, d: Filtro | undefined): (r: Registro) => boolean {
  if (!d) return () => true
  const i = col(l.lote, l.fuente, d.columna)
  const valores = new Set(d.es.map(v => normal(String(v))))
  return r => valores.has(normal(texto(r.fila[i] ?? null)))
}

// ── La cuenta ──

export interface Calculo { datos: Datos; hasta: string; aviso?: string }

export interface ArgsCalculo {
  forma: Forma
  mapeo: Mapeo
  fuentes: Fuente[]
  lotes: Record<string, Lote>
  ventana: Ventana
  /** El último día cerrado en la zona del negocio. */
  ayer: string
  zona: string
}

/** Corre una consulta genérica sobre lo que trajeron sus fuentes. Lanza ErrorFuente con palabras si falta una columna. */
export function calcular(a: ArgsCalculo): Calculo {
  const leidas = new Map(a.fuentes.map(f => {
    const lote = a.lotes[f.id]
    if (!lote) throw new ErrorFuente(`La fuente «${f.id}» no se leyó.`)
    return [f.id, leerLote(f, lote, a.ayer, a.zona)] as const
  }))
  const avisos: string[] = []
  for (const l of leidas.values()) {
    if (l.sinFecha) avisos.push(`${l.sinFecha.toLocaleString('es-MX')} ${l.sinFecha === 1 ? 'fila' : 'filas'} de «${l.fuente.nombre ?? l.fuente.id}» sin fecha legible: no se cuentan.`)
    if (l.lote.viva && l.ultimoDia && l.ultimoDia < sumarDias(a.ayer, -3)) avisos.push(`«${l.fuente.nombre ?? l.fuente.id}» no trae registros desde el ${l.ultimoDia}: si dejó de llenarse, los ceros no son reales.`)
  }
  const hastas = [...leidas.values()].map(l => l.hasta).filter((h): h is string => !!h)
  if (!hastas.length) return { datos: vacio(a.forma), hasta: a.ayer, aviso: 'La fuente no trae filas con fecha todavía.' }
  const hasta = hastas.sort()[0]
  const aviso = avisos.join(' ') || undefined
  const m = a.mapeo

  if (a.forma === 'pasos') {
    const desde = sumarDias(hasta, -(a.ventana - 1))
    const pasos: Barra[] = (m.pasos ?? []).map((p, k) => {
      const l = leidas.get(p.fuente)!
      const ok = pasa(l, p.donde)
      return { id: `paso-${k + 1}`, etiqueta: p.etiqueta, valor: l.registros.filter(r => r.dia >= desde && r.dia <= hasta && ok(r)).length }
    })
    return { datos: { forma: 'embudo', pasos }, hasta, aviso }
  }

  const l = leidas.get(m.fuente!)!
  const ok = pasa(l, m.donde)
  const iValor = m.valor ? col(l.lote, l.fuente, m.valor) : -1
  const decimal = l.fuente.decimal ?? '.'
  const valorDe = (r: Registro) => (iValor < 0 ? null : numero(r.fila[iValor] ?? null, decimal))

  const iUnico = m.unico ? col(l.lote, l.fuente, m.unico) : -1
  /** Una fila cuenta como una venta, salvo que comparta folio con otra del mismo día (reporte por producto). */
  const unidadDe = (r: Registro, vistos: Set<string>) => {
    if (iUnico < 0) return 1
    const u = texto(r.fila[iUnico] ?? null)
    if (!u) return 1
    const k = `${r.dia}\u0000${normal(u)}`
    if (vistos.has(k)) return 0
    vistos.add(k)
    return 1
  }

  if (a.forma === 'por') {
    const iPor = col(l.lote, l.fuente, m.por!)
    const vistos = new Set<string>()
    const desde = sumarDias(hasta, -(a.ventana - 1))
    const por = new Map<string, { etiqueta: string; valor: number }>()
    let sinDato = 0
    for (const r of l.registros) {
      if (r.dia < desde || r.dia > hasta || !ok(r)) continue
      const v = iValor < 0 ? unidadDe(r, vistos) : valorDe(r)
      if (v === null || (iValor < 0 && v === 0)) continue
      const g = texto(r.fila[iPor] ?? null)
      if (!g) { sinDato += v; continue }
      const k = normal(g)
      const e = por.get(k) ?? { etiqueta: g, valor: 0 }
      e.valor += v
      por.set(k, e)
    }
    const orden = [...por.entries()].map(([k, e]) => ({ id: k, etiqueta: e.etiqueta, valor: redondo(e.valor) })).sort((x, y) => y.valor - x.valor)
    const otros = orden.slice(8).reduce((s, b) => s + b.valor, 0)
    const resto = otros || sinDato ? { id: 'otros', etiqueta: otros && sinDato ? 'Otros o sin dato' : otros ? 'Otros' : 'Sin dato en la fuente', valor: redondo(otros + sinDato) } : undefined
    return { datos: { forma: 'barras', barras: orden.slice(0, 8), ...(resto ? { resto } : {}) }, hasta, aviso }
  }

  // Series diarias: la ventana más los 28 días de historia del corredor; el mes, desde el primero del mes anterior.
  const desde = a.forma === 'mes' ? `${sumarDias(`${hasta.slice(0, 7)}-01`, -1).slice(0, 7)}-01` : sumarDias(hasta, -(a.ventana + HISTORIA - 1))
  const filas = new Map<string, number>(), ventas = new Map<string, number>(), suma = new Map<string, number>(), medidas = new Map<string, number>()
  const vistos = new Set<string>()
  for (const r of l.registros) {
    if (r.dia < desde || r.dia > hasta || !ok(r)) continue
    filas.set(r.dia, (filas.get(r.dia) ?? 0) + 1)
    ventas.set(r.dia, (ventas.get(r.dia) ?? 0) + unidadDe(r, vistos))
    const v = valorDe(r)
    if (v !== null) { suma.set(r.dia, (suma.get(r.dia) ?? 0) + v); medidas.set(r.dia, (medidas.get(r.dia) ?? 0) + 1) }
  }
  const cubre = (d: string) => !!l.primerDia && d >= l.primerDia && d <= (l.hasta ?? hasta)
  const puntos: Punto[] = []
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    if (!cubre(d)) { puntos.push({ fecha: d, valor: null }); continue }
    const n = filas.get(d) ?? 0
    let valor: number | null
    if (a.forma === 'conteo') valor = ventas.get(d) ?? 0
    // El ticket: lo que entró entre las ventas del día (con folio, una por folio; sin folio, una por fila con importe).
    else if (a.forma === 'promedio') valor = medidas.get(d) ? redondo((suma.get(d) ?? 0) / (iUnico < 0 ? medidas.get(d)! : ventas.get(d)!)) : null
    // Suma y mes: un día con filas pero sin ningún importe legible no es 0, es sin medir.
    else valor = n && !medidas.get(d) ? null : redondo(suma.get(d) ?? 0)
    puntos.push({ fecha: d, valor })
  }
  return { datos: { forma: 'serie', puntos }, hasta, aviso }
}

const redondo = (n: number) => Math.round(n * 100) / 100
const vacio = (f: Forma): Datos => (f === 'pasos' ? { forma: 'embudo', pasos: [] } : f === 'por' ? { forma: 'barras', barras: [] } : { forma: 'serie', puntos: [] })

/** Las columnas que una consulta le pide a cada fuente (para que una base traiga solo esas). */
export function columnasPedidas(m: Mapeo, fuentes: Fuente[]): Record<string, string[]> {
  const out: Record<string, Set<string>> = {}
  const pide = (fid: string | undefined, c: string | undefined) => { if (fid && c) (out[fid] ??= new Set()).add(c) }
  for (const f of fuentes) pide(f.id, f.fecha)
  pide(m.fuente, m.valor); pide(m.fuente, m.por); pide(m.fuente, m.unico); pide(m.fuente, m.donde?.columna)
  for (const p of m.pasos ?? []) pide(p.fuente, p.donde?.columna)
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]))
}

/** El rango que una consulta necesita leer (con un día de margen a cada lado para las zonas horarias). */
export function rangoPedido(forma: Forma, ventana: Ventana, ayer: string): { desde: string; hastaExclusivo: string } {
  const desde = forma === 'mes' ? `${sumarDias(`${ayer.slice(0, 7)}-01`, -1).slice(0, 7)}-01` : forma === 'pasos' || forma === 'por' ? sumarDias(ayer, -(ventana - 1)) : sumarDias(ayer, -(ventana + HISTORIA - 1))
  return { desde: sumarDias(desde, -1), hastaExclusivo: sumarDias(ayer, 2) }
}
