/**
 * Modelo de la tabla del visor (14 nov 2026): lo mismo para un CSV que para una hoja de Excel.
 *
 * Columnar (cada columna guarda sus valores y sus textos) para que ordenar y filtrar 100 mil filas sea mover un
 * arreglo de índices, no copiar filas. Aquí vive el criterio: qué fila es el encabezado, qué tipo tiene cada columna
 * (número, moneda, porcentaje, fecha, texto), cómo se alinea y se formatea, cómo se ordena (los vacíos siempre al final),
 * cómo se filtra (sin acentos ni mayúsculas) y el resumen de la columna elegida (cuenta, suma, promedio, mín., máx.).
 * Puro: lo prueba tests/visor/tabla-modelo.test.ts.
 */
import type { HojaXlsx, ValorCelda } from './xlsx'
import { letraColumna } from './celdas'

export type TipoColumna = 'numero' | 'fecha' | 'texto' | 'booleano' | 'vacia'
export interface Columna {
  nombre: string
  /** Letra de Excel (A, B, … AA). */
  letra: string
  tipo: TipoColumna
  /** Valor para ordenar, filtrar y sumar: número (fechas en ms o serial), texto o booleano. */
  valores: ValorCelda[]
  /** Lo que se ve. */
  textos: string[]
  /** Se pinta en rojo (negativo de CSV o [Red] de Excel). */
  rojos: Uint8Array
  /** Fórmulas de Excel por fila (solo si la hoja las trae). */
  formulas?: (string | undefined)[]
  moneda?: string
  porcentaje?: boolean
  /** Fecha guardada como serial de Excel (días); si no, en milisegundos (CSV). */
  fechaSerial?: boolean
  /** Ancho sugerido en píxeles. */
  ancho: number
  /** Textos sin acentos ni mayúsculas, para buscar (se arman la primera vez que se busca). */
  normal?: string[]
}
export interface Tabla {
  columnas: Columna[]
  filas: number
  /** Número de fila original (1, 2, 3… como en el archivo). */
  numeroFila: number[]
  /** ¿La primera fila era encabezado? (si no, las columnas se llaman A, B, C). */
  encabezado: boolean
  /** Filas de título que había antes del encabezado («Gastos de marzo 2025»). */
  preambulo: string[]
  /** Celdas combinadas a lo ancho dentro de una fila (índices de la tabla). */
  combinadas: Map<number, { c0: number; c1: number }[]>
  /** Columnas inmovilizadas a la izquierda (del libro). */
  fijas: number
  recortada?: boolean
}

export const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// ── Interpretar texto de un CSV ──

export interface Numero { n: number; decimales: number; prefijo: string; sufijo: string; porcentaje: boolean; ceroInicial: boolean }
const MONEDA = /^(US\$|MX\$|R\$|\$|€|£|¥|MXN|USD|EUR|COP|ARS|CLP|PEN)/i
const MONEDA_FIN = /(US\$|MX\$|\$|€|£|MXN|USD|EUR|COP|ARS|CLP|PEN)$/i

/** «$1,234.50», «(1,234)», «-12.5%», «1.234,56 €» → número. `decimal` es el separador decimal de la columna. */
export function interpretarNumero(crudo: string, decimal: '.' | ',' = '.'): Numero | null {
  let s = crudo.trim()
  if (!s || s.length > 40) return null
  let negativo = false
  if (s.startsWith('(') && s.endsWith(')')) { negativo = true; s = s.slice(1, -1).trim() }
  if (s.startsWith('-') || s.startsWith('−')) { negativo = !negativo; s = s.slice(1).trim() } else if (s.startsWith('+')) s = s.slice(1).trim()
  let prefijo = '', sufijo = '', porcentaje = false
  const mp = MONEDA.exec(s); if (mp) { prefijo = mp[0]; s = s.slice(mp[0].length).trim() }
  if (s.startsWith('-') || s.startsWith('−')) { negativo = !negativo; s = s.slice(1).trim() }
  if (s.endsWith('%')) { porcentaje = true; s = s.slice(0, -1).trim() }
  const ms = MONEDA_FIN.exec(s); if (ms && !prefijo) { sufijo = ms[0]; s = s.slice(0, -ms[0].length).trim() }
  if (s.endsWith('-')) { negativo = !negativo; s = s.slice(0, -1).trim() }
  const re = decimal === '.' ? /^(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/ : /^(\d{1,3}(?:\.\d{3})+|\d+)?(?:,(\d+))?$/
  const m = re.exec(s)
  if (!m || (!m[1] && !m[2])) return null
  const entero = (m[1] ?? '0').replace(decimal === '.' ? /,/g : /\./g, '')
  const n = Number(`${entero}.${m[2] ?? '0'}${m[3] ? `e${m[3]}` : ''}`)
  if (!Number.isFinite(n)) return null
  return { n: negativo ? -n : n, decimales: m[2]?.length ?? 0, prefijo, sufijo, porcentaje, ceroInicial: /^0\d/.test(entero) && !m[2] }
}

export interface Fecha { ms: number; hora: boolean }
/** ISO (2026-11-14, 2026-11-14T09:30:00Z), día/mes/año o mes/día/año (el orden lo decide la columna). */
export function interpretarFecha(crudo: string, orden: 'dma' | 'mda' = 'dma'): Fecha | null {
  const s = crudo.trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/.exec(s)
  if (m) {
    const [, y, mo, d, h, mi, se, zona] = m
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null
    if (zona) { const t = Date.parse(s.replace(' ', 'T')); return Number.isFinite(t) ? { ms: t, hora: true } : null }
    return { ms: Date.UTC(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(se ?? 0)), hora: h != null }
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?)?$/i.exec(s)
  if (m) {
    const [, a, b, yy, h, mi, se, ap] = m
    const d = orden === 'dma' ? +a : +b, mo = orden === 'dma' ? +b : +a
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    const y = yy.length === 2 ? (+yy < 50 ? 2000 + +yy : 1900 + +yy) : +yy
    let hh = +(h ?? 0)
    if (ap) { const pm = /^p/i.test(ap); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0 }
    return { ms: Date.UTC(y, mo - 1, d, hh, +(mi ?? 0), +(se ?? 0)), hora: h != null }
  }
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s)
  if (m) { const [, y, mo, d] = m; if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null; return { ms: Date.UTC(+y, +mo - 1, +d), hora: false } }
  return null
}

const SIN_AGRUPAR = /(^|[^a-záéíóúñ])(id|folio|clave|c[oó]digo|cp|zip|tel[eé]fono|telefono|phone|cuenta|clabe|rfc|curp|a[nñ]o|year|n[uú]mero de serie|serie)([^a-záéíóúñ]|$)/i

function formatoNumero(locale: string, decimales: number, agrupar: boolean) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimales, maximumFractionDigits: decimales, useGrouping: agrupar })
}

/** Ancho a partir de los caracteres (13 px, cifras tabulares ≈ 7.4 px). */
function anchoDe(nombre: string, textos: string[], tipo: TipoColumna): number {
  let largo = 0
  const paso = Math.max(1, Math.floor(textos.length / 600))
  for (let i = 0; i < textos.length; i += paso) { const l = textos[i]?.length ?? 0; if (l > largo) largo = l }
  const cuerpo = Math.min(largo, tipo === 'texto' ? 46 : 22) * 7.4 + 26
  const cabeza = Math.min(nombre.length, 28) * 7.4 + 66
  return Math.round(Math.max(76, Math.min(420, Math.max(cuerpo, cabeza))))
}

/** Una columna de textos crudos (CSV) → tipo, valores y textos formateados. */
export function columnaDeTextos(nombre: string, indice: number, crudos: string[], locale = 'es-MX'): Columna {
  const llenos = crudos.filter(s => s.trim() !== '')
  const base = { nombre, letra: letraColumna(indice), rojos: new Uint8Array(crudos.length) }
  if (!llenos.length) return { ...base, tipo: 'vacia', valores: crudos.map(() => null), textos: crudos, ancho: anchoDe(nombre, crudos, 'vacia') }
  const umbral = Math.max(1, Math.ceil(llenos.length * 0.95))
  // ¿Números? Primero con punto decimal; si no alcanza, con coma decimal.
  for (const decimal of ['.', ','] as const) {
    const ns = llenos.map(s => interpretarNumero(s, decimal))
    const ok = ns.filter(Boolean) as Numero[]
    if (ok.length < umbral || ok.some(x => x.ceroInicial)) continue
    // «1,234» sin decimales es ambiguo: con coma decimal solo si de verdad hay decimales con coma.
    if (decimal === ',' && !ok.some(x => x.decimales > 0)) continue
    const decimales = Math.min(6, ok.reduce((m, x) => Math.max(m, x.decimales), 0))
    const enteros = ok.every(x => Number.isInteger(x.n))
    const anios = enteros && ok.every(x => x.n >= 1900 && x.n <= 2100)
    const agrupar = !anios && !SIN_AGRUPAR.test(nombre)
    const prefijo = ok.find(x => x.prefijo)?.prefijo ?? ''
    const sufijo = ok.find(x => x.sufijo)?.sufijo ?? ''
    const porcentaje = ok.length > 0 && ok.filter(x => x.porcentaje).length >= ok.length / 2
    const fmt = formatoNumero(locale, decimales, agrupar)
    const valores: ValorCelda[] = []
    const textos: string[] = []
    crudos.forEach((s, i) => {
      const x = s.trim() ? interpretarNumero(s, decimal) : null
      if (!x) { valores.push(s.trim() ? s : null); textos.push(s); return }
      valores.push(x.n)
      const cuerpo = fmt.format(Math.abs(x.n))
      textos.push(`${x.n < 0 ? '-' : ''}${prefijo}${cuerpo}${porcentaje ? '%' : ''}${sufijo ? ` ${sufijo}` : ''}`)
      if (x.n < 0) base.rojos[i] = 1
    })
    return { ...base, tipo: 'numero', valores, textos, moneda: prefijo || sufijo || undefined, porcentaje, ancho: anchoDe(nombre, textos, 'numero') }
  }
  // ¿Fechas? El orden día/mes se decide con la columna entera (un 13 en el primer número lo delata).
  const pareceFecha = llenos.slice(0, 200).every(s => /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(s.trim()))
  if (pareceFecha) {
    let orden: 'dma' | 'mda' = 'dma'
    for (const s of llenos) { const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]/.exec(s.trim()); if (m && +m[2] > 12 && +m[1] <= 12) { orden = 'mda'; break } if (m && +m[1] > 12) break }
    const fs = llenos.map(s => interpretarFecha(s, orden))
    if (fs.filter(Boolean).length >= umbral) {
      const valores = crudos.map(s => s.trim() ? interpretarFecha(s, orden)?.ms ?? s : null)
      return { ...base, tipo: 'fecha', valores, textos: crudos, ancho: anchoDe(nombre, crudos, 'fecha') }
    }
  }
  return { ...base, tipo: 'texto', valores: crudos.map(s => s === '' ? null : s), textos: crudos, ancho: anchoDe(nombre, crudos, 'texto') }
}

// ── Encabezado ──

/** ¿Esta fila parece de datos (números o fechas) más que de títulos? */
function pareceDatos(fila: string[]): boolean {
  const llenos = fila.filter(s => s.trim() !== '')
  if (!llenos.length) return false
  const datos = llenos.filter(s => interpretarNumero(s) || interpretarFecha(s)).length
  return datos / llenos.length >= 0.5
}

/** De filas de texto (CSV) a tabla. La primera fila es encabezado salvo que parezca de datos. */
export function tablaDeFilas(filas: string[][], opciones: { locale?: string } = {}): Tabla {
  const anchoTabla = filas.reduce((m, f) => Math.max(m, f.length), 0)
  const encabezado = filas.length > 1 && !pareceDatos(filas[0]) && filas[0].filter(s => s.trim()).length >= Math.min(2, anchoTabla)
  const cuerpo = encabezado ? filas.slice(1) : filas
  const usados = new Set<string>()
  const columnas: Columna[] = []
  for (let c = 0; c < anchoTabla; c++) {
    let nombre = encabezado ? (filas[0][c] ?? '').trim() : ''
    if (!nombre) nombre = letraColumna(c)
    let unico = nombre, k = 2
    while (usados.has(unico)) unico = `${nombre} (${k++})`
    usados.add(unico)
    columnas.push(columnaDeTextos(unico, c, cuerpo.map(f => f[c] ?? ''), opciones.locale))
  }
  return { columnas, filas: cuerpo.length, numeroFila: cuerpo.map((_, i) => i + (encabezado ? 2 : 1)), encabezado, preambulo: [], combinadas: new Map(), fijas: 0 }
}

/** Una hoja de Excel → tabla. El encabezado es la primera fila de títulos seguida de datos (en las 12 primeras). */
export function tablaDeHoja(hoja: HojaXlsx): Tabla {
  const { filas } = hoja
  const nCols = hoja.columnas
  // Fila de encabezado: textos (al menos 2 o la mitad de las columnas usadas) y debajo, en alguna de sus columnas, números o fechas.
  let enc = -1
  for (let r = 0; r < Math.min(12, filas.length - 1) && enc < 0; r++) {
    const fila = filas[r] ?? []
    const llenas = fila.filter(x => x && x.t.trim() !== '')
    if (llenas.length < Math.max(2, Math.ceil(nCols * 0.4))) continue
    if (!llenas.every(x => typeof x!.v === 'string')) continue
    const debajo = filas.slice(r + 1, r + 21)
    const contraste = fila.some((x, c) => x && debajo.some(f => { const y = f?.[c]; return y && (typeof y.v === 'number' || typeof y.v === 'boolean') }))
    const unica = debajo.length > 0 && debajo.filter(f => f?.some(Boolean)).length >= 1
    if (contraste || (unica && llenas.length >= Math.max(2, nCols * 0.6))) enc = r
  }
  const preambulo = enc > 0 ? filas.slice(0, enc).map(f => (f ?? []).filter(Boolean).map(x => x!.t.trim()).filter(Boolean).join(' · ')).filter(Boolean) : []
  const desde = enc >= 0 ? enc + 1 : 0
  // Sin filas vacías al final.
  let hasta = filas.length
  while (hasta > desde && !(filas[hasta - 1] ?? []).some(x => x && x.t !== '')) hasta--
  const cuerpo = filas.slice(desde, hasta)
  const usados = new Set<string>()
  const columnas: Columna[] = []
  for (let c = 0; c < nCols; c++) {
    let nombre = enc >= 0 ? (filas[enc]?.[c]?.t ?? '').trim() : ''
    if (!nombre) nombre = letraColumna(c)
    let unico = nombre, k = 2
    while (usados.has(unico)) unico = `${nombre} (${k++})`
    usados.add(unico)
    const celdas = cuerpo.map(f => f?.[c])
    const valores = celdas.map(x => x?.v ?? null)
    const textos = celdas.map(x => x?.t ?? '')
    const rojos = new Uint8Array(celdas.length)
    celdas.forEach((x, i) => { if (x?.rojo) rojos[i] = 1 })
    const formulas = celdas.some(x => x?.f) ? celdas.map(x => x?.f) : undefined
    const llenas = celdas.filter(x => x && x.t !== '')
    const nums = llenas.filter(x => typeof x!.v === 'number')
    const tipo: TipoColumna = !llenas.length ? 'vacia'
      : nums.length >= llenas.length * 0.9 ? (nums.filter(x => x!.fecha).length >= nums.length * 0.9 ? 'fecha' : 'numero')
      : llenas.every(x => typeof x!.v === 'boolean') ? 'booleano' : 'texto'
    const libro = hoja.anchos[c]
    const sugerido = anchoDe(unico, textos, tipo)
    const ancho = libro === 0 ? 0 : libro ? Math.round(Math.max(Math.min(libro, 460), Math.min(sugerido, 160), 56)) : sugerido
    columnas.push({ nombre: unico, letra: letraColumna(c), tipo, valores, textos, rojos, ...(formulas ? { formulas } : {}), ...(tipo === 'fecha' ? { fechaSerial: true } : {}), ancho })
  }
  // Combinadas a lo ancho (dentro de una fila de datos): el texto cruza las columnas.
  const combinadas = new Map<number, { c0: number; c1: number }[]>()
  for (const m of hoja.combinadas) {
    if (m.c1 <= m.c0) continue
    for (let r = Math.max(m.r0, desde); r <= Math.min(m.r1, hasta - 1); r++) {
      if (r !== m.r0) continue
      const i = r - desde
      const l = combinadas.get(i) ?? []
      l.push({ c0: m.c0, c1: m.c1 }); combinadas.set(i, l)
    }
  }
  return { columnas, filas: cuerpo.length, numeroFila: cuerpo.map((_, i) => desde + i + 1), encabezado: enc >= 0, preambulo, combinadas, fijas: Math.min(hoja.fijas.columnas, 3), recortada: hoja.recortada }
}

// ── Ordenar, filtrar, resumir ──

const collator = typeof Intl !== 'undefined' ? new Intl.Collator('es', { numeric: true, sensitivity: 'base' }) : null

/** Índices ordenados por una columna (estable). Los vacíos van al final en ambos sentidos. */
export function ordenar(t: Tabla, indices: number[], col: number, dir: 1 | -1): number[] {
  const c = t.columnas[col]
  if (!c) return indices
  const numerica = c.tipo === 'numero' || c.tipo === 'fecha'
  const posicion = new Map<number, number>()
  indices.forEach((x, i) => posicion.set(x, i))
  return [...indices].sort((a, b) => {
    const va = c.valores[a], vb = c.valores[b]
    const ea = va == null || va === '', eb = vb == null || vb === ''
    if (ea || eb) return ea === eb ? posicion.get(a)! - posicion.get(b)! : ea ? 1 : -1
    let r: number
    if (numerica && typeof va === 'number' && typeof vb === 'number') r = va - vb
    else if (typeof va === 'number' && typeof vb !== 'number') r = -1
    else if (typeof vb === 'number' && typeof va !== 'number') r = 1
    else if (typeof va === 'boolean' && typeof vb === 'boolean') r = Number(va) - Number(vb)
    else r = collator ? collator.compare(c.textos[a], c.textos[b]) : c.textos[a] < c.textos[b] ? -1 : c.textos[a] > c.textos[b] ? 1 : 0
    return r === 0 ? posicion.get(a)! - posicion.get(b)! : r * dir
  })
}

export interface FiltroColumna {
  /** Solo estos textos (lista de valores marcados). */
  valores?: Set<string>
  /** Contiene este texto. */
  contiene?: string
  /** Rango (números y fechas en la unidad de `valores`). */
  min?: number
  max?: number
}
export const filtroActivo = (f: FiltroColumna | undefined) => !!f && (!!f.valores || !!f.contiene?.trim() || f.min != null || f.max != null)

function normales(c: Columna): string[] { return (c.normal ??= c.textos.map(normalizar)) }

/** Filas que pasan la búsqueda global (en cualquier columna) y todos los filtros por columna. */
export function filtrar(t: Tabla, filtros: Map<number, FiltroColumna>, consulta: string): number[] {
  const q = normalizar(consulta.trim())
  const activos = [...filtros].filter(([, f]) => filtroActivo(f))
  const out: number[] = []
  const cols = q ? t.columnas.map(normales) : []
  for (let i = 0; i < t.filas; i++) {
    let ok = true
    for (const [k, f] of activos) {
      const c = t.columnas[k]
      if (!c) continue
      if (f.valores && !f.valores.has(c.textos[i])) { ok = false; break }
      if (f.contiene?.trim() && !normales(c)[i].includes(normalizar(f.contiene.trim()))) { ok = false; break }
      if (f.min != null || f.max != null) {
        const v = c.valores[i]
        if (typeof v !== 'number' || (f.min != null && v < f.min) || (f.max != null && v > f.max)) { ok = false; break }
      }
    }
    if (ok && q) ok = cols.some(n => n[i].includes(q))
    if (ok) out.push(i)
  }
  return out
}

export interface Resumen { filas: number; llenas: number; distintos: number; suma?: number; promedio?: number; min?: number; max?: number }
/** Cuenta, distintos y, si es numérica, suma, promedio, mínimo y máximo de las filas visibles. */
export function resumir(c: Columna, indices: number[]): Resumen {
  let llenas = 0, suma = 0, nums = 0, min = Infinity, max = -Infinity
  const distintos = new Set<string>()
  for (const i of indices) {
    const v = c.valores[i]
    if (v == null || v === '') continue
    llenas++
    if (distintos.size < 100_000) distintos.add(c.textos[i])
    if (typeof v === 'number') { nums++; suma += v; if (v < min) min = v; if (v > max) max = v }
  }
  const r: Resumen = { filas: indices.length, llenas, distintos: distintos.size }
  if (nums && (c.tipo === 'numero' || c.tipo === 'fecha')) Object.assign(r, c.tipo === 'numero' ? { suma, promedio: suma / nums, min, max } : { min, max })
  return r
}

/** Valores más frecuentes (para la lista de casillas del filtro), del más común al menos. */
export function frecuentes(c: Columna, indices: number[], tope = 300): { texto: string; n: number }[] {
  const cuenta = new Map<string, number>()
  for (const i of indices) cuenta.set(c.textos[i], (cuenta.get(c.textos[i]) ?? 0) + 1)
  return [...cuenta].map(([texto, n]) => ({ texto, n })).sort((a, b) => b.n - a.n || (collator ? collator.compare(a.texto, b.texto) : 0)).slice(0, tope)
}

/** Histograma de una columna numérica: `cubetas` barras entre su mínimo y su máximo. */
export function histograma(c: Columna, indices: number[], cubetas = 28): { min: number; max: number; cuentas: number[] } | null {
  let min = Infinity, max = -Infinity
  for (const i of indices) { const v = c.valores[i]; if (typeof v === 'number') { if (v < min) min = v; if (v > max) max = v } }
  if (!Number.isFinite(min)) return null
  const cuentas = new Array<number>(cubetas).fill(0)
  const ancho = (max - min) || 1
  for (const i of indices) { const v = c.valores[i]; if (typeof v === 'number') cuentas[Math.min(cubetas - 1, Math.floor((v - min) / ancho * cubetas))]++ }
  return { min, max, cuentas }
}

/** Formato corto para el resumen («1.2 M», «45.3 k» o con todas sus cifras si cabe). */
export function cifra(n: number, locale = 'es-MX', decimales = 2): string {
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toLocaleString(locale, { maximumFractionDigits: 2 })} mil M`
  if (a >= 1e7) return `${(n / 1e6).toLocaleString(locale, { maximumFractionDigits: 2 })} M`
  const d = Math.max(0, Math.min(decimales, 4))
  return n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: a >= 1000 ? d : Math.max(d, 2) })
}
