/**
 * Lector de .xlsx del visor de documentos (14 nov 2026). Un .xlsx es un zip de XML (Office Open XML, ECMA-376):
 * se descomprime con fflate (MIT, 8 kB, sin dependencias) solo lo que hace falta y se lee con expresiones acotadas,
 * sin DOMParser (así corre igual en el navegador y en las pruebas de node, y una hoja de 100 mil filas no arma un
 * árbol DOM). Se lee el VALOR guardado de cada celda (las fórmulas no se recalculan: Excel guarda su último resultado),
 * su formato de número (formato.ts) y, de la hoja: anchos de columna, celdas combinadas y paneles inmovilizados.
 *
 * Por qué no SheetJS: el paquete de npm se quedó en 0.18.5 con avisos de seguridad (las versiones nuevas solo se bajan
 * de su CDN) y pesa ~400 kB; este lector cubre lo que un visor necesita en una fracción. .xls (binario de 1997) no.
 * Puro: lo prueba tests/visor/tabla-xlsx.test.ts.
 */
import { strFromU8, unzipSync } from 'fflate'
import { codigoDeFormato, esFormatoFecha, formatearNumero, type Idioma } from './formato'
import { referencia } from './celdas'
export { letraColumna, referencia } from './celdas'

export type ValorCelda = number | string | boolean | null
export interface CeldaXlsx {
  /** Valor para ordenar y filtrar: número (también fechas: el serial), texto o booleano. */
  v: ValorCelda
  /** Lo que se ve (con su formato). */
  t: string
  /** Fecha u hora (el número es un serial de Excel). */
  fecha?: boolean
  /** Número con formato en rojo ([Red]) para su signo. */
  rojo?: boolean
  /** Error de Excel (#DIV/0!, #N/A…). */
  error?: boolean
  /** La fórmula, si la tiene (sin el «=»). */
  f?: string
}
export interface HojaXlsx {
  nombre: string
  oculta: boolean
  /** filas[r][c]; huecos = celda vacía. */
  filas: (CeldaXlsx | undefined)[][]
  columnas: number
  /** Ancho de cada columna en píxeles, si el libro lo trae. */
  anchos: (number | undefined)[]
  combinadas: { r0: number; c0: number; r1: number; c1: number }[]
  /** Filas y columnas inmovilizadas arriba y a la izquierda. */
  fijas: { filas: number; columnas: number }
  recortada: boolean
}
export interface LibroXlsx { hojas: HojaXlsx[]; fecha1904: boolean }

/** Tope de celdas por libro: un visor no es una base de datos (y el teléfono tiene memoria). */
export const MAX_CELDAS = 3_000_000

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
/** Entidades XML y los escapes `_xHHHH_` de OOXML. */
export function desescapar(s: string): string {
  if (s.indexOf('&') >= 0) s = s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTIDADES[e] ?? m)
  if (s.indexOf('_x') >= 0) s = s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
  return s
}

const reAtributo = /([\w:]+)\s*=\s*"([^"]*)"/g
function atributos(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  reAtributo.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = reAtributo.exec(s))) out[m[1]] = m[2]
  return out
}

/** Texto de un <si> o <is>: todas sus corridas <t>, sin la guía fonética (<rPh>). */
function textoRico(xml: string): string {
  const limpio = xml.indexOf('<rPh') >= 0 ? xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '') : xml
  let out = ''
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(limpio))) out += m[1]
  return desescapar(out)
}

function cadenasCompartidas(xml: string | undefined): string[] {
  if (!xml) return []
  const out: string[] = []
  const re = /<si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/si>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(m[1] ? textoRico(m[1]) : '')
  return out
}

function estilos(xml: string | undefined): string[] {
  if (!xml) return []
  const propios = new Map<number, string>()
  const reFmt = /<numFmt\b([^>]*?)\/?>/g
  let m: RegExpExecArray | null
  while ((m = reFmt.exec(xml))) { const a = atributos(m[1]); if (a.numFmtId) propios.set(Number(a.numFmtId), desescapar(a.formatCode ?? 'General')) }
  const bloque = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? ''
  const out: string[] = []
  const reXf = /<xf\b([^>]*?)(?:\/>|>)/g
  while ((m = reXf.exec(bloque))) out.push(codigoDeFormato(Number(atributos(m[1]).numFmtId ?? 0), propios))
  return out
}

/** Destino de una relación, relativo a xl/. */
function resolverDestino(destino: string): string {
  if (destino.startsWith('/')) return destino.slice(1)
  const partes = ['xl', ...destino.split('/')]
  const out: string[] = []
  for (const p of partes) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p) }
  return out.join('/')
}

function anchoPx(caracteres: number) { return Math.round(caracteres * 7 + 5) }

function leerHoja(xml: string, nombre: string, oculta: boolean, comun: { cadenas: string[]; formatos: string[]; fecha1904: boolean; idioma: Idioma }, presupuesto: { celdas: number }): HojaXlsx {
  const filas: (CeldaXlsx | undefined)[][] = []
  const anchos: (number | undefined)[] = []
  let columnas = 0
  let recortada = false
  // Anchos de columna
  const cols = /<cols>([\s\S]*?)<\/cols>/.exec(xml)?.[1]
  if (cols) {
    const re = /<col\b([^>]*?)\/?>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(cols))) {
      const a = atributos(m[1])
      const min = Number(a.min), max = Math.min(Number(a.max), min + 512)
      if (!min || !a.width) continue
      const w = a.hidden === '1' || a.hidden === 'true' ? 0 : anchoPx(Number(a.width))
      for (let c = min; c <= max; c++) anchos[c - 1] = w
    }
  }
  // Paneles inmovilizados
  const panel = /<pane\b([^>]*?)\/?>/.exec(xml)
  const pa = panel ? atributos(panel[1]) : {}
  const fijas = pa.state === 'frozen' || pa.state === 'frozenSplit' ? { filas: Number(pa.ySplit ?? 0) || 0, columnas: Number(pa.xSplit ?? 0) || 0 } : { filas: 0, columnas: 0 }
  // Datos
  const ini = xml.indexOf('<sheetData'), fin = xml.lastIndexOf('</sheetData>')
  const datos = ini >= 0 && fin > ini ? xml.slice(ini, fin) : ''
  const reFila = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g
  const reCelda = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
  let filaActual = -1
  let mf: RegExpExecArray | null
  while ((mf = reFila.exec(datos))) {
    const af = atributos(mf[1])
    filaActual = af.r ? Number(af.r) - 1 : filaActual + 1
    if (!mf[2]) continue
    const fila: (CeldaXlsx | undefined)[] = []
    let col = -1
    reCelda.lastIndex = 0
    let mc: RegExpExecArray | null
    while ((mc = reCelda.exec(mf[2]))) {
      const a = atributos(mc[1])
      const ref = a.r ? referencia(a.r) : null
      col = ref ? ref.c : col + 1
      const dentro = mc[2]
      if (!dentro) continue
      const crudo = /<v>([\s\S]*?)<\/v>/.exec(dentro)?.[1]
      const formula = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(dentro)?.[1]
      const tipo = a.t ?? 'n'
      let celda: CeldaXlsx | undefined
      if (tipo === 's') { const s = comun.cadenas[Number(crudo)] ?? ''; celda = { v: s, t: s } }
      else if (tipo === 'inlineStr') { const s = textoRico(/<is>([\s\S]*?)<\/is>/.exec(dentro)?.[1] ?? ''); celda = { v: s, t: s } }
      else if (tipo === 'str') { const s = desescapar(crudo ?? ''); celda = { v: s, t: s } }
      else if (tipo === 'b') { const b = crudo === '1' || crudo === 'true'; celda = { v: b, t: comun.idioma === 'en' ? (b ? 'TRUE' : 'FALSE') : (b ? 'VERDADERO' : 'FALSO') } }
      else if (tipo === 'e') { const s = desescapar(crudo ?? '#N/A'); celda = { v: s, t: s, error: true } }
      else if (tipo === 'd') {
        const ms = Date.parse(crudo ?? '')
        celda = Number.isFinite(ms) ? { v: ms / 86400000 + 25569, t: (crudo ?? '').replace('T', ' ').replace(/(:\d\d)\.\d+/, '$1').replace(/Z$/, ''), fecha: true } : { v: crudo ?? '', t: crudo ?? '' }
      } else if (crudo != null && crudo !== '') {
        const n = Number(crudo)
        if (Number.isFinite(n)) {
          const codigo = comun.formatos[Number(a.s ?? 0)] ?? 'General'
          const f = formatearNumero(n, codigo, { fecha1904: comun.fecha1904, idioma: comun.idioma })
          celda = { v: n, t: f.texto, ...(f.rojo && n < 0 ? { rojo: true } : {}), ...(esFormatoFecha(codigo) ? { fecha: true } : {}) }
        } else celda = { v: crudo, t: desescapar(crudo) }
      }
      if (!celda) continue
      if (formula) celda.f = desescapar(formula)
      if (--presupuesto.celdas < 0) { recortada = true; break }
      fila[col] = celda
      if (col + 1 > columnas) columnas = col + 1
    }
    if (fila.length) filas[filaActual] = fila
    if (recortada) break
  }
  // Celdas combinadas
  const combinadas: HojaXlsx['combinadas'] = []
  const reComb = /<mergeCell\b[^>]*ref="([^"]+)"/g
  let mm: RegExpExecArray | null
  while ((mm = reComb.exec(xml))) {
    const [a, b] = mm[1].split(':').map(referencia)
    if (a && b) combinadas.push({ r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) })
  }
  for (let r = 0; r < filas.length; r++) if (!filas[r]) filas[r] = []
  return { nombre, oculta, filas, columnas, anchos, combinadas, fijas, recortada }
}

/** Bytes de un .xlsx → sus hojas en orden, con valores y textos ya formateados. */
export function leerXlsx(bytes: Uint8Array, opciones: { idioma?: Idioma } = {}): LibroXlsx {
  let zip: Record<string, Uint8Array>
  try {
    zip = unzipSync(bytes, { filter: f => /^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/styles\.xml|xl\/worksheets\/[^/]+\.xml|\[Content_Types\]\.xml)$/i.test(f.name) })
  } catch { throw new Error('No es un .xlsx válido (el zip no abre). Si es un .xls antiguo, ábrelo con Excel o Numbers.') }
  const leer = (nombre: string) => { const k = Object.keys(zip).find(x => x.toLowerCase() === nombre.toLowerCase()); return k ? strFromU8(zip[k]) : undefined }
  const libro = leer('xl/workbook.xml')
  if (!libro) throw new Error('No es un libro de Excel (.xlsx): le falta xl/workbook.xml.')
  const fecha1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(libro)
  const rels = new Map<string, string>()
  const xmlRels = leer('xl/_rels/workbook.xml.rels') ?? ''
  const reRel = /<Relationship\b([^>]*?)\/?>/g
  let m: RegExpExecArray | null
  while ((m = reRel.exec(xmlRels))) { const a = atributos(m[1]); if (a.Id && a.Target) rels.set(a.Id, resolverDestino(a.Target)) }
  const comun = { cadenas: cadenasCompartidas(leer('xl/sharedStrings.xml')), formatos: estilos(leer('xl/styles.xml')), fecha1904, idioma: opciones.idioma ?? 'es' as Idioma }
  const presupuesto = { celdas: MAX_CELDAS }
  const hojas: HojaXlsx[] = []
  const reHoja = /<sheet\b([^>]*?)\/?>/g
  let n = 0
  while ((m = reHoja.exec(libro))) {
    const a = atributos(m[1])
    const destino = rels.get(a['r:id'] ?? '') ?? `xl/worksheets/sheet${++n}.xml`
    const xml = leer(destino)
    if (xml == null) continue // una hoja de gráfico (chartsheet) no trae celdas
    hojas.push(leerHoja(xml, desescapar(a.name ?? `Hoja ${hojas.length + 1}`), a.state === 'hidden' || a.state === 'veryHidden', comun, presupuesto))
  }
  if (!hojas.length) throw new Error('El libro no trae hojas con celdas.')
  return { hojas, fecha1904 }
}
