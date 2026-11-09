/**
 * Business Intelligence · fuente Excel: un lector mínimo de .xlsx sin dependencias (solo `node:zlib`).
 *
 * Viaja a la edición del alumno: su hoja de ventas se lee sin instalar nada. Devuelve la hoja como matriz rectangular de
 * valores crudos (texto, número, booleano o null), desde A1 hasta la última celda con dato. No interpreta estilos: una fecha
 * llega como número de serie y el llamador, que sabe qué columna es fecha, la pasa por `serialAFecha`.
 *
 * Lo que no lee lo dice en palabras: .xls viejo, Excel con contraseña, ZIP64 o compresión rara (pide guardarlo como .xlsx
 * normal o CSV). Topes defensivos: 200 000 filas y 200 MB de XML por parte.
 */
import { inflateRawSync } from 'node:zlib'

export type CeldaXlsx = string | number | boolean | null
export interface LibroXlsx { hojas: string[]; fecha1904: boolean; hoja: string; filas: CeldaXlsx[][] }

const MAX_FILAS = 200_000
const MAX_XML = 200 * 1024 * 1024
const MAX_CELDAS = 20_000_000
const NO_ES = 'No es un archivo de Excel (.xlsx).'
const FORMATO_RARO = 'El Excel usa un formato que no sé leer; guárdalo como .xlsx normal o como CSV.'

// ── El ZIP ──

interface Entrada { metodo: number; local: number; comprimido: number; tamano: number }

function directorio(b: Buffer): Map<string, Entrada> {
  if (b.length >= 8 && b.readUInt32BE(0) === 0xd0cf11e0) throw new Error(`${NO_ES} Parece un Excel viejo (.xls) o protegido con contraseña: guárdalo como .xlsx normal o como CSV.`)
  if (b.length < 22 || b.readUInt32LE(0) !== 0x04034b50) throw new Error(NO_ES)
  // El fin del directorio central (EOCD) está al final, detrás de un comentario de hasta 64 KB.
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error(NO_ES)
  const n = b.readUInt16LE(eocd + 10), inicio = b.readUInt32LE(eocd + 16)
  if (n === 0xffff || inicio === 0xffffffff || (eocd >= 20 && b.readUInt32LE(eocd - 20) === 0x07064b50)) throw new Error(FORMATO_RARO)
  const out = new Map<string, Entrada>()
  let p = inicio
  for (let k = 0; k < n; k++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new Error(`${NO_ES} El archivo está incompleto o dañado.`)
    const banderas = b.readUInt16LE(p + 8)
    const e: Entrada = { metodo: b.readUInt16LE(p + 10), comprimido: b.readUInt32LE(p + 20), tamano: b.readUInt32LE(p + 24), local: b.readUInt32LE(p + 42) }
    const ln = b.readUInt16LE(p + 28), le = b.readUInt16LE(p + 30), lc = b.readUInt16LE(p + 32)
    if (e.comprimido === 0xffffffff || e.tamano === 0xffffffff || e.local === 0xffffffff) throw new Error(FORMATO_RARO)
    if (banderas & 1) throw new Error('El Excel está protegido con contraseña: quítasela o guárdalo como CSV.')
    out.set(b.toString('utf8', p + 46, p + 46 + ln).replace(/\\/g, '/'), e)
    p += 46 + ln + le + lc
  }
  return out
}

/** El contenido de una parte del ZIP, en texto. El encabezado local trae sus propias longitudes de nombre y extra. */
function parte(b: Buffer, e: Entrada, nombre: string): string {
  if (e.local + 30 > b.length || b.readUInt32LE(e.local) !== 0x04034b50) throw new Error(`${NO_ES} El archivo está incompleto o dañado.`)
  if (e.tamano > MAX_XML) throw new Error(`El Excel es demasiado grande para leerlo aquí (${nombre} pasa de 200 MB); guárdalo como CSV.`)
  const desde = e.local + 30 + b.readUInt16LE(e.local + 26) + b.readUInt16LE(e.local + 28)
  const datos = b.subarray(desde, desde + e.comprimido)
  let crudo: Buffer
  if (e.metodo === 0) crudo = datos
  else if (e.metodo === 8) {
    try { crudo = inflateRawSync(datos, { maxOutputLength: MAX_XML + 1 }) } catch (err) {
      if (err instanceof RangeError || (err as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw new Error(`El Excel es demasiado grande para leerlo aquí (${nombre} pasa de 200 MB); guárdalo como CSV.`)
      throw new Error(`${NO_ES} El archivo está dañado (${nombre} no se pudo descomprimir).`)
    }
    if (crudo.length > MAX_XML) throw new Error(`El Excel es demasiado grande para leerlo aquí (${nombre} pasa de 200 MB); guárdalo como CSV.`)
  } else throw new Error(FORMATO_RARO)
  return crudo.toString('utf8')
}

// ── XML a mano (solo lo que usa un .xlsx) ──

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Entidades XML y luego el escape propio de Excel `_xHHHH_` (con `_x005F_` = guion bajo literal). Nada más: el texto va tal cual. */
function decodificar(s: string): string {
  if (s.includes('&')) s = s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] !== '#') return ENTIDADES[ent] ?? m
    const cp = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
    return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m
  })
  if (s.includes('_x')) s = s.replace(/_x([0-9a-fA-F]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
  return s
}

/** Atributos de una etiqueta, por nombre local (sin prefijo): `r:id` y `id` quedan como `id`. */
function atributos(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const local = m[1].includes(':') ? m[1].slice(m[1].lastIndexOf(':') + 1) : m[1]
    if (m[1].startsWith('xmlns')) continue
    // El nombre sin prefijo gana a uno con prefijo (sheetId no es id; r:id sí lo es si no hay id).
    if (!(local in out) || !m[1].includes(':')) out[local] = decodificar(m[3] ?? m[2] ?? '')
  }
  return out
}

/** Elementos `<x ...>` o `<x .../>` con o sin prefijo de espacio de nombres: [atributos, contenido o null]. */
const PATRONES = new Map<string, RegExp>()
function elementos(xml: string, tag: string): [string, string | null][] {
  let re = PATRONES.get(tag)
  if (!re) PATRONES.set(tag, re = new RegExp(`<(?:[\\w.-]+:)?${tag}(?=[\\s/>])([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>)`, 'g'))
  return Array.from(xml.matchAll(re), m => [m[1], m[2] ?? null])
}

/** El texto de un `<si>` o `<is>`: su `<t>` o la concatenación de sus runs. La fonética (`<rPh>`) no es texto. */
function textoRico(xml: string): string {
  const limpio = xml.includes('rPh') ? xml.replace(/<(?:[\w.-]+:)?rPh\b[\s\S]*?<\/(?:[\w.-]+:)?rPh>/g, '') : xml
  let out = ''
  for (const [, t] of elementos(limpio, 't')) out += t ? decodificar(t) : ''
  return out
}

// ── Rutas dentro del paquete ──

function resolver(base: string, destino: string): string {
  const partes = (destino.startsWith('/') ? destino.slice(1) : `${base}${destino}`).split('/')
  const out: string[] = []
  for (const p of partes) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p) }
  return out.join('/')
}

function relaciones(xml: string | null, base: string): { id: string; tipo: string; destino: string }[] {
  if (!xml) return []
  return elementos(xml, 'Relationship').map(([a]) => { const at = atributos(a); return { id: at.Id ?? '', tipo: at.Type ?? '', destino: at.TargetMode === 'External' ? '' : resolver(base, at.Target ?? '') } })
}

// ── Celdas ──

/** La columna de una referencia, base 0: «A7» → 0, «BC12» → 54. */
function columna(ref: string): number | null {
  const m = /^\$?([A-Za-z]{1,3})/.exec(ref)
  if (!m) return null
  let c = 0
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64)
  return c - 1
}

function valor(tipo: string | undefined, cont: string | null, compartidas: string[]): CeldaXlsx {
  if (cont === null) return null
  if (tipo === 'inlineStr') { const is = elementos(cont, 'is')[0]; return is ? textoRico(is[1] ?? '') : null }
  const v = elementos(cont, 'v')[0]
  if (!v) return null
  const crudo = v[1] ?? ''
  switch (tipo) {
    case 's': { const i = Number(crudo); return Number.isInteger(i) && i >= 0 && i < compartidas.length ? compartidas[i] : null }
    case 'str': case 'd': return decodificar(crudo)
    case 'b': return crudo.trim() === '1' || crudo.trim().toLowerCase() === 'true'
    case 'e': return null
    default: { const t = crudo.trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null }
  }
}

function leerHoja(xml: string, compartidas: string[], nombre: string): CeldaXlsx[][] {
  const datos = elementos(xml, 'sheetData')[0]?.[1]
  if (!datos) return []
  const muchas = () => new Error(`La hoja «${nombre}» pasa de 200 000 filas; es demasiado para leerla aquí: recórtala o guárdala como CSV.`)
  const filas = new Map<number, CeldaXlsx[]>()
  let ultimaFila = -1, ultimaCol = -1, f = -1
  for (const [aFila, contFila] of elementos(datos, 'row')) {
    const rf = /(?:^|\s)r\s*=\s*["'](\d+)["']/.exec(aFila)
    f = rf ? Number(rf[1]) - 1 : f + 1
    if (!contFila) continue
    let c = -1
    for (const [aCelda, contCelda] of elementos(contFila, 'c')) {
      const rc = /(?:^|\s)r\s*=\s*["']([^"']+)["']/.exec(aCelda)
      const col = rc ? columna(rc[1]) : null
      c = col ?? c + 1
      const v = valor(/(?:^|\s)t\s*=\s*["'](\w+)["']/.exec(aCelda)?.[1], contCelda, compartidas)
      if (v === null) continue
      // El tope cuenta filas con dato: Excel a veces escribe filas vacías con formato hasta muy abajo.
      if (f >= MAX_FILAS) throw muchas()
      let fila = filas.get(f)
      if (!fila) filas.set(f, fila = [])
      fila[c] = v
      if (f > ultimaFila) ultimaFila = f
      if (c > ultimaCol) ultimaCol = c
    }
  }
  if (ultimaFila < 0) return []
  if ((ultimaFila + 1) * (ultimaCol + 1) > MAX_CELDAS) throw new Error(`La hoja «${nombre}» es demasiado ancha para leerla aquí (${ultimaFila + 1} filas × ${ultimaCol + 1} columnas); recórtala o guárdala como CSV.`)
  const out: CeldaXlsx[][] = []
  for (let i = 0; i <= ultimaFila; i++) {
    const fila = filas.get(i), r: CeldaXlsx[] = new Array(ultimaCol + 1)
    for (let k = 0; k <= ultimaCol; k++) r[k] = fila?.[k] ?? null
    out.push(r)
  }
  return out
}

// ── El libro ──

/**
 * Lee un .xlsx y devuelve la hoja pedida (por nombre, sin distinguir mayúsculas ni espacios de los extremos) o la primera.
 * Matriz rectangular desde A1: huecos y celdas vacías en null.
 */
export function leerXlsx(buf: Uint8Array, hoja?: string): LibroXlsx {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  const zip = directorio(b)
  const minusculas = new Map(Array.from(zip.keys(), k => [k.toLowerCase(), k]))
  const leer = (ruta: string): string | null => {
    const nombre = zip.has(ruta) ? ruta : minusculas.get(ruta.toLowerCase())
    return nombre ? parte(b, zip.get(nombre)!, nombre) : null
  }

  // El libro: casi siempre xl/workbook.xml; si no, lo dice el paquete (_rels/.rels).
  let rutaLibro = 'xl/workbook.xml'
  let libro = leer(rutaLibro)
  if (libro === null) {
    const oficial = relaciones(leer('_rels/.rels'), '').find(r => /\/officeDocument$/.test(r.tipo))
    if (oficial) { rutaLibro = oficial.destino; libro = leer(rutaLibro) }
  }
  if (libro === null) throw new Error(NO_ES)
  const base = rutaLibro.includes('/') ? rutaLibro.slice(0, rutaLibro.lastIndexOf('/') + 1) : ''
  const rels = relaciones(leer(`${base}_rels/${rutaLibro.slice(base.length)}.rels`), base)

  const pr = elementos(libro, 'workbookPr')[0]
  const d1904 = pr ? atributos(pr[0]).date1904 : undefined
  const fecha1904 = d1904 === '1' || d1904 === 'true'

  const sheets = elementos(elementos(libro, 'sheets')[0]?.[1] ?? '', 'sheet').map(([a]) => { const at = atributos(a); return { nombre: at.name ?? '', id: at.id ?? '' } })
  const hojas = sheets.map(s => s.nombre)
  if (!sheets.length) throw new Error('El Excel no trae hojas.')
  const lista = hojas.map(h => `«${h}»`).join(', ')
  const elegida = hoja === undefined || !hoja.trim() ? sheets[0] : sheets.find(s => s.nombre.trim().toLowerCase() === hoja.trim().toLowerCase())
  if (!elegida) throw new Error(`No existe la hoja «${hoja}». Hojas en este Excel: ${lista}.`)

  const destino = rels.find(r => r.id === elegida.id)?.destino
  const xmlHoja = destino ? leer(destino) : null
  if (xmlHoja === null) throw new Error(`El Excel no trae el contenido de la hoja «${elegida.nombre}»; vuelve a guardarlo desde Excel.`)

  const rutaCompartidas = rels.find(r => /\/sharedStrings$/.test(r.tipo))?.destino ?? `${base}sharedStrings.xml`
  const xmlCompartidas = leer(rutaCompartidas)
  const compartidas = xmlCompartidas ? elementos(xmlCompartidas, 'si').map(([, cont]) => textoRico(cont ?? '')) : []

  return { hojas, fecha1904, hoja: elegida.nombre, filas: leerHoja(xmlHoja, compartidas, elegida.nombre) }
}

// ── Fechas ──

const dos = (n: number) => String(n).padStart(2, '0')

/**
 * Número de serie de Excel → 'AAAA-MM-DD' (o 'AAAA-MM-DDTHH:MM:SS' si trae hora), redondeado al segundo.
 * Sistema 1900: Excel cree que 1900 fue bisiesto, así que el serial 60 es el 29 feb 1900 que no existió y desde el 61 se
 * cuenta desde el 30 dic 1899. Sistema 1904 (Mac viejo): el 0 es el 1 ene 1904.
 */
export function serialAFecha(serial: number, fecha1904 = false): string {
  if (!Number.isFinite(serial) || serial < 0) throw new RangeError(`«${serial}» no es una fecha de Excel.`)
  let dias = Math.floor(serial)
  let seg = Math.round((serial - dias) * 86400)
  if (seg >= 86400) { dias += 1; seg -= 86400 }
  let fecha: string
  if (!fecha1904 && dias === 60) fecha = '1900-02-29'
  else {
    const base = fecha1904 ? Date.UTC(1904, 0, 1) : dias < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30)
    const d = new Date(base + dias * 86_400_000)
    fecha = `${String(d.getUTCFullYear()).padStart(4, '0')}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`
  }
  return seg ? `${fecha}T${dos(Math.floor(seg / 3600))}:${dos(Math.floor(seg / 60) % 60)}:${dos(seg % 60)}` : fecha
}
