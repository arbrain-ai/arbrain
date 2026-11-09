/**
 * Business Intelligence · los adaptadores de fuente (8 nov 2026): leen lo que declaró el dueño en `bi-fuentes.json` y lo
 * devuelven como columnas y filas (calculo.ts hace la cuenta). Solo lectura, siempre:
 *
 * - CSV y Excel: el archivo entero (se guarda en memoria mientras no cambie). Ruta relativa a la raíz del cerebro o absoluta,
 *   solo con extensión de hoja de datos. Las fechas de Excel (números de serie) salen como fecha.
 * - Postgres: una transacción `READ ONLY` con tiempo límite; solo las columnas que pide la consulta y solo el rango de días.
 * - Supabase: su API REST con la llave del dueño; las mismas columnas y el mismo rango, por páginas.
 * Las llaves de las bases viven en el entorno o en `.claude/bi.env` (git lo ignora); aquí solo se leen las que empiezan con
 * BI_. Ningún mensaje de error repite una llave.
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { EXTENSIONES, LLAVE, RUTA_LLAVES, type Fuente } from '../generico'
import { ErrorFuente, indiceColumna, type Celda, type Lote } from '../calculo'
import { parsearCsv } from './csv'
import { leerXlsx, serialAFecha } from './xlsx'
import { consultarPg } from './pg'

/** Más que esto en el rango de una consulta no es un tablero: es un almacén. Se pide una vista que agrupe por día. */
export const MAXIMO_FILAS = 200_000
const MAXIMO_BYTES = 60 * 1024 * 1024
const DIA = /^\d{4}-\d{2}-\d{2}$/

export interface Pedido { raiz: string; llaves: Record<string, string>; columnas: string[]; desde: string; hastaExclusivo: string }

/** Las llaves BI_ del entorno y de `.claude/bi.env` (el entorno gana: lo explícito manda). */
export async function leerLlaves(raiz: string, env: Record<string, string | undefined> = process.env): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    for (const linea of (await readFile(path.join(raiz, RUTA_LLAVES), 'utf8')).split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linea)
      if (!m || !LLAVE.test(m[1])) continue
      out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch { /* sin archivo de llaves: solo el entorno */ }
  for (const [k, v] of Object.entries(env)) if (LLAVE.test(k) && v) out[k] = v
  return out
}

/** La ruta real de un archivo de la fuente: relativa a la raíz del cerebro o absoluta; solo hojas de datos. */
export function rutaArchivo(f: Fuente, raiz: string): string {
  const r = f.ruta ?? ''
  const abs = path.isAbsolute(r) ? path.normalize(r) : path.resolve(raiz, r)
  const ext = EXTENSIONES[f.tipo === 'excel' ? 'excel' : 'csv']
  if (!ext.some(x => abs.toLowerCase().endsWith(x))) throw new ErrorFuente(`«${f.id}»: solo se leen archivos ${ext.join(', ')}.`)
  return abs
}

const cacheArchivos = new Map<string, { firma: string; lote: Lote }>()

async function leerArchivo(f: Fuente, raiz: string): Promise<Lote> {
  const ruta = rutaArchivo(f, raiz)
  let s
  try { s = await stat(ruta) } catch { throw new ErrorFuente(`No encuentro el archivo de «${f.id}» (${f.ruta}). Ponlo ahí o corrige «ruta».`) }
  if (!s.isFile()) throw new ErrorFuente(`«${f.ruta}» no es un archivo.`)
  if (s.size > MAXIMO_BYTES) throw new ErrorFuente(`«${f.ruta}» pesa más de 60 MB: exporta solo los últimos meses o conecta la base.`)
  const firma = `${f.tipo}:${f.hoja ?? ''}:${f.separador ?? ''}:${s.mtimeMs}:${s.size}:${f.fecha}`
  const ya = cacheArchivos.get(ruta)
  if (ya && ya.firma === firma) return ya.lote
  const buf = await readFile(ruta)
  let lote: Lote
  if (f.tipo === 'excel') {
    const libro = leerXlsx(buf, f.hoja)
    const [cabeza = [], ...resto] = libro.filas
    const columnas = cabeza.map((c, k) => (c === null || c === '' ? `columna ${k + 1}` : String(c).trim()))
    const iFecha = indiceColumna(columnas, f.fecha)
    // Excel guarda las fechas como número de serie: en la columna de fecha se vuelven fecha; en las demás, número.
    const filas = resto.map(fila => columnas.map((_, k) => {
      const v = fila[k] ?? null
      return k === iFecha && typeof v === 'number' ? serialAFecha(v, libro.fecha1904) : (v as Celda)
    }))
    lote = { columnas, filas, viva: false }
  } else {
    const tabla = parsearCsv(buf.toString('utf8'), f.separador)
    lote = { columnas: tabla.columnas, filas: tabla.filas, viva: false }
  }
  if (lote.filas.length > MAXIMO_FILAS * 5) throw new ErrorFuente(`«${f.ruta}» trae más de ${(MAXIMO_FILAS * 5).toLocaleString('es-MX')} filas: exporta solo los últimos meses.`)
  cacheArchivos.set(ruta, { firma, lote })
  return lote
}

const cita = (id: string) => `"${id}"`
const llaveDe = (p: Pedido, nombre: string | undefined, f: Fuente) => {
  const v = nombre ? p.llaves[nombre] : undefined
  if (!v) throw new ErrorFuente(`Falta la llave ${nombre} de «${f.id}»: ponla en ${RUTA_LLAVES} (una línea ${nombre}=…). Nunca en la memoria.`)
  return v
}

async function leerPostgres(f: Fuente, p: Pedido): Promise<Lote> {
  if (!DIA.test(p.desde) || !DIA.test(p.hastaExclusivo)) throw new ErrorFuente('Rango de días inválido.')
  const tabla = f.tabla!.split('.').map(cita).join('.')
  const fecha = cita(f.fecha)
  const sql = [
    'BEGIN READ ONLY', "SET LOCAL statement_timeout = '15s'", "SET LOCAL TimeZone = 'UTC'",
    `SELECT min(${fecha})::text, max(${fecha})::text FROM ${tabla}`,
    `SELECT ${p.columnas.map(cita).join(', ')} FROM ${tabla} WHERE ${fecha} >= '${p.desde}' AND ${fecha} < '${p.hastaExclusivo}' LIMIT ${MAXIMO_FILAS + 1}`,
    'COMMIT',
  ].join('; ')
  const [extremos, filas] = await consultarPg(llaveDe(p, f.conexion, f), `${sql};`, { timeoutMs: 25_000 })
  if (!extremos || !filas) throw new ErrorFuente(`Postgres no devolvió las filas de «${f.id}».`)
  if (filas.filas.length > MAXIMO_FILAS) throw new ErrorFuente(`«${f.tabla}» trae más de ${MAXIMO_FILAS.toLocaleString('es-MX')} filas en la ventana: crea una vista que agrupe por día y conéctala en su lugar.`)
  return { columnas: p.columnas, filas: filas.filas, viva: true, extremos: [extremos.filas[0]?.[0] ?? null, extremos.filas[0]?.[1] ?? null] }
}

async function leerSupabase(f: Fuente, p: Pedido): Promise<Lote> {
  const sb = createClient(llaveDe(p, f.url, f), llaveDe(p, f.llave, f), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(20_000) }) },
  })
  const [esquema, nombre] = f.tabla!.includes('.') ? f.tabla!.split('.') : [null, f.tabla!]
  const desde = () => (esquema ? sb.schema(esquema) : sb).from(nombre)
  const falla = (e: { message?: string } | null) => { if (e) throw new ErrorFuente(`Supabase (${f.id}): ${e.message ?? 'no respondió'}.`) }
  const extremo = async (asc: boolean) => {
    const { data, error } = await desde().select(f.fecha).not(f.fecha, 'is', null).order(f.fecha, { ascending: asc }).limit(1)
    falla(error)
    return ((data ?? [])[0] as unknown as Record<string, Celda> | undefined)?.[f.fecha] ?? null
  }
  const [primero, ultimo] = await Promise.all([extremo(true), extremo(false)])
  const filas: Celda[][] = []
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await desde().select(p.columnas.join(',')).gte(f.fecha, p.desde).lt(f.fecha, p.hastaExclusivo).order(f.fecha, { ascending: true }).range(pagina * 1000, pagina * 1000 + 999)
    falla(error)
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) filas.push(p.columnas.map(c => celda(r[c])))
    if (filas.length > MAXIMO_FILAS) throw new ErrorFuente(`«${f.tabla}» trae más de ${MAXIMO_FILAS.toLocaleString('es-MX')} filas en la ventana: crea una vista que agrupe por día y conéctala en su lugar.`)
    if (!data || data.length < 1000) break
  }
  return { columnas: p.columnas, filas, viva: true, extremos: [celda(primero), celda(ultimo)] }
}

const celda = (v: unknown): Celda => (v === null || v === undefined ? null : typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : JSON.stringify(v))

/** Lee una fuente según su tipo. Los errores llegan en palabras y sin llaves. */
export async function leerFuente(f: Fuente, p: Pedido): Promise<Lote> {
  if (f.tipo === 'csv' || f.tipo === 'excel') return leerArchivo(f, p.raiz)
  try {
    return f.tipo === 'postgres' ? await leerPostgres(f, p) : await leerSupabase(f, p)
  } catch (e) {
    if (e instanceof ErrorFuente) throw e
    const msj = e instanceof Error ? e.message : String(e)
    // Por si una librería repite la URL: nada que se parezca a una llave sale en el mensaje.
    throw new ErrorFuente(`«${f.id}» no respondió: ${Object.values(p.llaves).reduce((t, v) => (v.length > 6 ? t.split(v).join('…') : t), msj)}`)
  }
}
